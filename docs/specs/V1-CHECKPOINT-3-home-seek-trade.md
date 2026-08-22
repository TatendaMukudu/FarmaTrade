# Checkpoint 3 — Home, Seek and Trade

Specification author: Claude. Implementer: Codex. Reviewer: Claude.
Written against PR #22 head **`28ed7821e2b3ce73b61905a54ee372b20b2e83fe`**.

**Begin only after Checkpoint 2 is green and pushed.** Do not merge.

---

## The objective, stated so it can be failed

Home stops being a report about FarmaTrade and becomes the place a farmer
starts a piece of commerce. Two verbs, then a short list of things worth
knowing.

The failure mode this replaces is a first screen made of counters. A counter
answers "how much of me is there?", which is a question the farmer never
asked. `What do you want to do?` answers the one they did.

The second objective is narrower and matters more: **an opportunity label is a
claim, and FarmaTrade may only make claims it can evidence.** BARGAIN on a card
where FarmaTrade has four listings and a median is a finding. BARGAIN on every
card is a decoration, and a decoration that says "bargain" is a lie about
someone's money.

---

## A. Repository mapping

| # | Current | Change class | Expected final surface |
|---|---|---|---|
| 1 | `src/app/dashboard/page.tsx` (349 lines): greeting, stamping prompts, opportunity section, "Quick actions" | **UI COMPOSITION** + **COPY ONLY** | Greeting and business name stay (small). Then `What do you want to do?` with **SEEK** and **TRADE**. Then `For you`. Then a compact attention strip. Counters cease to be the dominant surface. |
| 2 | `src/lib/home.ts` — only `opportunityHeadline(count)` | **UI COMPOSITION** | Gains the Home composition helpers. Stays pure. |
| 3 | *(does not exist)* | **UI COMPOSITION** | `src/lib/opportunity-label.ts` — pure. `labelFor(evidence): OpportunityLabel \| null`. The evidence predicates below are the whole point of this checkpoint. |
| 4 | `/dashboard/trade?side=SUPPLY\|DEMAND` (`trade/page.tsx`, `form.tsx`, `actions.ts`) | **UI COMPOSITION** | Reused as-is for routing. SEEK → `?side=DEMAND`. TRADE → `?side=SUPPLY`. Form gains progressive disclosure: one question first. |
| 5 | `src/lib/price-signals.ts` (`MIN_LISTINGS = 4`, `PRICE_WINDOW_DAYS = 30`, `summarizePrices`) | **reuse, no change** | The only admissible evidence for BARGAIN. |
| 6 | `src/lib/match-rank.ts` (`MatchSignal[]`, `confidence`, `Bucket`) | **reuse, no change** | The only admissible evidence for GOOD FIT. Do not add a ranking factor. |
| 7 | `/dashboard/opportunities` | **ROUTING: none** | The "See all" target from Home's `For you`. |
| 8 | `/dashboard/network/[partyId]` (Checkpoint 2) | **UI COMPOSITION** | The counterparty record. Reached from every bilateral opportunity. |
| 9 | Farm models `ProduceStock` / `Livestock` / `Equipment` | **reuse, no change** | Source of Trade prefill. **Read only.** Product law 1 is unchanged: nothing here writes inventory. |
| 10 | `src/lib/derived-intent.ts`, `confirmProposedIntent` | **reuse, no change** | Still the only owner transition from `PROPOSED` to `ACTIVE`. Prefill is not derivation and must not touch this. |

**Schema/migration required: none.** Every label predicate reads existing
columns and existing pure modules. If Codex concludes otherwise, stop and
state the exact column that is missing and why the claim cannot be made
without it — do not add a migration to make a label easier.

---

## The label predicates — normative

`labelFor` returns **at most one** label, or `null`. `null` is the expected
result for most opportunities and is never an error. A card with no label is a
card FarmaTrade has nothing extra to say about.

Precedence, when more than one qualifies: **IN_DEMAND > BARGAIN > GOOD_FIT.**
A card carrying three badges tells a farmer nothing, and "someone actively
wants what you have" is the most directly actionable thing FarmaTrade can say.
*(Codex may argue this ordering — argue it in the PR, do not change it
silently.)*

### IN_DEMAND

