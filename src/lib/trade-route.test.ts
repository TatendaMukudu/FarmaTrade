import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { intentHref } from "./intent";
import { PRIMARY_DESTINATIONS } from "./navigation";
import { normalizeLegacyTradeParams } from "./trade-route";

describe("farmer-facing Trade language", () => {
  it("uses Trade for canonical intent links", () => {
    expect(intentHref("SUPPLY", "PRODUCE")).toBe(
      "/dashboard/trade?side=SUPPLY&category=PRODUCE",
    );
  });

  it("names the navigation Trade rather than exposing the Intent implementation concept", () => {
    expect(PRIMARY_DESTINATIONS).toContainEqual({
      href: "/dashboard/trade",
      label: "Trade",
      alwaysVisible: true,
    });
    expect(PRIMARY_DESTINATIONS.map((destination) => destination.href))
      .not.toContain("/dashboard/intent");
  });

  it("keeps the old Intent URL only as a redirect to Trade", () => {
    const legacy = readFileSync("src/app/dashboard/intent/page.tsx", "utf8");
    expect(legacy).toContain('PageProps<"/dashboard/intent">');
    expect(legacy).toContain('redirect(query ? `/dashboard/trade?${query}` : "/dashboard/trade")');
  });
  it("translates legacy HAVE and NEED bookmarks without changing their meaning", () => {
    expect(normalizeLegacyTradeParams({ type: "NEED", category: "TRANSPORT" }).toString()).toBe(
      "side=DEMAND&category=TRANSPORT",
    );
    expect(normalizeLegacyTradeParams({ type: "HAVE" }).toString()).toBe("side=SUPPLY");
  });

});
