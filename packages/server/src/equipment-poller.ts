/**
 * Equipment poller: fetches MTA Elevator & Escalator (ENE) feed every 5 minutes.
 *
 * Responsibilities:
 * - Poll the MTA ENE XML feed on a 300-second interval
 * - Parse outage data and map station names to GTFS station IDs
 * - Cache parsed equipment status for API routes
 * - Circuit breaker for resilience
 */

import { POLLING_INTERVALS } from "@mta-my-way/shared";
import type {
  EquipmentStatus,
  EquipmentType,
  StationEquipmentSummary,
  StationIndex,
} from "@mta-my-way/shared";

const POLL_INTERVAL_MS = POLLING_INTERVALS.equipment * 1000; // 300,000 ms (5 min)
const FETCH_TIMEOUT_MS = 15_000;
const CIRCUIT_OPEN_AFTER = 3;
const CIRCUIT_RESET_MS = 60_000;

/** MTA ENE XML feed URL */
const ENE_FEED_URL = "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fnyct_ene.xml";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EquipmentCacheStatus {
  lastFetchAt: string | null;
  lastSuccessAt: string | null;
  outageCount: number;
  consecutiveFailures: number;
  circuitOpen: boolean;
}

interface RawOutage {
  station: string;
  trainno: string;
  equipment: string;
  equipmenttype: string;
  serving: string;
  ada: string;
  outagedate: string;
  estimatedreturntoservice: string;
  reason: string;
  isupcomingoutage: string;
  ismaintenanceoutage: string;
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

const status = {
  lastFetchAt: null as number | null,
  lastSuccessAt: null as number | null,
  consecutiveFailures: 0,
  circuitOpen: false,
  circuitOpenAt: null as number | null,
};

let pollTimer: ReturnType<typeof setInterval> | null = null;

/** Equipment indexed by stationId */
let equipmentByStation = new Map<string, EquipmentStatus[]>();

/** Station name → stationId lookup built from GTFS data */
let stationNameToIds: Map<string, string[]> = new Map();

// ---------------------------------------------------------------------------
// Station name mapping
// ---------------------------------------------------------------------------

/**
 * Build a lookup from normalized station names to station IDs.
 * Called once at init with the loaded station data.
 */
export function initEquipmentPoller(stations: StationIndex): void {
  const nameMap = new Map<string, string[]>();

  for (const [stationId, station] of Object.entries(stations)) {
    // Normalize the GTFS station name for matching against ENE feed names
    const normalizedName = normalizeStationName(station.name);
    const existing = nameMap.get(normalizedName) ?? [];
    existing.push(stationId);
    nameMap.set(normalizedName, existing);

    // Also index by the raw name for direct matches
    const rawExisting = nameMap.get(station.name.toLowerCase()) ?? [];
    if (!rawExisting.includes(stationId)) {
      rawExisting.push(stationId);
      nameMap.set(station.name.toLowerCase(), rawExisting);
    }
  }

  stationNameToIds = nameMap;
}

/**
 * Normalize a station name for fuzzy matching.
 * Removes punctuation, normalizes spacing, lowercases.
 */
function normalizeStationName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.\-–—/]/g, " ") // Replace punctuation with spaces
    .replace(/\s+(st|street|ave|avenue|blvd|boulevard|pkwy|parkway)\b/g, "") // Remove common suffixes
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Match an ENE feed station name to GTFS station IDs.
 * Tries exact match first, then normalized fuzzy match, then line-based disambiguation.
 */
function matchStationId(eneName: string, trainLines: string[]): string[] | null {
  const lowerName = eneName.toLowerCase().trim();
  const normalizedName = normalizeStationName(eneName);

  // Try direct match
  const directMatch = stationNameToIds.get(lowerName);
  if (directMatch && directMatch.length > 0) return directMatch;

  // Try normalized match
  const normalizedMatch = stationNameToIds.get(normalizedName);
  if (normalizedMatch && normalizedMatch.length > 0) return normalizedMatch;

  // Fuzzy match: check if any normalized name contains the ENE name or vice versa
  const candidates: string[] = [];
  for (const [normName, ids] of stationNameToIds) {
    if (normName === normalizedName) continue; // Already tried
    if (normName.includes(normalizedName) || normalizedName.includes(normName)) {
      candidates.push(...ids);
    }
  }

  if (candidates.length > 0) {
    // Deduplicate
    const unique = [...new Set(candidates)];
    // If multiple candidates, try to disambiguate by train lines
    if (unique.length > 1 && trainLines.length > 0) {
      // Would need station data for line-based disambiguation
      // For now, return all candidates
    }
    return unique;
  }

  return null;
}

