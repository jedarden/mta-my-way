/**
 * MTA GTFS-RT feed configuration
 * Feed URLs and polling intervals
 */

/** Base URL for MTA GTFS-RT feeds */
export const MTA_FEED_BASE_URL = "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct";

/** Base URL for MTA alerts feed */
export const MTA_ALERTS_FEED_URL = "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys/subway-alerts";

/** Base URL for GTFS static data */
export const GTFS_STATIC_BASE_URL = "https://rrgtfsfeeds.s3.amazonaws.com";

/**
 * Subway GTFS-RT feed definitions
 * Each feed contains real-time data for specific lines
 */
export interface FeedConfig {
  /** Feed identifier used in API paths */
  id: string;
  /** Human-readable name */
  name: string;
  /** Lines covered by this feed */
  lines: string[];
  /** Full feed URL */
  url: string;
}

/**
 * All subway GTFS-RT feeds
 */
export const SUBWAY_FEEDS: FeedConfig[] = [
  {
    id: "gtfs",
    name: "A Division",
    lines: ["1", "2", "3", "4", "5", "6", "7", "S", "GS"],
    url: `${MTA_FEED_BASE_URL}/gtfs`,
  },
  {
    id: "gtfs-ace",
    name: "A/C/E Lines",
    lines: ["A", "C", "E", "H", "FS"],
    url: `${MTA_FEED_BASE_URL}/gtfs-ace`,
  },
  {
    id: "gtfs-bdfm",
    name: "B/D/F/M Lines",
    lines: ["B", "D", "F", "M"],
    url: `${MTA_FEED_BASE_URL}/gtfs-bdfm`,
  },
  {
    id: "gtfs-g",
    name: "G Line",
    lines: ["G"],
    url: `${MTA_FEED_BASE_URL}/gtfs-g`,
  },
  {
    id: "gtfs-jz",
    name: "J/Z Lines",
    lines: ["J", "Z"],
    url: `${MTA_FEED_BASE_URL}/gtfs-jz`,
  },
  {
    id: "gtfs-l",
    name: "L Line",
    lines: ["L"],
    url: `${MTA_FEED_BASE_URL}/gtfs-l`,
  },
  {
    id: "gtfs-nqrw",
    name: "N/Q/R/W Lines",
    lines: ["N", "Q", "R", "W"],
    url: `${MTA_FEED_BASE_URL}/gtfs-nqrw`,
  },
  {
    id: "gtfs-si",
    name: "Staten Island Railway",
    lines: ["SIR"],
    url: `${MTA_FEED_BASE_URL}/gtfs-si`,
  },
];

/**
 * Map of line ID to feed ID
 */
export const LINE_TO_FEED: Record<string, string> = Object.fromEntries(
  SUBWAY_FEEDS.flatMap((feed) => feed.lines.map((line) => [line, feed.id]))
);

/**
 * Get the feed config for a given line
 */
export function getFeedForLine(lineId: string): FeedConfig | undefined {
  const feedId = LINE_TO_FEED[lineId];
  return SUBWAY_FEEDS.find((f) => f.id === feedId);
}

/**
 * Get the feed config by feed ID
 */
export function getFeedById(feedId: string): FeedConfig | undefined {
  return SUBWAY_FEEDS.find((f) => f.id === feedId);
}

/**
 * Polling intervals in seconds
 */
export const POLLING_INTERVALS = {
  /** Default interval for arrival feeds (matches MTA update frequency) */
  arrivals: 30,
  /** Alerts feed interval (alerts have 10-minute freshness window) */
  alerts: 60,
  /** Equipment status interval (changes slowly) */
  equipment: 300,
  /** Minimum allowed refresh interval (user setting) */
  minRefresh: 15,
  /** Maximum age before data is considered stale (seconds) */
  staleThreshold: 90,
  /** Maximum age before data is grayed out (seconds) */
  grayThreshold: 300,
} as const;

/**
 * Cache TTLs in seconds for HTTP headers
 */
export const CACHE_TTLS = {
  /** API responses: short TTL for edge caching */
  api: 15,
  /** Static PWA assets: long TTL (content-hashed filenames) */
  static: 31536000,
  /** GTFS static data: daily refresh with week-long stale-while-revalidate */
  gtfsStatic: 86400,
  gtfsStaticStale: 604800,
} as const;

/**
 * GTFS static data URLs
 */
export const GTFS_STATIC_URLS = {
  /** Base schedule */
  base: `${GTFS_STATIC_BASE_URL}/gtfs_subway.zip`,
  /** 7-day service changes */
  supplemented: `${GTFS_STATIC_BASE_URL}/gtfs_supplemented.zip`,
} as const;
