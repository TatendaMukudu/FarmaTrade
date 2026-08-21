# Invariant register

Live status of `PRODUCT_TRUTH.md` §52 against the code.

Every row is evidence-based — either a test that runs, a static check in
`scripts/invariants.mjs`, or a structural fact I verified in the source.
Where a row says **VIOLATED** the code contradicts DECIDED product truth
today, and that is a defect, not a backlog item.

| Status | Meaning |
|---|---|
| **HELD (test)** | An executable test fails if it breaks |
| **HELD (structural)** | The architecture makes it true; no test yet pins it |
| **PARTIAL** | True in part; a named case is not covered |
| **VIOLATED** | The code contradicts DECIDED product truth |
| **NOT BUILT** | Trivially true because the feature does not exist |

---

## INV-01 — Favorability before revenue · **HELD (static)**

No revenue concept exists, so nothing can corrupt ranking. Now pinned by
`scripts/invariants.mjs` law 9: the ranking modules may not import or
reference any revenue, sponsorship, fee or placement signal. It bites before
the first paid placement is written rather than after.

## INV-02 — Proposed is not agreed · **HELD (test)**

P0.2 + P0.4. A `PROPOSED` intent is never matchable
(`agreement.integration.test.ts`), and capacity moves only when the second
`TermsAcceptance` row lands. Concurrent derivation runs are serialized per
physical source and tested to converge on one proposal, so two page renders
cannot duplicate proposed capacity before its owner sees it.

## INV-03 — Demand initiates · **PARTIAL — see divergence D1**