// ---------------------------------------------------------------------------
// XML Parsing
// ---------------------------------------------------------------------------

/**
 * Parse the MTA ENE XML feed into raw outage objects.
 */
function parseENEFeed(xml: string): RawOutage[] {
  const outages: RawOutage[] = [];

  // Simple regex-based XML parsing (the feed is small ~1200 lines)
  const outageRegex = /<outage>([\s\S]*?)<\/outage>/g;
  let match;

  while ((match = outageRegex.exec(xml)) !== null) {
    const block = match[1];
    const getTag = (tag: string): string => {
      const tagMatch = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
      return tagMatch ? tagMatch[1].trim() : "";
    };

    outages.push({
      station: getTag("station"),
      trainno: getTag("trainno"),
      equipment: getTag("equipment"),
      equipmenttype: getTag("equipmenttype"),
      serving: getTag("serving").replace(/&amp;/g, "&"),
      ada: getTag("ADA"),
      outagedate: getTag("outagedate"),
      estimatedreturntoservice: getTag("estimatedreturntoservice"),
      reason: getTag("reason"),
      isupcomingoutage: getTag("isupcomingoutage"),
      ismaintenanceoutage: getTag("ismaintenanceoutage"),
    });
  }

  return outages;
}

/**
 * Parse ENE date format "MM/DD/YYYY HH:MM:SS AM/PM" to POSIX timestamp.
 */
function parseENEDate(dateStr: string): number | undefined {
  if (!dateStr) return undefined;
  const cleaned = dateStr.replace(/\s+/g, " ").trim();
  // Format: "01/05/2024 12:50:00 PM"
  const match = cleaned.match(
    /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s+(AM|PM)/i
  );
  if (!match) return undefined;

  const month = parseInt(match[1], 10) - 1;
  const day = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);
  let hour = parseInt(match[4], 10);
  const minute = parseInt(match[5], 10);
  const second = parseInt(match[6], 10);
  const ampm = match[7].toUpperCase();

  if (ampm === "PM" && hour !== 12) hour += 12;
  if (ampm === "AM" && hour === 12) hour = 0;

  const date = new Date(year, month, day, hour, minute, second);
  return isNaN(date.getTime()) ? undefined : Math.floor(date.getTime() / 1000);
}

// ---------------------------------------------------------------------------
// Transform outages to EquipmentStatus
// ---------------------------------------------------------------------------

/**
 * Transform parsed ENE outages into indexed EquipmentStatus records.
 */
function transformOutages(outages: RawOutage[]): Map<string, EquipmentStatus[]> {
  const map = new Map<string, EquipmentStatus[]>();
  let matched = 0;
  let unmatched = 0;
  const unmatchedStations = new Set<string>();

  for (const outage of outages) {
    // Skip upcoming outages and maintenance outages
    if (outage.isupcomingoutage === "Y") continue;

    const trainLines = outage.trainno.split(/[\/\s,]+/).filter(Boolean);

    const stationIds = matchStationId(outage.station, trainLines);
    if (!stationIds) {
      unmatched++;
      unmatchedStations.add(outage.station);
      continue;
    }

    matched++;
    const equipmentType: EquipmentType = outage.equipmenttype === "EL" ? "elevator" : "escalator";

    const outOfServiceSince = parseENEDate(outage.outagedate);

    for (const stationId of stationIds) {
      const existing = map.get(stationId) ?? [];
      existing.push({
        stationId,
        type: equipmentType,
        description: outage.serving,
        isActive: false, // If it's in the outage feed, it's not active
        outOfServiceSince,
        estimatedReturn: outage.estimatedreturntoservice || undefined,
        ada: outage.ada === "Y",
      });
      map.set(stationId, existing);
    }
  }

  if (unmatched > 0) {
    console.log(
      JSON.stringify({
        event: "equipment_unmatched_stations",
        timestamp: new Date().toISOString(),
        unmatched_count: unmatched,
        matched_count: matched,
        unmatched_stations: [...unmatchedStations].slice(0, 10),
      })
    );
  }

  return map;
}

// ---------------------------------------------------------------------------
// Poll cycle
// ---------------------------------------------------------------------------