Qualifies when, and only when, **the counterparty's intent is a DEMAND and the
viewer's side of the match is SUPPLY.** Someone has actively said they want
this. It is a restatement of a stated fact, not an inference, which is why it
outranks the other two.

### BARGAIN

Qualifies only when **all** of the following hold. Any one missing → not a
bargain:

1. A `PriceSignal` exists for the same **subject, district, unit and
   currency**, built from **at least `MIN_LISTINGS` (4)** listings inside
   `PRICE_WINDOW_DAYS` (30).
2. The opportunity's own price is **resolvable**: `priceBasis` is recorded,
   its currency equals the signal's currency, and its unit equals the
   signal's unit. An ambiguous legacy price is never a bargain.
3. The price is on the favourable side of the **observed** range for the
   viewer's direction:
   - viewer is buying (their side is DEMAND): `unitPrice <= signal.low`
   - viewer is selling (their side is SUPPLY): `unitPrice >= signal.high`

The threshold is the observed extreme rather than an invented percentage,
because a percentage would be a number FarmaTrade made up and the range is a
number it measured. This is deliberately hard to qualify for.

### GOOD_FIT

Qualifies when the match carries **at least three distinct `MatchSignal`
kinds**. Three separate reasons for compatibility is a defensible reading of
"strong compatibility across meaningful constraints"; one is not.

No forecasting, no causal claim, no "you will" — product law 7 applies to
every label string.

---

## B. Acceptance tests

Definition of done. **Do not weaken an assertion to make it pass.**

### B1. `src/lib/opportunity-label.test.ts` — create verbatim

```ts
import { describe, expect, it } from "vitest";
import { labelFor, type LabelEvidence } from "./opportunity-label";

const base: LabelEvidence = {
  viewerSide: "DEMAND",
  counterpartySide: "SUPPLY",
  signalKinds: [],
  price: null,
  priceSignal: null,
};

describe("IN_DEMAND", () => {
  it("fires when someone actively wants what the viewer supplies", () => {
    expect(labelFor({ ...base, viewerSide: "SUPPLY", counterpartySide: "DEMAND" }))
      .toBe("IN_DEMAND");
  });

  it("does not fire merely because the viewer wants something", () => {
    expect(labelFor({ ...base, viewerSide: "DEMAND", counterpartySide: "SUPPLY" }))
      .not.toBe("IN_DEMAND");
  });
});

describe("BARGAIN", () => {
  const signal = {
    subject: "maize", district: "Mutare", unit: "KILOGRAM",
    currencyCode: "USD", listings: 4, low: 300, median: 400, high: 520,
  };
  const buying = {
    ...base, viewerSide: "DEMAND" as const, counterpartySide: "SUPPLY" as const,
    priceSignal: signal,
  };

  it("fires for a buyer at or below the observed low", () => {
    expect(labelFor({
      ...buying,
      price: { unitPrice: 300, currencyCode: "USD", unit: "KILOGRAM", basisRecorded: true },
    })).toBe("BARGAIN");
  });

  it("does not fire on a merely below-median price", () => {
    expect(labelFor({
      ...buying,
      price: { unitPrice: 390, currencyCode: "USD", unit: "KILOGRAM", basisRecorded: true },
    })).not.toBe("BARGAIN");
  });

  it("refuses to claim a bargain on thin evidence", () => {
    // Three listings is not a market. MIN_LISTINGS is 4 for a reason.
    expect(labelFor({
      ...buying,
      priceSignal: { ...signal, listings: 3 },
      price: { unitPrice: 100, currencyCode: "USD", unit: "KILOGRAM", basisRecorded: true },
    })).not.toBe("BARGAIN");
  });

  it("refuses to claim a bargain on a price whose meaning was never recorded", () => {
    // P0.7: a legacy number that might be a total or a rate is not evidence.
    expect(labelFor({
      ...buying,
      price: { unitPrice: 100, currencyCode: "USD", unit: "KILOGRAM", basisRecorded: false },
    })).not.toBe("BARGAIN");
  });

  it("refuses to compare across currencies", () => {
    // No FX. Product law 5.
    expect(labelFor({
      ...buying,
      price: { unitPrice: 100, currencyCode: "ZAR", unit: "KILOGRAM", basisRecorded: true },
    })).not.toBe("BARGAIN");
  });

  it("refuses to compare across units", () => {
    expect(labelFor({
      ...buying,
      price: { unitPrice: 100, currencyCode: "USD", unit: "BAG", basisRecorded: true },
    })).not.toBe("BARGAIN");
  });

  it("reverses direction for a seller", () => {
    const selling = {
      ...base, viewerSide: "SUPPLY" as const, counterpartySide: "SUPPLY" as const,
      priceSignal: signal,
    };
    expect(labelFor({
      ...selling,
      price: { unitPrice: 520, currencyCode: "USD", unit: "KILOGRAM", basisRecorded: true },
    })).toBe("BARGAIN");
    expect(labelFor({
      ...selling,
      price: { unitPrice: 300, currencyCode: "USD", unit: "KILOGRAM", basisRecorded: true },
    })).not.toBe("BARGAIN");
  });
});

describe("GOOD_FIT", () => {
  it("needs three distinct reasons, not one", () => {
    expect(labelFor({ ...base, signalKinds: ["same_district"] })).not.toBe("GOOD_FIT");
    expect(labelFor({ ...base, signalKinds: ["same_district", "on_your_route"] }))
      .not.toBe("GOOD_FIT");
    expect(labelFor({
      ...base,
      signalKinds: ["same_district", "on_your_route", "counterparty_rated"],
    })).toBe("GOOD_FIT");
  });

  it("does not count the same reason three times", () => {
    expect(labelFor({
      ...base,
      signalKinds: ["same_district", "same_district", "same_district"],
    })).not.toBe("GOOD_FIT");
  });
});

describe("the honest default", () => {
  it("says nothing when there is nothing to say", () => {
    expect(labelFor(base)).toBeNull();
  });

  it("never decorates: an ordinary opportunity carries no label", () => {
    expect(labelFor({ ...base, signalKinds: ["same_province"] })).toBeNull();
  });
});

describe("precedence", () => {
  it("prefers the stated fact over the inferred claim", () => {
    expect(labelFor({
      ...base,
      viewerSide: "SUPPLY",
      counterpartySide: "DEMAND",
      signalKinds: ["same_district", "on_your_route", "counterparty_rated"],
    })).toBe("IN_DEMAND");
  });

  it("returns at most one label", () => {
    const result = labelFor({
      ...base,
      viewerSide: "SUPPLY",
      counterpartySide: "DEMAND",
      signalKinds: ["same_district", "on_your_route", "counterparty_rated"],
    });
    expect(typeof result === "string" || result === null).toBe(true);
  });
});
```

