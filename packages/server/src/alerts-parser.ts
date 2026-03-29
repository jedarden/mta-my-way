/**
 * MTA subway alerts parser.
 *
 * Decodes the alerts GTFS-RT feed, extracts affected lines/stations/periods,
 * and simplifies the confusing MTA alert language into plain English using
 * a pattern-based rewriter.
 *
 * Key features:
 * - Pattern matching with named capture groups from alert-patterns.json
 * - Severity mapping: UNKNOWN_EFFECT→info, SIGNIFICANT_DELAYS→warning, NO_SERVICE→severe
 * - Fallback: unmatched alerts shown with raw text + "raw alert" flag
 * - Logs unmatched patterns for growing the pattern library
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { AlertPattern, AlertSeverity, AlertSource, ShuttleBusInfo, StationAlert } from "@mta-my-way/shared";
import { matchShuttle } from "./shuttle-matcher.js";
import { transit_realtime } from "./proto/compiled.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Parsed alert from the GTFS-RT feed */
export interface ParsedAlert {
  id: string;
  /** Raw headline from MTA */
  rawHeadline: string;
  /** Raw description from MTA */
  rawDescription: string;
  /** Simplified headline (plain English) */
  simplifiedHeadline: string;
  /** Simplified description */
  simplifiedDescription: string;
  /** Whether the alert matched a pattern */
  patternMatched: boolean;
  /** ID of the pattern that matched, if any */
  matchedPatternId: string | null;
  /** Affected line IDs extracted from the alert */
  affectedLines: string[];
  /** Affected station IDs extracted from the alert */
  affectedStations: string[];
  /** Active period */
  activePeriod: {
    start: number;
    end?: number;
  };
  /** Cause from GTFS-RT */
  cause: string;
  /** Effect from GTFS-RT */
  effect: string;
  /** Mapped severity */
  severity: AlertSeverity;
  /** Source: official MTA alert */
  source: AlertSource;
  /** Creation timestamp */
  createdAt: number;
  /** Last modified timestamp */
  modifiedAt: number;
  /** Shuttle bus info if matched (Phase 7) */
  shuttleInfo?: ShuttleBusInfo;
}

/** Result of pattern matching */
interface PatternMatchResult {
  matched: boolean;
  patternId: string | null;
  template: string;
  captures: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Severity mapping
// ---------------------------------------------------------------------------

/** GTFS-RT Effect enum values (from proto) */
const EFFECT_NO_SERVICE = 1;
const EFFECT_REDUCED_SERVICE = 2;
const EFFECT_SIGNIFICANT_DELAYS = 3;
const EFFECT_DETOUR = 4;
const EFFECT_ADDITIONAL_SERVICE = 5;
const EFFECT_MODIFIED_SERVICE = 6;
const EFFECT_OTHER_EFFECT = 7;
const EFFECT_UNKNOWN_EFFECT = 8;

/** Map numeric effect to string name */
function effectToString(effect: number | undefined): string {
  if (effect === undefined) return "UNKNOWN_EFFECT";
  switch (effect) {
    case EFFECT_NO_SERVICE:
      return "NO_SERVICE";
    case EFFECT_REDUCED_SERVICE:
      return "REDUCED_SERVICE";
    case EFFECT_SIGNIFICANT_DELAYS:
      return "SIGNIFICANT_DELAYS";
    case EFFECT_DETOUR:
      return "DETOUR";
    case EFFECT_ADDITIONAL_SERVICE:
      return "ADDITIONAL_SERVICE";
    case EFFECT_MODIFIED_SERVICE:
      return "MODIFIED_SERVICE";
    case EFFECT_OTHER_EFFECT:
      return "OTHER_EFFECT";
    case EFFECT_UNKNOWN_EFFECT:
      return "UNKNOWN_EFFECT";
    default:
      return `EFFECT_${effect}`;
  }
}

/** Map GTFS-RT effect to our severity levels */
function mapEffectToSeverity(effect: string | number): AlertSeverity {
  // Handle numeric effect values from protobuf
  const effectNum = typeof effect === "number" ? effect : parseInt(effect, 10);

  if (!isNaN(effectNum)) {
    // Severe: NO_SERVICE (1)
    if (effectNum === EFFECT_NO_SERVICE) {
      return "severe";
    }
    // Warning: REDUCED_SERVICE (2), SIGNIFICANT_DELAYS (3), DETOUR (4)
    if (
      effectNum === EFFECT_REDUCED_SERVICE ||
      effectNum === EFFECT_SIGNIFICANT_DELAYS ||
      effectNum === EFFECT_DETOUR
    ) {
      return "warning";
    }
    // Info: everything else
    return "info";
  }

  // Fallback to string matching for non-numeric values
  const effectUpper = String(effect).toUpperCase();

  // Severe: No service, suspended
  if (
    effectUpper.includes("NO_SERVICE") ||
    effectUpper.includes("NO SERVICE") ||
    effectUpper.includes("SUSPENDED")
  ) {
    return "severe";
  }

  // Warning: Significant delays, reduced service
  if (
    effectUpper.includes("SIGNIFICANT_DELAYS") ||
    effectUpper.includes("SIGNIFICANT DELAYS") ||
    effectUpper.includes("REDUCED_SERVICE") ||
    effectUpper.includes("REDUCED SERVICE") ||
    effectUpper.includes("DETOUR")
  ) {
    return "warning";
  }

  // Info: everything else (unknown effect, minor delays, planned work)
  return "info";
}

// ---------------------------------------------------------------------------
// HTML entity stripping
// ---------------------------------------------------------------------------

/** Strip HTML entities and tags from alert text for cleaner pattern matching */
function stripHtml(text: string): string {
  return text
    .replace(/<[^>]*>/g, "") // Remove HTML tags
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\[([A-Z0-9]+)\]/g, "[$1]") // Normalize bracket spacing
    .replace(/\s+/g, " ") // Collapse whitespace
    .trim();
}

