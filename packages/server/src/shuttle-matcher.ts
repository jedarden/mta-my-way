/**
 * Shuttle bus matcher: matches NO_SERVICE alerts against curated shuttle stop data.
 *
 * When an alert has effect=NO_SERVICE, this module checks whether the affected
 * line and stations overlap with a known suspension segment in shuttle-stops.json.
 * If matched, it returns a ShuttleBusInfo object to attach to the StationAlert.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { ShuttleBusInfo, ShuttleStop } from "@mta-my-way/shared";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A shuttle segment entry from the static JSON lookup */
interface ShuttleSegment {
  lineId: string;
  fromStopId: string;
  toStopId: string;
  fromStation: string;
  toStation: string;
  description: string;
  stops: ShuttleStop[];
  frequencyMinutes: string;
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

let segments: ShuttleSegment[] | null = null;

/** Load shuttle segments from JSON file (cached in memory) */
async function loadSegments(): Promise<ShuttleSegment[]> {
  if (segments) return segments;

  const segmentsPath = join(__dirname, "..", "data", "shuttle-stops.json");
  const content = await readFile(segmentsPath, "utf8");
  segments = JSON.parse(content) as ShuttleSegment[];
  return segments;
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/**
 * Find a matching shuttle segment for a NO_SERVICE alert.
 *
 * Matches when:
 * 1. The alert's affected lines include the segment's line
 * 2. The alert's affected stations overlap with the segment's stop range
 *    (at least one station must fall between fromStopId and toStopId)
 *
 * @param affectedLines - Line IDs from the alert
 * @param affectedStations - Station/stop IDs from the alert's informed entities
 * @returns ShuttleBusInfo if matched, undefined otherwise
 */
export async function matchShuttle(
  affectedLines: string[],
  affectedStations: string[]
): Promise<ShuttleBusInfo | undefined> {
  const loadedSegments = await loadSegments();

  for (const segment of loadedSegments) {
    // Check if any affected line matches the segment
    if (!affectedLines.includes(segment.lineId)) continue;

    // Check if any affected station falls within the segment's stop range
    const hasOverlappingStation = affectedStations.some((stopId) =>
      isStationInRange(stopId, segment.fromStopId, segment.toStopId, segment.lineId)
    );

    if (hasOverlappingStation) {
      return {
        lineId: segment.lineId,
        fromStopId: segment.fromStopId,
        toStopId: segment.toStopId,
        stops: segment.stops,
        frequencyMinutes: segment.frequencyMinutes,
        lastVerified: "2026-03-22",
      };
    }
  }

  return undefined;
}

/**
 * Check if a station stop ID falls within a segment's range.
 *
 * Normalizes stop IDs by stripping direction suffixes (N/S) and
 * compares the base station IDs. The segment's fromStopId and toStopId
 * define the inclusive range boundaries.
 */
function isStationInRange(
  stopId: string,
  fromStopId: string,
  toStopId: string,
  _lineId: string
): boolean {
  // Normalize: strip direction suffixes (N/S) for comparison
  const normalize = (id: string) => id.replace(/[NS]$/, "");

  const normalizedStop = normalize(stopId);
  const normalizedFrom = normalize(fromStopId);
  const normalizedTo = normalize(toStopId);

  // Direct match with either endpoint
  if (normalizedStop === normalizedFrom || normalizedStop === normalizedTo) {
    return true;
  }

  // For GTFS stop IDs that include the line prefix (e.g., "L01", "101N"),
  // strip the line prefix letter for numeric comparison
  const numericId = (id: string) => parseInt(id.replace(/^[A-Z]/, ""), 10);
  const stopNum = numericId(normalizedStop);
  const fromNum = numericId(normalizedFrom);
  const toNum = numericId(normalizedTo);

  if (isNaN(stopNum) || isNaN(fromNum) || isNaN(toNum)) {
    // Non-numeric stop IDs — only match on exact equality (already checked above)
    return false;
  }

  const low = Math.min(fromNum, toNum);
  const high = Math.max(fromNum, toNum);

  return stopNum >= low && stopNum <= high;
}
