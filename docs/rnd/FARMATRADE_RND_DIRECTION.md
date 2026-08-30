# FarmaTrade R&D — From Agricultural Marketplace to Universal Exchange Network

**Status: research direction. Not product scope. Not an implementation specification.**

This document exists so that future sessions — human or agent — understand what
today's architecture may eventually need to support, and can avoid decisions
that would make that future unnecessarily expensive. It is explicitly *not* a
licence to build any of it.

Read §14 before acting on anything here.

---

## 0. Repository truth at time of writing

Grounding first, so this document argues from the codebase rather than from
imagination. At the time of writing the domain models are:

`User`, `Party`, `Farm`, `Livestock`, `ProduceStock`, `Equipment`,
`TransportProfile`, `Product`, `ProductAlias`, `Intent`, `Photo`, `Match`,
`AgreementTerms`, `TermsAcceptance`, `AgreementCancellation`, `Conversation`,
`Message`, `TransactionConfirmation`, `Rating`, `Reputation`, `Relation`.

Mapped onto the primitives this document is about:

| Primitive | Today | Notes |
|---|---|---|
| ACTOR | `Party` | `User` is authentication; `Farm` / `TransportProfile` are optional facets of one node. |
| RESOURCE | `ProduceStock`, `Livestock`, `Equipment` | Three concrete tables, no unified abstraction. `Product` / `ProductAlias` carry commodity identity separately. |
| NEED | `Intent` where `side = DEMAND` | |
| HAVE | `Intent` where `side = SUPPLY` | |
| OPPORTUNITY | `Match` | Deterministic, with stored cited `reasons`. |
| AGREEMENT | `Match.status = AGREED` + `AgreementTerms` + `TermsAcceptance` (+ `AgreementCancellation`) | Bilateral consent is provable from acceptance rows rather than asserted by a status. |
| TRANSFER | **Does not exist** | |
| HANDOFF | **Does not exist** | |
| OUTCOME | `TransactionConfirmation`, `Rating`, `Reputation`, `Relation` | |

**The single most important structural observation in this document:**
AGREEMENT and TRANSFER are currently *conflated*. Completion is recorded by
writing `TransactionConfirmation` rows directly against the `Match`; there is no
object in between representing the physical movement of anything. That works for
one-agreement-one-delivery and stops working the moment one agreement needs two
lorries.

`Intent` is already the correct substrate for HAVE/NEED and should be retained.
The word "post" has already been largely retired from the domain; what remains
of it is vocabulary, not structure.

---

## 1. Starting thesis

FarmaTrade begins in agriculture. Its deeper hypothesis is not agricultural:

> Can a network understand what actors **have**, what actors **need**, and
> coordinate resources, capabilities, logistics and commitments so that those
> needs are actually satisfied?

The fundamental product is not "posts" or "listings". A listing is an artifact
of a particular UI era, not an economic primitive. The primitives under
investigation are:

```
ACTOR · RESOURCE · NEED · OPPORTUNITY · AGREEMENT · TRANSFER · HANDOFF · OUTCOME
```

Agriculture is the proving ground, chosen because it is unforgiving: goods are
heavy, perishable, unevenly measured, geographically dispersed, and traded
between parties with real exposure to being wrong. A model that survives maize
in Manicaland is likely to survive easier domains later.

**This does not mean FarmaTrade should become a general marketplace now.** It
means the primitives should not be *gratuitously* agricultural where a neutral
name costs nothing.

---

## 2. DoorDash thesis

The shift under study is from:

> "Here are people selling what you searched for."

toward:

> "Tell FarmaTrade what you need; the network attempts to fulfil it."

The first is a directory. The second is an orchestrator. The difference is not
cosmetic: a directory's job ends at introduction, while an orchestrator's job
ends at a verified outcome, and only the second creates a reason to come back.

The orchestration pattern worth studying, stripped of food delivery specifics:

```
need → provider → fulfilment → transport where necessary → verified handoff → outcome
```

What FarmaTrade should take from DoorDash/Uber is *not* the UI. It is the
insight that the hard part is the middle — the state between "we agreed" and
"it arrived" — and that owning that middle is what makes the network valuable
rather than merely informative.

