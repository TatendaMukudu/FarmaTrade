# Current state and gap register — final pilot phase

Built before touching production code, per the takeover brief §0. Every line
was verified against the repository at
**`4bc588311318356bddf02cb0643ea65efccbd1b0`**, not read from a prior audit.

## Verified current state

| Fact | Verified how | Result |
|---|---|---|
| Branch / HEAD | `git rev-parse` | `claude/farmatrade-intelliqs-improvements-e4nexp` @ `4bc5883`, local and origin identical |
| Working tree | `git status` | clean |
| Codex correction delivered? | `git log 4bc5883..origin/…` | **No commits.** The Checkpoint 2 correction was never implemented |
| Invariants | `node scripts/invariants.mjs` | 10 laws upheld |
| Full gate | `npm run verify -- --json` | **PASS 7/7, 620 passed / 4 skipped** |
| Shared-source ceiling | re-ran my own PR #29 probe | `fitsWithinPhysicalSource` fails closed; 9,000,000 kg refused against 500 bags; honest same-package commitment still allowed |

**The reported starting facts were not stale.** They reproduce exactly.

## Stale document claims — do NOT reimplement

`docs/reviews/pilot-readiness-2026-08-21.md` predates commit `28ed782` and is
partly out of date:

- Row 12 ("Trade progresses — MISSING") is **half stale**. Settlement now
  distinguishes completed / did-not-happen / **disputed**, and a disagreement
  can no longer manufacture a completed trade. What remains genuinely missing
  is an explicit *fulfilment underway* step between agreement and outcome.
- Row 16 ("reputation — BROKEN") overstates the pilot exposure. Star averages
  are already suppressed: `SHOW_PILOT_RATINGS = false` in `reputation-core.ts`,
  and `summarizeReputation` returns `"Trade history"` with no stars. The
  *quality* signal is not flattened across roles because it is not shown.

## Confirmed live gaps

**G1 — Checkpoint 2 Blocker 1: dead Farm entry in You.** Reproduced: a party
with no `Farm` sees a Farm card linking to `/dashboard/farm`, which redirects
silently to `/dashboard`. `farm.create` exists only in `signup/actions.ts`, so
there is no recovery. Founder-approved correction already specified in
`docs/specs/V1-CHECKPOINT-2-information-architecture.md` Amendment 1.

**G2 — Checkpoint 2 Blocker 2: no active destination on deep routes.**
Reproduced: `/dashboard/farm`, `/dashboard/opportunities`,
`/dashboard/settings` and `/dashboard/conversations/[id]` light no primary
tab. Founder ownership ruling recorded in Amendment 1. Cannot be implemented
by prefix matching — ownership must be declared.

**G3 — INV-10 role reputation, narrowed.** The exposed pilot signal is a
cross-role `completedCount` ("10 completed trades"). That is coarse but not a
quality claim, so it is not the dangerous half. The dangerous half is
invisible: `match-rank.ts` reads `didNotHappenCount` and `completedCount`
**across all roles**, so a party who fails repeatedly as a buyer is penalised
when ranked as a supplier — a cross-role contamination the user never sees.

*Key finding: this needs no migration.* A party's role in a match is already
derivable from their own intent's `side` (`SUPPLY` = supplying, `DEMAND` =
buying). Role-scoped counts can be **derived** from `TransactionConfirmation`
joined to `Intent`, consistent with the repo's derive-don't-store rule.

**G4 — No fulfilment step.** `AGREED → (both confirm) → COMPLETED` has no
intermediate state, so between agreeing and reporting an outcome neither party
is told what happens next. Brief §4 names exactly this ("Has this been
completed?", "Who is responsible for transport?").

**G5 — INV-15 messaging boundary PARTIAL.** Match participants can message
from `SUGGESTED`. Brief §6 explicitly *approves* pre-agreement messaging for
negotiation, so this is closer to satisfied than the register implies; what is
missing is a stated rule rather than an accident.

**G6 — No adversarial pilot simulation.** Brief §14 requires one.

## Planned slices

1. **Checkpoint 2 correction** (G1 + G2) — specified, small, blocking.
2. **Role-scoped outcome derivation** (G3) — no schema; stop cross-role
   contamination of ranking and state role counts honestly.
3. **Minimum fulfilment step** (G4) — smallest coherent state, reusing the
   existing model.
4. **Adversarial pilot simulation** (G6).
5. **Isolation / privacy spot-check** (brief §16).
6. **Operational readiness audit** (brief §15).

## Deferred deliberately

Payments, escrow, insurance, route optimisation, dynamic pricing, AI
assistants, analytics, a farm-creation workflow (G1's correction explicitly
excludes it), and the Checkpoint 3 Home/Seek/Trade rebuild — which is a
separate, already-specified checkpoint and not a pilot-safety blocker.
