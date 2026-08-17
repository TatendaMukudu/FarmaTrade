// PRODUCT_TRUTH.md §29 / INV-14 — economic identity is public, personal
// identity is not.
//
// This was a live defect: /dashboard/directory/[partyId] rendered a phone
// number and contact details to any signed-in party. Pinned here so it
// cannot silently return.
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { canSeeContactDetails } from "@/lib/identity-safety";
import { acceptTerms, proposeTerms } from "@/lib/agreement";
import { createTestParty, createTestIntent, createTestMatch, cleanupParties } from "@/test/factories";

describe("identity safety", () => {
  const partyIds: string[] = [];
  afterEach(async () => cleanupParties(partyIds.splice(0)));

  async function party() {
    const { party } = await createTestParty({ roles: ["FARM"] });
    partyIds.push(party.id);
    await prisma.party.update({
      where: { id: party.id },
      data: { phone: "+263 77 000 0000", contactDetails: "Ask for Tendai" },
    });
    return party;
  }

  it("hides a farmer's contact details from a stranger", async () => {
    const farmer = await party();
    const stranger = await party();
    expect(await canSeeContactDetails(stranger.id, farmer.id)).toBe(false);
  });

  it("hides them from somebody who is only signed out", async () => {
    const farmer = await party();
    expect(await canSeeContactDetails(null, farmer.id)).toBe(false);
  });

  it("shows a party their own", async () => {
    const farmer = await party();
    expect(await canSeeContactDetails(farmer.id, farmer.id)).toBe(true);
  });

  it("still hides them while a trade is only suggested", async () => {
    // A system-generated match is FarmaTrade's opinion, not a relationship.
    const seller = await party();
    const buyer = await party();
    const supply = await createTestIntent(seller.id, { side: "SUPPLY", quantity: 10, unit: "tonnes" });
    const demand = await createTestIntent(buyer.id, { side: "DEMAND", quantity: 5, unit: "tonnes" });
    await createTestMatch(supply.id, demand.id, "SUGGESTED");

    expect(await canSeeContactDetails(buyer.id, seller.id)).toBe(false);
  });

  it("still hides them while only one party has proposed terms", async () => {
    // One party's interest is not a commercial relationship. Same bar P0.4
    // set for capacity: both parties, same terms version.
    const seller = await party();
    const buyer = await party();
    const supply = await createTestIntent(seller.id, { side: "SUPPLY", quantity: 10, unit: "tonnes" });
    const demand = await createTestIntent(buyer.id, { side: "DEMAND", quantity: 5, unit: "tonnes" });
    const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");
    await proposeTerms(match.id, buyer.id, { quantity: 5, unit: "tonnes" });

    expect(await canSeeContactDetails(buyer.id, seller.id)).toBe(false);
  });

  it("reveals them once both parties have agreed a trade", async () => {
    const seller = await party();
    const buyer = await party();
    const supply = await createTestIntent(seller.id, { side: "SUPPLY", quantity: 10, unit: "tonnes" });
    const demand = await createTestIntent(buyer.id, { side: "DEMAND", quantity: 5, unit: "tonnes" });
    const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");
    await proposeTerms(match.id, buyer.id, { quantity: 5, unit: "tonnes" });
    await acceptTerms(match.id, seller.id);

    expect(await canSeeContactDetails(buyer.id, seller.id)).toBe(true);
    // Symmetric — the farmer can reach the buyer too.
    expect(await canSeeContactDetails(seller.id, buyer.id)).toBe(true);
  });

  it("does not leak through an unrelated third party's agreement", async () => {
    const seller = await party();
    const buyer = await party();
    const outsider = await party();
    const supply = await createTestIntent(seller.id, { side: "SUPPLY", quantity: 10, unit: "tonnes" });
    const demand = await createTestIntent(buyer.id, { side: "DEMAND", quantity: 5, unit: "tonnes" });
    const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");
    await proposeTerms(match.id, buyer.id, { quantity: 5, unit: "tonnes" });
    await acceptTerms(match.id, seller.id);

    expect(await canSeeContactDetails(outsider.id, seller.id)).toBe(false);
  });
});
