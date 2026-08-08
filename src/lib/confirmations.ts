import "server-only";
import { prisma } from "@/lib/prisma";
import { pendingStamps, stampBanner, type StampableMatch } from "@/lib/confirmations-core";
import { summarizePrices, type PricedListing, type PriceSignal } from "@/lib/price-signals";
import { PRICE_WINDOW_DAYS } from "@/lib/price-signals";
import { resolveMatchSides } from "@/lib/match-view";
import { regionFor } from "@/lib/regions";

export { pendingStamps, stampBanner };

// Trades this party agreed to and hasn't put on the record yet.
//
// Reads ACCEPTED matches rather than COMPLETED ones: a match only becomes
// COMPLETED once both sides have filed, so by definition everything
// outstanding is still sitting in ACCEPTED. That is also why the count can
// never be reconstructed from Match.status alone.
export async function loadPendingStamps(partyId: string, now = new Date()) {
  const accepted = await prisma.match.findMany({
    where: {
      status: "ACCEPTED",
      OR: [{ postA: { partyId } }, { postB: { partyId } }],
    },
    include: {
      postA: { include: { party: { select: { id: true, name: true } } } },
      postB: { include: { party: { select: { id: true, name: true } } } },
      confirmations: { select: { partyId: true } },
    },
  });

  const stampable: StampableMatch[] = accepted.map((m) => {
    const { yours, theirs } = resolveMatchSides(m, partyId);
    return {
      matchId: m.id,
      counterpartyName: theirs.party.name,
      title: yours.title,
      // updatedAt is when the row last changed, which for an ACCEPTED match
      // is the moment it was accepted — there is no separate acceptedAt, and
      // adding one would be a migration for a value we already have.
      agreedAt: m.updatedAt,
      youStamped: m.confirmations.some((c) => c.partyId === partyId),
      counterpartyStamped: m.confirmations.some((c) => c.partyId !== partyId),
    };
  });

  return pendingStamps(stampable, now);
}

// Asking prices near this party, from posts that carry both a price and a
// quantity to divide it by.
//
// Scoped to the party's own province rather than the whole network: a price
// four provinces away is not a price this farmer can get, and blending it in
// would quietly mislead. Crop type where a post links to real produce,
// category otherwise — a free-text title is not something to group on.
export async function loadPriceSignals(
  party: { province: string; countryCode: string },
  now = new Date(),
): Promise<PriceSignal[]> {
  const since = new Date(now.getTime() - PRICE_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const posts = await prisma.post.findMany({
    where: {
      countryCode: party.countryCode,
      province: party.province,
      askingPrice: { not: null },
      quantity: { gt: 0 },
      createdAt: { gte: since },
      status: { in: ["OPEN", "MATCHED", "CLOSED"] },
    },
    select: {
      askingPrice: true,
      quantity: true,
      unit: true,
      category: true,
      district: true,
      createdAt: true,
      produce: { select: { cropType: true } },
    },
    take: 2000,
  });

  const listings: PricedListing[] = posts.flatMap((p) => {
    const quantity = p.quantity ?? 0;
    if (quantity <= 0 || p.askingPrice == null) return [];
    const unit = p.unit?.trim();
    if (!unit) return [];
    return [
      {
        subject: p.produce?.cropType?.trim() || categoryLabel(p.category),
        district: p.district,
        unit,
        unitPrice: Number(p.askingPrice) / quantity,
        postedAt: p.createdAt,
      },
    ];
  });

  return summarizePrices(listings, now, regionFor(party.countryCode).currencySymbol);
}

function categoryLabel(category: string): string {
  return category.charAt(0) + category.slice(1).toLowerCase();
}
