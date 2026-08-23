import { describe, expect, it } from "vitest";
import { youEntries } from "./you-hub";

const withFarm = youEntries({ partyId: "p1", hasFarm: true });
const withoutFarm = youEntries({ partyId: "p1", hasFarm: false });

const byKey = (entries: ReturnType<typeof youEntries>, key: string) =>
  entries.find((e) => e.key === key)!;

describe("You, for an actor who has a farm", () => {
  it("offers a working Farm path", () => {
    expect(byKey(withFarm, "farm").href).toBe("/dashboard/farm");
  });

  it("describes the farm as something to keep up to date", () => {
    expect(byKey(withFarm, "farm").description).toMatch(/up to date/i);
  });
});

describe("You, for an actor who has no farm", () => {
  it("does not present Farm as an interactive link", () => {
    // /dashboard/farm redirects to Home for this actor, and a farm can only
    // be created at signup, so the link would bounce them forever.
    expect(byKey(withoutFarm, "farm").href).toBeNull();
  });

  it("says plainly why there is nothing there", () => {
    expect(byKey(withoutFarm, "farm").description).toBe("No farm attached to this account.");
  });

  it("still keeps the entry visible rather than silently dropping it", () => {
    // The actor should learn that Farm exists as a concept, not be left
    // wondering whether FarmaTrade lost it.
    expect(byKey(withoutFarm, "farm").label).toBe("Farm");
  });
});

describe("labels tell the truth about where they go", () => {
  it("does not label Opportunities as trade history", () => {
    // An opportunity is what might happen; history is what did. There is no
    // dedicated completed-trade surface yet, so the entry is deferred rather
    // than pointed at the opportunities page.
    for (const entry of withFarm) {
      expect(entry.label).not.toMatch(/history/i);
      expect(entry.href ?? "").not.toContain("/dashboard/opportunities");
    }
  });

  it("points the commercial record at the actor's own Network profile", () => {
    expect(byKey(withFarm, "record").href).toBe("/dashboard/network/p1");
  });

  it("never emits an entry with a label but no meaning", () => {
    for (const entry of [...withFarm, ...withoutFarm]) {
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });
});
