/**
 * Predictive delay modeling using historical MTA data.
 *
 * Analyzes patterns in delay frequencies by route, time of day, day of week,
 * and weather conditions. Provides delay probability estimates for trips.
 *
 * Design:
 * - Collects delay data from the real-time delay detector
 * - Buckets data by time of day and day category
 * - Computes statistical aggregations for route/segment combinations
 * - Provides predictions based on historical patterns
 *
 * Data retention:
 * - In-memory storage with configurable max records (default: 100k)
 * - Optional persistence to JSON file
 */

import type {
  DayCategory,
  DelayFactor,
  DelayPattern,
  DelayPrediction,
  DelayRecord,
  DelayStats,
  RouteDelaySummary,
  StationIndex,
  TimeBucket,
  TravelTimeIndex,
  WeatherCondition,
} from "@mta-my-way/shared";
import { logger } from "./observability/logger.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Maximum number of delay records to keep in memory */
const MAX_DELAY_RECORDS = 100_000;

/** Minimum observations before providing predictions */
const MIN_OBSERVATIONS_FOR_PREDICTION = 5;

/** Default weather condition when no data available */
const DEFAULT_WEATHER: WeatherCondition = "clear";

/** Probability threshold for considering a delay "likely" */
const _DELAY_PROBABILITY_THRESHOLD = 0.3;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Delay record with metadata for internal storage */
interface StoredDelayRecord extends DelayRecord {
  /** Unix timestamp for faster sorting */
  timestampMs: number;
}

/** Aggregated delay statistics keyed by pattern */
interface _PatternKey {
  routeId: string;
  direction: "N" | "S";
  fromStationId: string;
  toStationId: string;
  timeBucket: TimeBucket;
  dayCategory: DayCategory;
}

/** Aggregated stats for a pattern */
interface AggregatedStats {
  routeId: string;
  direction: "N" | "S";
  fromStationId: string;
  toStationId: string;
  timeBucket: TimeBucket;
  dayCategory: DayCategory;
  totalObservations: number;
  delayCount: number;
  delayRatios: number[];
  lastUpdated: number;
}

