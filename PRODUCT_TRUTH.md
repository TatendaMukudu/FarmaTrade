# FarmaTrade — TTD v1

**Product Truth & Test-Driven Doctrine**

Version: 1.0
Status: Founder product truth
Purpose: Define what FarmaTrade is, how it should behave, what must be protected by tests, and what remains deliberately unresolved.

> **This document outranks `AGENTS.md`.** `AGENTS.md` is the implementation
> contract — how agents work, what the gate is, what the code may not do.
> This is product truth: what FarmaTrade must preserve *even if the
> underlying architecture changes completely*. Where they conflict, this
> wins and `AGENTS.md` is wrong.
>
> Live status of every invariant below: `docs/invariant-register.md`.

---

## 1. Status Vocabulary

Every meaningful product claim must carry one of four states.

**DECIDED** — Founder product truth. Implementation must conform to it. Important decisions should become executable behavioral tests.

**INFERRED** — Required for implementation but not explicitly settled by the founder. Choose the simplest reversible implementation. Do not allow it to harden accidentally into product doctrine.

**\*** — Deliberately unresolved. Reasonable alternatives exist and current evidence is insufficient. The architecture must preserve the ability to change this decision later.

**INVALIDATED** — Previously believed product truth contradicted by pilots, evidence, or a later explicit founder decision. Do not silently delete invalidated decisions. Preserve why they changed.

---

## 2. Product Thesis — DECIDED

FarmaTrade is a calm trading tool built on an agricultural trust network that grows toward an agricultural operating network.

People tell FarmaTrade:

- what they have;
- what they need;
- what they expect to have;
- what they can provide;
- and, where appropriate, what they are looking for.

FarmaTrade uses those facts, relationships, reputation, timing, location, quality, price and other relevant information to find favorable commercial opportunities.

The human remains the trader.

FarmaTrade assists commerce. It does not attempt to replace the way agriculture works.

---

## 3. Strategic Model — DECIDED

FarmaTrade should ultimately become: **C built on B, experienced as A.**

**A — User experience.** The best place to find agricultural trades. This is how FarmaTrade should feel. Opening FarmaTrade should create anticipation: *What opportunities did FarmaTrade find for me?*

**B — Defensibility.** The trust network of agriculture. Relationships, execution, reputation, quality and history compound over time.

**C — Long-term system.** The operating network of agriculture. FarmaTrade increasingly understands: what exists; what will exist; what is needed; when it is needed; who can provide it; who needs it; who knows whom; who has traded successfully; who can be trusted for a particular role; how goods can move; and how commercial agreements are progressing.

The complexity required to achieve C must not leak into the experience of A.

---

## 4. Simplicity Doctrine — DECIDED

**Complex system. Simple mental model.**

The intelligence should increase while the interface gets simpler.

Users should not need to understand FarmaTrade's internal domain model. Terms such as `Intent`, `AgreementTerms`, derivation, lifecycle state, matching engine, `ProductAlias`, ranking policy, fulfillment composition are implementation concepts, not necessarily user concepts.

The user's mental model should remain close to:

> What do I have? What do I need? What opportunities exist? Who do I trust? What am I currently trading?

**Complexity rule.** Complexity requires evidence. A new abstraction, service, agent, state, queue, subsystem or framework should not exist merely because it may become useful. Introduce complexity when a product invariant, demonstrated scale requirement, security requirement, or observed user need requires it. The preferred implementation is the smallest clear implementation that preserves product truth.

---

## 5. Law Zero — DECIDED

**FarmaTrade ranks opportunities for the user's benefit, not FarmaTrade's revenue.**

If Farm A makes FarmaTrade more money, and Farm B represents the more favorable opportunity for the user, **Farm B must rank higher.**

Revenue must not secretly corrupt organic opportunity ranking. Paid placement must never masquerade as organic favorability.

This law should eventually have explicit adversarial tests.

---

## 6. Home — DECIDED

The home experience is **opportunity-first**. The hero concept is:

> **4 strong opportunities found**

FarmaTrade opens with opportunity, not administration.

Home should not primarily feel like inventory software, ERP software, a dashboard, social media, analytics software, or a giant marketplace catalogue.

The emotional response should be: *FarmaTrade may have found something good for me.*

Opportunities should be selective rather than noisy.

---

## 7. Primary Product Structure

