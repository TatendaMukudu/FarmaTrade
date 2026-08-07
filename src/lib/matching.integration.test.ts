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

  it("matches a NEED against a counterpart HAVE in the same place", async () => {
    const seller = await createTestParty({ region: "Harare", locality: "Harare" });
    const buyer = await createTestParty({ region: "Harare", locality: "Harare" });
    partyIds.push(seller.party.id, buyer.party.id);

    const have = await createTestPost(seller.party.id, { objective: "SELL", category: "PRODUCE" });
    const need = await createTestPost(buyer.party.id, { objective: "BUY", category: "PRODUCE" });

    await generateMatchesForPost(need.id);

    const match = await prisma.match.findFirst({ where: { postAId: have.id, postBId: need.id } });
    expect(match).not.toBeNull();
    // Proximity is now cited as a measured distance, not as a boundary
    // test — two posts at the same centroid are zero km apart.
    expect(match!.reasons).toContain("right nearby");
  });

  it("does not match posts in different provinces for a non-TRANSPORT category", async () => {
    const seller = await createTestParty({ region: "Manicaland", locality: "Mutare" });
    const buyer = await createTestParty({ region: "Harare", locality: "Harare" });
    partyIds.push(seller.party.id, buyer.party.id);

    const have = await createTestPost(seller.party.id, {
      objective: "SELL",
      category: "PRODUCE",
      region: "Manicaland",
      locality: "Mutare",
    });
    const need = await createTestPost(buyer.party.id, {
      objective: "BUY",
      category: "PRODUCE",
      region: "Harare",
      locality: "Harare",
    });

    await generateMatchesForPost(need.id);

    const match = await prisma.match.findFirst({ where: { postAId: have.id, postBId: need.id } });
    expect(match).toBeNull();
  });

  it("does not match a post against itself or against the same party's other posts", async () => {
    const party = await createTestParty({ region: "Harare", locality: "Harare" });
    partyIds.push(party.party.id);

    const have = await createTestPost(party.party.id, { objective: "SELL", category: "PRODUCE" });
    const need = await createTestPost(party.party.id, { objective: "BUY", category: "PRODUCE" });

    await generateMatchesForPost(need.id);

    const match = await prisma.match.findFirst({ where: { postAId: have.id, postBId: need.id } });
    expect(match).toBeNull();
  });

  it("does not match against a CLOSED post", async () => {
    const seller = await createTestParty({ region: "Harare", locality: "Harare" });
    const buyer = await createTestParty({ region: "Harare", locality: "Harare" });
    partyIds.push(seller.party.id, buyer.party.id);

    const have = await createTestPost(seller.party.id, { objective: "SELL", category: "PRODUCE", status: "CLOSED" });
    const need = await createTestPost(buyer.party.id, { objective: "BUY", category: "PRODUCE" });

    await generateMatchesForPost(need.id);

    const match = await prisma.match.findFirst({ where: { postAId: have.id, postBId: need.id } });
    expect(match).toBeNull();
  });

  it("credits a TRANSPORT candidate whose destination lands on the new post's location", async () => {
    const transporter = await createTestParty({ region: "Harare", locality: "Harare" });
    const shipper = await createTestParty({ region: "Manicaland", locality: "Mutare" });
    partyIds.push(transporter.party.id, shipper.party.id);

    const have = await prisma.post.create({
      data: {
        partyId: transporter.party.id,
        objective: "TRANSPORT_OFFER",
        type: "HAVE",
        category: "TRANSPORT",
        title: "Truck available",
        region: "Harare",
        locality: "Harare",
        // Placed, as a real post created through the composer would be.
        latitude: -17.83,
        longitude: 31.05,
        destinationProvince: "Manicaland",
        status: "OPEN",
      },
    });
    const need = await createTestPost(shipper.party.id, {
      objective: "TRANSPORT_NEED",
      category: "TRANSPORT",
      region: "Manicaland",
      locality: "Mutare",
    });

    await generateMatchesForPost(need.id);

    const match = await prisma.match.findFirst({ where: { postAId: have.id, postBId: need.id } });
    expect(match).not.toBeNull();
    expect(match!.reasons).toContain("on your route");
  });

  it("does not pair a tractor for sale with someone looking to rent one", async () => {
    // The bug the objective layer exists to fix: under the old
    // opposite-PostType + same-category rule these two were a confident,
    // cited match, because SELL and RENT are both EQUIPMENT pointing in
    // opposite directions.
    const seller = await createTestParty({ region: "Harare", locality: "Harare" });
    const renter = await createTestParty({ region: "Harare", locality: "Harare" });
    partyIds.push(seller.party.id, renter.party.id);

    const forSale = await createTestPost(seller.party.id, {
      objective: "SELL",
      category: "EQUIPMENT",
    });
    const wantsToRent = await createTestPost(renter.party.id, {
      objective: "RENT",
      category: "EQUIPMENT",
    });

    await generateMatchesForPost(wantsToRent.id);

    const match = await prisma.match.findFirst({
      where: { postAId: forSale.id, postBId: wantsToRent.id },
    });
    expect(match).toBeNull();
  });

  it("pairs RENT_OUT with RENT, and cites the objective pairing as the first reason", async () => {
    const owner = await createTestParty({ region: "Harare", locality: "Harare" });
    const renter = await createTestParty({ region: "Harare", locality: "Harare" });
    partyIds.push(owner.party.id, renter.party.id);

    const forRent = await createTestPost(owner.party.id, {
      objective: "RENT_OUT",
      category: "EQUIPMENT",
    });
    const wantsToRent = await createTestPost(renter.party.id, {
      objective: "RENT",
      category: "EQUIPMENT",
    });

    await generateMatchesForPost(wantsToRent.id);

    const match = await prisma.match.findFirst({
      where: { postAId: forRent.id, postBId: wantsToRent.id },
    });
    expect(match).not.toBeNull();
    expect(match!.reasons[0]).toBe("they're renting out, you're renting");
  });

  it("is idempotent: re-running against the same pair doesn't create a duplicate Match", async () => {
    const seller = await createTestParty({ region: "Harare", locality: "Harare" });
    const buyer = await createTestParty({ region: "Harare", locality: "Harare" });
    partyIds.push(seller.party.id, buyer.party.id);

    await createTestPost(seller.party.id, { objective: "SELL", category: "PRODUCE" });
    const need = await createTestPost(buyer.party.id, { objective: "BUY", category: "PRODUCE" });

    await generateMatchesForPost(need.id);
    await generateMatchesForPost(need.id);

    const matches = await prisma.match.findMany({ where: { postBId: need.id } });
    expect(matches).toHaveLength(1);
  });
});

