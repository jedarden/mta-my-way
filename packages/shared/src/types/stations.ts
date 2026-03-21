/**
 * GTFS static data types: stations, routes, and transfers
 * Processed at build time and served as static JSON
 */

/** NYC borough identifier */
export type Borough = "manhattan" | "brooklyn" | "queens" | "bronx" | "statenisland";

/** MTA division (A = numbered lines, B = lettered lines) */
export type Division = "A" | "B";

/**
 * Transfer connection between stations
 */
export interface TransferConnection {
  /** Target station ID */
  toStationId: string;
  /** Lines available at the transfer station */
  toLines: string[];
  /** Estimated walking time for transfer in seconds */
  walkingSeconds: number;
  /** Whether the transfer path is ADA accessible */
  accessible: boolean;
}

/**
 * A subway station
 */
export interface Station {
  /** Parent station ID, e.g., "725" */
  id: string;
  /** Station display name, e.g., "Times Sq-42 St" */
  name: string;
  /** Latitude */
  lat: number;
  /** Longitude */
  lon: number;
  /** All lines serving this station */
  lines: string[];
  /** Northbound platform stop ID, e.g., "725N" */
  northStopId: string;
  /** Southbound platform stop ID, e.g., "725S" */
  southStopId: string;
  /** Available transfers from this station */
  transfers: TransferConnection[];
  /** Station complex ID for multi-entrance stations */
  complex?: string;
  /** Whether the station is ADA accessible */
  ada: boolean;
  /** Borough */
  borough: Borough;
}

/**
 * Index of all stations by station ID
 */
export interface StationIndex {
  [stationId: string]: Station;
}

/**
 * A subway route/line
 */
export interface Route {
  /** Route ID, e.g., "1", "A", "N" */
  id: string;
  /** Short display name, e.g., "1", "A", "N" */
  shortName: string;
  /** Full route name, e.g., "Broadway-7th Ave Local" */
  longName: string;
  /** Hex color from routes.txt route_color field (official MTA palette) */
  color: string;
  /** Text color for contrast */
  textColor: string;
  /** Which GTFS-RT feed contains this route, e.g., "gtfs", "gtfs-ace" */
  feedId: string;
  /** MTA division: A (numbered) or B (lettered) */
  division: Division;
  /** Ordered list of stop IDs for this route */
  stops: string[];
}

/**
 * Index of all routes by route ID
 */
export interface RouteIndex {
  [routeId: string]: Route;
}

/**
 * Station complex grouping (Phase 1: multi-parent-station complexes)
 */
export interface StationComplex {
  /** Complex ID from MTA Station Complexes CSV */
  complexId: string;
  /** Display name for the complex */
  name: string;
  /** All station IDs in this complex */
  stations: string[];
  /** All unique lines across all stations in the complex */
  allLines: string[];
  /** All stop IDs (platform IDs) in the complex */
  allStopIds: string[];
}

/**
 * Index of station complexes by complex ID
 */
export interface ComplexIndex {
  [complexId: string]: StationComplex;
}

/**
 * Transfer graph edge for route computation
 */
export interface TransferEdge {
  /** Target station ID */
  toStationId: string;
  /** Walking time in seconds */
  walkingSeconds: number;
  /** Whether this transfer is ADA accessible */
  accessible: boolean;
  /** Lines that connect these stations */
  viaLines: string[];
}

/**
 * Pre-processed transfer graph for the transfer engine
 */
export interface TransferGraph {
  [stationId: string]: TransferEdge[];
}

/**
 * Inter-station scheduled travel time
 */
export interface TravelTime {
  /** Origin stop ID */
  fromStopId: string;
  /** Destination stop ID */
  toStopId: string;
  /** Route ID */
  routeId: string;
  /** Scheduled travel time in seconds */
  seconds: number;
}

/**
 * Index of travel times keyed by route and stop pair
 */
export interface TravelTimeIndex {
  [routeId: string]: {
    [fromStopId: string]: {
      [toStopId: string]: number;
    };
  };
}