**Home — DECIDED.** Answers: *What useful opportunities has FarmaTrade found for me?* Strong opportunities dominate. Active/urgent commercial matters may surface where necessary, but Home should remain calm.

**Trade — DECIDED.** Answers: *What do I have, what do I need, and what trades are happening?* Buying and selling should not require completely separate product worlds. A farmer may simultaneously be seller, buyer, equipment renter, equipment owner, employer, customer, transporter, service customer. The product should accommodate this naturally.

**Network — DECIDED.** Answers: *Who do I do business with?* Existing network comes first. Discovery is secondary.

**Fourth destination — \*.** Possible concepts include You, Farm, Business, Profile. Do not harden the label or mental model prematurely. Likely responsibilities include economic identity, reputation, trade history, verification, business/farm profile, inventory management, settings.

---

## 8. Thirty-Second Simplicity Test — DECIDED

A new farmer receiving FarmaTrade with no explanation should quickly understand how to: (1) buy; (2) sell; (3) record/onboard what they have; (4) use/build their network.

If these fundamental actions require explanation, FarmaTrade is too complicated.

---

## 9. Commercial Truth vs Posts — DECIDED

FarmaTrade is **not listing-first**. A user should not need to continuously manufacture marketplace listings for FarmaTrade to function. Commercial facts should exist independently of presentation.

Examples: *I have 18 tonnes of maize. I expect 20 tonnes in October. I need 20 bags of fertilizer. I have a tractor available on certain weekends.*

These facts can drive matching without becoming traditional posts.

**Posts survive.** However: **posts are not commerce.** Posts serve economic identity, discovery, self-presentation, updates, photos, demonstrating activity/quality. A profile may therefore feel somewhat like a calm professional business identity. Commercial truth remains structurally separate.

---

## 10. Supply and Demand — DECIDED

**Supply makes itself available. Demand acts. FarmaTrade connects.**

When someone wants something, the requesting party should normally initiate the commercial action. A farmer should not have to chase every possible buyer merely because they have supply available.

---

## 11. Structured Offers — DECIDED

The primary commercial action is a structured offer/request, not an unrestricted stranger message.

```
15 tonnes maize
$320 / tonne
Needed September 15
Delivery: Harare
Buyer arranges transport
```

A request should contain sufficient structure for the counterparty to understand the proposed trade.

---

## 12. Negotiation — DECIDED

Trading includes bargaining. Counteroffers are allowed.

> Buyer: $320/t → Farmer: $350/t → Buyer: $340/t → Farmer: Accept

FarmaTrade should support this without turning negotiation into unnecessary complexity.

---

## 13. Agreement Formation — DECIDED

Once parties settle the material terms, FarmaTrade should create a simple understandable agreement/commitment.

```
15t maize · $340/t · Sep 15 · Harare
Buyer arranges transport
Payment on delivery
```

Both parties confirm. The agreement becomes commercial history. Backing out after agreement may therefore become a recorded cancellation rather than the negotiation simply disappearing.

---

## 14. Future Commerce — DECIDED

FarmaTrade is not limited to goods available today. Users may trade against expected future availability: expected harvest; livestock expected to reach sale condition; future equipment availability; future service capacity.

A buyer may contract future harvest before harvest occurs. A buyer may express interest, reserve, or contract appropriate future livestock supply.

FarmaTrade should help agriculture coordinate earlier rather than forcing commerce to begin only after goods physically exist.

---

## 15. Multi-Supplier Fulfillment — DECIDED

One demand does not necessarily require one supplier.

> Buyer needs 15t maize. Farmer A — 4t, Farmer B — 2t, Farmer C — 8t, Farmer D — 1t. Together they satisfy the demand.

This is strategically important. It allows smaller suppliers to participate in demand they could not fulfill independently, so they can execute, prove quality, establish reputation, develop relationships, and scale.

**Farm size must not automatically determine commercial opportunity.**

---

## 16. Favorability — DECIDED

There is no universally "best" trade independent of context. Users may value different dimensions at different times: price; quality; reliability; distance; timing; fulfillment probability; existing relationship; previous successful trades; quantity; transport requirements; convenience.

Sometimes the user wants maximum quality. Sometimes they simply need cattle. Sometimes they want the cheapest acceptable supply. Sometimes reliability dominates.

**Favorability is contextual, not universal.** FarmaTrade should avoid prematurely reducing all commerce to one permanent magic score.

---

## 17. Exact Ranking Policy — \*

