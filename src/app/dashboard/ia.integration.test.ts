import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { loadFarmInventory } from "@/lib/farm-data";
import { canSeeContactDetails } from "@/lib/identity-safety";
import { loadNetworkParty } from "@/lib/network-data";
import { loadActiveOpportunities } from "@/lib/opportunity-data";
import {
  cleanupParties,
  createTestIntent,
  createTestMatch,
  createTestParty,
} from "@/test/factories";

describe("Checkpoint 2 information architecture", () => {
  const partyIds: string[] = [];

  afterEach(async () => cleanupParties(partyIds.splice(0)));

  async function party(roles: ("FARM" | "TRADER" | "TRANSPORTER")[] = ["FARM"]) {
    const created = await createTestParty({ roles });
    partyIds.push(created.party.id);
    return created.party;
  }

  it("keeps Farm inventory readable through the unchanged Farm loader", async () => {
    const owner = await party();
    const farm = await prisma.farm.create({
      data: { partyId: owner.id, farmName: "IA continuity farm" },
    });
    const stock = await prisma.produceStock.create({
      data: {
        farmId: farm.id,
        cropType: "Oranges",
        quantity: 3,
        unit: "TONNE",
      },
    });

    const inventory = await loadFarmInventory(farm.id);

    expect(inventory.produce).toHaveLength(1);
    expect(inventory.produce[0]).toMatchObject({ id: stock.id, cropType: "Oranges" });
  });

  it("resolves the same counterparty by id through the Network profile loader", async () => {
    const counterparty = await party(["TRADER"]);

    const loaded = await loadNetworkParty(counterparty.id);

    expect(loaded?.id).toBe(counterparty.id);
    expect(loaded?.name).toBe(counterparty.name);
  });

  it("keeps a party's opportunities reachable outside primary navigation", async () => {
    const supplier = await party();
    const buyer = await party(["TRADER"]);
    const supply = await createTestIntent(supplier.id, { side: "SUPPLY" });
    const demand = await createTestIntent(buyer.id, { side: "DEMAND" });
    const match = await createTestMatch(supply.id, demand.id, "SUGGESTED");

    const opportunities = await loadActiveOpportunities(supplier.id);

    expect(opportunities.map((opportunity) => opportunity.id)).toContain(match.id);
  });

  it("does not widen contact disclosure on the renamed Network profile", async () => {
    const subject = await party();
    const stranger = await party(["TRADER"]);
    await prisma.party.update({
      where: { id: subject.id },
      data: { phone: "+263 77 000 0000", contactDetails: "Private office line" },
    });

    expect(await canSeeContactDetails(stranger.id, subject.id)).toBe(false);
  });
});
