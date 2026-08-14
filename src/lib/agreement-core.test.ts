import { describe, expect, it } from "vitest";
import {
  awaitingFrom,
  governingTerms,
  isAcceptedByBoth,
  materiallyDiffers,
  nextVersion,
  openTerms,
  reservationFor,
  statusFor,
  viewFor,
  type Participants,
  type TermsVersion,
} from "./agreement-core";

const FARMER = "party-farmer";
const BUYER = "party-buyer";
const BOTH: Participants = [FARMER, BUYER];

function terms(overrides: Partial<TermsVersion> = {}): TermsVersion {
  return {
    id: `terms-${overrides.version ?? 1}`,
    version: 1,
    quantity: 10,
    unit: "tonne",
    unitCode: "METRIC_TONNE",
    price: 290,
    priceCurrency: "USD",
    priceBasis: "PER_UNIT",
    priceUnitCode: "METRIC_TONNE",
    handoverOn: null,
    proposedById: FARMER,
    acceptedBy: [FARMER],
    ...overrides,
  };
}

describe("isAcceptedByBoth", () => {
  it("is false while only the proposer has agreed", () => {
    expect(isAcceptedByBoth(terms(), BOTH)).toBe(false);
  });

  it("is true once both parties have agreed to that version", () => {
    expect(isAcceptedByBoth(terms({ acceptedBy: [FARMER, BUYER] }), BOTH)).toBe(true);
  });

  it("is not satisfied by the same party agreeing twice", () => {
    expect(isAcceptedByBoth(terms({ acceptedBy: [FARMER, FARMER] }), BOTH)).toBe(false);
  });
});

describe("awaitingFrom", () => {
  it("names who still has to answer", () => {
    expect(awaitingFrom(terms(), BOTH)).toEqual([BUYER]);
    expect(awaitingFrom(terms({ acceptedBy: [FARMER, BUYER] }), BOTH)).toEqual([]);
  });
});

describe("governingTerms", () => {
  it("is nothing until a version has both acceptances", () => {
    expect(governingTerms([terms()], BOTH)).toBeNull();
  });

  it("is the version both parties accepted", () => {
    const agreed = terms({ acceptedBy: [FARMER, BUYER] });
    expect(governingTerms([agreed], BOTH)?.version).toBe(1);
  });

  // E. The failure that must become impossible.
  it("does not carry consent forward onto a new version", () => {
    // Both agreed 10 tonnes. Somebody then proposes 15. The system must not
    // claim both agreed to 15 — the acceptance rows point at version 1, and
    // version 2 starts with only its proposer.
    const v1 = terms({ version: 1, id: "t1", quantity: 10, acceptedBy: [FARMER, BUYER] });
    const v2 = terms({ version: 2, id: "t2", quantity: 15, acceptedBy: [BUYER] });
    const governing = governingTerms([v1, v2], BOTH);
    expect(governing?.version).toBe(1);
    expect(governing?.quantity).toBe(10);
  });

  // H. A live agreement survives a renegotiation that has not landed.
  it("keeps the agreement in force while its replacement is unanswered", () => {
    const v1 = terms({ version: 1, id: "t1", quantity: 6, acceptedBy: [FARMER, BUYER] });
    const v2 = terms({ version: 2, id: "t2", quantity: 8, acceptedBy: [FARMER] });
    expect(governingTerms([v1, v2], BOTH)?.quantity).toBe(6);
  });

  it("moves to the new version once both agree to it", () => {
    const v1 = terms({ version: 1, id: "t1", quantity: 6, acceptedBy: [FARMER, BUYER] });
    const v2 = terms({ version: 2, id: "t2", quantity: 8, acceptedBy: [FARMER, BUYER] });
    expect(governingTerms([v1, v2], BOTH)?.quantity).toBe(8);
  });
});

describe("openTerms", () => {
  it("is the latest version nobody has finished answering", () => {
    const v1 = terms({ version: 1, id: "t1", acceptedBy: [FARMER, BUYER] });
    const v2 = terms({ version: 2, id: "t2", acceptedBy: [FARMER] });
    expect(openTerms([v1, v2], BOTH)?.version).toBe(2);
  });

  it("is nothing when the latest version is already agreed", () => {
    expect(openTerms([terms({ acceptedBy: [FARMER, BUYER] })], BOTH)).toBeNull();
  });
});

