import { describe, expect, it } from "vitest";
import { PRIMARY_DESTINATIONS, isDestinationActive } from "./navigation";

describe("primary navigation", () => {
  it("offers exactly four conceptual destinations", () => {
    expect(PRIMARY_DESTINATIONS).toHaveLength(4);
  });

  it("names them in farmer language, in the founder-approved order", () => {
    expect(PRIMARY_DESTINATIONS.map((d) => d.label)).toEqual([
      "Home",
      "Trade",
      "Network",
      "You",
    ]);
  });

  it("does not expose an implementation word as a destination", () => {
    // "Directory" is a filing cabinet. "Opportunities" is something that
    // arrives, not somewhere you go. "Posts", "Listings", "Matches" and
    // "Intents" are object names.
    const banned = /directory|opportunit|post|listing|match|intent/i;
    for (const d of PRIMARY_DESTINATIONS) {
      expect(d.label).not.toMatch(banned);
      expect(d.href).not.toMatch(banned);
    }
  });

  it("routes every destination somewhere real and distinct", () => {
    const hrefs = PRIMARY_DESTINATIONS.map((d) => d.href);
    expect(new Set(hrefs).size).toBe(4);
    for (const href of hrefs) expect(href.startsWith("/dashboard")).toBe(true);
  });

  it("does not make a destination conditional on having a farm", () => {
    // The old nav hid Farm until a farm existed, which made the shape of the
    // product change under a new user. Four destinations, always.
    expect(PRIMARY_DESTINATIONS.every((d) => d.alwaysVisible !== false)).toBe(true);
  });

  it("marks Home active only on Home, and a section active on its children", () => {
    expect(isDestinationActive("/dashboard", "/dashboard")).toBe(true);
    expect(isDestinationActive("/dashboard/network", "/dashboard")).toBe(false);
    expect(isDestinationActive("/dashboard/network/abc", "/dashboard/network")).toBe(true);
  });
});
