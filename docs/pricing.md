# Pricing

## The contradiction this phase resolved

`Intent.askingPrice` was a bare number with no recorded meaning, and two
modules read it in opposite ways:

| Reader | Arithmetic | Implied meaning |
|---|---|---|
| `match-view.estimatedIntentValue` | `price × quantity` | a **rate per unit** |
| `confirmations.loadPriceSignals` | `price ÷ quantity` | a **total** |

The form said only "Price (optional)". Both readings cannot be right, and
the wrong one is not wrong by a rounding error — for a ten-tonne listing it
is wrong by a factor of ten in whichever direction.

### What the evidence actually showed

Searched for evidence of the original meaning:

- **Seed data**: creates **no** priced intents at all. No evidence.
- **Original UI copy** (commit `19f0516`): "Asking price (optional)". Still
  ambiguous — "asking price" is used colloquially for both.
- **Development database**: 7 priced rows. Dividing by quantity gives $270,
  $285, $295, $300, $310, $325, $467 per tonne, which are realistic
  Zimbabwean maize and soya prices; multiplying would give $27,000 for ten
  tonnes of maize, which is absurd.

The value ranges point at TOTAL. **They were not treated as proof.** Those
rows are fixtures written during this rebuild, not anything a farmer typed,
so they are evidence of one developer's reading rather than of user intent —
and that reading is exactly what is in dispute. A migration justified by
them would be circular.

**Decision: no backfill.** Every existing row keeps `priceBasis = NULL` and
resolves to `ambiguous_legacy`, which produces no value anywhere rather
than a number that is wrong about half the time.

Classification of existing rows:

| Class | Rows |
|---|---|
| Deterministically interpretable | 0 |
| Ambiguous — left unresolved | 7 |
| No price | 18 |
| Potentially inconsistent | 0 (none has explicit semantics to conflict with) |

## The model

`PriceBasis` is `TOTAL | PER_UNIT`. "Per bag" is not a third value — it is
`PER_UNIT` whose basis unit happens to be a package, which is why package
pricing needs no special case in the arithmetic.

New columns on both `Intent` and `AgreementTerms`, alongside the existing
`Decimal(12,2)` amount:

- `priceCurrency` — ISO 4217
- `priceBasis` — `TOTAL` / `PER_UNIT`
- `priceUnitCode` — canonical unit the rate is per (P0.5 identities)

### Currency was never stored

It was **derived at display time** from the viewing party's country
(`regions.ts`). That is correct only while both sides of a trade are in one
country, and FarmaTrade has supported per-intent cross-border opt-in from
the start. A ZW seller and a ZA buyer agreeing on "450" had no way to record
which 450. Currency is now stored explicitly, and a price without one
resolves to `unknown_currency` rather than defaulting to the pilot's USD.

Currencies live **in code** (`src/lib/money.ts`), same reasoning as units: a
minor-unit exponent an admin could edit is one that can silently change what
a completed agreement was worth. Five currencies, taken from the regions
FarmaTrade actually serves — not ISO 4217 wholesale.

### Money precision: integer minor units

`500 USD` is `50000`, not `500.0`. **This is the opposite of P0.5's decision
for physical quantities, made for the opposite reason**: a tonnage is an
estimate and tolerates rounding, an amount owed is not and does not. The
`Decimal(12,2)` storage columns were already exact; the risk was in
arithmetic, where `Number(price)` produced a float. Multiplication rounds
straight back to an integer minor unit, so a float never survives a call and
cannot accumulate. `multiplyMoney` also reports whether the result was
exact, so a clean `375.00` is distinguishable from a `333.33` that was
really a third.

### Package price never becomes a mass price

If a deal says `20 USD/bag`, ten bags is `200 USD` — with no bag mass
required or consulted. Even once contextual package equivalence exists
(P0.6, **not on this branch**), knowing that a bag weighs 50 kg would
establish what a bag *weighs*; it would not convert the parties' quoted
`20 USD/bag` into `0.40 USD/kg`. Package equivalence is a quantity fact.
Price basis is a commercial fact. They do not rewrite each other.

Conversely `500 USD/tonne` against `10 bags` is **`context_required`** —
unresolved, not guessed. A package mass would resolve it; nothing on this
branch supplies one.

## Price signals: what a signal now is

A price signal is a **normalized asking rate per one canonical unit**,
grouped by subject, district, rate unit **and currency**.

- A `PER_UNIT` price contributes its rate directly — no division at all.
- A `TOTAL` price contributes `total ÷ quantity`, but only where the
  quantity is measurable.
- An ambiguous legacy price contributes **nothing** and is excluded in the
  query.

This makes the signal smaller and true rather than larger and unreliable. A
range built from numbers that might be totals and might be rates is worse
than no range, because a farmer will price their harvest against it.

## Still unresolved

- **Rate normalization is not wired into ranking**, deliberately. Knowing
  that `500 USD/tonne` and `0.50 USD/kg` are the same rate is commercial
  truth; deciding that cheaper should rank higher is a product judgement for
  a later phase.
- **No FX.** Rates in different currencies are never compared, and
  `sameRate` returns false across currencies as a refusal rather than a
  judgement that they differ.
- **The 7 ambiguous rows** need a human to say what they meant, or to be
  left alone until they expire.