describe("nextVersion", () => {
  it("starts at 1 and never reuses a number", () => {
    expect(nextVersion([])).toBe(1);
    expect(nextVersion([terms({ version: 1 }), terms({ version: 2 })])).toBe(3);
  });
});

describe("materiallyDiffers", () => {
  const base = {
    quantity: 10,
    unit: "tonne",
    unitCode: "METRIC_TONNE" as string | null,
    price: 290,
    priceCurrency: "USD" as string | null,
    priceBasis: "PER_UNIT" as string | null,
    priceUnitCode: "METRIC_TONNE" as string | null,
    handoverOn: null as Date | null,
  };

  it("treats every term as material", () => {
    // There is no cosmetic change to a price or a handover date. A term not
    // worth re-confirming does not belong in the terms at all.
    expect(materiallyDiffers(base, { ...base, quantity: 12 })).toBe(true);
    expect(materiallyDiffers(base, { ...base, unit: "bag", unitCode: "BAG" })).toBe(true);
    expect(materiallyDiffers(base, { ...base, price: 300 })).toBe(true);
    expect(materiallyDiffers(base, { ...base, handoverOn: new Date("2026-09-01") })).toBe(true);
  });

  it("treats the price's meaning as material, not just its amount", () => {
    // "290 per tonne" and "290 for the lot" are the same number and a
    // completely different deal. Consent to one is not consent to the other.
    expect(materiallyDiffers(base, { ...base, priceBasis: "TOTAL", priceUnitCode: null })).toBe(true);
    expect(materiallyDiffers(base, { ...base, priceCurrency: "ZAR" })).toBe(true);
    expect(materiallyDiffers(base, { ...base, priceUnitCode: "KILOGRAM" })).toBe(true);
  });

  it("recognises the identical deal, so re-proposing it is not a renegotiation", () => {
    expect(materiallyDiffers(base, { ...base })).toBe(false);
  });

  it("treats a change of canonical unit as material even at the same number", () => {
    // 10 tonnes and 10 bags are not the same deal, and the canonical
    // identity is what says so rather than the spelling.
    expect(materiallyDiffers(base, { ...base, unit: "bags", unitCode: "BAG" })).toBe(true);
  });

  it("compares dates by their instant, not their identity", () => {
    const a = { ...base, handoverOn: new Date("2026-09-01T08:00:00Z") };
    const b = { ...base, handoverOn: new Date("2026-09-01T08:00:00Z") };
    expect(materiallyDiffers(a, b)).toBe(false);
  });
});

describe("reservationFor", () => {
  const agreed = terms({ acceptedBy: [FARMER, BUYER] });

  // A. The correction this phase exists for.
  it("reserves nothing while only one party has agreed", () => {
    // A buyer must not be able to take a farmer's tonnage off the market by
    // clicking accept on their own.
    expect(
      reservationFor({ status: "NEGOTIATING", governing: null }),
    ).toMatchObject({ reserves: false, basis: "none" });
  });

  // B.
  it("reserves the agreed quantity once both parties have agreed", () => {
    expect(reservationFor({ status: "AGREED", governing: agreed })).toEqual({
      reserves: true,
      quantity: 10,
      unit: "tonne",
      unitCode: "METRIC_TONNE",
      basis: "mutual_agreement",
    });
  });

  it("keeps reserving when the trade is reported done", () => {
    expect(reservationFor({ status: "COMPLETED", governing: agreed })).toMatchObject({
      reserves: true,
      quantity: 10,
    });
  });

  // I.
  it("releases everything when the engagement is closed", () => {
    expect(reservationFor({ status: "DECLINED", governing: agreed })).toMatchObject({
      reserves: false,
    });
  });

  it("releases everything when someone says the trade never happened", () => {
    expect(
      reservationFor({ status: "COMPLETED", governing: agreed, fellThrough: true }),
    ).toMatchObject({ reserves: false });
  });

  it("reserves nothing for a legacy unilateral acceptance", () => {
    // Pre-P0.4 rows: one party moved the match here alone and nothing
    // recorded who. There is no consent to honour, so honouring none is the
    // only honest reading — and it is a release, never a fabrication.
    expect(
      reservationFor({ status: "ACCEPTED", governing: null, legacyQuantity: 10, legacyUnit: "tonne" }),
    ).toMatchObject({ reserves: false, basis: "none" });
  });

  it("grandfathers a legacy completed trade, where both parties demonstrably acted", () => {
    // Two confirmations exist on a COMPLETED match. That is evidence in the
    // record, not an assumption about it.
    expect(
      reservationFor({
        status: "COMPLETED",
        governing: null,
        legacyQuantity: 10,
        legacyUnit: "tonne",
        legacyUnitCode: "METRIC_TONNE",
      }),
    ).toEqual({
      reserves: true,
      quantity: 10,
      unit: "tonne",
      unitCode: "METRIC_TONNE",
      basis: "legacy_completed",
    });
  });

  it("reserves an agreement that named no quantity, but measures nothing", () => {
    const unquantified = terms({ quantity: null, unit: null, unitCode: null, acceptedBy: [FARMER, BUYER] });
    expect(reservationFor({ status: "AGREED", governing: unquantified })).toMatchObject({
      reserves: true,
      quantity: null,
    });
  });
});

