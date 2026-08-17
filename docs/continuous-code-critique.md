# Continuous code critique (day-one baseline)

> **Purpose:** give an independent review worker a repeatable loop for checking
> Claude-authored changes from the first commit onward, using test-driven
> development (TDD) as the quality bar.

## Scope and interpretation

The repository does not currently contain a document named `TTD`, a technical
test design, or another expansion of that acronym. This critique therefore
interprets “TTD” as **TDD (test-driven development)** and derives the product
invariants from the schema, tests, and user-facing flows already in the
repository. If a separate TTD exists, add it to `docs/` and make it the first
input in the review loop below.

This is a living engineering artifact, not a one-time approval. The review
worker should update the findings table after every Claude change, without
silently editing production code. A human or implementation worker owns fixes.

## Executive critique

The codebase has a stronger foundation than a typical prototype: domain logic
is often extracted into pure modules, there are focused unit tests, database
constraints protect several uniqueness rules, Server Actions generally verify
the current party, and CI supplies a real PostgreSQL service. The current suite
contains 265 tests (with 4 skipped in this environment), and 226 non-database
tests passed during this baseline review.

The largest risk is not a lack of tests, but a mismatch between **what is
tested** and **where irreversible side effects occur**. Trade confirmation and
post/photo creation span several writes and external operations without a
single consistency boundary. A failure halfway through can leave durable state
that the UI reports as failed. There is also no browser-level test of the main
journey, so individually correct actions can still compose into a broken user
experience.

### Day-one scorecard

| TDD quality | Baseline | Critique |
| --- | --- | --- |
| Fast unit feedback | **Good** | Pure matching, ranking, validation, CSV, reputation, and pricing behavior is covered. |
| Real persistence tests | **Good but hard to run locally** | Integration tests use PostgreSQL correctly, but `npm test` fails noisily when the database is absent rather than separating or clearly preflighting integration tests. |
| User-journey coverage | **Missing** | No browser/E2E suite covers sign up → post → match → accept → confirm. |
| Failure-path design | **Needs work** | External storage and multi-write trade flows lack atomic or compensating behavior. |
| Security regression coverage | **Partial** | Ownership checks exist, but access-control, upload-content, session, and abuse cases do not have a consolidated adversarial suite. |
| Delivery gate | **Good baseline** | CI runs migrations, lint, tests, and build against PostgreSQL. It does not report coverage, run E2E/accessibility checks, or audit dependencies. |
| Operability | **Partial** | Structured logging and Sentry exist; there are no explicit health/readiness checks for the database and object storage. |

## Prioritized findings

Severity means user/business impact, not stylistic preference. “Proof test” is
the failing test that should be written **before** changing implementation.

