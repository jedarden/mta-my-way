/**
 * API client for MTA My Way backend
 * Provides type-safe fetch wrapper with error handling and automatic retry
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
  PushUpdateRequest,
  Route,
  Station,
  StationAlert,
  StationArrivals,
  StationComplex,
  StationEquipmentSummary,
} from "@mta-my-way/shared";
import { type RetryOptions, retry } from "@mta-my-way/shared";

// Re-export for use across the frontend
export type { StationComplex };

// Re-export shared arrival types so callers can import from one place
export type {
  ArrivalTime,
  CommuteAnalysis,
  EquipmentStatus,
  LineDiagramData,
  LinePositions,
  PushSubscribeRequest,
  PushSubscribeResponse,
  PushUnsubscribeRequest,
  PushUnsubscribeResponse,
  PushUpdateRequest,
  Route,
  Station,
  StationAlert,
  StationArrivals,
  StationEquipmentSummary,
};

const API_BASE = import.meta.env.VITE_API_BASE || "";

interface ApiError {
  message: string;
  status: number;
}

class ApiClientError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
  }
}

/**
 * Get the CSRF token from the cookie.
 * Returns undefined if no token is found.
 */
function getCsrfToken(): string | undefined {
  const match = document.cookie.match(/csrf_token=([^;]+)/);
  return match ? match[1] : undefined;
}

/**
 * Fetch a new CSRF token from the server.
 * Returns the token or undefined if the request fails.
 */
async function fetchCsrfToken(): Promise<string | undefined> {
  try {
    const response = await fetch(`${API_BASE}/api/csrf-token`);
    if (response.ok) {
      const data = await response.json();
      return data.token;
    }
  } catch (error) {
    console.error("Failed to fetch CSRF token:", error);
  }
  return undefined;
}

/**
 * Retry configuration for API client requests
 *
 * - maxAttempts: 3 retries (4 total attempts)
 * - initialDelayMs: 1000ms (user-facing, slower initial retry)
 * - backoffMultiplier: 2 (exponential backoff: 1s, 2s, 4s)
 * - maxDelayMs: 10000ms (cap max wait time)
 * - isRetryable: retry on network errors, timeouts, 5xx, and 429
 */
const RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 4,
  initialDelayMs: 1000,
  backoffMultiplier: 2,
  maxDelayMs: 10000,
  jitter: true,
  isRetryable: (error: unknown) => {
    // Retry on network errors
    if (error instanceof ApiClientError) {
      if (error.status === 0) {
        // Network error (status 0 indicates fetch failure)
        return true;
      }
      // Retry on 5xx server errors, 429 rate limiting, and 408 timeout
      return (
        error.status === 408 || error.status === 429 || (error.status >= 500 && error.status < 600)
      );
    }
    return false;
  },
  onRetry: (attempt, error, delayMs) => {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`API retry attempt ${attempt} after ${delayMs}ms: ${message}`);
  },
};

// Import trace headers for distributed tracing
import { getTraceHeaders } from "./tracing";

async function fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;

  return retry(async () => {
    const method = options?.method?.toUpperCase() || "GET";
    const isStateChanging = ["POST", "PUT", "DELETE", "PATCH"].includes(method);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...getTraceHeaders(),
      ...(options?.headers as Record<string, string> | undefined),
    };

    // Add CSRF token for state-changing requests
    if (isStateChanging) {
      const csrfToken = getCsrfToken();
      if (!csrfToken) {
        // Try to fetch a new token if none exists
        const newToken = await fetchCsrfToken();
        if (newToken) {
          headers["X-CSRF-Token"] = newToken;
        } else {
          console.warn("No CSRF token available for state-changing request");
        }
      } else {
        headers["X-CSRF-Token"] = csrfToken;
      }
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error: ApiError = await response.json().catch(() => ({
        message: `HTTP ${response.status}`,
        status: response.status,
      }));
      throw new ApiClientError(
        error.message || `Request failed with status ${response.status}`,
        response.status
      );
    }

    return response.json();
  }, RETRY_OPTIONS);
}

// API Types

export interface AlertsResponse {
  alerts: StationAlert[];
  meta: {
    count: number;
    lastUpdatedAt: string | null;
    matchRate: number;
    consecutiveFailures: number;
    circuitOpen: boolean;
  };
}

/** Trip stop info from the /api/trip endpoint */
export interface TripStopInfo {
  stopId: string;
  stationId: string | null;
  stationName: string;
  arrivalTime: number | null;
  departureTime: number | null;
  scheduledTrack: string | null;
  actualTrack: string | null;
}

/** Trip data from the /api/trip endpoint */
export interface TripData {
  tripId: string;
  routeId: string;
  direction: "N" | "S" | null;
  destination: string;
  isAssigned: boolean;
  trainId: string | null;
  stops: TripStopInfo[];
  currentStopIndex: number;
  updatedAt: number;
  feedAge: number;
  progressPercent: number;
  remainingStops: number;
  totalStops: number;
}

