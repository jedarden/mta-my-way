#!/usr/bin/env node
/**
 * GTFS Static Data Processing Script
 *
 * Downloads MTA GTFS static data and processes it into optimized JSON files:
 * - stations.json: Station info with parent station grouping, lines, borough, ADA
 * - routes.json: Route metadata with colors, division, feed mapping
 * - transfers.json: Transfer connections with walking times
 * - travel-times.json: Inter-station travel times per route
 * - complexes.json: Station complex groupings
 * - complex-overrides.json: Manual fixes for edge cases
 *
 * Usage: node scripts/process-gtfs.mjs [--skip-download] [--verbose]
 */

import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "fs";
import { pipeline } from "stream/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { parse } from "csv-parse/sync";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, "..");

// Configuration
const GTFS_URLS = {
  base: "https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip",
  supplemented: "https://rrgtfsfeeds.s3.amazonaws.com/gtfs_supplemented.zip",
};

const STATION_COMPLEXES_URL =
  "https://data.ny.gov/download/w7gk-6ysa/application%2Fzip";

const CACHE_DIR = join(ROOT_DIR, ".gtfs-cache");
const DATA_DIR = join(ROOT_DIR, "data");

// Parse command line args
const args = process.argv.slice(2);
const skipDownload = args.includes("--skip-download");
const verbose = args.includes("--verbose") || args.includes("-v");

function log(message) {
  if (verbose) console.log(message);
}

function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Download a file from URL
 */
async function downloadFile(url, dest) {
  log(`Downloading ${url}...`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }
  const fileStream = createWriteStream(dest);
  await pipeline(response.body, fileStream);
  log(`Saved to ${dest}`);
}

/**
 * Extract a zip file using tar module (handles .zip format)
 */
async function extractZip(zipPath, destDir) {
  ensureDir(destDir);
  log(`Extracting ${zipPath} to ${destDir}...`);

  // Use system unzip for reliability
  const { execSync } = await import("child_process");
  execSync(`unzip -o "${zipPath}" -d "${destDir}"`, { stdio: verbose ? "inherit" : "pipe" });

  log(`Extracted to ${destDir}`);
}

/**
 * Read and parse a GTFS CSV file
 */
function readGtfsCsv(dir, filename) {
  const filepath = join(dir, filename);
  if (!existsSync(filepath)) {
    log(`Warning: ${filename} not found in ${dir}`);
    return [];
  }
  const content = readFileSync(filepath, "utf-8");
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
  });
}

/**
 * Normalize hex color to uppercase with # prefix
 */