// ---------------------------------------------------------------------------
// Pattern matching
// ---------------------------------------------------------------------------

let patterns: AlertPattern[] | null = null;

/** Load alert patterns from JSON file */
async function loadPatterns(): Promise<AlertPattern[]> {
  if (patterns) return patterns;

  const patternsPath = join(__dirname, "..", "data", "alert-patterns.json");
  const content = await readFile(patternsPath, "utf8");
  patterns = JSON.parse(content) as AlertPattern[];
  return patterns;
}

/** Match an alert text against all patterns */
function matchPatterns(text: string, patterns: AlertPattern[]): PatternMatchResult {
  const cleanText = stripHtml(text);

  for (const pattern of patterns) {
    try {
      const regex = new RegExp(pattern.pattern, "i");
      const match = cleanText.match(regex);

      if (match && match.groups) {
        return {
          matched: true,
          patternId: pattern.id,
          template: pattern.template,
          captures: match.groups,
        };
      }
    } catch (e) {
      // Invalid regex pattern - log and skip
      console.error(
        JSON.stringify({
          event: "alert_pattern_error",
          patternId: pattern.id,
          error: e instanceof Error ? e.message : String(e),
        })
      );
    }
  }

  return {
    matched: false,
    patternId: null,
    template: "",
    captures: {},
  };
}