What FarmaTrade should **not** take is the assumption of dense supply, short
distances, minutes-not-days timescales, or a single fungible unit of delivery.
A 30-tonne maize order is not a burrito.

**Constraint:** the UX must stay minimal even as the orchestration underneath
becomes complex. See §12.

---

## 3. Exchange / stock-market thesis

A further hypothesis: FarmaTrade may eventually behave less like a marketplace
and more like an *exchange* — continuously matching supply against demand rather
than serving one query at a time.

Capabilities that would characterise this:

- continuous supply/demand matching rather than request-response search
- price discovery from real order flow
- liquidity measurement ("how quickly could 40 tonnes actually be sold here?")
- market depth
- forward requirements (a need dated to a future harvest)
- aggregation of multiple suppliers into one demand
- allocation of one source across multiple demands
- auctions and tenders
- intelligent procurement

**The discipline required here is significant.** Financial-market mechanisms
cannot be copied wholesale into physical commerce. A share of stock is fungible,
weightless, instantly transferable, and identical to every other share. A tonne
of maize is none of those things. Physical resources introduce:

- **geography** — the same commodity has a different value 400km away
- **quality** — grade, moisture, damage, and disagreement about all three
- **time** — harvest windows, and demand that expires
- **custody** — someone is physically holding it, and that matters
- **logistics** — the trade may be impossible without a third party
- **perishability** — the asset degrades while the market decides

Any exchange mechanism adopted must be re-derived against those five, not
assumed to transfer. The existing measurement work — where an unweighed BAG is
refused rather than guessed into KG — is an early instance of exactly this
discipline and should be treated as precedent.

---

## 4. Barter thesis

Long-term hypothesis:

> Money should not necessarily be the only mechanism capable of satisfying a
> need.

An actor may simultaneously **have maize** and **need fertilizer**. Today the
domain can represent that — two `Intent` rows against one `Party` — but the
executable settlement path is monetary.

Research areas:

- direct barter (resource for resource)
- resource plus cash to balance an uneven exchange
- service-for-resource exchange (ploughing for grain)
- multi-party barter cycles
- clearing residual imbalances with money
- optimisation across an exchange graph

The genuinely interesting research question:

> Can FarmaTrade solve the **double coincidence of wants** — finding exchange
> paths that the participants would never have discovered themselves?

That is the question that would justify the whole primitive set. It is also the
one most likely to produce an impressive demo and a useless product, because a
three-party cycle that takes three weeks to physically execute may be worse for
everyone than two ordinary cash trades.

**Do not implement arbitrary barter because this document exists.**

---

## 5. Universal exchange hypothesis

Preserve the *possibility* that the primitives generalise beyond agriculture.

The canonical illustration:

> Actor A has a bicycle, needs a laptop.
> Actor B has a laptop, needs plumbing.
> Actor C provides plumbing, needs a bicycle.

No pair of them can trade. All three together can. A network that can see the
cycle creates value that no participant could create alone.

This is **R&D only**. Agriculture remains the product boundary until evidence
justifies otherwise (see the expansion question in §13). The practical
implication for today is narrow and cheap: prefer neutral names over
agricultural ones *where the neutral name costs nothing*, and avoid hard-coding
"crop" into places where "resource" is equally clear.

---

## 6. Fulfilment network thesis

The hypothesis that FarmaTrade is better understood as an agricultural
**fulfilment network** than a marketplace.

A large buyer says:

> "I need 10,000 tonnes."

A marketplace answers by showing them a list. A fulfilment network answers by
determining whether the network *can make that true* — across many independent
suppliers, several hauliers, storage, and a set of commitments that together
add up to the requirement.

This is the direct architectural consequence, and it is the reason §0's
observation matters:

> **One agreement may require many transfers.**
> **AGREEMENT and TRANSFER must remain conceptually distinct.**

Even while the pilot is overwhelmingly one-agreement-one-delivery, that
distinction must survive implementation. Collapsing them is cheap today and
extremely expensive to undo once commercial history depends on the collapsed
shape.

Corollary invariants worth preserving as this evolves:

