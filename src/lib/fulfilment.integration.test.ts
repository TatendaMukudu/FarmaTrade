// Integration test for the goods ledger, against real Postgres.
//
// The first case here is the bug as it was actually reported: sell three
// tonnes of oranges, confirm it went well, and the farm still says three
// tonnes are sitting there.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeCookies, resetNextRuntime } from "@/test/next-runtime-stub";
import { createTestParty, createTestPost, createTestMatch, cleanupParties } from "@/test/factories";

vi.mock("next/headers", () => ({
  cookies: async () => fakeCookies,
  headers: async () => ({ get: () => null }),
}));
vi.mock("next/navigation", () => ({ redirect: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { confirmMatch } = await import("@/app/dashboard/opportunities/actions");
const { createSession } = await import("@/lib/auth");
const { prisma } = await import("@/lib/prisma");

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const loginAs = (userId: string) => createSession(userId, 0);

async function farmFor(partyId: string) {
  return prisma.farm.create({ data: { partyId, farmName: "Test Orchard" } });
}

async function completeBothSides(matchId: string, sellerUserId: string, buyerUserId: string) {
  await loginAs(sellerUserId);
  await confirmMatch({}, formData({ matchId, outcome: "COMPLETED_GOOD" }));
  await loginAs(buyerUserId);
  await confirmMatch({}, formData({ matchId, outcome: "COMPLETED_GOOD" }));
}

describe("settling the goods when a trade completes", () => {
  const partyIds: string[] = [];
  beforeEach(() => resetNextRuntime());
  afterEach(async () => {
    await cleanupParties(partyIds.splice(0));
  });

  it("takes the sold quantity off the farm's produce stock", async () => {
    const seller = await createTestParty({ province: "Harare", district: "Harare" });
    const buyer = await createTestParty({ province: "Harare", district: "Harare" });
    partyIds.push(seller.party.id, buyer.party.id);

    const farm = await farmFor(seller.party.id);
    const stock = await prisma.produceStock.create({
      data: { farmId: farm.id, cropType: "Oranges", quantity: 3, unit: "TONNE" },
    });

    const have = await prisma.post.create({
      data: {
        partyId: seller.party.id,
        objective: "SELL",
        type: "HAVE",
        category: "PRODUCE",
        title: "3 tonnes of oranges",
        province: "Harare",
        district: "Harare",
        quantity: 3,
        produceId: stock.id,
      },
    });
    const need = await createTestPost(buyer.party.id, { objective: "BUY", quantity: 3 });
    const match = await createTestMatch(have.id, need.id, "ACCEPTED");

    await completeBothSides(match.id, seller.user.id, buyer.user.id);

    const after = await prisma.produceStock.findUnique({ where: { id: stock.id } });
    expect(after!.quantity).toBe(0);
  });

  it("takes off only what was actually sold on a partial sale", async () => {
    const seller = await createTestParty({ province: "Harare", district: "Harare" });
    const buyer = await createTestParty({ province: "Harare", district: "Harare" });
    partyIds.push(seller.party.id, buyer.party.id);

    const farm = await farmFor(seller.party.id);
    const stock = await prisma.produceStock.create({
      data: { farmId: farm.id, cropType: "Maize", quantity: 10, unit: "TONNE" },
    });

    const have = await prisma.post.create({
      data: {
        partyId: seller.party.id,
        objective: "SELL",
        type: "HAVE",
        category: "PRODUCE",
        title: "4 tonnes of maize",
        province: "Harare",
        district: "Harare",
        quantity: 4,
        produceId: stock.id,
      },
    });
    const need = await createTestPost(buyer.party.id, { objective: "BUY", quantity: 4 });
    const match = await createTestMatch(have.id, need.id, "ACCEPTED");

    await completeBothSides(match.id, seller.user.id, buyer.user.id);

    expect((await prisma.produceStock.findUnique({ where: { id: stock.id } }))!.quantity).toBe(6);
  });

  it("closes both posts so sold goods stop matching", async () => {
    const seller = await createTestParty({ province: "Harare", district: "Harare" });
    const buyer = await createTestParty({ province: "Harare", district: "Harare" });
    partyIds.push(seller.party.id, buyer.party.id);

    const have = await createTestPost(seller.party.id, { objective: "SELL", quantity: 2 });
    const need = await createTestPost(buyer.party.id, { objective: "BUY", quantity: 2 });
    const match = await createTestMatch(have.id, need.id, "ACCEPTED");

    await completeBothSides(match.id, seller.user.id, buyer.user.id);

    expect((await prisma.post.findUnique({ where: { id: have.id } }))!.status).toBe("CLOSED");
    expect((await prisma.post.findUnique({ where: { id: need.id } }))!.status).toBe("CLOSED");
  });

  it("leaves a standing order open — that's the whole point of the flag", async () => {
    const seller = await createTestParty({ province: "Harare", district: "Harare" });
    const buyer = await createTestParty({ province: "Harare", district: "Harare" });
    partyIds.push(seller.party.id, buyer.party.id);

    const have = await createTestPost(seller.party.id, { objective: "SELL", quantity: 2 });
    const need = await prisma.post.create({
      data: {
        partyId: buyer.party.id,
        objective: "BUY",
        type: "NEED",
        category: "PRODUCE",
        title: "Maize, every month",
        province: "Harare",
        district: "Harare",
        quantity: 2,
        recurring: true,
      },
    });
    const match = await createTestMatch(have.id, need.id, "ACCEPTED");

    await completeBothSides(match.id, seller.user.id, buyer.user.id);

    expect((await prisma.post.findUnique({ where: { id: have.id } }))!.status).toBe("CLOSED");
    expect((await prisma.post.findUnique({ where: { id: need.id } }))!.status).toBe("OPEN");
  });

  it("never drives stock negative when the listing overstates what's on hand", async () => {
    const seller = await createTestParty({ province: "Harare", district: "Harare" });
    const buyer = await createTestParty({ province: "Harare", district: "Harare" });
    partyIds.push(seller.party.id, buyer.party.id);

    const farm = await farmFor(seller.party.id);
    const stock = await prisma.produceStock.create({
      data: { farmId: farm.id, cropType: "Oranges", quantity: 1, unit: "TONNE" },
    });
    const have = await prisma.post.create({
      data: {
        partyId: seller.party.id,
        objective: "SELL",
        type: "HAVE",
        category: "PRODUCE",
        title: "5 tonnes of oranges",
        province: "Harare",
        district: "Harare",
        quantity: 5,
        produceId: stock.id,
      },
    });
    const need = await createTestPost(buyer.party.id, { objective: "BUY", quantity: 5 });
    const match = await createTestMatch(have.id, need.id, "ACCEPTED");

    await completeBothSides(match.id, seller.user.id, buyer.user.id);

    expect((await prisma.produceStock.findUnique({ where: { id: stock.id } }))!.quantity).toBe(0);
  });

  it("does not touch stock until both sides have confirmed", async () => {
    const seller = await createTestParty({ province: "Harare", district: "Harare" });
    const buyer = await createTestParty({ province: "Harare", district: "Harare" });
    partyIds.push(seller.party.id, buyer.party.id);

    const farm = await farmFor(seller.party.id);
    const stock = await prisma.produceStock.create({
      data: { farmId: farm.id, cropType: "Oranges", quantity: 3, unit: "TONNE" },
    });
    const have = await prisma.post.create({
      data: {
        partyId: seller.party.id,
        objective: "SELL",
        type: "HAVE",
        category: "PRODUCE",
        title: "3 tonnes of oranges",
        province: "Harare",
        district: "Harare",
        quantity: 3,
        produceId: stock.id,
      },
    });
    const need = await createTestPost(buyer.party.id, { objective: "BUY", quantity: 3 });
    const match = await createTestMatch(have.id, need.id, "ACCEPTED");

    await loginAs(seller.user.id);
    await confirmMatch({}, formData({ matchId: match.id, outcome: "COMPLETED_GOOD" }));

    // One-sided confirmation isn't a completed trade — the buyer hasn't
    // agreed it happened, so nothing has left the farm yet.
    expect((await prisma.produceStock.findUnique({ where: { id: stock.id } }))!.quantity).toBe(3);
    expect((await prisma.post.findUnique({ where: { id: have.id } }))!.status).toBe("OPEN");
  });

  it("marks sold equipment unavailable but leaves rented equipment on the books", async () => {
    const owner = await createTestParty({ province: "Harare", district: "Harare" });
    const other = await createTestParty({ province: "Harare", district: "Harare" });
    partyIds.push(owner.party.id, other.party.id);

    const farm = await farmFor(owner.party.id);
    const sold = await prisma.equipment.create({
      data: { farmId: farm.id, name: "Old plough", category: "PLOUGH" },
    });
    const rented = await prisma.equipment.create({
      data: { farmId: farm.id, name: "Tractor", category: "TRACTOR" },
    });

    async function trade(objective: "SELL" | "RENT_OUT", equipmentId: string) {
      const have = await prisma.post.create({
        data: {
          partyId: owner.party.id,
          objective,
          type: "HAVE",
          category: "EQUIPMENT",
          title: objective,
          province: "Harare",
          district: "Harare",
          equipmentId,
        },
      });
      const need = await createTestPost(other.party.id, {
        objective: objective === "SELL" ? "BUY" : "RENT",
        category: "EQUIPMENT",
      });
      const match = await createTestMatch(have.id, need.id, "ACCEPTED");
      await completeBothSides(match.id, owner.user.id, other.user.id);
    }

    await trade("SELL", sold.id);
    await trade("RENT_OUT", rented.id);

    expect((await prisma.equipment.findUnique({ where: { id: sold.id } }))!.available).toBe(false);
    // A hired-out tractor comes back. Marking it gone would quietly delete
    // a farmer's own machine from their books.
    expect((await prisma.equipment.findUnique({ where: { id: rented.id } }))!.available).toBe(true);
  });
});
