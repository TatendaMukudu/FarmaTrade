import type { PostCategory, SignalKind } from "@/generated/prisma/enums";

// Market intelligence, derived from the platform's own order flow.
//
// There is no reliable public price feed for Zimbabwe's largely informal
// agricultural market, so an external data source isn't an option — but the
// platform sees both sides of real intent (who's asking, who's offering,
// at what price, where), which is the signal a price feed is a proxy for.
// It gets better with volume rather than needing to be bought.
//
// Pure and DB-free, same reasoning as matching-core.ts. The DB shell
// (signals.ts) does the counting; this decides what the counts mean.

// Below this, a "signal" is a rumour. Four NEED posts in a week is one
// buyer having a busy Tuesday, and dressing that up as "demand rising"
// teaches farmers to distrust everything on the page.
export const MIN_SAMPLE = 5;

// How much movement counts as movement. Agricultural volumes are lumpy —
// a 20% week-on-week wobble is the baseline noise, not news.
const RISE_RATIO = 1.5;
const FALL_RATIO = 0.6;
const IMBALANCE_RATIO = 2;
const PRICE_MOVE = 0.15;

export type WindowCounts = {
  category: PostCategory;
  province: string | null;
  subject: string | null;
  recentDemand: number;
  recentSupply: number;
  priorDemand: number;
  priorSupply: number;
  recentMedianPrice: number | null;
  priorMedianPrice: number | null;
};

export type SignalDraft = {
  kind: SignalKind;
  category: PostCategory;
  province: string | null;
  subject: string | null;
  headline: string;
  detail: string;
  strength: number;
  sampleSize: number;
};

function where(province: string | null): string {
  return province ? ` in ${province}` : "";
}

function what(subject: string | null, category: PostCategory): string {
  return subject ?? category.toLowerCase();
}

// Strength blends "is the effect big" with "did we see enough of it".
// Both matter and neither is sufficient: a huge swing across six posts and
// a small swing across six hundred are different claims, and collapsing
// them to one number without the sample size would make them look alike.
function strengthFrom(magnitude: number, sampleSize: number): number {
  const effect = Math.min(1, magnitude);
  const confidence = Math.min(1, sampleSize / (MIN_SAMPLE * 4));
  return Math.round(Math.min(1, effect * 0.6 + confidence * 0.4) * 100) / 100;
}

export function deriveSignals(windows: WindowCounts[]): SignalDraft[] {
  const out: SignalDraft[] = [];

  for (const w of windows) {
    const subject = what(w.subject, w.category);
    const place = where(w.province);

    // --- Demand trend -----------------------------------------------------
    if (w.recentDemand >= MIN_SAMPLE && w.priorDemand > 0) {
      const ratio = w.recentDemand / w.priorDemand;
      if (ratio >= RISE_RATIO) {
        const pct = Math.round((ratio - 1) * 100);
        out.push({
          kind: "DEMAND_RISING",
          category: w.category,
          province: w.province,
          subject: w.subject,
          headline: `Demand for ${subject} is up ${pct}%${place}`,
          detail: `${w.recentDemand} buyers looking this period, up from ${w.priorDemand}.`,
          strength: strengthFrom(ratio - 1, w.recentDemand + w.priorDemand),
          sampleSize: w.recentDemand + w.priorDemand,
        });
      } else if (ratio <= FALL_RATIO) {
        const pct = Math.round((1 - ratio) * 100);
        out.push({
          kind: "DEMAND_FALLING",
          category: w.category,
          province: w.province,
          subject: w.subject,
          headline: `Demand for ${subject} is down ${pct}%${place}`,
          detail: `${w.recentDemand} buyers looking this period, down from ${w.priorDemand}.`,
          strength: strengthFrom(1 - ratio, w.recentDemand + w.priorDemand),
          sampleSize: w.recentDemand + w.priorDemand,
        });
      }
    }

    // --- Supply/demand balance -------------------------------------------
    const total = w.recentDemand + w.recentSupply;
    if (total >= MIN_SAMPLE) {
      // Guarded against divide-by-zero by treating "none at all" as one, so
      // 6 buyers and 0 sellers reads as a 6x imbalance rather than Infinity.
      const demandPerSupply = w.recentDemand / Math.max(1, w.recentSupply);
      const supplyPerDemand = w.recentSupply / Math.max(1, w.recentDemand);

      if (w.category === "TRANSPORT" && demandPerSupply >= IMBALANCE_RATIO) {
        out.push({
          kind: "TRANSPORT_SCARCE",
          category: w.category,
          province: w.province,
          subject: w.subject,
          headline: `Transport is scarce${place}`,
          detail: `${w.recentDemand} loads looking for a vehicle against ${w.recentSupply} on offer — book early and expect to pay more.`,
          strength: strengthFrom(demandPerSupply / 4, total),
          sampleSize: total,
        });
      } else if (w.category === "TRANSPORT" && supplyPerDemand >= IMBALANCE_RATIO) {
        out.push({
          kind: "TRANSPORT_AVAILABLE",
          category: w.category,
          province: w.province,
          subject: w.subject,
          headline: `Plenty of transport available${place}`,
          detail: `${w.recentSupply} vehicles on offer against ${w.recentDemand} loads — a good week to negotiate.`,
          strength: strengthFrom(supplyPerDemand / 4, total),
          sampleSize: total,
        });
      } else if (demandPerSupply >= IMBALANCE_RATIO) {
        out.push({
          kind: "SUPPLY_TIGHT",
          category: w.category,
          province: w.province,
          subject: w.subject,
          headline: `More buyers than sellers for ${subject}${place}`,
          detail: `${w.recentDemand} looking to buy against ${w.recentSupply} offering — a seller's market right now.`,
          strength: strengthFrom(demandPerSupply / 4, total),
          sampleSize: total,
        });
      } else if (supplyPerDemand >= IMBALANCE_RATIO) {
        out.push({
          kind: "SUPPLY_GLUT",
          category: w.category,
          province: w.province,
          subject: w.subject,
          headline: `More sellers than buyers for ${subject}${place}`,
          detail: `${w.recentSupply} offering against ${w.recentDemand} looking to buy — expect to compete on price.`,
          strength: strengthFrom(supplyPerDemand / 4, total),
          sampleSize: total,
        });
      }
    }

    // --- Price movement ---------------------------------------------------
    if (
      w.recentMedianPrice != null &&
      w.priorMedianPrice != null &&
      w.priorMedianPrice > 0 &&
      total >= MIN_SAMPLE
    ) {
      const change = (w.recentMedianPrice - w.priorMedianPrice) / w.priorMedianPrice;
      if (Math.abs(change) >= PRICE_MOVE) {
        const rising = change > 0;
        const pct = Math.round(Math.abs(change) * 100);
        out.push({
          kind: rising ? "PRICE_RISING" : "PRICE_FALLING",
          category: w.category,
          province: w.province,
          subject: w.subject,
          headline: `Asking prices for ${subject} are ${rising ? "up" : "down"} ${pct}%${place}`,
          detail: `Median asking price moved from ${Math.round(w.priorMedianPrice)} to ${Math.round(w.recentMedianPrice)}.`,
          strength: strengthFrom(Math.abs(change) * 2, total),
          sampleSize: total,
        });
      }
    }
  }

  return out.sort((a, b) => b.strength - a.strength);
}

// Median rather than mean: one export contract priced in tonnes sits in the
// same column as a smallholder's crate of tomatoes, and a mean would let
// that single row set the "market price" for everyone.
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