### B2. `src/lib/home.test.ts` — extend

```ts
describe("Home composition", () => {
  it("leads with the two verbs, not with counters", () => {
    const sections = homeSections(/* ...fixture... */);
    expect(sections[0].kind).toBe("act");           // Seek / Trade
    expect(sections.findIndex((s) => s.kind === "opportunities"))
      .toBeLessThan(sections.findIndex((s) => s.kind === "stats"));
  });

  it("offers exactly two primary actions", () => {
    expect(primaryActions().map((a) => a.label)).toEqual(["Seek", "Trade"]);
  });

  it("has no top-level action for a category or a tenure", () => {
    // Rent, hire, transport, equipment, produce, storage, labour and land are
    // all examples of Seek or Trade, not siblings of them.
    const banned = /rent|hire|transport|equipment|produce|storage|labour|labor|land|supplies/i;
    for (const a of primaryActions()) expect(a.label).not.toMatch(banned);
  });

  it("keeps a useful empty state when nothing is on offer", () => {
    const empty = opportunitySection([]);
    expect(empty.message).toMatch(/tell farmatrade what you.re looking for/i);
    expect(empty.action).toEqual({ label: "Seek", href: "/dashboard/trade?side=DEMAND" });
  });

  it("shows only a few, and points at the rest", () => {
    const many = opportunitySection(Array.from({ length: 12 }, makeOpportunity));
    expect(many.shown.length).toBeLessThanOrEqual(4);
    expect(many.seeAll).toBe("/dashboard/opportunities");
  });
});
```

### B3. Integration — Seek, Trade and authorization

New or extended integration tests, all against real Postgres:

1. **SEEK routes to a demand form**, TRADE to a supply form, from Home.
2. **Trade prefills from farm truth**: a party with 3 t of oranges opening
   Trade sees that source offered, with its real quantity and unit.
