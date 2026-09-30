// Skill vs luck study.  Usage: node tools/skill-study.js [runs=1000] [--json out.json]
//
// Plays the same N seeded markets with seven kinds of players, then asks:
//  1. Is the market predictable? From what information?
//  2. How much of a player's result is skill (who they are) vs luck (which market)?
//  3. Do the venues behave as designed (Convention swingiest and most news-driven)?
//
// Bots only act on what a player could see that day (headlines, prices), except
// the Oracle, which sees the future on purpose: it marks the skill ceiling.

const M = require(process.env.MARKET || "../js/market.js");
const R = require("../js/rules.js");
const RUNS = +process.argv[2] || 1000;
const OUT = process.argv.includes("--json") ? process.argv[process.argv.indexOf("--json") + 1] : null;
const LEASE = R.RULES.lease, DAYS = M.DAYS;

// ---------- helpers ----------
function newPlayer() { return { cash: R.RULES.startCash, debt: 0, inv: {}, pending: [], shopDay: null }; }
function bestSell(m, p) {
  let best = null;
  m.sellLocations.forEach(l => { const pr = m.price(l, p); if (pr == null) return; if (!best || pr > best.price) best = { loc: l, price: pr }; });
  return best;
}
function sellN(m, s, p, n = Infinity) {
  let k = 0;
  while ((s.inv[p] || 0) > 0 && k < n) { const b = bestSell(m, p); m.sell(b.loc, p); s.cash += b.price; s.inv[p]--; k++; }
}
function sellAt(m, s, loc, p) {
  while ((s.inv[p] || 0) > 0 && m.isOpen(loc)) { const pr = m.price(loc, p); m.sell(loc, p); s.cash += pr; s.inv[p]--; }
}
function buyUpTo(m, s, p, budget, locs, arriveBy = Infinity) {
  let spent = 0;
  locs.forEach(loc => {
    if (m.day + m.shipDays(loc) > arriveBy) return;
    while (m.stock(loc, p) > 0 && budget - spent >= m.price(loc, p) && s.cash >= m.price(loc, p)) {
      const c = m.price(loc, p), r = m.buy(loc, p); s.cash -= c; spent += c;
      if (r.arrivesDay > m.day) s.pending.push({ p, day: r.arrivesDay }); else s.inv[p] = (s.inv[p] || 0) + 1;
    }
  });
}
// Same-day flips at buy spots whenever the best open sell price beats cost by `edge`.
function flip(m, s, edge = 1.02, skip = new Set()) {
  ["Cost-Mart", "Local Game Store"].forEach(loc => m.products.forEach(p => {
    if (skip.has(p)) return;
    while (m.stock(loc, p) > 0) {
      const cost = m.price(loc, p), b = bestSell(m, p);
      if (!b || b.price < cost * edge || s.cash < cost) break;
      m.buy(loc, p); s.cash -= cost; m.sell(b.loc, p); s.cash += b.price;
    }
  }));
}
function dayEnd(m, s) {
  s.pending = s.pending.filter(x => (x.day <= m.day + 1 ? ((s.inv[x.p] = (s.inv[x.p] || 0) + 1), false) : true));
  const rent = R.rentDue(m.day);
  if (rent) { const pay = Math.min(s.cash, rent); s.cash -= pay; s.debt += rent - pay; }
  if (s.debt > 0 && s.cash > 0 && !s.keepLoan) { const pay = Math.min(s.cash, s.debt); s.cash -= pay; s.debt -= pay; }
  s.debt *= 1 + R.RULES.debtRate;
  if (!s.shopDay && s.cash - s.debt >= LEASE) s.shopDay = m.day;
}
function finish(m, s) {
  s.pending.forEach(x => (s.inv[x.p] = (s.inv[x.p] || 0) + 1));
  m.products.forEach(p => sellN(m, s, p));
  return s.cash - s.debt;
}
// What a player sees today: rumors dropped today (source + type + product),
// "NEWS" confirmations and debunks. Bots infer real vs fake only from later headlines.
function todaysNews(m) {
  const all = m._plan.events.concat(m._plan.fakes);
  return {
    rumors: all.filter(e => e.rumorDay === m.day).map(e => ({ type: e.type, product: e.product, source: e.source, _e: e })),
    started: m._plan.events.filter(e => e.start === m.day),
    debunked: m._plan.fakes.filter(e => e.rumorDay + 3 === m.day)
  };
}

