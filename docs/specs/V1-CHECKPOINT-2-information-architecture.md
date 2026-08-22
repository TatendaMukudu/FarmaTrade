# Checkpoint 2 — Information architecture

Specification author: Claude. Implementer: Codex. Reviewer: Claude.
Written against PR #22 head **`28ed7821e2b3ce73b61905a54ee372b20b2e83fe`**
(gate PASS 7/7, 607 passed / 4 skipped).

**Do not merge.** PR #22 remains the integration path toward `main`.

---

## The objective, stated so it can be failed

FarmaTrade currently exposes its **object model** as its navigation model. A
farmer is asked to understand Directory, Opportunities and Farm as five
sibling destinations, which is a database diagram with labels on it.

V1 has **four conceptual destinations**: Home, Trade, Network, You.

The test of success is not that five labels became four. It is that a farmer
who has never seen FarmaTrade can say what each destination is *for* without
being told. "Directory" fails that test. "Opportunities" fails it as a
destination, because an opportunity is something that arrives, not somewhere
you go.

---

## A. Repository mapping

Change classes: **COPY ONLY**, **UI COMPOSITION**, **ROUTING**,
**DOMAIN BEHAVIOR**, **SCHEMA/MIGRATION**.

| # | Current | Change class | Expected final surface |
|---|---|---|---|
| 1 | `src/components/dashboard-nav.tsx` — private `navItems(hasFarm)`, 5 entries, used by both `Sidebar` and `BottomTabs` | **UI COMPOSITION** + new pure module | Reads `PRIMARY_DESTINATIONS` from a new pure `src/lib/navigation.ts`. Exactly four entries. `hasFarm` no longer gates a primary destination. |
| 2 | *(does not exist)* | **UI COMPOSITION** | `src/lib/navigation.ts` — pure, DB-free, exports `PRIMARY_DESTINATIONS` and `isDestinationActive(pathname, href)`. Pure so the IA is provable without a DOM. |
| 3 | `/dashboard` (`src/app/dashboard/page.tsx`, 349 lines) | **no change this checkpoint** | Stays as-is. Home is Checkpoint 3. |
| 4 | `/dashboard/trade` (`src/app/dashboard/trade/page.tsx`) | **no change this checkpoint** | Already the canonical commercial-intent surface. Already called Trade. |
| 5 | `/dashboard/directory` + `/dashboard/directory/[partyId]` | **ROUTING** + **COPY ONLY** | Canonical becomes `/dashboard/network` + `/dashboard/network/[partyId]`. Old paths become redirects. Heading and body copy stop saying "Directory". |
| 6 | `/dashboard/farm` | **ROUTING: none** | **Stays at `/dashboard/farm`.** Reached from You. See "Why Farm does not move" below. |
| 7 | *(does not exist)* | **ROUTING** + **UI COMPOSITION** | `/dashboard/you` — a hub linking Farm, Trade history, Commercial record, Profile, Settings. Composition over existing routes; no new domain reads beyond what those routes already do. |
| 8 | `/dashboard/opportunities` | **ROUTING: none** | Route stays and stays reachable. **Removed from primary navigation only.** Reached from Home ("See all") and from You > Trade history. |
| 9 | `/dashboard/settings` | **UI COMPOSITION** | Stays. Linked from You rather than being its own primary destination. |
| 10 | `/dashboard/intent`, `/dashboard/posts` | **no change** | Already correct redirects to `/dashboard/trade` (`src/lib/trade-route.ts`). Leave them alone. |
| 11 | Every in-app link to `/dashboard/directory/...` | **ROUTING** | Points at `/dashboard/network/...`. Enumerate with grep; do not rely on memory. |

**Schema/migration required: none.** Nothing here touches a model, a
migration, or a domain rule. If Codex believes a migration is needed, that is
a signal the change has drifted out of scope — stop and say so instead.

### Why Farm does not move

The brief says *old Farm → You > Farm*. That is an **information-architecture**
statement, not a URL statement, and the two are worth separating:

- "Farm" is already farmer language. It is not an implementation word leaking
  into a URL the way `/dashboard/intent` was.
- `/dashboard/farm` owns the only legitimate inventory writes in the system
  (product law 1) and has its own actions, forms and integration tests. Moving
  the route buys a farmer nothing and risks the one area where a mistake
  corrupts a farmer's record of their own harvest.
- The brief itself says *"Do not delete useful underlying capabilities"* and
  *"Reuse existing routes/models wherever practical."*

