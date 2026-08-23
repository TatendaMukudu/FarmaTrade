import { describe, expect, it } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { PRIMARY_DESTINATIONS, activeDestination, isDestinationActive } from "./navigation";

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

// Founder ruling, 2026-08-21. Rationale and provenance in
// docs/specs/V1-CHECKPOINT-2-information-architecture.md Amendment 1.
describe("route ownership", () => {
  it.each([
    ["/dashboard", "Home"],
    ["/dashboard/opportunities", "Home"],
    ["/dashboard/trade", "Trade"],
    ["/dashboard/conversations/match-1", "Trade"],
    ["/dashboard/network", "Network"],
    ["/dashboard/network/party-1", "Network"],
    ["/dashboard/you", "You"],
    ["/dashboard/farm", "You"],
    ["/dashboard/settings", "You"],
  ])("%s orients the actor within %s", (pathname, label) => {
    expect(activeDestination(pathname)).toBe(label);
  });

  it("never lets Home claim a route it does not own", () => {
    // /dashboard is a prefix of every route in the product. Exact match only.
    for (const p of ["/dashboard/trade", "/dashboard/network", "/dashboard/you"]) {
      expect(activeDestination(p)).not.toBe("Home");
    }
  });

  it("does not let a sibling route steal a destination", () => {
    expect(activeDestination("/dashboard/networking")).not.toBe("Network");
    expect(activeDestination("/dashboard/trades")).not.toBe("Trade");
  });

  it("lights exactly one destination for every owned route", () => {
    const routes = [
      "/dashboard", "/dashboard/opportunities", "/dashboard/trade",
      "/dashboard/conversations/m1", "/dashboard/network",
      "/dashboard/network/p1", "/dashboard/you", "/dashboard/farm",
      "/dashboard/settings",
    ];
    for (const r of routes) {
      const active = PRIMARY_DESTINATIONS.filter((d) => isDestinationActive(r, d.href));
      expect(active.map((a) => a.label), `${r}`).toHaveLength(1);
    }
  });
});

// The test that stops this class of defect returning: it walks the app rather
// than trusting a hand-written list, so a new route cannot be added without
// being assigned an owner.
describe("every dashboard route has an owner", () => {
  const REDIRECT_ONLY = ["/dashboard/directory", "/dashboard/posts", "/dashboard/intent"];

  function dashboardRoutes(dir = "src/app/dashboard", acc: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) dashboardRoutes(full, acc);
      else if (entry === "page.tsx") acc.push("/" + relative("src/app", dir).replace(/\\/g, "/"));
    }
    return acc;
  }

  it("assigns every dashboard route to a primary destination", () => {
    const unowned = dashboardRoutes()
      .filter((r) => !REDIRECT_ONLY.some((x) => r.startsWith(x)))
      .map((r) => r.replace(/\[[^\]]+\]/g, "sample"))
      .filter((r) => activeDestination(r) === null);
    expect(unowned, `unowned: ${unowned.join(", ")}`).toEqual([]);
  });
});
