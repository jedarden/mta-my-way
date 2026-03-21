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
 * - ada-stations.json: ADA-accessible station IDs (manually curated)
 *
 * Usage: node scripts/process-gtfs.mjs [--skip-download] [--verbose]
 *
 * Idempotent: safe to re-run when MTA updates data.
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
 * Official MTA route colors (from the MTA's published palette).
 * The GTFS route_color field has shifted over time; these are the canonical values.
 */
const MTA_ROUTE_COLORS = {
  "1": { color: "#EE352E", textColor: "#FFFFFF" },
  "2": { color: "#EE352E", textColor: "#FFFFFF" },
  "3": { color: "#EE352E", textColor: "#FFFFFF" },
  "4": { color: "#00933C", textColor: "#FFFFFF" },
  "5": { color: "#00933C", textColor: "#FFFFFF" },
  "6": { color: "#00933C", textColor: "#FFFFFF" },
  "6X": { color: "#00933C", textColor: "#FFFFFF" },
  "7": { color: "#B933AD", textColor: "#FFFFFF" },
  "7X": { color: "#B933AD", textColor: "#FFFFFF" },
  "S": { color: "#808183", textColor: "#FFFFFF" },
  "GS": { color: "#808183", textColor: "#FFFFFF" },
  "A": { color: "#0039A6", textColor: "#FFFFFF" },
  "C": { color: "#0039A6", textColor: "#FFFFFF" },
  "E": { color: "#0039A6", textColor: "#FFFFFF" },
  "H": { color: "#808183", textColor: "#FFFFFF" },
  "FS": { color: "#808183", textColor: "#FFFFFF" },
  "B": { color: "#FF6319", textColor: "#FFFFFF" },
  "D": { color: "#FF6319", textColor: "#FFFFFF" },
  "F": { color: "#FF6319", textColor: "#FFFFFF" },
  "FX": { color: "#FF6319", textColor: "#FFFFFF" },
  "M": { color: "#FF6319", textColor: "#FFFFFF" },
  "G": { color: "#6CBE45", textColor: "#FFFFFF" },
  "J": { color: "#996633", textColor: "#FFFFFF" },
  "Z": { color: "#996633", textColor: "#FFFFFF" },
  "L": { color: "#A7A9AC", textColor: "#FFFFFF" },
  "N": { color: "#FCCC0A", textColor: "#000000" },
  "Q": { color: "#FCCC0A", textColor: "#000000" },
  "R": { color: "#FCCC0A", textColor: "#000000" },
  "W": { color: "#FCCC0A", textColor: "#000000" },
  "SIR": { color: "#1D2F6F", textColor: "#FFFFFF" },
};

/**
 * Map route_id to GTFS-RT feed ID
 */
const FEED_MAP = {
  // A Division (numbered lines)
  "1": "gtfs", "2": "gtfs", "3": "gtfs", "4": "gtfs", "5": "gtfs",
  "6": "gtfs", "6X": "gtfs", "7": "gtfs", "7X": "gtfs", "S": "gtfs", "GS": "gtfs",
  // ACE feed
  "A": "gtfs-ace", "C": "gtfs-ace", "E": "gtfs-ace", "H": "gtfs-ace", "FS": "gtfs-ace",
  // BDFM feed
  "B": "gtfs-bdfm", "D": "gtfs-bdfm", "F": "gtfs-bdfm", "FX": "gtfs-bdfm", "M": "gtfs-bdfm",
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

/** A Division routes (numbered lines + shuttles) */
const A_DIVISION_ROUTES = new Set([
  "1", "2", "3", "4", "5", "6", "6X", "7", "7X", "S", "GS",
]);

/** Routes to exclude from station line lists (internal/shuttle variants) */
const EXCLUDED_LINE_VARIANTS = new Set(["FX", "BX", "CX", "EP", "ES"]);

/** Default transfer walking time in seconds */
const DEFAULT_TRANSFER_SECONDS = 180;

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
 * Extract a zip file using system unzip
 */
async function extractZip(zipPath, destDir) {
  ensureDir(destDir);
  log(`Extracting ${zipPath} to ${destDir}...`);
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
 * Load ADA station overrides from data/ada-stations.json.
 * Returns a Set of parent station IDs that are ADA accessible.
 * The MTA GTFS feed does not include wheelchair_boarding, so we maintain
 * this list manually based on the MTA's published accessibility data.
 * Source: https://new.mta.info/accessibility/stations
 */
function loadAdaOverrides(stations) {
  const adaPath = join(DATA_DIR, "ada-stations.json");
  if (existsSync(adaPath)) {
    const data = JSON.parse(readFileSync(adaPath, "utf-8"));
    if (Array.isArray(data)) {
      log(`Loaded ${data.length} ADA station overrides from ada-stations.json`);
      return new Set(data);
    }
  }

  // Fallback: generate initial ADA stations list using known accessible station names.
  // This is an approximation — the file should be curated against the official MTA list.
  log("No ada-stations.json found, generating initial list from known accessible stations...");

  const adaNames = new Set([
    // Manhattan — 1/2/3 line
    "South Ferry", "Whitehall St", "Rector St",
    "Fulton St", "Park Place", "Chambers St",
    "14 St", "18 St", "23 St",
    "34 St-Penn Station", "42 St-Port Authority Bus Terminal",
    "Times Sq-42 St", "50 St", "59 St-Columbus Circle",
    "72 St", "86 St", "96 St",
    "103 St", "110 St", "116 St-Columbia University",
    "Cathedral Pkwy (110 St)", "125 St", "137 St-City College",
    "145 St", "168 St-Washington Hts", "181 St",
    "190 St", "Dyckman St", "Inwood-207 St",
    // Manhattan — 4/5/6 line
    "Grand Central-42 St", "86 St-York St",
    "125 St", "138 St-Grand Concourse",
    // Manhattan — 7 line
    "34 St-Hudson Yards", "Times Sq-42 St",
    "Grand Central-42 St", "5 Av",
    // Manhattan — A/C/E line
    "Canal St", "Spring St", "W 4 St-Wash Sq",
    "14 St", "34 St-Penn Station", "42 St-Port Authority Bus Terminal",
    "125 St", "168 St-Washington Hts", "190 St",
    "Dyckman St", "Inwood-207 St",
    // Manhattan — B/D/F/M line
    "47-50 Sts-Rockefeller Ctr", "34 St-Herald Sq",
    "W 4 St-Wash Sq", "Broadway-Lafayette", "2 Av",
    // Manhattan — N/Q/R/W line
    "Canal St", "City Hall", "Rector St",
    "Times Sq-42 St", "57 St-7 Av",
    "Lexington Av/59 St", "86 St-York St",
    // Manhattan — L line
    "8 Av", "6 Av", "14 St-Union Sq", "3 Av",
    // Manhattan — cross-line
    "Bowling Green", "34 St-Hudson Yards",
    // Brooklyn
    "Atlantic Av-Barclays Ctr", "Jay St-MetroTech", "Borough Hall",
    "DeKalb Av", "Nevins St", "Hoyt-Schermerhorn Sts",
    "Nostrand Av", "Kingston-Throop Av", "Utica Av",
    "Sutter Av-Rutland Rd", "Ralph Av", "Rockaway Av",
    "Junius St", "Pennsylvania Av", "Van Siclen Av", "New Lots Av",
    "Prospect Park", "Botanic Garden", "Church Av",
    "Beverley Rd", "Newkirk Av", "Flatbush Av-Bkln College",
    "Avenue H", "Avenue J", "Avenue M", "Avenue U",
    "Bay Ridge-95 St",
    "4 Av-9 St", "7 Av", "15 St-Prospect Park",
    "Fort Hamilton Pkwy", "Smith-9 Sts",
    "Church Av", "Beverley Rd", "Cortelyou Rd",
    "Coney Island-Stillwell Av", "Broadway Junction",
    // Queens
    "Flushing-Main St", "Mets-Willets Point",
    "Jamaica-179 St", "169 St",
    "Sutphin Blvd-Archer Av", "Jamaica Center-Parsons/Archer",
    "Jackson Hts-Roosevelt Av", "74 St-Broadway",
    "82 St-Jackson Hts", "90 St-Elmhurst Av",
    "Woodside-61 St", "46 St", "52 St", "Northern Blvd",
    "39 Av-Dutch Kills", "36 Av", "33 St-Rawson St",
    "30 Av", "Broadway", "Astoria Blvd", "Astoria-Ditmars Blvd",
    "Court Sq", "Queens Plaza",
    "Hunters Point Av", "Long Island City",
    "Howard Beach-JFK Airport", "Broad Channel",
    "Rockaway Blvd", "Aqueduct Racetrack", "Ozone Park-Lefferts Blvd",
    "Forest Hills-71 Av", "Kew Gardens-Union Tpke",
    "67 Av", "63 Dr-Rego Park", "Woodhaven Blvd",
    // Bronx
    "161 St-Yankee Stadium", "167 St",
    "149 St-Grand Concourse", "3 Av-149 St",
    "Fordham Rd", "Pelham Bay Park",
    // Staten Island (entire line is ADA accessible)
    "St. George", "Tomkinsville", "Stapleton", "Clifton",
    "Grasmere", "Old Town", "Dongan Hills", "Grant City",
    "Great Kills", "Eltingville", "Annadale", "Huguenot",
    "Pleasant Plains", "Tottenville",
  ]);

  const adaIds = new Set();
  for (const [id, station] of Object.entries(stations)) {
    if (adaNames.has(station.name)) {
      adaIds.add(id);
    }
  }

  log(`Generated ${adaIds.size} ADA station IDs from name matching`);

  // Write initial file so it can be manually curated
  const sortedIds = [...adaIds].sort();
  writeFileSync(
    join(DATA_DIR, "ada-stations.json"),
    JSON.stringify(sortedIds, null, 2) + "\n"
  );
  log(`Wrote initial ada-stations.json (${sortedIds.length} stations)`);
  log("NOTE: Review and curate this list against the official MTA accessibility data:");
  log("      https://new.mta.info/accessibility/stations");

  return adaIds;
}

/**
 * Infer borough from station name or coordinates.
 *
 * Strategy: check name first for unambiguous cases, then use coordinates
 * as a fallback. The coordinate boundaries are approximate.
 *
 * Note: some stations (e.g., complex stations like 125 St) have parts in
 * multiple boroughs. We assign based on the station's primary location.
 */
function inferBorough(name, lat, lon) {
  const n = name.toLowerCase();

  // --- Staten Island (SIR corridor) ---
  if (
    n.includes("staten island") ||
    n.includes("st. george") ||
    n === "st george" ||
    n.includes("tottenville") ||
    n.includes("great kills") ||
    n.includes("stapleton") ||
    n.includes("clifton") ||
    n.includes("tomkinsville") ||
    n.includes("grasmere") ||
    n.includes("dongan hills") ||
    n.includes("grant city") ||
    n.includes("eltingville") ||
    n.includes("annadale") ||
    n.includes("huguenot") ||
    n.includes("pleasant plains")
  ) {
    return "statenisland";
  }

  // --- Bronx (north of Manhattan) ---
  if (
    n.includes("bronx") ||
    n.includes("yankee") ||
    n.includes("pelham") ||
    n.includes("wakefield") ||
    n.includes("woodlawn") ||
    n.includes("fordham") ||
    n.includes("bedford park") ||
    n.includes("grand concourse") ||
    n.includes("161 st") ||
    n.includes("161st") ||
    n.includes("149 st") ||
    n.includes("149th") ||
    n.includes("e 149") ||
    n.includes("van cortlandt") ||
    n.includes("kingsbridge") ||
    n.includes("mosholu") ||
    n.includes("norwood") ||
    n.includes("burke av") ||
    n.includes("allerton") ||
    n.includes("gun hill") ||
    n.includes("baychester") ||
    n.includes("co-op city") ||
    // Bronx stations on 5 train East
    n.includes("e 180") ||
    n.includes("west farms") ||
    n.includes("freeman") ||
    n.includes("simpson") ||
    n.includes("intervale") ||
    // Bronx stations on D train
    n.includes("mt eden") ||
    // Bronx stations on 6 train Pelham
    n.includes("buhre") ||
    n.includes("middletown") ||
    n.includes("westchester sq") ||
    n.includes("zerega") ||
    n.includes("castle hill") ||
    n.includes("parkchester") ||
    n.includes("st lawrence") ||
    n.includes("morrison") ||
    n.includes("soundview") ||
    n.includes("elder av") ||
    n.includes("whitlock") ||
    n.includes("hunts point") ||
    n.includes("longwood") ||
    n.includes("cypress av") ||
    n.includes("brook av") ||
    n.includes("e 143") ||
    n.includes("3 av-138") ||
    // Additional Bronx stations on D train and elsewhere
    n.includes("183 st") ||
    n.includes("burnside") ||
    n.includes("morris park") ||
    n.includes("tremont") ||
    n.includes("182-183") ||
    // These names are ambiguous (also exist in Brooklyn/Queens)
    // but at lat > 40.80 they're Bronx
    (n.includes("prospect av") && lat > 40.80) ||
    (n.includes("jackson av") && lat > 40.80)
  ) {
    return "bronx";
  }

  // --- Queens ---
  if (
    n.includes("flushing") ||
    n.includes("jamaica") ||
    n.includes("astoria") ||
    n.includes("rockaway") ||
    n.includes("far rockaway") ||
    n.includes("howard beach") ||
    n.includes("ozone park") ||
    n.includes("forest hills") ||
    n.includes("kew gardens") ||
    n.includes("woodside") ||
    n.includes("sunnyside") ||
    n.includes("long island city") ||
    n.includes("ridgewood") ||
    n.includes("corona") ||
    n.includes("elmhurst") ||
    n.includes("jackson heights") ||
    n.includes("mets-willets") ||
    n.includes("dutch kills") ||
    n.includes("queens plaza") ||
    n.includes("court sq") ||
    n.includes("hunters point") ||
    n.includes("broad channel") ||
    n.includes("aqueduct") ||
    n.includes("rego park") ||
    n.includes("bay terrace") ||
    n.includes("whitestone") ||
    n.includes("murray hill") ||
    n.includes("bayside")
  ) {
    return "queens";
  }

  // --- Brooklyn ---
  if (
    n.includes("brooklyn") ||
    n.includes("coney island") ||
    n.includes("brighton") ||
    n.includes("canarsie") ||
    n.includes("bensonhurst") ||
    n.includes("bay ridge") ||
    n.includes("williamsburg") ||
    n.includes("bushwick") ||
    n.includes("flatbush") ||
    n.includes("crown heights") ||
    n.includes("borough park") ||
    n.includes("downtown brooklyn") ||
    n.includes("prospect park") ||
    n.includes("park slope") ||
    n.includes("broadway junction") ||
    n.includes("stillwell") ||
    n.includes("sheepshead") ||
    n.includes("new utrecht") ||
    n.includes("bath beach") ||
    n.includes("gravesend") ||
    n.includes("midwood") ||
    n.includes("marine park") ||
    n.includes("mill basin") ||
    n.includes("bay ridge") ||
    n.includes("sunset park") ||
    n.includes("gowanus") ||
    n.includes("red hook") ||
    n.includes("dumbo") ||
    n.includes("brooklyn heights") ||
    n.includes("fort greene") ||
    n.includes("clinton hill") ||
    n.includes("bedford") ||
    n.includes("nostrand") ||
    n.includes("utica av") ||
    n.includes("sutter av") ||
    n.includes("ralph av") ||
    n.includes("rockaway av") ||
    n.includes("junius st") ||
    n.includes("pennsylvania av") ||
    n.includes("van siclen") ||
    n.includes("new lots") ||
    n.includes("kingston") ||
    n.includes("nevins") ||
    n.includes("dekalb av") ||
    n.includes("Hoyt") ||
    n.includes("fulton st") && !n.includes("broadway")
  ) {
    return "brooklyn";
  }

  // --- Manhattan (explicit name matches) ---
  if (
    n.includes("times sq") ||
    n.includes("grand central") ||
    n.includes("penn station") ||
    n.includes("herald sq") ||
    n.includes("union sq") ||
    n.includes("columbus circle") ||
    n.includes("wall st") ||
    n.includes("chambers st") ||
    n.includes("city hall") ||
    n.includes("hudson yards") ||
    n.includes("world trade") ||
    n.includes("soho") ||
    n.includes("greenwich") ||
    n.includes("tribeca") ||
    n.includes("chinatown") ||
    n.includes("lower east") ||
    n.includes("upper east") ||
    n.includes("upper west") ||
    n.includes("harlem") ||
    n.includes("morningside") ||
    n.includes("washington heights") ||
    n.includes("inwood") ||
    n.includes("bowling green") ||
    n.includes("south ferry") ||
    n.includes("whitehall") ||
    n.includes("battery") ||
    n.includes("cortlandt") ||
    n.includes("fulton st") ||
    n.includes("park place") ||
    n.includes("chambers st")
  ) {
    return "manhattan";
  }

  // --- Coordinate-based fallback ---

  // Staten Island: far southwest
  if (lat < 40.6 && lon < -74.05) {
    return "statenisland";
  }

  // Bronx: north of 40.87 (clearly in the Bronx, above Manhattan's northern tip)
  if (lat > 40.87) {
    return "bronx";
  }

  // Queens: east of Manhattan (less negative longitude)
  // Extended to -73.93 to capture Queens Blvd corridor stations
  if (lon > -73.93 && lat > 40.55 && lat < 40.78) {
    return "queens";
  }

  // Brooklyn: south of 40.7, west of SI
  if (lat < 40.7 && lon >= -74.05) {
    return "brooklyn";
  }

  // Default to Manhattan for central NYC
  return "manhattan";
}

/**
 * Process stops.txt into stations.json
 */
function processStops(stopsData, tripsData, stopTimesData) {
  log("Processing stops...");

  // Build trip_id -> route_id mapping
  const tripToRoute = new Map();
  for (const trip of tripsData) {
    tripToRoute.set(trip.trip_id, trip.route_id);
  }

  // Build stop_id -> set of route_ids
  const stopToRoutes = new Map();
  for (const st of stopTimesData) {
    const routeId = tripToRoute.get(st.trip_id);
    if (routeId) {
      if (!stopToRoutes.has(st.stop_id)) {
        stopToRoutes.set(st.stop_id, new Set());
      }
      stopToRoutes.get(st.stop_id).add(routeId);
    }
  }

  // Separate parent stations from child stops
  const parentStations = [];
  const childStops = new Map();

  for (const stop of stopsData) {
    const locationType = parseInt(stop.location_type || "0", 10);
    if (locationType === 1) {
      parentStations.push(stop);
    } else {
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

    let northStopId = null;
    let southStopId = null;
    const allLines = new Set();

    for (const [childId, child] of childStops) {
      if (child.parent_station === stationId) {
        if (childId.endsWith("N")) {
          northStopId = childId;
        } else if (childId.endsWith("S")) {
          southStopId = childId;
        }

        const routes = stopToRoutes.get(childId) || new Set();
        for (const r of routes) {
          if (!EXCLUDED_LINE_VARIANTS.has(r)) {
            allLines.add(r);
          }
        }
      }
    }

    // Also collect routes from parent station itself
    const parentRoutes = stopToRoutes.get(stationId) || new Set();
    for (const r of parentRoutes) {
      if (!EXCLUDED_LINE_VARIANTS.has(r)) {
        allLines.add(r);
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
      ada: false,    // Will be set from ada-stations.json
      borough: inferBorough(name, lat, lon),
    };
  }

  // Handle orphan child stops (stops without parent_station that serve routes)
  for (const [stopId, stop] of childStops) {
    if (!stop.parent_station && stopToRoutes.has(stopId)) {
      const routes = stopToRoutes.get(stopId);
      const baseId = stopId.replace(/[NS]$/, "");

      if (!stations[baseId]) {
        const direction = stopId.endsWith("N") ? "N" : stopId.endsWith("S") ? "S" : null;
        const lat = parseFloat(stop.stop_lat);
        const lon = parseFloat(stop.stop_lon);

        stations[baseId] = {
          id: baseId,
          name: stop.stop_name,
          lat,
          lon,
          lines: Array.from(routes).filter(r => !EXCLUDED_LINE_VARIANTS.has(r)).sort(),
          northStopId: direction === "N" ? stopId : `${baseId}N`,
          southStopId: direction === "S" ? stopId : `${baseId}S`,
          transfers: [],
          ada: false,
          borough: inferBorough(stop.stop_name, lat, lon),
        };
      }
    }
  }

  // Apply ADA overrides
  const adaIds = loadAdaOverrides(stations);
  let adaCount = 0;
  for (const id of adaIds) {
    if (stations[id]) {
      stations[id].ada = true;
      adaCount++;
    }
  }
  log(`Applied ADA status to ${adaCount} stations`);

  log(`Processed ${Object.keys(stations).length} stations`);
  return stations;
}

/**
 * Process routes.txt into routes.json
 */
function processRoutes(routesData, stopTimesData, tripsData) {
  log("Processing routes...");

  // Build route_id -> stop_sequence -> stop_id
  const routeToStops = new Map();
  const tripToRoute = new Map();
  for (const trip of tripsData) {
    tripToRoute.set(trip.trip_id, trip.route_id);
  }

  for (const st of stopTimesData) {
    const routeId = tripToRoute.get(st.trip_id);
    if (routeId) {
      if (!routeToStops.has(routeId)) {
        routeToStops.set(routeId, new Map());
      }
      const stopsMap = routeToStops.get(routeId);
      const seq = parseInt(st.stop_sequence, 10);
      if (!stopsMap.has(st.stop_id) || seq < stopsMap.get(st.stop_id)) {
        stopsMap.set(st.stop_id, seq);
      }
    }
  }

  const routes = {};

  for (const route of routesData) {
    const routeId = route.route_id;

    // Map SI route to SIR
    const displayId = routeId === "SI" ? "SIR" : routeId;

    // Skip non-subway routes (buses, ferries)
    if (["X", "SB"].some(prefix => routeId.startsWith(prefix))) {
      continue;
    }

    // Use official MTA colors if available, otherwise fall back to GTFS
    const officialColor = MTA_ROUTE_COLORS[displayId];
    const color = officialColor
      ? officialColor.color
      : normalizeColor(route.route_color);
    const textColor = officialColor
      ? officialColor.textColor
      : route.route_text_color
        ? normalizeColor(route.route_text_color)
        : "#FFFFFF";

    // Get ordered stops for this route
    const stopsMap = routeToStops.get(routeId) || new Map();
    const stops = Array.from(stopsMap.keys())
      .map((id) => id.replace(/[NS]$/, ""))
      .filter((id, i, arr) => arr.indexOf(id) === i)
      .sort((a, b) => {
        const seqA = stopsMap.get(a + "N") || stopsMap.get(a + "S") || Infinity;
        const seqB = stopsMap.get(b + "N") || stopsMap.get(b + "S") || Infinity;
        return seqA - seqB;
      });

    routes[displayId] = {
      id: displayId,
      shortName: route.route_short_name || displayId,
      longName: route.route_long_name || "",
      color,
      textColor,
      feedId: FEED_MAP[displayId] || "gtfs",
      division: A_DIVISION_ROUTES.has(displayId) ? "A" : "B",
      stops,
    };
  }

  log(`Processed ${Object.keys(routes).length} routes`);
  return routes;
}

/**
 * Normalize hex color to uppercase with # prefix
 */
function normalizeColor(color) {
  if (!color) return "#808183";
  const hex = color.replace(/^#/, "").toUpperCase();
  return `#${hex.padStart(6, "0")}`;
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

    const fromStation = fromStop.replace(/[NS]$/, "");
    const toStation = toStop.replace(/[NS]$/, "");

    if (!stations[fromStation] || !stations[toStation]) continue;
    if (fromStation === toStation) continue;

    if (!transferGraph[fromStation]) {
      transferGraph[fromStation] = [];
    }

    // Use min_transfer_time, default to 180s, enforce minimum of 60s
    let walkingSeconds = parseInt(t.min_transfer_time || "180", 10);
    if (walkingSeconds < 60) walkingSeconds = DEFAULT_TRANSFER_SECONDS;

    const existing = transferGraph[fromStation].find(e => e.toStationId === toStation);
    if (existing) {
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
 * Process stop_times.txt to extract inter-station travel times.
 * Indexed by route_id + from_stop + to_stop for efficient lookup.
 */
function processTravelTimes(stopTimesData, tripsData) {
  log("Processing travel times (this may take a moment)...");

  const tripToRoute = new Map();
  for (const trip of tripsData) {
    tripToRoute.set(trip.trip_id, trip.route_id);
  }

  // Group stop_times by trip_id
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
  for (const [, stops] of tripStops) {
    stops.sort((a, b) => a.sequence - b.sequence);
  }

  // Calculate travel times between consecutive stops
  // Key: route_id -> from_stop -> to_stop -> [times in seconds]
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

      const parseTime = (t) => {
        if (!t) return null;
        const [h, m, s] = t.split(":").map(Number);
        return h * 3600 + m * 60 + s;
      };

      const arrivalTime = parseTime(stops[i + 1].arrival);
      const departureTime = parseTime(stops[i].departure);

      if (arrivalTime === null || departureTime === null) continue;

      const travelSeconds = arrivalTime - departureTime;

      // Skip negative times, overnight wraps, and unreasonably long times
      if (travelSeconds <= 0 || travelSeconds > 600) continue;

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
    // Map SI -> SIR for consistency with routes.json
    const displayRouteId = routeId === "SI" ? "SIR" : routeId;
    travelTimes[displayRouteId] = {};

    for (const [fromStop, fromMap] of routeMap) {
      travelTimes[displayRouteId][fromStop] = {};

      for (const [toStop, samples] of fromMap) {
        const sorted = samples.sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        travelTimes[displayRouteId][fromStop][toStop] = median;
      }
    }
  }

  log(`Processed travel times for ${Object.keys(travelTimes).length} routes`);
  return travelTimes;
}

/**
 * Infer station complexes from station names.
 * Groups stations that share the same name but have different parent station IDs.
 */
function inferComplexesFromGtfs(stations) {
  log("Inferring complexes from station names...");

  const complexes = {};
  const nameToStations = new Map();

  for (const [stationId, station] of Object.entries(stations)) {
    const normalizedName = station.name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .replace(/ststation/g, "st")
      .replace(/aveavenue/g, "av")
      .replace(/avenue/g, "av");

    if (!nameToStations.has(normalizedName)) {
      nameToStations.set(normalizedName, []);
    }
    nameToStations.get(normalizedName).push(stationId);
  }

  let complexCounter = 1;
  for (const [name, stationIds] of nameToStations) {
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
 * Load complex overrides from data/complex-overrides.json and apply them.
 * These override or supplement the name-based complex inference for known
 * edge cases where MTA data is inconsistent.
 */
function applyComplexOverrides(stations, complexes) {
  const overridesPath = join(DATA_DIR, "complex-overrides.json");
  if (!existsSync(overridesPath)) {
    log("No complex-overrides.json found, skipping overrides");
    return complexes;
  }

  const overrides = JSON.parse(readFileSync(overridesPath, "utf-8"));
  let applied = 0;

  for (const [overrideKey, override] of Object.entries(overrides)) {
    if (!override.stations || override.stations.length < 2) continue;

    // Find if any of these stations are already in a complex
    const existingComplexIds = new Set();
    for (const sid of override.stations) {
      if (stations[sid]?.complex) {
        existingComplexIds.add(stations[sid].complex);
      }
    }

    if (existingComplexIds.size > 0) {
      // Merge into the first existing complex
      const targetComplexId = [...existingComplexIds][0];
      const targetComplex = complexes[targetComplexId];
      if (targetComplex) {
        // Add missing stations
        for (const sid of override.stations) {
          if (!targetComplex.stations.includes(sid)) {
            targetComplex.stations.push(sid);
          }
          if (stations[sid]) {
            stations[sid].complex = targetComplexId;
            stations[sid].lines.forEach(l => {
              if (!targetComplex.allLines.includes(l)) targetComplex.allLines.push(l);
            });
            if (!targetComplex.allStopIds.includes(stations[sid].northStopId)) {
              targetComplex.allStopIds.push(stations[sid].northStopId);
            }
            if (!targetComplex.allStopIds.includes(stations[sid].southStopId)) {
              targetComplex.allStopIds.push(stations[sid].southStopId);
            }
          }
        }
        // Remove duplicate complexes that were merged
        for (const otherId of existingComplexIds) {
          if (otherId !== targetComplexId) {
            delete complexes[otherId];
          }
        }
        targetComplex.allLines.sort();
        targetComplex.allStopIds.sort();
        applied++;
      }
    } else {
      // Create new complex for these stations
      const complexId = overrideKey;
      const allLines = new Set();
      const allStopIds = new Set();

      for (const sid of override.stations) {
        if (stations[sid]) {
          stations[sid].complex = complexId;
          stations[sid].lines.forEach(l => allLines.add(l));
          allStopIds.add(stations[sid].northStopId);
          allStopIds.add(stations[sid].southStopId);
        }
      }

      complexes[complexId] = {
        complexId,
        name: override.name,
        stations: override.stations.filter(sid => stations[sid]),
        allLines: [...allLines].sort(),
        allStopIds: [...allStopIds].sort(),
      };
      applied++;
    }
  }

  log(`Applied ${applied} complex overrides`);
  return complexes;
}

/**
 * Write complex-overrides.json with known edge cases.
 * Only writes if the file doesn't already exist (idempotent).
 */
function writeComplexOverridesIfNeeded() {
  const overridesPath = join(DATA_DIR, "complex-overrides.json");
  if (existsSync(overridesPath)) return;

  const overrides = {
    "times_sq_42": {
      name: "Times Sq-42 St",
      stations: ["725", "726", "901", "902", "903"],
      notes: "Combines 1/2/3, 7, N/Q/R/W, and S platforms",
    },
    "fulton_broadway": {
      name: "Fulton St-Broadway/Nassau",
      stations: ["230", "231", "422", "423"],
      notes: "Combines A/C, J/Z, 2/3, 4/5 platforms",
    },
    "14th_union_sq": {
      name: "14 St-Union Sq",
      stations: ["326", "346", "351", "635"],
      notes: "Combines L, N/Q/R/W, 4/5/6 platforms",
    },
    "atlantic_ave": {
      name: "Atlantic Av-Barclays Ctr",
      stations: ["245", "246", "247", "248", "249", "250", "251", "421", "629"],
      notes: "Combines B/D/N/Q/R/2/3/4/5 and LIRR platforms",
    },
    "lex_59": {
      name: "Lexington Av/59 St",
      stations: ["322", "411", "412"],
      notes: "Combines 4/5/6 and N/Q/R platforms",
    },
    "lex_53": {
      name: "Lexington Av/53 St",
      stations: ["321", "625"],
      notes: "Combines 6 and E/M platforms",
    },
    "jay_metrotech": {
      name: "Jay St-MetroTech",
      stations: ["243", "443"],
      notes: "Combines A/C/F and R platforms",
    },
    "court_sq": {
      name: "Court Sq",
      stations: ["464", "465", "745"],
      notes: "Combines 7, E/M, and G platforms",
    },
    "roosevelt_74": {
      name: "Roosevelt Av/74 St",
      stations: ["701", "746"],
      notes: "Combines 7 and E/F/M/R platforms",
    },
  };

  writeFileSync(overridesPath, JSON.stringify(overrides, null, 2));
  log(`Created complex-overrides.json with ${Object.keys(overrides).length} overrides`);
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

  // Step 2: Read GTFS files
  console.log("Step 2: Reading GTFS files...");

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
  let complexes = inferComplexesFromGtfs(stations);
  writeComplexOverridesIfNeeded();
  complexes = applyComplexOverrides(stations, complexes);

  console.log("Processing complete.\n");

  // Step 4: Write output files
  console.log("Step 4: Writing output files...");

  writeFileSync(join(DATA_DIR, "stations.json"), JSON.stringify(stations, null, 2));
  console.log(`  stations.json: ${Object.keys(stations).length} stations`);

  writeFileSync(join(DATA_DIR, "routes.json"), JSON.stringify(routes, null, 2));
  console.log(`  routes.json: ${Object.keys(routes).length} routes`);

  writeFileSync(join(DATA_DIR, "transfers.json"), JSON.stringify(transferGraph, null, 2));
  console.log(`  transfers.json: ${Object.keys(transferGraph).length} transfer hubs`);

  writeFileSync(join(DATA_DIR, "travel-times.json"), JSON.stringify(travelTimes, null, 2));
  console.log(`  travel-times.json: ${Object.keys(travelTimes).length} routes`);

  writeFileSync(join(DATA_DIR, "complexes.json"), JSON.stringify(complexes, null, 2));
  console.log(`  complexes.json: ${Object.keys(complexes).length} complexes`);

  console.log("\n================================");
  console.log("GTFS processing complete!");
  console.log(`Output files written to: ${DATA_DIR}`);
  console.log("================================");

  // Validation summary
  const stationCount = Object.keys(stations).length;
  const adaCount = Object.values(stations).filter(s => s.ada).length;
  const complexStations = Object.values(complexes)
    .filter(c => c.stations.length > 1)
    .reduce((sum, c) => sum + c.stations.length, 0);

  console.log(`\nStation count: ${stationCount} parent stations`);
  console.log(`  (${stationCount - complexStations} single-station + ${complexStations} in multi-station complexes)`);
  console.log(`  Note: MTA's "472 stations" counts complexes as single stations.`);
  console.log(`ADA accessible: ${adaCount} stations`);
  console.log(`Complexes: ${Object.keys(complexes).length} multi-station groups`);

  // Borough distribution
  const boroughs = {};
  for (const s of Object.values(stations)) {
    boroughs[s.borough] = (boroughs[s.borough] || 0) + 1;
  }
  console.log(`Boroughs: ${Object.entries(boroughs).map(([b, c]) => `${b}: ${c}`).join(", ")}`);
}

// Run
main().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