// ---------- the seven players ----------
const STYLES = {
  // 1. Novice: buys a few random boxes, sells them a few days later wherever.
  Novice(m, s, rnd) {
    if (rnd() < 0.6) {
      const loc = m.buyLocations[Math.floor(rnd() * 3)], p = m.products[Math.floor(rnd() * 6)];
      buyUpTo(m, s, p, s.cash * 0.4, [loc]);
    }
    s.age = s.age || {};
    m.products.forEach(p => {
      if ((s.inv[p] || 0) > 0) { s.age[p] = (s.age[p] || 0) + 1; if (s.age[p] >= 3) { const open = m.sellLocations.filter(l => m.isOpen(l)); sellAt(m, s, open[Math.floor(rnd() * open.length)], p); s.age[p] = 0; } }
    });
  },
  // 2. Casual: buys cheap boxes at the Game Store, sells them next day at the Marketplace. No news.
  Casual(m, s) {
    m.products.forEach(p => sellAt(m, s, "The Marketplace", p));
    ["Dark Flames", "Masks of Dawn", "Prizms of Change", "Inevitable Opponents"].forEach(p => buyUpTo(m, s, p, s.cash * 0.2, ["Local Game Store"]));
  },
  // 3. Grinder: perfect same-day flipping everywhere, ignores news.
  Grinder(m, s) { flip(m, s, 1.02); },
  // 4. Gullible: buys every rumor, from any source, holds too long.
  Gullible(m, s) { rumorPlay(m, s, { trust: ["leaker", "creator"], budget: 0.6, borrow: 0, plays: { hype: [0, 4], oop: [1, 99], crunch: [1, 5], reprint: null } }); flip(m, s, 1.02, held(s)); },
  // 5. Reader: trusts leakers, sells hype at the peak, holds out-of-print, buys reprint dips; borrows on hype.
  Reader(m, s) { rumorPlay(m, s, { trust: ["leaker"], budget: 0.9, borrow: 5000, plays: { hype: [0, 2], oop: [1, 99], crunch: [-1, 2], reprint: "dip" } }); flip(m, s, 1.02, held(s)); },
  // 6. Expert: Reader + venue timing — sells into Convention weekends, sells creator OOP/reprint rumors
  //    into the Convention reaction, and holds vintage late when the market gets wild.
  Expert(m, s) { rumorPlay(m, s, { trust: ["leaker"], budget: 0.9, borrow: 5000, convention: true, plays: { hype: [0, 2], oop: [1, 99], crunch: [-1, 2], reprint: "dip" } }); flip(m, s, 1.02, held(s)); },
  // 7. Oracle: sees the next 5 days of prices (skill ceiling). Ranks trades by return per day
  //    held, keeps cash for rent, and sells each box on its best day.
  Oracle(m, s, rnd, fut) {
    s.plan = s.plan || {};
    m.products.forEach(p => { if ((s.inv[p] || 0) > 0 && (s.plan[p] || 0) <= m.day) sellN(m, s, p); });
    const nextRent = R.nextRent(m.day), reserve = nextRent.day - m.day <= 5 ? nextRent.amount : 0;
    const opts = [];
    m.buyLocations.forEach(loc => m.products.forEach(p => {
      if (m.stock(loc, p) <= 0) return;
      const arrive = m.day + m.shipDays(loc);
      let bd = arrive, bp = 0;
      for (let d = Math.max(arrive, m.day); d <= Math.min(m.day + 5, DAYS); d++) { const v = fut.best(p, d); if (v > bp) { bp = v; bd = d; } }
      const ratio = bp / m.price(loc, p), perDay = Math.pow(ratio, 1 / Math.max(1, bd - m.day));
      if (ratio > 1.02) opts.push({ loc, p, bd, perDay });
    }));
    opts.sort((a, b) => b.perDay - a.perDay).forEach(o => {
      const before = s.cash;
      buyUpTo(m, s, o.p, Math.max(0, s.cash - reserve), [o.loc]);
      if (s.cash < before) {
        if (o.bd === m.day) sellN(m, s, o.p); else s.plan[o.p] = Math.max(s.plan[o.p] || 0, o.bd);
      }
    });
  }
};
const held = s => new Set(Object.entries(s.holds || {}).filter(([, h]) => h.length).map(([p]) => p));

