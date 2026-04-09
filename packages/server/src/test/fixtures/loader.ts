/**
 * Binary fixture loader for tests.
 *
 * Provides utilities to load binary fixtures from disk for testing.
 * Falls back to synthetic fixtures if disk fixtures are not available.
 */

import { existsSync, readFileSync } from "node:fs";
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
const FIXTURES_DIR = join(__dirname, "feeds");

export type FixtureId =
  | "gtfs"
  | "gtfs-ace"
  | "gtfs-bdfm"
  | "gtfs-g"
  | "gtfs-jz"
  | "gtfs-l"
  | "gtfs-nqrw"
  | "gtfs-si"
  | "nyct-subway-alerts"
  | "edge-empty"
  | "edge-unassigned"
  | "edge-rerouted"
  | "edge-past-arrivals"
  | "edge-deleted"
  | "edge-no-nyct-extension";

export type SyntheticFixtureId =
  | "synthetic-gtfs"
  | "synthetic-gtfs-ace"
  | "synthetic-gtfs-bdfm"
  | "synthetic-gtfs-g"
  | "synthetic-gtfs-jz"
  | "synthetic-gtfs-l"
  | "synthetic-gtfs-nqrw"
  | "synthetic-gtfs-si"
  | "synthetic-alerts";

/**
 * Map from feed ID to synthetic fixture generator
 */
const SYNTHETIC_GENERATORS: Record<SyntheticFixtureId, () => Uint8Array> = {
  "synthetic-gtfs": aDivisionFeed,
  "synthetic-gtfs-ace": bDivisionFeed,
  "synthetic-gtfs-bdfm": bDivisionFeed,
  "synthetic-gtfs-g": bDivisionFeed,
  "synthetic-gtfs-jz": bDivisionFeed,
  "synthetic-gtfs-l": lLineFeed,
  "synthetic-gtfs-nqrw": nqrwFeed,
  "synthetic-gtfs-si": bDivisionFeed,
  "synthetic-alerts": alertsFeed,
};

const EDGE_CASE_GENERATORS: Record<string, () => Uint8Array> = {
  "edge-empty": emptyFeed,
  "edge-unassigned": unassignedTripsFeed,
  "edge-rerouted": reroutedTrackFeed,
  "edge-past-arrivals": pastArrivalsFeed,
  "edge-deleted": deletedEntitiesFeed,
  "edge-no-nyct-extension": noNyctExtensionFeed,
};

/**
 * Check if disk fixtures are available
 */
export function hasDiskFixtures(): boolean {
  return existsSync(join(FIXTURES_DIR, "manifest.json"));
}

/**
 * Load a binary fixture from disk, falling back to synthetic generator.
 *
 * @param fixtureId - The fixture ID (e.g., "gtfs", "edge-empty", "synthetic-gtfs")
 * @returns The fixture data as Uint8Array
 */
export function loadFixture(fixtureId: FixtureId | SyntheticFixtureId): Uint8Array {
  // Try to load from disk first
  const diskPath = join(FIXTURES_DIR, `${fixtureId}.bin`);
  if (existsSync(diskPath)) {
    const buffer = readFileSync(diskPath);
    return new Uint8Array(buffer);
  }

  // Fall back to synthetic generator
  if (fixtureId in SYNTHETIC_GENERATORS) {
    return SYNTHETIC_GENERATORS[fixtureId as SyntheticFixtureId]();
  }

  if (fixtureId in EDGE_CASE_GENERATORS) {
    return EDGE_CASE_GENERATORS[fixtureId]();
  }

  // Map real feed IDs to synthetic generators
  const syntheticId = `synthetic-${fixtureId}` as SyntheticFixtureId;
  if (syntheticId in SYNTHETIC_GENERATORS) {
    return SYNTHETIC_GENERATORS[syntheticId]();
  }

  throw new Error(`Unknown fixture ID: ${fixtureId}`);
}

/**
 * Load multiple fixtures at once.
 */
export function loadFixtures(
  fixtureIds: Array<FixtureId | SyntheticFixtureId>
): Map<string, Uint8Array> {
  const result = new Map<string, Uint8Array>();
  for (const id of fixtureIds) {
    result.set(id, loadFixture(id));
  }
  return result;
}

/**
 * Get all available synthetic feed IDs.
 */
export function getSyntheticFeedIds(): SyntheticFixtureId[] {
  return Object.keys(SYNTHETIC_GENERATORS) as SyntheticFixtureId[];
}

/**
 * Get all available edge case IDs.
 */
export function getEdgeCaseIds(): Array<FixtureId | SyntheticFixtureId> {
  return Object.keys(EDGE_CASE_GENERATORS) as Array<FixtureId | SyntheticFixtureId>;
}

/**
 * Load all synthetic fixtures for parser/transformer testing.
 */
export function loadAllSyntheticFeeds(): Map<string, Uint8Array> {
  return loadFixtures(getSyntheticFeedIds());
}

/**
 * Load all edge case fixtures.
 */
export function loadAllEdgeCases(): Map<string, Uint8Array> {
  return loadFixtures(getEdgeCaseIds());
}
