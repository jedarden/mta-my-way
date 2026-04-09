#!/usr/bin/env node
/**
 * Script to download real MTA GTFS-RT feed responses as binary fixtures.
 *
 * Usage:
 *   MTA_API_KEY=<key> npx tsx packages/server/src/test/fixtures/feeds/download-fixtures.ts
 *
 * Or run via pnpm:
 *   cd packages/server && MTA_API_KEY=<key> pnpm exec tsx src/test/fixtures/feeds/download-fixtures.ts
 *
 * The script will download real MTA feeds as binary fixtures for offline testing.
 * - MTA_API_KEY env var is required
 * - Fixtures are saved to packages/server/src/test/fixtures/feeds/
 * - Binary files (protobuf) are stored in git.
 * - Re-run periodically to catch MTA feed format changes
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MTA_ALERTS_FEED_URL, MTA_FEED_BASE_URL, SUBWAY_FEEDS } from "@mta-my-way/shared";
import { transit_realtime } from "../../../proto/compiled.js";

// Alert feed ID for manifest
const ALERTS_FEED_ID = "nyct-subway-alerts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, "feeds");

const SUBWAY_FEED_IDS = SUBWAY_FEEDS.map((f) => f.id);

interface DownloadResult {
  feedId: string;
  data: Uint8Array;
  entityCount: number;
  feedTimestamp: number;
  hasNyctExtension: boolean;
}

async function downloadFeed(feedId: string, feedUrl: string): Promise<DownloadResult> {
  const headers: Record<string, string> = {
    Accept: "application/x-protobuf",
  };

  if (process.env["MTA_API_KEY"]) {
    headers["x-api-key"] = process.env["MTA_API_KEY"];
  }

  const response = await fetch(feedUrl, { headers });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${feedId}: HTTP ${response.status} ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  if (!buffer || buffer.byteLength === 0) {
    throw new Error(`Failed to read response for ${feedId}: empty response`);
  }

  const data = new Uint8Array(buffer);

  // Decode to get metadata
  let entityCount = 0;
  let feedTimestamp = 0;
  let hasNyctExtension = false;

  try {
    const message = transit_realtime.FeedMessage.decode(data);
    entityCount = message.entity.length;
    // Handle both Long and number types for timestamp
    const ts = message.header.timestamp;
    feedTimestamp = typeof ts === "number" ? ts : (ts?.toNumber() ?? 0);
    // Check for NYCT extension
    const nyctHeader = message.header[".transit_realtime.nyctFeedHeader"];
    hasNyctExtension = nyctHeader !== null && nyctHeader !== undefined;
  } catch {
    // If we can't decode, still save the fixture
    console.warn(`Warning: Could not decode ${feedId} to get metadata`);
  }

  return { feedId, data, entityCount, feedTimestamp, hasNyctExtension };
}

interface FixtureManifest {
  downloadedAt: string;
  source: "real-mta-api";
  feeds: Array<{
    id: string;
    sizeBytes: number;
    entityCount: number;
    feedTimestamp: number;
    hasNyctExtension: boolean;
  }>;
  note: string;
}

async function downloadFixtures(): Promise<void> {
  const apiKey = process.env["MTA_API_KEY"];

  if (!apiKey) {
    console.log("MTA_API_KEY not set - skipping fixture download");
    console.log("To download fixtures, set MTA_API_KEY=<key> and rerun:");
    console.log("  npx tsx packages/server/src/test/fixtures/feeds/download-fixtures.ts");
    process.exit(0);
  }

  // Ensure output directory exists
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log("Downloading real MTA feeds as test fixtures...");
  console.log("Output directory:", OUTPUT_DIR);

  const results: DownloadResult[] = [];
  const manifestFeeds: FixtureManifest["feeds"] = [];
  let feedCount = 0;
  let alertCount = 0;

  // Download subway feeds
  for (const feedId of SUBWAY_FEED_IDS) {
    try {
      const url = `${MTA_FEED_BASE_URL}/${feedId}`;
      const result = await downloadFeed(feedId, url);
      results.push(result);

      const outputPath = join(OUTPUT_DIR, `${feedId}.bin`);
      writeFileSync(outputPath, result.data);
      console.log(
        `✓ Downloaded ${feedId} (${result.data.length} bytes, ${result.entityCount} entities, NYCT: ${result.hasNyctExtension})`
      );
      manifestFeeds.push({
        id: feedId,
        sizeBytes: result.data.length,
        entityCount: result.entityCount,
        feedTimestamp: result.feedTimestamp,
        hasNyctExtension: result.hasNyctExtension,
      });
      feedCount++;
    } catch (error) {
      console.error(
        `✗ Failed to download ${feedId}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  // Download alerts feed
  try {
    const result = await downloadFeed(ALERTS_FEED_ID, MTA_ALERTS_FEED_URL);
    results.push(result);

    const outputPath = join(OUTPUT_DIR, `${ALERTS_FEED_ID}.bin`);
    writeFileSync(outputPath, result.data);
    console.log(
      `✓ Downloaded ${ALERTS_FEED_ID} (${result.data.length} bytes, ${result.entityCount} entities)`
    );
    manifestFeeds.push({
      id: ALERTS_FEED_ID,
      sizeBytes: result.data.length,
      entityCount: result.entityCount,
      feedTimestamp: result.feedTimestamp,
      hasNyctExtension: result.hasNyctExtension,
    });
    alertCount = 1;
  } catch (error) {
    console.error(
      `✗ Failed to download ${ALERTS_FEED_ID}:`,
      error instanceof Error ? error.message : error
    );
  }

  // Write manifest
  const manifest: FixtureManifest = {
    downloadedAt: new Date().toISOString(),
    source: "real-mta-api",
    feeds: manifestFeeds,
    note: "Real MTA feed fixtures downloaded from the MTA API. Re-record periodically to catch format changes.",
  };
  writeFileSync(join(OUTPUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`\n✓ Generated manifest.json`);

  console.log("\nAll fixtures downloaded successfully!");
  console.log(`Total subway feeds: ${feedCount}/${SUBWAY_FEED_IDS.length}`);
  console.log(`Alerts feeds: ${alertCount}`);
  console.log("\nFixtures are ready for unit tests!");
}

downloadFixtures().catch((error) => {
  console.error("Failed to download fixtures:", error);
  process.exit(1);
});