So: **You links to `/dashboard/farm`.** If Codex wants URL coherence it may add
`/dashboard/you/farm` as a redirect *to* `/dashboard/farm`, but the canonical
route does not move and the farm actions are not touched.

"Directory" is the opposite case and does move: it is a user-facing word the
founder has replaced, and it appears in the URL a farmer can read.

---

## B. Acceptance tests

These are the definition of done. **Codex may not weaken an assertion to make
one pass.** If an assertion is wrong, say so and argue it — do not edit it
quietly.

### B1. `src/lib/navigation.test.ts` — new file, create verbatim

```ts
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
```

### B2. `src/lib/network-route.test.ts` — new file, create verbatim

Mirrors the existing `trade-route.ts` pattern: a pure helper, tested without a
DOM, so the redirect is provable rather than asserted.

```ts
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
```

### B3. Additions to the live suite — no regression

Add to an existing integration test file (or a new
`src/app/dashboard/ia.integration.test.ts`):

1. **Farm data survives the IA change.** Create a party with a `ProduceStock`
   row, then assert the row is still readable and `/dashboard/farm`'s loader
   still returns it. The trap is a "move" that drops a route and takes its
   data access with it.
2. **Counterparty lookup still resolves by id** after the Directory rename,
   through whatever function the network profile page uses.
3. **Opportunities remain reachable** — assert the `/dashboard/opportunities`
   loader still returns a party's matches even though nothing in the primary
   nav points at it.
4. **`canSeeContactDetails` is unchanged** — the Network profile must not
   widen contact disclosure. Assert a stranger still gets `false`.

### B4. Existing tests that must stay green

All 607. Specifically do not disturb: `agreement.integration.test.ts`,
`capacity.test.ts`, `confirmations-core.test.ts` (the Scenario I cases),
`identity-safety.integration.test.ts`, `trade-route.test.ts`.

---

## C. Adversarial cases — the traps

Written as things I will actively try to do to the delivered SHA.

1. **The disappearing farm.** Moving Farm "into You" by deleting
   `/dashboard/farm` and re-creating a thinner version under You. I will look
   for lost inventory actions, a lost CSV import, and any farm write that
   stopped being covered by product law 1.
2. **The broken counterparty.** Renaming Directory but leaving one link at
   `/dashboard/directory/[partyId]` — or redirecting the index and forgetting
   the `[partyId]` child. I will grep every link and follow the id path from
   an opportunity card.
3. **The unreachable opportunity.** Removing Opportunities from nav *and* from
   everywhere else, so the only way to an opportunity is a notification that
   does not exist yet. I will check that Home and You both reach it.
4. **The relabelled database.** Nav says "Network" while the page heading
   still says "Directory", or You > Farm shows "Listings"/"Posts"/"Matches" in
   its copy. I will grep the primary surfaces for engine vocabulary.
5. **The conditional shape.** Keeping `hasFarm` so a new pilot user sees three
   destinations and an experienced one sees four. The product must not change
   shape under a new user.
6. **The widened profile.** The Network profile page rendering `phone` or
   `contactDetails` without going through `canSeeContactDetails`. This was a
   live defect once (INV-14) and a rename is exactly how it comes back.
7. **The silent regression.** A green gate achieved by deleting or skipping a
   test rather than satisfying it. I will diff the test count and the skip
   list against 607 passed / 4 skipped.

---

---

# Amendment 1 — route ownership (founder ruling, 2026-08-21)

**Provenance:** founder decision issued in the Checkpoint 2 correction brief
after reviewing `docs/reviews/CHECKPOINT-2-claude-review-2026-08-21.md`
(commit `dc76098`), in response to the open question I raised there about
where `/dashboard/opportunities` belongs. Recorded here because a decision
without a source is not checkable.

## The ruling

Primary navigation is unchanged: **Home · Trade · Network · You**. Deep routes
belong to them as follows.

| Destination | Owns |
|---|---|
| **Home** | `/dashboard`, `/dashboard/opportunities` |
| **Trade** | `/dashboard/trade`, `/dashboard/conversations/...` |
| **Network** | `/dashboard/network`, `/dashboard/network/[partyId]` |
| **You** | `/dashboard/you`, `/dashboard/farm`, `/dashboard/settings` |

Founder rationale, recorded verbatim in substance: opportunities are surfaced
*by FarmaTrade to the actor* and are primarily a Home concept —
`/dashboard/opportunities` is the deeper "See all opportunities" surface, and
**it is not trade history**. A live bilateral trade room orients the actor
within Trade. Farm stays technically canonical at `/dashboard/farm`; its move
under You is an information-architecture relationship, not a URL migration.

