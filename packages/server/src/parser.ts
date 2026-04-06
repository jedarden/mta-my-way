/**
 * GTFS-RT protobuf parser.
 *
 * Decodes raw binary feed data into a typed FeedMessage using the compiled
 * protobuf bindings. NYCT extensions are accessed via string keys on the
 * decoded message objects (e.g. ".transit_realtime.nyctTripDescriptor").
 */

import { transit_realtime } from "./proto/compiled.js";

export interface ParsedFeed {
  feedId: string;
  message: transit_realtime.FeedMessage;
  /** POSIX timestamp (seconds) from the feed header */
  feedTimestamp: number;
  entityCount: number;
  /**
   * Trip replacement period (seconds) from NYCT feed header extension.
   * During this window, scheduled trips absent from the feed are considered cancelled.
   */
  tripReplacementPeriod: number | null;
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

  // Extract trip replacement period from NYCT feed header extension
  // The tripReplacementPeriod is an array of { routeId, replacementPeriod: { start, end } }
  // We calculate the duration from the first entry's replacement period
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nyctHeader = (message.header as any)[NYCT_FEED_HEADER_KEY] as
    | {
        tripReplacementPeriod?: Array<{
          replacementPeriod?: {
            start?: number | { toNumber(): number };
            end?: number | { toNumber(): number };
          };
        }> | null;
      }
    | null
    | undefined;
  let tripReplacementPeriod: number | null = null;
  if (nyctHeader?.tripReplacementPeriod?.length) {
    const firstPeriod = nyctHeader.tripReplacementPeriod[0];
    if (firstPeriod?.replacementPeriod) {
      const start = firstPeriod.replacementPeriod.start;
      const end = firstPeriod.replacementPeriod.end;
      if (start != null && end != null) {
        const startNum = typeof start === "number" ? start : start.toNumber();
        const endNum = typeof end === "number" ? end : end.toNumber();
        tripReplacementPeriod = endNum - startNum;
      }
    }
  }

  return { feedId, message, feedTimestamp, entityCount, tripReplacementPeriod };
}
