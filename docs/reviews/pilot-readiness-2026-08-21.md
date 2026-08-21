# Pilot readiness audit — 2026-08-21

Branch audited: `claude/farmatrade-intelliqs-improvements-e4nexp`.
Baseline head: `6ba52b09a006464a5a4f165e646dbce3bf8d2c05` (23 commits ahead, 0 behind `origin/main`).
Baseline gate: PASS 7/7, 563 passed / 4 skipped by suite design. GitHub CI run 32221500935: success.

## Verdict

**READY AFTER BLOCKERS**, not yet safe to call generally pilot-ready.

The visible product can execute most of a friendly commercial loop. This
checkpoint makes Home opportunity-first, calls commercial intent “Trade”,
removes three deterministic correctness defects, proves future-supply and
reputation boundaries, and makes cancellation durable and visible. One P0
commercial blocker remains: source-level commitment enforcement is not on the
development branch, and PR #29 still has an unresolved package-unit decision.

## Representative pilot loop

Scenario: Farmer A records 26 tonnes of maize expected around 20 September;
Buyer B needs 15 tonnes in a currently supported location/timing shape.

| # | Step | Status | Evidence / pilot reading |
|---|---|---|---|
| 1 | Record current/future farm state | PASS | Farm CRUD records `ProduceStock.quantity`, unit and `expectedHarvestDate` (`dashboard/farm/actions.ts`). |
| 2 | Derive or declare commercial availability | ROUGH | `ensureDerivedIntent` derives only inside the seven-day harvest window. A 20 September record entered on 21 August therefore requires the farmer to create supply manually from the Trade form. The future path itself is integration-tested. |
| 3 | Owner controls activation | PASS | Derived rows stay `PROPOSED`; `confirmProposedIntent` is the only owner transition to `ACTIVE`. |
| 4 | Find a compatible opportunity | ROUGH | Activation calls `generateMatchesForIntent`; product, side, category, geography, reach and remaining capacity are checked; `neededBy` affects urgency/ranking but is not a compatibility filter. |
| 5 | Explain why | PASS | Opportunity cards render stored deterministic `Match.reasons`, counterparty history and distance. |
| 6 | Initiate allowed commercial action | ROUGH | Either side may express interest or propose terms. This works, but the §10 “demand acts” divergence remains unresolved. |
| 7 | Propose structured terms | PASS | Quantity, unit, price meaning/currency and handover date are visible inputs and immutable `AgreementTerms`. |
| 8 | Counteroffer | PASS | A counteroffer creates a new version; old consent is not inherited. |
| 9 | Accept the same version | PASS | `TermsAcceptance` is per-party/per-version; the UI shows whose move it is. |
| 10 | Allocate only at bilateral agreement | BROKEN (cross-intent source) | Intent-level capacity is correct and concurrent. The development branch can still commit across multiple intents linked to one physical source. PR #29 addresses measurable produce/livestock, but package-vs-mass policy is unresolved. |
| 11 | Communication/contact | ROUGH | Match participants can message immediately; personal contact waits for `AGREED`/`COMPLETED`. INV-15 and the exact unlock boundary remain unresolved. |
| 12 | Trade progresses | MISSING | Messaging, agreed terms and transport suggestions support off-platform coordination, but no on-platform pickup/delivery/dispute state exists. The friendly pilot must coordinate movement off-platform. |
| 13 | Record completion | PASS | Each party writes one append-only `TransactionConfirmation`; two confirmations complete the match. |
| 14 | Record cancellation | PASS | Agreed trades can now be cancelled from the trade room; actor, timestamp and governing terms persist and capacity is released. Reasons remain unresolved. |
| 15 | Preserve observed history | PASS | Immutable terms, confirmations and cancellation events survive current-status changes. |
| 16 | Update reputation/history | BROKEN | Quiet success and review/fact separation are tested. Role-scoped reputation is still violated; reviews are immediately visible because the review-window duration is unresolved. |
| 17 | Reuse remaining quantity | BROKEN | A partially committed intent stays matchable and its remaining quantity is derived correctly, but cross-intent physical-source safety remains the step-10 blocker. |

## Minimum gate for 5–10 friendly pilots