## Why this cannot be prefix matching

`isDestinationActive(pathname, href)` takes only the destination's own href,
and the ruling is **not derivable from the URL**: Home owns
`/dashboard/opportunities`, and You owns `/dashboard/farm` and
`/dashboard/settings`, neither of which sits under `/dashboard/you`.
Meanwhile `/dashboard` is a prefix of literally every route, so treating it as
one would give Home everything.

Ownership must therefore be **declared**, not inferred:

- Each destination declares the routes it owns.
- `/dashboard` matches **exactly** and never by prefix.
- Every other owned route `p` matches `r` when `r === p` or
  `r.startsWith(p + "/")` — the `+ "/"` is what stops `/dashboard/networking`
  claiming Network and `/dashboard/trades` claiming Trade.
- Where more than one owned route matches, the **longest** wins. That keeps
  the result deterministic rather than dependent on declaration order.
- A route nobody owns returns `null`. That is honest, and test B7 exists so it
  cannot happen silently.

## The "Trade history" label

You currently labels `/dashboard/opportunities` as **Trade history**. That is
semantically wrong and the founder has ruled it out: an opportunity is what
*might* happen; trade history is what *did*.

**I checked, so Codex does not have to:** there is no dedicated completed-trade
history route. `find src/app -name page.tsx` returns no such surface, and
completed history renders as a `History` section *inside*
`src/app/dashboard/opportunities/page.tsx` (line 405).

So the founder's fallback applies definitively: **remove or defer the Trade
history entry.** Do not relink it, and do not build a history subsystem in
this correction.

## B6 — `src/lib/navigation.test.ts`, add verbatim

```ts
import { activeDestination } from "./navigation";

describe("route ownership (founder ruling 2026-08-21)", () => {
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

  it("resolves exactly one destination for every owned route", () => {
    const routes = [
      "/dashboard", "/dashboard/opportunities", "/dashboard/trade",
      "/dashboard/conversations/m1", "/dashboard/network",
      "/dashboard/network/p1", "/dashboard/you", "/dashboard/farm",
      "/dashboard/settings",
    ];
    for (const r of routes) {
      const active = PRIMARY_DESTINATIONS.filter((d) => isDestinationActive(r, d.href));
      expect(active, `${r} lit ${active.map((a) => a.label)}`).toHaveLength(1);
    }
  });
});
```

## B7 — every real route must have an owner

This is the test that stops Blocker 2 from ever recurring: it walks the app
directory rather than trusting a hand-written list, so a future route cannot
be added without being assigned.

```ts
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Legacy compatibility routes redirect away and are never rendered under the
// dashboard chrome, so they own no navigation state.
const REDIRECT_ONLY = ["/dashboard/directory", "/dashboard/posts", "/dashboard/intent"];

function dashboardRoutes(dir = "src/app/dashboard", acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) dashboardRoutes(full, acc);
    else if (entry === "page.tsx") {
      acc.push("/" + relative("src/app", dir).replace(/\\/g, "/"));
    }
  }
  return acc;
}

it("assigns every dashboard route to a primary destination", () => {
  const unowned = dashboardRoutes()
    .filter((r) => !REDIRECT_ONLY.some((x) => r.startsWith(x)))
    // A dynamic segment stands in for a real id.
    .map((r) => r.replace(/\[[^\]]+\]/g, "sample"))
    .filter((r) => activeDestination(r) === null);
  expect(unowned, `unowned routes: ${unowned.join(", ")}`).toEqual([]);
});
```

## Scope fence for this correction

Fix only Blocker 1 and Blocker 2. **Do not** touch the sub-44px Farm
`Edit`/`Remove` controls, the Network filter heights, the "Opportunities"
heading or the "Supply & needs" copy — all four are pre-existing and belong to
Checkpoint 3's mobile and copy passes. Do not start Checkpoint 3. Do not merge.

---

## Definition of done for Checkpoint 2

- `src/lib/navigation.ts` and `src/lib/network-route.ts` exist, are pure, and
  are listed in the `domain-core-is-database-free` law if they import nothing.
- B1 and B2 exist verbatim and pass.
- B3 added and passing.
- `npm run verify` PASS, with **at least** 607 passed and no more than 4
  skipped.
- Pushed to PR #22's branch. **Not merged.**
- Report: changed routes, changed components, new tests, and an explicit
  "schema migration required: no".