The precise ranking formula remains unresolved. In particular: most favorable immediate opportunity vs strongest long-term economic relationship. Both matter.

Architecture must allow ranking policy to evolve without rebuilding the underlying commercial model. **Stable facts should sit underneath replaceable ranking policy.**

---

## 18. Loyalty — DECIDED

Loyalty and successful repeated relationships are economically meaningful. A repeat counterparty represents information: previous successful execution; reduced uncertainty; known expectations; potential recurring contracts; trust.

Therefore loyalty may legitimately contribute to favorability. It should not automatically defeat a dramatically superior new opportunity. The exact weighting remains **\***.

---

## 19. Price Intelligence — DECIDED

Price intelligence is within FarmaTrade's role as a farmer tool. FarmaTrade may provide information such as *"Comparable maize has recently traded above this offer."*

This is assistance. The user still decides whether to accept. FarmaTrade should inform decisions rather than make every decision for the farmer.

---

## 20. User Agency — DECIDED

FarmaTrade is a tool for farmers and other agricultural participants. It should not become an autonomous operator unnecessarily.

For proactive discovery, the default philosophy is closest to *"Here is something useful you may want to look at."* rather than *"We handled everything for you."*

FarmaTrade may perform safe mechanical work underneath, but meaningful commercial decisions remain with users.

---

## 21. Notification Doctrine — DECIDED

**FarmaTrade should search aggressively and communicate selectively.**

A user should not receive seventeen mediocre alerts simply because seventeen possible matches exist. Prefer: *3 strong opportunities found.*

Urgent commercial matters may interrupt. Strong opportunities should surface selectively. Lower-value information can wait quietly inside FarmaTrade. FarmaTrade should not become another application constantly demanding attention.

---

## 22. Universal Search — DECIDED

Opportunity-first Home does not eliminate search. Users should be able to search naturally — e.g. `tractor` — and FarmaTrade should search appropriate commercial and network information without requiring the user to understand internal categories.

---

## 23. Network — DECIDED

FarmaTrade includes an explicit business network. A connection means approximately: *We mutually recognize one another as business acquaintances and are open to doing business.*

Connections may receive direct trade offers; establish existing commercial relationships; contribute network context; enable discovery; support continued business relationships.

FarmaTrade should respect pre-existing agricultural relationships rather than trying to replace them.

---

## 24. Network Principle — DECIDED

**Network opens doors. Execution builds reputation.**

Being connected to respected farmers may improve discoverability, context, access to their network, and confidence that the participant is not entirely unknown.

It must not simply transfer another participant's earned reputation. Knowing excellent farmers does not make someone an excellent farmer.

---

## 25. Existing Relationships — DECIDED

If two participants already have a long-standing commercial relationship outside FarmaTrade, they should be able to represent that relationship through their network. FarmaTrade is not here to pretend agriculture began when FarmaTrade launched.

---

## 26. Network Trust Signals — DECIDED

FarmaTrade may communicate network trust such as *"Trusted by 3 of your connections."* This can reduce uncertainty without unnecessarily exposing private relationship information. Exact privacy mechanics remain implementation work.

---

## 27. Newcomer Discovery — DECIDED

New users should receive reasonable exposure. FarmaTrade must not create a permanent caste system in which established participants receive all meaningful opportunity.

New participants may offer their produce/services; post useful identity/activity content; build connections; begin locally; participate in partial fulfillment; execute smaller trades; accumulate reputation.

**Newcomer exposure must not mean fabricating trust.**

---

## 28. Imported/External Reputation — \*

Existing commercial relationships and external standing may help bootstrap context. However, off-platform status must not automatically become FarmaTrade performance reputation.

Questions still unresolved include vouching; external verification; references; connection-weighted discovery; prior trading evidence.

---

## 29. Identity Safety — DECIDED

Before a commercial relationship is established, FarmaTrade should expose **economic identity**, not unnecessarily expose **personal identity**.

Appropriate pre-engagement information may include farm/business name; profile; relevant posts/photos; trade history; reputation; verification; network trust context.

Do not unnecessarily expose private phone number; personal email; exact private location; other unnecessary personal information.

Core principle: **FarmaTrade initially trades between economic identities, not exposed personal identities.**

---

## 30. Primary Profile Actions — DECIDED

For someone outside the user's network, the primary actions are:

- **Request** — "I want to propose business."
- **Connect** — "I want this participant in my business network."