function rumorPlay(m, s, cfg) {
  s.holds = s.holds || {};
  const news = todaysNews(m);
  // new positions from rumors we trust
  news.rumors.filter(r => cfg.trust.includes(r.source)).forEach(r => {
    const pl = cfg.plays[r.type];
    if (!pl) return;
    const e = r._e;
    if (pl === "dip") { sellN(m, s, r.product); (s.holds[r.product] = s.holds[r.product] || []).push({ kind: "dip", rumorDay: m.day, e }); return; }
    if (cfg.borrow && r.type === "hype" && s.debt < cfg.borrow) { s.cash += cfg.borrow - s.debt; s.debt = cfg.borrow; s.keepLoan = true; }
    (s.holds[r.product] = s.holds[r.product] || []).push({ kind: r.type, rumorDay: m.day, buyTo: pl[0], sellAt: pl[1], e });
  });
  // Expert: on Convention days, sell anything the Convention is paying a real premium for,
  // and dump reprint-rumored boxes into the crowd before the crash.
  if (cfg.convention && m.isOpen("TCG Convention")) {
    m.products.forEach(p => {
      if (!(s.inv[p] > 0)) return;
      const c = m.price("TCG Convention", p), mk = m.price("The Marketplace", p);
      const holdKind = (s.holds[p] || []).map(h => h.kind);
      if (holdKind.includes("oop") && m.day < DAYS - 3 && c < mk * 1.25) return; // keep holding OOP unless the crowd overpays
      if (c >= mk * 1.08) sellAt(m, s, "TCG Convention", p);
    });
    news.rumors.filter(r => r.type === "reprint").forEach(r => sellAt(m, s, "TCG Convention", r.product));
  }
  Object.entries(s.holds).forEach(([p, list]) => {
    for (let i = list.length - 1; i >= 0; i--) {
      const h = list[i], e = h.e;
      const debunked = e.fake && m.day >= e.rumorDay + 3;
      const started = !e.fake && m.day >= e.start;
      const since = started ? m.day - e.start : null;
      if (h.kind === "dip") {
        if (e.fake) { list.splice(i, 1); continue; }
        if (since === 2 || since === 3) buyUpTo(m, s, p, s.cash * cfg.budget, ["Cost-Mart", "Local Game Store", "eCommerce Store"], m.day + 7);
        if (since != null && since >= 10) { sellN(m, s, p); list.splice(i, 1); }
        continue;
      }
      if (debunked) { sellN(m, s, p); list.splice(i, 1); continue; }
      const buyWindow = !started || since <= h.buyTo;
      if (buyWindow) {
        const long = h.sellAt > 20;
        const spend = long ? Math.max(0, s.cash - s.debt) * cfg.budget : s.cash * cfg.budget;
        const sellBy = started ? e.start + h.sellAt : m.day + 4;
        buyUpTo(m, s, p, spend, ["Cost-Mart", "Local Game Store", "eCommerce Store"], Math.min(sellBy, DAYS) - 1);
      }
      let sellNow = started && since >= h.sellAt;
      // Expert venue timing: sell OOP holdings at the last Convention weekend, hype at the peak if it's a weekend day
      if (cfg.convention && h.kind === "oop" && m.day >= DAYS - 3 && m.isOpen("TCG Convention")) sellNow = true;
      if (m.day >= DAYS || sellNow) { sellN(m, s, p); list.splice(i, 1); if (!Object.values(s.holds).some(l => l.some(x => x.kind === "hype"))) s.keepLoan = false; }
    }
  });
}

// Oracle's view of the future: best sell price per product per day (no depth).
function future(seed) {
  const m = M.create(seed); const best = {};
  m.products.forEach(p => (best[p] = []));
  for (;;) { m.products.forEach(p => { const b = bestSell(m, p); best[p][m.day] = b ? b.price : 0; }); if (!m.nextDay(DAYS)) break; }
  return {
    best: (p, d) => best[p][Math.min(d, DAYS)] || 0,
    bestDay: (p, from) => { let bd = Math.min(from, DAYS); for (let d = bd; d <= DAYS; d++) if (best[p][d] > best[p][bd]) bd = d; return bd; }
  };
}

