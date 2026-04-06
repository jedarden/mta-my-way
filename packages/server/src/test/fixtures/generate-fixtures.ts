#!/usr/bin/env node
/**
 * Script to generate synthetic binary fixtures from the fixture generators.
 *
 * This creates binary protobuf files that can be used for testing without
 * requiring an MTA API key. These fixtures represent realistic feed structures
 * but are generated programmatically.
 *
 * Usage:
 *   npx tsx packages/server/src/test/fixtures/generate-fixtures.ts
 *
 * The script will generate fixtures to packages/server/src/test/fixtures/feeds/
 *
 * To record REAL MTA feeds instead (requires API key):
 *   MTA_API_KEY=<key> npx tsx packages/server/src/test/fixtures/feeds/download-fixtures.ts
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  aDivisionFeed,
  alertsFeed,
  bDivisionFeed,
  deletedEntitiesFeed,
  emptyFeed,
  lLineFeed,
  noNyctExtensionFeed,
  nqrwFeed,
  pastArrivalsFeed,
  reroutedTrackFeed,
  unassignedTripsFeed,
} from "../fixtures.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, "feeds");

interface FixtureDefinition {
  id: string;
  description: string;
  generator: () => Uint8Array;
}

const SYNTHETIC_FIXTURES: FixtureDefinition[] = [
  {
    id: "synthetic-gtfs",
    description: "A Division (1/2/3/4/5/6/7/S/GS)",
    generator: aDivisionFeed,
  },
  { id: "synthetic-gtfs-ace", description: "A/C/E Lines", generator: () => bDivisionFeed() }, // Uses B division structure
  { id: "synthetic-gtfs-bdfm", description: "B/D/F/M Lines", generator: bDivisionFeed },
  { id: "synthetic-gtfs-g", description: "G Line", generator: bDivisionFeed }, // Reuse B division
  { id: "synthetic-gtfs-jz", description: "J/Z Lines", generator: bDivisionFeed }, // Reuse B division
  { id: "synthetic-gtfs-l", description: "L Line (CBTC)", generator: lLineFeed },
  { id: "synthetic-gtfs-nqrw", description: "N/Q/R/W Lines", generator: nqrwFeed },
  { id: "synthetic-gtfs-si", description: "Staten Island Railway", generator: bDivisionFeed }, // Reuse B division
  { id: "synthetic-alerts", description: "Alerts feed", generator: alertsFeed },
];

const EDGE_CASE_FIXTURES: FixtureDefinition[] = [
  { id: "edge-empty", description: "Empty feed (header only)", generator: emptyFeed },
  { id: "edge-unassigned", description: "Unassigned trips only", generator: unassignedTripsFeed },
  {
    id: "edge-rerouted",
    description: "Rerouted train (track mismatch)",
    generator: reroutedTrackFeed,
  },
  {
    id: "edge-past-arrivals",
    description: "Past arrivals (filtered)",
    generator: pastArrivalsFeed,
  },
  { id: "edge-deleted", description: "Deleted entities", generator: deletedEntitiesFeed },
  {
    id: "edge-no-nyct-extension",
    description: "No NYCT header extension",
    generator: noNyctExtensionFeed,
  },
];

function generateFixtures(): void {
  // Ensure output directory exists
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log("Generating synthetic binary fixtures...");
  console.log("Output directory:", OUTPUT_DIR);

  let syntheticCount = 0;
  let edgeCaseCount = 0;

  // Generate synthetic feed fixtures
  for (const fixture of SYNTHETIC_FIXTURES) {
    try {
      const data = fixture.generator();
      const outputPath = join(OUTPUT_DIR, `${fixture.id}.bin`);
      writeFileSync(outputPath, data);
      console.log(`✓ Generated ${fixture.id} (${data.length} bytes) - ${fixture.description}`);
      syntheticCount++;
    } catch (error) {
      console.error(
        `✗ Failed to generate ${fixture.id}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  // Generate edge case fixtures
  for (const fixture of EDGE_CASE_FIXTURES) {
    try {
      const data = fixture.generator();
      const outputPath = join(OUTPUT_DIR, `${fixture.id}.bin`);
      writeFileSync(outputPath, data);
      console.log(`✓ Generated ${fixture.id} (${data.length} bytes) - ${fixture.description}`);
      edgeCaseCount++;
    } catch (error) {
      console.error(
        `✗ Failed to generate ${fixture.id}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  // Generate a manifest file
  const manifest = {
    generatedAt: new Date().toISOString(),
    syntheticFeeds: SYNTHETIC_FIXTURES.map((f) => ({ id: f.id, description: f.description })),
    edgeCases: EDGE_CASE_FIXTURES.map((f) => ({ id: f.id, description: f.description })),
    note: "These are synthetic fixtures generated from test generators. To record real MTA feeds, run download-fixtures.ts with MTA_API_KEY.",
  };
  writeFileSync(join(OUTPUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`\n✓ Generated manifest.json`);

  console.log("\nAll fixtures generated successfully!");
  console.log(`Synthetic feeds: ${syntheticCount}/${SYNTHETIC_FIXTURES.length}`);
  console.log(`Edge cases: ${edgeCaseCount}/${EDGE_CASE_FIXTURES.length}`);
  console.log("\nFixtures are ready for unit tests!");
}

generateFixtures();
