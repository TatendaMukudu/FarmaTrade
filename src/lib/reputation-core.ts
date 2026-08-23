import type { Reputation } from "@/generated/prisma/client";

// A star average needs enough samples to mean anything — below this, a
// single 5★ rating would display with false precision. Show the raw count
// instead until there's a real signal.
export const MIN_RATINGS_FOR_AVERAGE = 3;

// Pilot display switch only. Rating rows continue to be written and
// reputation continues to be recomputed; the 5–10-user pilot must not show
// a cross-role star average that PRODUCT_TRUTH says is not yet trustworthy.
export const SHOW_PILOT_RATINGS = false;

export function pilotVisibleReason(reason: string): string {
  if (SHOW_PILOT_RATINGS || !reason.startsWith("counterparty:")) return reason;
  return reason
    .replace(/, [0-9]+(?:\.[0-9]+)?★ \([0-9]+ ratings?\)/, "")
    .replace(/ \(still building rating history\)/, "");
}

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
  options: { showRatings?: boolean } = {},
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

  const showRatings = options.showRatings ?? SHOW_PILOT_RATINGS;
  if (!showRatings) {
    return {
      hasHistory: true,
      hasStars: false,
      headline: "Trade history",
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

// ---------------------------------------------------------------------------
// Role-scoped outcomes.
// ---------------------------------------------------------------------------
//
// PRODUCT_TRUTH.md §31 / INV-10. One actor is one actor — a farmer who sells
// maize and buys fertilizer does not become two identities. But their record
// as a supplier and their record as a buyer are different claims, and a single
// aggregate says neither of them honestly.
//
// The flatten had two halves and the invisible one was worse. The visible half
// is a cross-role "12 completed trades", which is coarse but not a quality
// claim. The invisible half is that ranking reads completedCount and
// didNotHappenCount across ALL roles, so a party who repeatedly fails as a
// buyer is penalised when ranked as a supplier — and nobody can see it happen.
//
// No schema is needed for this. A party's role in a match is already recorded:
// it is the side of their own intent. SUPPLY means they were supplying, DEMAND
// means they were buying. So role-scoped counts derive from rows that already
// exist, which is the rule this repo runs on everywhere else.

export type CommercialRole = "SUPPLIER" | "BUYER";

export type RoleOutcomes = {
  completedGood: number;
  completedIssue: number;
  didNotHappen: number;
  // Completed means it happened, well or badly. A trade that never happened
  // is not a completed one — the same distinction settlementOf() draws.
  completed: number;
};

export type RoleScopedRecord = Record<CommercialRole, RoleOutcomes>;

const NO_OUTCOMES: RoleOutcomes = {
  completedGood: 0,
  completedIssue: 0,
  didNotHappen: 0,
  completed: 0,
};

export function emptyRoleRecord(): RoleScopedRecord {
  return { SUPPLIER: { ...NO_OUTCOMES }, BUYER: { ...NO_OUTCOMES } };
}

// The role a party played, from the side of their own intent.
export function roleOfSide(side: string): CommercialRole {
  return side === "SUPPLY" ? "SUPPLIER" : "BUYER";
}

export type RoleConfirmation = {
  outcome: "COMPLETED_GOOD" | "COMPLETED_ISSUE" | "DID_NOT_HAPPEN";
  // The side of the confirming party's OWN intent in that match.
  side: string;
};

export function roleOutcomesFrom(confirmations: readonly RoleConfirmation[]): RoleScopedRecord {
  const record = emptyRoleRecord();
  for (const c of confirmations) {
    const bucket = record[roleOfSide(c.side)];
    if (c.outcome === "COMPLETED_GOOD") bucket.completedGood += 1;
    else if (c.outcome === "COMPLETED_ISSUE") bucket.completedIssue += 1;
    else bucket.didNotHappen += 1;
    bucket.completed = bucket.completedGood + bucket.completedIssue;
  }
  return record;
}

// What to show about a party in the role that matters right now. A supplier's
// buying record is not hidden — it is simply not what this reader is deciding
// about, and mixing them in would be the flatten again.
export function roleRecordLine(role: CommercialRole, outcomes: RoleOutcomes): string {
  const noun = role === "SUPPLIER" ? "supplying" : "buying";
  if (outcomes.completed === 0 && outcomes.didNotHappen === 0) {
    return `No completed trades ${noun} yet`;
  }
  const trades = `${outcomes.completed} completed trade${outcomes.completed === 1 ? "" : "s"} ${noun}`;
  if (outcomes.didNotHappen === 0) return trades;
  return `${trades} · ${outcomes.didNotHappen} did not go ahead`;
}
