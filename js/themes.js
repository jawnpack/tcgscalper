// themes.js — night mode, custom colors (Premium) and theme packs (sold separately).
// A "look" is just a set of CSS variables applied to <body>; gamestyle.css draws
// everything from those variables, so a new pack is a new entry in PACKS.

(function () {
  "use strict";
  const LOOK_KEY = "tcgscalper.look";

  // Offline copy of the store catalog. The live catalog (prices, what's for sale)
  // comes from the products table; ids must match.
  const CATALOG = [
    { id: "premium", kind: "premium", name: "Premium", price_cents: 499, description: "No ads, night mode, and custom colors. One-time purchase." },
    { id: "pack_arcade", kind: "theme_pack", name: "Arcade Pack", price_cents: 199, description: "Neon on black, straight out of a 90s arcade." },
    { id: "pack_handheld", kind: "theme_pack", name: "Handheld Pack", price_cents: 199, description: "Four shades of green, like the old pocket consoles." },
    { id: "pack_cardshop", kind: "theme_pack", name: "Card Shop Pack", price_cents: 199, description: "Warm wood counters and cream price tags." },
    { id: "pack_holo", kind: "theme_pack", name: "Holo Pack", price_cents: 199, description: "Shimmering pastels, like a fresh holo pull." }
  ];

  const NIGHT = { "--bg": "#0e0e0e", "--ink": "#f1f1f1", "--muted": "#9b9b9b", "--line": "#f1f1f1", "--panel": "#171717", "--accent": "#f1f1f1", "--accent-ink": "#0e0e0e", "--soft": "#262626" };

  const PACKS = {
    pack_arcade:   { "--bg": "#07070f", "--ink": "#e9f6ff", "--muted": "#8a93b8", "--line": "#29f0ff", "--panel": "#0f0f22", "--accent": "#ff2bd6", "--accent-ink": "#07070f", "--soft": "#1b1440" },
    pack_handheld: { "--bg": "#9bbc0f", "--ink": "#0f380f", "--muted": "#306230", "--line": "#0f380f", "--panel": "#8bac0f", "--accent": "#306230", "--accent-ink": "#9bbc0f", "--soft": "#8bac0f" },
    pack_cardshop: { "--bg": "#f6ecd9", "--ink": "#3b2616", "--muted": "#8a6a4b", "--line": "#5b3a22", "--panel": "#fffaf0", "--accent": "#7a4a26", "--accent-ink": "#fff4e2", "--soft": "#efdfc2" },
    pack_holo:     { "--bg": "#fbf7ff", "--ink": "#2b2140", "--muted": "#7d6f9c", "--line": "#6a5acd", "--panel": "#ffffff", "--accent": "#8f6cf0", "--accent-ink": "#ffffff", "--soft": "#e8f7ff" }
  };

  const ALL_VARS = Object.keys(NIGHT);

  function readLook() {
    try { return JSON.parse(localStorage.getItem(LOOK_KEY)) || {}; } catch (e) { return {}; }
  }
  function writeLook(look) {
    try { localStorage.setItem(LOOK_KEY, JSON.stringify(look)); } catch (e) {}
  }

  // Pick readable text for a background color.
  function inkFor(hex) {
    const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? "#000000" : "#ffffff";
  }

  // Apply the saved look, but only the parts this player owns.
  function apply(owned) {
    const look = readLook(), body = document.body;
    const premium = owned.has("premium");
    ALL_VARS.forEach(v => body.style.removeProperty(v));
    body.classList.remove("night");
    let vars = null;
    if (look.pack && owned.has(look.pack) && PACKS[look.pack]) vars = PACKS[look.pack];
    else if (premium && look.custom && look.custom.accent) {
      const bg = look.custom.bg || "#ffffff", accent = look.custom.accent;
      const ink = inkFor(bg);
      vars = { "--bg": bg, "--panel": bg, "--ink": ink, "--line": ink, "--muted": ink === "#000000" ? "#555555" : "#bbbbbb", "--accent": accent, "--accent-ink": inkFor(accent), "--soft": ink === "#000000" ? "#00000014" : "#ffffff1f" };
    } else if (premium && look.night) {
      vars = NIGHT;
      body.classList.add("night");
    }
    if (vars) Object.entries(vars).forEach(([k, v]) => body.style.setProperty(k, v));
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = vars ? vars["--accent"] : "#000000";
    return { premium, look };
  }

  window.Themes = { CATALOG, PACKS, NIGHT, readLook, writeLook, apply, inkFor };
})();
