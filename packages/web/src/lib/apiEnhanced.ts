/**
 * Enhanced API client with retry logic, timeouts, and better error handling.
 *
 * Per plan.md Phase 4: Comprehensive error states and performance optimization.
 *
 * Features:
 *   - Automatic retry with exponential backoff
 *   - Request timeout handling
 *   - Offline detection with cached data fallback
 *   - Detailed error types for better UX
 */

import type {
  AlertsResponse,
  CommuteAnalysis,
  LineDiagramData,
  PushSubscribeRequest,
  PushSubscribeResponse,
  PushUnsubscribeRequest,
  PushUnsubscribeResponse,
  StationAlert,
  StationArrivals,
  StationComplex,
  StationEquipmentSummary,
} from "@mta-my-way/shared";
import type { HealthResponse, Route, Station, TripData } from "./api";

// Re-export from base API
export {
  api,
  ApiClientError,
  type Station,
  type Route,
  type TripData,
  type HealthResponse,
  type AlertsResponse,
} from "./api";

const API_BASE = import.meta.env.VITE_API_BASE || "";

// Error types for better UX
export enum ApiErrorType {
  NETWORK = "network",
  TIMEOUT = "timeout",
  SERVER = "server",
  NOT_FOUND = "not_found",
  UNAUTHORIZED = "unauthorized",
  PARSE = "parse",
  OFFLINE = "offline",
  UNKNOWN = "unknown",
}

export interface ApiErrorDetails {
  type: ApiErrorType;
  message: string;
  status?: number;
  retryable: boolean;
  originalError?: Error;
}

class EnhancedApiError extends Error {
  type: ApiErrorType;
  status?: number;
  retryable: boolean;
  originalError?: Error;

  constructor(details: ApiErrorDetails) {
    super(details.message);
    this.name = "EnhancedApiError";
    this.type = details.type;
    this.status = details.status;
    this.retryable = details.retryable;
    this.originalError = details.originalError;
  }
}

// Configuration
const DEFAULT_TIMEOUT = 10000; // 10 seconds
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY = 1000; // 1 second
const MAX_RETRY_DELAY = 10000; // 10 seconds

interface FetchOptions extends RequestInit {
  timeout?: number;
  retries?: number;
  signal?: AbortSignal;
}

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay with jitter
 */
function calculateRetryDelay(attempt: number): number {
  const exponentialDelay = BASE_RETRY_DELAY * Math.pow(2, attempt);
  const jitter = Math.random() * 0.3 * exponentialDelay; // Add 0-30% jitter
  return Math.min(exponentialDelay + jitter, MAX_RETRY_DELAY);
}

/**
 * Check if the device is offline
 */
function isOffline(): boolean {
  return !navigator.onLine;
}

/**
 * Enhanced fetch with timeout, retry logic, and better error handling
 */
async function enhancedFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const {
    timeout = DEFAULT_TIMEOUT,
    retries = MAX_RETRIES,
    signal: externalSignal,
    ...fetchOptions
  } = options;

  const url = `${API_BASE}${path}`;

  // Check for offline status
  if (isOffline()) {
    throw new EnhancedApiError({
      type: ApiErrorType.OFFLINE,
      message: "You're offline. Please check your internet connection.",
      retryable: true,
    });
  }

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      // Combine with external signal if provided
      if (externalSignal) {
        externalSignal.addEventListener("abort", () => controller.abort());
      }

      const response = await fetch(url, {
        ...fetchOptions,
        headers: {
          "Content-Type": "application/json",
          ...fetchOptions.headers,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle non-OK responses
      if (!response.ok) {
        const errorDetails: ApiErrorDetails = {
          message: `Request failed with status ${response.status}`,
          status: response.status,
          retryable: response.status >= 500 || response.status === 429,
          type: ApiErrorType.UNKNOWN,
        };

        // Categorize error by status code
        if (response.status === 404) {
          errorDetails.type = ApiErrorType.NOT_FOUND;
          errorDetails.message = "The requested resource was not found";
          errorDetails.retryable = false;
        } else if (response.status === 401 || response.status === 403) {
          errorDetails.type = ApiErrorType.UNAUTHORIZED;
          errorDetails.message = "You're not authorized to access this resource";
          errorDetails.retryable = false;
        } else if (response.status >= 500) {
          errorDetails.type = ApiErrorType.SERVER;
          errorDetails.message = "Server error. Please try again later.";
        } else if (response.status === 429) {
          errorDetails.type = ApiErrorType.SERVER;
          errorDetails.message = "Too many requests. Please wait a moment.";
        }

        throw new EnhancedApiError(errorDetails);
      }

      // Parse JSON response
      const data = await response.json();
      return data as T;
    } catch (error) {
      lastError = error as Error;

      // Don't retry if error is not retryable
      if (error instanceof EnhancedApiError && !error.retryable) {
        throw error;
      }

      // Categorize non-HTTP errors
      if (error instanceof Error) {
        if (error.name === "AbortError") {
          lastError = new EnhancedApiError({
            type: ApiErrorType.TIMEOUT,
            message: "Request timed out. Please try again.",
            retryable: attempt < retries,
            originalError: error,
          });
        } else if (error instanceof EnhancedApiError) {
          lastError = error;
        } else if (error.message.includes("fetch")) {
          lastError = new EnhancedApiError({
            type: ApiErrorType.NETWORK,
            message: "Network error. Please check your connection.",
            retryable: attempt < retries,
            originalError: error,
          });
        } else if (error instanceof SyntaxError) {
          lastError = new EnhancedApiError({
            type: ApiErrorType.PARSE,
            message: "Unable to process the server response.",
            retryable: attempt < retries,
            originalError: error,
          });
        } else {
          lastError = new EnhancedApiError({
            type: ApiErrorType.UNKNOWN,
            message: error.message || "An unexpected error occurred",
            retryable: attempt < retries,
            originalError: error,
          });
        }
      }

      // If this is the last attempt, throw the error
      if (attempt === retries) {
        throw lastError;
      }

      // Wait before retrying
      const delay = calculateRetryDelay(attempt);
      await sleep(delay);
    }
  }

  // Should never reach here, but TypeScript needs it
  throw (
    lastError ||
    new EnhancedApiError({
      type: ApiErrorType.UNKNOWN,
      message: "An unexpected error occurred",
      retryable: false,
    })
  );
}

