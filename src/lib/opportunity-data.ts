import "server-only";
import { prisma } from "@/lib/prisma";

// Removing Opportunities from primary navigation must not change the query
// that powers the reachable trade-history surface.
export function loadActiveOpportunities(partyId: string) {
  return prisma.match.findMany({
    where: {
      status: { in: ["SUGGESTED", "NEGOTIATING", "AGREED", "ACCEPTED"] },
      OR: [{ intentA: { partyId } }, { intentB: { partyId } }],
    },
    include: {
      intentA: {
        include: { party: { include: { reputation: true } }, photos: { select: { id: true } } },
      },
      intentB: {
        include: { party: { include: { reputation: true } }, photos: { select: { id: true } } },
      },
      confirmations: true,
      terms: { include: { acceptances: { select: { partyId: true } } } },
    },
    orderBy: { score: "desc" },
  });
}