/** Delay predictor configuration */
export interface DelayPredictorConfig {
  /** Max delay records to keep in memory (default: 100k) */
  maxRecords?: number;
  /** Minimum observations for predictions (default: 5) */
  minObservations?: number;
  /** Path to persist delay data (optional) */
  persistencePath?: string;
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

/** Historical delay records */
let delayRecords: StoredDelayRecord[] = [];

/** Aggregated statistics by pattern key */
const aggregatedStats = new Map<string, AggregatedStats>();

/** Weather override (for testing; null = use actual weather) */
let weatherOverride: WeatherCondition | null = null;

/** Current weather condition (cached) */
let currentWeather: WeatherCondition = DEFAULT_WEATHER;

let config: Required<DelayPredictorConfig>;
let _travelTimes: TravelTimeIndex | null = null;
let stations: StationIndex | null = null;

// ---------------------------------------------------------------------------
// Time bucket utilities
// ---------------------------------------------------------------------------

/**
 * Get the time bucket for a given hour
 */
export function getTimeBucket(hour: number): TimeBucket {
  if (hour >= 4 && hour < 6) return "early_morning";
  if (hour >= 6 && hour < 10) return "morning_rush";
  if (hour >= 10 && hour < 15) return "midday";
  if (hour >= 15 && hour < 19) return "evening_rush";
  return "night";
}

/**
 * Get the time bucket for a timestamp
 */
export function getTimeBucketForTimestamp(timestamp: number): TimeBucket {
  const date = new Date(timestamp);
  return getTimeBucket(date.getHours());
}

/**
 * Get the day category for a date
 */
export function getDayCategory(date: Date): DayCategory {
  const day = date.getDay();
  if (day === 0) return "sunday";
  if (day === 6) return "saturday";
  return "weekday";
}

/**
 * Get the day category for a timestamp
 */
export function getDayCategoryForTimestamp(timestamp: number): DayCategory {
  return getDayCategory(new Date(timestamp));
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Initialize the delay predictor with dependencies.
 */
export function initDelayPredictor(
  travelTimesData: TravelTimeIndex,
  stationData: StationIndex,
  predictorConfig?: DelayPredictorConfig
): void {
  _travelTimes = travelTimesData;
  stations = stationData;
  config = {
    maxRecords: predictorConfig?.maxRecords ?? MAX_DELAY_RECORDS,
    minObservations: predictorConfig?.minObservations ?? MIN_OBSERVATIONS_FOR_PREDICTION,
    persistencePath: predictorConfig?.persistencePath ?? "",
  };

  logger.info("Delay predictor initialized", {
    maxRecords: config.maxRecords,
    minObservations: config.minObservations,
  });
}

// ---------------------------------------------------------------------------
// Data collection
// ---------------------------------------------------------------------------

/**
 * Record a delay observation from the delay detector.
 * Called automatically when a delayed segment is detected.
 */
export function recordDelay(
  routeId: string,
  direction: "N" | "S",
  fromStationId: string,
  toStationId: string,
  actualSeconds: number,
  scheduledSeconds: number,
  tripId: string
): void {
  const now = Date.now();
  const delayRatio = actualSeconds / scheduledSeconds;

  const record: StoredDelayRecord = {
    id: `${tripId}-${fromStationId}-${toStationId}-${now}`,
    routeId,
    direction,
    fromStationId,
    toStationId,
    actualSeconds,
    scheduledSeconds,
    delayRatio,
    timestamp: new Date(now).toISOString(),
    timestampMs: now,
    timeBucket: getTimeBucketForTimestamp(now),
    dayCategory: getDayCategoryForTimestamp(now),
    tripId,
    weather: weatherOverride ?? currentWeather,
  };

  delayRecords.push(record);

  // Trim if exceeding max
  if (delayRecords.length > config.maxRecords) {
    delayRecords = delayRecords.slice(-config.maxRecords);
  }

  // Update aggregated stats
  updateAggregatedStats(record);

  logger.debug("Delay recorded", {
    routeId,
    direction,
    from: fromStationId,
    to: toStationId,
    delayRatio: Math.round(delayRatio * 100) / 100,
    totalRecords: delayRecords.length,
  });
}

/**
 * Update aggregated statistics for a pattern
 */
function updateAggregatedStats(record: StoredDelayRecord): void {
  const key = buildPatternKey(
    record.routeId,
    record.direction,
    record.fromStationId,
    record.toStationId,
    record.timeBucket,
    record.dayCategory
  );

  let stats = aggregatedStats.get(key);

  if (!stats) {
    stats = {
      routeId: record.routeId,
      direction: record.direction,
      fromStationId: record.fromStationId,
      toStationId: record.toStationId,
      timeBucket: record.timeBucket,
      dayCategory: record.dayCategory,
      totalObservations: 0,
      delayCount: 0,
      delayRatios: [],
      lastUpdated: Date.now(),
    };
    aggregatedStats.set(key, stats);
  }

  stats.totalObservations++;
  stats.delayCount++;
  stats.delayRatios.push(record.delayRatio);
  stats.lastUpdated = Date.now();

  // Keep only last 1000 delay ratios per pattern
  if (stats.delayRatios.length > 1000) {
    stats.delayRatios = stats.delayRatios.slice(-1000);
  }
}

/**
 * Build a pattern key for aggregated stats lookup
 */
function buildPatternKey(
  routeId: string,
  direction: "N" | "S",
  fromStationId: string,
  toStationId: string,
  timeBucket: TimeBucket,
  dayCategory: DayCategory
): string {
  return `${routeId}:${direction}:${fromStationId}:${toStationId}:${timeBucket}:${dayCategory}`;
}

// ---------------------------------------------------------------------------
// Prediction API
// ---------------------------------------------------------------------------

/**
 * Get a delay prediction for a trip between two stations.
 * Returns prediction with probability and factors.
 */
export function predictDelay(
  routeId: string,
  direction: "N" | "S",
  fromStationId: string,
  toStationId: string,
  scheduledSeconds: number
): DelayPrediction | null {
  if (!stations) return null;

  const now = Date.now();
  const timeBucket = getTimeBucketForTimestamp(now);
  const dayCategory = getDayCategoryForTimestamp(now);

  // Get historical stats for this pattern
  const stats = getStatsForPattern(
    routeId,
    direction,
    fromStationId,
    toStationId,
    timeBucket,
    dayCategory
  );

  if (!stats || stats.totalObservations < config.minObservations) {
    // Not enough data - return null
    return null;
  }

  // Calculate base delay probability
  const delayProbability = stats.delayCount / stats.totalObservations;

  // Get weather impact
  const weather = weatherOverride ?? currentWeather;
  const weatherFactor = getWeatherFactor(weather);

  // Adjust probability based on weather
  const adjustedProbability = Math.min(1, delayProbability * (1 + weatherFactor.impact));

  // Calculate predicted time
  const avgDelayRatio = stats.delayRatios.reduce((a, b) => a + b, 0) / stats.delayRatios.length;
  const predictedSeconds = scheduledSeconds * avgDelayRatio;

  // Determine severity
  const severity = getDelaySeverity(avgDelayRatio);

  // Build factors list
  const factors: DelayFactor[] = [
    {
      type: "historical",
      description: `Based on ${stats.totalObservations} historical observations`,
      impact: delayProbability - 0.2, // Baseline
      weight: 0.6,
    },
    {
      type: "time_of_day",
      description: `Current time bucket: ${timeBucket.replace(/_/g, " ")}`,
      impact: getTimeBucketFactor(timeBucket),
      weight: 0.2,
    },
    {
      type: "day_of_week",
      description: `Today is a ${dayCategory}`,
      impact: getDayCategoryFactor(dayCategory),
      weight: 0.1,
    },
    weatherFactor,
  ];

  // Add segment-specific factor if we have enough data
  const segmentStats = getSegmentStats(routeId, fromStationId, toStationId);
  if (segmentStats && segmentStats.totalObservations >= config.minObservations) {
    factors.push({
      type: "segment",
      description: `This segment has ${Math.round(segmentStats.avgDelayRatio * 100)}% average delay ratio`,
      impact: segmentStats.avgDelayRatio - 1,
      weight: 0.1,
    });
  }

  const fromStation = stations[fromStationId]?.name ?? fromStationId;
  const toStation = stations[toStationId]?.name ?? toStationId;

  return {
    tripId: `prediction-${now}`,
    routeId,
    direction,
    fromStationId,
    fromStationName: fromStation,
    toStationId,
    toStationName: toStation,
    scheduledMinutes: Math.round(scheduledSeconds / 60),
    predictedMinutes: Math.round(predictedSeconds / 60),
    delayProbability: Math.round(adjustedProbability * 100) / 100,
    delaySeverity: severity,
    confidence: calculateConfidence(stats.totalObservations),
    factors,
    predictedAt: new Date(now).toISOString(),
  };
}

/**
 * Get delay probability for a route at current time
 */
export function getRouteDelayProbability(routeId: string, direction: "N" | "S"): number | null {
  const now = Date.now();
  const timeBucket = getTimeBucketForTimestamp(now);
  const dayCategory = getDayCategoryForTimestamp(now);

  // Get all stats for this route/direction/time/day
  let totalObservations = 0;
  let totalDelays = 0;

  for (const stats of aggregatedStats.values()) {
    if (
      stats.routeId === routeId &&
      stats.direction === direction &&
      stats.timeBucket === timeBucket &&
      stats.dayCategory === dayCategory
    ) {
      totalObservations += stats.totalObservations;
      totalDelays += stats.delayCount;
    }
  }

  if (totalObservations < config.minObservations) {
    return null;
  }

  return totalDelays / totalObservations;
}

/**
 * Get delay patterns for a route
 */
export function getRouteDelayPatterns(routeId: string, direction: "N" | "S"): DelayPattern[] {
  const patterns: DelayPattern[] = [];

  // Group by time bucket and day category
  const patternGroups = new Map<string, AggregatedStats[]>();

  for (const stats of aggregatedStats.values()) {
    if (stats.routeId === routeId && stats.direction === direction) {
      const key = `${stats.timeBucket}:${stats.dayCategory}`;
      if (!patternGroups.has(key)) {
        patternGroups.set(key, []);
      }
      patternGroups.get(key)!.push(stats);
    }
  }

  // Build patterns
  for (const [key, groupStats] of patternGroups) {
    const [timeBucket, dayCategory] = key.split(":") as [TimeBucket, DayCategory];

    let totalObs = 0;
    let totalDelays = 0;
    let totalDelayRatio = 0;

    for (const stats of groupStats) {
      totalObs += stats.totalObservations;
      totalDelays += stats.delayCount;
      totalDelayRatio += stats.avgDelayRatio * stats.totalObservations;
    }

    patterns.push({
      timeBucket,
      dayCategory,
      stats: groupStats.map(convertToDelayStats),
      overallDelayProbability: totalObs > 0 ? totalDelays / totalObs : 0,
      avgDelayMinutes: totalObs > 0 ? (totalDelayRatio / totalObs) * 5 : 0, // Rough estimate
    });
  }

  return patterns;
}

/**
 * Get route delay summary
 */
export function getRouteDelaySummary(routeId: string): RouteDelaySummary | null {
  let totalObservations = 0;
  let totalDelays = 0;
  let totalDelayRatio = 0;

  const segmentDelays = new Map<string, { from: string; to: string; sum: number; count: number }>();

  for (const stats of aggregatedStats.values()) {
    if (stats.routeId === routeId) {
      totalObservations += stats.totalObservations;
      totalDelays += stats.delayCount;
      const avgDelayRatio = stats.delayRatios.reduce((a, b) => a + b, 0) / stats.delayRatios.length;
      totalDelayRatio += avgDelayRatio * stats.totalObservations;

      const segKey = `${stats.fromStationId}:${stats.toStationId}`;
      if (!segmentDelays.has(segKey)) {
        segmentDelays.set(segKey, {
          from: stats.fromStationId,
          to: stats.toStationId,
          sum: 0,
          count: 0,
        });
      }
      const seg = segmentDelays.get(segKey)!;
      seg.sum += avgDelayRatio * stats.totalObservations;
      seg.count += stats.totalObservations;
    }
  }

  if (totalObservations === 0) return null;

  const onTimePercent = 100 - (totalDelays / totalObservations) * 100;
  const avgDelay = totalDelayRatio / totalObservations;
  const reliabilityScore = Math.max(0, 100 - avgDelay * 20);

  // Get worst segments
  const worstSegments = Array.from(segmentDelays.entries())
    .map(([, data]) => ({
      fromStationId: data.from,
      fromStationName: stations?.[data.from]?.name ?? data.from,
      toStationId: data.to,
      toStationName: stations?.[data.to]?.name ?? data.to,
      avgDelayRatio: data.count > 0 ? data.sum / data.count : 0,
    }))
    .sort((a, b) => b.avgDelayRatio - a.avgDelayRatio)
    .slice(0, 5);

  return {
    routeId,
    reliabilityScore: Math.round(reliabilityScore),
    avgDelayMinutes: Math.round(avgDelay * 5), // Rough estimate
    onTimePercentage: Math.round(onTimePercent),
    bestTimeBucket: "midday", // Simplified
    worstTimeBucket: "evening_rush", // Simplified
    worstSegments,
  };
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Get stats for a specific pattern
 */
function getStatsForPattern(
  routeId: string,
  direction: "N" | "S",
  fromStationId: string,
  toStationId: string,
  timeBucket: TimeBucket,
  dayCategory: DayCategory
): AggregatedStats | null {
  // Try exact match first
  const exactKey = buildPatternKey(
    routeId,
    direction,
    fromStationId,
    toStationId,
    timeBucket,
    dayCategory
  );
  let stats = aggregatedStats.get(exactKey);

  if (!stats) {
    // Try same time bucket, any day
    for (const dc of ["weekday", "saturday", "sunday"] as DayCategory[]) {
      const key = buildPatternKey(routeId, direction, fromStationId, toStationId, timeBucket, dc);
      stats = aggregatedStats.get(key);
      if (stats && stats.totalObservations >= config.minObservations) {
        break;
      }
    }
  }

  return stats ?? null;
}

/**
 * Get aggregated stats for a segment across all times
 */
function getSegmentStats(
  routeId: string,
  fromStationId: string,
  toStationId: string
): { totalObservations: number; avgDelayRatio: number } | null {
  let totalObs = 0;
  let weightedDelayRatio = 0;

  for (const stats of aggregatedStats.values()) {
    if (
      stats.routeId === routeId &&
      stats.fromStationId === fromStationId &&
      stats.toStationId === toStationId
    ) {
      totalObs += stats.totalObservations;
      weightedDelayRatio += stats.avgDelayRatio * stats.totalObservations;
    }
  }

  if (totalObs === 0) return null;

  return {
    totalObservations: totalObs,
    avgDelayRatio: weightedDelayRatio / totalObs,
  };
}

/**
 * Convert aggregated stats to DelayStats
 */
function convertToDelayStats(stats: AggregatedStats): DelayStats {
  const sortedRatios = [...stats.delayRatios].sort((a, b) => a - b);
  const len = sortedRatios.length;

  return {
    routeId: stats.routeId,
    direction: stats.direction,
    fromStationId: stats.fromStationId,
    toStationId: stats.toStationId,
    totalObservations: stats.totalObservations,
    delayCount: stats.delayCount,
    avgDelayRatio: stats.delayRatios.reduce((a, b) => a + b, 0) / stats.delayRatios.length,
    maxDelayRatio: Math.max(...stats.delayRatios),
    medianDelayRatio: len > 0 ? sortedRatios[Math.floor(len / 2)] : 0,
    p90DelayRatio: len > 0 ? sortedRatios[Math.floor(len * 0.9)] : 0,
    p95DelayRatio: len > 0 ? sortedRatios[Math.floor(len * 0.95)] : 0,
    lastUpdated: new Date(stats.lastUpdated).toISOString(),
  };
}

/**
 * Get weather impact factor
 */
function getWeatherFactor(condition: WeatherCondition): DelayFactor {
  const weatherFactors: Record<WeatherCondition, { impact: number; description: string }> = {
    clear: { impact: 0, description: "Clear weather - normal conditions" },
    cloudy: { impact: 0.05, description: "Cloudy weather - slightly increased delay risk" },
    rain: { impact: 0.15, description: "Rain - moderate delay risk increase" },
    heavy_rain: { impact: 0.3, description: "Heavy rain - significant delay risk" },
    snow: { impact: 0.4, description: "Snow - high delay risk" },
    heavy_snow: { impact: 0.6, description: "Heavy snow - severe delay risk" },
    extreme: { impact: 0.8, description: "Extreme weather - very high delay risk" },
  };

  const factor = weatherFactors[condition] ?? weatherFactors.clear;

  return {
    type: "weather",
    description: factor.description,
    impact: factor.impact,
    weight: 0.1,
  };
}

/**
 * Get time bucket impact factor
 */
function getTimeBucketFactor(bucket: TimeBucket): number {
  const factors: Record<TimeBucket, number> = {
    early_morning: -0.1, // Less delays early morning
    morning_rush: 0.2, // More delays during rush
    midday: -0.05, // Fewer delays midday
    evening_rush: 0.25, // Most delays during evening rush
    night: -0.15, // Fewest delays at night
  };

  return factors[bucket] ?? 0;
}

/**
 * Get day category impact factor
 */
function getDayCategoryFactor(category: DayCategory): number {
  const factors: Record<DayCategory, number> = {
    weekday: 0.1, // More delays on weekdays
    saturday: -0.1, // Fewer delays on Saturday
    sunday: -0.15, // Fewest delays on Sunday
  };

  return factors[category] ?? 0;
}

/**
 * Determine delay severity from ratio
 */
function getDelaySeverity(ratio: number): DelaySeverity {
  if (ratio < 1.2) return "none";
  if (ratio < 1.5) return "minor";
  if (ratio < 2.0) return "moderate";
  if (ratio < 3.0) return "major";
  return "severe";
}

/**
 * Calculate confidence based on observation count
 */
function calculateConfidence(observations: number): number {
  // More observations = higher confidence, capped at 0.95
  return Math.min(0.95, observations / 100);
}

// ---------------------------------------------------------------------------
// Weather management
// ---------------------------------------------------------------------------

/**
 * Update current weather condition
 * Call this periodically with weather API data
 */
export function updateWeather(condition: WeatherCondition): void {
  currentWeather = condition;
}

/**
 * Set weather override (for testing)
 */
export function setWeatherOverride(condition: WeatherCondition | null): void {
  weatherOverride = condition;
}

/**
 * Get current weather condition
 */
export function getCurrentWeather(): WeatherCondition {
  return weatherOverride ?? currentWeather;
}

// ---------------------------------------------------------------------------
// Public API for stats and management
// ---------------------------------------------------------------------------

/**
 * Get all delay records (for debugging/analysis)
 */
export function getAllDelayRecords(): DelayRecord[] {
  return delayRecords.map((r) => ({
    id: r.id,
    routeId: r.routeId,
    direction: r.direction,
    fromStationId: r.fromStationId,
    toStationId: r.toStationId,
    actualSeconds: r.actualSeconds,
    scheduledSeconds: r.scheduledSeconds,
    delayRatio: r.delayRatio,
    timestamp: r.timestamp,
    timeBucket: r.timeBucket,
    dayCategory: r.dayCategory,
    weather: r.weather,
    tripId: r.tripId,
  }));
}

/**
 * Get the count of delay records
 */
export function getDelayRecordCount(): number {
  return delayRecords.length;
}

/**
 * Get the count of aggregated patterns
 */
export function getAggregatedPatternCount(): number {
  return aggregatedStats.size;
}

/**
 * Reset all delay predictor state (for testing)
 */
export function resetDelayPredictor(): void {
  delayRecords = [];
  aggregatedStats.clear();
  weatherOverride = null;
  currentWeather = DEFAULT_WEATHER;
}

/**
 * Get delay predictor status
 */
export function getDelayPredictorStatus(): {
  totalRecords: number;
  aggregatedPatterns: number;
  minObservations: number;
  currentWeather: WeatherCondition;
} {
  return {
    totalRecords: delayRecords.length,
    aggregatedPatterns: aggregatedStats.size,
    minObservations: config.minObservations,
    currentWeather: weatherOverride ?? currentWeather,
  };
}
