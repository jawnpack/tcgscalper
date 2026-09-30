// cloud.js — accounts, cloud saves, leaderboard and purchases (Supabase).
// Everything is a no-op until js/config.js has a Supabase URL and key, so the
// game keeps working offline and on the current static site.

(function () {
  "use strict";
  const CFG = window.GAME_CONFIG || {};
  const enabled = !!(CFG.supabaseUrl && CFG.supabaseAnonKey);
  const SDK_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

  let sb = null, user = null;
  let owned = new Set();
  let catalog = (window.Themes && Themes.CATALOG) || [];
  const listeners = [];
  const emit = () => listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });

  const siteUrl = () => (CFG.siteUrl || (location.origin + location.pathname)).replace(/index\.html$/, "");

  async function init() {
    if (!enabled) return;
    try {
      const createClient = window.__createSupabaseClient || (await import(SDK_URL)).createClient;
      sb = createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, { auth: { persistSession: true, detectSessionInUrl: true } });
      const { data } = await sb.auth.getSession();
      user = data.session ? data.session.user : null;
      sb.auth.onAuthStateChange((_event, session) => {
        const was = user && user.id;
        user = session ? session.user : null;
        if ((user && user.id) !== was) refresh().then(emit);
      });
      await refresh();
    } catch (e) {
      console.error("Cloud init failed; playing offline.", e);
      sb = null;
    }
    emit();
  }

  async function refresh() {
    if (!sb) return;
    const { data: prods } = await sb.from("products").select("id, kind, name, description, price_cents, stripe_price_id, apple_product_id").order("sort");
    if (prods && prods.length) catalog = prods;
    owned = new Set();
    if (user) {
      const { data } = await sb.from("entitlements").select("product_id");
      (data || []).forEach(r => owned.add(r.product_id));
    }
  }

  async function call(fn, body) {
    if (!sb) throw new Error("Accounts aren't switched on yet.");
    const { data, error } = await sb.functions.invoke(fn, { body });
    if (error) {
      let msg = error.message;
      try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch (e) {}
      throw new Error(msg);
    }
    return data;
  }

  const Cloud = {
    enabled,
    get ready() { return !!sb; },
    get user() { return user; },
    get owned() { return owned; },
    get catalog() { return catalog; },
    onChange(fn) { listeners.push(fn); },
    init,

    // ---- sign in / out ----
    async signInEmail(email) {
      if (!sb) throw new Error("Accounts aren't switched on yet.");
      const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: siteUrl() } });
      if (error) throw error;
    },
    async signInOAuth(provider) {
      if (!sb) throw new Error("Accounts aren't switched on yet.");
      const { error } = await sb.auth.signInWithOAuth({ provider, options: { redirectTo: siteUrl() } });
      if (error) throw error;
    },
    async signOut() { if (sb) await sb.auth.signOut(); user = null; owned = new Set(); emit(); },
    async deleteAccount() {
      await call("delete-account", {});
      await sb.auth.signOut();
      user = null; owned = new Set(); emit();
    },

    // ---- saves (one active run per player) ----
    async loadSave() {
      if (!sb || !user) return null;
      const { data } = await sb.from("saves").select("state, updated_at").eq("user_id", user.id).maybeSingle();
      return data ? data.state : null;
    },
    async saveGame(snapshot) {
      if (!sb || !user) return;
      await sb.from("saves").upsert({ user_id: user.id, state: snapshot, version: snapshot.v, day: snapshot.state.day, updated_at: new Date().toISOString() });
    },
    async clearSave() { if (sb && user) await sb.from("saves").delete().eq("user_id", user.id); },

    // ---- leaderboard ----
    submitRun(payload) { return call("submit-run", payload); },
    async leaderboard(kind, board) {
      if (!sb) return null;
      const view = { daily: "board_daily", grail: "board_grail", networth: "board_networth" }[kind];
      let q = sb.from(view).select("*").order("place").limit(25);
      if (kind === "daily") q = q.eq("board", board);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },

    // ---- purchases ----
    // Web: Stripe Checkout. In the iOS/Android app, a native bridge (RevenueCat)
    // handles the purchase and the webhook grants the same entitlement.
    async buy(productId) {
      if (window.NativeStore && window.NativeStore.purchase) {
        await window.NativeStore.purchase(productId);
        await refresh(); emit();
        return;
      }
      const { url } = await call("stripe-checkout", { product_id: productId, return_url: siteUrl() });
      if (url) location.href = url;
    },
    async restore() {
      if (window.NativeStore && window.NativeStore.restore) await window.NativeStore.restore();
      await refresh(); emit();
    },
    async refreshEntitlements() { await refresh(); emit(); }
  };

  window.Cloud = Cloud;
})();
