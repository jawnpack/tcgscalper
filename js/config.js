// config.js — the only file you edit to connect the game to its backend.
// Everything here is safe to publish: the Supabase anon key is designed to be
// public (row-level security protects the data). Leave a value blank and that
// feature simply stays off; the game still plays fully offline.
window.GAME_CONFIG = {
  supabaseUrl: "",       // e.g. "https://abcdxyz.supabase.co"   (Supabase > Project Settings > API)
  supabaseAnonKey: "",   // the "anon public" key                   (same page)
  siteUrl: "",           // your live URL, e.g. "https://yourgame.io" (used for sign-in and checkout redirects)
  adsenseClient: "",     // e.g. "ca-pub-1234567890"  — blank = no ads anywhere
  adsenseSlot: "",       // the ad unit id for the banner slot
  storeEnabled: false    // flip to true once Stripe prices are filled in (see SETUP.md)
};
