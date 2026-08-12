// Integration test: exercises generateMatchesForIntent against a real
// Postgres (the same one CI stands up), covering the DB query/candidate
// selection that scoreMatch's unit tests (matching-core.test.ts) can't
// reach on their own — geo reach, product identity, skipDuplicates, and the
// opposite-direction/same-category constraints. No request-runtime mocking
// needed here: generateMatchesForIntent never touches
// cookies/headers/redirect.
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { generateMatchesForIntent } from "@/lib/matching";
import { createTestParty, createTestPost, cleanupParties } from "@/test/factories";

describe("generateMatchesForIntent", () => {
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

    await generateMatchesForIntent(need.id);

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

    await generateMatchesForIntent(need.id);

    const match = await prisma.match.findFirst({ where: { postAId: have.id, postBId: need.id } });
    expect(match).toBeNull();
  });

  it("does not match a post against itself or against the same party's other posts", async () => {
    const party = await createTestParty({ province: "Harare", district: "Harare" });
    partyIds.push(party.party.id);

    const have = await createTestPost(party.party.id, { type: "HAVE", category: "PRODUCE" });
    const need = await createTestPost(party.party.id, { type: "NEED", category: "PRODUCE" });

    await generateMatchesForIntent(need.id);

    const match = await prisma.match.findFirst({ where: { postAId: have.id, postBId: need.id } });
    expect(match).toBeNull();
  });

  it("does not match against a CLOSED post", async () => {
    const seller = await createTestParty({ province: "Harare", district: "Harare" });
    const buyer = await createTestParty({ province: "Harare", district: "Harare" });
    partyIds.push(seller.party.id, buyer.party.id);

    const have = await createTestPost(seller.party.id, { type: "HAVE", category: "PRODUCE", status: "CLOSED" });
    const need = await createTestPost(buyer.party.id, { type: "NEED", category: "PRODUCE" });

    await generateMatchesForIntent(need.id);

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

    await generateMatchesForIntent(need.id);

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

    await generateMatchesForIntent(need.id);
    await generateMatchesForIntent(need.id);

    const matches = await prisma.match.findMany({ where: { postBId: need.id } });
    expect(matches).toHaveLength(1);
  });

  // Cross-border trade: local-first is a default, not a wall. A large farm
  // exporting into the region is a real case, so reach is the poster's
  // choice — but only ever a mutual one.
  describe("cross-border reach", () => {
    async function crossBorderPair(opts: { haveOptsIn: boolean; needOptsIn: boolean }) {
      const seller = await createTestParty({ countryCode: "ZM", province: "Lusaka", district: "Lusaka" });
      const buyer = await createTestParty({ countryCode: "ZW", province: "Harare", district: "Harare" });
      partyIds.push(seller.party.id, buyer.party.id);

      const have = await createTestPost(seller.party.id, {
        type: "HAVE",
        category: "PRODUCE",
        countryCode: "ZM",
        province: "Lusaka",
        district: "Lusaka",
        openToCrossBorder: opts.haveOptsIn,
      });
      const need = await createTestPost(buyer.party.id, {
        type: "NEED",
        category: "PRODUCE",
        countryCode: "ZW",
        province: "Harare",
        district: "Harare",
        openToCrossBorder: opts.needOptsIn,
      });
      await generateMatchesForIntent(need.id);
      return prisma.match.findFirst({ where: { postAId: have.id, postBId: need.id } });
    }

    it("matches across a border when both sides opted in, and says so", async () => {
      const match = await crossBorderPair({ haveOptsIn: true, needOptsIn: true });
      expect(match).not.toBeNull();
      expect(match!.reasons.some((r) => r.startsWith("cross-border:"))).toBe(true);
      expect(match!.reasons.join(" ")).toContain("Zambia");
    });

    it("does not match when only the poster opted in", async () => {
      expect(await crossBorderPair({ haveOptsIn: false, needOptsIn: true })).toBeNull();
    });

    it("does not match when only the other side opted in", async () => {
      expect(await crossBorderPair({ haveOptsIn: true, needOptsIn: false })).toBeNull();
    });

    it("leaves a smallholder who opted out seeing nothing international", async () => {
      expect(await crossBorderPair({ haveOptsIn: false, needOptsIn: false })).toBeNull();
    });

    it("keeps local matches coming for a post that opted in", async () => {
      const neighbour = await createTestParty({ province: "Harare", district: "Harare" });
      const buyer = await createTestParty({ province: "Harare", district: "Harare" });
      partyIds.push(neighbour.party.id, buyer.party.id);

      const have = await createTestPost(neighbour.party.id, { type: "HAVE", category: "PRODUCE" });
      const need = await createTestPost(buyer.party.id, {
        type: "NEED",
        category: "PRODUCE",
        openToCrossBorder: true,
      });
      await generateMatchesForIntent(need.id);

      const match = await prisma.match.findFirst({ where: { postAId: have.id, postBId: need.id } });
      expect(match).not.toBeNull();
      expect(match!.reasons).toContain("same district");
    });

    it("does not match two same-named provinces in different countries", async () => {
      // Both Zimbabwe and Zambia have a province a farmer might call
      // "Southern"; without the country guard these would look local to
      // each other.
      const zm = await createTestParty({ countryCode: "ZM", province: "Southern", district: "Choma" });
      const zw = await createTestParty({ countryCode: "ZW", province: "Southern", district: "Choma" });
      partyIds.push(zm.party.id, zw.party.id);

      const have = await createTestPost(zm.party.id, {
        type: "HAVE", category: "PRODUCE", countryCode: "ZM", province: "Southern", district: "Choma",
      });
      const need = await createTestPost(zw.party.id, {
        type: "NEED", category: "PRODUCE", countryCode: "ZW", province: "Southern", district: "Choma",
      });
      await generateMatchesForIntent(need.id);

      expect(await prisma.match.findFirst({ where: { postAId: have.id, postBId: need.id } })).toBeNull();
    });
  });


  // Commodity identity. Before Product existed, both of these were PRODUCE
  // and matched each other happily.
  describe("product identity", () => {
    async function productPair(haveKey: string | null, needKey: string | null) {
      const seller = await createTestParty();
      const buyer = await createTestParty();
      partyIds.push(seller.party.id, buyer.party.id);

      const idFor = async (key: string | null) =>
        key ? (await prisma.product.findUnique({ where: { key } }))!.id : null;

      const have = await createTestPost(seller.party.id, {
        type: "HAVE",
        category: "PRODUCE",
        productId: await idFor(haveKey),
      });
      const need = await createTestPost(buyer.party.id, {
        type: "NEED",
        category: "PRODUCE",
        productId: await idFor(needKey),
      });
      await generateMatchesForIntent(need.id);
      return prisma.match.findFirst({ where: { postAId: have.id, postBId: need.id } });
    }

    it("does not match maize against a tomato requirement", async () => {
      expect(await productPair("maize", "tomato")).toBeNull();
    });

    it("matches the same commodity", async () => {
      expect(await productPair("maize", "maize")).not.toBeNull();
    });

    it("matches a farmer's mhunga against a buyer's pearl millet", async () => {
      // Both resolve to pearl_millet through different aliases, so by the
      // time matching runs they are the same product id.
      expect(await productPair("pearl_millet", "pearl_millet")).not.toBeNull();
    });

    it("still matches when neither side has a product, as it always did", async () => {
      expect(await productPair(null, null)).not.toBeNull();
    });

    it("does not drop a match just because one side is unidentified", async () => {
      expect(await productPair("maize", null)).not.toBeNull();
      expect(await productPair(null, "maize")).not.toBeNull();
    });

    it("keeps the cross-border filter working alongside the product filter", async () => {
      // Both clauses carry their own OR; combining them wrongly would drop
      // one silently.
      const zm = await createTestParty({ countryCode: "ZM", province: "Lusaka", district: "Lusaka" });
      const zw = await createTestParty();
      partyIds.push(zm.party.id, zw.party.id);
      const maize = (await prisma.product.findUnique({ where: { key: "maize" } }))!.id;

      const have = await createTestPost(zm.party.id, {
        type: "HAVE", category: "PRODUCE", productId: maize,
        countryCode: "ZM", province: "Lusaka", district: "Lusaka", openToCrossBorder: true,
      });
      const need = await createTestPost(zw.party.id, {
        type: "NEED", category: "PRODUCE", productId: maize, openToCrossBorder: true,
      });
      await generateMatchesForIntent(need.id);
      expect(await prisma.match.findFirst({ where: { postAId: have.id, postBId: need.id } })).not.toBeNull();
    });
  });

});
