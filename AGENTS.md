# AGENTS.md — the contract every agent works under

This repo is built by a **council**: a founder (taste + direction) and AI
implementers (Claude, Codex) who write and review each other's work.
**The verification gate is the arbiter** — not seniority, not confidence, not
who wrote it. Read this before touching anything.

---

## 0. The rule that overrides all others

**`npm run verify` must be PASS before anything is offered for review.**

```bash
npm run verify        # seven checks, one verdict
npm test              # the laws + the suite, for a faster inner loop
```

**A skipped check is not a passing one.** The gate needs Postgres for four of
its seven checks. Without one it prints `SKIP`, reports `PARTIAL`, and exits
non-zero. Use `--allow-skip` to exit 0 in an environment that genuinely has
no database — and then say "PARTIAL, tests and migrations unverified" in your
report. Never write "clean" for a check you did not run. `--json` gives a
machine-readable verdict for handing between agents.

Unlike a pure-logic repo, FarmaTrade's truth layer needs a real database:
capacity arithmetic, bilateral consent and migration drift are only provable
against real rows. `docs/TESTING.md` says what each layer guards.

---

## 1. What this product is (so you don't drift)

FarmaTrade is **trusted agricultural commerce infrastructure**, not a
marketplace. The economic primitive is not a listing — it is **unfulfilled
commercial capacity**. A SUPPLY intent is capacity still available to supply;
a DEMAND intent is capacity still needing fulfilment; matches connect
compatible remaining capacity.

Four things are kept rigorously apart, and collapsing any two of them is how
this system starts quietly lying to a farmer about their own harvest:

| Layer | Example | Who owns it |
|---|---|---|
| **Farm state** | 26 tonnes are in the shed | the farmer; only farm CRUD writes it |
| **Commercial intent** | willing to supply up to 20 of them | the owner, once they activate it |
| **Agreement** | 8 of those 20, agreed by both parties | the two parties, per terms version |
| **Fulfilment** | a tonne physically moved | **does not exist yet** |

The fourth row is why the first row is never decremented by anything in the
first three.

---

## 2. The product laws (non-negotiable — encoded in `scripts/invariants.mjs`)

Breaking any of these turns the gate red. They are the spec of what
FarmaTrade is *allowed to do*:

1. **Inventory is never touched by commerce.** Only farm CRUD writes stock.
2. **The domain core stays database-free.** Rules worth trusting must be
   provable without Postgres.
3. **No model calls in the commercial path.** Matching, measurement and
   pricing stay deterministic and re-derivable.
4. **Nothing is resolved by guessing.** No fuzzy matching. "tone" does not
   become TONNE; an ambiguous price stays ambiguous.
5. **No FX, no payments, no escrow.** FarmaTrade identifies money; it does
   not move it. Settlement is off-platform.
6. **No emojis.** Plain text, or an inline SVG where an icon is genuinely
   needed. Typographic symbols are text, not decoration.
7. **No forecasting or causal claims** in farmer-facing reasons.
8. **One authoritative consent predicate.** Never count acceptances at a
   call site.

Behavioural laws the static checks cannot reach, guarded by the suite:

- **Capacity is reserved only by bilateral agreement.** No party's capacity
  may be consumed by an action taken solely by the counterparty.
- **Unknown stays unknown, and visible.** An unresolvable unit, an
  unconvertible package, an ambiguous legacy price — each produces a stated
  reason, never a plausible number.
- **Derived proposals never enter matching.** PROPOSED is FarmaTrade's
  opinion; only its owner can make it market-active.
- **A stated total is not scaled by quantity, and a per-package price never
  becomes a per-mass price.**

If a law is genuinely wrong, **change it here in its own commit with the
reasoning.** Do not work around it silently.

---

## 3. How to work here

FarmaTrade is built in **numbered phases** (P0.1, P0.2, …). Each is one
coherent correction to the domain, and each follows the same shape:

1. **Audit first.** Map what the repo actually does before changing it. The
   two worst defects found so far — capacity reserved by one party alone,
   and a price column read as both a total and a rate — were found by
   auditing, not by building.
2. **Implement** on the branch. Expand-only migrations where practical.
3. **Verify.** `npm run verify` until PASS.
4. **Report** against the phase's own checklist, then **stop.**
   **Do not merge.** A checkpoint is for the founder to review.

Working rules:

- **Fix a bug → add the test that pins it.** Every defect becomes a
  permanent case so it cannot silently return.
- **Prove a guard bites.** A concurrency lock or an invariant you have not
  watched fail with it removed is a guard you are only assuming works.
- **Never invent history.** Where existing data's meaning cannot be
  determined, leave it unresolved and say so. A correct "unknown" beats a
  plausible migration. See `docs/pricing.md` for a worked example of
  refusing a tempting backfill.
