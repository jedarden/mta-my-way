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
}

/**
 * Decode a raw protobuf buffer into a structured FeedMessage.
 * Throws on malformed input.
 */
export function parseFeed(feedId: string, data: Uint8Array): ParsedFeed {
  const message = transit_realtime.FeedMessage.decode(data);
  const feedTimestamp = Number(message.header.timestamp);
  const entityCount = message.entity?.length ?? 0;
  return { feedId, message, feedTimestamp, entityCount };
}
