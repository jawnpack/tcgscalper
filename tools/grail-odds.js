// How long does the Grail hunt take? Usage: node tools/grail-odds.js
const R = require("../js/rules.js");
const q = (a, f) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(f * (b.length - 1))]; };
[["Modern box ~$200", 200], ["Mid box ~$160", 160], ["Vintage box ~$650", 650]].forEach(([label, value]) => {
  const boxes = [], ev = [], dollars = [];
  for (let i = 0; i < 20000; i++) {
    let n = 0, back = 0;
    for (;;) { n++; const r = R.ripBox(value); back += r.cashBack; if (r.grail) break; if (n > 5000) break; }
    boxes.push(n); dollars.push(n * value - back); ev.push(back / (n * value));
  }
  console.log(`${label.padEnd(18)} boxes to Grail: median ${q(boxes, .5)}, luckiest 10% by box ${q(boxes, .1)}, unluckiest 10% ${q(boxes, .9)} | net cost median $${Math.round(q(dollars, .5)).toLocaleString()} | cash back ${Math.round(100 * q(ev, .5))}%`);
});
let g = 0, jack = 0; const N = 200000;
for (let i = 0; i < N; i++) { const r = R.openMystery(170); if (r.grail) g++; if (r.outcome === "big" || r.outcome === "god") jack++; }
console.log(`Mystery box: Grail 1 in ${Math.round(N / g)}, jackpot/god 1 in ${Math.round(N / jack)}`);
