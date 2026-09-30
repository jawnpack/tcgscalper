// save.js — autosave + resume. Every run is saved on this device automatically
// (so a refresh never loses progress), and to the player's account when signed
// in, so they can pick it up on phone or desktop. Newest save wins.

(function () {
  "use strict";
  const KEY = "tcgscalper.save.v1";
  const VERSION = 1;
  let cloudTimer = null;

  function boardFor(seed) {
    if (/^daily-\d{4}-\d{2}-\d{2}$/.test(seed)) return seed;
    return seedFromUrl() ? "challenge" : "free";
  }

  function snapshot() {
    return {
      v: VERSION,
      savedAt: Date.now(),
      seed: state.seed,
      runLabel: state.runLabel,
      playFree: typeof playFree !== "undefined" ? playFree : false,
      state: JSON.parse(JSON.stringify(state)),
      gameStats: { ...gameStats },
      market: market.snapshot()
    };
  }

  function readLocal() {
    try { const s = JSON.parse(localStorage.getItem(KEY)); return s && s.v === VERSION ? s : null; } catch (e) { return null; }
  }

  // Save now (this device) and soon (account). Skips finished runs.
  function save() {
    if (!state.seed) return;
    if (state.runOver) { clear(); return; }
    const snap = snapshot();
    try { localStorage.setItem(KEY, JSON.stringify(snap)); } catch (e) {}
    if (window.Cloud && Cloud.user) {
      clearTimeout(cloudTimer);
      cloudTimer = setTimeout(() => Cloud.saveGame(snap).catch(e => console.warn("Cloud save failed", e)), 1500);
    }
  }
  function flush() {
    if (!state.seed || state.runOver) return;
    const snap = snapshot();
    try { localStorage.setItem(KEY, JSON.stringify(snap)); } catch (e) {}
    if (window.Cloud && Cloud.user) { clearTimeout(cloudTimer); Cloud.saveGame(snap).catch(() => {}); }
  }
  function clear() {
    try { localStorage.removeItem(KEY); } catch (e) {}
    if (window.Cloud && Cloud.user) Cloud.clearSave().catch(() => {});
  }

  function restore(snap) {
    playFree = !!snap.playFree;
    market = TCGMarket.create(snap.seed, {
      mysteryChance: TCGRules.RULES.mysteryChancePerDay,
      mysteryPrice: TCGRules.RULES.mysteryPrice
    });
    market.restore(snap.market);
    Object.keys(state).forEach(k => delete state[k]);
    Object.assign(state, snap.state);
    gameStats = { ...snap.gameStats };
    render();
  }

  // Newest unfinished save across this device and the account.
  async function newest() {
    const local = readLocal();
    let cloud = null;
    if (window.Cloud && Cloud.user) { try { cloud = await Cloud.loadSave(); } catch (e) {} }
    const ok = s => s && s.v === VERSION && s.state && !s.state.runOver;
    const cands = [local, cloud].filter(ok).sort((a, b) => b.savedAt - a.savedAt);
    return cands[0] ? { snap: cands[0], fromCloud: cands[0] === cloud && cloud !== local } : null;
  }

  // Save whenever the player leaves the page (covers mid-day buys and sells).
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
  window.addEventListener("pagehide", flush);

  window.Saves = { save, flush, clear, restore, newest, readLocal, boardFor, KEY };
})();