An unrestricted **Message** action should not casually bypass the security boundary. Communication can become available within an appropriate commercial or network relationship.

---

## 31. Reputation Is Multidimensional — DECIDED

There must not necessarily be one universal reputation score. Someone can legitimately be a 5-star supplier, a 2-star buyer, a 4-star renter.

Performance in one economic role does not erase behavior in another. This allows people to remain useful in markets where they execute well while preserving warnings where they do not.

---

## 32. Reputation Time Horizon — DECIDED

Reputation should reflect long-term history **and** meaningful recent behavior.

Long history deserves significant weight. One mistake should not automatically define a participant. Likewise, historically poor performance must not be hidden merely because the last one or two trades went well.

The system should preserve enough history for users to make informed judgments.

---

## 33. Observed History vs Human Review — DECIDED

FarmaTrade must distinguish:

**Observed commercial history** — agreement formed; trade completed; cancellation; quantity; timing; repeat transaction; payment status where known.

**Subjective human review** — a rating and written opinion.

**A subjective review must never rewrite observed history.**

---

## 34. Reviews — DECIDED

Farms, buyers, businesses and other appropriate participants may receive reviews. Reviews may include rating; written explanation; response from reviewed participant. Review responses may be displayed with the original review.

The UX must avoid turning FarmaTrade into drama-oriented social media.

---

## 35. Review Retaliation Protection — DECIDED

Reviews should not immediately expose one party's rating in a way that encourages retaliation.

Preferred initial rule: reviews remain hidden until the review window expires. The exact review-window duration is **\***.

---

## 36. Quiet Success Counts — DECIDED

Successful trade completion improves the participant's commercial record even when nobody leaves a review. Reliable participants must not be punished merely because counterparties do not write reviews.

---

## 37. Cancellation History — DECIDED

Cancellation after agreement is observable commercial behavior and should be recorded. Recent cancellation behavior should remain visible appropriately.

Users may provide structured cancellation reasons where this can be implemented without creating unnecessary dispute complexity.

---

## 38. Cancellation Reasons and Disputes — \*

Potential cancellation reasons include funding failure; counterparty changed terms; transport unavailable; external event; personal decision; other.

The system may eventually allow the counterparty to contest the stated reason. The first implementation must remain simple.

---

## 39. External Causes / Weather — \*

FarmaTrade should not prematurely become judge and jury over why an agreement failed.

> Farmer committed 15t but produced 11t after severe drought.

The observed outcome can be recorded. How responsibility affects reputation remains unresolved.

Future connectors/agents may provide contextual evidence involving weather; logistics; payment failures; supply shocks; other external events. **Do not infer responsibility without sufficient evidence.**

---

## 40. Credentials vs Execution — DECIDED

Verification and credentials matter. Execution also matters. They are not the same thing.

A registered logistics company may possess stronger formal credentials. An informal transporter may possess 70 successful FarmaTrade deliveries.

FarmaTrade should represent both facts rather than pretending registration automatically means better performance. **Execution should be capable of earning substantial reputation.**

---

## 41. Farm Size — DECIDED

Farm size is not synonymous with quality. If a smaller farm can satisfy the required quantity and provides superior quality/reliability, it may rank above a much larger farm.

FarmaTrade should enable demonstrated commercial quality to scale opportunity.

---

## 42. Reputation Ownership — DECIDED

Personal trading history primarily follows the individual responsible for that execution. New management can materially change a farm/business.

Therefore reputation should not blindly attach forever to a physical farm or business name regardless of who operates it. The exact relationship among individual, business and farm reputation may require further domain design.

---

## 43. Future Payment Model — DECIDED

**Pilot.** FarmaTrade may record/govern agreements while payment is handled externally or through integrated providers. Do not make full financial infrastructure a prerequisite for proving the pilot.

**Mature operational product.** Payment should belong inside the trusted trade lifecycle:

```
Offer → Counter → Agreement → Payment → Fulfillment → Confirmation → Reputation
```

FarmaTrade may coordinate this through licensed financial/payment partners rather than literally custody funds itself. The product requirement is protected payment/settlement coordination, not becoming a bank unnecessarily.

---

## 44. Off-Platform Commerce — DECIDED

FarmaTrade should not primarily defend itself through surveillance or punishment.

Preferred principle: **make trading through FarmaTrade more valuable than leaving it.**

