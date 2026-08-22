import "server-only";
import { prisma } from "@/lib/prisma";

// The Farm route remains the owner of these reads and all inventory writes.
// This helper makes that continuity directly testable while the IA around the
// route changes.
export async function loadFarmInventory(farmId: string) {
  const [livestock, produce, equipment] = await Promise.all([
    prisma.livestock.findMany({
      where: { farmId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.produceStock.findMany({
      where: { farmId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.equipment.findMany({
      where: { farmId },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return { livestock, produce, equipment };
}
