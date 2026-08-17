-- Canonical unit identity on the two records that carry commercial quantity.
--
-- Expand-only and nullable. The free-text `unit` columns survive as display
-- and audit; `unitCode` becomes what the machine reasons about.
--
-- The backfill below is an exact CASE over the alias table in
-- src/lib/measurement.ts, and a test asserts the two agree. It resolves only
-- terms whose meaning is a physical fact:
--
--   deterministic   kg / tonne / litre / head / each spellings -> canonical
--   packaging       bag / crate -> canonical PACKAGE units, which convert to
--                   nothing; recording the identity is not a conversion
--   unresolved      everything else stays NULL
--
-- NULL is a real answer and is left alone deliberately. An intent measured
-- in "punnets" or "sacks" is a perfectly good intent whose quantity cannot
-- be compared with anything, and writing a guessed code onto it would put an
-- invented tonnage into the capacity arithmetic. Unknown stays unknown, and
-- stays visible.
--
-- Nothing in this migration touches ProduceStock: its enum maps into the
-- canonical set through a proven total function (PRODUCE_UNIT_CANONICAL),
-- so there is no second vocabulary to migrate and no inventory row to
-- rewrite. Inventory quantities are not read or written here at all.

ALTER TABLE "Intent" ADD COLUMN "unitCode" TEXT;
ALTER TABLE "AgreementTerms" ADD COLUMN "unitCode" TEXT;

-- Normalization matching normalizeTerm(): trim, lowercase, collapse internal
-- whitespace, drop one trailing full stop. No plural rule, no edit distance.
UPDATE "Intent" SET "unitCode" = CASE regexp_replace(regexp_replace(lower(btrim("unit")), '\s+', ' ', 'g'), '\.$', '')
  WHEN 'kg' THEN 'KILOGRAM'
  WHEN 'kgs' THEN 'KILOGRAM'
  WHEN 'kilo' THEN 'KILOGRAM'
  WHEN 'kilos' THEN 'KILOGRAM'
  WHEN 'kilogram' THEN 'KILOGRAM'
  WHEN 'kilograms' THEN 'KILOGRAM'
  WHEN 't' THEN 'METRIC_TONNE'
  WHEN 'ton' THEN 'METRIC_TONNE'
  WHEN 'tons' THEN 'METRIC_TONNE'
  WHEN 'tonne' THEN 'METRIC_TONNE'
  WHEN 'tonnes' THEN 'METRIC_TONNE'
  WHEN 'mt' THEN 'METRIC_TONNE'
  WHEN 'metric ton' THEN 'METRIC_TONNE'
  WHEN 'metric tons' THEN 'METRIC_TONNE'
  WHEN 'metric tonne' THEN 'METRIC_TONNE'
  WHEN 'metric tonnes' THEN 'METRIC_TONNE'
  WHEN 'l' THEN 'LITRE'
  WHEN 'litre' THEN 'LITRE'
  WHEN 'litres' THEN 'LITRE'
  WHEN 'liter' THEN 'LITRE'
  WHEN 'liters' THEN 'LITRE'
  WHEN 'each' THEN 'EACH'
  WHEN 'ea' THEN 'EACH'
  WHEN 'unit' THEN 'EACH'
  WHEN 'units' THEN 'EACH'
  WHEN 'piece' THEN 'EACH'
  WHEN 'pieces' THEN 'EACH'
  WHEN 'head' THEN 'HEAD'
  WHEN 'heads' THEN 'HEAD'
  WHEN 'bag' THEN 'BAG'
  WHEN 'bags' THEN 'BAG'
  WHEN 'crate' THEN 'CRATE'
  WHEN 'crates' THEN 'CRATE'
  ELSE NULL
END
WHERE "unit" IS NOT NULL;

UPDATE "AgreementTerms" SET "unitCode" = CASE regexp_replace(regexp_replace(lower(btrim("unit")), '\s+', ' ', 'g'), '\.$', '')
  WHEN 'kg' THEN 'KILOGRAM'
  WHEN 'kgs' THEN 'KILOGRAM'
  WHEN 'kilo' THEN 'KILOGRAM'
  WHEN 'kilos' THEN 'KILOGRAM'
  WHEN 'kilogram' THEN 'KILOGRAM'
  WHEN 'kilograms' THEN 'KILOGRAM'
  WHEN 't' THEN 'METRIC_TONNE'
  WHEN 'ton' THEN 'METRIC_TONNE'
  WHEN 'tons' THEN 'METRIC_TONNE'
  WHEN 'tonne' THEN 'METRIC_TONNE'
  WHEN 'tonnes' THEN 'METRIC_TONNE'
  WHEN 'mt' THEN 'METRIC_TONNE'
  WHEN 'metric ton' THEN 'METRIC_TONNE'
  WHEN 'metric tons' THEN 'METRIC_TONNE'
  WHEN 'metric tonne' THEN 'METRIC_TONNE'
  WHEN 'metric tonnes' THEN 'METRIC_TONNE'
  WHEN 'l' THEN 'LITRE'
  WHEN 'litre' THEN 'LITRE'
  WHEN 'litres' THEN 'LITRE'
  WHEN 'liter' THEN 'LITRE'
  WHEN 'liters' THEN 'LITRE'
  WHEN 'each' THEN 'EACH'
  WHEN 'ea' THEN 'EACH'
  WHEN 'unit' THEN 'EACH'
  WHEN 'units' THEN 'EACH'
  WHEN 'piece' THEN 'EACH'
  WHEN 'pieces' THEN 'EACH'
  WHEN 'head' THEN 'HEAD'
  WHEN 'heads' THEN 'HEAD'
  WHEN 'bag' THEN 'BAG'
  WHEN 'bags' THEN 'BAG'
  WHEN 'crate' THEN 'CRATE'
  WHEN 'crates' THEN 'CRATE'
  ELSE NULL
END
WHERE "unit" IS NOT NULL;

CREATE INDEX "Intent_unitCode_idx" ON "Intent"("unitCode");
