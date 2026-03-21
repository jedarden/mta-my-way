/**
 * API client for MTA My Way backend
 * Provides type-safe fetch wrapper with error handling
 */

import type {
  ArrivalTime,
  CommuteAnalysis,
  PushSubscribeRequest,
  PushSubscribeResponse,
  PushUnsubscribeRequest,
  PushUnsubscribeResponse,
  StationAlert,
  StationArrivals,
  StationComplex,
} from "@mta-my-way/shared";

// Re-export for use across the frontend
export type { StationComplex };

// Re-export shared arrival types so callers can import from one place
export type {
  ArrivalTime,
  CommuteAnalysis,
  PushSubscribeRequest,
  PushSubscribeResponse,
  PushUnsubscribeRequest,
  PushUnsubscribeResponse,
  StationAlert,
  StationArrivals,
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

async function fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
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
  } catch (error) {
    if (error instanceof ApiClientError) {
      throw error;
    }
    // Network error
    throw new ApiClientError("Network error - please check your connection", 0);
  }
}

// API Types
export interface Station {
  id: string;
  name: string;
  lat: number;
  lon: number;
  lines: string[];
  northStopId: string;
  southStopId: string;
  borough: string;
  ada: boolean;
}

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

// API Endpoints
export const api = {
  // Stations
  async getStations(): Promise<Station[]> {
    return fetchJson<Station[]>("/api/stations");
  },

  async getStation(stationId: string): Promise<Station> {
    return fetchJson<Station>(`/api/stations/${stationId}`);
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
  async getHealth(): Promise<{ status: string; uptime: number }> {
    return fetchJson<{ status: string; uptime: number }>("/api/health");
  },

  // Commute analysis
  async analyzeCommute(options: {
    originId: string;
    destinationId: string;
    preferredLines?: string[];
    commuteId?: string;
  }): Promise<CommuteAnalysis> {
    return fetchJson<CommuteAnalysis>("/api/commute/analyze", {
      method: "POST",
      body: JSON.stringify(options),
    });
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
};

export { ApiClientError };
