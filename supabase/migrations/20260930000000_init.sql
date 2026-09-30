-- TCG Scalper (working name) — initial schema.
-- Standalone Supabase project for the game only.
--
-- Security model:
--   * Players read/write ONLY their own profile and save (row-level security).
--   * Leaderboard rows and entitlements are written ONLY by server functions
--     (service role), never by the browser. Everyone can read the leaderboard.
--   * Deleting a user (auth.users) cascades to every table here.

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 2 and 24),
  created_at   timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "own profile: read"   on public.profiles for select using (auth.uid() = id);
create policy "own profile: update" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- Create a profile row whenever someone signs up.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Saved game (one active run per player; synced across web and mobile)
-- ---------------------------------------------------------------------------
create table public.saves (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  state      jsonb not null,                 -- the full game snapshot (see js/save.js)
  version    int  not null default 1,        -- snapshot format version
  day        int,                            -- denormalized for quick display
  updated_at timestamptz not null default now()
);
alter table public.saves enable row level security;
create policy "own save: read"   on public.saves for select using (auth.uid() = user_id);
create policy "own save: insert" on public.saves for insert with check (auth.uid() = user_id);
create policy "own save: update" on public.saves for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own save: delete" on public.saves for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Runs = leaderboard entries. Written only by the submit-run function.
-- ---------------------------------------------------------------------------
create table public.runs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  board       text not null check (board ~ '^(daily-\d{4}-\d{2}-\d{2}|free|challenge)$'),
  seed        text not null,
  shop_name   text not null check (char_length(shop_name) between 2 and 24),
  shop_day    int  check (shop_day between 1 and 30),
  grail_box   int  check (grail_box >= 1),
  grail_day   int,
  net_worth   int,
  rank        text,
  days_played int,
  verified    boolean not null default false,  -- true once the server replays the run (planned)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, board, seed)
);
create index runs_board_shop on public.runs (board, shop_day, net_worth desc);
create index runs_grail on public.runs (grail_box) where grail_box is not null;
alter table public.runs enable row level security;
create policy "leaderboard is public" on public.runs for select using (true);
-- no insert/update/delete policies: only the service role (server functions) can write.

-- Leaderboard views (read-only, public)
create view public.board_daily with (security_invoker = true) as
  select board, shop_name, shop_day, net_worth, grail_box, created_at,
         rank() over (partition by board order by shop_day asc nulls last, net_worth desc) as place
  from public.runs
  where board like 'daily-%' and shop_day is not null;

create view public.board_grail with (security_invoker = true) as
  select shop_name, grail_box, grail_day, board, created_at,
         rank() over (order by grail_box asc, grail_day asc) as place
  from public.runs
  where grail_box is not null;

create view public.board_networth with (security_invoker = true) as
  select shop_name, net_worth, shop_day, board, created_at,
         rank() over (order by net_worth desc) as place
  from public.runs
  where net_worth is not null;

-- ---------------------------------------------------------------------------
-- Store catalog + what each player owns
-- ---------------------------------------------------------------------------
create table public.products (
  id               text primary key,               -- 'premium', 'pack_arcade', ...
  kind             text not null check (kind in ('premium', 'theme_pack')),
  name             text not null,
  description      text,
  price_cents      int  not null,
  stripe_price_id  text,                           -- fill in after creating the Stripe product
  apple_product_id text,                           -- App Store Connect product id (non-consumable)
  google_product_id text,
  active           boolean not null default true,
  sort             int not null default 0
);
alter table public.products enable row level security;
create policy "catalog is public" on public.products for select using (active);

create table public.entitlements (
  user_id    uuid not null references auth.users (id) on delete cascade,
  product_id text not null references public.products (id),
  source     text not null check (source in ('stripe', 'apple', 'google', 'promo')),
  source_ref text,                                 -- Stripe payment_intent / store transaction id
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);
alter table public.entitlements enable row level security;
create policy "own entitlements: read" on public.entitlements for select using (auth.uid() = user_id);
-- writes: service role only (payment webhooks)

-- Raw payment webhook log: idempotency + audit. No policies = no browser access.
create table public.payment_events (
  id          bigint generated always as identity primary key,
  source      text not null,
  event_id    text not null,
  type        text,
  payload     jsonb not null,
  received_at timestamptz not null default now(),
  unique (source, event_id)
);
alter table public.payment_events enable row level security;

-- Launch catalog (prices in USD cents). Theme ids must match js/themes.js.
insert into public.products (id, kind, name, description, price_cents, sort) values
  ('premium',      'premium',    'Premium',          'No ads, night mode, and custom colors. One-time purchase.', 499, 0),
  ('pack_arcade',  'theme_pack', 'Arcade Pack',      'Neon on black, straight out of a 90s arcade.',              199, 1),
  ('pack_handheld','theme_pack', 'Handheld Pack',    'Four shades of green, like the old pocket consoles.',        199, 2),
  ('pack_cardshop','theme_pack', 'Card Shop Pack',   'Warm wood counters and cream price tags.',                  199, 3),
  ('pack_holo',    'theme_pack', 'Holo Pack',        'Shimmering pastels, like a fresh holo pull.',                199, 4);