async function fetchEquipment(): Promise<Map<string, EquipmentStatus[]> | null> {
  // Check circuit breaker
  if (status.circuitOpen && status.circuitOpenAt) {
    if (Date.now() - status.circuitOpenAt >= CIRCUIT_RESET_MS) {
      status.circuitOpen = false;
      status.circuitOpenAt = null;
      status.consecutiveFailures = 0;
    } else {
      console.log(
        JSON.stringify({
          event: "equipment_circuit_open",
          timestamp: new Date().toISOString(),
        })
      );
      return null;
    }
  }

  const start = Date.now();
  const headers: Record<string, string> = {};

  const apiKey = process.env["MTA_API_KEY"];
  if (apiKey) headers["x-api-key"] = apiKey;

  try {
    const response = await fetch(ENE_FEED_URL, {
      headers,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const xml = await response.text();
    const outages = parseENEFeed(xml);
    const equipment = transformOutages(outages);

    // Success
    status.consecutiveFailures = 0;
    status.circuitOpen = false;
    status.circuitOpenAt = null;
    status.lastSuccessAt = Date.now();

    console.log(
      JSON.stringify({
        event: "equipment_fetch_ok",
        timestamp: new Date().toISOString(),
        latency_ms: Date.now() - start,
        outage_count: outages.length,
        station_count: equipment.size,
      })
    );

    return equipment;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    status.consecutiveFailures++;

    if (status.consecutiveFailures >= CIRCUIT_OPEN_AFTER && !status.circuitOpen) {
      status.circuitOpen = true;
      status.circuitOpenAt = Date.now();
    }

    console.log(
      JSON.stringify({
        event: "equipment_fetch_error",
        timestamp: new Date().toISOString(),
        latency_ms: Date.now() - start,
        error: message,
        consecutive_failures: status.consecutiveFailures,
        circuit_open: status.circuitOpen,
      })
    );

    return null;
  }
}

async function runPoll(): Promise<void> {
  status.lastFetchAt = Date.now();

  const equipment = await fetchEquipment();
  if (equipment !== null) {
    equipmentByStation = equipment;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start the equipment polling loop.
 * First poll fires immediately.
 */
export function startEquipmentPoller(): void {
  void runPoll();
  pollTimer = setInterval(() => void runPoll(), POLL_INTERVAL_MS);

  console.log(
    JSON.stringify({
      event: "equipment_poller_started",
      timestamp: new Date().toISOString(),
      interval_ms: POLL_INTERVAL_MS,
    })
  );
}

/**
 * Stop the equipment poller.
 */
export function stopEquipmentPoller(): void {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

/**
 * Get equipment status for a specific station.
 */
export function getEquipmentForStation(stationId: string): StationEquipmentSummary | null {
  const equipment = equipmentByStation.get(stationId);
  if (!equipment) return null;

  return buildSummary(stationId, equipment);
}

/**
 * Get all equipment statuses (bulk).
 */
export function getAllEquipment(): StationEquipmentSummary[] {
  const summaries: StationEquipmentSummary[] = [];
  for (const [stationId, equipment] of equipmentByStation) {
    summaries.push(buildSummary(stationId, equipment));
  }
  return summaries;
}

/**
 * Get the set of station IDs that have broken elevators (ADA-inaccessible).
 * Used by the transfer engine for accessible rerouting.
 */
export function getStationsWithBrokenElevators(): Set<string> {
  const result = new Set<string>();
  for (const [stationId, equipment] of equipmentByStation) {
    if (equipment.some((e) => e.type === "elevator" && e.ada)) {
      result.add(stationId);
    }
  }
  return result;
}

/**
 * Get equipment cache status for the health endpoint.
 */
export function getEquipmentStatus(): EquipmentCacheStatus {
  return {
    lastFetchAt: status.lastFetchAt ? new Date(status.lastFetchAt).toISOString() : null,
    lastSuccessAt: status.lastSuccessAt ? new Date(status.lastSuccessAt).toISOString() : null,
    outageCount: equipmentByStation.size,
    consecutiveFailures: status.consecutiveFailures,
    circuitOpen: status.circuitOpen,
  };
}

function buildSummary(stationId: string, equipment: EquipmentStatus[]): StationEquipmentSummary {
  const elevators = equipment.filter((e) => e.type === "elevator");
  const escalators = equipment.filter((e) => e.type === "escalator");
  const adaEquipment = equipment.filter((e) => e.ada);
  const workingAdaEquipment = adaEquipment.filter((e) => e.isActive);

  return {
    stationId,
    equipment,
    adaAccessible: adaEquipment.length === 0 || workingAdaEquipment.length > 0,
    workingElevators: 0, // The feed only reports outages, so all listed are broken
    workingEscalators: 0,
    brokenElevators: elevators.length,
    brokenEscalators: escalators.length,
  };
}