- **Two implementers review each other's diffs.** The gate breaks ties, not
  rank.
- **Never claim something passed that you did not run.** A self-report is
  not truth; the shared repo and the gate are.

### Division of labour

- **Founder** — direction, taste, the final call.
- **Claude** — implementation + architecture.
- **Codex** — independent audit + review of each checkpoint, and
  implementation when asked.
- **The gate + the suite** — the truth layer. The tiebreaker. Always.

If two agents disagree, the answer is: **write the test that decides it.**

### Reviewing a checkpoint (the second seat)

Do not re-read the diff and agree. Re-run the audit the phase claimed:

- Run `npm run verify` yourself. Compare the verdict to what the report says.
- Take one law from §2 and try to break it. If you can, that is the finding.
- Check the report's numbers against the gate's own output.
- Where the phase claims something is "unknown by design", confirm it is
  actually unresolved rather than defaulted.

**A review that isn't in the repo didn't happen.** Findings go in a commit,
a PR comment or `docs/reviews/` — not a chat window. Same discipline as the
truth layer: the shared record is the truth, not a self-report.

### Branch + safety

- Development branch: **`claude/farmatrade-intelliqs-improvements-e4nexp`**.
- **Never push to a branch you were not asked to.** GitHub scope is limited
  to `tatendamukudu/farmatrade`.
- **`/home/user/platform` is read-only.** It is a separate product. Read it
  for ideas; never modify it.
- Open a PR only when asked. Every push runs CI — keep it green.
- Never disable TLS verification or unset `HTTPS_PROXY`. Never commit
  secrets; `DATABASE_URL` and `SESSION_SECRET` live in the environment.

---

## 3b. Request for Comment — how the council weighs in (no human relay)

The founder should **not** be a copy-paste layer between agents. Design
discussion happens **in the repo**, not in a chat window:

- The current proposal lives in a **council brief** at the repo root
  (`COUNCIL_BRIEF_2026-08-14.md`) and is tracked by an open GitHub **issue
  labelled `rfc`**.
- **To weigh in:** read the brief, then **comment on the RFC issue** —
  respond to its numbered open questions directly, and add your own. Agree,
  disagree, or propose an alternative; say *why*. Disagreement is welcome —
  the gate, not seniority, settles it.
- **To act on consensus:** open a **PR** that references the RFC issue. CI
  runs `npm run verify` automatically; PASS merges, FAIL doesn't. The PR diff
  is the record.
- **Codex** reads this file by convention; connected to the repo it can read
  the brief and comment or open a PR autonomously.

Comment shape, because it is what makes a thread usable months later:

1. **What changed and where** — the file, and the commit SHA carrying it. A
   claim without a SHA is not checkable.
2. **The substance**, summarised enough to argue with without opening the doc.
3. **Numbered open questions**, addressed to whoever should answer them.
4. **What you adopted from the last round and what you refused**, with the
   reason. A round that only agrees has not moved anything.

The rule: **a weigh-in that isn't in the repo didn't happen.** Same
discipline as the truth layer — the shared record is the truth, not a
self-report. That holds even for input relayed from a human or a model with
no repo access: capture it as a comment so it is durable and visible.

---

## 4. The map (where things live)

| Area | Files |
|---|---|
| Product laws / the gate | `scripts/invariants.mjs`, `scripts/verify.mjs` |
| Commercial intent | `src/lib/intent.ts` |
| Derived proposals | `src/lib/derivation-core.ts`, `src/lib/derived-intent.ts` |
| Bilateral agreement | `src/lib/agreement-core.ts`, `src/lib/agreement.ts` |
| Capacity | `src/lib/capacity.ts`, `src/lib/allocation.ts` |
| Measurement | `src/lib/measurement.ts`, `src/lib/units.ts` |
| Money + pricing | `src/lib/money.ts`, `src/lib/pricing.ts` |
| Matching | `src/lib/matching-core.ts`, `src/lib/matching.ts`, `src/lib/match-rank.ts` |
| Product identity | `src/lib/products.ts` |
| Schema + migrations | `prisma/schema.prisma`, `prisma/migrations/` |
| Contracts / docs | `docs/TESTING.md`, `docs/pricing.md`, `docs/measurement.md`, `docs/deployment.md`, this file |
| Council | `COUNCIL_BRIEF_2026-08-14.md`, the `rfc` issue, `docs/reviews/` |

Modules ending `-core.ts` (and `capacity`, `measurement`, `money`, `pricing`,
`units`) are **pure and database-free** by law. Their `server-only` wrappers
hold the Prisma access.

---

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