| ID | Severity | Status | Owner | Finding and evidence | Proof test / acceptance condition | Recommended optimization | Closure evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| C-01 | **P0** | Open | Unassigned | `confirmMatch` creates the confirmation, optionally creates a rating, counts confirmations, updates the match, and recomputes derived records as independent operations. A failure after the first write produces a partially committed trade and a retry is then rejected as a duplicate. See `src/app/dashboard/opportunities/actions.ts`. | Force rating or reputation persistence to fail after confirmation creation. Assert that either no authoritative writes remain, or that retry deterministically resumes and completes the operation. Add a simultaneous-two-party confirmation test. | Put authoritative database writes in a short Prisma transaction. Treat reputation/relation as idempotent derived projections: recompute after commit and make failures retryable via an outbox/job, rather than rolling back a valid confirmation because a projection failed. | — |
| C-02 | **P0** | Open | Unassigned | `createPost` persists a post, uploads objects, creates photo rows, then generates matches. Object storage cannot participate in the database transaction. Upload, row creation, or matching failure can leave an orphan object, a post with missing photos, or a successfully created post reported as an error. See `src/app/dashboard/posts/actions.ts`. | Inject failure at each boundary: first/second upload, `photo.createMany`, and match generation. Assert a documented final state and successful idempotent retry, including deletion of orphaned objects. | Model creation state explicitly (`DRAFT`/processing), preallocate photo records, upload with cleanup compensation, and activate/match only after persistence succeeds. Move matching to an idempotent post-commit job or return success once the post is durable. | — |
| C-03 | **P1** | Open | Unassigned | The test command mixes unit and database integration tests. On a workstation without PostgreSQL, the baseline was 226 passed, 35 failed, and 4 skipped; every observed failure was a refused database connection. This obscures genuine regressions and weakens the fast red/green/refactor loop. See `vitest.config.mts` and `package.json`. | `npm run test:unit` passes with no external services. `npm run test:integration` either runs against an explicit test database or exits immediately with one actionable preflight error. CI runs both. | Split scripts/config by filename or project, add a database preflight/global setup, and document a disposable local test database command. Never point tests at a developer or production database; add a guard on the database name/environment. | — |
| C-04 | **P1** | Open | Unassigned | There is no end-to-end test for the core commercial loop, despite extensive lower-level tests. Server Action mocks cannot prove forms, redirects, cache invalidation, layouts, and authorization work together. | In a clean test database, two users sign up, create compatible posts, see the match, accept it, exchange a message, confirm both sides, and observe completion/reputation. Include a mobile viewport and one failure recovery case. | Add a very small Playwright smoke suite. Keep business permutations in unit/integration tests; reserve E2E for critical journeys to avoid a slow, brittle pyramid. | — |
| C-05 | **P1** | Needs product decision | Product owner | Photo validation trusts the browser-provided MIME type and the read endpoint serves stored bytes publicly with a one-year immutable cache. The code does not verify file signatures, authorize visibility, set `X-Content-Type-Options: nosniff`, or document that every uploaded image is intentionally public forever. See `src/app/api/photos/[id]/route.ts` and post creation. | Upload mislabeled/non-image bytes and assert rejection. Decide the visibility invariant, then test anonymous and unrelated-user reads. Test replacement/deletion behavior against cache semantics. | Inspect magic bytes and allowlist image formats; normalize/re-encode where practical. Explicitly choose public or authenticated media. Add safe response headers and use immutable caching only for content-addressed, never-mutated objects. | — |
| C-06 | **P1** | Deferred | Platform owner | Login throttling is process-local and keyed only by normalized email. Restarts reset it and a distributed deployment bypasses it; a targeted attacker can also lock attempts for one account while rotating source IPs is unbounded elsewhere. The limitation is documented in `src/lib/rate-limit.ts`, but it is still a production security trade-off. | Test per-account and per-source limits, expiry, bounded memory, forwarded-address trust, restart/distribution behavior, and a successful-login reset policy. | Before scaling beyond one process, move counters to a shared store. Combine conservative account and trusted-client-IP buckets, add backoff/telemetry, and avoid revealing whether an account exists. | Deferred while Render runs one instance; reopen before horizontal scaling. |
| C-07 | **P1** | Needs product decision | Product owner | A single participant can set the shared match status to `ACCEPTED` or `DECLINED`. If “accepted” is intended to mean mutual agreement, the data model cannot represent each party's decision. See `respondToMatch` in `src/app/dashboard/opportunities/actions.ts`. | Product owner states whether one-sided acceptance is intentional. If mutual, test that one response remains pending, opposing responses resolve predictably, and neither participant can overwrite the other's response. | Store per-party decisions (or append-only decision events) and derive match status. If acceptance is intentionally unilateral, rename the UI/state and document the invariant to remove ambiguity. | — |
| C-08 | **P2** | Open | Unassigned | The build downloads Google fonts. The baseline production build failed when `fonts.gstatic.com` was unreachable, turning an external design dependency into a deployment dependency. See `src/app/layout.tsx`. | Run the production build with outbound network disabled and require success. | Self-host the committed font files with `next/font/local`, or use a system-font stack. | — |
| C-09 | **P2** | In progress | Platform owner | CI is a solid compile/test gate but has no explicit coverage floor, dependency audit, E2E check, migration safety check, or accessibility smoke test. See `.github/workflows/ci.yml`. | A PR cannot reduce agreed critical-module branch coverage, merge a known high-severity production dependency issue without acknowledgement, or break the core journey. | Add checks incrementally; do not chase a global coverage percentage. Start with changed-code coverage on authorization and transaction modules, one E2E smoke test, and an auditable dependency policy. | Continuous review fallback added in this PR; remaining gates stay open. |
| C-10 | **P2** | Open | Unassigned | `README.md` says Render points to a historical Claude branch, while `render.yaml` points production at `main`. Stale operational instructions increase deployment error risk. | A fresh operator can deploy by following only the README and configuration, with no contradictory branch instructions. | Update the deployment section and add a lightweight documentation check to the release checklist. | — |

Allowed statuses are `Open`, `In progress`, `Needs product decision`,
`Deferred`, and `Closed`. Deferral requires a named owner, a concrete reason, and
a condition or date for reopening. Closure requires both the fixing commit and
the exact regression-test path/name in **Closure evidence**; never use a pull
request description or a verbal assertion as closure proof.

## What should not be “optimized” yet

Avoid replacing readable domain code with abstractions merely to reduce line
count. In particular:

- Keep pure scoring/matching functions separate from Prisma orchestration; that
  separation is why the fast test suite is useful.
- Do not add Redis, a queue, and a service framework in one change. First write
  the failure-path contract, then introduce the smallest durable mechanism that
  satisfies it.
- Do not maximize test count or global coverage. Optimize for mutation-catching
  assertions around money/trade state, authorization, concurrency, and retries.
