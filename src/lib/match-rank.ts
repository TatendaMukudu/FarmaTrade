// Read-time ranking: the order opportunities are shown in, decided fresh on
// every page load rather than frozen into the row when the match was made.
//
// The problem this fixes: `Match.score` is computed once inside
// `generateMatchesForIntent` and never revisited. A counterparty who completes
// ten trades tomorrow does not move up. `neededBy` and `expiresAt` are
// declared in the schema and read by nothing in the scoring path. A match
// found six weeks ago outranks one found this morning purely because it
// scored two points higher on the day it was written.
//
// So: `Match.score` and `Match.reasons` keep their job as the stored,
// auditable evidence of what was true when the match fired — nothing here
// writes to them. Ranking is recomputed on every read from rows the pages
// already fetch, which costs one pure function call and no migration.
//
// The layering is deliberately lexicographic rather than one opaque weighted
// sum, so the ordering stays explicable to the farmer it's shown to:
//
//   priority   x100  — a deadline always beats a nicety
//   confidence  x20  — better-evidenced beats better-guessed
//   evidence   x0.4  — the match score itself, re-weighted by what we've
//                      learned; can flip a confidence tier, never a priority
//   polarity     x8  — the tie-break between equals
//
// Boundary worth keeping: this file decides HOW matches are delivered —
// order, grouping, volume — and never WHAT is true about them. It creates no
// reasons, and it can only ever lower a confidence, never raise one. That
// separation is what lets the ordering be tuned freely without any risk of
// it quietly inventing a claim about a counterparty.
//
// Pure and DB-free. `match-ranking.ts` is the server-side wrapper that feeds
// it.

import type { MatchStatus, VerificationSource } from "@/generated/prisma/client";
import { MIN_RATINGS_FOR_AVERAGE } from "@/lib/reputation-core";
import { totalFromSignals, type MatchSignal } from "@/lib/matching-core";
import {
  reasonWeightMultiplier,
  reliabilityLabel,
  shouldTrust,
  type ReasonKind,
  type ReasonReliability,
} from "@/lib/reason-reliability";
import { laneBrief, type CounterpartyClass, type LaneBrief, type LaneHistory } from "@/lib/trade-outcomes";

export type Priority = "urgent" | "high" | "medium" | "low";
export type Confidence = "confirmed" | "reliable" | "promising" | "calibrating";
export type Bucket = "time_critical" | "in_progress" | "needs_response" | "worth_knowing";

const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
const CONFIDENCE_RANK: Record<Confidence, number> = {
  confirmed: 0,
  reliable: 1,
  promising: 2,
  calibrating: 3,
};
const POLARITY_RANK: Record<Bucket, number> = {
  time_critical: 0,
  in_progress: 1,
  needs_response: 2,
  worth_knowing: 3,
};

const CONFIDENCE_ORDER: Confidence[] = ["confirmed", "reliable", "promising", "calibrating"];

// A deadline inside this many days is the whole reason to look at the app
// today.
export const URGENT_WINDOW_DAYS = 3;
// Far enough out to plan around, close enough to not be background noise.
export const SOON_WINDOW_DAYS = 14;
// A match nobody has responded to is still current for this long.
export const FRESH_DAYS = 7;
// Past this, an unanswered suggestion stops competing for the top of the
// list — it hasn't stopped being true, it has stopped being news.
export const STALE_DAYS = 28;

const DAY_MS = 24 * 60 * 60 * 1000;

// Evidence is scaled so it sits between a confidence step (20) and a
// priority step (100): what we know about a counterparty can reorder two
// matches of equal urgency, and can never push a routine one above a
// deadline.
const EVIDENCE_WEIGHT = 0.4;

const PREFERRED_PARTNER_BONUS = 12;
// Smaller than a preferred partner on purpose: `recurring` is a label the
// poster typed, while Relation.strength was earned across completed trades.
const STANDING_ORDER_BONUS = 6;

