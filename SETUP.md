# Switching on accounts, saves, leaderboard and the store

Everything is already built into the game. It stays in offline mode (local autosave only,
store and leaderboard "coming soon") until you fill in `js/config.js`. Do these in order;
each step works on its own, so you can stop after any of them.

Time: about 1–2 hours for steps 1–5. Cost: $0 until real traffic (Supabase free tier,
Stripe takes a fee only per sale). Vercel Pro ($20/mo) is required once you sell anything.

---

## 1. Name + domain
Pick the final name, then buy the domain (see the launch doc for options).
Everything below uses `https://YOURGAME.io` as a placeholder.

## 2. Supabase (accounts, saves, leaderboard)
1. Create a **new organization** at supabase.com (keeps the game fully separate from Binder Grail), then a new project inside it.
2. **SQL Editor → New query**: paste all of `supabase/migrations/20260930000000_init.sql` and run it.
   (Or with the CLI: `supabase link --project-ref <ref>` then `supabase db push`.)
3. **Authentication → URL Configuration**
   - Site URL: `https://YOURGAME.io`
   - Redirect URLs: `https://YOURGAME.io/**` and `http://localhost:8766/**` (for testing)
4. **Authentication → Providers**
   - Email: on (magic links; no passwords to manage).
   - Google: create an OAuth client in Google Cloud Console (Web), paste the client ID/secret.
   - Apple: needs the Apple Developer Program ($99/yr). Required before the iPhone app ships
     if Google sign-in is offered there. Fine to add later for the web.
5. **Project Settings → API**: copy the Project URL and the `anon` public key into `js/config.js`
   (`supabaseUrl`, `supabaseAnonKey`) and set `siteUrl` to `https://YOURGAME.io`.

At this point sign-in, cross-device saves and leaderboard *reading* work.

## 3. Server functions (leaderboard posting, purchases, account deletion)
```bash
npm i -g supabase            # or: brew install supabase/tap/supabase
supabase login
supabase link --project-ref <your-project-ref>
supabase secrets set SITE_URL=https://YOURGAME.io ALLOWED_ORIGIN=https://YOURGAME.io
supabase functions deploy submit-run
supabase functions deploy delete-account
```
Now shops post to the leaderboard and players can delete their accounts.

## 4. Stripe (Premium + theme packs on the web)
1. In Stripe (test mode first), create five **one-time** products and prices:
   Premium $4.99 · Arcade Pack $1.99 · Handheld Pack $1.99 · Card Shop Pack $1.99 · Holo Pack $1.99.
2. Copy each **price ID** (`price_...`) into the catalog (SQL Editor):
   ```sql
   update products set stripe_price_id = 'price_...' where id = 'premium';
   update products set stripe_price_id = 'price_...' where id = 'pack_arcade';
   update products set stripe_price_id = 'price_...' where id = 'pack_handheld';
   update products set stripe_price_id = 'price_...' where id = 'pack_cardshop';
   update products set stripe_price_id = 'price_...' where id = 'pack_holo';
   ```
3. **Developers → Webhooks → Add endpoint**
   - URL: `https://<project-ref>.supabase.co/functions/v1/stripe-webhook`
   - Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`
4. Set the secrets and deploy:
   ```bash
   supabase secrets set STRIPE_SECRET_KEY=sk_test_... STRIPE_WEBHOOK_SECRET=whsec_...
   supabase functions deploy stripe-checkout
   supabase functions deploy stripe-webhook
   ```
5. In `js/config.js` set `storeEnabled: true`.
6. Test with card `4242 4242 4242 4242`, any future date, any CVC. The item should unlock
   within a few seconds and show as OWNED on another device after signing in.
7. When it all works, repeat 1–4 with live keys (`sk_live_...`, new live webhook secret).

Refunds: refunding in Stripe removes the item automatically (`charge.refunded`).

## 5. Vercel (hosting)
1. New Project → import `jawnpack/tcgscalper` → Framework preset **Other**, no build command,
   output directory `.` (root). It's a static site; `vercel.json` adds security headers.
2. Add your domain in **Settings → Domains** and point DNS as Vercel instructs.
3. Keep GitHub Pages as a backup or turn it off once the domain is live.

## 6. Ads (optional; Premium removes them)
Apply for Google AdSense once the site is live with the game on it. When approved, create a
responsive display ad unit and put `adsenseClient` (`ca-pub-...`) and `adsenseSlot` in
`js/config.js`. Add the `ads.txt` line AdSense gives you to the site root.
The banner only renders for players without Premium.

## 7. iPhone / Android app (later — see the launch doc)
Purchases in the app go through Apple/Google via RevenueCat, and land in the **same**
`entitlements` table, so everything owned works on web and mobile.
1. In App Store Connect create non-consumable in-app purchases with ids, then:
   `update products set apple_product_id = 'com.yourgame.premium' where id = 'premium';` (etc.)
2. In RevenueCat: set the app user ID to the Supabase user id at sign-in
   (`Purchases.logIn(user.id)`), add a webhook to
   `https://<project-ref>.supabase.co/functions/v1/revenuecat-webhook` with an Authorization
   header value `Bearer <long random string>`, then:
   ```bash
   supabase secrets set REVENUECAT_WEBHOOK_AUTH=<same long random string>
   supabase functions deploy revenuecat-webhook
   ```
3. In the Capacitor app, expose `window.NativeStore = { purchase(productId), restore() }`
   backed by RevenueCat; the game's store uses it automatically instead of Stripe.

## Before charging real money
- Privacy policy + terms pages (required by Stripe, Apple and AdSense).
- A support email in the footer.
- Stripe account verified; payouts set up.

## Local testing
```bash
python3 -m http.server 8766          # then open http://localhost:8766/main.html
node tools/skill-study.js 1000       # balance study
deno test --allow-env supabase/functions/_shared/shared_test.ts   # function unit tests
```
