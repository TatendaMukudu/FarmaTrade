import { describe, expect, it } from "vitest";
import {
  detectSeasonalPatterns,
  detectMaintenanceDue,
  MIN_YEARS_FOR_SEASONAL,
  type MemoryRecord,
} from "./memory-core";

function event(overrides: Partial<MemoryRecord> & { occurredAt: Date }): MemoryRecord {
  return {
    kind: "SOLD",
    subject: "oranges",
    category: "PRODUCE",
    counterpartyId: null,
    counterpartyName: null,
    quantity: null,
    unit: null,
    ...overrides,
  };
}

const AUGUST_10_2026 = new Date("2026-08-10T00:00:00Z");

describe("detectSeasonalPatterns", () => {
  it("finds a pattern that repeated in the same window across years", () => {
    const events = [
      event({ occurredAt: new Date("2024-08-12T00:00:00Z") }),
      event({ occurredAt: new Date("2025-08-08T00:00:00Z") }),
    ];
    const found = detectSeasonalPatterns(events, AUGUST_10_2026);
    expect(found).toHaveLength(1);
    expect(found[0].subject).toBe("oranges");
    expect(found[0].headline).toMatch(/usually sell oranges around now/i);
  });

  it("ignores a one-off — a single occurrence is an anecdote, not a habit", () => {
    const events = [event({ occurredAt: new Date("2025-08-09T00:00:00Z") })];
    expect(detectSeasonalPatterns(events, AUGUST_10_2026)).toEqual([]);
  });

  it(`requires ${MIN_YEARS_FOR_SEASONAL} distinct years, not just repeated events`, () => {
    // Three sales, all in one season. Busy August, not an annual pattern.
    const events = [
      event({ occurredAt: new Date("2025-08-02T00:00:00Z") }),
      event({ occurredAt: new Date("2025-08-09T00:00:00Z") }),
      event({ occurredAt: new Date("2025-08-16T00:00:00Z") }),
    ];
    expect(detectSeasonalPatterns(events, AUGUST_10_2026)).toEqual([]);
  });

  it("stays quiet about a pattern that isn't due for months", () => {
    const events = [
      event({ occurredAt: new Date("2024-02-10T00:00:00Z") }),
      event({ occurredAt: new Date("2025-02-14T00:00:00Z") }),
    ];
    expect(detectSeasonalPatterns(events, AUGUST_10_2026)).toEqual([]);
  });

  it("handles a season that straddles the new year without averaging to mid-year", () => {
    // Zimbabwe's main planting season runs across December-January. Treating
    // day-of-year linearly would put the mean of 20 Dec and 5 Jan in July and
    // silently drop the most important pattern on the platform.
    const events = [
      event({ kind: "BOUGHT", subject: "seed", occurredAt: new Date("2023-12-28T00:00:00Z") }),
      event({ kind: "BOUGHT", subject: "seed", occurredAt: new Date("2025-01-03T00:00:00Z") }),
    ];
    const found = detectSeasonalPatterns(events, new Date("2026-01-01T00:00:00Z"));
    expect(found).toHaveLength(1);
    expect(found[0].subject).toBe("seed");
  });

  it("names a counterparty only when they were involved more than once", () => {
    const withRepeat = detectSeasonalPatterns(
      [
        event({ occurredAt: new Date("2024-08-12T00:00:00Z"), counterpartyId: "p1", counterpartyName: "Grace" }),
        event({ occurredAt: new Date("2025-08-08T00:00:00Z"), counterpartyId: "p1", counterpartyName: "Grace" }),
      ],
      AUGUST_10_2026,
    );
    expect(withRepeat[0].usualCounterpartyName).toBe("Grace");

    const withoutRepeat = detectSeasonalPatterns(
      [
        event({ occurredAt: new Date("2024-08-12T00:00:00Z"), counterpartyId: "p1", counterpartyName: "Grace" }),
        event({ occurredAt: new Date("2025-08-08T00:00:00Z"), counterpartyId: "p2", counterpartyName: "Isaac" }),
      ],
      AUGUST_10_2026,
    );
    expect(withoutRepeat[0].usualCounterpartyName).toBeNull();
  });

  it("phrases the object grammatically for singular, plural and bulk subjects", () => {
    function headlineFor(kind: MemoryRecord["kind"], subject: string) {
      return detectSeasonalPatterns(
        [
          event({ kind, subject, occurredAt: new Date("2024-08-11T00:00:00Z") }),
          event({ kind, subject, occurredAt: new Date("2025-08-09T00:00:00Z") }),
        ],
        AUGUST_10_2026,
      )[0].headline;
    }

    // Countable singular takes an article...
    expect(headlineFor("TRANSPORT_HIRED", "refrigerated truck")).toBe(
      "You usually hire a refrigerated truck around now",
    );
    expect(headlineFor("EQUIPMENT_RENTED_IN", "irrigation pump")).toBe(
      "You usually rent an irrigation pump around now",
    );
    // ...plurals and bulk commodities don't.
    expect(headlineFor("SOLD", "oranges")).toBe("You usually sell oranges around now");
    expect(headlineFor("BOUGHT", "maize")).toBe("You usually buy maize around now");
    // A leading quantity is already a determiner.
    expect(headlineFor("SOLD", "3 tonnes of oranges")).toBe(
      "You usually sell 3 tonnes of oranges around now",
    );
  });

  it("keeps different subjects as separate patterns", () => {
    const events = [
      event({ subject: "oranges", occurredAt: new Date("2024-08-12T00:00:00Z") }),
      event({ subject: "oranges", occurredAt: new Date("2025-08-08T00:00:00Z") }),
      event({ subject: "maize", occurredAt: new Date("2024-08-05T00:00:00Z") }),
      event({ subject: "maize", occurredAt: new Date("2025-08-14T00:00:00Z") }),
    ];
    const found = detectSeasonalPatterns(events, AUGUST_10_2026);
    expect(found.map((f) => f.subject).sort()).toEqual(["maize", "oranges"]);
  });

  it("rates a tightly-clustered pattern more confidently than a smeared one", () => {
    const tight = detectSeasonalPatterns(
      [
        event({ occurredAt: new Date("2024-08-10T00:00:00Z") }),
        event({ occurredAt: new Date("2025-08-10T00:00:00Z") }),
      ],
      AUGUST_10_2026,
    );
    const smeared = detectSeasonalPatterns(
      [
        event({ occurredAt: new Date("2024-07-22T00:00:00Z") }),
        event({ occurredAt: new Date("2025-08-28T00:00:00Z") }),
      ],
      AUGUST_10_2026,
    );
    expect(tight[0].confidence).toBeGreaterThan(smeared[0].confidence);
  });
});

