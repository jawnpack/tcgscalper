// progress.js — rent & debt, the shop goal, ripping, mystery boxes,
// the Grail post-game, and the two share moments.
//
// Loaded after game.js; uses its globals (state, market, render, products,
// showNotification, showModalNotification). All numbers live in js/rules.js.

const { RULES } = TCGRules;
const LAUNCH_DAY = "2026-09-29"; // Daily Market #1

// ---------------------------------------------------------------------------
// Run setup
// ---------------------------------------------------------------------------
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function dailyNumber(key = todayKey()) {
  return Math.round((new Date(key + "T12:00:00") - new Date(LAUNCH_DAY + "T12:00:00")) / 86400000) + 1;
}

// First run of a page load = today's Daily Market. "Play again" = free play.
// ?seed=xyz = a friend's challenge market.
let playFree = false;
function seedForRun() {
  const fromUrl = seedFromUrl();
  if (fromUrl) return { seed: fromUrl, label: `Challenge "${fromUrl}"` };
  if (!playFree) { const k = todayKey(); return { seed: "daily-" + k, label: `Daily Market #${dailyNumber(k)}` }; }
  const s = Math.random().toString(36).slice(2, 8);
  return { seed: s, label: `Free Play (${s})` };
}

function resetProgress() {
  Object.assign(state, {
    debt: 0,
    shopOpen: false, shopDay: null,
    grailDay: null, grailBox: null, grailFrom: null,
    boxesRipped: 0, godPacks: 0, ripSpent: 0,
    netWorthHistory: [],
    costBasis: {},          // product -> { qty, total }
    bestFlip: null,         // { product, profit }
    evicted: false, runOver: false,
    shopMomentShown: false
  });
}

// ---------------------------------------------------------------------------
// Money helpers
// ---------------------------------------------------------------------------
function holdingsValue() {
  let v = 0;
  products.forEach(p => {
    const qty = (state.inventory[p] || 0)
      + state.deliveryQueue.filter(d => d.product === p).reduce((a, d) => a + d.quantity, 0)
      + state.onlineListings.filter(l => l.product === p).reduce((a, l) => a + l.quantity, 0)
      + (state.shopShelf || []).filter(l => l.product === p).reduce((a, l) => a + l.quantity, 0);
    v += qty * market.valueNow(p) * 0.9;
  });
  return v;
}
function netWorth() { return state.money + holdingsValue() - state.debt; }
const usd = n => "$" + Math.round(n).toLocaleString();

function trackBuy(product, price) {
  const c = state.costBasis[product] || (state.costBasis[product] = { qty: 0, total: 0 });
  c.qty++; c.total += price;
}
function trackSell(product, price) {
  const c = state.costBasis[product];
  if (!c || c.qty <= 0) return;
  const avg = c.total / c.qty;
  c.qty--; c.total -= avg;
  const profit = price - avg;
  if (!state.bestFlip || profit > state.bestFlip.profit) state.bestFlip = { product, profit };
}
function removeFromBasis(product) {
  const c = state.costBasis[product];
  if (c && c.qty > 0) { c.total -= c.total / c.qty; c.qty--; }
}

// ---------------------------------------------------------------------------
// Daily tick: interest, rent (before the shop) or shop income (after)
// ---------------------------------------------------------------------------
function economyTick() {
  const msgs = [];
  if (state.debt > 0) {
    const interest = state.debt * RULES.debtRate;
    state.debt += interest;
    msgs.push(`💸 Loan shark interest: +${usd(interest)} (you owe ${usd(state.debt)})`);
  }
  if (!state.shopOpen) {
    const rent = TCGRules.rentDue(state.day);
    if (rent) {
      const paid = Math.min(state.money, rent);
      state.money -= paid;
      const short = rent - paid;
      if (short > 0) {
        state.debt += short;
        msgs.push(`🏠 Rent was ${usd(rent)}. You were ${usd(short)} short, and it went on your tab at ${RULES.debtRate * 100}% a day.`);
      } else {
        msgs.push(`🏠 Paid rent: ${usd(rent)}.`);
      }
    }
  } else {
    const [lo, hi] = RULES.shopIncome;
    const income = Math.round(lo + Math.random() * (hi - lo));
    state.money += income;
    msgs.push(`🏪 Walk-ins spent ${usd(income)} on singles and supplies.`);
  }
  if (state.debt > RULES.evictAt) state.evicted = true;
  return msgs;
}

