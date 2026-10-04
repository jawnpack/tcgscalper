// game.js — day loop, buying/selling, listings, shop shelves, and all UI.
// Market + rumors: js/market.js · rent, debt, shop, rips, Grail: js/progress.js + js/rules.js

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
// ?seed=abc123 replays an exact market (see seedForRun in progress.js).
function seedFromUrl() {
  try { return new URLSearchParams(location.search).get("seed"); } catch (e) { return null; }
}
let market = TCGMarket.create(seedFromUrl());
const products = market.products;
const buyLocations = market.buyLocations;
const sellLocations = market.sellLocations;
const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

// Every place the player can go. slug drives <body data-place> for theming.
const PLACES = [
  { id: "Local Game Store", short: "Game Store",  kind: "buy",    slug: "lgs",         note: "Steady stock" },
  { id: "Cost-Mart",        short: "Cost-Mart",   kind: "buy",    slug: "costmart",    note: "Cheaper, thin shelves" },
  { id: "eCommerce Store",  short: "eComm",       kind: "buy",    slug: "ecom",        note: "Wild prices, ships in 3 days" },
  { id: "The Marketplace",  short: "Marketplace", kind: "sell",   slug: "marketplace", note: "Open daily. Low-end boxes flip for a profit" },
  { id: "TCG Convention",   short: "Convention",  kind: "sell",   slug: "convention",  note: "Sat & Sun only. Swingiest prices, moves hardest on news" },
  { id: "Online Store",     short: "Online",      kind: "online", slug: "online",      note: "List at your price, 13% fee" },
  { id: "Your Shop",        short: "Your Shop",   kind: "shop",   slug: "shop",        note: "Stock your shelves, set prices" }
];
const placeOf = id => PLACES.find(p => p.id === id);

let state = {
  day: 1,
  money: TCGRules.RULES.startCash,
  location: "Local Game Store",
  inventory: {},
  rumor: "No news yet...",
  deliveryQueue: [],
  onlineListings: [],   // { product, price, quantity, days }
  shopShelf: [],        // same shape, sold from your own shop
};
products.forEach(p => (state.inventory[p] = 0));
let gameStats = { totalBought: 0, totalSold: 0 };

