import "server-only";
import { prisma } from "@/lib/prisma";
// Signals older than this are stale enough to be misleading, so reads
// filter them out rather than the writer deleting them — keeping the
// history means the trend of the trend is available later.
export const SIGNAL_TTL_HOURS = 36;

// Every fresh signal, split into the caller's region and the national
// picture. Lives here rather than in the page so the freshness cutoff isn't
// computed from the clock during a component render — that's impure, and
// the two halves would drift if the render re-ran.
export async function getFreshSignals(region: string) {
  const fresh = new Date(Date.now() - SIGNAL_TTL_HOURS * 3_600_000);
  const signals = await prisma.marketSignal.findMany({
    where: { computedAt: { gte: fresh } },
    orderBy: [{ strength: "desc" }],
    take: 60,
  });

  return {
    local: signals.filter((s) => s.region === region),
    national: signals.filter((s) => s.region === null),
    total: signals.length,
  };
}

// Signals relevant to one party: their region plus the national picture,
// strongest first. Region-scoped rows outrank national ones at equal
// strength — "transport is scarce in Manicaland" is more actionable to
// someone in Mutare than the same statement about the country.
export async function getSignalsFor(
  party: { region: string },
  limit = 4,
) {
  const fresh = new Date(Date.now() - SIGNAL_TTL_HOURS * 3_600_000);

  const signals = await prisma.marketSignal.findMany({
    where: {
      computedAt: { gte: fresh },
      OR: [{ region: party.region }, { region: null }],
    },
    orderBy: [{ strength: "desc" }],
    take: limit * 3,
  });

  return signals
    .sort((a, b) => {
      const localA = a.region ? 1 : 0;
      const localB = b.region ? 1 : 0;
      if (localA !== localB) return localB - localA;
      return b.strength - a.strength;
    })
    .slice(0, limit);
}
