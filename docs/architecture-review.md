# Architecture review, before the trusted-commerce rebuild

Written before any code changes, as requested. Everything below is from
reading the repository at `da3eaff`, not from memory of what we intended.

---

## 1. What FarmaTrade currently does

A `Party` is any actor — farm, trader, transporter — with optional `Farm` and
`TransportProfile` facets. A `Farm` owns `Livestock`, `ProduceStock` and
`Equipment`.

Commerce runs entirely through `Post`. A party manually creates a HAVE or NEED
post; `generateMatchesForPost` immediately pairs it against open posts of the
opposite type in the same category and country, filtered by province (or by
route for TRANSPORT). Each pair becomes a `Match` carrying a score and a list
of plain-language reasons.

A match moves SUGGESTED → ACCEPTED → COMPLETED. Accepting opens a
`Conversation`. Completion requires a `TransactionConfirmation` from *both*
sides, which then feeds `Reputation`, `Rating` and `Relation`.

Around that core sit the read-time layers added recently: `match-rank`
(ordering, buckets), `reason-reliability` (which reasons predict a trade),
`trade-outcomes` (per-route track record), `price-signals`, `posting-rhythm`,
`regions`, `confirmations-core`.

## 2. Where Posts sit

`Post` is the hub, not a leaf. Everything commercial is reachable only
through it:

- `Match.postAId` / `Match.postBId` — the match graph is anchored on two posts
- `Photo.postId` — all imagery hangs off a post
- `Conversation` → `Match` → `Post`
- `TransactionConfirmation` → `Match` → `Post`
- `harvest-drafts.ts` creates posts; `transport-suggestions.ts` reads them;
  `price-signals` derives from them; `confirmations` resolves parties through
  them

Sixteen non-generated source files touch `Post` directly. Removing it is not
a deletion, it is a re-anchoring of the entire commerce path.

## 3. What Post functionality can be reused

More than the brief assumes. `Post` already carries, today:

| Field | What it already is |
|---|---|
| `type` HAVE/NEED | supply vs demand |
| `category` | coarse product class |
| `quantity`, `unit` | volume |
| `askingPrice` | price expectation |
| `province`, `district`, `countryCode` | location |
| `destinationProvince/District` | route |
| `neededBy` | timing requirement |
| `expiresAt` | validity window |
| `recurring` | repeating demand |
| `urgent` | priority |
| `openToCrossBorder` | reach |
| `status` DRAFT/OPEN/MATCHED/CLOSED | lifecycle, confirm-gated |
| `produceId` / `livestockId` / `equipmentId` | link to the inventory row |

That is a **commercial-intent record**, not a social listing. The DRAFT state
even implements the exact "system proposes, farmer confirms" flow the brief
asks for — `ensureHarvestDrafts` already derives posts from
`ProduceStock.expectedHarvestDate` without the farmer writing anything.

**The problem is not the model. It is that intent must be authored manually,
is named "Post", and is presented as a marketplace listing.**

## 4. Current farm/inventory model

`Livestock` (species enum, free-text breed, sex, quantity, birthDate),
`ProduceStock` (free-text cropType, quantity, unit enum, harvestDate,
expectedHarvestDate, perishable), `Equipment` (name, category enum,
condition, available boolean).

All three describe **current state only**. There is no expected yield, no
availability window, no planting event, no expected calving, no capacity
calendar. `expectedHarvestDate` is the single forward-looking field in the
entire schema, and it drives one 7-day trigger.

## 5. Current matching model

Deterministic and explainable, which is what the brief wants. Filters:
opposite type, same category, OPEN, same country, same province (or route).
Scores: same district +20, on-route +15, reputation up to +20, verified +10.
Read-time ranking then re-prices those reasons against outcome history.

**The significant gap: there is no product identity.** Two maize posts match
because both are `PRODUCE`, not because both are maize. `cropType` is
recorded on `ProduceStock` and never used in matching at all. A maize seller
and a tomato buyer in the same district match today.

## 6. Current transaction model

There isn't one. `Match.status` reaching COMPLETED is the closest thing, and
it is reached by two self-reported `TransactionConfirmation` rows. There is
no agreed quantity, no agreed price, no agreed grade, no delivery terms, no
payment state, no fulfilment stages. Nothing records what the parties
actually agreed to — only that both said something happened.

## 7. Current reputation/ratings model

`Rating` (1–5 per match) → `Reputation` aggregate (`completedCount`,
`completedGoodCount`, `completedIssueCount`, `didNotHappenCount`,
`averageRating`, `ratingCount`), plus `Relation` for repeat pairs.

Recomputed from source rows rather than incremented, so it is already
consistent and already effectively append-only underneath. But it is one
blended notion: customer satisfaction, verified fulfilment and reliability
all collapse into the same numbers.

## 8. Current opportunity model

Not a stored concept. "Opportunity" is a rendering of `Match`, ranked and
bucketed by `match-rank.ts`. There is no derived economic proposition — no
gap analysis, no composite supply, no dependency, no "you are 4t short and
a neighbour has 6t".

## 9. Concepts currently conflated

- **`Post`**: inventory availability + commercial intent + advertisement +
  match anchor, in one row
- **`Match`**: system suggestion, mutual agreement, *and* completed
  transaction — three different things behind one `status`
- **`Reputation`**: satisfaction + verified history + reliability
- **`Photo`**: listing imagery and (potential) fulfilment evidence
- **`Post.status`**: lifecycle and availability
- **Expected vs actual**: not distinguished anywhere in the schema

