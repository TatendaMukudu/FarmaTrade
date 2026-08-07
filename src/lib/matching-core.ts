import type { Post, Reputation, VerificationSource } from "@/generated/prisma/client";
import { objectiveSpec } from "@/lib/objectives";
import { distanceBand, distanceLabelFor } from "@/lib/geo-core";

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
  // Great-circle kilometres between the two posts. Null when either side
  // has no coordinates, in which case scoring falls back to the old
  // same-region test rather than inventing a distance.
  distanceKm: number | null = null,
): { score: number; reasons: string[] } {
  let score = 50;
  const reasons: string[] = [];

  // Lead with the objective pairing: it's the strongest evidence the match
  // makes sense at all, and it's what the old model couldn't say. "They're
  // selling, you're buying" is a better first line than "same region",
  // which is true of thousands of irrelevant posts.
  reasons.push(
    `they're ${objectiveSpec(candidate.objective).gerund}, you're ${objectiveSpec(newPost.objective).gerund}`,
  );

  const sameCountry = candidate.countryCode === newPost.countryCode;
  const sameRegion = sameCountry && candidate.region === newPost.region;

  // TRANSPORT only: a HAVE post's destination is a transporter's route, a
  // NEED post's destination is where goods need to end up. A candidate
  // qualifies on the route even when origins are far apart, as long as one
  // side's destination overlaps the other's location.
  const onRoute =
    newPost.category === "TRANSPORT" &&
    ((candidate.destinationProvince != null && candidate.destinationProvince === newPost.region) ||
      (newPost.destinationProvince != null && newPost.destinationProvince === candidate.region));

  if (distanceKm != null) {
    // Proximity on a continuous scale rather than a boundary test. Closer
    // is better, without a cliff at an administrative line that has
    // nothing to do with how far a truck has to drive.
    const band = distanceBand(distanceKm);
    const bonus = { same_area: 25, nearby: 18, regional: 8, far: 0 }[band];
    score += bonus;
    reasons.push(distanceLabelFor(distanceKm, { sameCountry }).toLowerCase());

    // Crossing a border is a real cost — customs, permits, currency — so
    // it's cited even though it no longer disqualifies. The farmer decides
    // whether the extra 200km of buyer is worth the paperwork.
    if (!sameCountry) reasons.push("across a border — check permits");
  } else if (sameRegion) {
    // No coordinates on one side: fall back to the old test rather than
    // guessing a position.
    score += 15;
    reasons.push("same area");
  }

  if (onRoute) {
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
