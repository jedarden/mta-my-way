/**
 * Client-side station search logic.
 *
 * Mirrors the server-side search in packages/server/src/app.ts with one
 * addition: complex-aware grouping collapses all stations in the same complex
 * into a single result that shows the combined set of served lines.
 *
 * Scoring (higher = better match):
 *   1000 — exact line match ("1", "A", …)
 *    100 — name starts with query
 *     50 — a word in the name starts with query
 *     10 — query appears anywhere in name
 *      1 — matched via abbreviation expansion
 */

import type { Station, StationComplex } from "../lib/api";

export interface SearchResult {
  /** Station ID for navigating to /station/:stationId */
  stationId: string;
  /** Display name (complex name when station is part of a complex) */
  displayName: string;
  /** All served lines — combined across the complex when applicable */
  lines: string[];
  /** Borough of the primary matching station */
  borough: string;
  /** Relevance score (used for sorting, not displayed) */
  score: number;
}

const ABBREVIATIONS: Record<string, string> = {
  sq: "square",
  st: "street",
  ave: "avenue",
  av: "avenue",
  blvd: "boulevard",
  pkwy: "parkway",
  rd: "road",
  dr: "drive",
  ln: "lane",
  ct: "court",
  pl: "place",
  hwy: "highway",
  expwy: "expressway",
  bway: "broadway",
  "'way": "way",
};

function normalizeForSearch(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function expandAbbreviations(term: string): string {
  const lower = term.toLowerCase();
  if (ABBREVIATIONS[lower]) {
    return ABBREVIATIONS[lower];
  }
  let expanded = term;
  for (const [abbr, full] of Object.entries(ABBREVIATIONS)) {
    const regex = new RegExp(`\\b${abbr}\\b`, "gi");
    expanded = expanded.replace(regex, full);
  }
  return expanded;
}

function stationMatchesQuery(
  station: Station,
  normalizedQuery: string,
  originalQuery: string
): boolean {
  const normalizedName = normalizeForSearch(station.name);
  const expandedQuery = normalizeForSearch(expandAbbreviations(originalQuery));
  const expandedNormalizedQuery = normalizeForSearch(expandAbbreviations(normalizedQuery));

  if (
    normalizedName.includes(normalizedQuery) ||
    normalizedName.includes(expandedQuery) ||
    normalizedName.includes(expandedNormalizedQuery)
  ) {
    return true;
  }

  // Exact line match: "1", "A", "F", etc.
  const upperQuery = originalQuery.toUpperCase();
  if (station.lines.some((line) => line === upperQuery)) {
    return true;
  }

  // Match expanded station name against expanded query
  const expandedName = normalizeForSearch(expandAbbreviations(station.name));
  if (expandedName.includes(expandedQuery) || expandedName.includes(expandedNormalizedQuery)) {
    return true;
  }

  return false;
}

function scoreStation(station: Station, query: string): number {
  const normalizedQuery = normalizeForSearch(query);
  const normalizedName = normalizeForSearch(station.name);
  const upperQuery = query.toUpperCase();

  if (station.lines.some((line) => line === upperQuery)) {
    return 1000;
  }
  if (normalizedName.startsWith(normalizedQuery)) {
    return 100;
  }
  const words = normalizedName.split(/\s+/);
  if (words.some((w) => w.startsWith(normalizedQuery))) {
    return 50;
  }
  if (normalizedName.includes(normalizedQuery)) {
    return 10;
  }
  return 1;
}

/**
 * Search stations with complex-aware grouping.
 *
 * When multiple stations in the same complex match the query they are merged
 * into one result showing the full set of lines served by the complex.
 */
export function searchStations(
  query: string,
  stations: Station[],
  complexes: StationComplex[]
): SearchResult[] {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];

  const normalized = normalizeForSearch(trimmed);

  // Build stationId → complex lookup
  const stationToComplex = new Map<string, StationComplex>();
  for (const complex of complexes) {
    for (const stationId of complex.stations) {
      stationToComplex.set(stationId, complex);
    }
  }

  // Filter and score
  const matched = stations
    .filter((s) => stationMatchesQuery(s, normalized, trimmed))
    .map((s) => ({ station: s, score: scoreStation(s, trimmed) }));

  // Group by complex key (or individual station)
  const resultMap = new Map<string, SearchResult>();

  for (const { station, score } of matched) {
    const complex = stationToComplex.get(station.id);

    if (complex) {
      const key = `complex:${complex.complexId}`;
      const existing = resultMap.get(key);
      if (existing) {
        if (score > existing.score) {
          existing.score = score;
          existing.stationId = station.id;
        }
      } else {
        resultMap.set(key, {
          stationId: station.id,
          displayName: complex.name,
          lines: complex.allLines,
          borough: station.borough,
          score,
        });
      }
    } else {
      resultMap.set(`station:${station.id}`, {
        stationId: station.id,
        displayName: station.name,
        lines: station.lines,
        borough: station.borough,
        score,
      });
    }
  }

  return Array.from(resultMap.values()).sort((a, b) => b.score - a.score);
}
