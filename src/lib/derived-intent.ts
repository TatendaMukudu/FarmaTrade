import "server-only";
import { prisma } from "@/lib/prisma";
import { formatQuantity } from "@/lib/units";

const HARVEST_WINDOW_DAYS = 7;

// Intent FarmaTrade derives from what it already knows, rather than asking
// the farmer to state it.
//
// This is the shape the whole product is moving toward: FarmaTrade has the
// produce row, the quantity and the expected harvest date, so it proposes
// the availability and the farmer confirms. The farmer never advertises
// something the system already knows.
//
// Deterministic date trigger, not a prediction. Confirm-gated: a PROPOSED
// intent never matches against anything until its owner confirms it, so
// nothing is ever said on their behalf.
//
// Idempotent by construction — checked, not remembered: a produce row that
// already has a live intent attached is skipped, so calling this on every
// page load never creates duplicates.
export async function ensureDerivedIntent(farmId: string, party: { id: string; province: string; district: string }) {
  const windowEnd = new Date();
  windowEnd.setDate(windowEnd.getDate() + HARVEST_WINDOW_DAYS);

  const dueProduce = await prisma.produceStock.findMany({
    where: {
      farmId,
      quantity: { gt: 0 },
      expectedHarvestDate: { not: null, lte: windowEnd },
      posts: { none: { status: { not: "CLOSED" } } },
    },
  });

  if (dueProduce.length === 0) return;

  await prisma.post.createMany({
    data: dueProduce.map((item) => ({
      partyId: party.id,
      type: "HAVE",
      category: "PRODUCE",
      title: `${formatQuantity(item.quantity, item.unit)} of ${item.cropType}`,
      quantity: item.quantity,
      unit: item.unit,
      province: party.province,
      district: party.district,
      status: "DRAFT",
      // FarmaTrade proposed this; the farmer did not write it.
      origin: "DERIVED",
      urgent: item.perishable,
      produceId: item.id,
    })),
  });
}