- Do not snapshot whole pages. Assert accessible roles, user-visible outcomes,
  and persisted invariants.
- Do not “fix” a failing test by weakening the assertion unless the product
  invariant was explicitly changed and documented.

## Continuous reviewer worker loop

The worker starts at the repository's first commit for a historical audit, then
runs once per new Claude-authored commit or pull request.

The repository's installed Codex reviewer supplies the independent worker: it
is configured to review when a pull request is opened or receives a new head
commit. That makes the per-change pass continuous without a long-lived process
in this repository. If an automatic review is missed, comment `@codex review`
on that pull request to restart the same loop. The reviewer requests changes or
approval; it never merges or silently changes production code.

### Historical pass (once, from day 1)

1. Enumerate commits oldest-first with `git log --reverse --topo-order`.
2. For each meaningful commit, compare it with its first parent. For merge
   commits, review the merged range rather than duplicating every diff.
3. Record when each invariant and its first proof test appeared. Flag production
   behavior that preceded its test, especially authentication, authorization,
   destructive writes, uploads, matching, and reputation.
4. Do not judge old commits against requirements invented later. Mark the
   requirement-introducing commit, then check later changes for regression.
5. Consolidate still-relevant findings into the table above; close obsolete
   findings with a commit and proof test instead of deleting their history.

### Per-change pass (repeat)

1. **Orient:** read `AGENTS.md`, the TTD/TDD artifact, changed files, migrations,
   and relevant Next.js 16.3 documentation under `node_modules/next/dist/docs/`.
2. **State the contract:** summarize the user-visible behavior and list its
   invariants before commenting on implementation.
3. **Trace risk:** follow untrusted input through validation, authorization,
   database writes, external calls, cache invalidation, logs, and UI output.
4. **Check the TDD sequence:** find a test that would fail without the behavior.
   Prefer proof from commit order; a test added with the implementation is useful
   but not evidence of red-first development.
5. **Run proportional gates:** focused tests first, then unit, integration,
   lint, and build. Run the core E2E smoke test for user-visible flow changes.
6. **Probe unhappy paths:** unauthenticated/unauthorized access, malformed and
   oversized input, duplicate submission, concurrent requests, partial external
   failure, retries, stale state, and boundary dates/numbers.
7. **Review migrations:** verify forward compatibility, existing-row backfill,
   indexes for new query shapes, rollback/roll-forward strategy, and deployment
   ordering.
8. **Report only actionable findings:** use severity, evidence, impact, a proof
   test, and the smallest safe remedy. Separate fact from product ambiguity.
9. **Update this file:** preserve IDs, owner/status, and closure evidence. A
   finding closes only when its regression test and implementation both land.
10. **Stop condition:** approve only when no P0/P1 finding is open for the change,
    all required gates pass, and environment-limited checks are explicitly
    recorded rather than represented as passes.

### Review output template

```markdown
## Review: <commit/range> — <date>

### Intended behavior
- <observable contract>

### Invariants and proof
- <invariant> — <test path/name, or MISSING>

### Findings
- [P0|P1|P2|P3] <ID>: <problem>
  - Evidence: <path:line and reproduction>
  - Impact: <specific failure mode>
  - Proof test: <test that fails before the fix>
  - Smallest safe change: <recommendation, not an unsolicited rewrite>

### Gates
- PASS|FAIL|BLOCKED: `<exact command>` — <result/reason>

### Verdict
APPROVE | REQUEST CHANGES | BLOCKED BY ENVIRONMENT
```

## Definition of done for future Claude changes

A change is done only when:

- the behavior and non-goals are stated;
- a regression test fails for the right reason before the implementation fix;
- authorization is enforced at the write/query boundary, not only hidden in UI;
- multi-write and external-side-effect failure behavior is explicit and tested;
- duplicate and concurrent requests are safe;
- logs contain useful identifiers but no passwords, session tokens, or sensitive
  personal data;
- focused tests, unit tests, database integration tests, lint, and production
  build pass;
- critical user-flow changes pass the browser smoke test;
- schema changes include migration and existing-data/deployment analysis; and
- this critique's findings table is updated with new, closed, or deferred risks.

## Suggested remediation order

1. **C-01 and C-02:** define consistency/retry semantics and add failure-injection
   tests before refactoring transaction boundaries.
2. **C-03:** split the test commands so every contributor gets a trustworthy fast
   TDD loop while CI retains the real-database gate.
3. **C-04:** add one core browser journey; use it as the release smoke test.
4. **C-05 and C-07:** obtain explicit product decisions on media visibility and
   one-sided versus mutual acceptance, then encode them as tests.
5. **C-08 and C-10:** remove the network-dependent build input and stale deploy
   wording as low-risk reliability wins.
6. **C-06 and C-09:** strengthen shared throttling and CI gates as traffic and the
   team's operating maturity justify them.
