/**
 * Typed client for the server trip journal (`/api/trips`, `/api/journal`).
 *
 * The commute journal is written to the local store first and mirrored to the
 * server by `useJournalSync`; these calls are the server half of that sync.
 * Every endpoint needs a session cookie, so failures are expected and each
 * caller decides whether a failure is worth retrying — see
 * `classifyJournalFailure`.
 */

import type { CommuteStats, TripRecord } from "@mta-my-way/shared";

const API_BASE = import.meta.env.VITE_API_BASE || "";

/** The largest page the server will return (`tripQuerySchema.limit` max). */
export const TRIP_PAGE_LIMIT = 100;

/** Raised for any non-2xx journal response. */
export class JournalApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "JournalApiError";
    this.status = status;
  }
}

export type JournalFailureKind = "auth" | "permanent" | "retryable";

/**
 * Sort a failure into the three cases the sync loop cares about: sign-in is
 * missing or expired (keep the work and wait), the payload can never be
 * accepted (drop the work, keep it locally), or the request is worth retrying.
 */
export function classifyJournalFailure(error: unknown): JournalFailureKind {
  if (!(error instanceof JournalApiError)) return "retryable";
  if (error.status === 401 || error.status === 403) return "auth";
  if (error.status >= 400 && error.status < 500) return "permanent";
  return "retryable";
}

/** GET /api/trips response envelope. */
export interface TripListResponse {
  trips: TripRecord[];
  count: number;
  limit: number;
  offset: number;
}

/** POST /api/trips response envelope. */
interface TripCreateResponse {
  success: boolean;
  trip: TripRecord;
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
    const response = await fetch(`${API_BASE}/api/csrf-token`, {
      credentials: "same-origin",
    });
    if (response.ok) {
      const data: unknown = await response.json();
      if (typeof data === "object" && data !== null && "token" in data) {
        const token = (data as { token?: unknown }).token;
        if (typeof token === "string") return token;
      }
    }
  } catch {
    // Handled by the caller, which proceeds without a token.
  }
  return undefined;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = init?.method?.toUpperCase() ?? "GET";
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (method !== "GET") {
    const csrfToken = getCsrfToken() ?? (await fetchCsrfToken());
    if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "same-origin",
    headers,
  });

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const detail =
      typeof body === "object" && body !== null
        ? ((body as { error?: unknown; message?: unknown }).error ??
          (body as { message?: unknown }).message)
        : undefined;
    const message =
      typeof detail === "string" && detail.length > 0
        ? detail
        : `Journal request failed with status ${response.status}`;
    throw new JournalApiError(message, response.status);
  }

  return (await response.json()) as T;
}

/**
 * Map a local record onto the server's create payload. The server wants bare
 * station IDs and resolves the names itself; it also assigns its own id and
 * treats the trip as manual, so neither is sent.
 */
export function toTripCreateRequest(record: TripRecord): Record<string, unknown> {
  const body: Record<string, unknown> = {
    date: record.date,
    origin: record.origin.stationId,
    destination: record.destination.stationId,
    line: record.line,
    departureTime: record.departureTime,
    arrivalTime: record.arrivalTime,
    actualDurationMinutes: record.actualDurationMinutes,
  };
  if (record.scheduledDurationMinutes !== undefined) {
    body.scheduledDurationMinutes = record.scheduledDurationMinutes;
  }
  if (record.notes !== undefined) {
    body.notes = record.notes;
  }
  return body;
}

/** Mirror a locally logged trip onto the server. Returns the stored record. */
export async function createServerTrip(record: TripRecord): Promise<TripRecord> {
  const data = await request<TripCreateResponse>("/api/trips", {
    method: "POST",
    body: JSON.stringify(toTripCreateRequest(record)),
  });
  return data.trip;
}

/**
 * Read the signed-in user's trips, paging past the server's 100-record page
 * cap. Pages are bounded so a large account cannot turn a sync into an
 * unbounded request loop.
 */
export async function listServerTrips(maxRecords = 500): Promise<TripRecord[]> {
  const trips: TripRecord[] = [];
  for (let offset = 0; offset < maxRecords; offset += TRIP_PAGE_LIMIT) {
    const page = await request<TripListResponse>(
      `/api/trips?limit=${TRIP_PAGE_LIMIT}&offset=${offset}`
    );
    trips.push(...page.trips);
    if (page.trips.length < TRIP_PAGE_LIMIT) break;
  }
  return trips;
}

/** Remove a trip from the server journal. */
export async function deleteServerTrip(tripId: string): Promise<void> {
  await request<{ success: boolean }>(`/api/trips/${encodeURIComponent(tripId)}`, {
    method: "DELETE",
  });
}

/** Replace a trip's notes on the server. Notes are the only editable field. */
export async function updateServerTripNotes(tripId: string, notes: string): Promise<void> {
  await request<{ success: boolean }>(`/api/trips/${encodeURIComponent(tripId)}/notes`, {
    method: "PATCH",
    body: JSON.stringify({ notes }),
  });
}

/** Read a single trip from the server journal. */
export async function getServerTrip(tripId: string): Promise<TripRecord> {
  return request<TripRecord>(`/api/trips/${encodeURIComponent(tripId)}`);
}

/**
 * Read the aggregate stats for a commute. The server answers `null` when its
 * trip database is closed, so callers have to treat an empty report as data.
 */
export async function getJournalStats(commuteId?: string): Promise<CommuteStats | null> {
  const query = commuteId ? `?commuteId=${encodeURIComponent(commuteId)}` : "";
  return request<CommuteStats | null>(`/api/journal/stats${query}`);
}

/** GET /api/journal/dates/:startDate/:endDate response envelope. */
export interface JournalDateRangeResponse {
  startDate: string;
  endDate: string;
  trips: TripRecord[];
  count: number;
}

/** Read every trip logged between two ISO dates, inclusive. */
export async function getJournalTripsForDates(
  startDate: string,
  endDate: string
): Promise<JournalDateRangeResponse> {
  return request<JournalDateRangeResponse>(
    `/api/journal/dates/${encodeURIComponent(startDate)}/${encodeURIComponent(endDate)}`
  );
}

/** GET /api/journal/summary response envelope. */
export interface JournalSummaryResponse {
  recentTrips: TripRecord[];
  stats: CommuteStats | null;
  totalTrips: number;
}

/** Read the recent-trips-plus-stats bundle a journal view opens with. */
export async function getJournalSummary(): Promise<JournalSummaryResponse> {
  return request<JournalSummaryResponse>("/api/journal/summary");
}
