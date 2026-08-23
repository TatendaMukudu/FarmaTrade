# Implementation prompt for Codex — V1 Checkpoints 2 and 3

You are the primary implementer for this phase. Claude wrote the
specification and the acceptance tests; Claude will independently attack the
exact SHA you return. The founder authorizes merges — nobody else.

## Start here

- Work from PR #22's branch, `claude/farmatrade-intelliqs-improvements-e4nexp`,
  at head **`28ed7821e2b3ce73b61905a54ee372b20b2e83fe`** or later on that same
  branch. Fetch first; the branch moves.
- **PR #22 is the integration path toward `main`. Do not merge it, and do not
  merge into it from anywhere else.**
- Read, in this order: `AGENTS.md`, `PRODUCT_TRUTH.md`,
  `docs/invariant-register.md`, then the two specs:
  - `docs/specs/V1-CHECKPOINT-2-information-architecture.md`
  - `docs/specs/V1-CHECKPOINT-3-home-seek-trade.md`

## Founder decisions already settled — do not reopen

- PR #17 is **superseded for V1** and must not be merged into this
  architecture.
- PR #28 must **not** be merged as-is. If any decision it records is still
  current, it may only enter canonical documentation **with provenance** —
  a link to where the founder said it. A claim without a source is not
  checkable.
- PRs #23, #24, #26, #27, #29 and #31 are already integrated into #22.
  **Do not reimplement them.** They can be closed after #22 merges.
- The Scenario I correction in `28ed782` stays pinned. `COMPLETED_GOOD` and
  `COMPLETED_ISSUE` both mean the trade happened; `DID_NOT_HAPPEN` against a
  completion claim is contested and must never become a completed trade, a
  successful reputation signal, or a formed relationship. **Contact already
  disclosed at the agreed stage is not retroactively revoked** because
  fulfilment later becomes contested — do not add that.

## Order of work

### Checkpoint 2 first, alone

1. Implement `docs/specs/V1-CHECKPOINT-2-information-architecture.md`.
2. Create the acceptance tests **verbatim** from section B. If an assertion is
   wrong, argue it in the PR — do not edit it quietly to go green.
3. `npm run verify` until PASS. At least 607 passed, no more than 4 skipped.
4. Push to the branch. **Do not merge.** Report the SHA.
5. **Stop.** Do not begin Checkpoint 3 until Checkpoint 2 is clean.

### Checkpoint 3 second

6. Implement `docs/specs/V1-CHECKPOINT-3-home-seek-trade.md`.
7. Acceptance tests from section B, verbatim, including the mobile assertions
   at 320 / 360 / 390 px from a real Chromium run.
8. `npm run verify` until PASS, with a strictly higher test count.
9. Push. **Do not merge.** Report the SHA.
10. **Stop and hand back for review.**

## Scope discipline

The product direction is settled. Do **not** introduce: a new architecture,
payments, escrow, automated dispute adjudication, dynamic pricing, social
feeds, complex logistics, a fifth navigation destination, a separate Rent
product, a separate Transport product, speculative recommendations, or another
reputation redesign.

If you believe one is genuinely required to avoid breaking the approved pilot
loop, **stop and say so** with the repository evidence. Do not build it.

## The constitutional rules this work must not break

1. Inference is never authorization.
2. Farm truth is not commercial intent.
3. Opportunity is not commitment.
4. Physical-source commitments never exceed authoritative capacity.
5. Unsafe measurement conversion fails closed.
6. One actor can hold several commercial roles without becoming several
   identities.
7. A poor completed trade is still different from a trade that did not happen.
8. A disagreement about fulfilment is never invented success.
9. Farmer-facing language replaces engine vocabulary.
10. Known authoritative data is reused, not re-requested.

Plus the ten executable laws in `scripts/invariants.mjs`. If a law is
genuinely wrong, change it there in its own commit with the reasoning — never
work around it.

## Two things that are expected to be hard

**The label predicates are the point of Checkpoint 3.** `labelFor` returning
`null` is the common, correct outcome. A BARGAIN that fires on thin evidence
is worse than no label at all, because it is a claim about a farmer's money
that FarmaTrade cannot support. The tests are deliberately hostile here.

**Farm prefill is the point of the domain risk.** Reading farm truth to
pre-fill a Trade form is fine. Defaulting the amount to the whole stock, or
creating or activating any `Intent` as a side effect of rendering, is the
class of defect this entire product exists to prevent.

## What to report back

- Checkpoint 2 SHA and Checkpoint 3 SHA, separately.
- Exact changed routes, components and tests.
- **Schema migration required: yes/no.** If yes, the exact column and why the
  requirement cannot be met without it.
- Mobile validation: the measured numbers, per route, per width.
- Anything in the spec you think is wrong, and why.

Then stop. Claude reviews the SHAs against the code, not against your summary.
