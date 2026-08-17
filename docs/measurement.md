# Measurement

## What FarmaTrade can and cannot prove about a quantity

Canonical unit identity lives in `src/lib/measurement.ts`, in code rather
than in the database. Units are closed-world physics and a small closed set;
products are open-world and live in tables because farmers keep inventing
them. A conversion factor an admin could edit is a factor that can silently
change what a completed trade meant, so the factors are constants and the
alias table's one-term-one-meaning guarantee is asserted exhaustively by a
test rather than by a unique index.

### Dimensions implemented, and why only these

| Dimension | Base | Units | Evidence |
|---|---|---|---|
| MASS | kilogram | KILOGRAM, METRIC_TONNE | `ProduceUnit.KG/TONNE`; `"tonne"`, `"tonnes"`, `"kg"` in seeds and intents |
| VOLUME | litre | LITRE | `ProduceUnit.LITRE` |
| COUNT | each | EACH, HEAD | `ProduceUnit.HEAD`; `Livestock.quantity` is a headcount |
| PACKAGE | *(none)* | BAG, CRATE | `ProduceUnit.BAG/CRATE`; `"bag"`, `"BAG"`, `"CRATE"` in seeds |

**AREA is deliberately absent.** The only area in the system is
`Farm.sizeHectares`, a self-describing profile scalar that is never compared
with anything or converted. Giving it a dimension would be infrastructure
for a comparison nobody makes. `TransportProfile.capacityKg` is the same
kind of field — the unit is in the name and it is never matched against an
intent quantity.

### PACKAGE has no base unit, and that is the invariant

`1000 kg = 1 tonne` is true everywhere. `1 bag = 50 kg` is true of some
maize in some districts and false of groundnuts, of a different sack, of a
different season. So:

- bag → kilogram is `context_required`, never a number
- bag → crate is `context_required` (two missing package sizes, not zero)
- bag → bag is `same_unit` and adds normally

**Contextual package size is deferred to a later phase.** There is no
`packageSize`/`packageSizeUnit` on `AgreementTerms` today, because nothing
in the current workflow captures one and inventing the model without the
workflow would be guessing at the shape of it. Until it exists, a
bag-denominated agreement against a tonnage agreement is real, reserves
nothing measurable, and is reported in `Capacity.unmeasured.context_required`.

### Regional vocabulary

`ton` and `tons` resolve to METRIC_TONNE. Every market FarmaTrade serves
(ZW, ZA, KE, ZM, MW) is metric, the schema's own enum says TONNE, and the
short ton appears nowhere in the data. `short ton` and `long ton` are
deliberately *not* aliases, so anybody who means one gets an unresolved unit
rather than a silent 10% error.

`sack`, `punnet`, `bale`, `bucket` and `tray` are also not aliases, though
`units.ts` has long mentioned them as words a farmer might type. A sack is
not reliably a bag, and mapping it to BAG would let ten sacks and five bags
be added as though they were the same container. They stay unresolved until
somebody has evidence.

### Precision

Quantities stay `Float`. Every conversion rounds to 6 decimal places on a
kilogram base — a milligram, far finer than any agricultural trade — which
erases IEEE noise (`0.1 t` becomes exactly `100 kg`, not
`100.00000000000001`). Capacity comparisons use `QUANTITY_EPSILON = 1e-6`,
so the final agreement that exactly fills an intent is never refused over
`0.0000000002` left behind by a conversion.

A migration to `Decimal` was considered and rejected: it would touch four
tables to buy exactness in a domain whose inputs are estimates ("about 26
tonnes"). What it would genuinely buy is protection from drift accumulated
over many conversions, and that is bounded here instead by rounding at
every conversion rather than only at the end.

## Unresolved: what `askingPrice` means

**`Intent.askingPrice` is ambiguous in the current data model, and two call
sites read it in contradictory ways.**

- `match-view.estimatedIntentValue` computes `price * quantity` — treating
  it as a **per-unit** price.
- `confirmations.loadPriceSignals` computes `price / quantity` — treating it
  as a **total**.

Both cannot be right. The form label is just "Price (optional)", so the
data itself is genuinely of mixed meaning.

This predates P0.5 and is **not** fixed here, but it constrains what P0.5
was allowed to do: **no price is ever rescaled by a unit conversion.**
Rescaling an ambiguous number is exactly how `$500/tonne` quietly becomes
`$500/kg`. `suggestedTerms` passes the asking price through untouched even
when it converts the quantity, and the price snapshot on `AgreementTerms` is
stored exactly as entered.

Resolving this needs a product decision (is the field a unit price or a
total?) plus a migration that cannot be made deterministic from the existing
rows — which is why it belongs in its own phase rather than being guessed at
here.