3. **Prefill does not preselect the whole quantity.** The submitted quantity
   must come from an explicit choice. Assert that rendering the form creates
   no intent and selects no default amount equal to the full stock.
4. **Farm truth alone creates no ACTIVE supply.** Create a `ProduceStock`,
   run whatever Home/Trade does on render, assert no `Intent` exists with
   `status: "ACTIVE"` for it.
5. **A derived proposal still needs the owner.** Assert `PROPOSED` after
   derivation and `ACTIVE` only after `confirmProposedIntent`.
6. **No duplicate intents on resubmission.** Submit the same Seek twice in
   succession; assert exactly one `Intent` row. This is the rerender/double-tap
   trap and it must be pinned, not assumed.
7. **Transport is still reachable through Seek/Trade** with no transport
   route: create a transport DEMAND via Seek and a transport SUPPLY via Trade
   and assert they match.
8. **Temporary equipment access works through terms**, not through a Rent
   feature: a tractor SUPPLY and a three-day DEMAND match and can reach
   agreement.
9. **Opportunity leads to the counterparty record**, and a counterparty with
   no completed trades renders as `New to FarmaTrade` with **no numeric
   score anywhere in the output**.
10. **The Network profile does not widen contact disclosure** — a stranger
    gets `false` from `canSeeContactDetails`, unchanged.

### B4. Mobile

Playwright is available and Chromium is preinstalled. At **320, 360 and 390
CSS px**, for Home, Seek, Trade, Network, You, Farm, opportunity detail and
counterparty profile:

- `document.documentElement.scrollWidth <= window.innerWidth` (no horizontal
  overflow) — assert this, do not eyeball it.
- Every nav target and primary button has a touch target of **at least 44x44
  px**.
- On Home at 390px, **Seek and Trade are both within the first viewport**
  without scrolling.

### B5. Regression

All Checkpoint 2 tests plus the existing suite stay green: **at least 607
passed, no more than 4 skipped**, including every P0.6/P0.6.1 and Scenario I
case.

---

## C. Adversarial cases — the traps

1. **The decorative badge.** BARGAIN rendered from `score > n`, from bucket, or
   on every card. I will feed `labelFor` three listings and a very low price
   and expect `null`.
2. **The invented threshold.** A percentage under median substituted for the
   observed `low`. That number would be FarmaTrade's invention, not its
   measurement.
3. **The currency slip.** Comparing a ZAR price to a USD range. There is no FX
   in this product and there must be none in a label.
4. **The legacy price.** A pre-P0.7 number with no recorded basis used as
   evidence. It might be a total or a rate; it is not evidence of either.
5. **The greedy prefill.** Trade prefilled from farm truth defaulting to the
   full stock, so a farmer taps through and offers everything they own. The
   whole product exists to prevent that class of mistake.
6. **The silent activation.** Prefill, or Home rendering, creating or
   activating an `Intent`. Farm truth is not commercial intent, and inference
   is not authorization.
7. **The double intent.** Two rows from one double-tap or one rerender.
8. **The lost transport.** Removing transport from navigation and removing it
   from matching along the way.
9. **The rent product.** A third verb appearing as "Rent" or "Hire".
10. **The engine vocabulary.** "Match", "Listing", "Post", "Intent" surviving
    on Home, Seek, Trade, Network or You because the model is still called
    that internally. Internal names may stay; farmer-facing strings may not.
11. **The manufactured score.** A counterparty with no history rendering
    `0`, `0.0`, `0%` or `No rating (0)` instead of `New to FarmaTrade`.
12. **The contradicting screen.** Home or an opportunity card saying something
    the authoritative agreement/settlement state disagrees with — the same
    class of defect as the "waiting on them to confirm" line fixed in
    `28ed782`.

---

## Definition of done for Checkpoint 3

- `src/lib/opportunity-label.ts` exists, is pure, DB-free, and B1 passes
  verbatim.
- B2, B3, B4 exist and pass.
- `npm run verify` PASS; test count strictly greater than Checkpoint 2's.
- Mobile assertions produced from a real browser run, with the numbers in the
  report — not "looks fine".
- Pushed to PR #22's branch. **Not merged.**