- an agreement can exist with no transfer yet
- a transfer's state must never by itself assert commercial completion
- physical-source ceilings must hold across *all* commitments against a source,
  regardless of how many agreements or transfers they are spread over

---

## 7. Chain of custody

Research question: how does a physical-resource transaction establish evidence
trustworthy enough that a stranger will trade on it?

The chain under study:

```
resource representation → agreement → pickup → secure handoff
  → transfer → delivery → destination verification → outcome
```

Mechanisms worth investigating:

- **resource photos** — evidence of what is actually being offered, attached to
  the source, distinct from later evidence
- **pickup photos** — evidence of what actually left
- **one-time, agreement-bound handoff tokens** — proving the right parties met
- **timestamps** — reconstructing a timeline after a dispute
- **optional location evidence** — where it genuinely adds trust
- **delivery photos** and **recipient confirmation**

A design principle worth stating early: **source evidence and transfer evidence
must not be confused.** A photo of maize in a shed is a claim about what exists.
A photo at pickup is a claim about what moved. Merging them into one undated
gallery destroys the ability to answer "was this the thing we agreed?".

**Live GPS is not assumed necessary.** Continuous tracking is expensive, is a
privacy liability, and mostly answers a question ("where is it right now") that
matters less than the one participants actually ask ("did the agreed thing
arrive, and can I prove it"). Event-based state with timestamps may be
sufficient and is certainly cheaper.

Security properties any handoff mechanism must satisfy:

- bound to a specific transfer/agreement
- single-use or otherwise replay-resistant
- expiring
- exposing no secrets and no private contact data
- unusable by an unrelated party
- **fail closed** on anything invalid, stale or replayed

---

## 8. Agent thesis

FarmaTrade should eventually reason *on behalf of* actors:

> "I need 100 tonnes of maize."
> "I want to sell my October harvest, but reliability matters more than price."
> "Keep my fertilizer stock above X."
> "Find cargo for my empty return journey."

Each of those requires reasoning across resources, needs, price, time,
geography, reputation, existing commitments and logistics simultaneously.

**The authority boundary is the important research constraint.** An agent
recommends and proposes; a human retains explicit authority over binding
commercial commitments, unless a future product decision deliberately and
specifically changes that. This is not a technical limitation to be engineered
around — it is a product commitment about who is responsible when a commitment
turns out badly.

The existing derived-intent behaviour is an early precedent worth preserving:
FarmaTrade may *propose*, but a derived proposal stays `PROPOSED` until its
owner confirms it. That shape — system proposes, human commits — should be the
default for anything the agent thesis produces.

---

## 9. Market orchestration

Opportunities involving more than one buyer/seller pair:

- combining several farms to fulfil one large buyer
- splitting one source across several buyers
- consolidating transport across trades
- using empty return journeys
- coordinating storage between harvest and sale
- cooperative purchasing of inputs
- multi-party exchange cycles

The question shifts from:

> "Who matches?"

to:

> "What economically useful outcome can this network make possible?"

That reframing is the whole thesis in one line. It is also where the most
value and the most risk live: an orchestration that is clever but fragile will
lose a farmer a harvest, and they will not come back.

---

## 10. Business-model thesis

Captured to record direction, **not** to fix pricing.

Lessons under study:

- **DoorDash** — orchestration and fulfilment as the product
- **Uber / Lyft / inDrive** — real-time matching, and local payment realities
  (inDrive in particular is worth study for markets where the Western
  assumptions about cards and fees do not hold)
- **Amazon** — low-friction marketplace plus separately monetizable commercial
  infrastructure
- **Stock exchanges** — liquidity, clearing, and price discovery

Possible future revenue layers:

low or capped execution economics · commercial subscriptions · advanced agent
capabilities · procurement infrastructure · logistics and fulfilment ·
enterprise/network tools · APIs · market intelligence · eventually regulated
financial or settlement products where appropriate.

**Do not hard-code a business model from this document.** In particular, do not
build metering, billing or fee infrastructure on the strength of this section.

---

## 11. Retention thesis

Do not rely on hiding identities as the primary moat.

Physical participants in a regional agricultural market will meet. They will
exchange numbers. Any architecture whose retention depends on preventing that is
building on sand, and will additionally make the product worse for the honest
majority.

The stronger mechanism:

> **The next opportunity is better through FarmaTrade.**

That means becoming a persistent sales, procurement and fulfilment channel
rather than an introduction service. A farmer who has met their buyer should
still come back — because FarmaTrade is where the next buyer is, where the
history lives, where the haulier is found, and where the commitment is provable.

Note the tension with §7: contact-detail gating is a *privacy and safety*
control, and is justified on those grounds. It should not be re-justified as a
retention mechanism, because that framing leads to worse decisions.

---

## 12. Minimalism principle

**Non-negotiable.**

Increasing intelligence underneath must not create increasing complexity for the
farmer. The ontology in this document is for engineers. Users should never see
the words "actor", "resource", "opportunity object", "transfer" or "handoff" as
jargon.

The target interaction remains close to:

```
I have          I need
4 strong opportunities found
Review offer
Ready for pickup
Delivered
Confirm
```

Complexity should surface only in small contextual spurts, at the moment a
decision genuinely requires it — and then disappear again.

A useful test for any future feature: *does this add a screen, or does it add an
answer?* Screens are expensive; answers are the product.

---

## 13. Open research questions

The register. These are genuinely open — none should be treated as having an
assumed answer.

**Ontology**
1. What is the smallest universal economic ontology FarmaTrade actually needs?
2. When should a HAVE be modelled as a **Resource** versus a **Capability**?
   (A tonne of maize is consumed; a tractor-hour is a capability that recurs.)
3. Is NEED itself a first-class object, or a view over an unmatched intent?
4. How should **availability** differ from **ownership**? A farmer owns 26
   tonnes, authorizes 20, has agreed 8 — three different numbers about one pile.
5. How should **custody** be represented, distinct from ownership? Goods in a
   haulier's lorry are owned by neither the haulier nor, yet, the buyer.
6. How should services and non-physical fulfilment map onto TRANSFER without
   pretending labour or tractor time is a parcel?

**Exchange**
7. How should multi-party barter clearing actually work?
8. When is money simply another balancing resource rather than the medium?
9. How should the system trade off price versus reliability versus distance
   versus time — and who chooses the weighting?
10. How can large demand safely aggregate many small suppliers without making
    one buyer's failure everyone's failure?
11. How should price discovery work in thin markets, where a handful of trades
    set a "price" that may not generalise?

**Fulfilment**
12. What constitutes sufficient proof of physical handoff, for a dispute that
    matters?
13. When is live location genuinely valuable rather than merely impressive?

**Trust**
14. How should reputation attach to **roles** rather than one global actor
    score? A reliable seller is not necessarily a reliable haulier.
15. What should an agent be permitted to **propose** versus **commit**?

**Strategy**
16. What creates enough value that repeat counterparties keep transacting
    through FarmaTrade rather than around it?
17. Under what evidence would FarmaTrade expand beyond agriculture — and what
    evidence would show it should not?
18. Which current architectural decisions would make universal exchange
    unnecessarily difficult later? (Candidates to re-examine periodically: the
    three separate physical-source tables; category-based rather than
    capability-based matching; the conflation of AGREEMENT and TRANSFER noted
    in §0.)

---

## 14. Architectural discipline

**R&D direction is not product scope.**

Nothing in this document authorises implementation. A future engineer or agent
must not build speculative generalisation merely because it appears here, and
must not cite this document as a requirement.

The failure mode this warning exists to prevent is specific and common: an
abstraction built for an imagined future, which is more expensive than the
concrete thing it replaced, harder to reason about, and never exercised by the
future it was built for — because that future arrived in a different shape.

Current production changes should satisfy **current agricultural needs**, while
avoiding assumptions that would make the researched future impossible. Those are
two different bars, and the second one is much cheaper to clear than the first.
Most of the time, honouring this document means *not adding something*, rather
than adding something general.

Prefer:

> **prove → generalize**

over:

> **generalize → hope.**

When in doubt, build the specific thing, and let the second and third instance
tell you what the abstraction actually is.
