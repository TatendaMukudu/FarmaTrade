#!/usr/bin/env node
// The verification gate every checkpoint has to pass.
//
// Five checks that were previously five commands typed by hand at the end of
// each phase, which meant each phase's evidence depended on somebody
// remembering all five. Two agents working the same repo cannot rely on
// that: a checkpoint report saying "build clean, lint clean" is only worth
// something if both agents ran the same thing and mean the same thing by it.
//
// The migration drift check runs in BOTH directions on purpose. A schema can
// match a database that was upgraded through every migration in order and
// still not match one built fresh from those same migrations — that gap is
// how a migration that works in development fails on a new environment, and
// only the second direction catches it.
//
// SKIPPED IS NOT PASSED. If Postgres is unreachable the DB-backed checks
// report `skip` and the run fails unless --allow-skip is given, in which
// case it exits 0 but still prints every skip and marks the verdict
// PARTIAL. An agent without a database can report honestly; it cannot
// report clean.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const args = new Set(process.argv.slice(2));
const allowSkip = args.has("--allow-skip");
const asJson = args.has("--json");

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postgres@127.0.0.1:5432/farmatrade";
const SESSION_SECRET = process.env.SESSION_SECRET ?? "verify-only-not-a-real-secret";
const env = { ...process.env, DATABASE_URL, SESSION_SECRET };

function run(command, argv, options = {}) {
  const result = spawnSync(command, argv, {
    encoding: "utf8",
    env: options.env ?? env,
    maxBuffer: 32 * 1024 * 1024,
  });
  return {
    code: result.status ?? 1,
    out: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

// Whether a database is actually reachable, decided once rather than
// inferred from a failed test run — "the tests failed" and "there was no
// database" are different findings and must not look alike.
function databaseReachable() {
  const probe = run("npx", [
    "prisma",
    "migrate",
    "status",
    "--schema",
    "./prisma/schema.prisma",
  ]);
  return !/P1001|Can't reach database server/.test(probe.out);
}

const checks = [
  {
    // The product laws. First, because a law broken is a design problem and
    // there is no point reading a test failure until it is resolved.
    name: "invariants",
    needsDb: false,
    run: () => run("node", ["scripts/invariants.mjs"]),
  },
  {
    name: "typecheck",
    needsDb: false,
    run: () => run("npx", ["tsc", "--noEmit"]),
  },
  {
    name: "lint",
    needsDb: false,
    // eslint exits 0 on warnings. A warning is not a failure, but it is
    // worth surfacing, so it is reported in the detail line.
    run: () => run("npx", ["eslint", "."]),
  },
  {
    name: "tests",
    needsDb: true,
    // vitest directly rather than `npm test`, which would re-run the
    // invariants check reported above.
    run: () => run("npx", ["vitest", "run"]),
    // The pass/skip counts, so a report cannot claim a number nobody ran.
    summarize: (out) => {
      const line = out.match(/Tests\s+(.+)/);
      return line ? line[1].trim() : null;
    },
  },
  {
    name: "build",
    needsDb: true,
    run: () => run("npx", ["next", "build"]),
  },
  {
    name: "migration-drift-upgraded",
    needsDb: true,
    // The live database, which has been through every migration in order.
    run: () =>
      run("npx", [
        "prisma",
        "migrate",
        "diff",
        "--from-config-datasource",
        "--to-schema",
        "./prisma/schema.prisma",
      ]),
    verdict: (result) => /No difference detected/.test(result.out),
  },
  {
    name: "migration-drift-fresh",
    needsDb: true,
    // A database built from nothing but the migration files. Catches the
    // drift the upgraded database cannot see.
    run: () => {
      const scratch = `${DATABASE_URL.replace(/\/[^/?]+(\?|$)/, "/ft_verify$1")}`;
      const admin = { ...env, DATABASE_URL };
      const psql = (sql) =>
        run("psql", [DATABASE_URL, "-v", "ON_ERROR_STOP=1", "-c", sql], { env: admin });

      psql("DROP DATABASE IF EXISTS ft_verify");
      const created = psql("CREATE DATABASE ft_verify");
      if (created.code !== 0) return { code: 1, out: created.out };

      const scratchEnv = { ...env, DATABASE_URL: scratch };
      const deployed = run("npx", ["prisma", "migrate", "deploy"], { env: scratchEnv });
      if (deployed.code !== 0) {
        psql("DROP DATABASE IF EXISTS ft_verify");
        return { code: 1, out: deployed.out };
      }
      const diff = run(
        "npx",
        [
          "prisma",
          "migrate",
          "diff",
          "--from-config-datasource",
          "--to-schema",
          "./prisma/schema.prisma",
        ],
        { env: scratchEnv },
      );
      psql("DROP DATABASE IF EXISTS ft_verify");
      return diff;
    },
    verdict: (result) => /No difference detected/.test(result.out),
  },
];

if (!existsSync("package.json")) {
  console.error("Run this from the repository root.");
  process.exit(1);
}

const dbUp = databaseReachable();
const results = [];

for (const check of checks) {
  if (check.needsDb && !dbUp) {
    results.push({ name: check.name, status: "skip", detail: "no database reachable" });
    continue;
  }
  const result = check.run();
  const passed = check.verdict ? check.verdict(result) : result.code === 0;
  results.push({
    name: check.name,
    status: passed ? "pass" : "fail",
    detail: check.summarize?.(result.out) ?? null,
    output: passed ? null : result.out.slice(-4000),
  });
}

const failed = results.filter((r) => r.status === "fail");
const skipped = results.filter((r) => r.status === "skip");
const verdict = failed.length > 0 ? "FAIL" : skipped.length > 0 ? "PARTIAL" : "PASS";

if (asJson) {
  console.log(JSON.stringify({ verdict, results }, null, 2));
} else {
  for (const r of results) {
    const mark = { pass: "PASS", fail: "FAIL", skip: "SKIP" }[r.status];
    console.log(`${mark}  ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
  }
  for (const r of failed) {
    console.log(`\n--- ${r.name} ---\n${r.output}`);
  }
  console.log(`\nVerdict: ${verdict}`);
  if (verdict === "PARTIAL") {
    console.log(
      "Checks were skipped. Report them as skipped — a skipped check is not a passing one.",
    );
  }
}

process.exit(failed.length > 0 || (skipped.length > 0 && !allowSkip) ? 1 : 0);