// ---------------------------------------------------------------------------
// Player actions
// ---------------------------------------------------------------------------
function borrow(amount = 500) {
  if (state.runOver) return;
  const room = RULES.borrowLimit - state.debt;
  if (room < 50) return showNotification(`The loan shark won't go past ${usd(RULES.borrowLimit)}.`, "error");
  const amt = Math.min(amount, Math.floor(room));
  state.debt += amt; state.money += amt;
  showNotification(`Borrowed ${usd(amt)} at ${RULES.debtRate * 100}% a day. Owe: ${usd(state.debt)}`, "warning");
  render();
}
function payDebt() {
  if (state.debt <= 0) return;
  const pay = Math.min(state.money, state.debt);
  if (pay <= 0) return showNotification("No cash to pay with.", "error");
  state.money -= pay; state.debt -= pay;
  if (state.debt < 0.01) state.debt = 0;
  showNotification(state.debt ? `Paid ${usd(pay)}. Still owe ${usd(state.debt)}.` : `Paid off the loan shark. 🙏`, "success");
  render();
}

function openShop() {
  if (state.shopOpen || state.runOver) return;
  if (state.debt > 0) return showNotification("Pay off your debt before signing a lease.", "error");
  if (state.money < RULES.lease) return showNotification(`You need ${usd(RULES.lease)} cash for the lease.`, "error");
  state.money -= RULES.lease;
  state.shopOpen = true;
  state.shopDay = state.day;
  state.location = "Your Shop";
  render();
  showMoment("shop");
}

function ripBox(product) {
  if (state.runOver || !(state.inventory[product] > 0)) return;
  const value = market.valueNow(product);
  state.inventory[product]--;
  removeFromBasis(product);
  const r = TCGRules.ripBox(value);
  state.boxesRipped++;
  state.ripSpent += value;
  state.money += r.cashBack;
  if (r.god) state.godPacks++;
  gameStats.totalSold++;
  if (r.grail) return foundGrail("rip", product);
  if (r.god) {
    showModalNotification(`<p>Every pack in this ${escapeHtml(product)} box hit.</p><p>You pulled <strong>${usd(r.cashBack)}</strong> in singles.</p>`, "⚡ GOD PACK ⚡");
  } else {
    const verdict = r.cashBack >= value * 3 ? "🔥 MONSTER BOX" : r.cashBack >= value * 1.2 ? "Nice hits" : r.cashBack >= value * 0.65 ? "Decent" : "Bricked";
    showNotification(`Ripped ${product}: ${verdict}. Singles worth ${usd(r.cashBack)} (box was ~${usd(value)}). Box #${state.boxesRipped}.`, r.cashBack >= value ? "success" : "info");
  }
  render();
}

function buyMystery() {
  if (state.runOver) return;
  const price = market.mysteryBox(state.location);
  if (!price) return;
  if (state.money < price) return showNotification("Not enough cash for the mystery box.", "error");
  market.takeMysteryBox(state.location);
  state.money -= price;
  const r = TCGRules.openMystery(price);
  state.boxesRipped++;
  state.ripSpent += price;
  state.money += r.cashBack;
  if (r.god) state.godPacks++;
  if (r.grail) return foundGrail("mystery");
  const text = {
    junk: `Junk. Bulk commons and a sticker. Worth ${usd(r.cashBack)}.`,
    decent: `Not bad! Some playables worth ${usd(r.cashBack)}.`,
    big: `🔥 JACKPOT! A sealed vintage pack inside. Worth ${usd(r.cashBack)}!`,
    god: `⚡ A GOD PACK was hiding in there! ${usd(r.cashBack)} in hits!`
  }[r.outcome];
  showModalNotification(`<p>You paid ${usd(price)}.</p><p>${text}</p>`, "📦 MYSTERY BOX");
  render();
}

function foundGrail(from, product) {
  state.grailDay = state.day;
  state.grailBox = state.boxesRipped;
  state.grailFrom = from === "mystery" ? "a mystery box" : product;
  render();
  showMoment("grail");
}

// ---------------------------------------------------------------------------
// Share moments
// ---------------------------------------------------------------------------
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function trendStrip(maxDays) {
  const h = state.netWorthHistory.slice(0, maxDays);
  let prev = RULES.startCash, out = "";
  h.forEach(v => {
    out += v > prev * 1.01 ? "🟩" : v < prev * 0.99 ? "🟥" : "⬜";
    prev = v;
  });
  return out;
}
function challengeLink() {
  return `${location.origin}${location.pathname.replace(/index\.html$/, "")}?seed=${encodeURIComponent(state.seed)}`;
}

