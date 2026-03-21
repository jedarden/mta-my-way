/**
 * Transfer graph builder
 *
 * Builds a weighted graph from transfers.json and complexes.json for use in
 * the transfer analysis engine. The graph represents all possible transfers
 * between stations with walking times.
 *
 * Key features:
 * - Bidirectional transfer edges (if A -> B, then B -> A)
 * - Complex-aware transfers (stations in the same complex can transfer)
 * - Default walking time of 180s when not specified
 */

import type {
  ComplexIndex,
  StationIndex,
  TransferConnection,
  TransferEdge,
  TransferGraph,
} from "@mta-my-way/shared";

/** Default walking time for transfers (3 minutes) */
const DEFAULT_WALKING_SECONDS = 180;

/**
 * Build the transfer graph from stations, transfers, and complexes
 *
 * The graph is bidirectional - if station A has a transfer to station B,
 * then station B also has a transfer to station A.
 *
 * Complex stations: stations in the same complex can transfer to each other
 * with a minimal walking time (60 seconds for same-complex transfers).
 */
export function buildTransferGraph(
  stations: StationIndex,
  transfers: Record<string, TransferConnection[]>,
  complexes: ComplexIndex
): TransferGraph {
  const graph: TransferGraph = {};

  // Initialize all stations with empty transfer arrays
  for (const stationId of Object.keys(stations)) {
    graph[stationId] = [];
  }

  // Add transfers from transfers.json (bidirectional)
  for (const [fromStationId, transferList] of Object.entries(transfers)) {
    for (const transfer of transferList) {
      // Add edge from -> to
      addTransferEdge(graph, fromStationId, transfer);

      // Add reverse edge to -> from (bidirectional)
      const reverseTransfer: TransferConnection = {
        toStationId: fromStationId,
        toLines: stations[fromStationId]?.lines ?? [],
        walkingSeconds: transfer.walkingSeconds,
        accessible: transfer.accessible,
      };
      addTransferEdge(graph, transfer.toStationId, reverseTransfer);
    }
  }

  // Add intra-complex transfers (stations in the same complex can transfer)
  for (const complex of Object.values(complexes)) {
    const stationIds = complex.stations;

    // Add transfers between all stations in the complex
    for (let i = 0; i < stationIds.length; i++) {
      for (let j = i + 1; j < stationIds.length; j++) {
        const stationA = stationIds[i];
        const stationB = stationIds[j];

        if (!stationA || !stationB) continue;
        if (!graph[stationA] || !graph[stationB]) continue;

        // Use a short walking time for same-complex transfers (60 seconds)
        const complexWalkTime = 60;

        // Add edge A -> B
        const existingAToB = graph[stationA].find((e) => e.toStationId === stationB);
        if (!existingAToB) {
          graph[stationA].push({
            toStationId: stationB,
            walkingSeconds: complexWalkTime,
            accessible: true, // Assume complex transfers are accessible
            viaLines: stations[stationB]?.lines ?? [],
          });
        }

        // Add edge B -> A
        const existingBToA = graph[stationB].find((e) => e.toStationId === stationA);
        if (!existingBToA) {
          graph[stationB].push({
            toStationId: stationA,
            walkingSeconds: complexWalkTime,
            accessible: true,
            viaLines: stations[stationA]?.lines ?? [],
          });
        }
      }
    }
  }

  return graph;
}

/**
 * Add a single transfer edge to the graph
 */
function addTransferEdge(
  graph: TransferGraph,
  fromStationId: string,
  transfer: TransferConnection
): void {
  if (!graph[fromStationId]) {
    graph[fromStationId] = [];
  }

  // Check if edge already exists
  const existing = graph[fromStationId].find((e) => e.toStationId === transfer.toStationId);
  if (existing) {
    // Update with better (shorter) walking time if available
    if (transfer.walkingSeconds < existing.walkingSeconds) {
      existing.walkingSeconds = transfer.walkingSeconds;
      existing.accessible = transfer.accessible;
      existing.viaLines = transfer.toLines;
    }
    return;
  }

  graph[fromStationId].push({
    toStationId: transfer.toStationId,
    walkingSeconds: transfer.walkingSeconds || DEFAULT_WALKING_SECONDS,
    accessible: transfer.accessible,
    viaLines: transfer.toLines,
  });
}

/**
 * Get all stations reachable from a given station with one transfer
 */
export function getReachableStations(graph: TransferGraph, stationId: string): TransferEdge[] {
  return graph[stationId] ?? [];
}

/**
 * Alias for getReachableStations for API consistency
 */
export const getTransferEdges = getReachableStations;

/**
 * Build transfer graph and return it (alias for buildTransferGraph)
 */
export function buildTransferGraphFromData(
  stations: StationIndex,
  transfers: Record<string, TransferConnection[]>,
  complexes: ComplexIndex
): TransferGraph {
  return buildTransferGraph(stations, transfers, complexes);
}

/**
 * Find transfer points between two lines
 * Returns all stations where a transfer from lineA to lineB is possible
 */
export function findTransferPoints(
  graph: TransferGraph,
  stations: StationIndex,
  lineA: string,
  lineB: string
): Array<{ stationId: string; walkingSeconds: number }> {
  const transferPoints: Array<{ stationId: string; walkingSeconds: number }> = [];

  // Find stations served by lineA
  const lineAStations = Object.values(stations).filter((s) => s.lines.includes(lineA));

  for (const station of lineAStations) {
    // Check if any reachable station serves lineB
    const reachable = graph[station.id] ?? [];

    for (const edge of reachable) {
      const targetStation = stations[edge.toStationId];
      if (targetStation?.lines.includes(lineB)) {
        transferPoints.push({
          stationId: edge.toStationId,
          walkingSeconds: edge.walkingSeconds,
        });
      }
    }
  }

  return transferPoints;
}

/**
 * Check if two stations are in the same complex
 */
export function areInSameComplex(
  complexes: ComplexIndex,
  stationA: string,
  stationB: string
): boolean {
  for (const complex of Object.values(complexes)) {
    if (complex.stations.includes(stationA) && complex.stations.includes(stationB)) {
      return true;
    }
  }
  return false;
}

/**
 * Get all stations in the same complex as a given station
 */
export function getComplexStations(complexes: ComplexIndex, stationId: string): string[] {
  for (const complex of Object.values(complexes)) {
    if (complex.stations.includes(stationId)) {
      return complex.stations;
    }
  }
  return [stationId];
}