/** Apply captures to template to generate simplified text */
function applyTemplate(template: string, captures: Record<string, string>): string {
  let result = template;

  for (const [key, value] of Object.entries(captures)) {
    // Handle conditional templates like {cause: due to :}
    // Format: {groupName: prefixIfPresent : suffixIfPresent}
    const conditionalRegex = new RegExp(`\\{${key}:\\s*([^:}]*)\\s*:\\s*([^}]*)\\}`, "g");
    if (conditionalRegex.test(result)) {
      // Reset regex
      result = result.replace(new RegExp(`\\{${key}:\\s*([^:}]*)\\s*:\\s*([^}]*)\\}`, "g"), () => {
        if (value && value.trim()) {
          const prefix = RegExp.$1 || "";
          const suffix = RegExp.$2 || "";
          return `${prefix}${value}${suffix}`;
        }
        return "";
      });
    } else {
      // Simple replacement
      result = result.replace(new RegExp(`\\{${key}\\}`, "g"), value || "");
    }
  }

  // Clean up extra whitespace
  return result.replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Line extraction
// ---------------------------------------------------------------------------

/** Extract line IDs from alert text and informed entities */
function extractAffectedLines(
  headline: string,
  description: string,
  entities: transit_realtime.IFeedEntity[]
): string[] {
  const lines = new Set<string>();

  // Extract from [X], [X,Y] patterns in text
  const text = `${headline} ${description}`;
  const bracketPattern = /\[([A-Z0-9,\s]+)\]/g;
  let match;
  while ((match = bracketPattern.exec(text)) !== null) {
    const lineStr = match[1] ?? "";
    const lineList = lineStr.split(/[,\s]+/).filter((l) => l.length > 0);
    for (const line of lineList) {
      lines.add(line);
    }
  }

  // Extract from GTFS-RT informed entities (route_id)
  for (const entity of entities) {
    if (entity.alert?.informedEntity) {
      for (const ie of entity.alert.informedEntity) {
        if (ie.routeId) {
          lines.add(ie.routeId);
        }
      }
    }
  }

  return Array.from(lines).sort();
}

// ---------------------------------------------------------------------------
// Main parsing function
// ---------------------------------------------------------------------------

/** Unmatched pattern logger - track patterns we couldn't match */
const unmatchedLog: Array<{
  alertId: string;
  text: string;
  timestamp: number;
}> = [];

/** Log unmatched alerts for pattern library growth */
function logUnmatched(alertId: string, text: string): void {
  unmatchedLog.push({
    alertId,
    text: stripHtml(text),
    timestamp: Date.now(),
  });

  // Keep only last 100 unmatched alerts
  if (unmatchedLog.length > 100) {
    unmatchedLog.shift();
  }
}

/** Get recent unmatched alerts for analysis */
export function getUnmatchedAlerts(): typeof unmatchedLog {
  return [...unmatchedLog];
}

/**
 * Parse the alerts GTFS-RT feed into structured ParsedAlert objects.
 *
 * @param data Raw protobuf binary data from the alerts feed
 * @returns Array of parsed alerts
 */
export async function parseAlerts(data: Uint8Array): Promise<ParsedAlert[]> {
  const loadedPatterns = await loadPatterns();
  const message = transit_realtime.FeedMessage.decode(data);
  const alerts: ParsedAlert[] = [];
  const now = Math.floor(Date.now() / 1000);

  for (const entity of message.entity) {
    if (!entity.alert) continue;

    const alert = entity.alert;
    const alertId = entity.id || `alert-${now}-${Math.random().toString(36).slice(2, 8)}`;

    // Extract text fields
    const rawHeadline = alert.headerText?.translation?.[0]?.text || "";
    const rawDescription = alert.descriptionText?.translation?.[0]?.text || "";

    // Combine headline + description for pattern matching
    const fullText = `${rawHeadline} ${rawDescription}`;

    // Pattern matching
    const matchResult = matchPatterns(fullText, loadedPatterns);

    let simplifiedHeadline: string;
    let simplifiedDescription: string;

    if (matchResult.matched && matchResult.patternId) {
      simplifiedHeadline = applyTemplate(matchResult.template, matchResult.captures);
      simplifiedDescription = rawDescription; // Keep full description
    } else {
      // Fallback: use raw text with indication
      simplifiedHeadline = stripHtml(rawHeadline);
      simplifiedDescription = stripHtml(rawDescription);

      // Log unmatched for pattern library growth
      logUnmatched(alertId, fullText);
    }

    // Extract affected lines from this alert's informed entities
    const affectedLines = extractAffectedLines(rawHeadline, rawDescription, [entity]);

    // Extract affected station stop IDs from informed entities
    const affectedStations: string[] = [];
    if (alert.informedEntity) {
      for (const ie of alert.informedEntity) {
        if (ie.stopId) {
          affectedStations.push(ie.stopId);
        }
      }
    }

    // Extract active period
    let activeStart = now;
    let activeEnd: number | undefined;

    if (alert.activePeriod && alert.activePeriod.length > 0) {
      const period = alert.activePeriod[0];
      if (period?.start) {
        activeStart = Number(period.start);
      }
      if (period?.end) {
        activeEnd = Number(period.end);
      }
    }

    // Extract cause and effect
    const cause = alert.cause?.toString() || "UNKNOWN_CAUSE";
    const effect = typeof alert.effect === "number" ? effectToString(alert.effect) : (alert.effect?.toString() || "UNKNOWN_EFFECT");

    // Map effect to severity
    const severity = mapEffectToSeverity(effect);

    const parsedAlert: ParsedAlert = {
      id: alertId,
      rawHeadline,
      rawDescription,
      simplifiedHeadline,
      simplifiedDescription,
      patternMatched: matchResult.matched,
      matchedPatternId: matchResult.patternId,
      affectedLines,
      affectedStations,
      activePeriod: {
        start: activeStart,
        end: activeEnd,
      },
      cause,
      effect,
      severity,
      source: "official",
      createdAt: now,
      modifiedAt: now,
    };

    alerts.push(parsedAlert);
  }

  // Phase 7: Match shuttle bus info for NO_SERVICE alerts
  for (const alert of alerts) {
    if (alert.effect === "NO_SERVICE" && alert.affectedLines.length > 0) {
      const shuttleInfo = await matchShuttle(alert.affectedLines, alert.affectedStations);
      if (shuttleInfo) {
        alert.shuttleInfo = shuttleInfo;
      }
    }
  }

  return alerts;
}

/**
 * Convert ParsedAlert to StationAlert format for the API.
 */
export function toStationAlert(parsed: ParsedAlert): StationAlert {
  return {
    id: parsed.id,
    severity: parsed.severity,
    source: parsed.source,
    headline: parsed.simplifiedHeadline,
    description: parsed.simplifiedDescription,
    affectedLines: parsed.affectedLines,
    activePeriod: parsed.activePeriod,
    cause: parsed.cause,
    effect: parsed.effect,
    isRaw: !parsed.patternMatched,
    shuttleInfo: parsed.shuttleInfo,
  };
}

/**
 * Get the pattern match rate (for health endpoint).
 * Returns the percentage of alerts that matched a pattern.
 */
export function calculateMatchRate(alerts: ParsedAlert[]): number {
  if (alerts.length === 0) return 1;
  const matched = alerts.filter((a) => a.patternMatched).length;
  return matched / alerts.length;
}