On-platform commerce can provide agreement history; payment protection; verified completion; reputation growth; cancellation evidence; logistics coordination; dispute history; network standing; better future opportunities.

Users should choose FarmaTrade because leaving the trade lifecycle means giving up useful protection and accumulated value.

---

## 45. Monetization — PARTIALLY DECIDED

Potential revenue includes transaction percentage; payment/processing fee; premium business tools; additional protection/services.

Premium may buy more protection and capability. **Premium must not simply buy trust.**

---

## 46. Earned Status vs Paid Status — DECIDED

**Money cannot purchase trust.**

High-trust network standing should be earned through appropriate evidence such as execution, relationships, verification and history. A subscription must not transform an unreliable participant into a trusted participant.

Exact premium product design remains **\***.

---

## 47. Advertising / Sponsorship — DECIDED PRINCIPLE

Commercial sponsorship must not corrupt organic favorability. A company cannot secretly pay to become the "best match" when it is not the most favorable organic opportunity.

Any future sponsored content must be clearly distinguishable from organic recommendations. **Law Zero overrides advertising revenue.**

---

## 48. Public Bidding / Auctions — \*

Default recommendation for v1 is private structured negotiation. Possible future seller-controlled modes may include open bidding. Do not architect FarmaTrade as an auction exchange unless evidence supports it.

---

## 49. Opportunity Composition — DECIDED

FarmaTrade may present multiple ways of satisfying a need.

> **Simplest** — One supplier · 15t
> **Better value** — Three suppliers · 15t combined

The product may eventually express different trade-offs without overwhelming users. Exact labels and ranking presentation remain UX work.

---

## 50. Product Emotion — DECIDED

FarmaTrade should create excitement through **opportunity**, not stimulation.

Think: *There might be a great trade waiting for me.* Not: *37 notifications! Trending! Flashing offers! Infinite feed!*

The desired experience is calm; obvious; trustworthy; useful; commercially exciting when something genuinely good exists.

---

## 51. Proactivity Boundary — DECIDED

FarmaTrade should be **proactive in discovery but restrained in intervention.**

The system may continuously evaluate commercial facts; find matches; identify useful price/context information; surface strong opportunities.

It should not unnecessarily make consequential commercial decisions for users.

---

## 52. Core Behavioral Invariants

These should progressively become executable tests. Live status: `docs/invariant-register.md`.

- **INV-01 — Favorability before revenue.** Organic ranking cannot improve merely because FarmaTrade earns more from an option.
- **INV-02 — Proposed is not agreed.** A suggestion or opportunity cannot become a commercial agreement without required human action.
- **INV-03 — Demand initiates.** Available supply does not automatically create commitments. A requesting party initiates a structured offer.
- **INV-04 — Negotiation preserves agency.** Counterparties may accept, reject or counter structured offers.
- **INV-05 — Agreement creates history.** Once both parties confirm agreed terms, later cancellation cannot erase the fact that the commitment existed.
- **INV-06 — Future supply is tradeable.** Appropriate expected future supply can participate in opportunity discovery and contracting.
- **INV-07 — Multi-supplier fulfillment.** A demand may be satisfied by a valid combination of multiple suppliers.
- **INV-08 — Small does not mean inferior.** Farm/business size alone cannot be used as quality/reliability truth.
- **INV-09 — Network is not reputation.** A participant cannot inherit another participant's execution reputation merely through connection.
- **INV-10 — Role reputation remains separate.** Poor buyer behavior cannot silently destroy independently earned supplier performance, and vice versa.
- **INV-11 — Reviews cannot rewrite facts.** A subjective rating cannot modify observed transaction history.
- **INV-12 — Quiet success counts.** Verified successful completion contributes to commercial history even without a review.
- **INV-13 — Cancellation persists.** A cancellation after agreement remains part of relevant commercial history.
- **INV-14 — Personal identity remains protected.** Pre-engagement discovery cannot unnecessarily expose protected personal contact/location information.
- **INV-15 — Stranger messaging cannot bypass trust boundary.** A participant cannot gain unrestricted personal communication merely by discovering another profile.
- **INV-16 — Payment cannot buy trust.** Premium status cannot directly manufacture earned reputation.
- **INV-17 — Sponsorship cannot masquerade as favorability.** Paid placement cannot silently enter organic match ranking.
- **INV-18 — User remains trader.** Discovery may be automatic; consequential commercial commitment requires appropriate user authorization.
- **INV-19 — Commercial truth does not require a post.** Inventory/needs/future availability can drive opportunities without a social post/listing.
- **INV-20 — Posts cannot become inventory authority.** Deleting/editing a social post must not silently rewrite authoritative commercial inventory unless an explicit product action says so.

