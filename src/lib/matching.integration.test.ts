// Integration test: exercises generateMatchesForPost against a real
// Postgres (the same one CI stands up), covering the DB query/candidate
// selection that scoreMatch's unit tests (matching-core.test.ts) can't
// reach on their own — geoFilter, skipDuplicates, and the opposite-type/
// same-category constraints. No request-runtime mocking needed here:
// generateMatchesForPost never touches cookies/headers/redirect.
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { generateMatchesForPost } from "@/lib/matching";
import { createTestParty, createTestPost, cleanupParties } from "@/test/factories";

describe("generateMatchesForPost", () => {
  const partyIds: string[] = [];
  afterEach(async () => {
    await cleanupParties(partyIds.splice(0));
  });

  it("matches a NEED against an existing opposite-type, same-category, same-province HAVE", async () => {
    const seller = await createTestParty({ province: "Harare", district: "Harare" });
    const buyer = await createTestParty({ province: "Harare", district: "Harare" });
    partyIds.push(seller.party.id, buyer.party.id);

    const have = await createTestPost(seller.party.id, { type: "HAVE", category: "PRODUCE" });
    const need = await createTestPost(buyer.party.id, { type: "NEED", category: "PRODUCE" });

    await generateMatchesForPost(need.id);

    const match = await prisma.match.findFirst({ where: { postAId: have.id, postBId: need.id } });
    expect(match).not.toBeNull();
    expect(match!.reasons).toContain("same district");
  });

  it("does not match posts in different provinces for a non-TRANSPORT category", async () => {
    const seller = await createTestParty({ province: "Manicaland", district: "Mutare" });
    const buyer = await createTestParty({ province: "Harare", district: "Harare" });
    partyIds.push(seller.party.id, buyer.party.id);

    const have = await createTestPost(seller.party.id, {
      type: "HAVE",
      category: "PRODUCE",
      province: "Manicaland",
      district: "Mutare",
    });
    const need = await createTestPost(buyer.party.id, {
      type: "NEED",
      category: "PRODUCE",
      province: "Harare",
      district: "Harare",
    });

    await generateMatchesForPost(need.id);

    const match = await prisma.match.findFirst({ where: { postAId: have.id, postBId: need.id } });
    expect(match).toBeNull();
  });

  it("does not match a post against itself or against the same party's other posts", async () => {
    const party = await createTestParty({ province: "Harare", district: "Harare" });
    partyIds.push(party.party.id);

    const have = await createTestPost(party.party.id, { type: "HAVE", category: "PRODUCE" });
    const need = await createTestPost(party.party.id, { type: "NEED", category: "PRODUCE" });

    await generateMatchesForPost(need.id);

    const match = await prisma.match.findFirst({ where: { postAId: have.id, postBId: need.id } });
    expect(match).toBeNull();
  });

  it("does not match against a CLOSED post", async () => {
    const seller = await createTestParty({ province: "Harare", district: "Harare" });
    const buyer = await createTestParty({ province: "Harare", district: "Harare" });
    partyIds.push(seller.party.id, buyer.party.id);

    const have = await createTestPost(seller.party.id, { type: "HAVE", category: "PRODUCE", status: "CLOSED" });
    const need = await createTestPost(buyer.party.id, { type: "NEED", category: "PRODUCE" });

    await generateMatchesForPost(need.id);

    const match = await prisma.match.findFirst({ where: { postAId: have.id, postBId: need.id } });
    expect(match).toBeNull();
  });

  it("credits a TRANSPORT candidate whose destination lands in the new post's province, across provinces", async () => {
    const transporter = await createTestParty({ province: "Harare", district: "Harare" });
    const shipper = await createTestParty({ province: "Manicaland", district: "Mutare" });
    partyIds.push(transporter.party.id, shipper.party.id);

    const have = await prisma.post.create({
      data: {
        partyId: transporter.party.id,
        type: "HAVE",
        category: "TRANSPORT",
        title: "Truck available",
        province: "Harare",
        district: "Harare",
        destinationProvince: "Manicaland",
        status: "OPEN",
      },
    });
    const need = await createTestPost(shipper.party.id, {
      type: "NEED",
      category: "TRANSPORT",
      province: "Manicaland",
      district: "Mutare",
    });

    await generateMatchesForPost(need.id);

    const match = await prisma.match.findFirst({ where: { postAId: have.id, postBId: need.id } });
    expect(match).not.toBeNull();
    expect(match!.reasons).toContain("on your route");
  });

  it("is idempotent: re-running against the same pair doesn't create a duplicate Match", async () => {
    const seller = await createTestParty({ province: "Harare", district: "Harare" });
    const buyer = await createTestParty({ province: "Harare", district: "Harare" });
    partyIds.push(seller.party.id, buyer.party.id);

    await createTestPost(seller.party.id, { type: "HAVE", category: "PRODUCE" });
    const need = await createTestPost(buyer.party.id, { type: "NEED", category: "PRODUCE" });

    await generateMatchesForPost(need.id);
    await generateMatchesForPost(need.id);

    const matches = await prisma.match.findMany({ where: { postBId: need.id } });
    expect(matches).toHaveLength(1);
  });
});
