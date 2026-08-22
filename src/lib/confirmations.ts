import "server-only";
import { prisma } from "@/lib/prisma";
import { pendingStamps, stampBanner, type StampableMatch } from "@/lib/confirmations-core";
import { summarizePrices, type PricedListing, type PriceSignal } from "@/lib/price-signals";
import { PRICE_WINDOW_DAYS } from "@/lib/price-signals";
import { resolveMatchSides } from "@/lib/match-view";
import { resolvePrice, type ResolvedPrice } from "@/lib/pricing";
import { currencyByCode, multiplyMoney, type Money } from "@/lib/money";
import { unitByCode, type CanonicalUnit } from "@/lib/measurement";

export { pendingStamps, stampBanner };

// Trades this party agreed to and hasn't put on the record yet.
//
// Reads AGREED matches rather than COMPLETED ones: a match only becomes
// COMPLETED once both sides have filed, so by definition everything
// outstanding is still sitting in AGREED. That is also why the count can
// never be reconstructed from Match.status alone.
//
// Legacy ACCEPTED rows are included. Their consent was never proven, so
// they reserve no capacity — but two parties may well have traded on one
// before this release, and refusing to let them file a report about it
// would lose real history.
export async function loadPendingStamps(partyId: string, now = new Date()) {
  const accepted = await prisma.match.findMany({
    where: {
      status: { in: ["AGREED", "ACCEPTED"] },
      OR: [{ intentA: { partyId } }, { intentB: { partyId } }],
    },
    include: {
      intentA: { include: { party: { select: { id: true, name: true } } } },
      intentB: { include: { party: { select: { id: true, name: true } } } },
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

// Asking RATES near this party.
//
// It used to divide askingPrice by quantity, which assumed the stored number
// was a total for the lot. estimatedIntentValue multiplied by quantity,
// assuming the opposite. Only one of those could be right and nothing in the
// data settled which, so neither reading survives: a listing now contributes
// a rate only when its price records what it means, and is excluded
// entirely when it does not.
//
// That makes the signal smaller and true rather than larger and unreliable.
// A range built from numbers that might be totals and might be rates is
// worse than no range, because a farmer will price their harvest against it.
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

  const intents = await prisma.intent.findMany({
    where: {
      countryCode: party.countryCode,
      province: party.province,
      askingPrice: { not: null },
      // Only rows whose price says what it means. Legacy ambiguous prices
      // are excluded here rather than filtered later, so they never reach
      // the arithmetic at all.
      priceBasis: { not: null },
      createdAt: { gte: since },
      status: { in: ["ACTIVE", "ENGAGED", "WITHDRAWN"] },
    },
    select: {
      askingPrice: true,
      priceCurrency: true,
      priceBasis: true,
      priceUnitCode: true,
      quantity: true,
      unit: true,
      unitCode: true,
      category: true,
      district: true,
      createdAt: true,
      produce: { select: { cropType: true } },
    },
    take: 2000,
  });

  const listings: PricedListing[] = intents.flatMap((p) => {
    const stored = {
      amount: p.askingPrice == null ? null : Number(p.askingPrice),
      currencyCode: p.priceCurrency,
      basis: p.priceBasis,
      perUnitCode: p.priceUnitCode,
    };
    const resolved = resolvePrice(stored, currencyByCode);
    if (!resolved.ok) return [];

    const rate = asRate(resolved.price, { value: p.quantity, unitCode: p.unitCode });
    if (!rate) return [];

    return [
      {
        subject: p.produce?.cropType?.trim() || categoryLabel(p.category),
        district: p.district,
        unit: rate.unit.one,
        currencyCode: rate.money.currency.code,
        unitPrice: rate.money.minor,
        postedAt: p.createdAt,
      },
    ];
  });

  return summarizePrices(listings, now);
}

// A listing's asking rate, per one canonical unit.
//
// A PER_UNIT price already is one — no division, and that is the whole
// point. A TOTAL price becomes one only when there is a measurable quantity
// to divide by, which is where the old unconditional division was wrong: it
// divided every price by every quantity regardless of what either meant.
//
// Anything else contributes nothing. A total for ten bags of unknown mass is
// a real price and not a rate, and inventing a per-kilogram figure for it
// would be exactly the fabrication this phase exists to stop.
function asRate(
  price: ResolvedPrice,
  quantity: { value: number | null; unitCode: string | null },
): { money: Money; unit: CanonicalUnit } | null {
  if (price.basis === "PER_UNIT" && price.perUnit) {
    return { money: price.money, unit: price.perUnit };
  }

  const unit = unitByCode(quantity.unitCode);
  if (!unit || quantity.value == null || quantity.value <= 0) return null;
  const { value } = multiplyMoney(price.money, 1 / quantity.value);
  return { money: value, unit };
}

function categoryLabel(category: string): string {
  return category.charAt(0) + category.slice(1).toLowerCase();
}
