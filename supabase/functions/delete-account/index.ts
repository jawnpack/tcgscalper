// Deletes the signed-in player's account and everything tied to it
// (profile, save, leaderboard runs, entitlements cascade in the database).
// Required by App Store guideline 5.1.1(v).
import { json, preflight } from "../_shared/http.ts";
import { admin, userFrom } from "../_shared/db.ts";

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  const user = await userFrom(req);
  if (!user) return json({ error: "Not signed in." }, 401);
  const { error } = await admin().auth.admin.deleteUser(user.id);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
});