const $ = id => document.getElementById(id);
const money = n => "$" + Math.round(n).toLocaleString();
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const jsArg = s => `'${String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

// ---------------------------------------------------------------------------
// Toasts + notice modals
// ---------------------------------------------------------------------------
function showNotification(message, type = "info") {
  const box = $("toasts");
  if (!box) return;
  const t = document.createElement("div");
  t.className = "toast" + (type === "error" ? " error" : "");
  t.innerHTML = message;
  box.appendChild(t);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => t.remove(), type === "error" ? 3500 : 2800);
}

// Modals queue so a rent notice never hides a shop/grail moment.
const modalQueue = [];
let modalOpen = false;
function showModalNotification(message, title = "", onClose) {
  if (modalOpen) { modalQueue.push([message, title, onClose]); return; }
  modalOpen = true;
  let wrap = $("modal-container");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = "modal-container";
    document.body.appendChild(wrap);
  }
  wrap.innerHTML = `<div class="notice-modal" role="dialog" aria-modal="true">
      ${title ? `<h3>${title}</h3>` : ""}<div>${message}</div>
      <button type="button" class="btn primary ok">OK</button></div>`;
  wrap.style.display = "flex";
  wrap.querySelector(".ok").onclick = () => {
    wrap.style.display = "none";
    wrap.innerHTML = "";
    modalOpen = false;
    if (typeof onClose === "function") onClose();
    if (modalQueue.length) showModalNotification(...modalQueue.shift());
  };
}

// ---------------------------------------------------------------------------
// Buying, selling, travel
// ---------------------------------------------------------------------------
function buy(product, silent) {
  if (state.runOver) return false;
  const loc = state.location;
  const price = market.price(loc, product);
  if (price == null) { if (!silent) showNotification(`${loc} is closed today.`, "error"); return false; }
  if (market.stock(loc, product) <= 0) { if (!silent) showNotification("Sold out here.", "error"); return false; }
  if (state.money < price) { if (!silent) showNotification("Not enough cash.", "error"); return false; }
  const r = market.buy(loc, product);
  if (!r.ok) return false;
  state.money -= price;
  trackBuy(product, price);
  gameStats.totalBought++;
  if (r.arrivesDay > state.day) state.deliveryQueue.push({ product, quantity: 1, arrivalDay: r.arrivesDay });
  else state.inventory[product]++;
  if (!silent) {
    showNotification(r.arrivesDay > state.day
      ? `Bought ${product} for ${money(price)}. Arrives Day ${r.arrivesDay}.`
      : `Bought ${product} for ${money(price)}.`);
    render();
  }
  return price;
}
function buyMax(product) {
  let n = 0, spent = 0, p;
  while ((p = buy(product, true))) { n++; spent += p; }
  if (n) showNotification(`Bought ${n}× ${product} for ${money(spent)}.`);
  else buy(product); // explains why not
  render();
}

function sell(product, silent) {
  if (state.runOver) return false;
  if (!market.isOpen(state.location)) { if (!silent) showNotification(`${state.location} is closed today.`, "error"); return false; }
  if (!(state.inventory[product] > 0)) { if (!silent) showNotification("You don't have any.", "error"); return false; }
  const { price } = market.sell(state.location, product);
  state.money += price;
  state.inventory[product]--;
  trackSell(product, price);
  gameStats.totalSold++;
  if (!silent) { showNotification(`Sold ${product} for ${money(price)}.`); render(); }
  return price;
}
function sellAll(product) {
  let n = 0, got = 0, p;
  while ((p = sell(product, true))) { n++; got += p; }
  if (n) showNotification(`Sold ${n}× ${product} for ${money(got)}.`);
  else sell(product);
  render();
}

function travel(id) {
  if (state.runOver) return;
  const pl = placeOf(id);
  if (pl.kind === "shop" && !state.shopOpen) {
    state.location = id;
  } else {
    state.location = id;
    if ((pl.kind === "sell") && !market.isOpen(id)) showNotification(`${pl.short} is closed today. It runs Sat & Sun.`, "error");
  }
  render();
}

// ---------------------------------------------------------------------------
// Online listings + your shop's shelves (same mechanics, different odds)
// ---------------------------------------------------------------------------
const venues = {
  online: { list: () => state.onlineListings, cfg: () => undefined, fee: 0.13, title: "ONLINE STORE", verb: "LIST", noun: "listing" },
  shop:   { list: () => state.shopShelf, cfg: () => TCGRules.RULES.shelf, fee: 0, title: "YOUR SHELVES", verb: "SHELVE", noun: "shelf spot" }
};

function addListing(kind) {
  const v = venues[kind];
  const product = $("ls-product").value;
  const price = Math.round(parseFloat($("ls-price").value));
  const qty = parseInt($("ls-qty").value, 10);
  if (!product || !(price > 0) || !(qty > 0)) return showNotification("Pick a box, a price and a quantity.", "error");
  if ((state.inventory[product] || 0) < qty) return showNotification(`You only have ${state.inventory[product] || 0}.`, "error");
  state.inventory[product] -= qty;
  const existing = v.list().find(l => l.product === product && l.price === price);
  if (existing) existing.quantity += qty;
  else v.list().push({ product, price, quantity: qty, days: 0 });
  showNotification(`${v.verb === "LIST" ? "Listed" : "Shelved"} ${qty}× ${product} at ${money(price)}.`);
  render();
  openListingsSheet(kind);
}
function saveListing(kind, i) {
  const l = venues[kind].list()[i];
  if (!l) return;
  const price = Math.round(parseFloat($(`ls-p-${i}`).value));
  const qty = parseInt($(`ls-q-${i}`).value, 10);
  if (!(price > 0) || !(qty >= 0)) return showNotification("Enter a price and quantity.", "error");
  const diff = qty - l.quantity;
  if (diff > 0 && (state.inventory[l.product] || 0) < diff) return showNotification(`You only have ${state.inventory[l.product] || 0} more.`, "error");
  state.inventory[l.product] -= diff;
  l.quantity = qty;
  if (price !== l.price) { l.price = price; l.days = 0; }
  if (l.quantity === 0) venues[kind].list().splice(i, 1);
  showNotification("Saved.");
  render();
  openListingsSheet(kind);
}
function pullListing(kind, i) {
  const l = venues[kind].list()[i];
  if (!l) return;
  state.inventory[l.product] += l.quantity;
  venues[kind].list().splice(i, 1);
  showNotification(`Pulled ${l.quantity}× ${l.product} back to your stash.`);
  render();
  openListingsSheet(kind);
}
// Runs each new day for both venues.
function processListings(kind) {
  const v = venues[kind], list = v.list(), sales = [];
  for (let i = list.length - 1; i >= 0; i--) {
    const l = list[i];
    l.days = (l.days || 0) + 1;
    const r = market.listingSales(l.product, l.price, l.quantity, v.cfg());
    if (r.sold > 0) {
      const payout = r.sold * r.payoutEach;
      state.money += payout;
      gameStats.totalSold += r.sold;
      for (let k = 0; k < r.sold; k++) trackSell(l.product, r.payoutEach);
      l.quantity -= r.sold;
      sales.push(`${r.sold}× ${l.product} +${money(payout)}`);
      if (l.quantity <= 0) list.splice(i, 1);
    }
  }
  if (sales.length) showNotification(`${kind === "shop" ? "🏪 Shop sold" : "💻 Online sold"}: ${sales.join(", ")}`);
}

// ---------------------------------------------------------------------------
// Next day
// ---------------------------------------------------------------------------
function nextDay() {
  if (state.runOver) return;
  closeSheet();
  state.netWorthHistory.push(Math.round(netWorth()));
  if (!state.shopOpen && state.day >= TCGRules.RULES.mainDays) { state.day++; checkRunEnd(); return; }

  state.day++;
  market.nextDay();

  const arrived = [];
  state.deliveryQueue = state.deliveryQueue.filter(d => {
    if (d.arrivalDay <= state.day) { state.inventory[d.product] += d.quantity; arrived.push(d.product); return false; }
    return true;
  });
  if (arrived.length) showNotification(`📦 Delivered: ${arrived.length} box${arrived.length > 1 ? "es" : ""}.`);

  economyTick().forEach(msg => showNotification(msg, msg.includes("short") ? "error" : "info"));
  if (checkRunEnd()) return;

  processListings("online");
  if (state.shopOpen) processListings("shop");

  const news = market.headlines();
  state.rumor = news.length ? news.join("\n") : "No news today...";
  if (placeOf(state.location).kind === "sell" && !market.isOpen(state.location)) {
    showNotification(`${placeOf(state.location).short} is closed today.`, "error");
  }
  render();
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function totalBoxes() {
  return products.reduce((a, p) => a + (state.inventory[p] || 0), 0);
}

function render() {
  const pl = placeOf(state.location);
  document.body.dataset.place = pl.slug;

  // status bar
  $("tb-day").textContent = `DAY ${state.day} · ${WEEKDAYS[state.day % 7]}`;
  $("tb-cash").textContent = money(state.money);
  const bits = [`${totalBoxes()} BOX${totalBoxes() === 1 ? "" : "ES"}`];
  if (state.debt > 0) bits.push(`OWE ${money(state.debt)}`);
  if (state.shopOpen) {
    bits.push(state.grailBox ? "🏆 GRAIL" : `GRAIL HUNT: ${state.boxesRipped} RIPPED`);
  } else {
    const r = TCGRules.nextRent(state.day);
    const due = TCGRules.rentDue(state.day);
    bits.push(due ? `RENT PAID TODAY` : `RENT ${money(r.amount)} D${r.day}`);
    bits.push(state.money >= TCGRules.RULES.lease && !state.debt ? "SHOP READY!" : `GOAL ${money(TCGRules.RULES.lease)}`);
  }
  $("tb-summary").textContent = bits.join(" · ");

  renderPlaces();
  renderCounter();
  $("rumor").textContent = state.rumor;
  $("next-day").disabled = !!state.runOver;
}

function renderPlaces() {
  const group = (label, kinds) => `<div class="places-group"><h3>${label}</h3>${PLACES.filter(p => kinds.includes(p.kind)).map(p => {
    const closed = p.kind === "sell" && !market.isOpen(p.id);
    const locked = p.kind === "shop" && !state.shopOpen;
    const extra = locked ? "Locked" : closed ? "Closed today" : p.kind === "online" && state.onlineListings.length ? `${state.onlineListings.length} listed`
      : p.kind === "shop" && state.shopShelf.length ? `${state.shopShelf.reduce((a, l) => a + l.quantity, 0)} on shelves`
      : market.mysteryBox && p.kind === "buy" && market.mysteryBox(p.id) ? "📦 Mystery box" : "";
    return `<button type="button" class="place${p.id === state.location ? " here" : ""}${locked ? " locked" : ""}" data-place="${p.slug}" onclick="travel(${jsArg(p.id)})">${esc(p.short)}${extra ? `<small>${extra}</small>` : ""}</button>`;
  }).join("")}</div>`;
  $("places").innerHTML = group("BUY", ["buy"]) + group("SELL", ["sell", "online", "shop"]);
}

function renderCounter() {
  const pl = placeOf(state.location);
  $("here").textContent = pl.id.toUpperCase();
  let note = pl.note;
  if (pl.kind === "sell" && !market.isOpen(pl.id)) note = "CLOSED TODAY. Open Sat & Sun.";
  $("here-note").textContent = note;
  const body = $("counter-body");

  if (pl.kind === "buy" || pl.kind === "sell") {
    const closed = !market.isOpen(pl.id);
    if (closed) { body.innerHTML = `<p class="empty">Closed today. The Convention runs Saturday and Sunday.<br><br>Try The Marketplace, or list online.</p>`; return; }
    const rows = products.map(p => {
      const own = state.inventory[p] || 0;
      const price = market.price(pl.id, p);
      if (pl.kind === "buy") {
        const stock = market.stock(pl.id, p);
        return `<tr><td class="nm">${esc(p)}${own ? `<small>You have ${own}</small>` : ""}</td>
          <td class="pr">${money(price)}<small>${stock} left</small></td>
          <td class="act"><button type="button" class="btn tiny primary" onclick="buy(${jsArg(p)})" ${stock > 0 ? "" : "disabled"}>BUY</button><button type="button" class="btn tiny" onclick="buyMax(${jsArg(p)})" ${stock > 0 ? "" : "disabled"}>MAX</button></td></tr>`;
      }
      return `<tr><td class="nm">${esc(p)}<small>You have ${own}</small></td>
        <td class="pr">${money(price)}</td>
        <td class="act"><button type="button" class="btn tiny primary" onclick="sell(${jsArg(p)})" ${own ? "" : "disabled"}>SELL</button><button type="button" class="btn tiny" onclick="sellAll(${jsArg(p)})" ${own ? "" : "disabled"}>ALL</button></td></tr>`;
    }).join("");
    let mystery = "";
    if (pl.kind === "buy") {
      const mp = market.mysteryBox(pl.id);
      if (mp) mystery = `<tr class="mystery"><td class="nm">📦 Mystery Box<small>Unlabeled. Could be anything.</small></td><td class="pr">${money(mp)}<small>1 left</small></td><td class="act"><button type="button" class="btn tiny primary" onclick="buyMystery()">OPEN</button></td></tr>`;
    }
    body.innerHTML = `<table class="mk">${rows}${mystery}</table>`;
    return;
  }

  if (pl.kind === "online") {
    const list = state.onlineListings;
    body.innerHTML = (list.length
      ? `<table class="mk">${list.map(l => `<tr><td class="nm">${esc(l.product)}<small>${l.days} day${l.days === 1 ? "" : "s"} listed</small></td><td class="pr">${money(l.price)}<small>×${l.quantity}</small></td></tr>`).join("")}</table>`
      : `<p class="empty">No listings yet. List boxes at your own price and they sell over the next few days, minus a 13% fee. Price near market and they move fast.</p>`)
      + `<button type="button" class="btn primary wide" onclick="openListingsSheet('online')">MANAGE LISTINGS</button>`;
    return;
  }

  // Your Shop
  if (!state.shopOpen) {
    const ready = state.money >= TCGRules.RULES.lease && !state.debt;
    body.innerHTML = `<p class="empty">This could be yours.<br><br>Lease: ${money(TCGRules.RULES.lease)} cash, no debt. Open it and rent stops, walk-ins buy every day, and you can stock your own shelves.<br><br>${ready ? "You're ready." : `You have ${money(state.money)}${state.debt ? ` and owe ${money(state.debt)}` : ""}.`}</p>
      <button type="button" class="btn primary wide" onclick="openShop()" ${ready ? "" : "disabled"}>OPEN SHOP (${money(TCGRules.RULES.lease)})</button>`;
    return;
  }
  const shelf = state.shopShelf;
  body.innerHTML = (shelf.length
    ? `<table class="mk">${shelf.map(l => `<tr><td class="nm">${esc(l.product)}<small>on shelf ${l.days} day${l.days === 1 ? "" : "s"}</small></td><td class="pr">${money(l.price)}<small>×${l.quantity}</small></td></tr>`).join("")}</table>`
    : `<p class="empty">Empty shelves. Stock boxes from your stash and set your price. No fees, and customers walk in every day.</p>`)
    + `<button type="button" class="btn primary wide" onclick="openListingsSheet('shop')">STOCK SHELVES</button>`;
}

// ---------------------------------------------------------------------------
// Sheets (overlays)
// ---------------------------------------------------------------------------
function openSheet(title, html) {
  $("sheet-title").textContent = title;
  $("sheet-body").innerHTML = html;
  $("sheet").hidden = false;
}
function closeSheet() { const s = $("sheet"); if (s) s.hidden = true; }
document.addEventListener("keydown", e => { if (e.key === "Escape") closeSheet(); });
document.addEventListener("click", e => { if (e.target && e.target.id === "sheet") closeSheet(); });

// "YOUR STUFF": everything the status bar summarizes.
function openStuffSheet() {
  const R = TCGRules.RULES;
  const onTheWay = p => state.deliveryQueue.filter(d => d.product === p).reduce((a, d) => a + d.quantity, 0);
  const listed = (list, p) => list.filter(l => l.product === p).reduce((a, l) => a + l.quantity, 0);
  const avg = p => { const c = state.costBasis && state.costBasis[p]; return c && c.qty > 0 ? money(c.total / c.qty) : "—"; };

  let goal;
  if (state.shopOpen) {
    goal = `<p>🏪 Shop opened Day ${state.shopDay}. No more rent.</p>
      <p>${state.grailBox ? `🏆 You pulled ${R.grailName} on box #${state.grailBox}.` : `🏆 Grail hunt: ${state.boxesRipped} boxes ripped, ${state.godPacks} god pack${state.godPacks === 1 ? "" : "s"}.`}</p>`;
  } else {
    const r = TCGRules.nextRent(state.day);
    const ready = state.money >= R.lease && !state.debt;
    goal = `<div class="kv"><span>Next rent</span><span>${money(r.amount)} on Day ${r.day}</span></div>
      <div class="kv"><span>Shop lease</span><span>${money(R.lease)} by Day ${R.mainDays}</span></div>
      <button type="button" class="btn primary wide" onclick="openShop(); closeSheet();" ${ready ? "" : "disabled"}>OPEN SHOP</button>`;
  }

  const rows = products.map(p => {
    const own = state.inventory[p] || 0, way = onTheWay(p), inList = listed(state.onlineListings, p) + listed(state.shopShelf, p);
    return `<tr><td>${esc(p)}${way ? `<br><small>+${way} on the way</small>` : ""}${inList ? `<br><small>${inList} listed</small>` : ""}</td>
      <td class="num">${own}</td><td class="num">${avg(p)}</td>
      <td class="num"><button type="button" class="btn tiny" onclick="ripBox(${jsArg(p)}); openStuffSheet();" ${own && !state.runOver ? "" : "disabled"}>RIP</button></td></tr>`;
  }).join("");

  openSheet("YOUR STUFF", `
    <div class="sheet-section">
      <div class="kv"><span>Cash</span><strong>${money(state.money)}</strong></div>
      <div class="kv"><span>Debt (${R.debtRate * 100}%/day)</span><span>${money(state.debt || 0)}</span></div>
      <div class="kv"><span>Net worth</span><span>${money(netWorth())}</span></div>
      <div class="btn-row">
        <button type="button" class="btn" onclick="payDebt(); openStuffSheet();" ${state.debt > 0 && state.money > 0 ? "" : "disabled"}>PAY OFF DEBT</button>
        <button type="button" class="btn" onclick="borrow(500); openStuffSheet();" ${(state.debt || 0) < R.borrowLimit - 50 && !state.runOver ? "" : "disabled"}>BORROW $500</button>
      </div>
      <p class="hint">The loan shark lends up to ${money(R.borrowLimit)}. Owe more than ${money(R.evictAt)} and you're evicted.</p>
    </div>
    <div class="sheet-section"><h3>${state.shopOpen ? "YOUR SHOP" : "RENT & SHOP GOAL"}</h3>${goal}</div>
    <div class="sheet-section"><h3>YOUR BOXES</h3>
      <table class="inv"><tr><th>Box</th><th class="num">Have</th><th class="num">Avg paid</th><th class="num"></th></tr>${rows}</table>
      <p class="hint">RIP opens a box: you get the singles' value back (usually less than you paid) and a shot at ${R.grailName}.</p>
    </div>
    <div class="sheet-section">
      <div class="btn-row">
        <button type="button" class="btn" onclick="openOddsSheet()">ODDS & RULES</button>
        <button type="button" class="btn" onclick="replayIntro()">REPLAY INTRO</button>
      </div>
      ${window.GAME_HOME ? `<p class="hint"><a href="${esc(window.GAME_HOME.url)}" style="color:inherit">${esc(window.GAME_HOME.label)} ↗</a></p>` : ""}
    </div>`);
}

function openListingsSheet(kind) {
  const v = venues[kind];
  const owned = products.filter(p => (state.inventory[p] || 0) > 0);
  const ref = p => market.price("The Marketplace", p);
  const form = owned.length ? `
    <div class="form-grid">
      <label class="full">BOX
        <select id="ls-product" onchange="lsPrefill('${kind}')">${owned.map(p => `<option value="${esc(p)}">${esc(p)} (have ${state.inventory[p]})</option>`).join("")}</select></label>
      <label>PRICE $<input id="ls-price" type="number" inputmode="numeric" min="1" step="1"></label>
      <label>QTY<input id="ls-qty" type="number" inputmode="numeric" min="1" step="1"></label>
    </div>
    <p class="hint" id="ls-hint"></p>
    <button type="button" class="btn primary wide" onclick="addListing('${kind}')">${v.verb}</button>`
    : `<p class="empty">Nothing in your stash to ${kind === "shop" ? "shelve" : "list"}. Buy some boxes first.</p>`;

  const list = v.list();
  const current = list.length ? `<table class="inv"><tr><th>Box</th><th class="num">Price</th><th class="num">Qty</th><th class="num">Days</th><th></th></tr>
    ${list.map((l, i) => `<tr><td>${esc(l.product)}</td>
      <td class="num"><input id="ls-p-${i}" type="number" inputmode="numeric" value="${l.price}"></td>
      <td class="num"><input id="ls-q-${i}" class="qty" type="number" inputmode="numeric" value="${l.quantity}"></td>
      <td class="num">${l.days}</td>
      <td class="num"><button type="button" class="btn tiny primary" onclick="saveListing('${kind}', ${i})">SAVE</button><br><button type="button" class="btn tiny" style="margin-top:3px" onclick="pullListing('${kind}', ${i})">PULL</button></td></tr>`).join("")}</table>
    <p class="hint">Change price or quantity and hit SAVE. Quantity 0 or PULL sends boxes back to your stash.</p>`
    : `<p class="empty">No ${v.noun}s yet.</p>`;

  openSheet(v.title, `
    <div class="sheet-section"><h3>ADD</h3>${form}</div>
    <div class="sheet-section"><h3>${kind === "shop" ? "ON YOUR SHELVES" : "YOUR LISTINGS"}</h3>${current}</div>
    <div class="sheet-section"><p class="hint">${kind === "shop"
      ? "No fees. Priced at market, most boxes sell within a day or two. Every 10% over market cuts the odds."
      : "13% platform fee. Priced at market, most boxes sell within a few days. Every 10% over market cuts the odds a lot."}</p></div>`);
  if (owned.length) lsPrefill(kind);
}
function lsPrefill(kind) {
  const p = $("ls-product").value;
  const ref = market.price("The Marketplace", p);
  $("ls-price").value = Math.round(ref * (kind === "shop" ? 1.12 : 1.1));
  $("ls-qty").value = state.inventory[p] || 1;
  $("ls-hint").textContent = `The Marketplace pays ${money(ref)} for ${p} today.`;
}

function openOddsSheet() {
  const R = TCGRules.RULES;
  const pct = x => (x * 100).toFixed(x < 0.01 ? 1 : 0) + "%";
  openSheet("ODDS & RULES", `
    <div class="sheet-section"><h3>RIPPING A BOX</h3>
      ${R.rip.map(([c, lo, hi], i) => `<div class="kv"><span>${["Bricked", "Decent", "Nice hits", "Monster box"][i]}</span><span>${pct(c)} · ${lo}–${hi}× paid</span></div>`).join("")}
      <div class="kv"><span>God pack</span><span>1 in ${Math.round(1 / R.godPackChance)} · ${R.godPackCashBack[0]}–${R.godPackCashBack[1]}×</span></div>
      <div class="kv"><span>${R.grailName}</span><span>1 in ${Math.round(R.grailDollarsPerPercent * 100 / 200)} per $200 box</span></div>
      <p class="hint">Pricier boxes give better Grail odds. A god pack multiplies that box's Grail odds by ${R.godPackGrailBoost}.</p></div>
    <div class="sheet-section"><h3>MYSTERY BOX</h3>
      ${R.mystery.map(([c, name]) => `<div class="kv"><span>${{ junk: "Junk", decent: "Decent", big: "Jackpot", god: "God pack", grail: R.grailName }[name]}</span><span>${pct(c)}</span></div>`).join("")}</div>
    <div class="sheet-section"><h3>MONEY</h3>
      <p>Rent every ${R.rentEvery} days: ${R.rentStepAfter ? `${R.rent.map(money).join(", ")}, then +${money(R.rentStepAfter)}/week` : `${money(R.rent[0])}, every week`}.</p>
      <p>Debt grows ${R.debtRate * 100}% a day. Evicted at ${money(R.evictAt)}.</p>
      <p>Shop lease: ${money(R.lease)} by Day ${R.mainDays}.</p></div>`);
}

function replayIntro() {
  if (confirm("Replaying the intro restarts your current run. Continue?")) location.href = location.pathname + "?intro=1";
}

// ---------------------------------------------------------------------------
// Start / restart
// ---------------------------------------------------------------------------
function playAgain() {
  $("leaderboard-modal").style.display = "none";
  playFree = true; // the Daily Market is one shot; replays are free play
  initializeGame();
}

function initializeGame() {
  gameStats = { totalBought: 0, totalSold: 0 };
  Object.assign(state, {
    day: 1, location: "Local Game Store", money: TCGRules.RULES.startCash,
    inventory: {}, deliveryQueue: [], onlineListings: [], shopShelf: []
  });
  resetProgress();
  products.forEach(p => (state.inventory[p] = 0));

  const run = seedForRun();
  market = TCGMarket.create(run.seed, {
    mysteryChance: TCGRules.RULES.mysteryChancePerDay,
    mysteryPrice: TCGRules.RULES.mysteryPrice
  });
  state.seed = market.seed;
  state.runLabel = run.label;
  const news = market.headlines();
  state.rumor = news.length ? news.join("\n") : "No news yet...";
  render();
  showModalNotification(
    `<p><strong>${run.label}</strong></p>
     <p>${money(TCGRules.RULES.startCash)}. ${TCGRules.RULES.mainDays} days. Raise ${money(TCGRules.RULES.lease)} and open your own card shop.</p>
     <p>Rent is due every 7 days. Watch the Feed.</p>`, "THE CARDBOARD FLIP");
}

window.onload = async () => {
  resetProgress(); // so the board the tutorial points at shows real numbers
  render();
  if (window.Intro && Intro.shouldPlay()) {
    try { await Intro.run(render); } catch (e) { console.error("Intro failed, starting game anyway:", e); }
  }
  initializeGame();
};
