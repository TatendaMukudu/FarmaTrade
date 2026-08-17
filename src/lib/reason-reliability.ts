// Which of FarmaTrade's own reasons actually predict a trade.
//
// A matcher that knows where it is reliable is worth more to a farmer than a
// cleverer one that doesn't. `scoreMatch` hands out fixed points per reason
// — +20 for same district, +15 for on-route — and has never once checked
// whether those reasons actually predict a trade happening. This is the
// check.
//
// The join key already exists: `Match.reasons` is a string array sitting in
// the same row as `Match.status`, so every match FarmaTrade has ever made is
// a labelled example of "we cited X, and here's what the parties did about
// it." Nothing new has to be recorded to start reading it.
//
// Two rules here are the honest posture rather than the convenient one, and
// both matter more in a thin market than they would in a busy one:
//   - Below MIN_FEEDBACK responses it reports `calibrating`, full stop. It
//     does not claim a reliability it hasn't earned, and it does not let a
//     2-for-2 streak masquerade as a proven signal.
//   - It only ever stands a reason *down* once that reason has earned enough
//     feedback AND proved mostly unhelpful. Thin evidence never suppresses,
//     which matters in a marketplace full of cold-start parties.
//
// Pure and DB-free, same reasoning as matching-core.ts: this is the piece
// worth unit-testing directly, so it stays out from behind a `server-only`
// import a test runner can't reach.

import type { MatchStatus } from "@/generated/prisma/client";

// Below this many responses we are calibrating, not reporting.
export const MIN_FEEDBACK = 4;

// A reason may only be stood down once it has this much feedback behind it —
// deliberately higher than MIN_FEEDBACK, so "we're not sure yet" and "we're
// sure this doesn't work" are separated by real evidence, not one bad week.
export const MIN_FEEDBACK_TO_STAND_DOWN = 6;

export type ReliabilityTier = "calibrating" | "reliable" | "promising" | "unproven";

export type Tally = { useful: number; dismiss: number };

export type Reliability = {
  tier: ReliabilityTier;
  // 0-100, or null while calibrating — a percentage we haven't earned the
  // right to quote is worse than no percentage.
  score: number | null;
  total: number;
  basis: string;
};

// The stable identity of a reason, independent of the numbers baked into its
// text. "counterparty: 3 completed, 4.7★ (5 ratings)" and "counterparty: 11
// completed, 4.2★ (9 ratings)" are the same *kind* of claim, and only make a
// usable sample if they're counted together.
export type ReasonKind =
  | "same_province"
  | "same_district"
  | "on_your_route"
  | "cross_border"
  | "counterparty_rated"
  | "counterparty_building"
  | "counterparty_new"
  | "founder_vouched"
  | "network_referred"
  | "time_sensitive";

export const REASON_KINDS: ReasonKind[] = [
  "same_province",
  "same_district",
  "on_your_route",
  "cross_border",
  "counterparty_rated",
  "counterparty_building",
  "counterparty_new",
  "founder_vouched",
  "network_referred",
  "time_sensitive",
];

// What a farmer should be told a reason is currently worth. Deliberately
// plain: these render next to the reason itself, so they have to read as
// candour rather than telemetry.
export const RELIABILITY_LABEL: Record<ReliabilityTier, string> = {
  calibrating: "still calibrating",
  reliable: "reliable so far",
  promising: "promising so far",
  unproven: "hasn't panned out so far",
};

export function reliability(tally: Tally | undefined | null): Reliability {
  const useful = tally?.useful ?? 0;
  const dismiss = tally?.dismiss ?? 0;
  const total = useful + dismiss;

  if (total < MIN_FEEDBACK) {
    return {
      tier: "calibrating",
      score: null,
      total,
      basis: `still calibrating (${total}/${MIN_FEEDBACK} responses)`,
    };
  }

  const ratio = useful / total;
  const tier: ReliabilityTier = ratio >= 0.7 ? "reliable" : ratio >= 0.45 ? "promising" : "unproven";
  return {
    tier,
    score: Math.round(ratio * 100),
    total,
    basis: `${useful}/${total} led somewhere`,
  };
}

// Does this reason still deserve the points matching-core assigns it? False
// only once it has earned enough feedback and proved mostly unhelpful —
// asymmetric on purpose, since being slow to condemn a reason costs a farmer
// far less than being quick to.
export function shouldTrust(rel: Reliability): boolean {
  return !(rel.tier === "unproven" && rel.total >= MIN_FEEDBACK_TO_STAND_DOWN);
}