The literal invariant text ("available supply does not automatically create
commitments") **holds**: nothing auto-commits. But §10's stronger prose
("demand acts", "a farmer should not have to chase every possible buyer")
is not implemented — `proposeTerms` is symmetric and a supplier may open
terms on a buyer.

## INV-04 — Negotiation preserves agency · **HELD (test)**

P0.4 terms versions. Accept, decline and counter all covered.

## INV-05 — Agreement creates history · **HELD (test)**

`AgreementTerms` are immutable and append-only; cancellation sets
`Match.status` and leaves the terms intact. Tested: "the record of what was
agreed survives the cancellation."

## INV-06 — Future supply is tradeable · **HELD (test)**

Derivation reads `expectedHarvestDate` and proposes ahead of harvest; an
integration test now proves the owner can authorize that future proposal and
form a bilateral agreement while its harvest date is still ahead, without
commerce changing the recorded farm quantity.

## INV-07 — Multi-supplier fulfillment · **HELD (test)**

Tested end to end: a 100t demand satisfied by 40t + 30t leaves 30t.

## INV-08 — Small does not mean inferior · **HELD (static)**

`matching-core.ts` and `match-rank.ts` contain zero references to
`sizeHectares` or any size signal. Now pinned by law 10 so it cannot be
introduced quietly.

## INV-09 — Network is not reputation · **NOT BUILT**

No network concept exists (§23 is unbuilt). Trivially true; untestable until
connections exist.

## INV-10 — Role reputation remains separate · **VIOLATED**

`Reputation` is a **single aggregate per party**: `completedCount`,
`averageRating`, `ratingCount`. There is no role dimension, so poor buyer
behaviour and strong supplier performance land in the same average. §31 is
DECIDED and the schema cannot express it.

## INV-11 — Reviews cannot rewrite facts · **HELD (test)**

`Rating` (subjective) and `TransactionConfirmation` (observed) are separate
models and `recomputeReputation` derives `completedCount` from confirmations
only. An integration test pins a one-star review beside an observed good
completion and proves the review changes rating fields without changing the
observed completion fields.

## INV-12 — Quiet success counts · **HELD (test)**

`completedCount = completedGoodCount + completedIssueCount`, both from
`TransactionConfirmation`. Ratings feed only `averageRating`/`ratingCount`.
An integration test proves a completed trade with no review still increments
the completion record while rating count remains zero and average stays
unknown.

## INV-13 — Cancellation persists · **HELD (test)**

An `AgreementCancellation` row now preserves the cancelling party, timestamp,
and exact immutable terms version that governed when the agreement was
cancelled. The current `Match.status` still releases capacity, while the event
survives in trade history. A pre-agreement decline creates no cancellation.
Cancellation-reason taxonomy and dispute consequences remain unresolved under
§38/§57 and are deliberately not guessed.

## INV-14 — Personal identity remains protected · **HELD (test)** — was VIOLATED

`/dashboard/directory/[partyId]` rendered `party.phone` and
`party.contactDetails` to **any signed-in party**, with no relationship
gate. Directly contradicts §29 DECIDED.

Fixed conservatively in `src/lib/identity-safety.ts`, pinned by seven cases
in `identity-safety.integration.test.ts`: contact details are visible only
where the viewer and the subject share a **mutually agreed** engagement. A
suggested match does not qualify, and neither does one party having proposed
terms — the same bar P0.4 set for consuming capacity. §57 item 15 ("exact
circumstances in which personal/contact information unlocks") is **\***, so
this is the narrowest reversible rule that satisfies the DECIDED half —
**not** a proposed answer to the starred question.

## INV-15 — Stranger messaging cannot bypass trust boundary · **PARTIAL**

`assertPartyInMatch` gates every message on being a party to the match, so
there is no open inbox. But matches are system-generated, so a stranger
FarmaTrade suggested can message you before any agreement. Whether the
suggested match *is* the trust boundary (§30) is a product question.

## INV-16 — Payment cannot buy trust · **NOT BUILT**

No payment, premium or subscription concept exists.

## INV-17 — Sponsorship cannot masquerade as favorability · **HELD (static)**

Same check as INV-01, law 9.

## INV-18 — User remains trader · **HELD (test)**

The strongest invariant in the codebase. P0.4: no capacity moves without
both parties accepting the same terms version, proven under concurrency.

## INV-19 — Commercial truth does not require a post · **HELD (structural)**

There is no post concept at all. Commercial facts live in `ProduceStock`,
`Livestock`, `Equipment` and `Intent`; derivation turns farm state into
proposals with no listing authored by anyone.

## INV-20 — Posts cannot become inventory authority · **NOT BUILT**

No post concept exists to conflict with inventory. Becomes live the moment
§9's profile/post layer is built, and is worth encoding *before* that.

---

## Divergences from DECIDED product truth

Raised rather than silently implemented, per §54.

**D1 — §10 "Demand acts" is not implemented.** `generateMatchesForIntent`
runs on both sides and `proposeTerms` is symmetric. A supplier can open
terms on a buyer today. INV-03 as written is satisfied; §10's prose is not.
These are different claims and the register treats them separately.

**D2 — §6 Home is opportunity-first — corrected.** `/dashboard` now opens
with a selective opportunity count and its top ranked opportunities before
the greeting, urgent confirmations and administrative statistics. A static
ordering test pins the hero ahead of administration. It deliberately says
*"4 opportunities found"*, not *"4 strong opportunities found"*: the
threshold for "strong" belongs to the unresolved exact ranking policy, and
Home must not turn that unknown into a claim.

**D3 — §7 structure is PARTIAL.** Home and Trade are now named in the
farmer-facing navigation, and `/dashboard/trade` replaces the implementation
word in the canonical URL. `/dashboard/intent` survives only as a bookmark
redirect. Network does not exist, and the fourth destination remains
deliberately unresolved, so the complete four-part shape is not yet present.

**D4 — §23 Network does not exist.** No connections, no Request/Connect
actions (§30), no network trust signals (§26). `Relation` exists but is
derived from completed trades only — it cannot represent a pre-existing
off-platform relationship (§25).

**D5 — §35 review retaliation protection does not exist.** Ratings are
visible immediately. No review window.

**D6 — §31 role reputation** — see INV-10.

---

## Where I disagree, stated explicitly

Per §54, rather than implementing my preference quietly.

**§10 "Demand acts" vs §3A "What opportunities did FarmaTrade find for
me?"** — I think these are in tension for the supply side. If a farmer opens
FarmaTrade and sees a buyer who needs their maize, §3A has created
anticipation and §10 tells them to wait for the buyer to act. Either
suppliers get a first-class action on a discovered opportunity, or Home is
mostly a demand-side experience and suppliers get a quieter product. I do
not think this is resolved, and I would not implement either reading without
a ruling.

**§35 hidden reviews vs §36 quiet success.** If reviews are hidden until a
window expires, and completion counts regardless, then during the window a
counterparty sees a completion count that moved with no visible reason. That
is probably fine, but it means the review window is visible in the data even
while the review is not — worth knowing before it is called a privacy
property.

---

## What is deliberately not here

Nothing in `PRODUCT_TRUTH.md` §57 has been resolved by implementation. The
INV-14 fix touches item 15 and deliberately does **not** answer it: it
implements the DECIDED half (strangers cannot see contact details) with the
narrowest reversible rule available, and leaves the unlock condition open.
