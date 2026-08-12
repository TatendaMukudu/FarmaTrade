import { describe, expect, it } from "vitest";
import {
  pendingStamps,
  promptsWorthSurfacing,
  stampBanner,
  stampingRate,
  type StampableMatch,
} from "./confirmations-core";

const NOW = new Date("2026-08-08T09:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

function agreedDaysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * DAY);
}

function match(overrides: Partial<StampableMatch> = {}): StampableMatch {
  return {
    matchId: "m-1",
    counterpartyName: "Rudo Produce",
    title: "20 tonnes of maize",
    agreedAt: agreedDaysAgo(0),
    youStamped: false,
    counterpartyStamped: false,
    ...overrides,
  };
}

describe("pendingStamps", () => {
  it("leaves out what this farmer has already confirmed", () => {
    expect(pendingStamps([match({ youStamped: true })], NOW)).toEqual([]);
  });

  it("does not chase a trade agreed this morning", () => {
    expect(pendingStamps([match()], NOW)[0].urgency).toBe("waiting");
  });

  it("escalates on elapsed time since both sides agreed", () => {
    expect(pendingStamps([match({ agreedAt: agreedDaysAgo(3) })], NOW)[0].urgency).toBe("due");
    expect(pendingStamps([match({ agreedAt: agreedDaysAgo(10) })], NOW)[0].urgency).toBe("overdue");
  });

  it("stops escalating once the record is very likely lost", () => {
    expect(pendingStamps([match({ agreedAt: agreedDaysAgo(60) })], NOW)[0].urgency).toBe("stale");
  });

  it("moves a trade up when the counterparty has already filed theirs", () => {
    // One tap from being on the record, and the most wasteful kind to lose.
    expect(pendingStamps([match({ counterpartyStamped: true })], NOW)[0].urgency).toBe("due");
    expect(
      pendingStamps([match({ agreedAt: agreedDaysAgo(3), counterpartyStamped: true })], NOW)[0]
        .urgency,
    ).toBe("overdue");
  });

  it("puts the most pressing first, then the oldest", () => {
    const prompts = pendingStamps(
      [
        match({ matchId: "fresh", agreedAt: agreedDaysAgo(0) }),
        match({ matchId: "old", agreedAt: agreedDaysAgo(20) }),
        match({ matchId: "middling", agreedAt: agreedDaysAgo(3) }),
      ],
      NOW,
    );
    expect(prompts.map((p) => p.matchId)).toEqual(["old", "middling", "fresh"]);
  });
});

describe("promptsWorthSurfacing", () => {
  it("interrupts a farmer only for what is fair to ask about", () => {
    const prompts = pendingStamps(
      [
        match({ matchId: "today", agreedAt: agreedDaysAgo(0) }),
        match({ matchId: "due", agreedAt: agreedDaysAgo(3) }),
        match({ matchId: "ancient", agreedAt: agreedDaysAgo(90) }),
      ],
      NOW,
    );
    expect(promptsWorthSurfacing(prompts).map((p) => p.matchId)).toEqual(["due"]);
  });
});

describe("stampBanner", () => {
  it("says nothing when nothing is fairly owed", () => {
    expect(stampBanner(pendingStamps([match()], NOW))).toBeNull();
    expect(stampBanner([])).toBeNull();
  });

  it("leads with the counterparty who is waiting, by name", () => {
    const banner = stampBanner(
      pendingStamps([match({ counterpartyStamped: true, counterpartyName: "Rudo Produce" })], NOW),
    )!;
    expect(banner.headline).toContain("Rudo Produce");
    expect(banner.tone).toBe("warning");
  });

  it("gives the farmer a reason that is about them, not about us", () => {
    const banner = stampBanner(pendingStamps([match({ agreedAt: agreedDaysAgo(10) })], NOW))!;
    expect(banner.reason).toMatch(/your track record|both of your records/i);
    expect(banner.reason).not.toMatch(/algorithm|our data|improve matching/i);
  });

  it("asks plainly when a trade is merely due", () => {
    const banner = stampBanner(pendingStamps([match({ agreedAt: agreedDaysAgo(3) })], NOW))!;
    expect(banner.tone).toBe("info");
    expect(banner.headline).toContain("go ahead");
  });

  it("counts only what it is actually surfacing", () => {
    const banner = stampBanner(
      pendingStamps(
        [
          match({ matchId: "a", agreedAt: agreedDaysAgo(10) }),
          match({ matchId: "b", agreedAt: agreedDaysAgo(10) }),
          match({ matchId: "ignored", agreedAt: agreedDaysAgo(90) }),
        ],
        NOW,
      ),
    )!;
    expect(banner.count).toBe(2);
  });
});

describe("stampingRate", () => {
  it("reports a plain number rather than a scolding", () => {
    const { rate, line } = stampingRate(10, 7);
    expect(rate).toBe(70);
    expect(line).toBe("You've confirmed 7 of 10 agreed trades.");
  });

  it("says there is nothing to report rather than showing a zero", () => {
    expect(stampingRate(0, 0).rate).toBeNull();
  });
});
