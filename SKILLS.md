# SKILLS.md — how to write code in FarmaTrade

Addressed to **Codex**, written by Claude before a handover. `AGENTS.md` says
*what* the contract is and `PRODUCT_TRUTH.md` says what the product must
preserve. This file says **how to write the code** — the habits that make a
change cheap to live with a year later.

Precedence: `PRODUCT_TRUTH.md` > `AGENTS.md` > this file. Where this file
disagrees with either of those, this file is wrong.

---

## 0. The standard: simple yet durable

**Durable** means the code still tells the truth after someone who never read
this file changes it. **Simple** means the smallest construction that can be
proven.

The expensive code is not the long code. It is the code that requires you to
*remember something* — that this counter must be decremented here too, that
this column means a total on rows written after March, that this page must
check permission before rendering. Every one of those is a debt that comes due
when the person who remembered it is gone. That person is about to be gone.

Three questions before you write a line:

1. **Can this be proven without infrastructure?** If the rule can live in a
   pure module, it must. A rule reachable only through Postgres is a rule that
   gets tested once and then trusted forever.
2. **Is there exactly one place this rule lives?** If the answer is two, you
   have already written the bug; it just has not happened yet.
3. **When it breaks, does something go red — or does a farmer get a wrong
   number quietly?** A silent wrong number about somebody's harvest is the
   only genuinely unacceptable outcome in this codebase.

---

## 1. The shape of every change

The same five steps, every time, no exceptions for small ones:

1. **Audit first.** Read what the code actually does before changing it. The
   two worst defects found in this repo — capacity consumed by one party
   alone, and a price column read as both a total and a rate — were found by
   auditing, not by building. Neither was visible from the outside.
2. **Write the smallest correct diff.** Not the smallest diff. The smallest
   *correct* one.
3. **Write the test that pins it.** Before you call it done, not after.
4. **Run `npm run verify` until PASS.** Seven checks, one verdict.
5. **Report against the checklist, then stop.** Do not merge. A checkpoint is
   for the founder.

---

## 2. The habits that cost nothing now and save everything later

**Derive, do not store.** A cached count, a `remainingQuantity` column, a
`status` that summarises other rows — each is a second copy of a truth that can
drift from the first. `capacity.ts` derives remaining capacity from agreements
on every read and it has never once been wrong. That is not luck.

**Unknown stays unknown, and visible.** When a unit does not resolve, a package
cannot convert, or a legacy price has no recorded basis, produce a stated
reason. Never a plausible default. A correct "we cannot determine this" beats a
number that looks right. `docs/pricing.md` has the worked example of refusing a
tempting backfill.

**One owner per rule.** `reservationFor()` in `agreement-core.ts` is *the*
consent predicate. A call site that counts acceptances itself is a fork of the
rule that will drift. Law 8 in `scripts/invariants.mjs` makes this mechanical —
if you find yourself wanting to work around it, the design is wrong, not the law.

**Pure first, wire second.** Write the logic in a `-core.ts` module with no
imports of `@/lib/prisma` and no `server-only`. Test it. Then add the thin
server wrapper that fetches rows and calls it. Law 2 enforces the list.

**A guard you have not watched fail is a guard you are assuming.** The
`SELECT … FOR UPDATE` lock in `agreement.ts` was disabled twice on purpose, to
watch 16 tonnes allocate against 10. Law Zero was proven by threading a
`sponsorWeight` into ranking and watching the gate go red. If you add a guard,
break it once, confirm the red, then restore it — and say in the commit message
that you did.

**Fix a bug, add the case that pins it.** Permanently, in the suite. A defect
that can silently return is a defect you did not fix.

**Never invent history.** Where existing data's meaning cannot be determined
from the data itself, leave it unresolved. Two backfills have been refused here
on exactly this ground: legacy `ACCEPTED` matches (nothing proves the
counterparty ever agreed) and legacy price semantics (the only supporting
evidence was our own test fixtures, which makes the evidence circular).

**Expand-only migrations.** Add columns and tables; do not drop or repurpose.
The gate checks drift two ways — upgraded and fresh — and both must agree with
`schema.prisma`.

**A dependency is a permanent liability.** Prefer forty lines you can read to a
package you cannot. This repo deliberately has no fuzzy matcher, no units
library, no money library. Each of those would have been quicker and each would
have made "unknown stays unknown" impossible to guarantee.

**Comments say why, at the top of the module.** Not what, line by line. Every
non-obvious module here opens with a block explaining the decision it encodes
and what it deliberately does *not* decide — see `identity-safety.ts` for the
shape. That block is what stops the next person from "simplifying" the rule
away.

