import { describe, expect, it } from "vitest";
import { buildBriefing, briefingEmptyState, type BriefingInputs } from "./briefing-core";
import type { Anticipation, MaintenanceDue } from "./memory-core";

function inputs(overrides: Partial<BriefingInputs> = {}): BriefingInputs {
  return {
    draftCount: 0,
    awaitingYourConfirmation: [],
    unreadConversations: [],
    urgentMatches: [],
    topOpportunities: [],
    anticipations: [],
    maintenanceDue: [],
    signals: [],
    ...overrides,
  };
}

function anticipation(overrides: Partial<Anticipation> = {}): Anticipation {
  return {
    key: "SOLD:oranges",
    kind: "SOLD",
    subject: "oranges",
    category: "PRODUCE",
    headline: "You usually sell oranges around now",
    detail: "2 of the last 2 years.",
    typicalDayOfYear: 222,
    daysUntil: 3,
    occurrences: 2,
    confidence: 0.8,
    usualCounterpartyId: null,
    usualCounterpartyName: null,
    ...overrides,
  };
}

function maintenance(overrides: Partial<MaintenanceDue> = {}): MaintenanceDue {
  return {
    key: "pump",
    subject: "pump",
    headline: "pump is overdue for a service",
    detail: "Serviced 3 times.",
    daysSinceLast: 300,
    typicalIntervalDays: 240,
    overdueBy: 60,
    confidence: 0.75,
    ...overrides,
  };
}

describe("buildBriefing — ranking", () => {
  it("puts a time-critical match above everything else", () => {
    const items = buildBriefing(
      inputs({
        urgentMatches: [{ matchId: "m1", counterpartyName: "Grace", title: "Oranges" }],
        awaitingYourConfirmation: [{ matchId: "m2", counterpartyName: "Isaac" }],
        topOpportunities: [
          { matchId: "m3", counterpartyName: "Patricia", title: "Maize", score: 99, reasons: [] },
        ],
        signals: [{ id: "s1", headline: "Demand up", detail: "", strength: 1 }],
      }),
    );
    expect(items[0].kind).toBe("time_critical");
  });

  it("puts someone waiting on you above any suggestion, however good", () => {
    // A commitment already made outranks an optional opportunity. A briefing
    // that buries commitments under suggestions stops being trusted.
    const items = buildBriefing(
      inputs({
        awaitingYourConfirmation: [{ matchId: "m2", counterpartyName: "Isaac" }],
        topOpportunities: [
          { matchId: "m3", counterpartyName: "Patricia", title: "Maize", score: 100, reasons: [] },
        ],
      }),
    );
    expect(items[0].kind).toBe("waiting_on_you");
    expect(items[1].kind).toBe("opportunity");
  });

  it("orders overall: waiting > maintenance > anticipation > opportunity > signal", () => {
    const items = buildBriefing(
      inputs({
        unreadConversations: [{ matchId: "m1", counterpartyName: "Grace" }],
        maintenanceDue: [maintenance()],
        anticipations: [anticipation()],
        topOpportunities: [
          { matchId: "m2", counterpartyName: "Isaac", title: "Maize", score: 90, reasons: [] },
        ],
        signals: [{ id: "s1", headline: "Demand up", detail: "", strength: 0.9 }],
      }),
    );
    expect(items.map((i) => i.kind)).toEqual([
      "waiting_on_you",
      "maintenance",
      "anticipation",
      "opportunity",
      "signal",
    ]);
  });

  it("ranks a stronger item above a weaker one of the same kind", () => {
    const items = buildBriefing(
      inputs({
        anticipations: [
          anticipation({ key: "weak", subject: "maize", confidence: 0.3 }),
          anticipation({ key: "strong", subject: "oranges", confidence: 0.95 }),
        ],
      }),
    );
    expect(items[0].key).toBe("antic:strong");
    expect(items[1].key).toBe("antic:weak");
  });
});

describe("buildBriefing — content", () => {
  it("turns drafts into one actionable item, not one per draft", () => {
    const items = buildBriefing(inputs({ draftCount: 3 }));
    expect(items).toHaveLength(1);
    expect(items[0].headline).toBe("3 listings ready to publish");
  });

  it("offers to contact the usual partner when the memory names one", () => {
    const items = buildBriefing(
      inputs({
        anticipations: [
          anticipation({ usualCounterpartyId: "p1", usualCounterpartyName: "Grace" }),
        ],
      }),
    );
    expect(items[0].actionLabel).toBe("Contact Grace");
  });

  it("falls back to a generic action when there's no usual partner", () => {
    const items = buildBriefing(inputs({ anticipations: [anticipation()] }));
    expect(items[0].actionLabel).toBe("Get ahead of it");
  });

  it("gives every item a link and an action label", () => {
    const items = buildBriefing(
      inputs({
        draftCount: 1,
        urgentMatches: [{ matchId: "m1", counterpartyName: "G", title: "T" }],
        anticipations: [anticipation()],
        maintenanceDue: [maintenance()],
        signals: [{ id: "s1", headline: "h", detail: "d", strength: 0.5 }],
      }),
    );
    for (const item of items) {
      expect(item.href).toBeTruthy();
      expect(item.actionLabel).toBeTruthy();
      expect(item.headline).toBeTruthy();
    }
  });

  it("produces unique keys so the UI can render a stable list", () => {
    const items = buildBriefing(
      inputs({
        draftCount: 2,
        urgentMatches: [{ matchId: "m1", counterpartyName: "G", title: "T" }],
        unreadConversations: [{ matchId: "m1", counterpartyName: "G" }],
        anticipations: [anticipation()],
      }),
    );
    expect(new Set(items.map((i) => i.key)).size).toBe(items.length);
  });

  it("is empty when nothing needs the user", () => {
    expect(buildBriefing(inputs())).toEqual([]);
  });
});

describe("briefingEmptyState", () => {
  it("reassures an active user rather than showing a blank page", () => {
    expect(briefingEmptyState(true).headline).toMatch(/nothing needs you/i);
  });

  it("prompts a brand-new user toward an objective", () => {
    expect(briefingEmptyState(false).headline).toMatch(/what you're trying to do/i);
  });
});
