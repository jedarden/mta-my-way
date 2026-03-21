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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nyctHeader = (message.header as any)[NYCT_FEED_HEADER_KEY] as
    | { trip_replacement_period?: number | { toNumber(): number } | null }
    | null
    | undefined;
  let tripReplacementPeriod: number | null = null;
  if (nyctHeader?.trip_replacement_period != null) {
    const v = nyctHeader.trip_replacement_period;
    tripReplacementPeriod = typeof v === "number" ? v : v.toNumber();
  }

  return { feedId, message, feedTimestamp, entityCount, tripReplacementPeriod };
}
