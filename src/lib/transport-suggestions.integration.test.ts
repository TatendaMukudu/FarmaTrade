// Integration test: findTransportersForRoute against a real Postgres.
// transportCoversRoute's own unit tests (transport-suggestions-core.test.ts)
// cover the routing predicate in isolation; this covers the query around
// it — type/category/status filtering and the result cap — which those
// unit tests can't reach.
import { afterEach, describe, expect, it } from "vitest";
import { findTransportersForRoute } from "@/lib/transport-suggestions";
import { createTestParty, cleanupParties } from "@/test/factories";
import { prisma } from "@/lib/prisma";

async function createTransportPost(
  partyId: string,
  overrides: { province?: string; destinationProvince?: string | null; status?: "OPEN" | "CLOSED"; type?: "HAVE" | "NEED" } = {},
) {
  return prisma.post.create({
    data: {
      partyId,
      type: overrides.type ?? "HAVE",
      category: "TRANSPORT",
      title: "Truck available",
      province: overrides.province ?? "Harare",
      district: "Harare",
      destinationProvince: overrides.destinationProvince,
      status: overrides.status ?? "OPEN",
    },
  });
}

describe("findTransportersForRoute", () => {
  const partyIds: string[] = [];
  afterEach(async () => {
    await cleanupParties(partyIds.splice(0));
  });

  it("finds an open TRANSPORT HAVE post whose route covers the trade", async () => {
    const transporter = await createTestParty({ province: "Harare", district: "Harare" });
    partyIds.push(transporter.party.id);
    const post = await createTransportPost(transporter.party.id, {
      province: "Harare",
      destinationProvince: "Manicaland",
    });

    const results = await findTransportersForRoute(
      { province: "Harare", district: "Harare" },
      { province: "Manicaland", district: "Mutare" },
    );

    expect(results.map((r) => r.id)).toContain(post.id);
  });

  it("excludes a transporter whose route doesn't cover the trade", async () => {
    const transporter = await createTestParty({ province: "Matabeleland North", district: "Hwange" });
    partyIds.push(transporter.party.id);
    const post = await createTransportPost(transporter.party.id, {
      province: "Matabeleland North",
      destinationProvince: "Bulawayo",
    });

    const results = await findTransportersForRoute(
      { province: "Harare", district: "Harare" },
      { province: "Manicaland", district: "Mutare" },
    );

    expect(results.map((r) => r.id)).not.toContain(post.id);
  });

  it("excludes a CLOSED transport post even if the route matches", async () => {
    const transporter = await createTestParty({ province: "Harare", district: "Harare" });
    partyIds.push(transporter.party.id);
    const post = await createTransportPost(transporter.party.id, { status: "CLOSED" });

    const results = await findTransportersForRoute(
      { province: "Harare", district: "Harare" },
      { province: "Manicaland", district: "Mutare" },
    );

    expect(results.map((r) => r.id)).not.toContain(post.id);
  });

  it("excludes a TRANSPORT NEED post (only HAVE posts are capacity offers)", async () => {
    const transporter = await createTestParty({ province: "Harare", district: "Harare" });
    partyIds.push(transporter.party.id);
    const post = await createTransportPost(transporter.party.id, { type: "NEED" });

    const results = await findTransportersForRoute(
      { province: "Harare", district: "Harare" },
      { province: "Manicaland", district: "Mutare" },
    );

    expect(results.map((r) => r.id)).not.toContain(post.id);
  });
});
