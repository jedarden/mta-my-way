/**
 * NYC Subway line metadata
 * Colors from official MTA palette (routes.txt route_color field)
 */

import type { Division } from "../types/stations.js";

/**
 * Line metadata including official MTA colors
 */
export interface LineMetadata {
  /** Line ID (route_id) */
  id: string;
  /** Display name (short) */
  shortName: string;
  /** Full line name */
  longName: string;
  /** Official MTA background color (hex, from routes.txt) */
  color: string;
  /** Text color for contrast (hex) */
  textColor: string;
  /** MTA division: A (numbered) or B (lettered) */
  division: Division;
  /** Which GTFS-RT feed this line belongs to */
  feedId: string;
  /** Whether this is an express service */
  isExpress: boolean;
  /** Alternate/similar lines (for routing) */
  similarLines: string[];
}

/**
 * Official MTA line colors and metadata
 * Colors extracted from routes.txt route_color field
 */
export const LINE_METADATA: Record<string, LineMetadata> = {
  // A Division (numbered lines) - ATS tracking
  "1": {
    id: "1",
    shortName: "1",
    longName: "Broadway-7th Ave Local",
    color: "#EE352E",
    textColor: "#FFFFFF",
    division: "A",
    feedId: "gtfs",
    isExpress: false,
    similarLines: ["2", "3"],
  },
  "2": {
    id: "2",
    shortName: "2",
    longName: "7th Ave Express",
    color: "#EE352E",
    textColor: "#FFFFFF",
    division: "A",
    feedId: "gtfs",
    isExpress: true,
    similarLines: ["1", "3"],
  },
  "3": {
    id: "3",
    shortName: "3",
    longName: "7th Ave Express",
    color: "#EE352E",
    textColor: "#FFFFFF",
    division: "A",
    feedId: "gtfs",
    isExpress: true,
    similarLines: ["1", "2"],
  },
  "4": {
    id: "4",
    shortName: "4",
    longName: "Lexington Ave Express",
    color: "#00933C",
    textColor: "#FFFFFF",
    division: "A",
    feedId: "gtfs",
    isExpress: true,
    similarLines: ["5", "6"],
  },
  "5": {
    id: "5",
    shortName: "5",
    longName: "Lexington Ave Express",
    color: "#00933C",
    textColor: "#FFFFFF",
    division: "A",
    feedId: "gtfs",
    isExpress: true,
    similarLines: ["4", "6"],
  },
  "6": {
    id: "6",
    shortName: "6",
    longName: "Lexington Ave Local",
    color: "#00933C",
    textColor: "#FFFFFF",
    division: "A",
    feedId: "gtfs",
    isExpress: false,
    similarLines: ["4", "5"],
  },
  "7": {
    id: "7",
    shortName: "7",
    longName: "Flushing Local/Express",
    color: "#B933AD",
    textColor: "#FFFFFF",
    division: "A",
    feedId: "gtfs",
    isExpress: false,
    similarLines: ["7X"],
  },
  "7X": {
    id: "7X",
    shortName: "7X",
    longName: "Flushing Express",
    color: "#B933AD",
    textColor: "#FFFFFF",
    division: "A",
    feedId: "gtfs",
    isExpress: true,
    similarLines: ["7"],
  },
  "S": {
    id: "S",
    shortName: "S",
    longName: "42nd St Shuttle",
    color: "#808183",
    textColor: "#FFFFFF",
    division: "A",
    feedId: "gtfs",
    isExpress: false,
    similarLines: [],
  },
  "GS": {
    id: "GS",
    shortName: "S",
    longName: "42nd St Shuttle",
    color: "#808183",
    textColor: "#FFFFFF",
    division: "A",
    feedId: "gtfs",
    isExpress: false,
    similarLines: [],
  },

  // B Division (lettered lines) - Bluetooth tracking
  A: {
    id: "A",
    shortName: "A",
    longName: "8th Ave Express",
    color: "#0039A6",
    textColor: "#FFFFFF",
    division: "B",
    feedId: "gtfs-ace",
    isExpress: true,
    similarLines: ["C", "E"],
  },
  C: {
    id: "C",
    shortName: "C",
    longName: "8th Ave Local",
    color: "#0039A6",
    textColor: "#FFFFFF",
    division: "B",
    feedId: "gtfs-ace",
    isExpress: false,
    similarLines: ["A", "E"],
  },
  E: {
    id: "E",
    shortName: "E",
    longName: "8th Ave Local",
    color: "#0039A6",
    textColor: "#FFFFFF",
    division: "B",
    feedId: "gtfs-ace",
    isExpress: false,
    similarLines: ["A", "C"],
  },
  B: {
    id: "B",
    shortName: "B",
    longName: "6th Ave Express",
    color: "#FF6319",
    textColor: "#FFFFFF",
    division: "B",
    feedId: "gtfs-bdfm",
    isExpress: true,
    similarLines: ["D", "F", "M"],
  },
  D: {
    id: "D",
    shortName: "D",
    longName: "6th Ave Express",
    color: "#FF6319",
    textColor: "#FFFFFF",
    division: "B",
    feedId: "gtfs-bdfm",
    isExpress: true,
    similarLines: ["B", "F", "M"],
  },
  F: {
    id: "F",
    shortName: "F",
    longName: "6th Ave Local",
    color: "#FF6319",
    textColor: "#FFFFFF",
    division: "B",
    feedId: "gtfs-bdfm",
    isExpress: false,
    similarLines: ["B", "D", "M"],
  },
  M: {
    id: "M",
    shortName: "M",
    longName: "Queens Blvd Local",
    color: "#FF6319",
    textColor: "#FFFFFF",
    division: "B",
    feedId: "gtfs-bdfm",
    isExpress: false,
    similarLines: ["B", "D", "F"],
  },
  G: {
    id: "G",
    shortName: "G",
    longName: "Brooklyn-Queens Crosstown",
    color: "#6CBE45",
    textColor: "#FFFFFF",
    division: "B",
    feedId: "gtfs-g",
    isExpress: false,
    similarLines: [],
  },
  J: {
    id: "J",
    shortName: "J",
    longName: "Nassau St Local",
    color: "#996633",
    textColor: "#FFFFFF",
    division: "B",
    feedId: "gtfs-jz",
    isExpress: false,
    similarLines: ["Z"],
  },
  Z: {
    id: "Z",
    shortName: "Z",
    longName: "Nassau St Express",
    color: "#996633",
    textColor: "#FFFFFF",
    division: "B",
    feedId: "gtfs-jz",
    isExpress: true,
    similarLines: ["J"],
  },
  L: {
    id: "L",
    shortName: "L",
    longName: "14th St-Canarsie Local",
    color: "#A7A9AC",
    textColor: "#FFFFFF",
    division: "B",
    feedId: "gtfs-l",
    isExpress: false,
    similarLines: [],
    // L has CBTC - best accuracy
  },
  N: {
    id: "N",
    shortName: "N",
    longName: "Broadway Express",
    color: "#FCCC0A",
    textColor: "#000000",
    division: "B",
    feedId: "gtfs-nqrw",
    isExpress: true,
    similarLines: ["Q", "R", "W"],
  },
  Q: {
    id: "Q",
    shortName: "Q",
    longName: "Broadway Express",
    color: "#FCCC0A",
    textColor: "#000000",
    division: "B",
    feedId: "gtfs-nqrw",
    isExpress: true,
    similarLines: ["N", "R", "W"],
  },
  R: {
    id: "R",
    shortName: "R",
    longName: "Broadway Local",
    color: "#FCCC0A",
    textColor: "#000000",
    division: "B",
    feedId: "gtfs-nqrw",
    isExpress: false,
    similarLines: ["N", "Q", "W"],
  },
  W: {
    id: "W",
    shortName: "W",
    longName: "Broadway Local",
    color: "#FCCC0A",
    textColor: "#000000",
    division: "B",
    feedId: "gtfs-nqrw",
    isExpress: false,
    similarLines: ["N", "Q", "R"],
  },

  // Staten Island Railway
  SIR: {
    id: "SIR",
    shortName: "SIR",
    longName: "Staten Island Railway",
    color: "#1D2F6F",
    textColor: "#FFFFFF",
    division: "B",
    feedId: "gtfs-si",
    isExpress: false,
    similarLines: [],
  },

  // Franklin Ave Shuttle
  FS: {
    id: "FS",
    shortName: "S",
    longName: "Franklin Ave Shuttle",
    color: "#808183",
    textColor: "#FFFFFF",
    division: "B",
    feedId: "gtfs-ace",
    isExpress: false,
    similarLines: [],
  },

  // Rockaway Park Shuttle
  H: {
    id: "H",
    shortName: "H",
    longName: "Rockaway Park Shuttle",
    color: "#0039A6",
    textColor: "#FFFFFF",
    division: "B",
    feedId: "gtfs-ace",
    isExpress: false,
    similarLines: ["A"],
  },
};

