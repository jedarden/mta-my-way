/**
 * Transfer analysis module
 *
 * Provides transfer route computation for the MTA My Way commute analysis feature.
 */

export {
  buildTransferGraph,
  getReachableStations,
  findTransferPoints,
  areInSameComplex,
  getComplexStations,
} from "./graph.js";
export {
  loadTravelTimes,
  getTravelTimes,
  getTravelTime,
  calculateRouteTravelTime,
  estimateTravelTimeByStops,
  countStopsBetween,
  determineDirection,
  routeServesBoth,
} from "./travel-times.js";
export { TransferEngine, createTransferEngine } from "./engine.js";
export type { EngineConfig } from "./engine.js";
export {
  createPositionAdjustedReader,
  MAX_DELAY_ADJUSTMENT_SECONDS,
} from "./position-arrivals.js";
export type { ArrivalReader, PositionAdjustedConfig } from "./position-arrivals.js";
