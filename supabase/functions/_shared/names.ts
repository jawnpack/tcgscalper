// Shop names appear on a public leaderboard, so keep them family friendly.
// Uses the maintained `obscenity` word list (catches l33t-speak and spacing tricks).
import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from "npm:obscenity@0.4";

const matcher = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers });
const ALLOWED = /^[A-Za-z0-9 '&.!\-]{2,24}$/;

export function cleanShopName(raw: unknown): { ok: true; name: string } | { ok: false; reason: string } {
  if (typeof raw !== "string") return { ok: false, reason: "Missing shop name." };
  const name = raw.trim().replace(/\s+/g, " ");
  if (!ALLOWED.test(name)) return { ok: false, reason: "Use 2–24 letters, numbers, spaces or ' & . ! -" };
  // Also check with runs of single letters joined ("f u c k" -> "fuck") without
  // gluing normal words together (which would flag innocent names like "Glass Cards").
  const joined = name.replace(/\b(\w)(?:[\s.\-]+(\w)\b)+/g, (m) => m.replace(/[\s.\-]+/g, ""));
  if (matcher.hasMatch(name) || matcher.hasMatch(joined)) return { ok: false, reason: "Keep it family friendly." };
  return { ok: true, name };
}