describe("statusFor", () => {
  it("is suggested while nobody has proposed anything", () => {
    expect(statusFor("SUGGESTED", [], BOTH)).toBe("SUGGESTED");
  });

  it("is negotiating once terms are on the table but unanswered", () => {
    expect(statusFor("SUGGESTED", [terms()], BOTH)).toBe("NEGOTIATING");
  });

  it("is agreed only when the rows prove both parties agreed", () => {
    expect(statusFor("NEGOTIATING", [terms({ acceptedBy: [FARMER, BUYER] })], BOTH)).toBe("AGREED");
  });

  it("stays agreed while a renegotiation is outstanding", () => {
    const v1 = terms({ version: 1, id: "t1", acceptedBy: [FARMER, BUYER] });
    const v2 = terms({ version: 2, id: "t2", acceptedBy: [FARMER] });
    expect(statusFor("AGREED", [v1, v2], BOTH)).toBe("AGREED");
  });

  it("will not reopen an outcome a person reported", () => {
    // Declining and completing are decisions somebody made. Terms activity
    // does not get to overrule either.
    expect(statusFor("DECLINED", [terms({ acceptedBy: [FARMER, BUYER] })], BOTH)).toBe("DECLINED");
    expect(statusFor("COMPLETED", [terms()], BOTH)).toBe("COMPLETED");
  });

  it("leaves a legacy row identifiable until real terms are proposed on it", () => {
    expect(statusFor("ACCEPTED", [], BOTH)).toBe("ACCEPTED");
    expect(statusFor("ACCEPTED", [terms()], BOTH)).toBe("NEGOTIATING");
  });
});

describe("viewFor", () => {
  const view = (versions: TermsVersion[], status: Parameters<typeof statusFor>[0], viewer: string) =>
    viewFor({ status, versions }, BOTH, viewer);

  it("tells each party whose move it is", () => {
    const proposed = [terms({ acceptedBy: [FARMER] })];
    expect(view(proposed, "NEGOTIATING", BUYER)).toBe("waiting_for_you");
    expect(view(proposed, "NEGOTIATING", FARMER)).toBe("waiting_for_them");
  });

  it("says agreed only when it is", () => {
    expect(view([terms({ acceptedBy: [FARMER, BUYER] })], "AGREED", FARMER)).toBe("agreed");
  });

  it("distinguishes a renegotiation from a first offer", () => {
    // The farmer has a live deal either way, and the difference matters to
    // them.
    const v1 = terms({ version: 1, id: "t1", acceptedBy: [FARMER, BUYER] });
    const v2 = terms({ version: 2, id: "t2", acceptedBy: [BUYER] });
    expect(view([v1, v2], "AGREED", FARMER)).toBe("renegotiating");
  });

  it("reports outcomes plainly", () => {
    expect(view([], "COMPLETED", FARMER)).toBe("completed");
    expect(view([], "DECLINED", FARMER)).toBe("closed");
    expect(view([], "SUGGESTED", FARMER)).toBe("suggested");
  });
});
