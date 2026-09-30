// Run: deno test supabase/functions/_shared/shared_test.ts
function assert(cond: unknown, msg = "assertion failed"): asserts cond { if (!cond) throw new Error(msg); }
function assertEquals(a: unknown, b: unknown) { if (a !== b) throw new Error(`${a} !== ${b}`); }
import { verifyStripe, sign } from "./stripe.ts";
import { cleanShopName } from "./names.ts";

Deno.test("stripe signature: valid, tampered, stale, missing", async () => {
  const secret = "whsec_test", body = '{"id":"evt_1"}', t = 1_800_000_000;
  const good = `t=${t},v1=${await sign(`${t}.${body}`, secret)}`;
  assert(await verifyStripe(body, good, secret, 300, t + 10));
  assert(!(await verifyStripe(body + " ", good, secret, 300, t + 10)), "tampered body");
  assert(!(await verifyStripe(body, good, "whsec_other", 300, t + 10)), "wrong secret");
  assert(!(await verifyStripe(body, good, secret, 300, t + 1000)), "replayed too late");
  assert(!(await verifyStripe(body, null, secret)), "missing header");
});

Deno.test("shop names: family friendly and well-formed", () => {
  assertEquals(cleanShopName("  Pikachu   Palace ").ok && (cleanShopName("  Pikachu   Palace ") as { name: string }).name, "Pikachu Palace");
  assert(cleanShopName("Jon's Cards & Co.").ok);
  assert(!cleanShopName("X").ok, "too short");
  assert(!cleanShopName("A".repeat(25)).ok, "too long");
  assert(!cleanShopName("<script>").ok, "html");
  assert(!cleanShopName("sh1t cards").ok, "l33t profanity");
  assert(!cleanShopName("f u c k").ok, "spaced profanity");
  assert(!cleanShopName("s.h.i.t shop").ok, "dotted profanity");
  for (const fine of ["Glass Cards", "Class Act Cards", "Bass Pro Pulls", "Scunthorpe Slabs", "A B C Cards", "Hit Shop", "Grail Hunters"]) {
    assert(cleanShopName(fine).ok, `false positive: ${fine}`);
  }
});
