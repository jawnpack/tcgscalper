# TCG Scalper

A text-based, Drug Wars-style trading card reseller game. $1,000, 30 days: read the rumors, flip the hype, and open your own card shop. Then hunt for THE GRAIL.

**Play:** https://jawnpack.github.io/tcgscalper/

- `?seed=anything` replays an exact market (challenge a friend)
- `?intro=1` replays the intro and tutorial

## Files
- `js/market.js` – seeded market + rumor engine (prices, events, headlines)
- `js/rules.js` – rent, debt, shop lease, ripping, Grail odds (all tuning numbers)
- `js/progress.js` – shop goal, ripping, mystery boxes, Grail post-game, share cards
- `js/intro.js` – intro script and tutorial
- `js/game.js` – UI and day loop
- `tools/simulate.js`, `tools/grail-odds.js` – balance simulators (`node tools/simulate.js`)
