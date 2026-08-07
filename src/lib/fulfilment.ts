import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { logger } from "@/lib/logger";

// Settling the goods, once a trade is confirmed by both sides.
//
// Completing a match used to update only the *trust* ledger — reputation,
// relations, operational memory — and never the goods. So a farmer who sold
// three tonnes of oranges and logged it as gone well still had three tonnes
// of oranges on their farm page, a listing still openly matching against
// buyers for a crop already on a truck, and a harvest-draft generator that
// would eventually offer to re-list it.
//
// Two ledgers, both of which have to move when a trade closes:
//   - the listing lifecycle: a fulfilled post is not still for sale
//   - the inventory: goods that changed hands have left the farm
//
// Deliberately conservative about what it touches. Only the supply side has
// inventory to reduce, only a post actually linked to an inventory row can
// be reduced at all, and a rental doesn't remove the asset — it comes back.

export async function settleFulfilment(
  matchId: string,
  db: Prisma.TransactionClient = prisma,
) {
  const match = await db.match.findUnique({
    where: { id: matchId },
    include: { postA: true, postB: true },
  });
  if (!match) return;

  const supply = match.postA.type === "HAVE" ? match.postA : match.postB;
  const demand = match.postA.type === "HAVE" ? match.postB : match.postA;

  // --- Listing lifecycle -------------------------------------------------
  // A standing order is the explicit exception: `recurring` means "I buy
  // this every month", and closing it on the first fulfilled trade would
  // delete exactly the intent the flag exists to express.
  const toClose = [supply, demand].filter((p) => !p.recurring && p.status === "OPEN");
  if (toClose.length > 0) {
    await db.post.updateMany({
      where: { id: { in: toClose.map((p) => p.id) } },
      data: { status: "CLOSED" },
    });
  }

  // --- Inventory ---------------------------------------------------------
  // Only the supplying side had goods to give up.
  const sold = supply.quantity;

  if (supply.produceId && sold != null) {
    // Floored at zero rather than allowed negative: the listed quantity and
    // the stock row can legitimately disagree (someone edits one and not
    // the other), and a farm page reading "-2 tonnes" is a worse answer
    // than "none left".
    const stock = await db.produceStock.findUnique({
      where: { id: supply.produceId },
      select: { quantity: true },
    });
    if (stock) {
      await db.produceStock.update({
        where: { id: supply.produceId },
        data: { quantity: Math.max(0, stock.quantity - sold) },
      });
    }
  }

  if (supply.livestockId && sold != null) {
    const herd = await db.livestock.findUnique({
      where: { id: supply.livestockId },
      select: { quantity: true },
    });
    if (herd) {
      await db.livestock.update({
        where: { id: supply.livestockId },
        // Livestock is counted in whole animals.
        data: { quantity: Math.max(0, herd.quantity - Math.round(sold)) },
      });
    }
  }

  if (supply.equipmentId) {
    // A sale means the machine is gone; a rental means it's out and coming
    // back. Marking a rented tractor permanently unavailable would quietly
    // remove a farmer's own equipment from their books the first time they
    // hired it out — which is the opposite of what renting it out means.
    if (supply.objective === "SELL") {
      await db.equipment.update({
        where: { id: supply.equipmentId },
        data: { available: false },
      });
    }
  }

  logger.info("fulfilment.settled", {
    matchId,
    closedPosts: toClose.length,
    quantitySettled: sold ?? 0,
  });
}
