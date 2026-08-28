#!/usr/bin/env tsx
/**
 * Verification script for SHELL environment variable reading
 *
 * This script demonstrates the readShellEnv() function working with
 * the actual SHELL environment variable from the current environment.
 */

import { readShellEnv } from "../packages/shared/src/utils/env.js";

console.log("=== SHELL Environment Variable Verification ===\n");

const result = readShellEnv();

console.log("Result:");
console.log(`  exists: ${result.exists}`);
console.log(`  value: ${result.value}`);
console.log(`  isValid: ${result.isValid}`);
console.log(`  shellName: ${result.shellName}`);

console.log("\n=== Acceptance Criteria ===");

const criteria = [
  {
    check: "SHELL environment variable is successfully read",
    pass: result.exists && result.value !== undefined,
  },
  {
    check: "Value is captured and verified as a non-empty string",
    pass: result.exists && result.value && result.value.trim().length > 0,
  },
  {
    check: "Path format is validated (contains / and shell name)",
    pass: result.isValid && result.shellName !== undefined,
  },
];

criteria.forEach(({ check, pass }) => {
  console.log(`  ${pass ? "✓" : "✗"} ${check}`);
});

const allPassed = criteria.every((c) => c.pass);
console.log(`\n${allPassed ? "✓ All acceptance criteria met!" : "✗ Some criteria failed"}`);

process.exit(allPassed ? 0 : 1);
