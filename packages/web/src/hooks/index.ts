export { useArrivals } from "./useArrivals";
export type { ArrivalsState, ArrivalsResult, DataStatus } from "./useArrivals";

export { useFavorites } from "./useFavorites";
export type { Favorite } from "./useFavorites";

export { useContextSort } from "./useContextSort";

export { getBestRoute, useCommute } from "./useCommute";
export type { CommuteResult, CommuteState, CommuteStatus, UseCommuteOptions } from "./useCommute";

export { useAlerts, useAlertsForStation } from "./useAlerts";
export type { AlertDataStatus, AlertsMeta, AlertsState, AlertsResult } from "./useAlerts";

export { usePushNotifications } from "./usePushNotifications";
export type { PushNotificationsState } from "./usePushNotifications";

export { useMorningBriefing } from "./useMorningBriefing";
export type { MorningBriefing, MorningBriefingEntry } from "./useMorningBriefing";

export { useOnlineStatus } from "./useOnlineStatus";

export { useStaleness } from "./useStaleness";
export type { StalenessLevel, StalenessState } from "./useStaleness";

// Geofence and prefetch hooks for underground caching
export { useGeofence } from "./useGeofence";
export type { GeofenceEvent, UseGeofenceOptions, UseGeofenceReturn } from "./useGeofence";

export { usePrefetch } from "./usePrefetch";
export type { UsePrefetchReturn } from "./usePrefetch";

export { useOfflineCountdown } from "./useOfflineCountdown";
export type { EstimatedArrival, OfflineCountdownState } from "./useOfflineCountdown";

// Train positions for line diagram
export { getTrainOverallProgress, usePositions } from "./usePositions";
export type { PositionsResult, PositionsState, PositionsStatus } from "./usePositions";