/**
 * Get line metadata by line ID
 */
export function getLineMetadata(lineId: string): LineMetadata | undefined {
  return LINE_METADATA[lineId];
}

/**
 * Get the color for a line (returns fallback gray if not found)
 */
export function getLineColor(lineId: string): string {
  return LINE_METADATA[lineId]?.color ?? "#808183";
}

/**
 * Get text color for a line (white or black for contrast)
 */
export function getLineTextColor(lineId: string): string {
  return LINE_METADATA[lineId]?.textColor ?? "#FFFFFF";
}

/**
 * Check if a line is in A Division (numbered, ATS-tracked, higher accuracy)
 */
export function isADivision(lineId: string): boolean {
  return LINE_METADATA[lineId]?.division === "A";
}

/**
 * Check if a line is in B Division (lettered, Bluetooth-tracked, lower accuracy)
 */
export function isBDivision(lineId: string): boolean {
  return LINE_METADATA[lineId]?.division === "B";
}

/**
 * Get all line IDs
 */
export function getAllLineIds(): string[] {
  return Object.keys(LINE_METADATA);
}

/**
 * Get lines grouped by color family (for UI grouping)
 */
export function getLinesByColorFamily(): Record<string, string[]> {
  const families: Record<string, string[]> = {};
  for (const [lineId, meta] of Object.entries(LINE_METADATA)) {
    const color = meta.color;
    if (!families[color]) {
      families[color] = [];
    }
    families[color].push(lineId);
  }
  return families;
}
