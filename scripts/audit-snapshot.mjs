#!/usr/bin/env node
/**
 * Dependency-audit re-check (see docs/notes/dependency-audit.md).
 *
 * Runs `npm audit --json`, then compares the findings against the accepted
 * baseline in docs/security/audit-baseline.json. Any vulnerable package that
 * is not in the baseline is a NEW exposure: the script reports it and exits 1.
 * Baseline entries whose severity changed are reported as CHANGED (exit 1) so
 * drift cannot hide behind a name match.
 *
 * Usage:
 *   npm run audit:check            # compare against baseline (CI/moonlight-safe)
 *   node scripts/audit-snapshot.mjs --update   # regenerate the baseline from
 *                                  # the current audit; then edit in the
 *                                  # cluster/reason fields and commit together
 *                                  # with the dependency change that shrank
 *                                  # the accepted set.
 *
 * Exit codes: 0 = every finding is baselined at its recorded severity,
 * 1 = new or changed findings, 2 = the audit or baseline itself failed.
 */

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = path.join(repoRoot, "docs", "security", "audit-baseline.json");
const updateMode = process.argv.includes("--update");

const SEVERITY_ORDER = ["critical", "high", "moderate", "low"];

function runAudit() {
  const res = spawnSync("npm", ["audit", "--json"], { cwd: repoRoot, encoding: "utf8" });
  if (!res.stdout) {
    console.error("npm audit produced no output", res.stderr?.slice(0, 400));
    process.exit(2);
  }
  return JSON.parse(res.stdout);
}

function summarize(vulns) {
  const counts = { critical: 0, high: 0, moderate: 0, low: 0 };
  for (const v of Object.values(vulns)) counts[v.severity] = (counts[v.severity] ?? 0) + 1;
  return counts;
}

const audit = runAudit();
const vulns = audit.vulnerabilities ?? {};

if (updateMode) {
  const baseline = {
    asOf: new Date().toISOString().slice(0, 10),
    totalCounts: summarize(vulns),
    accepted: Object.entries(vulns)
      .map(([name, v]) => ({
        name,
        severity: v.severity,
        // Fill in before committing --update output; the triage rationale for
        // each cluster lives in docs/notes/dependency-audit.md.
        cluster: "TODO",
        reason: "TODO",
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
  writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
  console.log(`baseline written: ${baselinePath}`);
  console.log(`totalCounts: ${JSON.stringify(baseline.totalCounts)}`);
  process.exit(0);
}

let baseline;
try {
  baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
} catch (err) {
  console.error(`cannot read baseline at ${baselinePath}: ${err.message}`);
  process.exit(2);
}

const accepted = new Map(baseline.accepted.map((a) => [a.name, a]));
const now = summarize(vulns);

const problems = [];
for (const [name, v] of Object.entries(vulns)) {
  const base = accepted.get(name);
  if (!base) {
    problems.push(`NEW      ${v.severity.padEnd(8)} ${name}`);
  } else if (base.severity !== v.severity) {
    problems.push(`CHANGED  ${name}: baseline ${base.severity} -> now ${v.severity}`);
  }
}

console.log(
  `audit: ${JSON.stringify(now)} (baseline ${baseline.asOf}: ${JSON.stringify(baseline.totalCounts)})`
);

if (problems.length > 0) {
  console.error(`\n${problems.length} finding(s) outside the accepted baseline:`);
  for (const p of problems) console.error(`  ${p}`);
  console.error("\nTriage the new/changed findings and update docs/notes/dependency-audit.md");
  console.error("plus the baseline (npm run audit:check -- --update) in the same change.");
  process.exit(1);
}

console.log("all findings match the accepted baseline");