// Re-export types from base API
export type {
  Station,
  Route,
  AlertsResponse,
  TripStopInfo,
  TripData,
  FeedHealthInfo,
  HealthResponse,
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
} from "@mta-my-way/shared";

// Enhanced API endpoints with retry and timeout
export const apiEnhanced = {
  // Stations
  async getStations(options?: FetchOptions): Promise<Station[]> {
    return enhancedFetch<Station[]>("/api/stations", options);
  },

  async getStation(stationId: string, options?: FetchOptions): Promise<Station> {
    return enhancedFetch<Station>(`/api/stations/${stationId}`, options);
  },

  // Routes
  async getRoutes(options?: FetchOptions): Promise<Route[]> {
    return enhancedFetch<Route[]>("/api/routes", options);
  },

  async getRoute(routeId: string, options?: FetchOptions): Promise<Route> {
    return enhancedFetch<Route>(`/api/routes/${routeId}`, options);
  },

  // Arrivals
  async getArrivals(stationId: string, options?: FetchOptions): Promise<StationArrivals> {
    return enhancedFetch<StationArrivals>(
      `/api/arrivals/${stationId}`,
      options
    ) as Promise<StationArrivals>;
  },

  // Search
  async searchStations(query: string, options?: FetchOptions): Promise<Station[]> {
    const params = new URLSearchParams({ q: query });
    return enhancedFetch<Station[]>(`/api/stations/search?${params}`, options);
  },

  // Station complexes
  async getComplexes(options?: FetchOptions): Promise<StationComplex[]> {
    return enhancedFetch<StationComplex[]>("/api/static/complexes", options);
  },

  // Alerts
  async getAlerts(options?: FetchOptions): Promise<AlertsResponse> {
    return enhancedFetch<AlertsResponse>("/api/alerts", options);
  },

  async getAlertsForLine(
    lineId: string,
    options?: FetchOptions
  ): Promise<{ alerts: StationAlert[]; lineId: string }> {
    return enhancedFetch<{ alerts: StationAlert[]; lineId: string }>(
      `/api/alerts/${lineId}`,
      options
    );
  },

  // Health
  async getHealth(options?: FetchOptions): Promise<HealthResponse> {
    return enhancedFetch<HealthResponse>("/api/health", options);
  },

  // Commute analysis
  async analyzeCommute(
    options: {
      originId: string;
      destinationId: string;
      preferredLines?: string[];
      commuteId?: string;
      accessibleMode?: boolean;
    },
    fetchOptions?: FetchOptions
  ): Promise<CommuteAnalysis> {
    return enhancedFetch<CommuteAnalysis>("/api/commute/analyze", {
      ...fetchOptions,
      method: "POST",
      body: JSON.stringify(options),
    });
  },

  // Equipment status
  async getEquipment(stationId: string, options?: FetchOptions): Promise<StationEquipmentSummary> {
    return enhancedFetch<StationEquipmentSummary>(`/api/equipment/${stationId}`, options);
  },

  async getAllEquipment(
    options?: FetchOptions
  ): Promise<{ stations: StationEquipmentSummary[]; count: number }> {
    return enhancedFetch<{ stations: StationEquipmentSummary[]; count: number }>(
      "/api/equipment",
      options
    );
  },

  // Push notifications
  async getVapidPublicKey(options?: FetchOptions): Promise<{ publicKey: string }> {
    return enhancedFetch<{ publicKey: string }>("/api/push/vapid-public-key", options);
  },

  async subscribePush(
    request: PushSubscribeRequest,
    options?: FetchOptions
  ): Promise<PushSubscribeResponse> {
    return enhancedFetch<PushSubscribeResponse>("/api/push/subscribe", {
      ...options,
      method: "POST",
      body: JSON.stringify(request),
    });
  },

  async unsubscribePush(
    request: PushUnsubscribeRequest,
    options?: FetchOptions
  ): Promise<PushUnsubscribeResponse> {
    return enhancedFetch<PushUnsubscribeResponse>("/api/push/unsubscribe", {
      ...options,
      method: "DELETE",
      body: JSON.stringify(request),
    });
  },

  // Live trip tracking
  async getTrip(tripId: string, options?: FetchOptions): Promise<TripData> {
    return enhancedFetch<TripData>(`/api/trip/${encodeURIComponent(tripId)}`, options);
  },

  // Train positions for line diagram
  async getPositions(lineId: string, options?: FetchOptions): Promise<LineDiagramData> {
    return enhancedFetch<LineDiagramData>(`/api/positions/${encodeURIComponent(lineId)}`, options);
  },
};

export { EnhancedApiError, ApiErrorType };
