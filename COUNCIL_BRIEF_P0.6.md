# Council Brief — P0.6: Commitment & Allocation

For the council (Codex, founder). This is **iteration one: an audit, not a
design.** The instruction was to prove what the current architecture can
already express before anyone proposes a schema, and that instruction was
right — most of these cases already work, and the two that fail do so for one
shared reason that is smaller than it looks.

Branch head at time of audit: `cbc4bd2`. Gate: **PASS**, 7/7.

## The governing invariant

> **FarmaTrade must never promise the same physical supply twice.**

It is violated today. Two probes, run against the real database:

```
PROBE A — two intents on the same 26t produce row
  physical stock            26 tonnes  (26 000 kg)
  intent A remaining        12 000 kg      (8 000 kg agreed)
  intent B remaining        20 000 kg
  TOTAL PROMISED            40 000 kg  against 26 000 kg physical

PROBE B — derivation after withdrawing an intent holding a live agreement
  agreement held             8 000 kg
  derived intents now        2   (WITHDRAWN:26t, PROPOSED:40t)
  old intent still reserves  8 000 kg
  new proposal aware of it   NO
```

## What the architecture already expresses

| # | Case | Status |
|---|---|---|
| 1 | 20t, A agrees 8t, B offered 12t | **Works** — within one intent |
| 2 | Proposal must not reserve; name the exact event | **Already defined** |
| 3 | Partial fulfilment 8+5+7 against 20 | **Works**, tested |
| 4 | Cancellation has deterministic consequences | **Rules work, authority doesn't** |
| 5 | Completed delivery reconciles against inventory | **Does not exist** |
| 6 | Concurrent acceptance is safe | **Works**, proven |
| 7 | Derived intents never recreate committed supply | **Broken** (Probe B) |
| 8 | Unit conversion frozen at the boundary | **Works** |
| 9 | Overcommitment has a resolution path | **Signal only** |
| 10 | Provenance of every quantity transition | **Partial** |

**Case 2 is already answered precisely.** Capacity is consumed at exactly one
event: the moment the *second* `TermsAcceptance` row lands, inside
`acceptTerms`'s locked transaction. Proposing reserves nothing; one party
accepting reserves nothing. `reservationFor()` is the only predicate that
decides, and law 8 forbids re-implementing it at a call site.

**Case 6 is proven, not assumed.** `SELECT … FOR UPDATE` on both intents,
ordered by id. Verified by removing the lock and watching two 8t agreements
both succeed against 10t.

**Case 8 holds structurally.** `unitCode` is snapshot on `AgreementTerms` at
proposal time and conversion factors are code constants, not editable data —
so there is no reference data whose change *could* rewrite an agreement. If
bag→kg context lands, it must be snapshot the same way or this stops being
true.

**Case 10 is half there.** `proposed → committed` is fully auditable: terms
versions are immutable and append-only, each acceptance is a row with a party
and a timestamp. `released` is not — `Match.status` is mutable with no
history. `fulfilled` does not exist. `available` is derived, so it is a
reading rather than an event.

## The one structural finding

Every case that works, works **within a single Intent**. Every case that
fails, fails **between intents that share physical stock**.

Remaining capacity is a property of an *Intent*. The invariant is about
*physical supply*. Nothing in the system aggregates commitments back to the
thing they are commitments against — `ProduceStock` has `intents Intent[]`,
and that relation is never read for capacity. Two intents on one produce row
are, to the capacity engine, two unrelated ceilings.

That is why Probe A over-promises without any bug in the arithmetic: both
answers are individually correct. It is also why Probe B happens — the
derivation engine reasons about *intents derived from a source*, never about
*capacity committed against that source*.

So the gap is one missing relationship, not a lifecycle rebuild. Case 5 is
the exception and genuinely needs a new layer.

## What I am deliberately not proposing

No schema. The next iteration should decide whether the source-level ceiling
is derived at read time (like every other capacity number since P0.3, and
therefore incapable of drifting) or materialised, and whether it belongs to
`ProduceStock`, to a farm-level concept, or somewhere that also covers
livestock and equipment — which have the same exposure and no probe yet.

## Open questions

1. **Whose ceiling is it?** Should a physical source cap the sum of
   commitments across every intent that references it — or should a farmer be
   allowed to knowingly over-offer, with the conflict surfaced rather than
   prevented? Preventing is safer; allowing may match how farmers actually
   sell the same maize to two buyers and settle it themselves.
2. **What about intents with no source?** Most `DEMAND` intents, all
   equipment and transport intents, and any hand-typed supply have no
   `produceId`. A source-level ceiling cannot constrain them. Is that
   acceptable, or does the invariant need a different anchor?
3. **Case 5 — what does "fulfilled" reconcile against?** Deducting from
   `ProduceStock` on completion would put commerce back in charge of
   inventory, which law 1 forbids and P0.2 exists to prevent. Does fulfilment
   *propose* an inventory movement the farmer confirms, or own the write
   outright under a documented exception?
4. **Case 4 — cancellation authority.** Carried over from RFC #20 Q3, now
   sharper: if commitments are capped at the source, a unilateral cancel
   releases capacity another party may immediately take. Does that change the
   answer?
5. **Case 9 — resolution path.** With a source-level ceiling, overcommitment
   becomes preventable at write time rather than reportable after. Should it
   be blocked, or still allowed and surfaced?
6. **Case 10 — is a status field enough?** Release and fulfilment have no
   history. Does the audit trail need transitions as records, or is derived
   provenance (terms versions + acceptances + confirmations) sufficient?

## What I want from Codex

- **Reproduce both probes.** They are in this brief's PR description, not in
  the suite — they assert current broken behaviour and would pin it. If they
  do not reproduce on your machine, that disagreement outranks everything
  else here.
- **Question 1 is the fork.** Prevent or surface. It decides whether P0.6 is
  a constraint or a report.
- **Find the third probe.** Livestock and equipment have the same shape and I
  have not tested them. So does a DEMAND intent shared across two buyers'
  orders, if that is even reachable.
- Try to break law 1 or law 8 while you are in there.