describe("detectMaintenanceDue", () => {
  function service(occurredAt: string, subject = "drip irrigation kit"): MemoryRecord {
    return event({ kind: "MAINTENANCE", subject, occurredAt: new Date(occurredAt) });
  }

  it("flags an asset that's past its own usual service interval", () => {
    const found = detectMaintenanceDue(
      [service("2025-02-01T00:00:00Z"), service("2025-10-01T00:00:00Z")],
      new Date("2026-08-01T00:00:00Z"),
    );
    expect(found).toHaveLength(1);
    expect(found[0].headline).toBe("Drip irrigation kit is overdue for a service");
    expect(found[0].overdueBy).toBeGreaterThan(0);
  });

  it("says nothing when the asset was serviced recently", () => {
    const found = detectMaintenanceDue(
      [service("2025-02-01T00:00:00Z"), service("2025-10-01T00:00:00Z")],
      new Date("2025-11-01T00:00:00Z"),
    );
    expect(found).toEqual([]);
  });

  it("is the only place MAINTENANCE surfaces — seasonal detection leaves it alone", () => {
    // Servicing cadence is interval-based, not annual. Before this rule the
    // same asset appeared twice in one briefing, once with worse reasoning.
    const events = [
      service("2024-08-11T00:00:00Z"),
      service("2025-08-09T00:00:00Z"),
    ];
    expect(detectSeasonalPatterns(events, AUGUST_10_2026)).toEqual([]);
    expect(detectMaintenanceDue(events, AUGUST_10_2026).length).toBeGreaterThan(0);
  });

  it("needs two services to infer an interval from — one gives no cadence", () => {
    const found = detectMaintenanceDue([service("2024-01-01T00:00:00Z")], AUGUST_10_2026);
    expect(found).toEqual([]);
  });

  it("warns shortly before the interval elapses, not only once it's late", () => {
    // Serviced every ~240 days; 225 days in, it should already be surfacing —
    // the point is to prevent a breakdown, not to report one.
    const found = detectMaintenanceDue(
      [service("2025-01-01T00:00:00Z"), service("2025-08-29T00:00:00Z")],
      new Date("2026-04-11T00:00:00Z"),
    );
    expect(found).toHaveLength(1);
    expect(found[0].headline).toBe("Drip irrigation kit is due for a service soon");
  });
});
