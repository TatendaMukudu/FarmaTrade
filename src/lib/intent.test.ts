import { describe, expect, it } from "vitest";
import { SIDE_LABEL, STATUS_LABEL, asIntent, isMatchable, oppositeSide } from "./intent";
import type { Intent } from "@/generated/prisma/client";

function row(overrides: Partial<Intent> = {}): Intent {
  return {
    id: "p-1",
    partyId: "party-1",
    origin: "DECLARED",
    side: "SUPPLY",
    category: "PRODUCE",
    title: "Mhunga",
    description: null,
    quantity: 20,
    unit: "TONNE",
    productId: "prod-pearl-millet",
    countryCode: "ZW",
    province: "Mashonaland East",
    district: "Marondera",
    askingPrice: null,
    status: "ACTIVE",
    urgent: false,
    neededBy: null,
    recurring: false,
    openToCrossBorder: false,
    destinationProvince: null,
    destinationDistrict: null,
    travelDate: null,
    livestockId: null,
    produceId: null,
    equipmentId: null,
    createdAt: new Date(),
    expiresAt: null,
    ...overrides,
  } as Intent;
}

describe("side", () => {
  it("knows the other side of the market", () => {
    expect(oppositeSide("SUPPLY")).toBe("DEMAND");
    expect(oppositeSide("DEMAND")).toBe("SUPPLY");
  });

  it("is its own inverse", () => {
    expect(oppositeSide(oppositeSide("SUPPLY"))).toBe("SUPPLY");
  });

  it("speaks to a farmer in standing-position language, not advert language", () => {
    // A party can hold 26 tonnes and be offering none of it. "I have" would
    // describe possession; "Offering" describes participation.
    expect(SIDE_LABEL.SUPPLY).toBe("Offering");
    expect(SIDE_LABEL.DEMAND).toBe("Looking for");
  });
});

describe("status", () => {
  it("reads as commercial state, not an editorial lifecycle", () => {
    expect(STATUS_LABEL.PROPOSED).toBe("Suggested by FarmaTrade");
    expect(STATUS_LABEL.ACTIVE).toBe("Available");
    expect(STATUS_LABEL.ENGAGED).toBe("In discussion");
    expect(STATUS_LABEL.WITHDRAWN).toBe("Closed");
  });

  it("does not describe ENGAGED as finished", () => {
    // ENGAGED must never become a synonym for done. An intent under
    // discussion may still be partly available and returns to ACTIVE when a
    // negotiation falls through.
    expect(STATUS_LABEL.ENGAGED).not.toMatch(/complete|done|finish|closed/i);
  });
});

describe("isMatchable", () => {
  it("will not match an intent FarmaTrade proposed and nobody confirmed", () => {
    // Matching on a PROPOSED intent would be putting words in a farmer's
    // mouth — they have not agreed to offer anything yet.
    expect(isMatchable({ status: "PROPOSED" })).toBe(false);
  });

  it("matches an active one, and nothing else — for now", () => {
    expect(isMatchable({ status: "ACTIVE" })).toBe(true);
    expect(isMatchable({ status: "WITHDRAWN" })).toBe(false);
    // ENGAGED is excluded because that is exactly what MATCHED did, not
    // because engagement is terminal. When quantity semantics land this
    // becomes a question about remaining availability instead.
    expect(isMatchable({ status: "ENGAGED" })).toBe(false);
  });
});

describe("asIntent", () => {
  it("is the one place persistence names become domain names", () => {
    const intent = asIntent(row());
    expect(intent.side).toBe("SUPPLY");
    expect(intent.status).toBe("ACTIVE");
    expect(intent.label).toBe("Mhunga");
    expect(intent.productId).toBe("prod-pearl-millet");
  });

  it("keeps the farmer's own wording as the label, unnormalised", () => {
    expect(asIntent(row({ title: "Mhunga" })).label).toBe("Mhunga");
  });

  // The defensive `origin ?? "DECLARED"` this used to need is gone: the
  // column is NOT NULL with a default, so the database guarantees what the
  // code used to guess.
  it("carries origin, so 'FarmaTrade proposed this' is a first-class fact", () => {
    expect(asIntent(row({ origin: "DERIVED" })).origin).toBe("DERIVED");
    expect(asIntent(row({ origin: "DECLARED" })).origin).toBe("DECLARED");
  });

  it("reads quantity as what is commercially available, not what exists", () => {
    // The farm may hold 26 tonnes; this intent offers 20. Nothing here
    // knows or cares about the 26 — that is farm state, a different layer.
    expect(asIntent(row({ quantity: 20 })).quantity).toBe(20);
  });
});
