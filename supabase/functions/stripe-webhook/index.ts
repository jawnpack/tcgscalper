// Stripe -> grants and refunds. Configure in Stripe with events:
//   checkout.session.completed, checkout.session.async_payment_succeeded, charge.refunded
import { admin, firstTime, grant, revokeByRef } from "../_shared/db.ts";
import { verifyStripe } from "../_shared/stripe.ts";

const SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

Deno.serve(async (req) => {
  const payload = await req.text();
  if (!(await verifyStripe(payload, req.headers.get("Stripe-Signature"), SECRET))) {
    return new Response("bad signature", { status: 400 });
  }
  const event = JSON.parse(payload);
  if (!(await firstTime("stripe", event.id, event.type, event))) return new Response("duplicate", { status: 200 });

  const obj = event.data?.object ?? {};
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      if (obj.payment_status !== "paid") break; // async methods finish later
      const userId = obj.metadata?.user_id ?? obj.client_reference_id;
      const productId = obj.metadata?.product_id;
      if (userId && productId) {
        const { data: p } = await admin().from("products").select("id").eq("id", productId).maybeSingle();
        if (p) await grant(userId, productId, "stripe", obj.payment_intent ?? obj.id);
      }
      break;
    }
    case "charge.refunded": {
      if (obj.refunded && obj.payment_intent) await revokeByRef("stripe", obj.payment_intent);
      break;
    }
  }
  return new Response("ok", { status: 200 });
});
