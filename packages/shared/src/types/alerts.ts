/**
 * Service alert types (Phase 3)
 * Includes both official MTA alerts and predicted alerts from delay detection
 */

/** Alert severity levels */
export type AlertSeverity = "info" | "warning" | "severe";

/** Alert source: official MTA or predicted by our system (Phase 5) */
export type AlertSource = "official" | "predicted";

/**
 * Service alert scoped to a station
 */
export interface StationAlert {
  /** Unique alert identifier */
  id: string;
  /** Severity classification */
  severity: AlertSeverity;
  /** Source of the alert */
  source: AlertSource;
  /** Simplified, plain-language headline */
  headline: string;
  /** Full description text */
  description: string;
  /** Lines affected by this alert */
  affectedLines: string[];
  /** When the alert is active */
  activePeriod: {
    /** Alert start time (POSIX timestamp) */
    start: number;
    /** Alert end time (POSIX timestamp), if known */
    end?: number;
  };
  /** Cause of the disruption (from GTFS-RT) */
  cause: string;
  /** Effect type (from GTFS-RT): DELAY, NO_SERVICE, etc. */
  effect: string;
  /** Shuttle bus info if service is replaced (Phase 7) */
  shuttleInfo?: ShuttleBusInfo;
}

/**
 * Shuttle bus replacement information (Phase 7)
 * Curated static data for common suspension patterns
 */
export interface ShuttleBusInfo {
  /** Line ID with suspended service */
  lineId: string;
  /** Stop ID where suspension begins */
  fromStopId: string;
  /** Stop ID where suspension ends */
  toStopId: string;
  /** Shuttle bus stop locations */
  stops: ShuttleStop[];
  /** Approximate shuttle frequency, e.g., "8-12" minutes */
  frequencyMinutes: string;
  /** When this data was last verified (ISO date) */
  lastVerified: string;
}

/**
 * A single shuttle bus stop
 */
export interface ShuttleStop {
  /** Nearby station ID */
  nearStationId: string;
  /** Human-readable location description */
  description: string;
  /** Optional latitude */
  lat?: number;
  /** Optional longitude */
  lon?: number;
}

/**
 * Alert pattern for simplification (Phase 3)
 * Maps MTA alert patterns to plain English templates
 */
export interface AlertPattern {
  /** Unique pattern identifier */
  id: string;
  /** Regex to match MTA alert text, with named capture groups */
  pattern: string;
  /** Plain English template using captured groups, e.g., "{Dir} {lines} trains skipping {stations}" */
  template: string;
  /** Example MTA alert text that matches this pattern */
  exampleMatch: string;
  /** Example simplified output */
  exampleOutput: string;
}

/**
 * System-wide line status (Phase 6: system health dashboard)
 */
export type LineStatus = "normal" | "minor_delays" | "significant_delays" | "suspended";

/**
 * Status of a single line for the health dashboard
 */
export interface LineHealthStatus {
  /** Route ID */
  lineId: string;
  /** Current status */
  status: LineStatus;
  /** Brief summary when not normal */
  summary?: string;
  /** Timestamp of last status update */
  updatedAt: number;
}

/**
 * System-wide health summary (Phase 6)
 */
export interface SystemHealth {
  /** Percentage of lines operating normally */
  healthPercentage: number;
  /** Per-line status */
  lines: LineHealthStatus[];
  /** When this summary was computed */
  computedAt: number;
}
