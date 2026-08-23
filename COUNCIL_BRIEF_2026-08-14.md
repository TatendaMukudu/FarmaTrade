# Council Brief — 2026-08-14

For the council (Codex, founder). Three parts: **(0)** what the P0 rebuild
established and why, **(1)** the seven decisions genuinely open right now, and
**(2)** what I would do about each, for argument before anyone builds.

Branch: `claude/farmatrade-intelliqs-improvements-e4nexp`.
Discussion: [issue #20](https://github.com/TatendaMukudu/FarmaTrade/issues/20)
(`rfc`) — answer by number there, not here. This file is the substance; the
thread is the record.
Gate (`npm run verify`): **PASS** — 7/7, 551 tests, migrations clean both
directions. Nothing here is merged.

---

## Part 0 — What the rebuild established

FarmaTrade is **trusted agricultural commerce infrastructure**, not a
marketplace. The primitive is unfulfilled commercial capacity, and the whole
of P0 was one repeated correction: **stop the system asserting things it
cannot prove.**

Seven phases, each fixing a place where it was asserting anyway:

| Phase | The thing it was getting wrong |
|---|---|
| P0.1 | Maize matched tomatoes — no canonical product identity |
| P0.2 | Farm state and commercial intent were the same number |
| P0.3 | No notion of how much of an intent was still available |
| P0.4 | **One party could reserve the other's tonnage by clicking accept** |
| P0.5 | "tonne" and "t" were different units; bags silently weighed nothing |
| P0.7 | **One price column read as a total in one place and a rate in another** |

The two in bold were found by **auditing, not building** — which is why the
pipeline now makes an audit the first step of every phase, and why the second
seat re-runs the audit rather than reading the diff.

The through-line worth arguing with: **a correct "unknown" beats a plausible
number.** An unresolvable unit, an unweighable bag, an ambiguous legacy price
— each produces a stated reason and no figure. That is a product stance, not
just an engineering one, and it is the thing most likely to be wrong.

---

## Part 1 — The seven open decisions

Numbered so they can be answered by number.

### 1. Package equivalence (P0.6) — where does a bag's mass live?

Nothing on the branch converts bags to kilograms, deliberately: a bag of
maize and a bag of groundnuts are different weights. Two things are blocked
on this — bag capacity and bag valuation both return `context_required`.

Three candidate homes, and they are not equivalent:

- **On `AgreementTerms`** — "1 bag = 50 kg *for this deal*". Narrowest, needs
  bilateral consent like any other term, cannot leak.
- **On `Intent`** — "my bags are 50 kg". Fewer keystrokes, but it is one
  party asserting a fact the other has to live with.
- **Product × region reference data** — "a maize bag in Zimbabwe is 50 kg".
  Most convenient, most dangerous: it makes a guess into a global fact.

### 2. The seven ambiguous price rows

Seven `Intent` rows carry a price whose meaning was never recorded. They now
produce no value anywhere. Options: leave them until they expire, prompt
those two farmers to re-state, or accept a founder ruling that pre-P0.7
prices were totals.

### 3. Cancellation is still unilateral

`closeEngagement` lets one party cancel a mutually agreed trade alone. This
is the same asymmetry P0.4 fixed for acceptance — but it *releases* capacity
rather than reserving it, so it cannot oversubscribe anyone. Is releasing
alone acceptable, or does a cancelled agreement need the same bilateral
consent that made it?

### 4. Overcommitment has a signal and no flow

Editing an intent below what is already agreed surfaces `overcommitted` and
changes nothing else. The farmer is told three tonnes are promised beyond
what they now offer, and has no tool to resolve it. What should that tool be?

### 5. Should price affect ranking?

P0.7 can now prove `500 USD/tonne` and `0.50 USD/kg` are the same rate. It is
deliberately not wired into ranking. Cheapest-first would be trivial to add
and is probably wrong for a network trying to build trust rather than a race
to the bottom — but "never" is also a position that needs defending.

### 6. Legacy `ACCEPTED` matches on deploy

Pre-P0.4 rows reserve nothing, because nothing proves the counterparty ever
agreed. On deploy those engagements will show as needing agreement. Is
prompting both parties to re-agree the right migration experience, or should
they be closed and re-suggested?

### 7. `Match.quantity` is vestigial

Read for exactly one case now: a legacy `COMPLETED` match with no terms rows.
Every live path uses `AgreementTerms`. When does it get dropped, and does
that need the legacy rows gone first?

---

## Part 2 — What I would do

**1. Package equivalence → `AgreementTerms`.** It is a term of a deal, so it
belongs where terms live, versioned and bilaterally accepted like every
other. The reference-data option is the one to refuse: it converts a
convenience into a fact the system will later be wrong about, which is
precisely the failure P0.5 exists to prevent. `Intent`-level is defensible
as a *default that seeds the terms*, never as the authority.

**2. Ambiguous prices → leave them.** Seven rows, all development fixtures.
The cost of leaving them is a missing display line; the cost of ruling is a
precedent that says historical ambiguity can be resolved by decree. If they
were real farmers' rows I would prompt, not rule.

**3. Cancellation → make it bilateral, with an escape.** The asymmetry
argument is real but incomplete: releasing capacity does not hurt the
canceller, it hurts the *counterparty* who has been planning around the
tonnage. A unilateral "withdraw" that notifies, plus a bilateral "cancel"
that settles, is probably the honest shape. Lowest confidence of anything
here.

**4. Overcommitment → a resolution prompt listing the agreements.** Show
which deals make up the excess and let the owner open a renegotiation on
one. FarmaTrade must not choose which counterparty loses.

**5. Price in ranking → not yet, and say why in the code.** It is truth now;
making it a ranking signal is a product judgement with a real failure mode.
Worth a phase of its own with a stated hypothesis.

**6. Legacy `ACCEPTED` → prompt, don't close.** Closing destroys a real
engagement two people may be mid-trade on. Prompting is honest about what
the system does and does not know.

**7. `Match.quantity` → drop it after legacy `COMPLETED` rows age out.**
Contract-phase work, not urgent, and cheap to leave.

---

## What I want from the second seat

Not agreement. Specifically:

- **Question 1** decides how a whole dimension of the product behaves. If the
  reference-data option is right and I am being precious, say so.
- **Question 3** is the one I am least sure of.
- Take one law from `AGENTS.md` §2 and try to break it. A law that cannot be
  broken by someone trying is worth more than one nobody tested.
- If any number in this brief disagrees with what `npm run verify` prints on
  your machine, that disagreement is the most important thing in the thread.
