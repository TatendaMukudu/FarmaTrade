import type { Post, Reputation, VerificationSource } from "@/generated/prisma/client";
import { objectiveSpec } from "@/lib/objectives";

// Deterministic, rules-based scoring — no ML, no history to learn from yet.
// Geography and category are the qualifying filters; reputation only ever
// adds, never subtracts, so new parties with no history aren't penalized.
//
// The score is never handed downstream on its own — it's cited. Each reason
// is plain language a projection layer (this UI today, WhatsApp phrasing
// later) can render directly instead of inventing its own justification.
//
// Pure and DB-free on purpose: it's the one piece of the matching pipeline
// worth unit-testing directly, so it lives apart from `matching.ts` (which
// pulls in Prisma) rather than behind a `server-only` import that would keep
// a test runner from ever reaching it.
export function scoreMatch(
  candidate: Post,
  newPost: Post,
  reputation: Reputation | null,
  verifiedBy: VerificationSource | null,
): { score: number; reasons: string[] } {
  let score = 50;
  const reasons: string[] = [];

  // Lead with the objective pairing: it's the strongest evidence the match
  // makes sense at all, and it's what the old model couldn't say. "They're
  // selling, you're buying" is a better first line than "same province",
  // which is true of thousands of irrelevant posts.
  reasons.push(
    `they're ${objectiveSpec(candidate.objective).gerund}, you're ${objectiveSpec(newPost.objective).gerund}`,
  );

  const sameProvince = candidate.province === newPost.province;
  const sameDistrict = sameProvince && candidate.district === newPost.district;
  // TRANSPORT only: a HAVE post's destination is a transporter's route, a
  // NEED post's destination is where goods need to end up. A candidate
  // qualifies on the route even when pickup provinces differ, as long as
  // one side's destination overlaps the other's location.
  const onRoute =
    !sameProvince &&
    newPost.category === "TRANSPORT" &&
    ((candidate.destinationProvince != null && candidate.destinationProvince === newPost.province) ||
      (newPost.destinationProvince != null && newPost.destinationProvince === candidate.province));

  if (sameProvince) {
    reasons.push("same province");
    if (sameDistrict) {
      score += 20;
      reasons.push("same district");
    }
  } else if (onRoute) {
    score += 15;
    reasons.push("on your route");
  }

  if (reputation?.averageRating && reputation.ratingCount >= 3) {
    score += (reputation.averageRating / 5) * 20;
    reasons.push(
      `counterparty: ${reputation.completedCount} completed, ${reputation.averageRating.toFixed(1)}★ (${reputation.ratingCount} ratings)`,
    );
  } else if (reputation?.completedCount) {
    score += Math.min(reputation.completedCount, 10);
    reasons.push(`counterparty: ${reputation.completedCount} completed (still building rating history)`);
  } else {
    reasons.push("counterparty: new, no history yet");
  }

  if (verifiedBy) {
    score += 10;
    reasons.push(
      verifiedBy === "FOUNDER" ? "founder-vouched" : "network-referred",
    );
  }

  if (candidate.urgent || newPost.urgent) {
    reasons.push("time-sensitive");
  }

  return { score: Math.round(Math.min(score, 100)), reasons };
}
