// market.js — seeded market + rumor engine.
//
// How prices work (one sentence): every product has a hidden TRUE VALUE that
// drifts a little each day, events bend that value up or down on a fixed
// shape, and each store quotes true value x its own markup x a little noise.
//
//   price(store, product, day) = trueValue(product, day) x store.markup x noise
//   trueValue(product, day)    = baseline(day) x product of active event curves
//
// Events are planned for all 30 days at game start from the seed, so the same
// seed always produces the same market (daily challenges, challenge links).
// Rumors show up 1-3 days BEFORE an event starts. Some rumors are fake.
//
// Event shapes (multipliers on true value, by days since the event starts):
//   HYPE     quick spike (~+130% on day 2), then craters below where it started,
//            then recovers. Sell the peak; don't be holding on day 4.
//   OOP      out of print: roughly doubles over 3 days and STAYS up forever.
//   REPRINT  dips ~35%, shelves flood, recovers only part of the way.
//
// The TCG Convention is the swingiest venue: widest daily noise, it overreacts to
// events, and its crowd moves on rumors (even fake ones) before anything is confirmed.
//
//   CRUNCH   short supply crunch: shelves go thin, price +35-45% for a few days.

(function (root) {
  "use strict";

  // ---------------------------------------------------------------------------
  // Tuning knobs — everything a designer should touch lives here.
  // ---------------------------------------------------------------------------
  const DAYS = 30;       // main game
  const HORIZON = 120;   // market keeps running for the post-game Grail hunt

  const PRODUCTS = [
    { name: "The Base Set",          tier: "vintage", start: 600 },
    { name: "The Nostalgia Set",     tier: "vintage", start: 520 },
    { name: "Dark Flames",           tier: "mid",     start: 165 },
    { name: "Masks of Dawn",         tier: "mid",     start: 140 },
    { name: "Prizms of Change",      tier: "modern",  start: 215 },
    { name: "Inevitable Opponents",  tier: "modern",  start: 190 }
  ];

  // drift = average daily change in baseline; vol = daily wobble
  // volGrowth: how much the daily wobble grows as the market matures.
  // Vintage starts calm and gets wild: by Day 30 its wobble is 1 + volGrowth times bigger.
  // rumorWeight: how often events and rumors land on this tier.
  const TIERS = {
    vintage: { drift: 0.005,  vol: 0.015, volGrowth: 3.0, rumorWeight: 1 }, // the high end: calm early, volatile late
    mid:     { drift: 0.0,    vol: 0.03,  volGrowth: 0,   rumorWeight: 3 },
    modern:  { drift: -0.002, vol: 0.04,  volGrowth: 0,   rumorWeight: 3 }  // low end: where the rumors hit
  };
  const volOn = (tier, d) => tier.vol * (1 + tier.volGrowth * Math.min(d, DAYS) / DAYS);

  // markup: multiplier on true value (a number, or one per tier). noise: +/- daily wiggle.
  // stock: [min, max] boxes per product per day (buy side).
  // depth: sell side only — each box you sell here today knocks the price down.
  // openDays: optional — which days a location is open (day 1 = Monday).
  const weekends = d => d % 7 === 6 || d % 7 === 0;
  const LOCATIONS = {
    "Local Game Store": { side: "buy",  markup: 1.00, noise: 0.03, stock: [8, 12] },
    "Cost-Mart":        { side: "buy",  markup: 0.93, noise: 0.04, stock: [1, 4] },
    "eCommerce Store":  { side: "buy",  markup: 0.92, noise: 0.12, stock: [0, 14], shipDays: 3 },
    // Sell spots pay by tier: lower-end boxes flip for a small profit over
    // retail; vintage only pays when the market moves your way.
    "The Marketplace":  { side: "sell", markup: { vintage: 0.93, mid: 1.04, modern: 1.04 }, noise: 0.04, depth: 0.004 },
    "TCG Convention":   { side: "sell", markup: { vintage: 0.97, mid: 1.00, modern: 1.00 }, noise: 0.10, depth: 0.02, openDays: weekends, crowd: true }
  };

  // The Convention crowd trades on news: it overreacts to confirmed events
  // (eventAmp stretches each event's curve) and moves on RUMORS before anything
  // is confirmed (rumorReact, from the rumor day until the event starts or the
  // rumor is debunked) — fake ones included. Leakers move the crowd more than creators.
  const CROWD = {
    eventAmp:   { oop: 1.9, reprint: 1.9, crunch: 1.4, hype: 1.2 },
    rumorReact: { oop: 0.32, reprint: -0.3, crunch: 0.15, hype: 0.1 },
    sourceWeight: { leaker: 1, creator: 0.7 }
  };

  // Online listings: chance EACH listed box sells per day, based on how far
  // your ask is above true value. Sellers pay a platform fee.
  const LISTING = { fee: 0.13, atValue: 0.7, perTenPctOver: 0.22, min: 0.02 };

  // Event shapes: [daysSinceStart, multiplier] keyframes, linearly interpolated.
  // The LAST keyframe holds forever, which is how permanent moves work.
  // magnitude jitter scales each curve's distance from 1.0.
  const EVENTS = {
    hype: {
      price:  [[0, 1], [1, 1.6], [2, 2.3], [3, 1.4], [4, 0.65], [6, 0.8], [9, 1]],
      supply: [[0, 1], [1, 0.6], [2, 0.5], [4, 1.5], [7, 1]],
      magnitude: [0.8, 1.2]
    },
    oop: {
      price:  [[0, 1], [1, 1.35], [3, 2.1]],
      supply: [[0, 1], [1, 0.5], [3, 0.35]],
      magnitude: [0.8, 1.3]
    },
    reprint: {
      price:  [[0, 1], [2, 0.65], [10, 0.85]],
      supply: [[0, 1], [1, 3], [8, 1.4]],
      magnitude: [0.8, 1.2]
    },
    crunch: {
      price:  [[0, 1], [1, 1.35], [3, 1.45], [5, 1]],
      supply: [[0, 1], [1, 0.3], [3, 0.3], [5, 1]],
      magnitude: [0.8, 1.2]
    }
  };

  // How many events per run, and how rumors are sourced.
  const PLAN = {
    realEvents: 9,
    fakeRumors: 3,
    weights: { hype: 3, oop: 2, reprint: 2, crunch: 2 },
    startDays: [4, 26],       // earliest/latest an event can begin
    leadDays: [2, 4],         // rumor appears this many days before
    sameProductGap: 7,        // min days between events on one product
    // who reports real vs fake rumors. Leakers are right ~90% of the time,
    // creators ~60%. Players learn to weigh the source.
    leakerShareOfReal: 0.6,
    leakerShareOfFake: 0.15
  };

  const HEADLINES = {
    rumor: {
      hype: {
        leaker:  p => `🔎 LEAKER: A mega-streamer is opening a case of ${p} live this week.`,
        creator: p => `📣 CREATOR: ${p} is about to go CRAZY. Trust me.`
      },
      oop: {
        leaker:  p => `🔎 LEAKER: Distributor emails say ${p} is getting its final print run.`,
        creator: p => `📣 CREATOR: I'm hearing ${p} is going out of print!!`
      },
      reprint: {
        leaker:  p => `🔎 LEAKER: A shipping manifest shows a huge reprint of ${p}.`,
        creator: p => `📣 CREATOR: ${p} reprint incoming? Don't get stuck holding.`
      },
      crunch: {
        leaker:  p => `🔎 LEAKER: Distributors are short on ${p} this week.`,
        creator: p => `📣 CREATOR: ${p} is about to be impossible to find.`
      }
    },
    start: {
      hype:    p => `📰 NEWS: ${p} got opened live to 2M viewers. Buyers are going wild.`,
      oop:     p => `📰 CONFIRMED: ${p} is officially out of print.`,
      reprint: p => `📰 NEWS: Reprints of ${p} are hitting shelves everywhere.`,
      crunch:  p => `📰 NEWS: ${p} shipments are delayed. Shelves are bare.`
    },
    followUp: {
      hype:   { day: 3, text: p => `📉 Hype on ${p} is fading. Sellers are dumping.` },
      crunch: { day: 4, text: p => `📦 ${p} shipments are back on track.` }
    },
    debunk: p => `🧢 That ${p} rumor? Total cap. Nothing happened.`,
    quiet: "No news today..."
  };

  // ---------------------------------------------------------------------------
  // Seeded RNG (mulberry32) — tiny, fast, good enough for games.
  // ---------------------------------------------------------------------------
  function hashSeed(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return () => {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return (h ^= h >>> 16) >>> 0;
    };
  }
  function makeRng(seed) {
    let a = hashSeed(String(seed))();
    const next = () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
      next,
      range: (lo, hi) => lo + next() * (hi - lo),
      int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
      pick: arr => arr[Math.floor(next() * arr.length)],
      gauss: () => { // Box-Muller
        const u = Math.max(next(), 1e-9), v = next();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      },
      weighted: w => {
        const total = Object.values(w).reduce((a, b) => a + b, 0);
        let x = next() * total;
        for (const [k, v] of Object.entries(w)) { if ((x -= v) < 0) return k; }
        return Object.keys(w)[0];
      }
    };
  }

  function curveAt(keys, t, mag) {
    if (t < 0) return 1;
    let m = keys[keys.length - 1][1];
    for (let i = 0; i < keys.length - 1; i++) {
      const [t0, v0] = keys[i], [t1, v1] = keys[i + 1];
      if (t >= t0 && t <= t1) { m = v0 + ((t - t0) / (t1 - t0)) * (v1 - v0); break; }
    }
    return 1 + (m - 1) * mag;
  }

  // ---------------------------------------------------------------------------
  // Plan the whole run up front from the seed.
  // ---------------------------------------------------------------------------
  function planRun(seed) {
    const rng = makeRng(seed + "|plan");
    const names = PRODUCTS.map(p => p.name);
    const productWeights = {};
    PRODUCTS.forEach(p => (productWeights[p.name] = TIERS[p.tier].rumorWeight));
    const events = [];

    const blocks = Math.ceil(HORIZON / DAYS);
    let guard = 0;
    while (events.length < PLAN.realEvents * blocks && guard++ < 2000) {
      const block = Math.floor(events.length / PLAN.realEvents) * DAYS;
      const type = rng.weighted(PLAN.weights);
      const product = rng.weighted(productWeights);
      const start = block + rng.int(PLAN.startDays[0], PLAN.startDays[1]);
      const clash = events.some(e => e.product === product && Math.abs(e.start - start) < PLAN.sameProductGap);
      if (clash) continue;
      const lead = rng.int(PLAN.leadDays[0], PLAN.leadDays[1]);
      events.push({
        type, product, start,
        rumorDay: Math.max(2, start - lead),
        source: rng.next() < PLAN.leakerShareOfReal ? "leaker" : "creator",
        mag: rng.range(EVENTS[type].magnitude[0], EVENTS[type].magnitude[1]),
        fake: false
      });
    }
    const fakes = [];
    guard = 0;
    while (fakes.length < PLAN.fakeRumors * blocks && guard++ < 2000) {
      const block = Math.floor(fakes.length / PLAN.fakeRumors) * DAYS;
      const type = rng.weighted(PLAN.weights);
      const product = rng.weighted(productWeights);
      const rumorDay = block + rng.int(2, DAYS - 3);
      const clash = events.concat(fakes).some(e => e.product === product && Math.abs(e.rumorDay - rumorDay) < 4);
      if (clash) continue;
      fakes.push({
        type, product, rumorDay, start: null,
        source: rng.next() < PLAN.leakerShareOfFake ? "leaker" : "creator",
        fake: true
      });
    }
    return { events, fakes };
  }

  // Precompute every day's true value, quotes and stock so the market is
  // identical for everyone on the same seed, no matter what they do.
  function buildSeries(seed, plan, opts) {
    const rng = makeRng(seed + "|series");
    const series = {}; // series[product] = { base[], value[], supply[] }
    PRODUCTS.forEach(p => {
      const t = TIERS[p.tier];
      const base = [p.start];
      for (let d = 1; d <= HORIZON; d++) {
        base.push(base[d - 1] * (1 + t.drift + volOn(t, d) * rng.gauss()));
      }
      const value = [], supply = [], crowd = [];
      const mine = plan.events.filter(e => e.product === p.name);
      const rumors = plan.events.concat(plan.fakes).filter(e => e.product === p.name);
      for (let d = 0; d <= HORIZON; d++) {
        let pm = 1, sm = 1, cm = 1;
        mine.forEach(e => {
          pm *= curveAt(EVENTS[e.type].price, d - e.start, e.mag);
          sm *= curveAt(EVENTS[e.type].supply, d - e.start, 1);
          cm *= curveAt(EVENTS[e.type].price, d - e.start, e.mag * CROWD.eventAmp[e.type]);
        });
        rumors.forEach(e => {
          const until = e.fake ? e.rumorDay + 3 : e.start;
          if (d >= e.rumorDay && d < until) cm *= 1 + CROWD.rumorReact[e.type] * CROWD.sourceWeight[e.source];
        });
        value.push(base[d] * pm);
        supply.push(sm);
        crowd.push(pm > 0 ? cm / pm : 1); // Convention price relative to true value
      }
      series[p.name] = { base, value, supply, crowd };
    });

    const quotes = {}; // quotes[day][loc][product] = { price, stock }
    const mystery = {}; // mystery[day][loc] = price, if a store has a mystery box that day
    const mrng = makeRng(seed + "|mystery");
    for (let d = 0; d <= HORIZON; d++) {
      quotes[d] = {};
      mystery[d] = {};
      Object.entries(LOCATIONS).forEach(([loc, L]) => {
        quotes[d][loc] = {};
        PRODUCTS.forEach(p => {
          const v = series[p.name].value[d] * (L.crowd ? series[p.name].crowd[d] : 1);
          const mk = typeof L.markup === "number" ? L.markup : L.markup[p.tier];
          const price = Math.max(5, Math.round(v * mk * (1 + L.noise * (rng.next() * 2 - 1))));
          let stock = null;
          if (L.side === "buy") {
            stock = Math.max(0, Math.round(rng.int(L.stock[0], L.stock[1]) * series[p.name].supply[d]));
          }
          quotes[d][loc][p.name] = { price, stock };
        });
        if (L.side === "buy" && opts.mysteryChance && mrng.next() < opts.mysteryChance) {
          const [lo, hi] = opts.mysteryPrice || [120, 220];
          mystery[d][loc] = Math.round(lo + mrng.next() * (hi - lo));
        }
      });
    }
    return { series, quotes, mystery };
  }

  function headlinesFor(day, plan) {
    const out = [];
    plan.events.concat(plan.fakes).forEach(e => {
      if (e.rumorDay === day) out.push(HEADLINES.rumor[e.type][e.source](e.product));
    });
    plan.events.forEach(e => {
      if (e.start === day) out.push(HEADLINES.start[e.type](e.product));
      const f = HEADLINES.followUp[e.type];
      if (f && e.start + f.day === day) out.push(f.text(e.product));
    });
    plan.fakes.forEach(e => { if (e.rumorDay + 3 === day) out.push(HEADLINES.debunk(e.product)); });
    return out;
  }

  // ---------------------------------------------------------------------------
  // Public market object
  // ---------------------------------------------------------------------------
  // opts: { mysteryChance, mysteryPrice } — mystery box days (seeded, so
  // everyone on the same seed sees the same boxes; contents are per player).
  function create(seed, opts = {}) {
    seed = seed == null ? String(Math.floor(Math.random() * 1e9)) : String(seed);
    const plan = planRun(seed);
    const { series, quotes, mystery } = buildSeries(seed, plan, opts);
    const mysteryTaken = {};
    const listingRng = makeRng(seed + "|listings");

    let day = 1;
    let bought = {};   // bought[loc][product] = boxes bought here today
    let sold = {};     // sold[loc][product]   = boxes sold here today
    let cleared = {};  // cleared[loc][product] = true if sold out mid-day
    const resetDay = () => { bought = {}; sold = {}; cleared = {}; };
    const bump = (obj, loc, p) => { (obj[loc] = obj[loc] || {}); obj[loc][p] = (obj[loc][p] || 0) + 1; };
    const get = (obj, loc, p) => (obj[loc] && obj[loc][p]) || 0;

    const m = {
      seed,
      DAYS,
      HORIZON,
      products: PRODUCTS.map(p => p.name),
      buyLocations: Object.keys(LOCATIONS).filter(l => LOCATIONS[l].side === "buy"),
      sellLocations: Object.keys(LOCATIONS).filter(l => LOCATIONS[l].side === "sell"),
      get day() { return day; },

      // Price at a store right now. Sell prices drop as you dump boxes there.
      isOpen(loc) { const f = LOCATIONS[loc].openDays; return !f || f(day); },

      price(loc, p) {
        if (!m.isOpen(loc)) return null;
        const q = quotes[day][loc][p].price;
        const L = LOCATIONS[loc];
        if (L.side === "sell") return Math.max(5, Math.round(q * Math.pow(1 - L.depth, get(sold, loc, p))));
        return q;
      },
      stock(loc, p) {
        const L = LOCATIONS[loc];
        if (L.side !== "buy") return Infinity;
        if (cleared[loc] && cleared[loc][p]) return 0;
        return Math.max(0, quotes[day][loc][p].stock - get(bought, loc, p));
      },
      shipDays(loc) { return LOCATIONS[loc].shipDays || 0; },

      buy(loc, p) {
        if (LOCATIONS[loc].side !== "buy" || !m.isOpen(loc) || m.stock(loc, p) <= 0) return { ok: false };
        const price = m.price(loc, p);
        bump(bought, loc, p);
        return { ok: true, price, arrivesDay: day + m.shipDays(loc) };
      },
      sell(loc, p) {
        if (LOCATIONS[loc].side !== "sell" || !m.isOpen(loc)) return { ok: false };
        const price = m.price(loc, p);
        bump(sold, loc, p);
        return { ok: true, price };
      },
      // For the 2-minute sellout clock: wipe a product off a shelf for today.
      sellOut(loc, p) { (cleared[loc] = cleared[loc] || {})[p] = true; },

      // Online listing: returns how many of the listed boxes sold today, and
      // the payout per box after fees.
      // cfg lets other venues (your own shop shelves) use different odds/fees.
      listingSales(p, askPrice, qty, cfg = LISTING) {
        const ratio = askPrice / series[p].value[day];
        const chance = Math.max(cfg.min,
          Math.min(0.95, cfg.atValue - Math.max(0, ratio - 1) * 10 * cfg.perTenPctOver));
        let n = 0;
        for (let i = 0; i < qty; i++) if (listingRng.next() < chance) n++;
        return { sold: n, payoutEach: askPrice * (1 - cfg.fee), chance };
      },

      headlines() { return headlinesFor(day, plan); },

      // Mystery box at this store today? Returns price or null. One per store per day.
      mysteryBox(loc) {
        const pr = mystery[day] && mystery[day][loc];
        return pr && !mysteryTaken[day + loc] ? pr : null;
      },
      takeMysteryBox(loc) {
        const pr = m.mysteryBox(loc);
        if (!pr) return null;
        mysteryTaken[day + loc] = true;
        return pr;
      },
      // Today's true value (for ripping cash-back and end-of-run net worth).
      valueNow(p) { return series[p].value[day]; },

      // Sim bots stop at the main-game end; the real game keeps going for the post-game.
      nextDay(limit = HORIZON) {
        if (day >= limit) return false;
        day++;
        resetDay();
        return true;
      },

      // For end-of-game share cards / charts. Hidden during play.
      valueHistory(p) { return series[p].value.slice(1, day + 1).map(v => Math.round(v)); },
      // Debug/tuning only — reveals the plan. Don't show players.
      _plan: plan,
      _series: series
    };
    return m;
  }

  const api = { create, PRODUCTS, LOCATIONS, EVENTS, TIERS, PLAN, LISTING, curveAt, DAYS, HORIZON };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.TCGMarket = api;
})(typeof window !== "undefined" ? window : globalThis);