function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function play(seed, name) {
  const m = M.create(seed), s = newPlayer(), rnd = mulberry(seed.length * 7919 + name.length * 104729 + [...seed].reduce((a, c) => a + c.charCodeAt(0), 0));
  const fut = name === "Oracle" ? future(seed) : null;
  for (;;) { STYLES[name](m, s, rnd, fut); dayEnd(m, s); if (!m.nextDay(DAYS)) break; }
  return { net: finish(m, s), shopDay: s.shopDay };
}

// ---------- 1. Skill vs luck ----------
const names = Object.keys(STYLES);
const res = {}; names.forEach(n => (res[n] = []));
for (let i = 0; i < RUNS; i++) { const seed = "study" + i; names.forEach(n => res[n].push(play(seed, n))); }
const q = (a, f) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(f * (b.length - 1))]; };
const fmt = n => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString();

console.log(`\n=== ${RUNS} markets x ${names.length} player types (lease ${fmt(LEASE)}, rent on) ===\n`);
console.log("Player      median      p10        p90     shop by D30  median day  fastest 25%  fastest 10%");
const summary = {};
names.forEach(n => {
  const net = res[n].map(r => r.net), days = res[n].map(r => r.shopDay).filter(Boolean);
  summary[n] = { median: q(net, .5), p10: q(net, .1), p90: q(net, .9), shopRate: days.length / RUNS, shopDay: days.length ? q(days, .5) : null,
    fast25: q(res[n].map(r => r.shopDay || 99), .25), fast10: q(res[n].map(r => r.shopDay || 99), .1) };
  console.log(n.padEnd(10), fmt(q(net, .5)).padStart(9), fmt(q(net, .1)).padStart(10), fmt(q(net, .9)).padStart(10),
    (Math.round(100 * days.length / RUNS) + "%").padStart(10), String(days.length ? q(days, .5) : "-").padStart(11),
    String(days.length > RUNS / 4 ? q(res[n].map(r => r.shopDay || 99), .25) : "-").padStart(12), String(days.length > RUNS / 10 ? q(res[n].map(r => r.shopDay || 99), .1) : "-").padStart(12));
});

// Luck: how far the same strategy swings between markets (p90 / p10).
console.log(`\nLuck (same strategy, different market), p90 vs p10:`);
["Grinder", "Reader", "Expert", "Oracle"].forEach(n => console.log(`  ${n.padEnd(8)} ${fmt(summary[n].p10)} to ${fmt(summary[n].p90)}`));
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;

// Head-to-head on the same market
const beats = (a, b) => res[a].filter((r, i) => r.net > res[b][i].net).length / RUNS;
console.log(`\nSame market, head to head:`);
[["Casual", "Novice"], ["Grinder", "Casual"], ["Reader", "Grinder"], ["Expert", "Reader"], ["Expert", "Grinder"], ["Grinder", "Gullible"], ["Oracle", "Expert"]]
  .forEach(([a, b]) => console.log(`  ${a} beats ${b}: ${Math.round(100 * beats(a, b))}%`));
const ceiling = summary.Oracle.median, exp = summary.Expert.median;
console.log(`\nSkill ceiling: Oracle median ${fmt(ceiling)} = ${(ceiling / exp).toFixed(1)}x the Expert bot, ${(ceiling / summary.Grinder.median).toFixed(1)}x the Grinder.`);

