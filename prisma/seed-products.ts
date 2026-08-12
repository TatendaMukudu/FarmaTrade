import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  SEED_PRODUCTS,
  buildProductIndex,
  normalizeProductTerm,
  resolveProductFromTitle,
  resolveProductKey,
  seedAliases,
} from "../src/lib/products";

// Seeds the product catalogue and backfills existing rows.
//
// Idempotent by construction — every write is an upsert keyed on a natural
// key, so running it on every deploy is safe and is how new products and
// aliases reach production without a migration.
//
// Backfill lives here rather than in the migration SQL because it needs the
// same normalization rules the runtime uses. A hand-written LOWER()/REPLACE
// chain in SQL would work today and silently drift from
// `normalizeProductTerm` the first time either changed, which is exactly the
// class of bug that makes "mhunga" stop resolving six months from now.

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const aliases = seedAliases();

  for (const product of SEED_PRODUCTS) {
    await prisma.product.upsert({
      where: { key: product.key },
      create: {
        key: product.key,
        kind: product.kind,
        name: product.name,
        category: product.category,
      },
      // Name and category can be corrected; `key` and `kind` are identity.
      update: { name: product.name, category: product.category },
    });
  }

  const byKey = new Map(
    (await prisma.product.findMany({ select: { id: true, key: true } })).map((p) => [p.key, p.id]),
  );

  for (const alias of aliases) {
    const productId = byKey.get(alias.productKey);
    if (!productId) continue;
    await prisma.productAlias.upsert({
      where: { normalized: alias.normalized },
      create: {
        productId,
        normalized: alias.normalized,
        label: alias.label,
        locale: alias.locale,
        source: "SEEDED",
      },
      // Deliberately does NOT reassign productId. If a term is already
      // claimed — including by an alias a human added on purpose — the seed
      // does not quietly steal it back.
      update: { label: alias.label, locale: alias.locale },
    });
  }

  const index = buildProductIndex(
    (await prisma.productAlias.findMany({ select: { normalized: true, productId: true } })).map(
      (a) => ({ normalized: a.normalized, productKey: a.productId }),
    ),
  );

  // Backfill produce inventory from what farmers already typed.
  const produce = await prisma.produceStock.findMany({
    where: { productId: null },
    select: { id: true, cropType: true },
  });
  let produceMatched = 0;
  for (const row of produce) {
    const productId = resolveProductKey(row.cropType, index);
    if (!productId) continue;
    await prisma.produceStock.update({ where: { id: row.id }, data: { productId } });
    produceMatched++;
  }

  // Backfill posts. A post linked to produce inherits that row's product;
  // otherwise fall back to resolving the title, which is weaker but is all
  // an unlinked post has.
  const posts = await prisma.post.findMany({
    where: { productId: null },
    select: { id: true, title: true, produce: { select: { productId: true } } },
  });
  let postMatched = 0;
  for (const post of posts) {
    const productId = post.produce?.productId ?? resolveProductFromTitle(post.title, index);
    if (!productId) continue;
    await prisma.post.update({ where: { id: post.id }, data: { productId } });
    postMatched++;
  }

  const unresolved = produce
    .filter((r) => !resolveProductKey(r.cropType, index))
    .map((r) => r.cropType);

  console.log(`Products:        ${SEED_PRODUCTS.length}`);
  console.log(`Aliases:         ${aliases.length}`);
  console.log(`Produce matched: ${produceMatched}/${produce.length}`);
  console.log(`Posts matched:   ${postMatched}/${posts.length}`);
  if (unresolved.length) {
    // Not a failure. These are farmers' own words we don't have an alias
    // for yet, and they are the highest-value input to the next catalogue
    // update — so they are printed rather than swallowed.
    console.log(`\nUnrecognised crop names (candidates for new aliases):`);
    for (const name of [...new Set(unresolved)].sort()) {
      console.log(`  ${name}  ->  ${normalizeProductTerm(name)}`);
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
