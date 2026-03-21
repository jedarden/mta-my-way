/**
 * API client for MTA My Way backend
 * Provides type-safe fetch wrapper with error handling
 */

import type {
  ArrivalTime,
  StationArrivals,
} from "@mta-my-way/shared";

// Re-export shared arrival types so callers can import from one place
export type { ArrivalTime, StationArrivals };

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

async function fetchJson<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
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
    throw new ApiClientError(
      "Network error - please check your connection",
      0
    );
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

export interface StationAlert {
  id: string;
  severity: "info" | "warning" | "severe";
  headline: string;
  description: string;
  affectedLines: string[];
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

  // Alerts
  async getAlerts(): Promise<StationAlert[]> {
    return fetchJson<StationAlert[]>("/api/alerts");
  },

  // Health
  async getHealth(): Promise<{ status: string; uptime: number }> {
    return fetchJson<{ status: string; uptime: number }>("/api/health");
  },
};

export { ApiClientError };
