# What the truth layer guards, and why

`npm run verify` is the arbiter. Seven checks, one verdict. This is what each
one is actually protecting.

| Check | Needs a DB | Guards |
|---|---|---|
| `invariants` | no | The product laws, statically. §2 of `AGENTS.md`. |
| `typecheck` | no | Domain types — a `Valuation` cannot be used as a number. |
| `lint` | no | House style. |
| `tests` | **yes** | Everything behavioural. |
| `build` | **yes** | The app compiles and every page renders. |
| `migration-drift-upgraded` | **yes** | Schema matches a DB upgraded through every migration. |
| `migration-drift-fresh` | **yes** | Schema matches a DB built from nothing but the migrations. |

`npm test` and the gate's `tests` check seed the idempotent product catalogue
before running the suite. Product rows are deployment reference data rather
than migration data; establishing them inside both commands keeps a fresh CI
database and an already-seeded development database equivalent.

## Why the drift check runs twice

A schema can match a database that was upgraded migration-by-migration and
still not match one built fresh from those same files. That gap is exactly
how a migration that works in development fails on a new environment. Only
the second direction catches it, and it caught real omissions during the
P0.2B rename.

## Why FarmaTrade cannot have a pure-logic test suite

Four checks need Postgres, and that is a property of the domain rather than
a shortcoming:

- **Concurrency.** "Two buyers cannot both agree the last eight tonnes" is a
  statement about row locks. It is only provable against a real transaction —
  and it was proved by removing the lock and watching sixteen tonnes get
  allocated against ten.
- **Bilateral consent.** "Both parties accepted the same version" is a
  question about rows, deliberately. That was the fix in P0.4: consent
  stopped being a status one party could set and became rows nobody can
  forge.
- **Migration drift** is a question about a database by definition.

Everything else is pure on purpose. Consent rules, capacity arithmetic, unit
conversion and valuation all live in database-free modules (law 2), so the
rules that matter most can be exercised in milliseconds without a container.

## The two layers, and what belongs in each

**Pure** (`*.test.ts` against `-core`, `capacity`, `measurement`, `money`,
`pricing`, `units`): rules and arithmetic. Fast, exhaustive, no fixtures.
Prefer these — a law provable here is a law a second agent can check without
standing up an environment.

**Integration** (`*.integration.test.ts`): promises that need real rows —
inventory left untouched, locks holding, consent surviving a round trip,
legacy data staying unresolved.

## Two habits worth keeping

**Fix a bug → add the case that pins it.** Every defect becomes permanent
coverage. The decline-suppression bug in P0.2C was caught by a test that
failed and was *right* — the code was wrong.

**Prove a guard bites.** A lock or an invariant you have never watched fail
with it removed is one you are assuming works. Both the P0.3 and P0.4
concurrency tests were verified this way: disable the lock, confirm the test
goes red, restore it.