describe("geography", () => {
  const partyIds: string[] = [];
  afterEach(async () => {
    await cleanupParties(partyIds.splice(0));
  });

  it("matches across a border when the counterparty is genuinely closer", async () => {
    // The case the old rule could not express. A Mutare farmer's nearest
    // real buyer is in Sofala (Beira, ~250km) — closer than Bulawayo
    // (~440km) in their own country. Under `region = region` this trade was
    // unreachable no matter how good it was.
    const farmer = await createTestParty({
      countryCode: "ZW",
      region: "Manicaland",
      locality: "Mutare",
      operatingRadiusKm: 400,
    });
    const beiraBuyer = await createTestParty({
      countryCode: "MZ",
      region: "Sofala",
      locality: "Beira",
    });
    partyIds.push(farmer.party.id, beiraBuyer.party.id);

    const buying = await createTestPost(beiraBuyer.party.id, {
      objective: "BUY",
      countryCode: "MZ",
      region: "Sofala",
      locality: "Beira",
    });
    const selling = await createTestPost(farmer.party.id, {
      objective: "SELL",
      countryCode: "ZW",
      region: "Manicaland",
      locality: "Mutare",
    });

    await generateMatchesForPost(selling.id);

    const match = await prisma.match.findFirst({
      where: { postAId: buying.id, postBId: selling.id },
    });
    expect(match).not.toBeNull();
    expect(match!.reasons.join(" ")).toMatch(/across a border/);
  });

  it("excludes a counterparty beyond the party's stated travel radius", async () => {
    const farmer = await createTestParty({
      region: "Manicaland",
      locality: "Mutare",
      operatingRadiusKm: 50,
    });
    const distant = await createTestParty({ region: "Matabeleland North", locality: "Hwange" });
    partyIds.push(farmer.party.id, distant.party.id);

    const buying = await createTestPost(distant.party.id, {
      objective: "BUY",
      region: "Matabeleland North",
      locality: "Hwange",
    });
    const selling = await createTestPost(farmer.party.id, {
      objective: "SELL",
      region: "Manicaland",
      locality: "Mutare",
    });

    await generateMatchesForPost(selling.id);

    expect(
      await prisma.match.findFirst({ where: { postAId: buying.id, postBId: selling.id } }),
    ).toBeNull();
  });

  it("matches two farms in different regions that are physically close", async () => {
    // The domestic half of the same bug: neighbouring regions are often
    // nearer than opposite ends of one region, and the old rule refused
    // them outright.
    const a = await createTestParty({ region: "Harare", locality: "Harare" });
    const b = await createTestParty({ region: "Mashonaland East", locality: "Marondera" });
    partyIds.push(a.party.id, b.party.id);

    const buying = await createTestPost(b.party.id, {
      objective: "BUY",
      region: "Mashonaland East",
      locality: "Marondera",
    });
    const selling = await createTestPost(a.party.id, { objective: "SELL" });

    await generateMatchesForPost(selling.id);

    expect(
      await prisma.match.findFirst({ where: { postAId: buying.id, postBId: selling.id } }),
    ).not.toBeNull();
  });
});
