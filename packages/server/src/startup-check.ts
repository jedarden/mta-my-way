/**
 * Startup smoke check for required runtime artifacts.
 *
 * This module verifies that all compiled modules and runtime dependencies
 * are present before the server attempts to start. This prevents cryptic
 * runtime errors when Docker builds fail to include required files.
 */

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface RuntimeArtifact {
  /** Human-readable description of what this artifact is */
  description: string;
  /** Path to check, relative to __dirname (dist/) */
  path: string;
  /** Whether this artifact is optional (logs warning if missing vs. fatal error) */
  optional?: boolean;
}

const REQUIRED_ARTIFACTS: RuntimeArtifact[] = [
  {
    description: "GTFS realtime protobuf module",
    path: "./proto/compiled.js",
  },
];

/**
 * Check if a runtime artifact exists.
 *
 * @param artifact - Artifact configuration
 * @returns true if artifact exists or is optional, false if missing and required
 */
function checkArtifact(artifact: RuntimeArtifact): boolean {
  const artifactPath = resolve(__dirname, artifact.path);
  const exists = existsSync(artifactPath);

  if (!exists && !artifact.optional) {
    console.error(`❌ Startup check failed: ${artifact.description}`);
    console.error(`   Missing: ${artifactPath}`);
    console.error();
    console.error(`This indicates a Docker build issue - the artifact was not`);
    console.error(`included in the runtime image despite being built locally.`);
    console.error();
    console.error(`Troubleshooting steps:`);
    console.error(`  1. Check that the build script compiles this artifact`);
    console.error(`  2. Verify the Dockerfile COPY commands include it`);
    console.error(`  3. Confirm .dockerignore isn't excluding it`);
    console.error();
    return false;
  }

  if (!exists && artifact.optional) {
    console.warn(`⚠️  Optional artifact missing: ${artifact.description}`);
    console.warn(`   Path: ${artifactPath}`);
  }

  if (exists) {
    console.log(`✓ ${artifact.description}: present`);
  }

  return true;
}

/**
 * Run all startup checks.
 *
 * @throws {Error} If any required artifact is missing
 */
export function runStartupChecks(): void {
  console.log("Running startup artifact checks...");

  let allPassed = true;
  for (const artifact of REQUIRED_ARTIFACTS) {
    if (!checkArtifact(artifact)) {
      allPassed = false;
    }
  }

  if (!allPassed) {
    throw new Error(
      "Startup checks failed - required runtime artifacts are missing. " +
        "This indicates a Docker build or deployment issue."
    );
  }

  console.log("All startup checks passed.");
}