const PENALTY = {
  no_outcome_history: 10,
  small_sample: 5,
  counterparty_fell_through: 15,
  // Deliberately mild. A lane where trades have mostly not held is worth
  // knowing about and worth ranking below one where they have — but it is
  // history, not a verdict on this pairing, and burying the match would deny
  // the farmer the choice.
  lane_mostly_fell_through: 8,
  listing_expired: 40,
} as const;

// A stale suggestion loses this much a day past FRESH_DAYS, floored so decay
// can cost a match its confidence tier but never its priority tier.
const STALENESS_PER_DAY = 1.5;
const MAX_STALENESS_PENALTY = 24;

export type RankableIntent = {
  id: string;
  urgent: boolean;
  neededBy: Date | null;
  expiresAt: Date | null;
  recurring: boolean;
};

export type RankableReputation = {
  completedCount: number;
  ratingCount: number;
  didNotHappenCount?: number;
} | null;

export type RankableMatch = {
  id: string;
  status: MatchStatus;
  createdAt: Date;
  // Freshly computed against today's intents and today's reputation — not the
  // signals frozen into the row when the match was written.
  signals: MatchSignal[];
  yours: RankableIntent;
  theirs: RankableIntent;
  counterpartyReputation: RankableReputation;
  counterpartyVerifiedBy: VerificationSource | null;
  // Which category-and-route bucket this trade sits in, and how well known
  // its least-established side is — the key into recorded lane history.
  lane?: string;
  laneClass?: CounterpartyClass;
  // Relation.strength for this counterparty, if a Relation row exists.
  relationStrength?: number;
  // True once you've filed your side of the confirmation and are waiting on
  // theirs — the same match, but no longer your move.
  awaitingCounterparty?: boolean;
};

export type RankedMatch<M extends RankableMatch = RankableMatch> = {
  match: M;
  rank: number;
  evidenceScore: number;
  priority: Priority;
  confidence: Confidence;
  bucket: Bucket;
  limitations: string[];
  // What has happened before on this category and route. Null when there
  // isn't enough recorded history to say anything honest.
  lane: LaneBrief | null;
  // Why this landed where it did, in the order the terms were applied. Not
  // decoration: an ordering nobody can inspect is one nobody can correct.
  rationale: string[];
};

export type RankOptions = {
  now?: Date;
  reliability?: ReasonReliability;
  lanes?: LaneHistory;
};

function daysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / DAY_MS;
}

// The soonest deadline either side of the match is working to.
function deadlineOf(match: RankableMatch): Date | null {
  const dates = [match.yours.neededBy, match.theirs.neededBy].filter((d): d is Date => d != null);
  if (dates.length === 0) return null;
  return dates.reduce((soonest, d) => (d < soonest ? d : soonest));
}

export function priorityOf(match: RankableMatch, now: Date): Priority {
  const deadline = deadlineOf(match);
  const daysToDeadline = deadline ? daysBetween(now, deadline) : null;

  // A passed deadline is still urgent — it is the most likely thing the
  // farmer needs to act on or close out, and quietly demoting it would hide
  // exactly the case where the app failed them.
  if (match.yours.urgent || match.theirs.urgent) return "urgent";
  if (daysToDeadline != null && daysToDeadline <= URGENT_WINDOW_DAYS) return "urgent";

  // An accepted match is a live obligation with a real counterparty on the
  // other end, whether or not anything about it is time-boxed.
  if (match.status === "ACCEPTED" && !match.awaitingCounterparty) return "high";
  if (daysToDeadline != null && daysToDeadline <= SOON_WINDOW_DAYS) return "high";
  if ((match.relationStrength ?? 0) >= 2) return "high";

  if (match.status === "SUGGESTED" && daysBetween(match.createdAt, now) <= STALE_DAYS) {
    return "medium";
  }
  return "low";
}

