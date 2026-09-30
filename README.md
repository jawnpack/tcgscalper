# TCG Scalper

A text-based, Drug Wars-style trading card reseller game. $1,500, 30 days: read the rumors, flip the hype, and open your own card shop. Then hunt for THE GRAIL.

**Play:** https://jawnpack.github.io/tcgscalper/

- `?seed=anything` replays an exact market (challenge a friend)
- `?intro=1` replays the intro and tutorial

## Files
- `js/market.js` – seeded market + rumor engine (prices, events, headlines)
- `js/rules.js` – rent, debt, shop lease, ripping, Grail odds (all tuning numbers)
- `js/progress.js` – shop goal, ripping, mystery boxes, Grail post-game, share cards
- `js/intro.js` – intro script and tutorial
- `js/game.js` – UI (status bar, places, counter, sheets) and the day loop
- `js/config.js` – backend keys (blank = offline mode). See **SETUP.md**
- `js/cloud.js`, `js/save.js`, `js/menu.js`, `js/themes.js` – accounts, cloud saves + autosave, leaderboard, store, night mode / colors / theme packs
- `supabase/` – database schema with row-level security, Edge Functions (Stripe checkout + webhook, RevenueCat webhook, leaderboard submit, account deletion)
- `css/gamestyle.css` – black & white theme; per-location palettes ready (add `class="color"` to `<body>`)
- `tools/skill-study.js` – 7 player types x N seeded markets (`node tools/skill-study.js 1000`); `tools/grail-odds.js`