/** Feed status from /api/health */
export interface FeedHealthInfo {
  id: string;
  name: string;
  status: "ok" | "stale" | "circuit_open" | "never_polled";
  lastSuccessAt: string | null;
  lastPollAt: string | null;
  consecutiveFailures: number;
  entityCount: number;
  lastError: string | null;
  avgLatencyMs: number;
  errorCount24h: number;
}

/** Full health response from /api/health */
export interface HealthResponse {
  status: string;
  timestamp: string;
  uptime_seconds: number;
  feeds: FeedHealthInfo[];
  alerts: {
    count: number;
    lastSuccessAt: string | null;
    matchRate: number;
    consecutiveFailures: number;
    circuitOpen: boolean;
  };
  failingFeedsCount: number;
}

// API Endpoints
export const api = {
  // Stations
  async getStations(): Promise<Station[]> {
    return fetchJson<Station[]>("/api/stations");
  },

  async getStation(stationId: string): Promise<Station> {
    return fetchJson<Station>(`/api/stations/${stationId}`);
  },

  // Routes
  async getRoutes(): Promise<Route[]> {
    return fetchJson<Route[]>("/api/routes");
  },

  async getRoute(routeId: string): Promise<Route> {
    return fetchJson<Route>(`/api/routes/${routeId}`);
  },

  // Arrivals
  async getArrivals(stationId: string): Promise<StationArrivals> {
    return fetchJson<StationArrivals>(`/api/arrivals/${stationId}`) as Promise<StationArrivals>;
  },

  // Search
  async searchStations(query: string): Promise<Station[]> {
    const params = new URLSearchParams({ q: query });
    return fetchJson<Station[]>(`/api/stations/search?${params}`);
  },

  // Station complexes (static data, cached by Service Worker)
  async getComplexes(): Promise<StationComplex[]> {
    return fetchJson<StationComplex[]>("/api/static/complexes");
  },

  // Alerts
  async getAlerts(): Promise<AlertsResponse> {
    return fetchJson<AlertsResponse>("/api/alerts");
  },

  async getAlertsForLine(lineId: string): Promise<{ alerts: StationAlert[]; lineId: string }> {
    return fetchJson<{ alerts: StationAlert[]; lineId: string }>(`/api/alerts/${lineId}`);
  },

  // Health
  async getHealth(): Promise<HealthResponse> {
    return fetchJson<HealthResponse>("/api/health");
  },

  // Commute analysis
  async analyzeCommute(options: {
    originId: string;
    destinationId: string;
    preferredLines?: string[];
    commuteId?: string;
    accessibleMode?: boolean;
  }): Promise<CommuteAnalysis> {
    return fetchJson<CommuteAnalysis>("/api/commute/analyze", {
      method: "POST",
      body: JSON.stringify(options),
    });
  },

  // Equipment status
  async getEquipment(stationId: string): Promise<StationEquipmentSummary> {
    return fetchJson<StationEquipmentSummary>(`/api/equipment/${stationId}`);
  },

  async getAllEquipment(): Promise<{ stations: StationEquipmentSummary[]; count: number }> {
    return fetchJson<{ stations: StationEquipmentSummary[]; count: number }>("/api/equipment");
  },

  // Push notifications
  async getVapidPublicKey(): Promise<{ publicKey: string }> {
    return fetchJson<{ publicKey: string }>("/api/push/vapid-public-key");
  },

  async subscribePush(request: PushSubscribeRequest): Promise<PushSubscribeResponse> {
    return fetchJson<PushSubscribeResponse>("/api/push/subscribe", {
      method: "POST",
      body: JSON.stringify(request),
    });
  },

  async unsubscribePush(request: PushUnsubscribeRequest): Promise<PushUnsubscribeResponse> {
    return fetchJson<PushUnsubscribeResponse>("/api/push/unsubscribe", {
      method: "DELETE",
      body: JSON.stringify(request),
    });
  },

  async updatePushSubscription(request: PushUpdateRequest): Promise<{ success: boolean }> {
    return fetchJson<{ success: boolean }>("/api/push/subscription", {
      method: "PATCH",
      body: JSON.stringify(request),
    });
  },

  // Live trip tracking
  async getTrip(tripId: string): Promise<TripData> {
    return fetchJson<TripData>(`/api/trip/${encodeURIComponent(tripId)}`);
  },

  // Train positions for line diagram
  async getPositions(lineId: string): Promise<LineDiagramData> {
    return fetchJson<LineDiagramData>(`/api/positions/${encodeURIComponent(lineId)}`);
  },
};

export { ApiClientError };
