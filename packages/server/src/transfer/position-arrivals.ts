/**
 * Position-adjusted arrival reader
 *
 * The arrivals cache is schedule-derived: the transformer copies predicted
 * times out of each feed's trip updates once per poll cycle, so an arrival can
 * say "2 minutes away" for a train the vehicle-position stream has already
 * reported running twenty minutes late. Feeding the TransferEngine from that
 * cache alone makes commute recommendations reason about the timetable rather
 * than about observed train motion.
 *
 * This module wraps the cache reader and corrects each arrival against the
 * vehicle-position stream before the engine sees it. The join key is the GTFS
 * trip ID, which both sides carry (`ArrivalTime.tripId` / `TrainPosition.tripId`):
 *
 * - A train with an observed delay has its arrival shifted by that delay.
 * - A train whose corrected arrival has already passed is dropped — the
 *   observed motion says it is no longer boardable at this station.
 * - A trip with no position observation (feed gap, unassigned trip, or the
 *   MTA simply omitting `delay`) keeps its cached time untouched.
 *
 * The reader never mutates the cached `StationArrivals`; it returns a new
 * object so the arrivals API and the engine can disagree safely.
 */

import type { ArrivalTime, LinePositions, StationArrivals } from "@mta-my-way/shared";

/**
 * Upper bound on the adjustment a single observation may apply, in seconds.
 *
 * The engine already discards any arrival whose wait exceeds 30 minutes
 * (MAX_WAIT_TIME_SECONDS in engine.ts), so corrections past that bound cannot
 * change an outcome — they only amplify a bad feed reading. Clamping here
 * keeps a malformed `delay` from pushing an arrival into the next hour.
 */
export const MAX_DELAY_ADJUSTMENT_SECONDS = 1800;

/** Reads arrivals for a station, as the TransferEngine consumes them */
export type ArrivalReader = (stationId: string) => StationArrivals | null;

/** Configuration for {@link createPositionAdjustedReader} */
export interface PositionAdjustedConfig {
  /** The schedule-derived arrivals cache */
  getArrivals: (stationId: string) => StationArrivals | null;
  /** The vehicle-position stream, indexed by route ID */
  getPositions: (routeId: string) => LinePositions | null;
  /** Current time in POSIX seconds; defaults to the wall clock. Injectable for tests. */
  nowSeconds?: () => number;
}

/** Clamp an observed delay to the adjustment bound */
function clampDelay(delay: number): number {
  if (!Number.isFinite(delay)) return 0;
  return Math.max(-MAX_DELAY_ADJUSTMENT_SECONDS, Math.min(MAX_DELAY_ADJUSTMENT_SECONDS, delay));
}

/**
 * Wrap an arrivals reader so arrivals are corrected by observed train motion.
 *
 * The returned reader has the same signature as the one it wraps, so it can be
 * handed to `createTransferEngine` in place of the raw cache reader. Stations
 * with no cached arrivals return null exactly as before, and a station whose
 * trips carry no usable position observations comes back byte-for-byte
 * identical to the cache.
 */
export function createPositionAdjustedReader(config: PositionAdjustedConfig): ArrivalReader {
  const nowSeconds = config.nowSeconds ?? ((): number => Date.now() / 1000);

  return (stationId: string): StationArrivals | null => {
    const base = config.getArrivals(stationId);
    if (!base) return null;

    // Collect observed delay per trip across every line serving this station.
    // Positions are keyed by route, so one lookup per distinct line is enough.
    const delayByTrip = new Map<string, number>();
    let feedAge = base.feedAge;
    let observed = false;
    const seenLines = new Set<string>();

    for (const arrival of [...base.northbound, ...base.southbound]) {
      // Arrivals carry their route in `line`; the engine never matches one
      // without it, so there is nothing to correct for it either. Guarding
      // here keeps a malformed cached arrival from rejecting the whole
      // analysis — positions are indexed by route ID and would throw.
      if (typeof arrival.line !== "string" || arrival.line === "") continue;
      if (seenLines.has(arrival.line)) continue;
      seenLines.add(arrival.line);

      const positions = config.getPositions(arrival.line);
      if (!positions) continue;
      observed = true;
      feedAge = Math.max(feedAge, positions.feedAge);

      for (const train of positions.trains) {
        if (typeof train.delay === "number" && Number.isFinite(train.delay)) {
          delayByTrip.set(train.tripId, train.delay);
        }
      }
    }

    // Nothing observed for any of this station's trips: the cache is the best
    // available estimate and the reader is a pass-through.
    if (!observed || delayByTrip.size === 0) return base;

    const adjust = (arrivals: ArrivalTime[]): ArrivalTime[] => {
      const adjusted: ArrivalTime[] = [];

      for (const arrival of arrivals) {
        const delay = delayByTrip.get(arrival.tripId);
        if (delay === undefined) {
          adjusted.push(arrival);
          continue;
        }

        const arrivalTime = arrival.arrivalTime + clampDelay(delay);

        // The train is observed to have already passed this station — it is
        // not boardable, however the schedule-side cache describes it.
        if (arrivalTime <= nowSeconds()) continue;

        adjusted.push({
          ...arrival,
          arrivalTime,
          minutesAway: Math.round((arrivalTime - nowSeconds()) / 60),
        });
      }

      // Shifting individual arrivals can reorder them; the engine relies on
      // the array being sorted when it takes the first three.
      return adjusted.sort((a, b) => a.arrivalTime - b.arrivalTime);
    };

    return {
      ...base,
      feedAge,
      northbound: adjust(base.northbound),
      southbound: adjust(base.southbound),
    };
  };
}
