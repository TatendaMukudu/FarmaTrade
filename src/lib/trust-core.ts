import { TrustDimension } from "@/generated/prisma/enums";

// Multidimensional trust. A single star average can't separate "great
// produce, pays 60 days late" from "pays cash on collection, maize was
// damp" — both land on 3★ — and those two counterparties call for opposite
// decisions about credit terms and delivery windows.
//
// Pure and DB-free, same reasoning as reputation-core.ts: this is the "what
// does this party's record actually mean" logic, and it belongs where a
// test runner can reach it without a database.

export const ALL_DIMENSIONS = Object.values(TrustDimension);

export const DIMENSION_LABEL: Record<TrustDimension, string> = {
  COMMUNICATION: "Communication",
  RELIABILITY: "Reliability",
  QUALITY: "Quality",
  PAYMENT: "Payment",
  TIMELINESS: "Timeliness",
  FAIRNESS: "Fairness",
};

// The question each dimension actually asks the rater. Deliberately phrased
// about one completed trade, not about the person in general — "did they
// pay as agreed" is answerable from evidence; "are they trustworthy" is a
// vibe, and a vibe is what a one-star model already collects.
export const DIMENSION_QUESTION: Record<TrustDimension, string> = {
  COMMUNICATION: "Did they answer clearly and quickly?",
  RELIABILITY: "Did they do what they said they would?",
  QUALITY: "Was the goods or work as described?",
  PAYMENT: "Did they pay as agreed?",
  TIMELINESS: "Were they on time?",
  FAIRNESS: "Were they fair when something went wrong?",
};

// Which dimensions are worth asking about, given what the trade was. Asking
// a transporter's customer to rate "Quality" of a haul, or asking a seller
// to rate their buyer on "Quality" of the money, produces noise — the rater
// shrugs and picks the middle, and that middle then dilutes a real signal.
export function relevantDimensions(opts: {
  // Whether the party being rated was the one supplying goods/work.
  subjectWasSupplier: boolean;
}): TrustDimension[] {
  const base: TrustDimension[] = ["COMMUNICATION", "RELIABILITY", "TIMELINESS", "FAIRNESS"];
  return opts.subjectWasSupplier ? ["QUALITY", ...base] : ["PAYMENT", ...base];
}

export type DimensionScore = {
  dimension: TrustDimension;
  label: string;
  average: number;
};

export type TrustProfile = {
  // Dimensions with enough answers to show, strongest first.
  strengths: DimensionScore[];
  // Dimensions scoring meaningfully below this party's own average — a
  // relative weakness, not an absolute one. A party averaging 4.8 with a
  // 4.1 on Timeliness is still excellent and shouldn't be shown a warning;
  // it's the *shape* that's informative.
  watchouts: DimensionScore[];
  // One line naming what this party is specifically good at, for cards
  // where a full breakdown doesn't fit.
  headline: string | null;
  repeatPartnerLine: string | null;
  responseLine: string | null;
  // Where the record came from, not just how big it is. Shown next to the
  // star average because "★4.9 across 1 partner" and "★4.7 across 11" are
  // very different claims, and only stating the number hides that (see
  // trust-integrity.ts).
  provenanceLine: string | null;
  // True when the whole record rests on one or two relationships. Not an
  // accusation — a smallholder with one loyal buyer is the common case —
  // just a reason not to read the average as a market consensus.
  narrowRecord: boolean;
  hasDimensions: boolean;
};

// Same threshold discipline as MIN_RATINGS_FOR_AVERAGE in reputation-core:
// below this a single rater's opinion would render as a precise-looking
// decimal it hasn't earned.
export const MIN_RATINGS_FOR_DIMENSION = 3;

const RELATIVE_WEAKNESS_GAP = 0.4;

export type ReputationDimensions = {
  distinctPartnerCount: number;
  tradeBreadth: number;
  communicationAvg: number | null;
  reliabilityAvg: number | null;
  qualityAvg: number | null;
  paymentAvg: number | null;
  timelinessAvg: number | null;
  fairnessAvg: number | null;
  dimensionCount: number;
  repeatPartnerCount: number;
  medianResponseMinutes: number | null;
};

const FIELD_BY_DIMENSION: Record<TrustDimension, keyof ReputationDimensions> = {
  COMMUNICATION: "communicationAvg",
  RELIABILITY: "reliabilityAvg",
  QUALITY: "qualityAvg",
  PAYMENT: "paymentAvg",
  TIMELINESS: "timelinessAvg",
  FAIRNESS: "fairnessAvg",
};

function formatResponse(minutes: number): string {
  if (minutes < 60) return `Usually replies in under an hour`;
  if (minutes < 60 * 24) {
    const hours = Math.round(minutes / 60);
    return `Usually replies within ${hours} hour${hours === 1 ? "" : "s"}`;
  }
  const days = Math.round(minutes / (60 * 24));
  return `Usually replies within ${days} day${days === 1 ? "" : "s"}`;
}

export function buildTrustProfile(rep: ReputationDimensions | null): TrustProfile {
  const empty: TrustProfile = {
    strengths: [],
    watchouts: [],
    headline: null,
    repeatPartnerLine: null,
    responseLine: null,
    provenanceLine: null,
    narrowRecord: false,
    hasDimensions: false,
  };
  if (!rep) return empty;

  const repeatPartnerLine =
    rep.repeatPartnerCount > 0
      ? `${rep.repeatPartnerCount} partner${rep.repeatPartnerCount === 1 ? "" : "s"} traded again`
      : null;
  const responseLine =
    rep.medianResponseMinutes != null ? formatResponse(rep.medianResponseMinutes) : null;

  const partners = rep.distinctPartnerCount;
  const provenanceLine =
    partners === 0
      ? null
      : partners === 1
        ? "Track record is with a single partner"
        : `Traded with ${partners} different partners`;
  const narrowRecord = partners > 0 && partners < 3;

  if (rep.dimensionCount < MIN_RATINGS_FOR_DIMENSION) {
    return { ...empty, repeatPartnerLine, responseLine, provenanceLine, narrowRecord };
  }

  const scored: DimensionScore[] = [];
  for (const dimension of ALL_DIMENSIONS) {
    const average = rep[FIELD_BY_DIMENSION[dimension]] as number | null;
    if (average == null) continue;
    scored.push({ dimension, label: DIMENSION_LABEL[dimension], average });
  }

  if (scored.length === 0) {
    return { ...empty, repeatPartnerLine, responseLine, provenanceLine, narrowRecord };
  }

  const overall = scored.reduce((sum, s) => sum + s.average, 0) / scored.length;
  const strengths = [...scored].sort((a, b) => b.average - a.average);
  const watchouts = scored
    .filter((s) => overall - s.average >= RELATIVE_WEAKNESS_GAP)
    .sort((a, b) => a.average - b.average);

  const best = strengths[0];
  // Only claim a standout when it actually stands out — if every dimension
  // sits within the gap, "known for Communication" is a coin toss dressed
  // up as an insight.
  const headline =
    best.average - overall >= RELATIVE_WEAKNESS_GAP / 2
      ? `Known for ${best.label.toLowerCase()}`
      : null;

  return {
    strengths,
    watchouts,
    headline,
    repeatPartnerLine,
    responseLine,
    provenanceLine,
    narrowRecord,
    hasDimensions: true,
  };
}