// Confidence in the *evidence behind this pairing*, not in whether the trade
// will go well — nothing here is a prediction.
export function confidenceOf(match: RankableMatch, rel?: ReasonReliability): Confidence {
  const rep = match.counterpartyReputation;
  let confidence: Confidence;

  if (rep && rep.completedCount >= 3 && rep.ratingCount >= MIN_RATINGS_FOR_AVERAGE) {
    confidence = "confirmed";
  } else if (rep && rep.completedCount >= 1) {
    confidence = "reliable";
  } else if (match.counterpartyVerifiedBy) {
    confidence = "promising";
  } else {
    confidence = "calibrating";
  }

  // Learned reliability may only ever lower this. A reason that has been
  // cited enough times to have earned a verdict, and earned a bad one, drops
  // the whole match a tier — it cannot lift one.
  if (rel) {
    const stoodDown = match.signals.some((s) => {
      const r = rel.get(s.kind);
      return r != null && !shouldTrust(r);
    });
    if (stoodDown) {
      const i = CONFIDENCE_ORDER.indexOf(confidence);
      confidence = CONFIDENCE_ORDER[Math.min(i + 1, CONFIDENCE_ORDER.length - 1)];
    }
  }

  return confidence;
}

// Which section of the page this belongs in — derived from what the farmer
// has to *do* about it, which is independent of how much it matters. A
// standing order from a preferred partner can outrank a fresh suggestion
// without pretending to be urgent.
export function bucketOf(match: RankableMatch, priority: Priority, now: Date): Bucket {
  if (priority === "urgent") return "time_critical";
  if (match.status === "ACCEPTED") return "in_progress";
  if (match.status === "SUGGESTED" && daysBetween(match.createdAt, now) <= STALE_DAYS) {
    return "needs_response";
  }
  return "worth_knowing";
}

export const BUCKET_ORDER: Bucket[] = [
  "time_critical",
  "in_progress",
  "needs_response",
  "worth_knowing",
];

export const BUCKET_LABEL: Record<Bucket, string> = {
  time_critical: "Time-critical",
  in_progress: "In progress",
  needs_response: "Waiting on you",
  worth_knowing: "Worth knowing",
};

// An empty section is information, not a void — "nothing is time-critical
// right now" is a thing a farmer wants to be told, and is a different fact
// from "you have no matches."
export const BUCKET_EMPTY: Record<Bucket, string> = {
  time_critical: "Nothing time-critical right now.",
  in_progress: "No trades in progress.",
  needs_response: "Nothing waiting on your response.",
  worth_knowing: "Nothing else open at the moment.",
};

export const CALM_MESSAGE =
  "No opportunities yet — post what you have or need to get matched.";

function limitationsOf(match: RankableMatch, now: Date): string[] {
  const limitations: string[] = [];
  const rep = match.counterpartyReputation;

  if (!rep || rep.completedCount === 0) limitations.push("no_outcome_history");
  else if (rep.ratingCount < MIN_RATINGS_FOR_AVERAGE) limitations.push("small_sample");

  if ((rep?.didNotHappenCount ?? 0) > 0) limitations.push("counterparty_fell_through");

  const expiry = match.theirs.expiresAt;
  if (expiry && expiry < now) limitations.push("listing_expired");

  return limitations;
}

function stalenessPenalty(match: RankableMatch, now: Date): number {
  // Only unanswered suggestions go stale. An accepted match is not news; it
  // is work in progress, and age is not evidence against it.
  if (match.status !== "SUGGESTED") return 0;
  const age = daysBetween(match.createdAt, now);
  if (age <= FRESH_DAYS) return 0;
  return Math.min((age - FRESH_DAYS) * STALENESS_PER_DAY, MAX_STALENESS_PENALTY);
}

