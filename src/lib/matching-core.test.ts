import { describe, expect, it } from "vitest";
import { scoreMatch } from "./matching-core";
import type { Post, Reputation } from "@/generated/prisma/client";

function post(overrides: Partial<Post> = {}): Post {
  return {
    id: "post-1",
    partyId: "party-1",
    type: "HAVE",
    objective: "SELL",
    category: "PRODUCE",
    title: "Maize",
    description: null,
    quantity: 10,
    unit: "TONNE",
    countryCode: "ZW",
    region: "Mashonaland East",
    locality: "Marondera",
    latitude: null,
    longitude: null,
    askingPrice: null,
    currency: "USD",
    status: "OPEN",
    urgent: false,
    neededBy: null,
    recurring: false,
    destinationProvince: null,
    destinationDistrict: null,
    travelDate: null,
    livestockId: null,
    produceId: null,
    equipmentId: null,
    createdAt: new Date(),
    expiresAt: null,
    ...overrides,
  } as Post;
}

function reputation(overrides: Partial<Reputation> = {}): Reputation {
  return {
    id: "rep-1",
    partyId: "party-1",
    completedCount: 0,
    completedGoodCount: 0,
    completedIssueCount: 0,
    averageRating: null,
    ratingCount: 0,
    updatedAt: new Date(),
    ...overrides,
  } as Reputation;
}

describe("scoreMatch", () => {
  it("cites the objective pairing and 'no history yet', with no geo reason across provinces", () => {
    // The two sides are always counterpart objectives — generateMatchesForPost
    // only ever selects candidates that pair — so the fixture models a SELL
    // against a BUY rather than two posts pointing the same way.
    const { score, reasons } = scoreMatch(
      post({ objective: "SELL", type: "HAVE", region: "Manicaland", locality: "Mutare" }),
      post({ objective: "BUY", type: "NEED", region: "Mashonaland East", locality: "Marondera" }),
      null,
      null,
    );
    expect(score).toBe(50);
    expect(reasons).toEqual([
      "they're selling, you're buying",
      "counterparty: new, no history yet",
    ]);
  });

  it("scores closer counterparties higher, on a continuous scale", () => {
    // Proximity is measured, not tested against a boundary. There's no
    // cliff at an administrative line, because a line on a map has nothing
    // to do with how far a truck has to drive.
    const near = scoreMatch(post(), post(), null, null, 3);
    const middling = scoreMatch(post(), post(), null, null, 70);
    const farAway = scoreMatch(post(), post(), null, null, 500);

    expect(near.score).toBeGreaterThan(middling.score);
    expect(middling.score).toBeGreaterThan(farAway.score);
    expect(near.reasons).toContain("right nearby");
  });

  it("cites a border crossing without disqualifying it", () => {
    // Mutare to Beira is closer than Mutare to Bulawayo. The cost is
    // paperwork, not distance, so it's surfaced and left to the farmer.
    const crossBorder = scoreMatch(
      post({ countryCode: "MZ", region: "Sofala", locality: "Beira" }),
      post({ countryCode: "ZW", region: "Manicaland", locality: "Mutare" }),
      null,
      null,
      250,
    );
    expect(crossBorder.reasons).toContain("across a border — check permits");
    expect(crossBorder.score).toBeGreaterThan(50);
  });

  it("falls back to same-region when a post has no coordinates", () => {
    const placed = scoreMatch(
      post({ region: "Manicaland" }),
      post({ region: "Manicaland" }),
      null,
      null,
      null,
    );
    const elsewhere = scoreMatch(
      post({ region: "Masvingo" }),
      post({ region: "Manicaland" }),
      null,
      null,
      null,
    );
    expect(placed.reasons).toContain("same area");
    expect(placed.score).toBeGreaterThan(elsewhere.score);
  });

  it("credits a TRANSPORT candidate whose destination lands on the new post's region, even in a different region", () => {
    const { score, reasons } = scoreMatch(
      post({
        category: "TRANSPORT",
        region: "Harare",
        locality: "Harare",
        destinationProvince: "Manicaland",
      }),
      post({ category: "TRANSPORT", region: "Manicaland", locality: "Mutare" }),
      null,
      null,
    );
    expect(reasons).toContain("on your route");
    expect(score).toBe(65);
  });

  it("does not credit 'on your route' for non-TRANSPORT categories, even with matching destination fields", () => {
    const { reasons } = scoreMatch(
      post({ category: "PRODUCE", region: "Harare", destinationProvince: "Manicaland" }),
      post({ category: "PRODUCE", region: "Manicaland" }),
      null,
      null,
    );
    expect(reasons).not.toContain("on your route");
  });

  it("weights a high-confidence average rating over a bare completed count", () => {
    const differentProvinces = { region: "Manicaland" } as const;
    const highConfidence = scoreMatch(
      post(differentProvinces),
      post(),
      reputation({ completedCount: 5, averageRating: 4.8, ratingCount: 10 }),
      null,
    );
    const lowConfidence = scoreMatch(
      post(differentProvinces),
      post(),
      reputation({ completedCount: 5, averageRating: 5, ratingCount: 1 }),
      null,
    );
    expect(highConfidence.reasons.find((r) => r.startsWith("counterparty:"))).toMatch(
      /4\.8★ \(10 ratings\)/,
    );
    expect(lowConfidence.reasons.find((r) => r.startsWith("counterparty:"))).toMatch(
      /still building rating history/,
    );
    expect(highConfidence.score).toBeGreaterThan(lowConfidence.score);
  });

  it("caps the completed-count bonus at 10 for parties with no rating average yet", () => {
    const capped = scoreMatch(post(), post(), reputation({ completedCount: 50 }), null);
    const atCap = scoreMatch(post(), post(), reputation({ completedCount: 10 }), null);
    expect(capped.score).toBe(atCap.score);
  });

  it("adds a founder-vouched or network-referred reason and bonus when verified", () => {
    const unverified = scoreMatch(post({ region: "Manicaland" }), post(), null, null);
    const founder = scoreMatch(post({ region: "Manicaland" }), post(), null, "FOUNDER");
    const network = scoreMatch(post({ region: "Manicaland" }), post(), null, "NETWORK");
    expect(founder.reasons).toContain("founder-vouched");
    expect(network.reasons).toContain("network-referred");
    expect(founder.score).toBe(unverified.score + 10);
  });

  it("flags time-sensitive when either side is urgent", () => {
    const candidateUrgent = scoreMatch(post({ urgent: true }), post(), null, null);
    const newPostUrgent = scoreMatch(post(), post({ urgent: true }), null, null);
    const neitherUrgent = scoreMatch(post(), post(), null, null);
    expect(candidateUrgent.reasons).toContain("time-sensitive");
    expect(newPostUrgent.reasons).toContain("time-sensitive");
    expect(neitherUrgent.reasons).not.toContain("time-sensitive");
  });

  it("never scores above 100 even when every bonus stacks", () => {
    const { score } = scoreMatch(
      post({ region: "Harare", locality: "Harare", urgent: true }),
      post({ region: "Harare", locality: "Harare", urgent: true }),
      reputation({ completedCount: 20, averageRating: 5, ratingCount: 50 }),
      "FOUNDER",
    );
    expect(score).toBeLessThanOrEqual(100);
  });
});
