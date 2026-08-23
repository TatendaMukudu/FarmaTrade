import { describe, expect, it } from "vitest";
import {
  HARVEST_WINDOW_DAYS,
  basisFor,
  decide,
  derivationKeyFor,
  proposalFor,
  proposedAvailability,
  type ExistingDerived,
  type SourceState,
} from "./derivation-core";
import { formatQuantity } from "./units";

const NOW = new Date("2026-09-15T09:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

function daysFromNow(days: number): Date {
  return new Date(NOW.getTime() + days * DAY);
}

function source(overrides: Partial<SourceState> = {}): SourceState {
  return {
    kind: "PRODUCE_HARVEST",
    sourceId: "produce-1",
    productId: "prod-maize",
    label: "Maize",
    quantity: 26,
    unit: "TONNE",
    availableFrom: daysFromNow(5),
    perishable: false,
    ...overrides,
  };
}

function existing(overrides: Partial<ExistingDerived> = {}): ExistingDerived {
  return {
    id: "intent-1",
    origin: "DERIVED",
    status: "PROPOSED",
    derivationKey: derivationKeyFor(source()),
    quantity: 26,
    productId: "prod-maize",
    ...overrides,
  };
}

const decideOn = (s: SourceState, e: ExistingDerived[], now = NOW) =>
  decide(s, e, now, formatQuantity);

describe("proposedAvailability", () => {
  it("proposes the whole recorded quantity as a ceiling, not a guess at a reserve", () => {
    // FarmaTrade does not know how much a household keeps back. Inventing a
    // fraction would be pretending to knowledge nobody has; the farmer does
    // the one piece of arithmetic only they can do.
    expect(proposedAvailability(source({ quantity: 26 }))).toBe(26);
  });
});

describe("derivationKeyFor", () => {
  it("changes when what is being offered changes", () => {
    const base = derivationKeyFor(source());
    expect(derivationKeyFor(source({ quantity: 15 }))).not.toBe(base);
    expect(derivationKeyFor(source({ availableFrom: daysFromNow(30) }))).not.toBe(base);
    expect(derivationKeyFor(source({ unit: "KG" }))).not.toBe(base);
    expect(derivationKeyFor(source({ productId: "prod-sorghum" }))).not.toBe(base);
  });

  it("is stable across the same facts, so nothing churns", () => {
    expect(derivationKeyFor(source())).toBe(derivationKeyFor(source()));
  });

  it("ignores the time of day on a harvest date", () => {
    const morning = new Date("2026-09-20T06:00:00Z");
    const evening = new Date("2026-09-20T20:00:00Z");
    expect(derivationKeyFor(source({ availableFrom: morning }))).toBe(
      derivationKeyFor(source({ availableFrom: evening })),
    );
  });
});

describe("basisFor", () => {
  it("explains the proposal from the source, in the farmer's own words", () => {
    expect(basisFor(source({ label: "Mhunga" }), formatQuantity)).toContain("your recorded mhunga");
    expect(basisFor(source(), formatQuantity)).toContain("26 tonnes");
  });

  it("states facts and makes no forecast", () => {
    const basis = basisFor(source(), formatQuantity);
    expect(basis).not.toMatch(/will|should|predict|guarantee|likely/i);
  });
});

describe("decide — creating", () => {
  it("proposes when a harvest comes into range and nothing exists yet", () => {
    const decision = decideOn(source({ availableFrom: daysFromNow(5) }), []);
    expect(decision.action).toBe("create");
  });

  it("stays quiet while a harvest is still far off", () => {
    const decision = decideOn(source({ availableFrom: daysFromNow(HARVEST_WINDOW_DAYS + 30) }), []);
    expect(decision).toEqual({ action: "skip", reason: "outside_window" });
  });

  it("proposes PROPOSED and never anything active", () => {
    // The engine has no way to express activation, which is the point.
    const decision = decideOn(source(), []);
    expect(decision.action).toBe("create");
    expect(Object.keys(decision)).not.toContain("status");
  });
});

describe("decide — a proposal nobody has touched", () => {
  it("leaves a current proposal alone", () => {
    expect(decideOn(source(), [existing()])).toEqual({
      action: "skip",
      reason: "proposal_current",
    });
  });

  it("revises it when the source moves, because FarmaTrade still owns it", () => {
    const moved = source({ quantity: 15 });
    const decision = decideOn(moved, [existing()]);
    expect(decision).toMatchObject({ action: "revise", intentId: "intent-1" });
    if (decision.action === "revise") expect(decision.proposal.quantity).toBe(15);
  });

  it("revises rather than duplicating, so a farmer never sees two of the same", () => {
    const decision = decideOn(source({ quantity: 15 }), [existing()]);
    expect(decision.action).not.toBe("create");
  });
});

describe("decide — once the owner has activated it", () => {
  it("will not revise a commitment the farmer made", () => {
    // They agreed to terms they saw. The ground moving is a fact to report,
    // not a licence to rewrite what they agreed to.
    const decision = decideOn(source({ quantity: 15 }), [existing({ status: "ACTIVE" })]);
    expect(decision).toMatchObject({ action: "flag_divergence", intentId: "intent-1" });
  });

  it("says nothing when an active intent still matches its source", () => {
    expect(decideOn(source(), [existing({ status: "ACTIVE" })])).toEqual({
      action: "skip",
      reason: "owner_controlled",
    });
  });

  it("treats an engaged intent as owned too", () => {
    const decision = decideOn(source({ quantity: 15 }), [existing({ status: "ENGAGED" })]);
    expect(decision.action).toBe("flag_divergence");
  });

  it("never returns revise for anything the owner controls", () => {
    for (const status of ["ACTIVE", "ENGAGED"] as const) {
      const decision = decideOn(source({ quantity: 1 }), [existing({ status })]);
      expect(decision.action, status).not.toBe("revise");
    }
  });
});

describe("decide — after the farmer said no", () => {
  it("does not ask again while nothing has changed", () => {
    // This is the whole anti-nagging mechanism. Without it, the harvest
    // still exists, so the next page load proposes it again.
    const declined = existing({ status: "WITHDRAWN" });
    expect(decideOn(source(), [declined])).toEqual({
      action: "skip",
      reason: "declined_unchanged",
    });
  });

  it("stays declined across repeated runs", () => {
    const declined = existing({ status: "WITHDRAWN" });
    for (let i = 0; i < 5; i++) {
      expect(decideOn(source(), [declined]).action).toBe("skip");
    }
  });

  it("asks again when the amount changes materially, which is a new question", () => {
    const declined = existing({ status: "WITHDRAWN" });
    expect(decideOn(source({ quantity: 40 }), [declined]).action).toBe("create");
  });

  it("does not re-ask over a re-weigh", () => {
    // 26 -> 26.4 is a farmer being careful, not a farmer changing their mind.
    const declined = existing({ status: "WITHDRAWN" });
    expect(decideOn(source({ quantity: 26.4 }), [declined]).action).toBe("skip");
  });

  it("does not re-ask because the crop was relabelled", () => {
    const declined = existing({ status: "WITHDRAWN" });
    expect(decideOn(source({ label: "White maize" }), [declined]).action).toBe("skip");
  });

  it("asks again if it turns out to be a different crop entirely", () => {
    const declined = existing({ status: "WITHDRAWN" });
    expect(decideOn(source({ productId: "prod-sorghum" }), [declined]).action).toBe("create");
  });

  it("holds the decline even if the date drifts back into the window", () => {
    // Checked before the window on purpose: a decline is about the offer,
    // not about the calendar.
    const declined = existing({ status: "WITHDRAWN" });
    expect(decideOn(source({ availableFrom: daysFromNow(1) }), [declined]).action).toBe("skip");
  });
});

describe("decide — precedence between several derived rows", () => {
  it("lets a decline beat an older stale proposal", () => {
    const decision = decideOn(source(), [
      existing({ id: "old", status: "PROPOSED", derivationKey: "stale" }),
      existing({ id: "declined", status: "WITHDRAWN" }),
    ]);
    expect(decision).toEqual({ action: "skip", reason: "declined_unchanged" });
  });

  it("lets owner control beat a stale proposal", () => {
    const decision = decideOn(source({ quantity: 15 }), [
      existing({ id: "old", status: "PROPOSED", derivationKey: "stale" }),
      existing({ id: "live", status: "ACTIVE", derivationKey: "stale" }),
    ]);
    expect(decision).toMatchObject({ action: "flag_divergence", intentId: "live" });
  });
});

describe("proposalFor", () => {
  it("carries everything needed to explain itself", () => {
    const proposal = proposalFor(source({ label: "Mhunga" }), formatQuantity);
    expect(proposal.sourceId).toBe("produce-1");
    expect(proposal.derivationKey).toBeTruthy();
    expect(proposal.basis).toContain("mhunga");
    expect(proposal.label).toBe("Mhunga");
  });

  it("marks perishable produce time-sensitive without the farmer saying so", () => {
    expect(proposalFor(source({ perishable: true }), formatQuantity).urgent).toBe(true);
    expect(proposalFor(source({ perishable: false }), formatQuantity).urgent).toBe(false);
  });
});
