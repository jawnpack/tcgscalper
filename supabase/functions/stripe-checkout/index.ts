// POST { product_id, return_url } -> { url } : starts a Stripe Checkout for a signed-in player.
import { json, preflight } from "../_shared/http.ts";
import { admin, userFrom } from "../_shared/db.ts";

const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const SITE_URL = (Deno.env.get("SITE_URL") ?? "").replace(/\/$/, "");

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  const user = await userFrom(req);
  if (!user) return json({ error: "Sign in to buy." }, 401);

  const { product_id, return_url } = await req.json().catch(() => ({}));
  const db = admin();
  const { data: product } = await db.from("products").select("*").eq("id", product_id).eq("active", true).maybeSingle();
  if (!product?.stripe_price_id) return json({ error: "That item isn't for sale yet." }, 400);

  const { data: owned } = await db.from("entitlements").select("product_id")
    .eq("user_id", user.id).eq("product_id", product.id).maybeSingle();
  if (owned) return json({ error: "You already own this." }, 409);

  // Only send players back to our own site.
  const back = typeof return_url === "string" && SITE_URL && return_url.startsWith(SITE_URL) ? return_url : SITE_URL;
  const sep = back.includes("?") ? "&" : "?";

  const form = new URLSearchParams({
    mode: "payment",
    "line_items[0][price]": product.stripe_price_id,
    "line_items[0][quantity]": "1",
    success_url: `${back}${sep}purchase=success&product=${product.id}`,
    cancel_url: `${back}${sep}purchase=cancel`,
    client_reference_id: user.id,
    "metadata[user_id]": user.id,
    "metadata[product_id]": product.id,
    "payment_intent_data[metadata][user_id]": user.id,
    "payment_intent_data[metadata][product_id]": product.id,
  });
  if (user.email) form.set("customer_email", user.email);

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${STRIPE_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  const session = await res.json();
  if (!res.ok) return json({ error: session?.error?.message ?? "Stripe error" }, 502);
  return json({ url: session.url });
});
