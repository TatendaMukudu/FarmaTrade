// The market-signal recompute job.
//
// Deliberately NOT behind `server-only`, unlike its read counterpart in
// signals.ts: this runs from a scheduled script and from the seed, both of
// which execute outside Next entirely, where that import throws. The guard
// exists to keep server code out of client bundles — and nothing in a cron
// entrypoint is at risk of ending up in one.
import { prisma } from "@/lib/prisma";
import { deriveSignals, median, type WindowCounts } from "@/lib/signals-core";
import type { PostCategory } from "@/generated/prisma/enums";
import { logger } from "@/lib/logger";

// Two equal-length windows: the recent one against the one immediately
// before it. 14 days matches how agricultural intent actually moves —
// weekly is too noisy to separate a trend from market day, monthly is too
// slow to be useful while a crop is still in the ground.
const WINDOW_DAYS = 14;

type Bucket = {
  category: PostCategory;
  region: string | null;
  subject: string | null;
  recentDemand: number;
  recentSupply: number;
  priorDemand: number;
  priorSupply: number;
  recentPrices: number[];
  priorPrices: number[];
};

function bucketKey(category: PostCategory, region: string | null, subject: string | null) {
  return `${category}|${region ?? ""}|${subject ?? ""}`;
}

// Recomputes every signal from the last two windows and replaces the
// current set. Cheap enough to run whole rather than incrementally: it's
// two indexed scans over a bounded date range, and a full recompute can't
// drift the way an incrementally-updated aggregate can.
export async function recomputeMarketSignals(now = new Date()) {
  const windowEnd = now;
  const windowStart = new Date(now.getTime() - WINDOW_DAYS * 86_400_000);
  const priorStart = new Date(now.getTime() - 2 * WINDOW_DAYS * 86_400_000);

  const posts = await prisma.post.findMany({
    where: {
      createdAt: { gte: priorStart },
      status: { in: ["OPEN", "CLOSED"] },
    },
    select: {
      type: true,
      category: true,
      region: true,
      askingPrice: true,
      quantity: true,
      createdAt: true,
    },
  });

  const buckets = new Map<string, Bucket>();

  // Every post lands in two buckets: one scoped to its region and one
  // national. A farmer in Manicaland cares what's happening in Manicaland;
  // an exporter comparing regions needs the national line, and computing
  // it here is free versus aggregating provinces at read time.
  const add = (
    category: PostCategory,
    region: string | null,
    isDemand: boolean,
    isRecent: boolean,
    unitPrice: number | null,
  ) => {
    const key = bucketKey(category, region, null);
    let b = buckets.get(key);
    if (!b) {
      b = {
        category,
        region,
        subject: null,
        recentDemand: 0,
        recentSupply: 0,
        priorDemand: 0,
        priorSupply: 0,
        recentPrices: [],
        priorPrices: [],
      };
      buckets.set(key, b);
    }
    if (isRecent) {
      if (isDemand) b.recentDemand += 1;
      else b.recentSupply += 1;
      if (unitPrice != null) b.recentPrices.push(unitPrice);
    } else {
      if (isDemand) b.priorDemand += 1;
      else b.priorSupply += 1;
      if (unitPrice != null) b.priorPrices.push(unitPrice);
    }
  };

  for (const p of posts) {
    const isRecent = p.createdAt >= windowStart;
    const isDemand = p.type === "NEED";
    // Per-unit, not per-listing: "10 tonnes for $5,000" and "1 tonne for
    // $500" are the same price, and comparing listing totals would show a
    // price move any time listing sizes changed.
    const price = p.askingPrice != null ? Number(p.askingPrice) : null;
    const unitPrice = price != null && p.quantity != null && p.quantity > 0 ? price / p.quantity : price;

    add(p.category, p.region, isDemand, isRecent, unitPrice);
    add(p.category, null, isDemand, isRecent, unitPrice);
  }

  const windows: WindowCounts[] = [...buckets.values()].map((b) => ({
    category: b.category,
    region: b.region,
    subject: b.subject,
    recentDemand: b.recentDemand,
    recentSupply: b.recentSupply,
    priorDemand: b.priorDemand,
    priorSupply: b.priorSupply,
    recentMedianPrice: median(b.recentPrices),
    priorMedianPrice: median(b.priorPrices),
  }));

  const drafts = deriveSignals(windows);

  await prisma.$transaction(async (tx) => {
    // Replace rather than upsert: a signal that no longer holds has to
    // disappear, and there's no key to upsert a *disappearance* against.
    await tx.marketSignal.deleteMany({});
    if (drafts.length > 0) {
      await tx.marketSignal.createMany({
        data: drafts.map((d) => ({
          kind: d.kind,
          category: d.category,
          region: d.region,
          subject: d.subject,
          headline: d.headline,
          detail: d.detail,
          strength: d.strength,
          sampleSize: d.sampleSize,
          windowStart,
          windowEnd,
        })),
      });
    }
  });

  logger.info("signals.recomputed", { count: drafts.length, windows: windows.length });
  return drafts.length;
}