export function rankOne<M extends RankableMatch>(
  match: M,
  opts: RankOptions = {},
): RankedMatch<M> {
  const now = opts.now ?? new Date();
  const rel = opts.reliability;

  const weightFor = (kind: ReasonKind) => {
    const r = rel?.get(kind);
    return r ? reasonWeightMultiplier(r) : 1;
  };

  // The same 50-to-100 scale `scoreMatch` writes, recomputed against today's
  // reputation and re-priced by what each cited reason has actually been
  // worth. Identical to the stored score when nothing has been learned yet
  // and nothing has changed.
  const evidenceScore = totalFromSignals(match.signals, weightFor);

  const priority = priorityOf(match, now);
  const confidence = confidenceOf(match, rel);
  const bucket = bucketOf(match, priority, now);
  const limitations = limitationsOf(match, now);

  const lane =
    opts.lanes && match.lane
      ? laneBrief(opts.lanes, match.lane, match.laneClass ?? "new")
      : null;
  if (lane?.mostlyFellThrough) limitations.push("lane_mostly_fell_through");

  const rationale: string[] = [`priority:${priority}`, `confidence:${confidence}`];

  let rank = 0;
  rank += (4 - PRIORITY_RANK[priority]) * 100;
  rank += (4 - CONFIDENCE_RANK[confidence]) * 20;
  rank += (4 - POLARITY_RANK[bucket]) * 8;
  rank += evidenceScore * EVIDENCE_WEIGHT;

  for (const limitation of limitations) {
    rank -= PENALTY[limitation as keyof typeof PENALTY] ?? 0;
    rationale.push(`limitation:${limitation}`);
  }

  const staleness = stalenessPenalty(match, now);
  if (staleness > 0) {
    rank -= staleness;
    rationale.push(`stale:${Math.round(daysBetween(match.createdAt, now))}d`);
  }

  if ((match.relationStrength ?? 0) >= 2) {
    rank += PREFERRED_PARTNER_BONUS;
    rationale.push("preferred_partner");
  }
  if (match.yours.recurring || match.theirs.recurring) {
    rank += STANDING_ORDER_BONUS;
    rationale.push("standing_order");
  }

  // Reasons whose weight has actually moved are worth saying out loud —
  // otherwise the learning is invisible and untestable in production.
  if (rel) {
    for (const signal of match.signals) {
      const r = rel.get(signal.kind);
      if (!r || r.tier === "calibrating" || r.tier === "promising") continue;
      rationale.push(`reason:${signal.kind}:${reliabilityLabel(r)}`);
    }
  }

  return {
    match,
    rank: Math.round(rank * 100) / 100,
    evidenceScore,
    priority,
    confidence,
    bucket,
    limitations,
    lane,
    rationale,
  };
}

// Sorted best-first, ties broken on match id so the order is stable across
// renders rather than dependent on however Postgres returned the rows.
export function rankMatches<M extends RankableMatch>(
  matches: M[],
  opts: RankOptions = {},
): RankedMatch<M>[] {
  return matches
    .map((m) => rankOne(m, opts))
    .sort((a, b) => b.rank - a.rank || a.match.id.localeCompare(b.match.id));
}

export type MatchGroup<M extends RankableMatch> = {
  bucket: Bucket;
  label: string;
  empty: boolean;
  message: string | null;
  // How many were held back by the cap, so the UI can offer the rest rather
  // than silently dropping them.
  hidden: number;
  matches: RankedMatch<M>[];
};

export type MatchPlan<M extends RankableMatch> = {
  empty: boolean;
  message: string | null;
  groups: MatchGroup<M>[];
};

// Group, rank within group, cap volume, and return first-class empty states.
// Thirty undifferentiated cards is not a list a farmer on a phone can act on.
export const DEFAULT_BUCKET_LIMIT = 5;

export function planMatches<M extends RankableMatch>(
  matches: M[],
  opts: RankOptions & { limit?: number | Partial<Record<Bucket, number>> } = {},
): MatchPlan<M> {
  const limitFor = (bucket: Bucket): number => {
    if (typeof opts.limit === "number") return opts.limit;
    return opts.limit?.[bucket] ?? DEFAULT_BUCKET_LIMIT;
  };
  const ranked = rankMatches(matches, opts);

  const groups: MatchGroup<M>[] = BUCKET_ORDER.map((bucket) => {
    const inBucket = ranked.filter((r) => r.bucket === bucket);
    const shown = inBucket.slice(0, Math.max(0, limitFor(bucket)));
    return {
      bucket,
      label: BUCKET_LABEL[bucket],
      empty: shown.length === 0,
      message: shown.length ? null : BUCKET_EMPTY[bucket],
      hidden: inBucket.length - shown.length,
      matches: shown,
    };
  });

  return {
    empty: ranked.length === 0,
    message: ranked.length === 0 ? CALM_MESSAGE : null,
    groups,
  };
}
