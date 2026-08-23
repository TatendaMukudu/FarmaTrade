import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { acceptTerms, closeEngagement, proposeTerms } from "@/lib/agreement";
import { cleanupParties, createTestIntent, createTestMatch, createTestParty } from "@/test/factories";

// Brief §16. Can a stranger reach into somebody else's commerce?
describe("actor isolation", () => {
  const ids: string[] = [];
  afterEach(async () => cleanupParties(ids.splice(0)));

  async function engagement() {
    const seller = await createTestParty({ province: "Harare", district: "Harare" });
    const buyer = await createTestParty({ province: "Harare", district: "Harare" });
    const outsider = await createTestParty({ province: "Harare", district: "Harare" });
    ids.push(seller.party.id, buyer.party.id, outsider.party.id);
    const supply = await createTestIntent(seller.party.id, { side: "SUPPLY", quantity: 10, unit: "tonne" });
    const demand = await createTestIntent(buyer.party.id, { side: "DEMAND", quantity: 10, unit: "tonne" });
    const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");
    return { seller: seller.party, buyer: buyer.party, outsider: outsider.party, match, supply };
  }

  it("a stranger cannot put terms on somebody else's engagement", async () => {
    const { outsider, match } = await engagement();
    const out = await proposeTerms(match.id, outsider.id, { quantity: 5, unit: "tonne" });
    expect(out).toEqual({ ok: false, reason: "not_a_participant" });
    expect(await prisma.agreementTerms.count({ where: { matchId: match.id } })).toBe(0);
  });

  it("a stranger cannot accept terms and consume somebody else's capacity", async () => {
    const { buyer, outsider, match } = await engagement();
    await proposeTerms(match.id, buyer.id, { quantity: 5, unit: "tonne" });
    const out = await acceptTerms(match.id, outsider.id);
    expect(out).toEqual({ ok: false, reason: "not_a_participant" });
    const after = await prisma.match.findUnique({ where: { id: match.id } });
    expect(after?.status).not.toBe("AGREED");
  });

  it("a stranger cannot cancel somebody else's engagement", async () => {
    const { seller, buyer, outsider, match } = await engagement();
    await proposeTerms(match.id, buyer.id, { quantity: 5, unit: "tonne" });
    await acceptTerms(match.id, seller.id);
    const out = await closeEngagement(match.id, outsider.id);
    expect(out).toEqual({ ok: false, reason: "not_a_participant" });
    const after = await prisma.match.findUnique({ where: { id: match.id } });
    expect(after?.status).not.toBe("DECLINED");
  });

  it("one party cannot accept twice to fake the counterparty's consent", async () => {
    const { buyer, match } = await engagement();
    await proposeTerms(match.id, buyer.id, { quantity: 5, unit: "tonne" });
    // Proposing terms IS consenting to them, so the proposer already holds an
    // acceptance. Every further tap by that same party is a double tap: it
    // must not fake the counterparty, and it must not throw a raw database
    // error at a farmer on a slow phone either.
    for (const attempt of [1, 2]) {
      const out = await acceptTerms(match.id, buyer.id);
      expect(out, `attempt ${attempt}`).toEqual({ ok: false, reason: "already_accepted" });
    }

    const after = await prisma.match.findUnique({ where: { id: match.id } });
    // One party saying yes twice is still one party saying yes.
    expect(after?.status).not.toBe("AGREED");

    const acceptances = await prisma.termsAcceptance.count({
      where: { terms: { matchId: match.id }, partyId: buyer.id },
    });
    expect(acceptances).toBe(1);
  });
});
