/**
 * GTFS-RT protobuf parser.
 *
 * Decodes raw binary feed data into a typed FeedMessage using the compiled
 * protobuf bindings. NYCT extensions are accessed via string keys on the
 * decoded message objects (e.g. ".transit_realtime.nyctTripDescriptor").
 */

import { transit_realtime } from "./proto/compiled.js";

/** A single NYCT trip replacement window — the feed is authoritative for its route within [start, end] */
export interface TripReplacementWindow {
  /** Route ID this window applies to, or null/"*" for all routes in the feed */
  routeId: string | null;
  /** POSIX timestamp (seconds) — start of replacement window */
  start: number;
  /** POSIX timestamp (seconds) — end of replacement window (typically now + 30 min) */
  end: number;
}

export interface ParsedFeed {
  feedId: string;
  message: transit_realtime.FeedMessage;
  /** POSIX timestamp (seconds) from the feed header */
  feedTimestamp: number;
  entityCount: number;
  /**
   * Trip replacement period (seconds) from NYCT feed header extension.
   * During this window, scheduled trips absent from the feed are considered cancelled.
   * Kept for backward compatibility (health endpoint); duration of the first window entry.
   */
  tripReplacementPeriod: number | null;
  /**
   * Full list of trip replacement windows from the NYCT feed header, one per route
   * (or a single entry with routeId null/"*" covering all routes).
   * Used by the transformer to detect cancelled trips.
   */
  tripReplacementPeriods: TripReplacementWindow[];
}

/** NYCT feed header extension key as used in protobufjs decoded objects */
const NYCT_FEED_HEADER_KEY = ".transit_realtime.nyctFeedHeader";

/**
 * Decode a raw protobuf buffer into a structured FeedMessage.
 * Throws on malformed input.
 */
export function parseFeed(feedId: string, data: Uint8Array): ParsedFeed {
  const message = transit_realtime.FeedMessage.decode(data);
  const feedTimestamp = Number(message.header.timestamp);
  const entityCount = message.entity?.length ?? 0;

  // Extract trip replacement periods from NYCT feed header extension.
  // The tripReplacementPeriod is an array of { routeId, replacementPeriod: { start, end } }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nyctHeader = (message.header as any)[NYCT_FEED_HEADER_KEY] as
    | {
        tripReplacementPeriod?: Array<{
          routeId?: string | null;
          replacementPeriod?: {
            start?: number | { toNumber(): number };
            end?: number | { toNumber(): number };
          };
        }> | null;
      }
    | null
    | undefined;

  const tripReplacementPeriods: TripReplacementWindow[] = [];
  if (nyctHeader?.tripReplacementPeriod?.length) {
    for (const period of nyctHeader.tripReplacementPeriod) {
      if (!period.replacementPeriod) continue;
      const start = period.replacementPeriod.start;
      const end = period.replacementPeriod.end;
      if (start == null || end == null) continue;
      const startNum = typeof start === "number" ? start : start.toNumber();
      const endNum = typeof end === "number" ? end : end.toNumber();
      tripReplacementPeriods.push({
        routeId: period.routeId ?? null,
        start: startNum,
        end: endNum,
      });
    }
  }

  // Backward-compat: duration of the first window entry
  const tripReplacementPeriod =
    tripReplacementPeriods.length > 0
      ? tripReplacementPeriods[0].end - tripReplacementPeriods[0].start
      : null;

  return {
    feedId,
    message,
    feedTimestamp,
    entityCount,
    tripReplacementPeriod,
    tripReplacementPeriods,
  };
}
