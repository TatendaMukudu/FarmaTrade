import { describe, expect, it } from "vitest";
import {
  SIDE_LABEL,
  STATUS_LABEL,
  asIntent,
  canWithdrawIntent,
  intentHref,
  isMatchable,
  oppositeSide,
} from "./intent";
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

  it("lets the owner withdraw both available and partly committed capacity", () => {
    expect(canWithdrawIntent("ACTIVE")).toBe(true);
    expect(canWithdrawIntent("ENGAGED")).toBe(true);
    expect(canWithdrawIntent("PROPOSED")).toBe(false);
    expect(canWithdrawIntent("WITHDRAWN")).toBe(false);
  });
});

describe("intent links", () => {
  it("carries the commercial side expected by the intent form", () => {
    expect(intentHref("SUPPLY", "PRODUCE")).toBe(
      "/dashboard/intent?side=SUPPLY&category=PRODUCE",
    );
    expect(intentHref("DEMAND", "TRANSPORT")).toBe(
      "/dashboard/intent?side=DEMAND&category=TRANSPORT",
    );
  });
});

describe("isMatchable", () => {
  // H. Permission first, quantity second.
  it("will not match an intent FarmaTrade proposed and nobody confirmed", () => {
    // Matching on a PROPOSED intent would be putting words in a farmer's
    // mouth — they have not agreed to offer anything yet. No amount of
    // remaining capacity changes that; it is not a question about quantity.
    expect(isMatchable({ status: "PROPOSED", remaining: 20 })).toBe(false);
    expect(isMatchable({ status: "PROPOSED", remaining: null })).toBe(false);
  });

  // I.
  it("will not match one the owner closed, however much it offered", () => {
    expect(isMatchable({ status: "WITHDRAWN", remaining: 20 })).toBe(false);
    expect(isMatchable({ status: "WITHDRAWN", remaining: null })).toBe(false);
  });

  it("matches an active intent that has capacity left", () => {
    expect(isMatchable({ status: "ACTIVE", remaining: 12 })).toBe(true);
  });

  // E.
  it("stops matching an active intent once it is fully spoken for", () => {
    expect(isMatchable({ status: "ACTIVE", remaining: 0 })).toBe(false);
  });

  // F. The correction this whole change exists for.
  it("keeps matching an engaged intent that still has capacity", () => {
    // A farmer offering 20 tonnes who agreed 8 with one buyer has 12 tonnes
    // for sale. Treating "in discussion" as "finished" was costing them the
    // other 12.
    expect(isMatchable({ status: "ENGAGED", remaining: 12 })).toBe(true);
  });

  // G.
  it("stops matching an engaged intent with nothing left", () => {
    expect(isMatchable({ status: "ENGAGED", remaining: 0 })).toBe(false);
  });

  it("treats an unstated quantity as no ceiling rather than as empty", () => {
    // Most transport and equipment intents carry no quantity at all. Reading
    // null as zero would have taken every one of them off the market the
    // moment capacity semantics shipped.
    expect(isMatchable({ status: "ACTIVE", remaining: null })).toBe(true);
    expect(isMatchable({ status: "ENGAGED", remaining: null })).toBe(true);
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
