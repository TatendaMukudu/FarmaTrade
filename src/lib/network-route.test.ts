import { describe, expect, it } from "vitest";
import { legacyDirectoryTarget } from "./network-route";

describe("legacy Directory URLs", () => {
  it("sends the directory index to Network", () => {
    expect(legacyDirectoryTarget([])).toBe("/dashboard/network");
  });

  it("preserves the party being looked up", () => {
    // Counterparty lookup is reached by id from opportunity cards and trade
    // rooms. A rename that drops the id breaks the single most important
    // path in the product.
    expect(legacyDirectoryTarget(["party-123"])).toBe("/dashboard/network/party-123");
  });

  it("does not invent a party from an empty segment", () => {
    expect(legacyDirectoryTarget([""])).toBe("/dashboard/network");
  });
});
