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
    province: "Mashonaland East",
    district: "Marondera",
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
      post({ objective: "SELL", type: "HAVE", province: "Manicaland", district: "Mutare" }),
      post({ objective: "BUY", type: "NEED", province: "Mashonaland East", district: "Marondera" }),
      null,
      null,
    );
    expect(score).toBe(50);
    expect(reasons).toEqual([
      "they're selling, you're buying",
      "counterparty: new, no history yet",
    ]);
  });

  it("rewards same district over same province", () => {
    const sameProvinceOnly = scoreMatch(
      post({ province: "Manicaland", district: "Mutare" }),
      post({ province: "Manicaland", district: "Chimanimani" }),
      null,
      null,
    );
    const sameDistrict = scoreMatch(
      post({ province: "Manicaland", district: "Mutare" }),
      post({ province: "Manicaland", district: "Mutare" }),
      null,
      null,
    );
    expect(sameProvinceOnly.reasons).toContain("same province");
    expect(sameProvinceOnly.reasons).not.toContain("same district");
    expect(sameDistrict.reasons).toContain("same district");
    expect(sameDistrict.score).toBeGreaterThan(sameProvinceOnly.score);
  });

  it("credits a TRANSPORT candidate whose destination lands on the new post's province, even in a different province", () => {
    const { score, reasons } = scoreMatch(
      post({
        category: "TRANSPORT",
        province: "Harare",
        district: "Harare",
        destinationProvince: "Manicaland",
      }),
      post({ category: "TRANSPORT", province: "Manicaland", district: "Mutare" }),
      null,
      null,
    );
    expect(reasons).toContain("on your route");
    expect(score).toBe(65);
  });

  it("does not credit 'on your route' for non-TRANSPORT categories, even with matching destination fields", () => {
    const { reasons } = scoreMatch(
      post({ category: "PRODUCE", province: "Harare", destinationProvince: "Manicaland" }),
      post({ category: "PRODUCE", province: "Manicaland" }),
      null,
      null,
    );
    expect(reasons).not.toContain("on your route");
  });

  it("weights a high-confidence average rating over a bare completed count", () => {
    const differentProvinces = { province: "Manicaland" } as const;
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
    const unverified = scoreMatch(post({ province: "Manicaland" }), post(), null, null);
    const founder = scoreMatch(post({ province: "Manicaland" }), post(), null, "FOUNDER");
    const network = scoreMatch(post({ province: "Manicaland" }), post(), null, "NETWORK");
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
      post({ province: "Harare", district: "Harare", urgent: true }),
      post({ province: "Harare", district: "Harare", urgent: true }),
      reputation({ completedCount: 20, averageRating: 5, ratingCount: 50 }),
      "FOUNDER",
    );
    expect(score).toBeLessThanOrEqual(100);
  });
});
