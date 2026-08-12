import { describe, expect, it } from "vitest";
import {
  DIRECTION_LABEL,
  asIntent,
  directionOf,
  isMatchable,
  statusOf,
  typeForDirection,
} from "./intent";
import type { Post } from "@/generated/prisma/client";

function row(overrides: Partial<Post> = {}): Post {
  return {
    id: "p-1",
    partyId: "party-1",
    origin: "DECLARED",
    type: "HAVE",
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
    status: "OPEN",
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
  } as Post;
}

describe("direction", () => {
  it("reads a stored type as a market position rather than a listing verb", () => {
    expect(directionOf("HAVE")).toBe("SUPPLY");
    expect(directionOf("NEED")).toBe("DEMAND");
  });

  it("round-trips, so persistence and domain can't drift", () => {
    expect(typeForDirection(directionOf("HAVE"))).toBe("HAVE");
    expect(typeForDirection(directionOf("NEED"))).toBe("NEED");
  });

  it("speaks to a farmer in standing-position language, not advert language", () => {
    expect(DIRECTION_LABEL.SUPPLY).toBe("Offering");
    expect(DIRECTION_LABEL.DEMAND).toBe("Looking for");
  });
});

describe("status", () => {
  it("maps stored lifecycle onto commercial meaning", () => {
    expect(statusOf("DRAFT")).toBe("PROPOSED");
    expect(statusOf("OPEN")).toBe("ACTIVE");
    expect(statusOf("MATCHED")).toBe("ENGAGED");
    expect(statusOf("CLOSED")).toBe("WITHDRAWN");
  });

  it("falls back to ACTIVE rather than throwing on an unknown value", () => {
    expect(statusOf("SOMETHING_NEW")).toBe("ACTIVE");
  });
});

describe("isMatchable", () => {
  it("will not match an intent FarmaTrade proposed and nobody confirmed", () => {
    // Matching on a PROPOSED intent would be putting words in a farmer's
    // mouth — they have not agreed to offer anything yet.
    expect(isMatchable({ status: "PROPOSED" })).toBe(false);
  });

  it("matches an active one, and nothing else", () => {
    expect(isMatchable({ status: "ACTIVE" })).toBe(true);
    expect(isMatchable({ status: "ENGAGED" })).toBe(false);
    expect(isMatchable({ status: "WITHDRAWN" })).toBe(false);
  });
});

describe("asIntent", () => {
  it("is the one place persistence names become domain names", () => {
    const intent = asIntent(row());
    expect(intent.direction).toBe("SUPPLY");
    expect(intent.status).toBe("ACTIVE");
    expect(intent.label).toBe("Mhunga");
    expect(intent.productId).toBe("prod-pearl-millet");
  });

  it("keeps the farmer's own wording as the label, unnormalised", () => {
    expect(asIntent(row({ title: "Mhunga" })).label).toBe("Mhunga");
  });

  it("carries origin, so 'FarmaTrade proposed this' is a first-class fact", () => {
    expect(asIntent(row({ origin: "DERIVED" })).origin).toBe("DERIVED");
    expect(asIntent(row({ origin: "DECLARED" })).origin).toBe("DECLARED");
  });

  it("treats a missing origin as declared, since every old row was typed", () => {
    expect(asIntent(row({ origin: null as never })).origin).toBe("DECLARED");
  });

  it("reads quantity as what is commercially available, not what exists", () => {
    // The farm may hold 26 tonnes; this intent offers 20. Nothing here
    // knows or cares about the 26 — that is farm state, a different layer.
    expect(asIntent(row({ quantity: 20 })).quantity).toBe(20);
  });
});