---

## 3. What "simple" is not

- **Not clever.** A regex nobody can read is not simple; it is short.
- **Not fewer files.** One 900-line module that mixes pure logic with Prisma
  calls is more complex than three files with a clean seam.
- **Not skipping the test.** The test is the part that makes it durable. Code
  without it is a draft.
- **Not a config flag instead of a decision.** A flag is two codepaths and a
  question you did not answer.
- **Not an abstraction with one caller.** Write it concretely. Abstract on the
  third use, not the first.

---

## 4. This repo specifically

```bash
npm run verify        # seven checks, one verdict. Must be PASS.
npm test              # laws + suite, for a faster inner loop
npm run verify --json # machine-readable, for handing between agents
```

**A skipped check is not a passing one.** Four of the seven checks need
Postgres. Without one the gate prints `SKIP`, reports `PARTIAL` and exits
non-zero. `--allow-skip` exits 0 in an environment that genuinely has no
database — and then your report must say "PARTIAL, tests and migrations
unverified." Never write "clean" for a check you did not run.

**The four layers that must never collapse into each other** (`AGENTS.md` §1):
farm state, commercial intent, agreement, fulfilment. Fulfilment does not exist
yet. That is precisely why nothing in the first three rows may ever decrement
inventory. Law 1 makes it mechanical.

**Ten executable product laws** live in `scripts/invariants.mjs`. Read them
before your first change; they are short and each one was learned by getting it
wrong. If a law is genuinely wrong, change it there **in its own commit with
the reasoning** — never work around it silently.

**Where things live:** the map in `AGENTS.md` §4. Modules ending `-core.ts`,
plus `capacity`, `measurement`, `money`, `pricing` and `units`, are pure and
database-free by law.

---

## 5. When you are not sure

Do not guess, and do not pick the reading that is easier to build.

- **A factual disagreement:** write the test that decides it. That is what the
  truth layer is for, and it settles the question permanently.
- **A product question:** it belongs to the founder. Comment on the `rfc`
  issue with the question stated precisely enough to be answered yes or no.
  Currently open: [#20](https://github.com/TatendaMukudu/FarmaTrade/issues/20)
  (council brief) and [#21](https://github.com/TatendaMukudu/FarmaTrade/issues/21)
  (P0.6 commitment and allocation).
- **A starred decision in `PRODUCT_TRUTH.md` §57:** unresolved. Do not
  reinterpret it as a settled requirement. If you must act, implement the
  narrowest reversible rule that satisfies the DECIDED half and say in the
  module comment that you deliberately did not answer the starred half —
  `identity-safety.ts` is the worked example.

**A weigh-in that is not in the repo did not happen.** A commit, a PR comment
or `docs/reviews/` — not a chat window.

---

## 6. Handover: what is in flight

Nothing has shipped. **18 commits and 8 migrations sit unmerged** on
`claude/farmatrade-intelliqs-improvements-e4nexp`. Do not merge them; the
founder reviews checkpoints.

- **P0.6 (commitment and allocation) is blocked** on RFC #21 Q1: whether the
  source-level ceiling should *prevent* the double-promise or *surface* it.
  Iteration one proved the invariant is already broken — 40,000 kg promised
  against 26,000 kg physically present. Iteration two needs the ruling first.
  The founder's instruction stands: **do not propose database objects yet.**
- **INV-10 is VIOLATED and unfixed.** `Reputation` is a single aggregate per
  party, so a five-star supplier who is a two-star buyer averages into one
  number. `PRODUCT_TRUTH.md` §31 requires the roles stay separate. This is
  schema work, not a patch.
- **Six divergences D1 to D6** are recorded in `docs/invariant-register.md`.
  The largest is D2 — Home opens with administration where §6 wants
  opportunity.
- **Two disagreements** are stated in the register rather than resolved (the
  §10 / §3A tension, and §35 / §36). They are the founder's to rule on.

If you take work here, update `docs/invariant-register.md` in the same commit.
It is only useful while it is true.

---

## 7. What I will check when I am back

Stated in advance so it is a shared standard and not a surprise audit:

1. `npm run verify` PASS, run by me, compared against what the reports claim.
2. Every new rule reachable from a test that does not need Postgres.
3. Every fixed bug carrying the case that pins it.
4. No new stored counter, no new default standing in for an unknown.
5. `docs/invariant-register.md` still matching the code.
6. One law from `AGENTS.md` §2 picked at random, and an honest attempt to
   break it. If it breaks, that is the finding.

Disagreement with any of the above is welcome, and it belongs in the repo. The
gate settles ties — not seniority, not confidence, not who wrote it.
