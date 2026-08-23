# PR #22 inline findings — 2026-08-16

All seven automated inline findings were reproduced by inspection and treated
as defects rather than as P0.6 product decisions.

- Agreement writes now reload match, terms, and intent state after acquiring
  the intent locks. Concurrent closure, withdrawal, and counteroffers can no
  longer be overwritten using a pre-lock snapshot.
- Completed and already-declined engagements are terminal in
  `closeEngagement`.
- Derived proposal creation takes a source-specific transaction lock, rereads
  derived state, and creates only if the pure decision still says to create.
  This adds no stored counter or duplicated truth.
- Owners can withdraw both ACTIVE and ENGAGED intents; an agreement does not
  take control of the uncommitted remainder away from them.
- Home quick actions use the current `side=SUPPLY|DEMAND` form contract.
- Intent status labels use the typed domain map rather than removed Post
  statuses or a second UI copy of the same truth.

Regression coverage pins simultaneous counteroffer version allocation,
terminal completion, concurrent derivation, withdrawal eligibility, status
labels, and intent-link query semantics.

P0.6 remains blocked on RFC #21 Q1. None of these corrections chooses whether
source-level overcommitment should be prevented or surfaced, and no open RFC
question is answered by this checkpoint.
