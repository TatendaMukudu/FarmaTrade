# PR #22 CI correction — 2026-08-16

The report on commit `8ac7964` claimed the verification gate passed. That was
not a reproducible claim: the local database had been manually populated by
`prisma/seed-products.ts` before `npm run verify`, while GitHub CI applied only
migrations. Five product-identity matching tests then failed in CI because the
fresh database contained no `Product` rows.

The omission was in the report and in the gate contract. Product catalogue
rows are idempotent deployment reference data, not migration data, but the
test command requires them. Both `npm test` and the gate's test check now run
the product seed themselves. A previous workstation seed can no longer hide
the clean-database failure.

The corrected checkpoint is not passing until both a fresh local gate and the
GitHub Actions run agree. Local success alone must not be reported as CI
success.
