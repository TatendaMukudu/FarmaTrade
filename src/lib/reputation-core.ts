import type { Reputation } from "@/generated/prisma/client";

// A star average needs enough samples to mean anything — below this, a
// single 5★ rating would display with false precision. Show the raw count
// instead until there's a real signal.
export const MIN_RATINGS_FOR_AVERAGE = 3;

export type ReputationSummary = {
  hasHistory: boolean;
  hasStars: boolean;
  headline: string; // "★ 4.7" | "Building history (2)" | "Not yet rated" | "New · no history yet"
  completedLine: string; // "12 completed trades"
  // A rated party is the same category of signal as a verified one — both
  // say "this is a positive, trust-worthy party" — so it shares the success
  // pill rather than getting its own color just because stars look gold.
  // Anything short of that (no history, not enough ratings yet) is
  // deliberately the neutral "new" tone: absence of data isn't bad, so it
  // shouldn't borrow a warning or success color it hasn't earned.
  tone: "success" | "new";
};

// The single place "what does this party's track record mean, in words"
// gets decided — every reputation display (directory list, party profile,
// opportunity card) renders from this instead of re-deriving the same
// threshold logic.
//
// Pure and DB-free on purpose, same reasoning as matching-core.ts: it's the
// one piece of reputation.ts worth unit-testing directly, kept out from
// behind that file's `server-only` import so a test runner can reach it.
export function summarizeReputation(
  reputation: Pick<Reputation, "completedCount" | "averageRating" | "ratingCount"> | null,
): ReputationSummary {
  const completedCount = reputation?.completedCount ?? 0;
  const completedLine = `${completedCount} completed trade${completedCount === 1 ? "" : "s"}`;

  if (!reputation || completedCount === 0) {
    return {
      hasHistory: false,
      hasStars: false,
      headline: "New · no history yet",
      completedLine,
      tone: "new",
    };
  }

  const hasStars =
    reputation.averageRating !== null && reputation.ratingCount >= MIN_RATINGS_FOR_AVERAGE;

  if (hasStars) {
    return {
      hasHistory: true,
      hasStars: true,
      headline: `★ ${reputation.averageRating!.toFixed(1)}`,
      completedLine,
      tone: "success",
    };
  }

  return {
    hasHistory: true,
    hasStars: false,
    headline:
      reputation.ratingCount > 0 ? `Building history (${reputation.ratingCount})` : "Not yet rated",
    completedLine,
    tone: "new",
  };
}