---

## 53. TDD Development Doctrine — DECIDED

1. **Founder/Product Truth** — founder decisions define desired behavior.
2. **Executable Invariant** — important behavior is encoded as a failing test by a party that is not implementing the solution where practical.
3. **Minimal Implementation** — the implementer writes the smallest clear code that satisfies the invariant.
4. **Refactor** — remove unnecessary complexity while preserving behavior.
5. **Verification** — the complete relevant suite determines whether the invariant holds.
6. **Product Evidence** — pilot behavior may challenge the underlying product assumption.
7. **Truth Revision** — if reality contradicts the assumption, explicitly mark the old decision INVALIDATED and replace it.

**Do not quietly mutate product philosophy through implementation.**

---

## 54. Claude / Architect Role

Claude should use this document to identify contradictions; challenge assumptions; find missing edge cases; compare current architecture against product truth; propose behavioral invariants; write or specify failing tests; identify unnecessary complexity; identify implementation decisions that have accidentally become product decisions.

Claude should **not** reinterpret unresolved **\*** decisions as settled requirements.

When Claude disagrees with a DECIDED principle, it should **raise the disagreement explicitly** rather than silently implementing its preferred philosophy.

---

## 55. Codex / Implementer Role

Codex should receive the settled product invariant; the failing test; relevant repository context; implementation constraints.

Its objective is: **make the invariant true using the smallest clear implementation that fits the existing architecture.**

Codex should not independently invent major product policy merely to make implementation convenient. If satisfying a test requires substantial new architecture, that is a signal to stop and inspect whether the complexity is genuinely required.

---

## 56. Pilot Role

The first real FarmaTrade users are not merely customers. **They are evidence against this document.**

Pilot observations should explicitly test whether opportunity-first Home is compelling; whether users understand Request vs Connect; whether farmers maintain accurate inventory/future supply; whether network relationships reflect real agricultural behavior; whether structured offers are natural; whether multi-supplier fulfillment is valuable; whether reputation influences decisions; whether users care more about price, loyalty, quality, reliability or different combinations; whether posts meaningfully help newcomers establish identity; whether users voluntarily keep transactions inside FarmaTrade; whether the interface passes the thirty-second simplicity test.

**Do not protect founder assumptions from contradictory evidence.**

---

## 57. Current \* Register

Deliberately unresolved:

1. Exact organic opportunity ranking formula.
2. Exact weighting of loyalty vs superior new opportunity.
3. External/off-platform reputation bootstrapping.
4. Vouching mechanics.
5. Degree to which network standing affects discovery.
6. Responsibility attribution for weather/external trade failures.
7. Cancellation-reason dispute mechanics.
8. Public/open bidding.
9. Exact review-window duration.
10. Exact fourth primary navigation destination/name.
11. Exact premium business offering.
12. Exact relationship among individual, farm and business reputation.
13. Agent-assisted contextual adjudication.
14. Exact UI labels for opportunity modes such as quality/value/trusted.
15. Exact circumstances in which personal/contact information unlocks.

These are not TODOs to casually resolve during implementation. They require founder decision; pilot evidence; legal/security necessity; or a newly discovered technical constraint that genuinely forces a decision.

---

## 58. Product North Star

A successful FarmaTrade should allow someone to think:

> I tell FarmaTrade what I have and what I need. It finds good opportunities. I can see who I'm dealing with without exposing myself unnecessarily. I can build a trusted business network. When I trade well, that history helps me. And the better FarmaTrade understands the agricultural economy, the easier trading becomes.

The user should never need to understand the machinery required to make that true.

---

## 59. Final Doctrine

FarmaTrade is not trying to reinvent agriculture. It is trying to make the agricultural economy easier to see, safer to navigate and easier to trade within.

Existing relationships matter. Loyalty matters. Quality matters. Price matters. Reliability matters. Execution matters.

Newcomers deserve a path in. Small participants deserve a path upward. Trust must be earned rather than purchased.

The user's interests outrank FarmaTrade's transaction economics when ranking opportunities.

And whenever FarmaTrade becomes more intelligent underneath: **the surface should become simpler, not more complicated.**