function shareText(kind) {
  const head = `THE CARDBOARD FLIP · ${state.runLabel}`;
  if (kind === "shop") {
    const lines = [
      head,
      `🏪 Opened my card shop on DAY ${state.shopDay}`,
      `💵 ${usd(RULES.startCash)} → ${usd(RULES.lease)} lease in ${state.shopDay} days`,
      trendStrip(state.shopDay)
    ];
    if (state.bestFlip && state.bestFlip.profit > 0) lines.push(`🔥 Best flip: ${state.bestFlip.product} +${usd(state.bestFlip.profit)}`);
    lines.push(challengeLink());
    return lines.join("\n");
  }
  if (kind === "grail") {
    const lines = [
      head,
      `🏆 Pulled ${RULES.grailName} on box #${state.grailBox} (Day ${state.grailDay})`,
      state.grailFrom === "a mystery box" ? "🎁 Straight out of a mystery box" : `📦 From a ${state.grailFrom} box`,
      `💸 ${usd(state.ripSpent)} chased · ${state.godPacks} god pack${state.godPacks === 1 ? "" : "s"}`
    ];
    if (!state.shopOpen) lines.push("😳 Before I even opened a shop");
    lines.push(challengeLink());
    return lines.join("\n");
  }
  // end of run
  const rank = TCGRules.rankFor({ evicted: state.evicted, shopDay: state.shopDay, grailBox: state.grailBox, netWorth: netWorth() });
  const lines = [head, `Rank: ${rank}`];
  if (state.shopDay) lines.push(`🏪 Shop opened Day ${state.shopDay}`);
  else lines.push(`🏪 Never opened the shop`);
  if (state.grailBox) lines.push(`🏆 ${RULES.grailName} on box #${state.grailBox} (Day ${state.grailDay})`);
  lines.push(`💵 Net worth: ${usd(netWorth())}`);
  lines.push(trendStrip(RULES.mainDays));
  lines.push(challengeLink());
  return lines.join("\n");
}

async function shareRun(kind) {
  const text = shareText(kind);
  try {
    if (navigator.share) { await navigator.share({ text }); return; }
  } catch (e) { if (e && e.name === "AbortError") return; }
  try {
    await navigator.clipboard.writeText(text);
    showNotification("Copied! Paste it anywhere.", "success");
  } catch (e) {
    window.prompt("Copy your result:", text);
  }
}

function momentHtml(kind) {
  const title = kind === "shop"
    ? `<p style="font-size:1.2em">🏪 You opened your own card shop on <strong>DAY ${state.shopDay}</strong>.</p>
       <p>Rent is over. Walk-ins buy every day, and you can stock your own shelves at your own prices.</p>
       <p><strong>POST-GAME:</strong> hunt for <strong>${RULES.grailName}</strong>. RIP boxes (tap MORE up top), open mystery boxes, and pray for a god pack. Keep flipping to fund it. The hunt ends when you pull it or go broke.</p>`
    : `<p style="font-size:1.2em">🏆 You pulled <strong>${RULES.grailName}</strong> on box <strong>#${state.grailBox}</strong>!</p>
       <p>${state.shopOpen ? "That's the whole game. Legend." : "Before you even opened a shop. Absolute lotto. Keep going for the shop!"}</p>`;
  return `${title}
    <pre class="share-preview">${escapeHtml(shareText(kind))}</pre>
    <button type="button" class="btn primary" onclick="shareRun('${kind}')">SHARE</button>`;
}
function showMoment(kind) {
  showModalNotification(momentHtml(kind), kind === "shop" ? "SHOP OPENED" : "GRAIL PULLED", () => {
    if (kind === "grail" && state.shopOpen) endRun("grail");
  });
}

// ---------------------------------------------------------------------------
// End of run
// ---------------------------------------------------------------------------
function checkRunEnd() {
  if (state.runOver) return true;
  if (state.evicted) { endRun("evicted"); return true; }
  if (!state.shopOpen && state.day > RULES.mainDays) { endRun("time"); return true; }
  if (state.day >= RULES.maxDays) { endRun("season"); return true; }
  return false;
}

function endRun(reason) {
  if (state.runOver) return;
  state.runOver = true;
  const why = {
    evicted: `The loan shark came to collect. You owed ${usd(state.debt)}. EVICTED.`,
    time: `Day ${RULES.mainDays} came and went without a shop.`,
    season: `The season's over.`,
    grail: `You own a card shop AND ${RULES.grailName}.`
  }[reason];
  document.getElementById("final-reason").textContent = why;
  document.getElementById("final-rank").textContent =
    TCGRules.rankFor({ evicted: state.evicted, shopDay: state.shopDay, grailBox: state.grailBox, netWorth: netWorth() });
  document.getElementById("final-money").textContent = Math.round(netWorth()).toLocaleString();
  document.getElementById("final-days").textContent = Math.max(1, state.netWorthHistory.length);
  document.getElementById("final-shop").textContent = state.shopDay ? `Day ${state.shopDay}` : "—";
  document.getElementById("final-grail").textContent = state.grailBox ? `Box #${state.grailBox}` : "—";
  document.getElementById("final-bought").textContent = gameStats.totalBought;
  document.getElementById("final-sold").textContent = gameStats.totalSold;
  document.getElementById("final-share").textContent = shareText("end");
  document.getElementById("leaderboard-modal").style.display = "flex";
}
