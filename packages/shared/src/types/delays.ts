/**
 * Delay prediction and historical pattern types
 */

/**
 * Time of day bucket for delay pattern analysis
 */
export type TimeBucket =
  | "early_morning" // 4am-6am
  | "morning_rush" // 6am-10am
  | "midday" // 10am-3pm
  | "evening_rush" // 3pm-7pm
  | "night"; // 7pm-4am

/**
 * Day of week category
 */
export type DayCategory = "weekday" | "saturday" | "sunday";

/**
 * Weather condition impact on delays
 */
export type WeatherCondition =
  | "clear"
  | "cloudy"
  | "rain"
  | "heavy_rain"
  | "snow"
  | "heavy_snow"
  | "extreme";

/**
 * Delay severity level
 */
export type DelaySeverity = "none" | "minor" | "moderate" | "major" | "severe";

/**
 * Historical delay statistics for a specific route/segment
 */
export interface DelayStats {
  /** Route ID (e.g., "1", "A", "F") */
  routeId: string;
  /** Direction: N = Northbound, S = Southbound */
  direction: "N" | "S";
  /** Origin station ID */
  fromStationId: string;
  /** Destination station ID */
  toStationId: string;
  /** Total observations count */
  totalObservations: number;
  /** Count of delays detected */
  delayCount: number;
  /** Average delay ratio (actual/scheduled) when delayed */
  avgDelayRatio: number;
  /** Maximum delay ratio observed */
  maxDelayRatio: number;
  /** Median delay ratio */
  medianDelayRatio: number;
  /** 90th percentile delay ratio */
  p90DelayRatio: number;
  /** 95th percentile delay ratio */
  p95DelayRatio: number;
  /** Last updated timestamp (ISO) */
  lastUpdated: string;
}

/**
 * Delay pattern for a specific time period
 */
export interface DelayPattern {
  /** Time bucket */
  timeBucket: TimeBucket;
  /** Day category */
  dayCategory: DayCategory;
  /** Statistics by route/segment */
  stats: DelayStats[];
  /** Overall delay probability for this time bucket */
  overallDelayProbability: number;
  /** Average delay minutes when delayed */
  avgDelayMinutes: number;
}

/**
 * Delay prediction result for a trip
 */
export interface DelayPrediction {
  /** Trip identifier */
  tripId: string;
  /** Route ID */
  routeId: string;
  /** Direction */
  direction: "N" | "S";
  /** Origin station ID */
  fromStationId: string;
  /** Origin station name */
  fromStationName: string;
  /** Destination station ID */
  toStationId: string;
  /** Destination station name */
  toStationName: string;
  /** Scheduled travel time (minutes) */
  scheduledMinutes: number;
  /** Predicted travel time (minutes) */
  predictedMinutes: number;
  /** Delay probability (0-1) */
  delayProbability: number;
  /** Most likely delay severity */
  delaySeverity: DelaySeverity;
  /** Confidence in prediction (0-1) */
  confidence: number;
  /** Contributing factors */
  factors: DelayFactor[];
  /** Timestamp of prediction (ISO) */
  predictedAt: string;
}

/**
 * Factor contributing to a delay prediction
 */
export interface DelayFactor {
  /** Factor type */
  type: "historical" | "time_of_day" | "day_of_week" | "weather" | "segment";
  /** Description */
  description: string;
  /** Impact on delay (-1 to 1, negative = reduces delay) */
  impact: number;
  /** Weight of this factor in overall prediction */
  weight: number;
}

/**
 * Weather data for delay prediction
 */
export interface WeatherData {
  /** Current condition */
  condition: WeatherCondition;
  /** Temperature in Fahrenheit */
  temperature: number;
  /** Precipitation amount (inches) */
  precipitation: number;
  /** Snow amount (inches) */
  snow: number;
  /** Wind speed (mph) */
  windSpeed: number;
  /** Timestamp of observation (ISO) */
  observedAt: string;
}

/**
 * Historical delay record for storage
 */
export interface DelayRecord {
  /** Unique record ID */
  id: string;
  /** Route ID */
  routeId: string;
  /** Direction */
  direction: "N" | "S";
  /** From station ID */
  fromStationId: string;
  /** To station ID */
  toStationId: string;
  /** Actual travel time (seconds) */
  actualSeconds: number;
  /** Scheduled travel time (seconds) */
  scheduledSeconds: number;
  /** Delay ratio */
  delayRatio: number;
  /** Timestamp (ISO) */
  timestamp: string;
  /** Time bucket derived from timestamp */
  timeBucket: TimeBucket;
  /** Day category derived from timestamp */
  dayCategory: DayCategory;
  /** Weather condition at time (if available) */
  weather?: WeatherCondition;
  /** Trip ID that generated this record */
  tripId: string;
}

/**
 * Aggregate delay statistics by route and time
 */
export interface RouteDelaySummary {
  /** Route ID */
  routeId: string;
  /** Overall reliability score (0-100) */
  reliabilityScore: number;
  /** Average delay when delayed (minutes) */
  avgDelayMinutes: number;
  /** On-time performance percentage (within 2x scheduled) */
  onTimePercentage: number;
  /** Best time bucket */
  bestTimeBucket: TimeBucket;
  /** Worst time bucket */
  worstTimeBucket: TimeBucket;
  /** Worst segments */
  worstSegments: Array<{
    fromStationId: string;
    fromStationName: string;
    toStationId: string;
    toStationName: string;
    avgDelayRatio: number;
  }>;
}
