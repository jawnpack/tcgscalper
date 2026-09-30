// RevenueCat (App Store / Google Play purchases) -> grants and refunds.
// In RevenueCat, set the app user ID to the player's Supabase user id at sign-in,
// and set this webhook's Authorization header to the REVENUECAT_WEBHOOK_AUTH value.
import { admin, firstTime, grant, revokeByRef } from "../_shared/db.ts";

const AUTH = Deno.env.get("REVENUECAT_WEBHOOK_AUTH")!;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (!AUTH || req.headers.get("Authorization") !== `Bearer ${AUTH}`) return new Response("unauthorized", { status: 401 });
  const body = await req.json().catch(() => null);
  const ev = body?.event;
  if (!ev?.id) return new Response("no event", { status: 400 });
  if (!(await firstTime("revenuecat", ev.id, ev.type, body))) return new Response("duplicate", { status: 200 });

  const userId: string = ev.app_user_id;
  if (!UUID.test(userId ?? "")) return new Response("anonymous user; ignored", { status: 200 });

  const store = ev.store === "PLAY_STORE" ? "google" : "apple";
  const col = store === "google" ? "google_product_id" : "apple_product_id";
  const { data: product } = await admin().from("products").select("id").eq(col, ev.product_id).maybeSingle();
  if (!product) return new Response("unknown product; ignored", { status: 200 });

  const ref = ev.original_transaction_id ?? ev.transaction_id ?? ev.id;
  if (ev.type === "INITIAL_PURCHASE" || ev.type === "NON_RENEWING_PURCHASE") {
    await grant(userId, product.id, store, ref);
  } else if (ev.type === "CANCELLATION" && ev.cancel_reason === "CUSTOMER_SUPPORT") {
    await revokeByRef(store, ref); // refunds show up as a customer-support cancellation
  }
  return new Response("ok", { status: 200 });
});
