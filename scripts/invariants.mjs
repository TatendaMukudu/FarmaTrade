#!/usr/bin/env node
// The product laws, as executable checks.
//
// Every one of these was learned by getting it wrong, or by nearly getting
// it wrong, during the P0 rebuild. Written down in a commit message a law is
// advice; written down here it turns the suite red, which is the only form
// of "non-negotiable" that survives a second implementer who never read the
// commit message.
//
// These are STATIC checks over the source. They catch a law being broken by
// construction — an import that should not exist, a write to a table nobody
// may write to, a dependency that would make matching non-deterministic.
// Behavioural laws (capacity arithmetic, consent, conversion refusals) are
// guarded by the vitest suites instead, because they need real rows.
//
// Adding a law: only add one that is genuinely mechanically decidable. A
// check that half-works is worse than none, because it launders a green
// suite into a claim nobody verified.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const failures = [];

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (["node_modules", ".next", ".git", "generated"].includes(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, files);
    else files.push(full);
  }
  return files;
}

const sources = walk(join(ROOT, "src")).filter((f) => /\.(ts|tsx)$/.test(f));
const read = (f) => readFileSync(f, "utf8");
const rel = (f) => relative(ROOT, f);
const isTest = (f) => /\.test\.tsx?$/.test(f);

function law(name, detail, offenders) {
  if (offenders.length > 0) failures.push({ name, detail, offenders });
}

