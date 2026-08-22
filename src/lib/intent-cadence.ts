// A farm compared to its own normal, not to anyone else's.
//
// FarmaTrade's only sense of timing today is a flat seven-day window in
// harvest-drafts.ts: the same nudge for a smallholder who lists twice a
// season and a commercial farm that lists weekly. That treats a rhythm as a
// constant when it is the most individual thing about a farm.
//
// This measures each party against their own history instead. Two things
// fall out of that, and both are the fair framing for a marketplace with
// smallholders in it:
//
//   - "You usually list maize about every three weeks; it has been seven"
//     is useful to a two-hectare farm. "You post less than average" is not,
//     and would only ever tell a smallholder they are small.
//   - A buyer who reliably records a standing order every month and has gone
//     quiet is a fact worth surfacing. Silence is otherwise invisible to
//     every other signal FarmaTrade has, because nothing is there to see.
//
// Median and MAD rather than mean and standard deviation, deliberately. One
// bumper harvest, or one season a farmer was ill, should not redefine what
// normal is for them — and with samples this small, a mean is almost all
// outlier.
//
// No new recording needed: Intent.createdAt, partyId and category have been
// there since launch, so this reads a history that already exists rather
// than starting a clock today.
//
// Pure and DB-free.

// Below this many recorded gaps we do not claim to know a rhythm. Four gaps
// means five records, which is the least that can distinguish a pattern from a
// coincidence.
export const MIN_GAPS = 4;

// How much of the sample has to agree before we describe a rhythm as
// established rather than emerging.
const CLEAR_GAPS = 10;
const EMERGING_GAPS = 6;

// A gap has to exceed the norm by this many MADs before it counts as a real
// departure rather than ordinary variation. Deliberately generous: farming
// is seasonal and weather-bound, and crying wolf at every late week would
// train farmers to ignore the signal.
const DEVIATION_THRESHOLD = 3;

// When a party's gaps are near-identical, MAD collapses toward zero and any
// delay at all would read as a deviation. This floor keeps a metronomic
// poster from being flagged for being a day late.
const MIN_SPREAD_DAYS = 2;

const DAY_MS = 24 * 60 * 60 * 1000;

export type RhythmConfidence = "learning" | "tentative" | "emerging" | "clear";

export type Rhythm = {
  // Typical days between records, or null while still learning.
  normalDays: number | null;
  // Typical variation around that, in days — how irregular this party
  // normally is, which is itself part of their rhythm.
  spreadDays: number | null;
  gaps: number;
  confidence: RhythmConfidence;
  // Plain language, safe to show a farmer as-is.
  basis: string;
};

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// Median absolute deviation: the median of how far each point sits from the
// median. Robust where a standard deviation is not — a single 200-day gap
// moves this barely at all.
export function medianAbsoluteDeviation(values: number[]): number | null {
  const mid = median(values);
  if (mid == null) return null;
  return median(values.map((v) => Math.abs(v - mid)));
}

// Days between consecutive records, oldest first. Same-day records produce a
// zero gap, which is real information about how this party works and is kept
// rather than filtered.
export function gapsBetween(timestamps: Date[]): number[] {
  const sorted = [...timestamps].sort((a, b) => a.getTime() - b.getTime());
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    gaps.push((sorted[i].getTime() - sorted[i - 1].getTime()) / DAY_MS);
  }
  return gaps;
}

function confidenceFor(gaps: number): RhythmConfidence {
  if (gaps < MIN_GAPS) return "learning";
  if (gaps >= CLEAR_GAPS) return "clear";
  if (gaps >= EMERGING_GAPS) return "emerging";
  return "tentative";
}

// What this party's own posting looks like. Returns `learning` with null
// numbers below the floor rather than a shaky estimate — there is no honest
// way to describe a rhythm from two records, and saying so is better than
// hedging.
export function computeRhythm(timestamps: Date[]): Rhythm {
  const gaps = gapsBetween(timestamps);
  const confidence = confidenceFor(gaps.length);

  if (confidence === "learning") {
    return {
      normalDays: null,
      spreadDays: null,
      gaps: gaps.length,
      confidence,
      basis: `not enough history yet (${gaps.length}/${MIN_GAPS} gaps between records)`,
    };
  }

  const normalDays = median(gaps)!;
  const spreadDays = Math.max(medianAbsoluteDeviation(gaps)!, MIN_SPREAD_DAYS);

  return {
    normalDays: Math.round(normalDays),
    spreadDays: Math.round(spreadDays),
    gaps: gaps.length,
    confidence,
    basis: `based on ${gaps.length} gaps between records`,
  };
}

export type QuietRead = {
  quiet: boolean;
  // Days since this party last posted.
  sinceDays: number;
  rhythm: Rhythm;
  // The sentence to show, or null when there is nothing honest to say.
  line: string | null;
};

// Has this party gone quieter than their own normal?
//
// Compares the current open-ended gap against the party's median gap. Never
// fires below MIN_GAPS, and never fires on a party whose rhythm is too
// irregular for "late" to mean anything — a farm that records at 5, 60 and 200
// day intervals does not have a schedule to be late for.
export function detectQuiet(timestamps: Date[], now: Date): QuietRead {
  const rhythm = computeRhythm(timestamps);
  const latest = timestamps.length
    ? timestamps.reduce((a, b) => (a > b ? a : b))
    : null;
  const sinceDays = latest ? Math.floor((now.getTime() - latest.getTime()) / DAY_MS) : 0;

  if (rhythm.normalDays == null || rhythm.spreadDays == null) {
    return { quiet: false, sinceDays, rhythm, line: null };
  }

  const threshold = rhythm.normalDays + DEVIATION_THRESHOLD * rhythm.spreadDays;
  const quiet = sinceDays > threshold;

  return {
    quiet,
    sinceDays,
    rhythm,
    // A count and a comparison, never a diagnosis of why. FarmaTrade has no
    // idea whether the farmer is between seasons, ill, or has left — and
    // saying any of those would be inventing a cause.
    line: quiet
      ? `Usually records something about every ${rhythm.normalDays} days — it has been ${sinceDays}.`
      : null,
  };
}

// The same read, addressed to the farmer about themselves. Separate from
// detectQuiet because the second person changes what is appropriate to say:
// about your own farm this is a helpful nudge, about somebody else's it is
// only ever an observation.
export function ownRhythmNudge(timestamps: Date[], now: Date): string | null {
  const read = detectQuiet(timestamps, now);
  if (!read.quiet) return null;
  return `You usually list something about every ${read.rhythm.normalDays} days — it has been ${read.sinceDays}. Worth posting what you have?`;
}
