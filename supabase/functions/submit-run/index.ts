// POST a run to the leaderboard. Called when a player opens their shop (with the
// shop name), pulls the Grail, and when the run ends. Same run = same row.
//
// Rules:
//  * Daily Market: one ranked run per player per day. The first shop day and shop
//    name submitted are locked in, so replaying the day can't improve a score.
//  * Scores are sanity-checked here; full server replay (verified = true) is planned.
import { json, preflight } from "../_shared/http.ts";
import { admin, userFrom } from "../_shared/db.ts";
import { cleanShopName } from "../_shared/names.ts";

const BOARD = /^(daily-\d{4}-\d{2}-\d{2}|free|challenge)$/;
const int = (v: unknown, lo: number, hi: number) =>
  v == null ? null : Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi ? (v as number) : NaN;

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  const user = await userFrom(req);
  if (!user) return json({ error: "Sign in to join the leaderboard." }, 401);
  const b = await req.json().catch(() => ({}));

  if (!BOARD.test(b.board ?? "") || typeof b.seed !== "string" || b.seed.length > 64) return json({ error: "Bad board." }, 400);
  if (b.board.startsWith("daily-")) {
    const date = b.board.slice(6);
    if (b.seed !== `daily-${date}`) return json({ error: "Seed doesn't match the Daily Market." }, 400);
    const ageDays = (Date.now() - Date.parse(date + "T12:00:00Z")) / 864e5;
    if (ageDays < -1.5 || ageDays > 2) return json({ error: "That Daily Market is closed." }, 400);
  }
  const name = cleanShopName(b.shop_name);
  if (!name.ok) return json({ error: name.reason }, 400);

  const shop_day = int(b.shop_day, 1, 30);
  const grail_box = int(b.grail_box, 1, 100000);
  const grail_day = int(b.grail_day, 1, 120);
  const net_worth = int(b.net_worth, -1_000_000, 5_000_000);
  const days_played = int(b.days_played, 1, 120);
  if ([shop_day, grail_box, grail_day, net_worth, days_played].some((x) => Number.isNaN(x))) return json({ error: "Numbers out of range." }, 400);

  const db = admin();
  const { data: existing } = await db.from("runs").select("*")
    .eq("user_id", user.id).eq("board", b.board).eq("seed", b.seed).maybeSingle();

  const row: Record<string, unknown> = { user_id: user.id, board: b.board, seed: b.seed, updated_at: new Date().toISOString() };
  // Lock the shop name + shop day once set.
  row.shop_name = existing?.shop_name ?? name.name;
  row.shop_day = existing?.shop_day ?? shop_day;
  if (grail_box != null && !existing?.grail_box) { row.grail_box = grail_box; row.grail_day = grail_day; }
  if (net_worth != null) row.net_worth = net_worth;
  if (typeof b.rank === "string") row.rank = b.rank.slice(0, 24);
  if (days_played != null) row.days_played = days_played;

  const { data, error } = await db.from("runs").upsert(row, { onConflict: "user_id,board,seed" }).select("id, board, shop_name, shop_day").single();
  if (error) return json({ error: error.message }, 400);

  let place: number | null = null;
  if (data.shop_day && data.board.startsWith("daily-")) {
    const { count } = await db.from("runs").select("id", { count: "exact", head: true })
      .eq("board", data.board).lt("shop_day", data.shop_day);
    place = (count ?? 0) + 1;
  }
  return json({ ok: true, id: data.id, shop_name: data.shop_name, place });
});
