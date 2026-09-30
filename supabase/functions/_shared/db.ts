// Service-role database client (bypasses row-level security) and the signed-in user.
import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";

let _admin: SupabaseClient | null = null;
export function admin(): SupabaseClient {
  if (!_admin) {
    _admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _admin;
}

export async function userFrom(req: Request): Promise<User | null> {
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const { data, error } = await admin().auth.getUser(jwt);
  return error ? null : data.user;
}

// Grant/revoke purchases. Idempotent: granting twice is harmless.
export async function grant(userId: string, productId: string, source: string, sourceRef: string | null) {
  const { error } = await admin().from("entitlements")
    .upsert({ user_id: userId, product_id: productId, source, source_ref: sourceRef }, { onConflict: "user_id,product_id" });
  if (error) throw error;
}
export async function revokeByRef(source: string, sourceRef: string) {
  const { error } = await admin().from("entitlements").delete().eq("source", source).eq("source_ref", sourceRef);
  if (error) throw error;
}

// Record a webhook event once. Returns false if we've already processed it.
export async function firstTime(source: string, eventId: string, type: string, payload: unknown): Promise<boolean> {
  const { error } = await admin().from("payment_events").insert({ source, event_id: eventId, type, payload });
  if (!error) return true;
  if (error.code === "23505") return false; // unique violation = duplicate delivery
  throw error;
}
