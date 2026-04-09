/**
 * Cached API client
 *
 * Provides the same interface as the base API client but with application-level caching.
 * Use this for offline-first access to previously fetched data.
 *
 * Usage:
 * ```ts
 * import { apiCached } from "./lib/apiCached";
 *
 * // Get stations with automatic caching
 * const stations = await apiCached.getStations();
 *
 * // Force refresh from network
 * const freshStations = await apiCached.getStations({ forceRefresh: true });
 *
 * // Check if data is cached
 * const hasCached = await apiCached.has("/api/stations");
 * ```
 */

import type {
  ArrivalTime,
  CommuteAnalysis,
  EquipmentStatus,
  LineDiagramData,
  LinePositions,
  PushSubscribeRequest,
  PushSubscribeResponse,
  PushUnsubscribeRequest,
  PushUnsubscribeResponse,
  Route,
  Station,
  StationAlert,
  StationArrivals,
  StationComplex,
  StationEquipmentSummary,
} from "@mta-my-way/shared";

import { api } from "./api";
import { type CacheStrategy, apiCache } from "./apiCache";

// Re-export types from base API
import type { AlertsResponse, FeedHealthInfo, HealthResponse, TripData, TripStopInfo } from "./api";

export type {
  Station,
  Route,
  StationComplex,
  ArrivalTime,
  CommuteAnalysis,
  EquipmentStatus,
  LineDiagramData,
  LinePositions,
  PushSubscribeRequest,
  PushSubscribeResponse,
  PushUnsubscribeRequest,
  PushUnsubscribeResponse,
  StationAlert,
  StationArrivals,
  StationEquipmentSummary,
  TripStopInfo,
  TripData,
  FeedHealthInfo,
  HealthResponse,
  AlertsResponse,
};

// Cache options for API calls
export interface CacheOptions {
  /** Force a refresh from the network, bypassing cache */
  forceRefresh?: boolean;
  /** Custom cache strategy (overrides default) */
  strategy?: CacheStrategy;
}

// Cached API endpoints
export const apiCached = {
  // Stations
  async getStations(options?: CacheOptions): Promise<Station[]> {
    return apiCache.fetch("/api/stations", () => api.getStations(), options);
  },

  async getStation(stationId: string, options?: CacheOptions): Promise<Station> {
    return apiCache.fetch(`/api/stations/${stationId}`, () => api.getStation(stationId), options);
  },

  // Routes
  async getRoutes(options?: CacheOptions): Promise<Route[]> {
    return apiCache.fetch("/api/routes", () => api.getRoutes(), options);
  },

  async getRoute(routeId: string, options?: CacheOptions): Promise<Route> {
    return apiCache.fetch(`/api/routes/${routeId}`, () => api.getRoute(routeId), options);
  },

  // Arrivals (realtime, short cache)
  async getArrivals(stationId: string, options?: CacheOptions): Promise<StationArrivals> {
    return apiCache.fetch(`/api/arrivals/${stationId}`, () => api.getArrivals(stationId), {
      ...options,
      strategy: options?.strategy ?? "REALTIME",
    });
  },

  // Search (no caching)
  async searchStations(query: string): Promise<Station[]> {
    return api.searchStations(query);
  },

  // Station complexes (static, long cache)
  async getComplexes(options?: CacheOptions): Promise<StationComplex[]> {
    return apiCache.fetch("/api/static/complexes", () => api.getComplexes(), options);
  },

  // Alerts (semi-static, medium cache)
  async getAlerts(options?: CacheOptions): Promise<AlertsResponse> {
    return apiCache.fetch("/api/alerts", () => api.getAlerts(), {
      ...options,
      strategy: options?.strategy ?? "SEMI_STATIC",
    });
  },

  async getAlertsForLine(
    lineId: string,
    options?: CacheOptions
  ): Promise<{ alerts: StationAlert[]; lineId: string }> {
    return apiCache.fetch(`/api/alerts/${lineId}`, () => api.getAlertsForLine(lineId), {
      ...options,
      strategy: options?.strategy ?? "SEMI_STATIC",
    });
  },

  // Health (short cache)
  async getHealth(options?: CacheOptions): Promise<HealthResponse> {
    return apiCache.fetch("/api/health", () => api.getHealth(), {
      ...options,
      strategy: options?.strategy ?? "HEALTH",
    });
  },

  // Commute analysis (medium cache)
  async analyzeCommute(
    options: {
      originId: string;
      destinationId: string;
      preferredLines?: string[];
      commuteId?: string;
      accessibleMode?: boolean;
    },
    cacheOptions?: CacheOptions
  ): Promise<CommuteAnalysis> {
    return apiCache.fetch("/api/commute/analyze", () => api.analyzeCommute(options), {
      ...cacheOptions,
      strategy: cacheOptions?.strategy ?? "COMMUTE",
    });
  },

  // Equipment status (semi-static)
  async getEquipment(stationId: string, options?: CacheOptions): Promise<StationEquipmentSummary> {
    return apiCache.fetch(`/api/equipment/${stationId}`, () => api.getEquipment(stationId), {
      ...options,
      strategy: options?.strategy ?? "SEMI_STATIC",
    });
  },

  async getAllEquipment(
    options?: CacheOptions
  ): Promise<{ stations: StationEquipmentSummary[]; count: number }> {
    return apiCache.fetch("/api/equipment", () => api.getAllEquipment(), {
      ...options,
      strategy: options?.strategy ?? "SEMI_STATIC",
    });
  },

  // Push notifications (no caching - these are mutation operations)
  async getVapidPublicKey(): Promise<{ publicKey: string }> {
    return api.getVapidPublicKey();
  },

  async subscribePush(request: PushSubscribeRequest): Promise<PushSubscribeResponse> {
    return api.subscribePush(request);
  },

  async unsubscribePush(request: PushUnsubscribeRequest): Promise<PushUnsubscribeResponse> {
    return api.unsubscribePush(request);
  },

  // Live trip tracking (realtime with short cache)
  async getTrip(tripId: string, options?: CacheOptions): Promise<TripData> {
    return apiCache.fetch(`/api/trip/${encodeURIComponent(tripId)}`, () => api.getTrip(tripId), {
      ...options,
      strategy: options?.strategy ?? "TRIP",
    });
  },

  // Train positions for line diagram (realtime)
  async getPositions(lineId: string, options?: CacheOptions): Promise<LineDiagramData> {
    return apiCache.fetch(
      `/api/positions/${encodeURIComponent(lineId)}`,
      () => api.getPositions(lineId),
      {
        ...options,
        strategy: options?.strategy ?? "REALTIME",
      }
    );
  },

  // Cache management utilities
  cache: {
    /** Check if a path has cached data */
    has: (path: string) => apiCache.has(path),

    /** Invalidate cache for a path pattern */
    invalidate: (pathPattern?: string) => apiCache.invalidate(pathPattern),

    /** Get cache statistics */
    stats: () => apiCache.stats(),

    /** Preload specific endpoints into cache */
    preload: (paths: string[]) => apiCache.preload(paths),
  },
};
