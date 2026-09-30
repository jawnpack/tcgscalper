// Stripe webhook signature check (HMAC-SHA256 over "timestamp.payload").
const enc = new TextEncoder();

export async function verifyStripe(payload: string, header: string | null, secret: string, toleranceSec = 300, nowSec = Date.now() / 1000): Promise<boolean> {
  if (!header || !secret) return false;
  let t = "";
  const sigs: string[] = [];
  for (const part of header.split(",")) {
    const [k, v] = part.split("=");
    if (k === "t") t = v;
    if (k === "v1") sigs.push(v);
  }
  if (!t || !sigs.length) return false;
  if (Math.abs(nowSec - Number(t)) > toleranceSec) return false;
  const expected = await sign(`${t}.${payload}`, secret);
  return sigs.some((s) => s.length === expected.length && timingSafeEqual(s, expected));
}

export async function sign(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
  return Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
