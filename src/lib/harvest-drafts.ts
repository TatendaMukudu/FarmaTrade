import "server-only";
import { prisma } from "@/lib/prisma";
import { formatQuantity } from "@/lib/units";

const HARVEST_DRAFT_WINDOW_DAYS = 7;

// Deterministic date trigger, not a prediction — a ProduceStock row with an
// expectedHarvestDate inside the window gets a DRAFT Post so the farmer's
// experience is "we noticed this is coming, confirm to list" instead of
// "remember to log in and post it." Confirm-gated: a DRAFT never matches
// against anything until the owner publishes it (see confirmDraftPost).
//
// Idempotent by construction — checked, not remembered: a produce row that
// already has a non-CLOSED post attached is skipped, so calling this on
// every page load never creates duplicates.
export async function ensureHarvestDrafts(farmId: string, party: { id: string; province: string; district: string }) {
  const windowEnd = new Date();
  windowEnd.setDate(windowEnd.getDate() + HARVEST_DRAFT_WINDOW_DAYS);

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
      urgent: item.perishable,
      produceId: item.id,
    })),
  });
}
