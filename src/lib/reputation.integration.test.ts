// Reputation is a derived view over two kinds of evidence that must never
// collapse: observed transaction outcomes and subjective human ratings.
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { recomputeReputation } from "@/lib/reputation";
import {
  cleanupParties,
  createTestIntent,
  createTestMatch,
  createTestParty,
} from "@/test/factories";

describe("reputation evidence boundaries", () => {
  const partyIds: string[] = [];

  afterEach(async () => cleanupParties(partyIds.splice(0)));

  async function completedPair() {
    const [{ party: supplier }, { party: buyer }] = await Promise.all([
      createTestParty(),
      createTestParty(),
    ]);
    partyIds.push(supplier.id, buyer.id);
    const supply = await createTestIntent(supplier.id, { side: "SUPPLY" });
    const demand = await createTestIntent(buyer.id, { side: "DEMAND" });
    const match = await createTestMatch(supply.id, demand.id, "ACCEPTED");
    await prisma.match.update({ where: { id: match.id }, data: { status: "COMPLETED" } });
    return { supplier, buyer, match };
  }

  it("counts quiet successful execution when nobody writes a review", async () => {
    const { supplier, match } = await completedPair();
    await prisma.transactionConfirmation.create({
      data: { matchId: match.id, partyId: supplier.id, outcome: "COMPLETED_GOOD" },
    });

    await recomputeReputation(supplier.id);

    const reputation = await prisma.reputation.findUniqueOrThrow({
      where: { partyId: supplier.id },
    });
    expect(reputation.completedCount).toBe(1);
    expect(reputation.completedGoodCount).toBe(1);
    expect(reputation.ratingCount).toBe(0);
    expect(reputation.averageRating).toBeNull();
  });

  it("keeps a subjective rating from rewriting the observed outcome", async () => {
    const { supplier, buyer, match } = await completedPair();
    await prisma.transactionConfirmation.create({
      data: { matchId: match.id, partyId: supplier.id, outcome: "COMPLETED_GOOD" },
    });
    await prisma.rating.create({
      data: {
        matchId: match.id,
        authorId: buyer.id,
        subjectId: supplier.id,
        score: 1,
        comment: "Subjective disagreement",
      },
    });

    await recomputeReputation(supplier.id);

    const reputation = await prisma.reputation.findUniqueOrThrow({
      where: { partyId: supplier.id },
    });
    expect(reputation.averageRating).toBe(1);
    expect(reputation.ratingCount).toBe(1);
    expect(reputation.completedCount).toBe(1);
    expect(reputation.completedGoodCount).toBe(1);
    expect(reputation.completedIssueCount).toBe(0);
  });
});