// What a reason's base points get multiplied by, given what we've learned.
//
// Neutral (1) is the default in both directions of uncertainty: a reason
// we're still calibrating on scores exactly as it does today. Only earned
// evidence moves it, and the downward move is capped well above zero — a
// weak reason is worth less, never nothing, because the reason is still true
// even when it hasn't been predictive here.
export function reasonWeightMultiplier(rel: Reliability): number {
  if (rel.tier === "calibrating") return 1;
  if (rel.tier === "reliable") return 1.2;
  if (rel.tier === "promising") return 1;
  return shouldTrust(rel) ? 0.8 : 0.5;
}

export function reliabilityLabel(rel: Reliability): string {
  return RELIABILITY_LABEL[rel.tier];
}

// Parses a stored `Match.reasons` entry back to its kind. The strings are
// written by `scoreMatch` and are stable, but they're stored as free text
// rather than enum rows — so this is a reader over history, not the source
// of truth. Fresh scoring carries its kind structurally (see MatchSignal in
// matching-core.ts) and never round-trips through here.
//
// Unrecognized strings return null rather than a fallback bucket: a reason
// we can't identify must not silently pollute another kind's sample.
export function reasonKind(reason: string): ReasonKind | null {
  const text = reason.trim().toLowerCase();
  if (text === "same province") return "same_province";
  if (text === "same district") return "same_district";
  if (text === "on your route") return "on_your_route";
  // Carries a country name and so can't be matched whole — the prefix is
  // the stable part.
  if (text.startsWith("cross-border:")) return "cross_border";
  if (text === "founder-vouched") return "founder_vouched";
  if (text === "network-referred") return "network_referred";
  if (text === "time-sensitive") return "time_sensitive";
  if (text.startsWith("counterparty:")) {
    if (text.includes("no history yet")) return "counterparty_new";
    if (text.includes("still building rating history")) return "counterparty_building";
    return "counterparty_rated";
  }
  return null;
}

// How a settled match votes on every reason that was cited for it.
//
// ACCEPTED and COMPLETED are useful; DECLINED is a dismissal. SUGGESTED is
// not a vote — it's a match nobody has looked at yet, and counting silence
// as either outcome would make every reason look worse (or better) the
// faster we generate matches.
//
// DID_NOT_HAPPEN is the sharpest signal available and needs the confirmation
// row to see, so it's passed in separately rather than inferred from status:
// a match both sides accepted and then never traded on is evidence *against*
// the reasons that paired them, and it currently reads as COMPLETED.
export function matchVote(row: {
  status: MatchStatus;
  fellThrough?: boolean;
}): "useful" | "dismiss" | null {
  if (row.fellThrough) return "dismiss";
  if (row.status === "AGREED" || row.status === "ACCEPTED" || row.status === "COMPLETED") {
    return "useful";
  }
  if (row.status === "DECLINED") return "dismiss";
  return null;
}

// Rolls settled matches up into a per-kind tally. Pure over rows the caller
// has already fetched — at pilot scale this is a scan of a few thousand rows
// with no migration behind it. A `ReasonOutcome` rollup table is the answer
// when that stops being true, not before.
export function tallyReasonOutcomes(
  rows: { reasons: string[]; status: MatchStatus; fellThrough?: boolean }[],
): Map<ReasonKind, Tally> {
  const tallies = new Map<ReasonKind, Tally>();
  for (const row of rows) {
    const vote = matchVote(row);
    if (!vote) continue;
    // A reason cited twice on one match is still one match's worth of
    // evidence about that reason.
    const kinds = new Set<ReasonKind>();
    for (const reason of row.reasons) {
      const kind = reasonKind(reason);
      if (kind) kinds.add(kind);
    }
    for (const kind of kinds) {
      const tally = tallies.get(kind) ?? { useful: 0, dismiss: 0 };
      tally[vote] += 1;
      tallies.set(kind, tally);
    }
  }
  return tallies;
}

export type ReasonReliability = Map<ReasonKind, Reliability>;

export function reliabilityByKind(tallies: Map<ReasonKind, Tally>): ReasonReliability {
  const out: ReasonReliability = new Map();
  for (const kind of REASON_KINDS) {
    out.set(kind, reliability(tallies.get(kind)));
  }
  return out;
}