// ---------- 2. Is price predictable? ----------
// Marketplace price (open daily), each product's 3-day forward move.
const ret = { quiet: [], lh: [], lo: [], lr: [], lc: [], ch: [], co: [], cr: [], cc: [] };
let ac = { xy: 0, xx: 0 };
for (let i = 0; i < RUNS; i++) {
  const m = M.create("study" + i), mp = {};
  m.products.forEach(p => (mp[p] = []));
  for (;;) { m.products.forEach(p => (mp[p][m.day] = m.price("The Marketplace", p))); if (!m.nextDay(DAYS)) break; }
  const evs = m._plan.events.concat(m._plan.fakes);
  const busy = (p, d) => evs.some(e => e.product === p && d >= e.rumorDay - 1 && d <= (e.fake ? e.rumorDay + 4 : e.start + 10));
  const rumorOn = {}; evs.forEach(e => (rumorOn[e.product + "|" + e.rumorDay] = e));
  m.products.forEach(p => {
    const a = mp[p];
    for (let d = 2; d <= DAYS - 3; d++) {
      const fwd = Math.log(a[d + 3] / a[d]);
      const e = rumorOn[p + "|" + d];
      if (e) { const k = (e.source === "leaker" ? "l" : "c") + e.type[0]; ret[k].push(fwd); continue; }
      if (!busy(p, d) && !busy(p, d + 3)) {
        ret.quiet.push(fwd);
        if (d >= 3) { const r0 = Math.log(a[d] / a[d - 1]), r1 = Math.log(a[d + 1] / a[d]); ac.xy += r0 * r1; ac.xx += r0 * r0; }
      }
    }
  });
}
const pct = x => (x >= 0 ? "+" : "") + (100 * x).toFixed(1) + "%";
const sd = a => { const mu = mean(a); return Math.sqrt(mean(a.map(x => (x - mu) ** 2))); };
console.log(`\n=== Predictability (Marketplace price, next 3 days) ===`);
console.log(`Quiet (no news near it): avg ${pct(mean(ret.quiet))}, swings ±${(100 * sd(ret.quiet)).toFixed(1)}%, up ${Math.round(100 * ret.quiet.filter(x => x > 0).length / ret.quiet.length)}% of the time (n=${ret.quiet.length})`);
const label = { lh: "LEAKER hype", lo: "LEAKER out-of-print", lr: "LEAKER reprint", lc: "LEAKER crunch", ch: "CREATOR hype", co: "CREATOR out-of-print", cr: "CREATOR reprint", cc: "CREATOR crunch" };
const predict = {};
Object.keys(label).forEach(k => {
  const a = ret[k]; if (!a.length) return;
  const want = k[1] === "r" ? -1 : 1, hit = a.filter(x => Math.sign(x) === want).length / a.length;
  predict[k] = { avg: mean(a), hit };
  console.log(`${label[k].padEnd(22)} avg ${pct(mean(a)).padStart(7)}, right direction ${Math.round(100 * hit)}%   (n=${a.length})`);
});
console.log(`Quiet-day autocorrelation (yesterday's move predicting today's): ${(ac.xy / ac.xx).toFixed(2)}  (0 = unpredictable, negative = store noise snaps back)`);

// ---------- 3. Venues ----------
console.log(`\n=== Venue behaviour ===`);
const venueOut = {};
{
  const locs = ["Local Game Store", "Cost-Mart", "eCommerce Store", "The Marketplace", "TCG Convention"];
  const noise = {}, news = {}; locs.forEach(l => { noise[l] = []; news[l] = []; });
  for (let i = 0; i < Math.min(RUNS, 400); i++) {
    const m = M.create("study" + i);
    const evs = m._plan.events.concat(m._plan.fakes);
    for (;;) {
      m.products.forEach(p => {
        const quiet = !evs.some(e => e.product === p && m.day >= e.rumorDay - 1 && m.day <= (e.fake ? e.rumorDay + 4 : e.start + 10));
        const newsy = evs.some(e => e.product === p && (e.type === "oop" || e.type === "reprint") && m.day >= e.rumorDay && m.day <= (e.fake ? e.rumorDay + 3 : e.start + 4));
        locs.forEach(l => {
          if (!m.isOpen(l)) return;
          const pr = m.price(l, p);
          if (quiet) noise[l].push({ p, r: Math.log(pr / m.valueNow(p)) });
          if (newsy) news[l].push(Math.abs(Math.log(pr / m._series[p].base[m.day])));
        });
      });
      if (!m.nextDay(DAYS)) break;
    }
  }
  locs.forEach(l => {
    const byP = {}; noise[l].forEach(x => (byP[x.p] = byP[x.p] || []).push(x.r));
    const dev = []; Object.values(byP).forEach(a => { const mu = mean(a); a.forEach(r => dev.push(r - mu)); });
    venueOut[l] = { noise: sd(dev), newsMove: mean(news[l]) };
    console.log(`${l.padEnd(18)} quiet-day price wobble ±${(100 * sd(dev)).toFixed(1)}%   avg move on OOP/reprint news ${(100 * mean(news[l])).toFixed(1)}%`);
  });
}

if (OUT) require("fs").writeFileSync(OUT, JSON.stringify({ summary, runs: RUNS, perRun: Object.fromEntries(names.map(n => [n, res[n].map(r => [Math.round(r.net), r.shopDay || null])])), predict, quiet: { avg: mean(ret.quiet), sd: sd(ret.quiet) }, venueOut }, null, 1));