// ---------------------------------------------------------------------------
// 1. Commercial coordination never mutates physical inventory.
// ---------------------------------------------------------------------------
// The oldest law in the codebase and the one most likely to be broken by
// somebody being helpful. Agreeing to supply eight tonnes records that eight
// of the twenty a farmer authorized are spoken for; it does not move eight
// tonnes. Reconciling against what is physically in the shed belongs to a
// fulfilment layer that does not exist yet — and when it does, it will own
// these writes explicitly rather than acquiring them by accident.
//
// Farm CRUD and the CSV importer are where a farmer edits their own records,
// which is the one legitimate source of an inventory write.
{
  // Farm CRUD and the CSV importer are a farmer editing their own records.
  // Test fixtures build and tear down the world they assert against.
  const allowed = [/src\/app\/dashboard\/farm\//, /src\/lib\/csv\.ts$/, /src\/test\//];
  const writes = /\b(produceStock|livestock|equipment)\.(update|updateMany|upsert|delete|deleteMany|createMany|create)\b/;
  law(
    "inventory-is-not-touched-by-commerce",
    "Only farm CRUD may write inventory. Commercial coordination reserves capacity; it never moves stock.",
    sources.filter(
      (f) =>
        !isTest(f) &&
        !allowed.some((a) => a.test(rel(f))) &&
        writes.test(read(f)),
    ).map(rel),
  );
}

// ---------------------------------------------------------------------------
// 2. The pure domain core stays pure.
// ---------------------------------------------------------------------------
// Every rule worth trusting lives in a module a test runner can reach
// without a database. That is not tidiness: a rule behind `server-only` is a
// rule that only gets exercised through integration tests, and the ones that
// matter most here — consent, conversion, valuation — need to be provable in
// isolation. This is also what lets a second agent verify the laws without
// standing up Postgres.
{
  const pure = [
    "agreement-core.ts",
    "capacity.ts",
    "derivation-core.ts",
    "intent.ts",
    "match-rank.ts",
    "matching-core.ts",
    "measurement.ts",
    "money.ts",
    "navigation.ts",
    "you-hub.ts",
    "network-route.ts",
    "price-signals.ts",
    "pricing.ts",
    "products.ts",
    "reason-reliability.ts",
    "trade-outcomes.ts",
    "units.ts",
  ];
  const forbidden = /from ["']@\/lib\/prisma["']|require\(["']@\/lib\/prisma|["']server-only["']/;
  law(
    "domain-core-is-database-free",
    "These modules must be runnable without a database. Move DB access to a server wrapper.",
    pure
      .map((name) => join(ROOT, "src/lib", name))
      .filter((f) => sources.includes(f) && forbidden.test(read(f)))
      .map(rel),
  );
}

// ---------------------------------------------------------------------------
// 3. Matching and valuation are deterministic and explainable.
// ---------------------------------------------------------------------------
// A farmer must be able to be told why FarmaTrade suggested something, and
// the answer must be the same tomorrow. No model call may sit between two
// parties and their trade — not for matching, not for units, not for money.
{
  const ai = /@anthropic-ai\/|\bopenai\b|@google\/gener|langchain|\bollama\b/i;
  law(
    "no-model-calls-in-the-commercial-path",
    "Matching, measurement and pricing must stay deterministic. A suggestion nobody can re-derive is not explainable.",
    sources.filter((f) => !isTest(f) && ai.test(read(f))).map(rel),
  );
}

// ---------------------------------------------------------------------------
// 4. Nothing is resolved by guessing.
// ---------------------------------------------------------------------------
// Units resolve by exact alias lookup or not at all; "tone" must not become
// TONNE. Prices resolve by recorded basis or not at all. A fuzzy matcher in
// this codebase would be guessing at the size or the value of somebody's
// trade, which is the failure mode P0.5 and P0.7 exist to prevent.
{
  const fuzzy = /levenshtein|string-similarity|fuzzysort|\bfuse\.js\b|didyoumean|jaro|soundex/i;
  law(
    "no-fuzzy-resolution",
    "Unknown must stay unknown and visible. Exact lookup only for units, products and prices.",
    sources.filter((f) => fuzzy.test(read(f))).map(rel),
  );
}

// ---------------------------------------------------------------------------
// 5. FarmaTrade identifies money; it does not move or convert it.
// ---------------------------------------------------------------------------
// No FX, because a rate needs a source and a decision about who bears the
// spread. No payment rails, escrow or fees, because FarmaTrade is not
// licensed to hold funds and must not look as though it is.
{
  const money = /exchangerate|\bfx-?rate\b|currencyConvert|\bstripe\b|ecocash|escrow|payment-?intent|payout/i;
  law(
    "no-currency-conversion-or-payments",
    "Identifying money and moving money are different problems. Settlement happens off-platform.",
    sources.filter((f) => !isTest(f) && money.test(read(f))).map(rel),
  );
}

// ---------------------------------------------------------------------------
// 6. No emojis.
// ---------------------------------------------------------------------------
// A house convention, and a real one: emoji read as decoration in a product
// asking to be trusted with a harvest. Where an icon is genuinely needed it
// is an inline SVG (see src/components/icons.tsx).
{
  // What is banned is emoji PRESENTATION, not every pictographic codepoint.
  // The star in "4.7\u2605", the tick on a verified badge and the arrow
  // between two listing titles all default to text presentation and are
  // typography, not decoration — banning them would be enforcing a rule
  // nobody made. A character only reads as emoji if it defaults that way or
  // is forced there with U+FE0F, and that is exactly what this matches.
  const emoji = /\p{Emoji_Presentation}|\uFE0F/u;
  const docs = walk(join(ROOT, "docs")).filter((f) => f.endsWith(".md"));
  law(
    "no-emojis",
    "Plain text labels, or an inline SVG where an icon is genuinely needed.",
    [...sources, ...docs].filter((f) => emoji.test(read(f))).map(rel),
  );
}

// ---------------------------------------------------------------------------
// 7. Farmer-facing reasoning never forecasts or asserts cause.
// ---------------------------------------------------------------------------
// FarmaTrade reports what happened in counts, never what will happen. The
// runtime guard is assertSafeReasonText in trade-outcomes.ts; this checks
// the guard itself still exists and still bans the words, because a law
// enforced by a function somebody deleted is not enforced.
{
  const guard = join(ROOT, "src/lib/trade-outcomes.ts");
  const body = sources.includes(guard) ? read(guard) : "";
  const banned = ["will", "guarantee", "predict", "caused", "always"];
  const missing = banned.filter((w) => !body.includes(w));
  law(
    "forecast-language-guard-intact",
    "assertSafeReasonText must still ban forecasting and causal language in farmer-facing reasons.",
    !body.includes("assertSafeReasonText")
      ? ["src/lib/trade-outcomes.ts (guard missing)"]
      : missing.map((w) => `src/lib/trade-outcomes.ts (no longer bans "${w}")`),
  );
}

// ---------------------------------------------------------------------------
// 8. Capacity consumption is decided in exactly one place.
// ---------------------------------------------------------------------------
// P0.4's invariant: no party's capacity may be consumed by an action taken
// solely by the counterparty. That is provable only while the rule lives in
// one predicate. A call site that counts acceptances itself is a second copy
// of the rule, and a second copy is one that can drift.
{
  const owner = /agreement-core\.ts$/;
  const reimplementation = /acceptedBy\.(includes|length)|\bbothAccepted\b|aAccepted|sellerAccepted|buyerAccepted/;
  law(
    "one-authoritative-consent-predicate",
    "Ask agreement-core (isAcceptedByBoth / governingTerms / reservationFor). Do not count acceptances at a call site.",
    sources
      .filter((f) => !isTest(f) && !owner.test(f) && reimplementation.test(read(f)))
      .map(rel),
  );
}

// ---------------------------------------------------------------------------
// 9. Law Zero — favorability before revenue.
// ---------------------------------------------------------------------------
// PRODUCT_TRUTH.md §5 and INV-01/INV-17. If Farm A earns FarmaTrade more and
// Farm B is the better opportunity, Farm B ranks higher. No revenue concept
// exists yet, which is exactly why this check is worth writing now: it fails
// the day somebody threads a sponsorship or fee signal into ranking, rather
// than being written after the fact when the incentive to weaken it exists.
//
// Scoped to the modules that actually decide order. Revenue may one day be
// modelled elsewhere in the app; it may not reach these.
{
  const ranking = ["match-rank.ts", "match-ranking.ts", "matching-core.ts", "matching.ts"];
  const revenue = /\bsponsor|\bpromoted\b|\bpaidPlacement|\bboost(ed)?Rank|commission|\brevenue\b|\bfeeRate|premiumTier/i;
  law(
    "law-zero-favorability-before-revenue",
    "Ranking may not read a revenue, sponsorship or paid-placement signal. Paid placement must never masquerade as organic favorability.",
    ranking
      .map((name) => join(ROOT, "src/lib", name))
      .filter((f) => sources.includes(f) && revenue.test(read(f)))
      .map(rel),
  );
}

// ---------------------------------------------------------------------------
// 10. Farm size is not a quality signal.
// ---------------------------------------------------------------------------
// PRODUCT_TRUTH.md §41 and INV-08. A smaller farm that can satisfy the
// quantity and executes better may rank above a much larger one. Size is
// recorded on the farm profile and must stay out of the ordering, or
// FarmaTrade quietly becomes a product where scale buys opportunity — the
// opposite of §15's reason for multi-supplier fulfilment.
{
  const ranking = ["match-rank.ts", "match-ranking.ts", "matching-core.ts", "matching.ts"];
  const size = /sizeHectares|farmSize|\bhectares\b/i;
  law(
    "farm-size-is-not-a-quality-signal",
    "Matching and ranking may not read farm size. Demonstrated execution scales opportunity; acreage does not.",
    ranking
      .map((name) => join(ROOT, "src/lib", name))
      .filter((f) => sources.includes(f) && size.test(read(f)))
      .map(rel),
  );
}

// ---------------------------------------------------------------------------

if (failures.length === 0) {
  console.log(`invariants: ${10} laws upheld`);
  process.exit(0);
}

console.error("PRODUCT LAW VIOLATIONS\n");
for (const f of failures) {
  console.error(`  ${f.name}`);
  console.error(`    ${f.detail}`);
  for (const o of f.offenders) console.error(`      - ${o}`);
  console.error("");
}
console.error(
  "These are non-negotiable. If a law is genuinely wrong, change the law here\n" +
    "in its own commit with the reasoning — do not work around it silently.",
);
process.exit(1);
