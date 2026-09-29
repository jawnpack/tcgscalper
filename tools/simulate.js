// Balance simulator for js/market.js.  Usage: node tools/simulate.js [runs]
// Plays thousands of seeded runs with a few bot styles and reports outcomes.
const M = require("../js/market.js");
const RUNS = +process.argv[2] || 2000;

function bestSell(m, p) {
  let best = null;
  m.sellLocations.forEach(l => { const pr = m.price(l, p); if (pr == null) return; if (!best || pr > best.price) best = { loc: l, price: pr }; });
  return best;
}
function sellAll(m, s, p) {
  while (s.inv[p] > 0) { const b = bestSell(m, p); m.sell(b.loc, p); s.cash += b.price; s.inv[p]--; }
}
// Same-day flips: buy only while the best sell price beats the buy price by >=3%.
function flip(m, s, reserve = 0) {
  ["Cost-Mart", "Local Game Store"].forEach(loc => m.products.forEach(p => {
    while (m.stock(loc, p) > 0) {
      const cost = m.price(loc, p), b = bestSell(m, p);
      if (b.price < cost * 1.03 || s.cash - cost < reserve) break;
      m.buy(loc, p); s.cash -= cost; m.sell(b.loc, p); s.cash += b.price;
    }
  }));
}
function stockUp(m, s, p, budget) {
  ["Cost-Mart", "eCommerce Store", "Local Game Store"].forEach(loc => {
    while (m.stock(loc, p) > 0 && budget >= m.price(loc, p)) {
      const c = m.price(loc, p); const r = m.buy(loc, p); s.cash -= c; budget -= c; if (r.arrivesDay > m.day) s.pending.push({ p, day: r.arrivesDay }); else s.inv[p]++;
    }
  });
}

const STYLES = {
  // Ignores news entirely. Only same-day flips.
  "Ignores rumors": { trust: [], sell: {} },
  // Only acts on LEAKER rumors, sells hype at the peak, holds OOP to the end.
  "Reads rumors well": { trust: ["leaker"], sell: { hype: 2, crunch: 2, oop: 99 } },
  // Believes everything and holds hype too long (gets cratered).
  "Believes everything": { trust: ["leaker", "creator"], sell: { hype: 4, crunch: 5, oop: 99 } }
};

function play(seed, style) {
  const m = M.create(seed);
  const s = { cash: 1000, inv: {}, pending: [] };
  m.products.forEach(p => (s.inv[p] = 0));
  const holds = []; // { p, type, rumorDay }
  for (;;) {
    s.pending = s.pending.filter(x => (x.day <= m.day ? (s.inv[x.p]++, false) : true));
    // Believe a rumor on the day it drops, then keep stocking up every day
    // until the event is due (bots can't tell fakes; they bail 3 days later).
    const all = m._plan.events.concat(m._plan.fakes);
    all.filter(e => e.rumorDay === m.day && style.trust.includes(e.source) && e.type !== "reprint")
      .forEach(e => holds.push({ p: e.product, e, buyUntil: e.fake ? e.rumorDay + 2 : e.start - (e.type === "oop" ? -1 : 1) }));
    holds.forEach(h => { if (m.day <= h.buyUntil) stockUp(m, s, h.p, s.cash * 0.6); });
    for (let i = holds.length - 1; i >= 0; i--) {
      const { p, e } = holds[i];
      const sellDay = e.fake ? e.rumorDay + 3 : e.start + (style.sell[e.type] ?? 1);
      if (m.day >= Math.min(sellDay, m.DAYS)) {
        // wait for the weekend convention if it's close and we're not in a hurry
        sellAll(m, s, p); holds.splice(i, 1);
      }
    }
    flip(m, s, 0);
    if (!m.nextDay()) break;
  }
  s.pending.forEach(x => s.inv[x.p]++);
  m.products.forEach(p => sellAll(m, s, p));
  return s.cash;
}

const q = (a, f) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(f * (b.length - 1))]; };
const fmt = n => "$" + Math.round(n).toLocaleString();
console.log(`${RUNS} seeded runs per style\n`);
Object.entries(STYLES).forEach(([name, st]) => {
  const res = []; for (let i = 0; i < RUNS; i++) res.push(play("sim" + i, st));
  console.log(name.padEnd(22), "median", fmt(q(res, .5)).padStart(9), "  p10", fmt(q(res, .1)).padStart(9), "  p90", fmt(q(res, .9)).padStart(9));
});

// Determinism check
const a = M.create("abc"), b = M.create("abc");
const same = JSON.stringify(a._series) === JSON.stringify(b._series) && JSON.stringify(a._plan) === JSON.stringify(b._plan);
console.log("\nSame seed -> same market:", same);
// Rumor accuracy by source
let tot = { leaker: [0, 0], creator: [0, 0] };
for (let i = 0; i < RUNS; i++) { const m = M.create("acc" + i); m._plan.events.forEach(e => tot[e.source][0]++); m._plan.fakes.forEach(e => tot[e.source][1]++); }
Object.entries(tot).forEach(([k, [t, f]]) => console.log(`${k} rumors true: ${Math.round(100 * t / (t + f))}%`));
