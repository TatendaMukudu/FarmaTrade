import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { opportunityHeadline } from "./home";

describe("opportunity-first Home", () => {
  it("states the opportunity count without claiming an unresolved strength threshold", () => {
    expect(opportunityHeadline(0)).toBe("0 opportunities found");
    expect(opportunityHeadline(1)).toBe("1 opportunity found");
    expect(opportunityHeadline(4)).toBe("4 opportunities found");
    expect(opportunityHeadline(4)).not.toContain("strong");
  });

  it("renders opportunity before greeting and administrative statistics", () => {
    const page = readFileSync("src/app/dashboard/page.tsx", "utf8");
    const hero = page.indexOf("data-home-hero");
    const administration = page.indexOf("data-home-administration");

    expect(hero).toBeGreaterThan(-1);
    expect(administration).toBeGreaterThan(-1);
    expect(hero).toBeLessThan(administration);
  });

  it("reports every open opportunity rather than the capped preview length", () => {
    const page = readFileSync("src/app/dashboard/page.tsx", "utf8");
    expect(page).toContain("opportunityHeadline(opportunityCount)");
    expect(page).not.toContain("opportunityHeadline(topMatches.length)");
  });
});