function normalizeColor(color) {
  if (!color) return "#808183"; // Default gray
  const hex = color.replace(/^#/, "").toUpperCase();
  return `#${hex.padStart(6, "0")}`;
}

/**
 * Determine text color based on background (for contrast)
 */
function getTextColor(bgColor) {
  // Yellow lines (N/Q/R/W) need dark text
  const yellowLines = ["FCCC0A"];
  const hex = bgColor.replace(/^#/, "").toUpperCase();
  if (yellowLines.includes(hex)) {
    return "#000000";
  }
  return "#FFFFFF";
}

/**
 * Infer borough from station name or coordinates
 * NYC Subway Borough Boundaries (approximate):
 * - Staten Island: SIR stations only - lat < 40.66, lon < -74.075
 * - Bronx: lat > 40.8 (north of Manhattan)
 * - Queens: lon > -73.8 (east of Manhattan, less negative longitude)
 * - Brooklyn: lat < 40.72 (south of Manhattan)
 * - Manhattan: default for central NYC area
 */
function inferBorough(name, lat, lon) {
  const nameLower = name.toLowerCase();

  // Check by name first for explicit cases

  // Staten Island (SIR only)
  if (
    nameLower.includes("staten island") ||
    nameLower.includes("st. george") ||
    nameLower.includes("st george") ||
    nameLower.includes("tottenville") ||
    nameLower.includes("great kills") ||
    nameLower.includes("stapleton") ||
    nameLower.includes("clifton") ||
    nameLower.includes("tomkinsville") ||
    nameLower.includes("stapleton")
  ) {
    return "statenisland";
  }

  // Bronx - check name hints and coordinates (north of 40.8)
  if (
    nameLower.includes("bronx") ||
    nameLower.includes("yankee") ||
    nameLower.includes("161 st") ||
    nameLower.includes("149 st") ||
    nameLower.includes("149th") ||
    nameLower.includes("161st") ||
    nameLower.includes("grand concourse") ||
    nameLower.includes("bedford park") ||
    nameLower.includes("fordham") ||
    nameLower.includes("pelham") ||
    nameLower.includes("wakefield") ||
    nameLower.includes("woodlawn")
  ) {
    return "bronx";
  }

  // Queens - check name hints first
  if (
    nameLower.includes("flushing") ||
    nameLower.includes("jamaica") ||
    nameLower.includes("astoria") ||
    nameLower.includes("rockaway") ||
    nameLower.includes("far rockaway") ||
    nameLower.includes("howard beach") ||
    nameLower.includes("ozone park") ||
    nameLower.includes("forest hills") ||
    nameLower.includes("kew gardens") ||
    nameLower.includes("woodside") ||
    nameLower.includes("sunnyside") ||
    nameLower.includes("long island city") ||
    nameLower.includes("ridgewood") ||
    nameLower.includes("corona") ||
    nameLower.includes("elmhurst") ||
    nameLower.includes("jackson heights")
  ) {
    return "queens";
  }

  // Brooklyn - check name hints first
  if (
    nameLower.includes("brooklyn") ||
    nameLower.includes("coney island") ||
    nameLower.includes("brighton") ||
    nameLower.includes("canarsie") ||
    nameLower.includes("bensonhurst") ||
    nameLower.includes("bay ridge") ||
    nameLower.includes("williamsburg") ||
    nameLower.includes("bushwick") ||
    nameLower.includes("flatbush") ||
    nameLower.includes("crown heights") ||
    nameLower.includes("borough park") ||
    nameLower.includes("downtown brooklyn") ||
    nameLower.includes("prospect park") ||
    nameLower.includes("park slope") ||
    nameLower.includes("broadway junction") ||
    nameLower.includes("church av") ||
    nameLower.includes("stillwell") ||
    nameLower.includes("brighton beach") ||
    nameLower.includes("sheepshead") ||
    nameLower.includes("avenue") ||
    nameLower.includes("new utrecht") ||
    nameLower.includes("bath beach")
  ) {
    return "brooklyn";
  }

  // Manhattan - check name hints
  if (
    nameLower.includes("times sq") ||
    nameLower.includes("grand central") ||
    nameLower.includes("penn station") ||
    nameLower.includes("herald sq") ||
    nameLower.includes("union sq") ||
    nameLower.includes("columbus circle") ||
    nameLower.includes("wall st") ||
    nameLower.includes("fulton st") ||
    nameLower.includes("chambers st") ||
    nameLower.includes("city hall") ||
    nameLower.includes("34 st") ||
    nameLower.includes("42 st") ||
    nameLower.includes("59 st") ||
    nameLower.includes("125 st") ||
    nameLower.includes("hudson yards") ||
    nameLower.includes("world trade") ||
    nameLower.includes("soho") ||
    nameLower.includes("greenwich") ||
    nameLower.includes("village")
  ) {
    return "manhattan";
  }

  // Coordinate-based fallback (applied when name doesn't match)
  // Staten Island: far southwest (only the SIR corridor)
  // Most of SI is west of -74.1, but the SIR corridor is around -74.075
  if (lat < 40.66 && lon < -74.075) {
    return "statenisland";
  }

  // Bronx: north of 40.8 degrees latitude
  if (lat > 40.8) {
    return "bronx";
  }

  // Queens: east of Manhattan (longitude > -73.8, i.e., less negative)
  if (lon > -73.8 && lat > 40.55 && lat < 40.82) {
    return "queens";
  }

  // Brooklyn: south of 40.72 degrees latitude, but not as far west as SI
  if (lat < 40.72 && lon >= -74.05) {
    return "brooklyn";
  }

  // Default to Manhattan for central NYC area
  return "manhattan";
}

/**
 * Map route_id to GTFS-RT feed ID
 */
function getFeedId(routeId) {
  const feedMap = {
    // A Division (numbered lines)
    "1": "gtfs", "2": "gtfs", "3": "gtfs", "4": "gtfs", "5": "gtfs",
    "6": "gtfs", "7": "gtfs", "7X": "gtfs", "S": "gtfs", "GS": "gtfs",
    // ACE feed
    "A": "gtfs-ace", "C": "gtfs-ace", "E": "gtfs-ace", "H": "gtfs-ace", "FS": "gtfs-ace",
    // BDFM feed
    "B": "gtfs-bdfm", "D": "gtfs-bdfm", "F": "gtfs-bdfm", "M": "gtfs-bdfm",
    // G feed
    "G": "gtfs-g",
    // JZ feed
    "J": "gtfs-jz", "Z": "gtfs-jz",
    // L feed
    "L": "gtfs-l",
    // NQRW feed
    "N": "gtfs-nqrw", "Q": "gtfs-nqrw", "R": "gtfs-nqrw", "W": "gtfs-nqrw",
    // Staten Island
    "SIR": "gtfs-si",
  };
  return feedMap[routeId] || "gtfs";
}

/**
 * Determine if a route is A Division (numbered) or B Division (lettered)
 */
function getDivision(routeId) {
  const numbered = ["1", "2", "3", "4", "5", "6", "7", "7X", "S", "GS"];
  if (numbered.includes(routeId)) return "A";
  return "B";
}

/**
 * Process stops.txt into stations.json
 */
function processStops(stopsData, tripsData, stopTimesData) {
  log("Processing stops...");

  // Build a map of which routes serve each stop
  const stopToRoutes = new Map();

  // First, build trip_id -> route_id mapping
  const tripToRoute = new Map();
  for (const trip of tripsData) {
    tripToRoute.set(trip.trip_id, trip.route_id);
  }

  // Then, build stop_id -> set of route_ids
  for (const st of stopTimesData) {
    const routeId = tripToRoute.get(st.trip_id);
    if (routeId) {
      const stopId = st.stop_id;
      if (!stopToRoutes.has(stopId)) {
        stopToRoutes.set(stopId, new Set());
      }
      stopToRoutes.get(stopId).add(routeId);
    }
  }

  // Separate parent stations from child stops
  const parentStations = [];
  const childStops = new Map();

  for (const stop of stopsData) {
    const locationType = parseInt(stop.location_type || "0", 10);

    if (locationType === 1) {
      // Parent station
      parentStations.push(stop);
    } else {
      // Child stop (platform)
      childStops.set(stop.stop_id, stop);
    }
  }

  // Build stations index
  const stations = {};

  for (const parent of parentStations) {
    const stationId = parent.stop_id;
    const name = parent.stop_name;
    const lat = parseFloat(parent.stop_lat);
    const lon = parseFloat(parent.stop_lon);

    // Find child stops (N and S platforms)
    let northStopId = null;
    let southStopId = null;
    const allLines = new Set();

    for (const [childId, child] of childStops) {
      if (child.parent_station === stationId) {
        // Determine direction from stop_id suffix
        if (childId.endsWith("N")) {
          northStopId = childId;
        } else if (childId.endsWith("S")) {
          southStopId = childId;
        }

        // Collect routes serving this platform
        const routes = stopToRoutes.get(childId) || new Set();
        for (const r of routes) {
          // Filter out express variants and special routes for station display
          if (!["FX", "BX", "CX", "EP", "ES", "H"].includes(r)) {
            allLines.add(r);
          }
        }
      }
    }

    // Also collect routes from parent station itself
    const parentRoutes = stopToRoutes.get(stationId) || new Set();
    for (const r of parentRoutes) {
      if (!["FX", "BX", "CX", "EP", "ES", "H"].includes(r)) {
        allLines.add(r);
      }
    }

    // ADA status - check if any child stop is wheelchair accessible
    let ada = false;
    for (const [childId, child] of childStops) {
      if (child.parent_station === stationId && child.wheelchair_boarding === "1") {
        ada = true;
        break;
      }
    }

    stations[stationId] = {
      id: stationId,
      name,
      lat,
      lon,
      lines: Array.from(allLines).sort(),
      northStopId: northStopId || `${stationId}N`,
      southStopId: southStopId || `${stationId}S`,
      transfers: [], // Will be populated from transfers.txt
      ada,
      borough: inferBorough(name, lat, lon),
    };
  }

  // Handle orphan child stops (stops without parent_station that serve routes)
  const orphanStops = [];
  for (const [stopId, stop] of childStops) {
    if (!stop.parent_station && stopToRoutes.has(stopId)) {
      // This stop has no parent but serves routes - create a synthetic station
      const routes = stopToRoutes.get(stopId);
      const baseId = stopId.replace(/[NS]$/, "");

      if (!stations[baseId]) {
        orphanStops.push({
          stop,
          stopId,
          baseId,
          routes,
        });
      }
    }
  }

  // Create stations for orphan stops
  for (const { stop, stopId, baseId, routes } of orphanStops) {
    const direction = stopId.endsWith("N") ? "N" : stopId.endsWith("S") ? "S" : null;
    const lat = parseFloat(stop.stop_lat);
    const lon = parseFloat(stop.stop_lon);

    if (!stations[baseId]) {
      stations[baseId] = {
        id: baseId,
        name: stop.stop_name,
        lat,
        lon,
        lines: Array.from(routes).filter(r => !["FX", "BX", "CX", "EP", "ES", "H"].includes(r)).sort(),
        northStopId: direction === "N" ? stopId : `${baseId}N`,
        southStopId: direction === "S" ? stopId : `${baseId}S`,
        transfers: [],
        ada: stop.wheelchair_boarding === "1",
        borough: inferBorough(stop.stop_name, lat, lon),
      };
    }
  }

  log(`Processed ${Object.keys(stations).length} stations`);
  return stations;
}

/**
 * Process routes.txt into routes.json
 */
function processRoutes(routesData, stopTimesData, tripsData) {
  log("Processing routes...");

  // Build route_id -> set of stop_ids
  const routeToStops = new Map();

  // Build trip_id -> route_id mapping
  const tripToRoute = new Map();
  for (const trip of tripsData) {
    tripToRoute.set(trip.trip_id, trip.route_id);
  }

  // Collect stops for each route from stop_times
  for (const st of stopTimesData) {
    const routeId = tripToRoute.get(st.trip_id);
    if (routeId) {
      if (!routeToStops.has(routeId)) {
        routeToStops.set(routeId, new Map()); // stop_sequence -> stop_id
      }
      const stopsMap = routeToStops.get(routeId);
      const seq = parseInt(st.stop_sequence, 10);
      // Keep the stop if we don't have it yet or if this is a lower sequence
      if (!stopsMap.has(st.stop_id) || seq < stopsMap.get(st.stop_id)) {
        stopsMap.set(st.stop_id, seq);
      }
    }
  }

  const routes = {};

  for (const route of routesData) {
    const routeId = route.route_id;

    // Skip non-subway routes (SI ferry, buses, etc.)
    if (["SI", "X", "SB"].some(prefix => routeId.startsWith(prefix))) {
      continue;
    }

    const color = normalizeColor(route.route_color);
    const textColor = route.route_text_color
      ? normalizeColor(route.route_text_color)
      : getTextColor(color);

    // Get ordered stops for this route
    // Strip N/S suffixes to get parent station IDs and deduplicate
    const stopsMap = routeToStops.get(routeId) || new Map();
    const stops = Array.from(stopsMap.keys())
      .map((id) => id.replace(/[NS]$/, ""))
      .filter((id, i, arr) => arr.indexOf(id) === i)
      .sort((a, b) => {
        // Sort by the minimum sequence of either direction's stop
        const seqA = stopsMap.get(a + "N") || stopsMap.get(a + "S") || Infinity;
        const seqB = stopsMap.get(b + "N") || stopsMap.get(b + "S") || Infinity;
        return seqA - seqB;
      });

    routes[routeId] = {
      id: routeId,
      shortName: route.route_short_name || routeId,
      longName: route.route_long_name || "",
      color,
      textColor,
      feedId: getFeedId(routeId),
      division: getDivision(routeId),
      stops,
    };
  }

  log(`Processed ${Object.keys(routes).length} routes`);
  return routes;
}

/**
 * Process transfers.txt into transfer graph
 */
function processTransfers(transfersData, stations) {
  log("Processing transfers...");

  const transferGraph = {};

  for (const t of transfersData) {
    const fromStop = t.from_stop_id;
    const toStop = t.to_stop_id;

    // Get parent station IDs (strip N/S suffix)
    const fromStation = fromStop.replace(/[NS]$/, "");
    const toStation = toStop.replace(/[NS]$/, "");

    // Skip if either station doesn't exist
    if (!stations[fromStation] || !stations[toStation]) {
      continue;
    }

    // Skip self-transfers
    if (fromStation === toStation) {
      continue;
    }

    // Initialize transfer list for from_station
    if (!transferGraph[fromStation]) {
      transferGraph[fromStation] = [];
    }

    // Calculate walking time (min_transfer_time is in seconds)
    const walkingSeconds = parseInt(t.min_transfer_time || "180", 10);

    // Check if transfer already exists
    const existing = transferGraph[fromStation].find(e => e.toStationId === toStation);
    if (existing) {
      // Keep the shorter transfer time
      if (walkingSeconds < existing.walkingSeconds) {
        existing.walkingSeconds = walkingSeconds;
      }
    } else {
      transferGraph[fromStation].push({
        toStationId: toStation,
        toLines: stations[toStation].lines,
        walkingSeconds,
        accessible: false, // Will be updated from equipment data
      });
    }
  }

  // Add transfers to station objects
  for (const [stationId, transfers] of Object.entries(transferGraph)) {
    if (stations[stationId]) {
      stations[stationId].transfers = transfers;
    }
  }

  log(`Processed ${Object.keys(transferGraph).length} transfer stations`);
  return transferGraph;
}

/**
 * Process stop_times.txt to extract inter-station travel times
 */
function processTravelTimes(stopTimesData, tripsData) {
  log("Processing travel times (this may take a moment)...");

  // Build trip_id -> route_id mapping
  const tripToRoute = new Map();
  for (const trip of tripsData) {
    tripToRoute.set(trip.trip_id, trip.route_id);
  }

  // Group stop_times by trip_id and sort by stop_sequence
  const tripStops = new Map();

  for (const st of stopTimesData) {
    const tripId = st.trip_id;
    if (!tripStops.has(tripId)) {
      tripStops.set(tripId, []);
    }
    tripStops.get(tripId).push({
      stopId: st.stop_id,
      sequence: parseInt(st.stop_sequence, 10),
      arrival: st.arrival_time,
      departure: st.departure_time,
    });
  }

  // Sort each trip's stops by sequence
  for (const [tripId, stops] of tripStops) {
    stops.sort((a, b) => a.sequence - b.sequence);
  }

  // Calculate travel times between consecutive stops
  // Key: route_id -> from_stop -> to_stop -> [times]
  const travelTimeSamples = new Map();

  for (const [tripId, stops] of tripStops) {
    const routeId = tripToRoute.get(tripId);
    if (!routeId || stops.length < 2) continue;

    if (!travelTimeSamples.has(routeId)) {
      travelTimeSamples.set(routeId, new Map());
    }
    const routeMap = travelTimeSamples.get(routeId);

    for (let i = 0; i < stops.length - 1; i++) {
      const fromStop = stops[i].stopId;
      const toStop = stops[i + 1].stopId;

      // Parse GTFS time format (HH:MM:SS)
      const parseTime = (t) => {
        if (!t) return null;
        const [h, m, s] = t.split(":").map(Number);
        return h * 3600 + m * 60 + s;
      };

      const arrivalTime = parseTime(stops[i + 1].arrival);
      const departureTime = parseTime(stops[i].departure);

      if (arrivalTime === null || departureTime === null) continue;

      const travelSeconds = arrivalTime - departureTime;

      // Sanity check: travel time should be positive and reasonable (under 10 min)
      if (travelSeconds <= 0 || travelSeconds > 600) continue;

      // Strip direction suffix for parent station
      const fromStation = fromStop.replace(/[NS]$/, "");
      const toStation = toStop.replace(/[NS]$/, "");

      if (!routeMap.has(fromStation)) {
        routeMap.set(fromStation, new Map());
      }
      const fromMap = routeMap.get(fromStation);

      if (!fromMap.has(toStation)) {
        fromMap.set(toStation, []);
      }
      fromMap.get(toStation).push(travelSeconds);
    }
  }

  // Calculate median travel time for each route/segment
  const travelTimes = {};

  for (const [routeId, routeMap] of travelTimeSamples) {
    travelTimes[routeId] = {};

    for (const [fromStop, fromMap] of routeMap) {
      travelTimes[routeId][fromStop] = {};

      for (const [toStop, samples] of fromMap) {
        // Calculate median
        const sorted = samples.sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        travelTimes[routeId][fromStop][toStop] = median;
      }
    }
  }

  log(`Processed travel times for ${Object.keys(travelTimes).length} routes`);
  return travelTimes;
}

/**
 * Process MTA Station Complexes data
 */
async function processComplexes(gtfsDir, stations) {
  log("Processing station complexes...");

  // Try to download and extract the Station Complexes data
  const complexZipPath = join(CACHE_DIR, "station_complexes.zip");
  const complexDir = join(CACHE_DIR, "complexes");

  try {
    await downloadFile(STATION_COMPLEXES_URL, complexZipPath);
    await extractZip(complexZipPath, complexDir);
  } catch (error) {
    log(`Warning: Could not download station complexes: ${error.message}`);
    log("Using fallback complex mapping from GTFS parent_station relationships...");
    return inferComplexesFromGtfs(stations);
  }

  // Find and read the CSV file
  const files = readdirSync(complexDir);
  const csvFile = files.find(f => f.endsWith(".csv"));
  if (!csvFile) {
    log("Warning: No CSV file found in station complexes zip");
    return inferComplexesFromGtfs(stations);
  }

  const complexData = readGtfsCsv(complexDir, csvFile);

  // Build complex index
  const complexes = {};
  const stationToComplex = new Map();

  // The MTA Station Complexes CSV has columns like:
  // Complex ID, Station ID, Stop ID, Division, Line, Stop Name, etc.
  for (const row of complexData) {
    const complexId = row["Complex ID"] || row["complex_id"];
    const stationId = row["Station ID"] || row["station_id"] || row["GTFS Stop ID"];

    if (!complexId || !stationId) continue;

    // Normalize station ID (remove direction suffix if present)
    const normalizedStationId = stationId.replace(/[NS]$/, "");

    if (!stationToComplex.has(normalizedStationId)) {
      stationToComplex.set(normalizedStationId, complexId);
    }

    if (!complexes[complexId]) {
      complexes[complexId] = {
        complexId,
        name: row["Stop Name"] || row["stop_name"] || "",
        stations: [],
        allLines: [],
        allStopIds: [],
      };
    }
  }

  // Group stations by complex
  for (const [stationId, complexId] of stationToComplex) {
    if (complexes[complexId] && stations[stationId]) {
      complexes[complexId].stations.push(stationId);
      complexes[complexId].allLines.push(...stations[stationId].lines);
      complexes[complexId].allStopIds.push(
        stations[stationId].northStopId,
        stations[stationId].southStopId
      );
    }
  }

  // Deduplicate and sort
  for (const complexId in complexes) {
    complexes[complexId].allLines = [...new Set(complexes[complexId].allLines)].sort();
    complexes[complexId].allStopIds = [...new Set(complexes[complexId].allStopIds)].sort();
  }

  // Update station complex references
  for (const [stationId, complexId] of stationToComplex) {
    if (stations[stationId]) {
      stations[stationId].complex = complexId;
    }
  }

  log(`Processed ${Object.keys(complexes).length} station complexes`);
  return complexes;
}

/**
 * Fallback: Infer complexes from GTFS parent_station relationships
 * This groups stations that share the same name but have different IDs
 */
function inferComplexesFromGtfs(stations) {
  log("Inferring complexes from station names...");

  const complexes = {};
  const nameToComplex = new Map();

  // Group stations by normalized name
  for (const [stationId, station] of Object.entries(stations)) {
    // Normalize name for grouping
    const normalizedName = station.name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .replace(/ststation/g, "st")
      .replace(/aveavenue/g, "av");

    if (!nameToComplex.has(normalizedName)) {
      nameToComplex.set(normalizedName, []);
    }
    nameToComplex.get(normalizedName).push(stationId);
  }

  // Create complexes for stations with multiple IDs sharing the same name
  let complexCounter = 1;
  for (const [name, stationIds] of nameToComplex) {
    if (stationIds.length > 1) {
      const complexId = `C${String(complexCounter).padStart(3, "0")}`;
      complexCounter++;

      const allLines = new Set();
      const allStopIds = new Set();

      for (const sid of stationIds) {
        stations[sid].lines.forEach(l => allLines.add(l));
        allStopIds.add(stations[sid].northStopId);
        allStopIds.add(stations[sid].southStopId);
        stations[sid].complex = complexId;
      }

      complexes[complexId] = {
        complexId,
        name: stations[stationIds[0]].name,
        stations: stationIds,
        allLines: [...allLines].sort(),
        allStopIds: [...allStopIds].sort(),
      };
    }
  }

  log(`Inferred ${Object.keys(complexes).length} station complexes`);
  return complexes;
}

/**
 * Create complex overrides for known edge cases
 */
function createComplexOverrides() {
  log("Creating complex overrides...");

  // These are well-known complex stations that need manual mapping
  // due to inconsistencies in MTA data
  const overrides = {
    // Times Square / 42nd Street complex
    "times_sq_42": {
      name: "Times Sq-42 St",
      stations: ["725", "726", "901", "902", "903"],
      notes: "Combines 1/2/3, 7, N/Q/R/W, and S platforms",
    },
    // Fulton Street / Broadway-Nassau complex
    "fulton_broadway": {
      name: "Fulton St-Broadway/Nassau",
      stations: ["230", "231", "422", "423"],
      notes: "Combines A/C, J/Z, 2/3, 4/5 platforms",
    },
    // 14th Street / Union Square complex
    "14th_union_sq": {
      name: "14 St-Union Sq",
      stations: ["326", "346", "351", "635"],
      notes: "Combines L, N/Q/R/W, 4/5/6 platforms",
    },
    // Atlantic Avenue / Barclays Center complex
    "atlantic_ave": {
      name: "Atlantic Av-Barclays Ctr",
      stations: ["245", "246", "247", "248", "249", "250", "251", "421", "629"],
      notes: "Combines B/D/N/Q/R/2/3/4/5 and LIRR platforms",
    },
    // Lexington Ave / 59th Street complex
    "lex_59": {
      name: "Lexington Av/59 St",
      stations: ["322", "411", "412"],
      notes: "Combines 4/5/6 and N/Q/R platforms",
    },
    // Lexington Ave / 53rd Street complex
    "lex_53": {
      name: "Lexington Av/53 St",
      stations: ["321", "625"],
      notes: "Combines 6 and E/M platforms",
    },
    // Jay Street / MetroTech complex
    "jay_metrotech": {
      name: "Jay St-MetroTech",
      stations: ["243", "443"],
      notes: "Combines A/C/F and R platforms",
    },
    // Court Square complex
    "court_sq": {
      name: "Court Sq",
      stations: ["464", "465", "745"],
      notes: "Combines 7, E/M, and G platforms",
    },
    // Roosevelt Avenue / 74th Street complex
    "roosevelt_74": {
      name: "Roosevelt Av/74 St",
      stations: ["701", "746"],
      notes: "Combines 7 and E/F/M/R platforms",
    },
  };

  return overrides;
}

/**
 * Main processing function
 */
async function main() {
  console.log("MTA GTFS Static Data Processor");
  console.log("================================\n");

  ensureDir(CACHE_DIR);
  ensureDir(DATA_DIR);

  const baseDir = join(CACHE_DIR, "base");
  const suppDir = join(CACHE_DIR, "supplemented");

  // Step 1: Download GTFS files
  if (!skipDownload) {
    console.log("Step 1: Downloading GTFS files...");

    const baseZipPath = join(CACHE_DIR, "gtfs_subway.zip");
    const suppZipPath = join(CACHE_DIR, "gtfs_supplemented.zip");

    await downloadFile(GTFS_URLS.base, baseZipPath);
    await downloadFile(GTFS_URLS.supplemented, suppZipPath);

    await extractZip(baseZipPath, baseDir);
    await extractZip(suppZipPath, suppDir);

    console.log("Download complete.\n");
  } else {
    console.log("Step 1: Skipping download (--skip-download flag)\n");
  }

  // Step 2: Read GTFS files (prefer supplemented for stop_times, base for stops/routes)
  console.log("Step 2: Reading GTFS files...");

  // Use supplemented for all files (it includes 7-day service changes)
  const gtfsDir = existsSync(join(suppDir, "stops.txt")) ? suppDir : baseDir;

  const stopsData = readGtfsCsv(gtfsDir, "stops.txt");
  const routesData = readGtfsCsv(gtfsDir, "routes.txt");
  const tripsData = readGtfsCsv(gtfsDir, "trips.txt");
  const stopTimesData = readGtfsCsv(gtfsDir, "stop_times.txt");
  const transfersData = readGtfsCsv(gtfsDir, "transfers.txt");

  log(`Read ${stopsData.length} stops`);
  log(`Read ${routesData.length} routes`);
  log(`Read ${tripsData.length} trips`);
  log(`Read ${stopTimesData.length} stop_times`);
  log(`Read ${transfersData.length} transfers`);

  console.log("Files loaded.\n");

  // Step 3: Process each data type
  console.log("Step 3: Processing data...");

  const stations = processStops(stopsData, tripsData, stopTimesData);
  const routes = processRoutes(routesData, stopTimesData, tripsData);
  const transferGraph = processTransfers(transfersData, stations);
  const travelTimes = processTravelTimes(stopTimesData, tripsData);
  const complexes = await processComplexes(gtfsDir, stations);
  const complexOverrides = createComplexOverrides();

  console.log("Processing complete.\n");

  // Step 4: Write output files
  console.log("Step 4: Writing output files...");

  writeFileSync(
    join(DATA_DIR, "stations.json"),
    JSON.stringify(stations, null, 2)
  );
  console.log(`  stations.json: ${Object.keys(stations).length} stations`);

  writeFileSync(
    join(DATA_DIR, "routes.json"),
    JSON.stringify(routes, null, 2)
  );
  console.log(`  routes.json: ${Object.keys(routes).length} routes`);

  writeFileSync(
    join(DATA_DIR, "transfers.json"),
    JSON.stringify(transferGraph, null, 2)
  );
  console.log(`  transfers.json: ${Object.keys(transferGraph).length} transfer hubs`);

  writeFileSync(
    join(DATA_DIR, "travel-times.json"),
    JSON.stringify(travelTimes, null, 2)
  );
  console.log(`  travel-times.json: ${Object.keys(travelTimes).length} routes`);

  writeFileSync(
    join(DATA_DIR, "complexes.json"),
    JSON.stringify(complexes, null, 2)
  );
  console.log(`  complexes.json: ${Object.keys(complexes).length} complexes`);

  writeFileSync(
    join(DATA_DIR, "complex-overrides.json"),
    JSON.stringify(complexOverrides, null, 2)
  );
  console.log(`  complex-overrides.json: ${Object.keys(complexOverrides).length} overrides`);

  console.log("\n================================");
  console.log("GTFS processing complete!");
  console.log(`Output files written to: ${DATA_DIR}`);
  console.log("================================");

  // Print summary
  const stationCount = Object.keys(stations).length;
  const expectedStations = 472;

  if (stationCount < expectedStations - 10) {
    console.log(`\n⚠️  Warning: Found ${stationCount} stations, expected ~${expectedStations}`);
  } else if (stationCount >= expectedStations - 10 && stationCount <= expectedStations + 10) {
    console.log(`\n✓ Station count: ${stationCount} (expected ~${expectedStations})`);
  } else {
    console.log(`\n✓ Station count: ${stationCount}`);
  }
}

// Run
main().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
