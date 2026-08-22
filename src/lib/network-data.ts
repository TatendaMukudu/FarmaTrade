import "server-only";
import { prisma } from "@/lib/prisma";

// The canonical counterparty lookup used by Network. Keeping the id lookup in
// one server helper lets the route rename preserve the identity and disclosure
// boundary without duplicating a second profile query.
export function loadNetworkParty(partyId: string) {
  return prisma.party.findUnique({
    where: { id: partyId },
    include: {
      farm: {
        include: {
          _count: { select: { livestock: true, produce: true, equipment: true } },
        },
      },
      transportProfile: true,
      reputation: true,
    },
  });
}
