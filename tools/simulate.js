// Balance simulator for js/market.js.  Usage: node tools/simulate.js [runs]
// Plays thousands of seeded runs with a few bot styles and reports outcomes.
const M = require("../js/market.js");
const R = require("../js/rules.js");
const LEASE = +process.env.LEASE || R.RULES.lease;
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
function flip(m, s, reserve = 0, skip = new Set()) {
  ["Cost-Mart", "Local Game Store"].forEach(loc => m.products.forEach(p => {
    if (skip.has(p)) return;
    while (m.stock(loc, p) > 0) {
      const cost = m.price(loc, p), b = bestSell(m, p);
      if (b.price < cost * 1.03 || s.cash - cost < reserve) break;
      m.buy(loc, p); s.cash -= cost; m.sell(b.loc, p); s.cash += b.price;
    }
  }));
}
function stockUp(m, s, p, budget, sellDay) {
  ["Cost-Mart", "Local Game Store", "eCommerce Store"].forEach(loc => {
    if (m.day + m.shipDays(loc) > sellDay - 1) return; // would arrive too late
    while (m.stock(loc, p) > 0 && budget >= m.price(loc, p)) {
      const c = m.price(loc, p); const r = m.buy(loc, p); s.cash -= c; budget -= c;
      if (r.arrivesDay > m.day) s.pending.push({ p, day: r.arrivesDay }); else s.inv[p]++;
    }
  });
}

// Each style: which sources it trusts, and per event type when it buys and sells
// (days relative to the event start; fakes bail 3 days after the rumor).
const STYLES = {
  "Ignores rumors": { trust: [], plays: {} },
  "Reads rumors well": {
    trust: ["leaker"], budget: 0.9, borrow: { hype: 5000 },
    plays: {
      hype:    { buyTo: 0,  sellAt: 2 },    // buy the rumor, sell the peak
      oop:     { buyTo: 1,  sellAt: 99 },   // buy and hold to the end
      crunch:  { buyTo: -1, sellAt: 2 },
      reprint: { buyFrom: 2, buyTo: 3, sellAt: 10 } // buy the dip
    }
  },
  "Believes everything": {
    trust: ["leaker", "creator"], budget: 0.6,
    plays: { hype: { buyTo: 1, sellAt: 4 }, oop: { buyTo: 1, sellAt: 99 }, crunch: { buyTo: 1, sellAt: 5 } }
  }
};

function play(seed, style, log) {
  const m = M.create(seed);
  const s = { cash: 1000, inv: {}, pending: [], debt: 0, shopDay: null };
  m.products.forEach(p => (s.inv[p] = 0));
  const holds = [];
  for (;;) {
    s.pending = s.pending.filter(x => (x.day <= m.day ? (s.inv[x.p]++, false) : true));
    m._plan.events.concat(m._plan.fakes)
      .filter(e => e.rumorDay === m.day && style.trust.includes(e.source) && style.plays[e.type])
      .forEach(e => {
        const pl = style.plays[e.type];
        if (e.type === "reprint") sellAll(m, s, e.product); // get out before the dip
        const b = style.borrow && style.borrow[e.type];
        const cap = b ? b : 0; // size the loan to your bankroll
        if (cap > s.debt) { s.cash += cap - s.debt; s.debt = cap; }
        const start = e.fake ? e.rumorDay + 1 : e.start;
        holds.push({ p: e.product, fake: e.fake,
          buyFrom: e.fake && pl.buyFrom ? 999 : start + (pl.buyFrom ?? -99),
          buyTo: e.fake ? e.rumorDay + 1 : start + pl.buyTo,
          sellDay: e.fake ? e.rumorDay + 3 : start + pl.sellAt });
      });
    holds.forEach(h => {
      if (m.day < h.buyFrom || m.day > h.buyTo) return;
      const longHold = h.sellDay - m.day > 6;          // never tie borrowed money up long
      const spendable = longHold ? Math.max(0, s.cash - s.debt) : s.cash;
      stockUp(m, s, h.p, spendable * style.budget, Math.min(h.sellDay, m.DAYS));
    });
    for (let i = holds.length - 1; i >= 0; i--) {
      const h = holds[i];
      if (m.day >= Math.min(h.sellDay, m.DAYS)) { sellAll(m, s, h.p); holds.splice(i, 1); }
    }
    // repay debt whenever no short trade is open; interest accrues daily
    if (s.debt > 0 && !holds.some(h => h.sellDay < 99)) { const pay = Math.min(s.cash, s.debt); s.cash -= pay; s.debt -= pay; }
    s.debt *= 1.05;
    const held = new Set(holds.map(h => h.p));
    flip(m, s, 0, held);
    const rent = R.rentDue(m.day);
    if (rent) { const pay = Math.min(s.cash, rent); s.cash -= pay; s.debt += rent - pay; }
    if (!s.shopDay && s.cash - s.debt >= LEASE) s.shopDay = m.day;
    if (log) { let inv=0; m.products.forEach(p=>inv+=s.inv[p]*M.create(seed)._series[p].value[m.day]); log.push(Math.round(s.cash)+'/'+Math.round(inv)); }
    if (!m.nextDay(m.DAYS)) break;
  }
  s.pending.forEach(x => s.inv[x.p]++);
  m.products.forEach(p => sellAll(m, s, p));
  play.last = s;
  return s.cash - s.debt;
}

const q = (a, f) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(f * (b.length - 1))]; };
const fmt = n => "$" + Math.round(n).toLocaleString();
console.log(`${RUNS} seeded runs per style\n`);
const medians = {}, shopDays = {};
Object.entries(STYLES).forEach(([name, st]) => {
  const res = [], days = []; for (let i = 0; i < RUNS; i++) { res.push(play("sim" + i, st)); days.push(play.last.shopDay); }
  medians[name] = q(res, .5);
  shopDays[name] = days;
  console.log(name.padEnd(22), "median", fmt(q(res, .5)).padStart(9), "  p10", fmt(q(res, .1)).padStart(9), "  p90", fmt(q(res, .9)).padStart(9));
});

if (process.env.TRACE) { ['Ignores rumors','Reads rumors well'].forEach(n=>{const L=[];play('sim3',STYLES[n],L);console.log(n,L.join(' '));}); }
Object.entries(shopDays).forEach(([n, d]) => {
  const opened = d.filter(Boolean);
  console.log(`${n.padEnd(22)} opened shop by Day 30: ${Math.round(100 * opened.length / d.length)}%  median day ${opened.length ? q(opened, .5) : "-"}  fastest 10% by day ${opened.length ? q(opened, .1) : "-"}`);
});
console.log(`(lease $${LEASE.toLocaleString()}, rent included)`);
console.log("Reader edge vs ignoring:", (medians["Reads rumors well"] / medians["Ignores rumors"]).toFixed(2) + "x");
// Determinism check
const a = M.create("abc"), b = M.create("abc");
const same = JSON.stringify(a._series) === JSON.stringify(b._series) && JSON.stringify(a._plan) === JSON.stringify(b._plan);
console.log("\nSame seed -> same market:", same);
// Rumor accuracy by source
let tot = { leaker: [0, 0], creator: [0, 0] };
for (let i = 0; i < RUNS; i++) { const m = M.create("acc" + i); m._plan.events.forEach(e => tot[e.source][0]++); m._plan.fakes.forEach(e => tot[e.source][1]++); }
Object.entries(tot).forEach(([k, [t, f]]) => console.log(`${k} rumors true: ${Math.round(100 * t / (t + f))}%`));
