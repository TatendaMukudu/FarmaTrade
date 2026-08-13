import type { Intent, Reputation, VerificationSource } from "@/generated/prisma/client";
import type { ReasonKind } from "@/lib/reason-reliability";
import { regionFor } from "@/lib/regions";

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

// A single scored claim: the points it contributed, the sentence a human
// reads, and the stable kind those points were awarded under.
//
// The kind is what makes the score *re-weightable*. `Match.score` and
// `Match.reasons` are the stored evidence of what was true when the match
// fired, and they stay exactly as they were; but a reason whose kind is
// known can be re-priced later against what actually happened when it was
// cited (see reason-reliability.ts) instead of being stuck at the constant
// picked here on day one.
export type MatchSignal = {
  kind: ReasonKind;
  points: number;
  reason: string;
};

export type MatchScore = {
  score: number;
  reasons: string[];
  signals: MatchSignal[];
};

// The floor every match starts from — it qualified on category, type and
// geography before scoring ever ran, so it is not a zero.
export const BASE_SCORE = 50;

// `candidate` is the pre-existing intent, `incoming` the one that just
// became active. Both are stored rows — the Intent type is the persistence
// name and stays until the table rename lands.
export function scoreMatch(
  candidate: Intent,
  incoming: Intent,
  reputation: Reputation | null,
  verifiedBy: VerificationSource | null,
): MatchScore {
  const signals: MatchSignal[] = [];

  const sameCountry = candidate.countryCode === incoming.countryCode;
  const sameProvince = sameCountry && candidate.province === incoming.province;
  const sameDistrict = sameProvince && candidate.district === incoming.district;
  // TRANSPORT only: a HAVE post's destination is a transporter's route, a
  // NEED post's destination is where goods need to end up. A candidate
  // qualifies on the route even when pickup provinces differ, as long as
  // one side's destination overlaps the other's location.
  const onRoute =
    sameCountry &&
    !sameProvince &&
    incoming.category === "TRANSPORT" &&
    ((candidate.destinationProvince != null && candidate.destinationProvince === incoming.province) ||
      (incoming.destinationProvince != null && incoming.destinationProvince === candidate.province));

  if (sameProvince) {
    signals.push({ kind: "same_province", points: 0, reason: "same province" });
    if (sameDistrict) {
      signals.push({ kind: "same_district", points: 20, reason: "same district" });
    }
  } else if (onRoute) {
    signals.push({ kind: "on_your_route", points: 15, reason: "on your route" });
  } else if (!sameCountry) {
    // Zero points: an international counterparty is neither better nor worse
    // than a local one, and FarmaTrade has no basis to say which. But it is
    // never allowed to be a surprise — a farmer must be able to see, before
    // they message anyone, that this trade crosses a border and everything
    // that comes with one.
    signals.push({
      kind: "cross_border",
      points: 0,
      reason: `cross-border: ${regionFor(candidate.countryCode).country || candidate.countryCode} (both sides opted in)`,
    });
  }

  if (reputation?.averageRating && reputation.ratingCount >= 3) {
    signals.push({
      kind: "counterparty_rated",
      points: (reputation.averageRating / 5) * 20,
      reason: `counterparty: ${reputation.completedCount} completed, ${reputation.averageRating.toFixed(1)}★ (${reputation.ratingCount} ratings)`,
    });
  } else if (reputation?.completedCount) {
    signals.push({
      kind: "counterparty_building",
      points: Math.min(reputation.completedCount, 10),
      reason: `counterparty: ${reputation.completedCount} completed (still building rating history)`,
    });
  } else {
    signals.push({ kind: "counterparty_new", points: 0, reason: "counterparty: new, no history yet" });
  }

  if (verifiedBy) {
    signals.push({
      kind: verifiedBy === "FOUNDER" ? "founder_vouched" : "network_referred",
      points: 10,
      reason: verifiedBy === "FOUNDER" ? "founder-vouched" : "network-referred",
    });
  }

  if (candidate.urgent || incoming.urgent) {
    signals.push({ kind: "time_sensitive", points: 0, reason: "time-sensitive" });
  }

  return {
    score: totalFromSignals(signals),
    reasons: signals.map((s) => s.reason),
    signals,
  };
}

// The one place signal points become a score, so a re-weighted read (see
// match-rank.ts) and the stored write can never drift apart on the base or
// the cap.
export function totalFromSignals(
  signals: MatchSignal[],
  weightFor: (kind: ReasonKind) => number = () => 1,
): number {
  const total = signals.reduce((sum, s) => sum + s.points * weightFor(s.kind), BASE_SCORE);
  return Math.round(Math.min(total, 100));
}
