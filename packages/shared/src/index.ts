/**
 * @mta-my-way/shared
 *
 * Shared TypeScript types, constants, and utilities for MTA My Way.
 * This package is imported by both the server and web packages.
 */

export const PACKAGE_VERSION = "0.0.1";

// =============================================================================
// Types
// =============================================================================

// Real-time arrival types
export type { Direction, ConfidenceLevel, ArrivalTime, StationArrivals } from "./types/arrivals.js";

// User preferences, favorites, and commute configuration
export type {
  DirectionPreference,
  StationRef,
  Favorite,
  Commute,
  Settings,
  UserPreferences,
  FavoriteTapEvent,
} from "./types/favorites.js";

// GTFS static data types: stations, routes, and transfers
export type {
  Borough,
  Division,
  Station,
  StationIndex,
  Route,
  RouteIndex,
  TransferConnection,
  StationComplex,
  ComplexIndex,
  TransferEdge,
  TransferGraph,
  TravelTime,
  TravelTimeIndex,
} from "./types/stations.js";

// Service alert types
export type {
  AlertSeverity,
  AlertSource,
  StationAlert,
  ShuttleBusInfo,
  ShuttleStop,
  AlertPattern,
  LineStatus,
  LineHealthStatus,
  SystemHealth,
} from "./types/alerts.js";

// Trip tracking and commute journal types
export type {
  TripSource,
  TripRecord,
  CommuteStats,
  LiveTripState,
  TripStopProgress,
  TripShareData,
} from "./types/trips.js";

// Commute analysis types
export type {
  DirectRoute,
  TransferLeg,
  TransferRoute,
  CommuteAnalysis,
  WalkingOption,
  ServicePattern,
  TransferRecommendation,
  RecommendationDetails,
} from "./types/commute.js";

// Equipment status types
export type {
  EquipmentType,
  EquipmentStatus,
  StationEquipmentSummary,
} from "./types/equipment.js";

// Fare tracking types
export type {
  RideLogEntry,
  FareTracking,
  FareCapStatus,
  AnnualFareSummary,
} from "./types/fare.js";

// Delay prediction types
export type {
  TimeBucket,
  DayCategory,
  WeatherCondition,
  DelaySeverity,
  DelayStats,
  DelayPattern,
  DelayPrediction,
  DelayFactor,
  WeatherData,
  DelayRecord,
  RouteDelaySummary,
} from "./types/delays.js";

// Train position types
export type {
  VehicleStatus,
  TrainPosition,
  LinePositions,
  InterpolatedTrainPosition,
  LineDiagramData,
} from "./types/positions.js";

// Web Push notification types
export type {
  PushFavoriteTuple,
  PushSubscribeRequest,
  PushUnsubscribeRequest,
  PushNotificationPayload,
  PushSubscribeResponse,
  PushUnsubscribeResponse,
  PushSubscriptionRecord,
  PushUpdateRequest,
  MorningScoreMap,
} from "./types/push.js";

// =============================================================================
// Validation Schemas (Zod)
// =============================================================================

export {
  pushFavoriteTupleSchema,
  pushSubscribeRequestSchema,
  pushUnsubscribeRequestSchema,
  pushUpdateRequestSchema,
  commuteAnalyzeRequestSchema,
} from "./schemas/index.js";

// =============================================================================
// Constants
// =============================================================================

// MTA GTFS-RT feed configuration
export {
  MTA_FEED_BASE_URL,
  MTA_ALERTS_FEED_URL,
  GTFS_STATIC_BASE_URL,
  SUBWAY_FEEDS,
  LINE_TO_FEED,
  getFeedForLine,
  getFeedById,
  POLLING_INTERVALS,
  CACHE_TTLS,
  GTFS_STATIC_URLS,
} from "./constants/feeds.js";

export type { FeedConfig } from "./constants/feeds.js";

// NYC Subway line metadata
export {
  LINE_METADATA,
  getLineMetadata,
  getLineColor,
  getLineTextColor,
  isADivision,
  isBDivision,
  getAllLineIds,
  getLinesByColorFamily,
} from "./constants/lines.js";

export type { LineMetadata } from "./constants/lines.js";

// =============================================================================
// Utilities
// =============================================================================

// Time formatting and calculation
export {
  calculateMinutesAway,
  calculateSecondsAway,
  formatMinutesAway,
  formatTime,
  formatShortDate,
  formatFullDate,
  formatTimeAgo,
  formatDuration,
  getCurrentDayOfWeek,
  getCurrentHour,
  getTodayISO,
  getWeekStartISO,
  getMonthStartISO,
  isRecent,
  isStale,
  getDataAge,
} from "./utils/time.js";

// Confidence scoring
export {
  calculateConfidence,
  calculateConfidenceWithReroute,
  getConfidenceDescription,
  getTransferBufferMinutes,
  isConfidenceAcceptable,
  getConfidenceStyleClass,
  calculateJourneyConfidence,
  getDivision,
} from "./utils/confidence.js";

// Data freshness utilities
export {
  getFreshnessLevel,
  getFreshnessTextColor,
  getFreshnessDotColor,
  formatFeedAge,
} from "./utils/freshness.js";

export type { FreshnessLevel } from "./utils/freshness.js";

// Walking distance and time calculation
export {
  haversineDistance,
  walkingTime,
  walkingTimeFromDistance,
  walkingTimeBetweenStations,
  walkingDistanceBetweenStations,
  isWalkingViable,
  compareWalkingVsTransit,
  formatWalkingDistance,
  formatWalkingTime,
} from "./utils/walking.js";

export type { StationWithCoords } from "./utils/walking.js";

// Carbon savings calculation
export {
  kmToMiles,
  milesToKm,
  calculateCO2SavingsGrams,
  calculateCO2SavingsKg,
  calculateCO2SavingsTons,
  calculateCarbonSavingsSummary,
  formatCarbonSavings,
  formatDistance,
  getEnvironmentalEquivalents,
} from "./utils/carbon.js";

export type { CarbonSavingsSummary } from "./utils/carbon.js";

// Time bucket and pattern utilities
export {
  getTimeBucket,
  getTimeBucketForTimestamp,
  getCurrentTimeBucket,
  getDayCategory,
  getDayCategoryForTimestamp,
  getCurrentDayCategory,
  getTimeBucketLabel,
  getDayCategoryLabel,
} from "./utils/patterns.js";