## 10. Duplicate sources of truth

**The real one:** quantity lives on both `ProduceStock` and `Post`, copied at
creation and never reconciled. A farmer with 26t who posts 20t and sells it
has two records that are both now wrong, and nothing corrects either.

The others are deliberate denormalisation and are fine: `province`/`district`/
`countryCode` copied from Party to Post for query cost; `Reputation` and
`Relation.strength` are recomputed aggregates over source rows, not
independent counters.

## 11. Proposed target architecture

Layer names mapped to what already exists:

| Layer | Becomes | From |
|---|---|---|
| Farm State | `Livestock` / `ProduceStock` / `Equipment` | exists, unchanged |
| Product identity | **new** `Product` + `ProductAlias` | new — canonical id, farmer's own display name |
| Forecast | **new** `ExpectedYield` / `ExpectedEvent` | new |
| Commercial intent | `Post` → renamed **`Intent`**, derived by default | migrate |
| Opportunity | derived at read time | extend `match-rank` |
| Match | `Match`, re-anchored | migrate |
| Introduction | **new** `Introduction` | new |
| Agreement | **new** `Deal` + `DealTerm` + `DealParty` | new |
| Fulfilment | **new** `FulfilmentEvent` + `Evidence` | new |
| Transaction | `TransactionConfirmation` folded into Deal lifecycle | migrate |
| Credibility | split `Reputation` into three | migrate |

## 12. Proposed migrations

1. `Product` / `ProductAlias`, backfilled from distinct `cropType` values and
   the `LivestockSpecies` enum. Additive, no breakage.
2. `Post.productId` nullable, backfilled via alias match. Matching starts
   preferring product identity, falls back to category.
3. Forecast tables, additive.
4. `Post` → `Intent` rename plus `origin: DERIVED | DECLARED`. Mechanical.
5. `Deal` introduced alongside `Match`; `Match` gains `dealId`. `Deal` carries
   contributors, so composite fulfilment becomes possible without
   re-anchoring `Match` immediately.
6. Reputation split. `Reputation` is recomputed, so this is safe.

Every step is additive or a rename. No step requires the app to be down or
history to be rewritten.

## 13. What I recommend implementing now

Narrower than the brief's P0 list, and in this order:

1. **Canonical product identity.** Highest leverage, and a prerequisite for
   almost everything else. Forecast matching ("80t maize in November")
   cannot work while the product is just `PRODUCE`. It is also why price
   signals currently say "Produce in Chinhoyi" instead of "Maize".
2. **Forecast as first-class state** — expected yield, expected livestock
   events, equipment availability windows, with `EXPECTED` never mixed into
   `CURRENT`.
3. **Derive intent from state.** Extend the existing DRAFT mechanism so
   intent is proposed from inventory and forecast, and the farmer confirms.
   Remove "Posts" from navigation.
4. **Split the Match/Deal boundary.** Introduce `Deal` with terms and
   contributors. This is what unblocks composite fulfilment, protected
   transactions and evidence later.
5. **Fix the inventory↔intent quantity duplication** while doing (3).

## 14. What should deliberately remain future work

Payments and escrow (needs a licensed partner — build the seam only),
insurance and financing, chain-of-custody evidence, transporter evidence,
dispute handling, MFA and payout cooling periods, circumvention enforcement,
market-intelligence aggregates over verified prices, composite optimisation,
and anything ML.

## 15. Conflicts and risks

**a. "Remove Posts" as stated is riskier than the goal requires.** The goal
is that a farmer never advertises what FarmaTrade already knows. `Post` is
already an intent record with an inventory link and a confirm-gated derived
state. Renaming it to `Intent`, defaulting it to derived, and removing it
from navigation achieves the goal by migration — which §2 explicitly asks
for — where a wholesale removal re-anchors `Match`, `Photo`, `Conversation`
and `TransactionConfirmation` at once, with nothing working in between.

**b. Composite fulfilment genuinely does require a schema change.** `Match`
points at exactly two posts. Four farms satisfying one 100t requirement
cannot be expressed. This is a real blocker and is why `Deal` should come
early rather than in P2.

**c. Progressive disclosure conflicts with the existing Directory.** Today
`/dashboard/directory/[partyId]` shows any party's phone and contact details
to any signed-in user. §20 wants contact revealed only after mutual
CONNECT. These cannot both be true. Someone needs to decide whether the
Directory survives in its current form — I would remove open browsing.

**d. `DID_NOT_HAPPEN` currently punishes the counterparty on one side's
word.** I built this: a `didNotHappenCount` on `Reputation` becomes a
`counterparty_fell_through` limitation and a rank penalty. §24 says
self-reported failure is a signal, not proof. These conflict, and §24 is
right. It should feed reason-reliability and lane history — where it teaches
the system — but should not demote a party without corroboration. Worth
correcting regardless of the wider rebuild.

**e. Scope.** §49 lists five P0s and seven P1s, several of which are each a
multi-week rewrite of the commerce path. Attempting them together would
leave the app non-working for a long stretch with no reviewable checkpoint.
The five items in §13 above are what I would take first, each shippable on
its own.

**f. Already satisfied, no work needed:** no LLM anywhere in the codebase;
matching is already deterministic and explainable; `TransactionConfirmation`
is already append-only (unique on matchId+partyId, never overwritten);
`Reputation` is already recomputed from source rather than incremented; the
CSV import already has the extraction/mapping seam §46 asks for.
