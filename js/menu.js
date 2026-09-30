// menu.js — MENU (account, leaderboard, look, store), shop naming,
// leaderboard submissions and the ad slot. UI only; data lives in cloud.js.

(function () {
  "use strict";
  const CFG = window.GAME_CONFIG || {};
  const NAME_OK = /^[A-Za-z0-9 '&.!\-]{2,24}$/;
  const SUGGESTIONS = ["Top Deck Cards", "Mint Condition", "Pack Attack", "The Binder Nook", "Holo Haven", "Sleeve & Save", "Rare Finds", "Booster Barn"];
  const money = n => "$" + Math.round(n).toLocaleString();
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const price = c => "$" + (c / 100).toFixed(2);
  const owns = id => window.Cloud && Cloud.owned.has(id);
  const premium = () => owns("premium");

  // -------------------------------------------------------------------------
  // Look (night mode, custom colors, packs) + ads
  // -------------------------------------------------------------------------
  function applyLook() {
    Themes.apply(window.Cloud ? Cloud.owned : new Set());
    renderAds();
  }

  let adsLoaded = false;
  function renderAds() {
    const slot = $("ad-slot");
    if (!slot) return;
    const show = !!(CFG.adsenseClient && CFG.adsenseSlot) && !premium();
    slot.hidden = !show;
    if (!show || adsLoaded) return;
    adsLoaded = true;
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(CFG.adsenseClient)}`;
    s.crossOrigin = "anonymous";
    document.head.appendChild(s);
    slot.innerHTML = `<ins class="adsbygoogle" style="display:block" data-ad-client="${esc(CFG.adsenseClient)}" data-ad-slot="${esc(CFG.adsenseSlot)}" data-ad-format="horizontal" data-full-width-responsive="true"></ins>`;
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  }

  // -------------------------------------------------------------------------
  // MENU
  // -------------------------------------------------------------------------
  function accountHtml() {
    if (!Cloud.enabled || !Cloud.ready) {
      return `<p>Accounts are coming soon. Your run already saves on this device automatically.</p>`;
    }
    if (Cloud.user) {
      const who = Cloud.user.email || "your account";
      return `<p>Signed in as <strong>${esc(who)}</strong>. Your run saves to your account, so you can continue on any device.</p>
        <div class="btn-row">
          <button type="button" class="btn" onclick="Menu.signOut()">SIGN OUT</button>
          <button type="button" class="btn" onclick="Menu.deleteAccount()">DELETE ACCOUNT</button>
        </div>`;
    }
    return `<p>Sign up to save your run across phone and desktop, and to put your shop on the leaderboard.</p>
      <div class="form-grid">
        <label class="full">EMAIL<input id="acct-email" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com"></label>
      </div>
      <button type="button" class="btn primary wide" onclick="Menu.emailLink()">EMAIL ME A SIGN-IN LINK</button>
      <div class="btn-row">
        <button type="button" class="btn" onclick="Menu.oauth('apple')">SIGN IN WITH APPLE</button>
        <button type="button" class="btn" onclick="Menu.oauth('google')">SIGN IN WITH GOOGLE</button>
      </div>`;
  }

  function lookHtml() {
    const look = Themes.readLook(), prem = premium();
    const packs = Cloud.catalog.filter(p => p.kind === "theme_pack");
    const ownedPacks = packs.filter(p => owns(p.id));
    const lock = prem ? "" : " 🔒";
    return `
      <div class="kv"><span>Night mode${lock}</span>
        <button type="button" class="btn tiny${look.night && prem ? " primary" : ""}" onclick="Menu.toggleNight()">${look.night && prem ? "ON" : "OFF"}</button></div>
      <div class="kv"><span>Custom colors${lock}</span>
        <span><input type="color" id="c-accent" value="${esc((look.custom && look.custom.accent) || "#000000")}" ${prem ? "" : "disabled"} aria-label="Accent color">
        <input type="color" id="c-bg" value="${esc((look.custom && look.custom.bg) || "#ffffff")}" ${prem ? "" : "disabled"} aria-label="Background color">
        <button type="button" class="btn tiny" onclick="Menu.setCustom()" ${prem ? "" : "disabled"}>USE</button></span></div>
      <div class="kv"><span>Theme pack</span>
        <select id="pack-pick" onchange="Menu.setPack(this.value)" ${ownedPacks.length ? "" : "disabled"}>
          <option value="">Default</option>
          ${ownedPacks.map(p => `<option value="${p.id}" ${look.pack === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}
        </select></div>
      ${prem ? "" : `<p class="hint">🔒 = Premium. Theme packs are sold separately in the store.</p>`}`;
  }

  function openMenu() {
    openSheet("MENU", `
      <div class="sheet-section"><h3>ACCOUNT</h3>${accountHtml()}</div>
      <div class="sheet-section"><h3>PLAY</h3>
        <div class="btn-row">
          <button type="button" class="btn primary" onclick="Menu.openLeaderboard('daily')">LEADERBOARD</button>
          <button type="button" class="btn primary" onclick="Menu.openStore()">STORE</button>
        </div></div>
      <div class="sheet-section"><h3>LOOK</h3>${lookHtml()}</div>
      <div class="sheet-section">
        <div class="btn-row">
          <button type="button" class="btn" onclick="openOddsSheet()">ODDS & RULES</button>
          <button type="button" class="btn" onclick="replayIntro()">REPLAY INTRO</button>
          <button type="button" class="btn" onclick="Menu.newGame()">NEW GAME</button>
        </div></div>`);
  }

  // -------------------------------------------------------------------------
  // Store
  // -------------------------------------------------------------------------
  function openStore() {
    const live = Cloud.ready && CFG.storeEnabled;
    const signedIn = !!Cloud.user;
    const items = Cloud.catalog.map(p => {
      const have = owns(p.id);
      const swatch = Themes.PACKS[p.id] ? `<span class="swatch" style="background:${Themes.PACKS[p.id]["--bg"]};border-color:${Themes.PACKS[p.id]["--line"]}"><i style="background:${Themes.PACKS[p.id]["--accent"]}"></i></span>` : "";
      const btn = have ? `<button type="button" class="btn tiny" disabled>OWNED</button>`
        : !live ? `<button type="button" class="btn tiny" disabled>SOON</button>`
        : !signedIn ? `<button type="button" class="btn tiny" onclick="Menu.openMenu()">SIGN IN</button>`
        : `<button type="button" class="btn tiny primary" onclick="Menu.buy('${p.id}')">${price(p.price_cents)}</button>`;
      return `<div class="store-item">${swatch}<div><strong>${esc(p.name)}</strong>${have ? "" : ` · ${price(p.price_cents)}`}<br><small>${esc(p.description || "")}</small></div>${btn}</div>`;
    }).join("");
    openSheet("STORE", `
      <div class="sheet-section">${items}</div>
      <div class="sheet-section">
        <p class="hint">${live ? "Purchases belong to your account and work on web and mobile." : "The store opens soon. Anything you buy will belong to your account and work on web and mobile."}</p>
        ${live && signedIn ? `<button type="button" class="btn" onclick="Menu.restore()">RESTORE PURCHASES</button>` : ""}
      </div>`);
  }

  // -------------------------------------------------------------------------
  // Leaderboard
  // -------------------------------------------------------------------------
  async function openLeaderboard(tab = "daily") {
    const board = state.board && state.board.startsWith("daily-") ? state.board : "daily-" + todayKey();
    const tabs = [["daily", "TODAY"], ["grail", "GRAIL"], ["networth", "NET WORTH"]].map(([k, l]) =>
      `<button type="button" class="btn tiny${k === tab ? " primary" : ""}" onclick="Menu.openLeaderboard('${k}')">${l}</button>`).join("");
    openSheet("LEADERBOARD", `<div class="btn-row">${tabs}</div><div class="sheet-section" id="lb-body"><p class="empty">Loading…</p></div>`);
    const body = $("lb-body");
    if (!Cloud.ready) { body.innerHTML = `<p class="empty">Leaderboards switch on when accounts launch. Open your shop and it'll be ready to post.</p>`; return; }
    try {
      const rows = await Cloud.leaderboard(tab, board);
      if (!rows.length) { body.innerHTML = `<p class="empty">No shops on this board yet. Be the first.</p>`; return; }
      const col = tab === "daily" ? r => `Day ${r.shop_day}` : tab === "grail" ? r => `Box #${r.grail_box}` : r => money(r.net_worth);
      body.innerHTML = `<table class="inv"><tr><th>#</th><th>Shop</th><th class="num">${tab === "daily" ? "Opened" : tab === "grail" ? "Grail" : "Net worth"}</th></tr>
        ${rows.map(r => `<tr${state.shopName && r.shop_name === state.shopName ? ' class="me"' : ""}><td>${r.place}</td><td>${esc(r.shop_name)}</td><td class="num">${col(r)}</td></tr>`).join("")}</table>
        ${tab === "daily" ? `<p class="hint">Today's Daily Market: fastest shop open wins, net worth breaks ties. One ranked run per player per day.</p>` : ""}`;
    } catch (e) {
      body.innerHTML = `<p class="empty">Couldn't load the leaderboard. ${esc(e.message)}</p>`;
    }
  }

  async function submit(kind) {
    if (!state.shopName || !state.seed) return;
    if (!Cloud.ready || !Cloud.user) { state.pendingSubmit = true; return; }
    const payload = {
      board: state.board || Saves.boardFor(state.seed), seed: state.seed, shop_name: state.shopName,
      shop_day: state.shopDay || null,
      grail_box: state.grailBox || null, grail_day: state.grailDay || null,
      net_worth: Math.round(netWorth()), days_played: Math.max(1, state.netWorthHistory.length),
      rank: TCGRules.rankFor({ evicted: state.evicted, shopDay: state.shopDay, grailBox: state.grailBox, netWorth: netWorth() })
    };
    try {
      const r = await Cloud.submitRun(payload);
      state.pendingSubmit = false;
      if (kind === "shop" && r && r.place) showNotification(`🏆 ${esc(r.shop_name)} is #${r.place} on today's board!`);
    } catch (e) {
      showNotification(`Leaderboard: ${esc(e.message)}`, "error");
    }
  }

  // -------------------------------------------------------------------------
  // Shop naming (every time you make lease)
  // -------------------------------------------------------------------------
  function askShopName(done) {
    const pick = SUGGESTIONS[Math.floor(Math.random() * SUGGESTIONS.length)];
    openSheet("NAME YOUR SHOP", `
      <div class="sheet-section">
        <p>You made lease! What's the sign over the door?</p>
        <div class="form-grid"><label class="full">SHOP NAME<input id="shop-name" maxlength="24" value="${esc(state.shopName || pick)}" autocomplete="off"></label></div>
        <p class="hint" id="shop-name-hint">2–24 letters, numbers, spaces or ' & . ! -. It shows on the leaderboard, so keep it family friendly.</p>
        <button type="button" class="btn primary wide" id="shop-name-go">OPEN THE DOORS</button>
      </div>`, () => { if (!state.shopName) state.shopName = pick; done(); });
    const input = $("shop-name");
    const go = () => {
      const name = input.value.trim().replace(/\s+/g, " ");
      if (!NAME_OK.test(name)) { $("shop-name-hint").textContent = "Use 2–24 letters, numbers, spaces or ' & . ! -"; input.focus(); return; }
      state.shopName = name;
      closeSheet(); // runs done() via the sheet's close callback
    };
    $("shop-name-go").onclick = go;
    input.onkeydown = e => { if (e.key === "Enter") go(); };
    setTimeout(() => { input.focus(); input.select(); }, 50);
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------
  const Menu = {
    openMenu, openStore, openLeaderboard, askShopName, submit, applyLook, renderAds,
    async emailLink() {
      const email = ($("acct-email") || {}).value || "";
      if (!/^\S+@\S+\.\S+$/.test(email)) return showNotification("Enter a valid email.", "error");
      Saves.flush();
      try { await Cloud.signInEmail(email.trim()); showNotification("Check your email for a sign-in link. Your run is saved."); }
      catch (e) { showNotification(esc(e.message), "error"); }
    },
    async oauth(provider) {
      Saves.flush();
      try { await Cloud.signInOAuth(provider); } catch (e) { showNotification(esc(e.message), "error"); }
    },
    async signOut() { Saves.flush(); await Cloud.signOut(); applyLook(); openMenu(); showNotification("Signed out. Your run is still saved on this device."); },
    async deleteAccount() {
      if (!confirm("Delete your account? This permanently removes your saves, leaderboard entries and purchases.")) return;
      if (!confirm("Last check: this can't be undone. Delete everything?")) return;
      try { await Cloud.deleteAccount(); applyLook(); closeSheet(); showNotification("Your account and its data were deleted."); }
      catch (e) { showNotification(esc(e.message), "error"); }
    },
    async buy(id) {
      Saves.flush();
      try { await Cloud.buy(id); applyLook(); } catch (e) { showNotification(esc(e.message), "error"); }
    },
    async restore() {
      try { await Cloud.restore(); applyLook(); openStore(); showNotification("Purchases restored."); }
      catch (e) { showNotification(esc(e.message), "error"); }
    },
    toggleNight() {
      if (!premium()) return openStore();
      const look = Themes.readLook();
      look.night = !look.night; look.custom = null; look.pack = look.night ? null : look.pack;
      Themes.writeLook(look); applyLook(); openMenu();
    },
    setCustom() {
      if (!premium()) return openStore();
      const look = Themes.readLook();
      look.custom = { accent: $("c-accent").value, bg: $("c-bg").value }; look.night = false; look.pack = null;
      Themes.writeLook(look); applyLook(); openMenu();
    },
    setPack(id) {
      const look = Themes.readLook();
      look.pack = id && owns(id) ? id : null;
      if (look.pack) { look.night = false; look.custom = null; }
      Themes.writeLook(look); applyLook();
    },
    newGame() {
      if (!state.runOver && !confirm("Start a new game? Your current run will be lost.")) return;
      Saves.clear(); closeSheet(); playFree = true; initializeGame();
    }
  };
  window.Menu = Menu;
  window.openMenu = openMenu;

  // Back from Stripe Checkout: wait for the webhook to grant the item.
  async function handlePurchaseReturn() {
    const params = new URLSearchParams(location.search);
    const status = params.get("purchase");
    if (!status) return;
    const product = params.get("product");
    params.delete("purchase"); params.delete("product");
    history.replaceState(null, "", location.pathname + (params.toString() ? "?" + params : "") + location.hash);
    if (status !== "success") return showNotification("Purchase canceled. You weren't charged.");
    for (let i = 0; i < 6; i++) {
      await Cloud.refreshEntitlements();
      if (!product || owns(product)) break;
      await new Promise(r => setTimeout(r, 2000));
    }
    applyLook();
    showNotification(owns(product) ? "Thanks! Your purchase is unlocked on every device." : "Payment received. It can take a minute to unlock; reopen the store to check.");
  }
  Menu.handlePurchaseReturn = handlePurchaseReturn;

  window.Cloud && Cloud.onChange(() => {
    applyLook();
    if (state.pendingSubmit && Cloud.user) submit("resume");
  });
})();