### P0 — must be resolved or explicitly constrained before onboarding

1. **Physical-source overcommitment.** Decide how a packaged source interacts
   with mass-denominated terms, finish PR #29, and prove the source lock and
   ceiling across linked intents. Until then, a supervised pilot must enforce
   one active supply intent per physical source and same-basis terms; that is
   an operating constraint, not a code guarantee.
2. **Deployment rehearsal.** The Post→Intent migration is stop/start, not
   rolling-safe (`docs/deployment.md`). Rehearse backup, migration, seed and
   rollback on a copy of pilot data before the first live account.

### P1 — end-to-end loop blockers

No additional P1 code blocker remains after durable cancellation. Pickup and
payment may happen off-platform for the friendly pilot, and both parties can
record the outcome afterwards.

### P2 — comprehension / trust roughness

- The Home/Trade changes in this checkpoint expose the intended mental model.
- The exact demand-initiation behavior needs a founder ruling; it does not
  block a small supervised cohort.
- The seven-day derivation window makes earlier future harvests manual. Do not
  change the threshold without a product decision; observe whether pilots use
  the manual path.
- Completion is available immediately after agreement. Pilot onboarding must
  say “log outcome after pickup/delivery”; a transaction lifecycle belongs to
  P0.8 rather than a cosmetic status patch.
- Messaging is match-scoped but begins before mutual interest. Closed-cohort
  risk is limited, and personal contact remains protected; do not guess the
  permanent consent boundary.
- Review retaliation protection needs an exact window. Recommendation: hide
  ratings during the 5–10-user pilot rather than invent a duration, if the
  founder wants this resolved before onboarding.

### P3 — before expansion toward ~40

- Role-scoped reputation.
- Network connections and Request/Connect semantics.
- Pagination/bounds for opportunity history and long conversations.
- Pilot analytics for funnel counts, once the questions are named.

### Later

Payments/escrow, full fulfilment/disputes, equipment scheduling, optimization
across competing deals, sponsored content and speculative coordination modes.

## Decisions still required

### Packaged source commitment boundary — blocks safe pilot

- **Option A: refuse an unmeasurable acceptance.** Safest; may block legitimate
  bag↔kg deals.
- **Option B: allow and visibly surface it.** Preserves trade but cannot uphold
  the no-double-promise invariant.
- **Option C: require packaged-source terms in the source package unit.**
  Narrow and deterministic; parties can still agree mass only after explicitly
  changing the farm/source measurement.
- **Recommendation: C.** It preserves unknown-as-unknown and makes the ceiling
  enforceable without inventing bag weight.

### Review window — does not block a supervised pilot if ratings are hidden

- **Option A:** choose a fixed blind-review duration.
- **Option B:** temporarily hide/disable ratings and pilot observed completion
  history only.
- **Recommendation: B for 5–10 users**, then choose the window from pilot use.

## Operational sanity audit

No polling, timers, request recursion or background workers were found.
Prisma is process-singleton. Match creation is one candidate query, one batched
capacity read and one `createMany`; derivation is idempotent and source-locked.
Uploads are bounded to four 4MB images. Photo responses are immutable-cacheable.

Normal but noteworthy request work:

- Home performs derivation, nine parallel reads and one
  `opportunitiesLastSeenAt` write on every render.
- Trade performs derivation again, then farm/intents/capacity reads.
- Opportunities loads all active and completed matches; conversations load all
  messages. Acceptable for 5–10 and likely ~40, but not unbounded growth.
- Sentry samples 10% of traces and receives exceptions; Render captures JSON
  logs; Neon exposes connections/query/transfer metrics. This is sufficient for
  the friendly pilot—do not build an observability platform.

Before launch, configure/confirm:

1. Sentry server/client DSNs and environment; trigger one test exception.
2. Render deploy/request/error logs and bandwidth alerts.
3. Neon connection, query and data-transfer dashboards/alerts.
4. Searchable structured events for matching/agreement failures if pilot
   diagnosis proves difficult; do not log personal message bodies or contact
   details.

## Deliberately not built

No guessed package conversion, review duration, message/contact unlock rule,
demand-only interaction model, fulfilment state machine, payment rail, Network
architecture, equipment scheduler or optimization engine was introduced.
