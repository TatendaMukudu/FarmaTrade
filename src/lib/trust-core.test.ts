import { describe, expect, it } from "vitest";
import {
  buildTrustProfile,
  relevantDimensions,
  MIN_RATINGS_FOR_DIMENSION,
  type ReputationDimensions,
} from "./trust-core";

function rep(overrides: Partial<ReputationDimensions> = {}): ReputationDimensions {
  return {
    communicationAvg: null,
    reliabilityAvg: null,
    qualityAvg: null,
    paymentAvg: null,
    timelinessAvg: null,
    fairnessAvg: null,
    dimensionCount: 0,
    repeatPartnerCount: 0,
    medianResponseMinutes: null,
    ...overrides,
  };
}

describe("buildTrustProfile", () => {
  it("shows nothing for a party with no history", () => {
    const profile = buildTrustProfile(rep());
    expect(profile.hasDimensions).toBe(false);
    expect(profile.strengths).toEqual([]);
    expect(profile.headline).toBeNull();
  });

  it("is empty for a null reputation", () => {
    expect(buildTrustProfile(null).hasDimensions).toBe(false);
  });

  it(`withholds dimension detail below ${MIN_RATINGS_FOR_DIMENSION} ratings`, () => {
    const profile = buildTrustProfile(
      rep({ qualityAvg: 5, paymentAvg: 5, dimensionCount: MIN_RATINGS_FOR_DIMENSION - 1 }),
    );
    expect(profile.hasDimensions).toBe(false);
  });

  it("ranks dimensions strongest first once there's enough signal", () => {
    const profile = buildTrustProfile(
      rep({
        qualityAvg: 4.9,
        communicationAvg: 4.2,
        paymentAvg: 3.1,
        dimensionCount: 8,
      }),
    );
    expect(profile.hasDimensions).toBe(true);
    expect(profile.strengths.map((s) => s.dimension)).toEqual([
      "QUALITY",
      "COMMUNICATION",
      "PAYMENT",
    ]);
  });

  it("names a standout strength", () => {
    const profile = buildTrustProfile(
      rep({ qualityAvg: 5, communicationAvg: 3.5, paymentAvg: 3.5, dimensionCount: 6 }),
    );
    expect(profile.headline).toBe("Known for quality");
  });

  it("claims no standout when every dimension is level", () => {
    // A flat 4.2 across the board means the top dimension won a coin toss.
    // Announcing it as what someone is "known for" would be noise.
    const profile = buildTrustProfile(
      rep({ qualityAvg: 4.2, communicationAvg: 4.2, paymentAvg: 4.3, dimensionCount: 6 }),
    );
    expect(profile.headline).toBeNull();
  });

  it("flags a relative weakness, judged against the party's own average", () => {
    const profile = buildTrustProfile(
      rep({ qualityAvg: 4.9, communicationAvg: 4.8, paymentAvg: 3.2, dimensionCount: 9 }),
    );
    expect(profile.watchouts.map((w) => w.dimension)).toEqual(["PAYMENT"]);
  });

  it("does not flag a weakness on a uniformly excellent party", () => {
    const profile = buildTrustProfile(
      rep({ qualityAvg: 4.9, communicationAvg: 4.8, paymentAvg: 4.7, dimensionCount: 9 }),
    );
    expect(profile.watchouts).toEqual([]);
  });

  it("reports repeat partners and response time even without dimension ratings", () => {
    const profile = buildTrustProfile(rep({ repeatPartnerCount: 3, medianResponseMinutes: 25 }));
    expect(profile.hasDimensions).toBe(false);
    expect(profile.repeatPartnerLine).toBe("3 partners traded again");
    expect(profile.responseLine).toBe("Usually replies in under an hour");
  });

  it("scales the response line to hours and days", () => {
    expect(buildTrustProfile(rep({ medianResponseMinutes: 200 })).responseLine).toBe(
      "Usually replies within 3 hours",
    );
    expect(buildTrustProfile(rep({ medianResponseMinutes: 60 * 24 * 2 })).responseLine).toBe(
      "Usually replies within 2 days",
    );
  });
});

describe("relevantDimensions", () => {
  it("asks a supplier's customer about quality, not payment", () => {
    const dims = relevantDimensions({ subjectWasSupplier: true });
    expect(dims).toContain("QUALITY");
    expect(dims).not.toContain("PAYMENT");
  });

  it("asks a buyer's counterparty about payment, not quality", () => {
    const dims = relevantDimensions({ subjectWasSupplier: false });
    expect(dims).toContain("PAYMENT");
    expect(dims).not.toContain("QUALITY");
  });
});
