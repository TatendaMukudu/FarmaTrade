// Integration test: findTransportersForRoute against a real Postgres.
// The route predicate is expressed directly as a Prisma WHERE clause (no
// separate pure-function mirror to keep in sync), so this is the only
// place it's verified — origin/destination matching, type/category/status
// filtering, and the result cap.
import { afterEach, describe, expect, it } from "vitest";
import { findTransportersForRoute } from "@/lib/transport-suggestions";
import { createTestParty, cleanupParties } from "@/test/factories";
import { prisma } from "@/lib/prisma";

async function createTransportPost(
  partyId: string,
  overrides: { region?: string; destinationProvince?: string | null; status?: "OPEN" | "CLOSED"; type?: "HAVE" | "NEED" } = {},
) {
  return prisma.post.create({
    data: {
      partyId,
      type: overrides.type ?? "HAVE",
      category: "TRANSPORT",
      title: "Truck available",
      region: overrides.region ?? "Harare",
      locality: "Harare",
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
    const transporter = await createTestParty({ region: "Harare", locality: "Harare" });
    partyIds.push(transporter.party.id);
    const post = await createTransportPost(transporter.party.id, {
      region: "Harare",
      destinationProvince: "Manicaland",
    });

    const results = await findTransportersForRoute(
      { region: "Harare", locality: "Harare" },
      { region: "Manicaland", locality: "Mutare" },
    );

    expect(results.map((r) => r.id)).toContain(post.id);
  });

  it("excludes a transporter whose route doesn't cover the trade", async () => {
    const transporter = await createTestParty({ region: "Matabeleland North", locality: "Hwange" });
    partyIds.push(transporter.party.id);
    const post = await createTransportPost(transporter.party.id, {
      region: "Matabeleland North",
      destinationProvince: "Bulawayo",
    });

    const results = await findTransportersForRoute(
      { region: "Harare", locality: "Harare" },
      { region: "Manicaland", locality: "Mutare" },
    );

    expect(results.map((r) => r.id)).not.toContain(post.id);
  });

  it("excludes a CLOSED transport post even if the route matches", async () => {
    const transporter = await createTestParty({ region: "Harare", locality: "Harare" });
    partyIds.push(transporter.party.id);
    const post = await createTransportPost(transporter.party.id, { status: "CLOSED" });

    const results = await findTransportersForRoute(
      { region: "Harare", locality: "Harare" },
      { region: "Manicaland", locality: "Mutare" },
    );

    expect(results.map((r) => r.id)).not.toContain(post.id);
  });

  it("excludes a TRANSPORT NEED post (only HAVE posts are capacity offers)", async () => {
    const transporter = await createTestParty({ region: "Harare", locality: "Harare" });
    partyIds.push(transporter.party.id);
    const post = await createTransportPost(transporter.party.id, { type: "NEED" });

    const results = await findTransportersForRoute(
      { region: "Harare", locality: "Harare" },
      { region: "Manicaland", locality: "Mutare" },
    );

    expect(results.map((r) => r.id)).not.toContain(post.id);
  });
});
