/**
 * Unit tests for the server journal client.
 *
 * The sync layer depends on these calls failing in distinguishable ways, so
 * the request shape and the failure classification are both covered here.
 */

import type { CommuteStats, TripRecord } from "@mta-my-way/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  JournalApiError,
  classifyJournalFailure,
  createServerTrip,
  deleteServerTrip,
  getJournalStats,
  getJournalSummary,
  getJournalTripsForDates,
  getServerTrip,
  listServerTrips,
  toTripCreateRequest,
  updateServerTripNotes,
} from "./journalApi";

function makeRecord(overrides: Partial<TripRecord> = {}): TripRecord {
  return {
    id: "local-1",
    date: "2026-09-06",
    origin: { stationId: "725", stationName: "Times Sq-42 St" },
    destination: { stationId: "631", stationName: "Grand Central-42 St" },
    line: "7",
    departureTime: 1_700_000_000,
    arrivalTime: 1_700_001_800,
    actualDurationMinutes: 30,
    source: "tracked",
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeStats(overrides: Partial<CommuteStats> = {}): CommuteStats {
  return {
    commuteId: "default",
    averageDurationMinutes: 30,
    medianDurationMinutes: 29,
    stdDevMinutes: 3,
    totalTrips: 42,
    tripsThisWeek: 5,
    trend: 0.04,
    averageDelayMinutes: 1.5,
    maxDelayMinutes: 9,
    onTimePercentage: 88,
    records: [],
    ...overrides,
  };
}

describe("journalApi", () => {
  beforeEach(() => {
    document.cookie = "csrf_token=test-csrf-token";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.cookie = "csrf_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  });

  describe("toTripCreateRequest", () => {
    it("sends bare station IDs and omits client-only fields", () => {
      const body = toTripCreateRequest(makeRecord());

      expect(body).toMatchObject({
        date: "2026-09-06",
        origin: "725",
        destination: "631",
        line: "7",
        actualDurationMinutes: 30,
      });
      expect(body).not.toHaveProperty("id");
      expect(body).not.toHaveProperty("source");
      expect(body).not.toHaveProperty("originName");
    });
  });

  describe("createServerTrip", () => {
    it("POSTs to /api/trips with a CSRF token and returns the stored trip", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ success: true, trip: { ...makeRecord(), id: "server-1" } }, 201)
        );
      vi.stubGlobal("fetch", fetchMock);

      const stored = await createServerTrip(makeRecord());

      expect(stored.id).toBe("server-1");
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toContain("/api/trips");
      expect(init.method).toBe("POST");
      expect((init.headers as Record<string, string>)["X-CSRF-Token"]).toBe("test-csrf-token");
      expect(JSON.parse(init.body as string).origin).toBe("725");
    });

    it("raises JournalApiError with the server's message", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "Nope" }, 400)));

      await expect(createServerTrip(makeRecord())).rejects.toMatchObject({
        name: "JournalApiError",
        status: 400,
        message: "Nope",
      });
    });
  });

  describe("listServerTrips", () => {
    it("pages until a short page ends the listing", async () => {
      const pageOne = Array.from({ length: 100 }, (_, i) =>
        makeRecord({ id: `trip-${i}`, departureTime: 1_700_000_000 + i })
      );
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ trips: pageOne, count: 100, limit: 100, offset: 0 }))
        .mockResolvedValueOnce(
          jsonResponse({
            trips: [makeRecord({ id: "trip-last" })],
            count: 1,
            limit: 100,
            offset: 100,
          })
        );
      vi.stubGlobal("fetch", fetchMock);

      const trips = await listServerTrips(500);

      expect(trips).toHaveLength(101);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(String(fetchMock.mock.calls[1]![0])).toContain("offset=100");
    });

    it("raises JournalApiError when the server reports the journal unavailable", async () => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            jsonResponse({ error: "Trip tracking temporarily unavailable", degraded: true }, 503)
          )
      );

      await expect(listServerTrips()).rejects.toMatchObject({
        name: "JournalApiError",
        status: 503,
      });
    });
  });

  describe("deleteServerTrip", () => {
    it("DELETEs the encoded trip id", async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true }));
      vi.stubGlobal("fetch", fetchMock);

      await deleteServerTrip("trip/1");

      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toContain("/api/trips/trip%2F1");
      expect(init.method).toBe("DELETE");
    });

    it("raises JournalApiError when the trip is gone", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(jsonResponse({ error: "Trip not found" }, 404))
      );

      await expect(deleteServerTrip("missing")).rejects.toMatchObject({
        name: "JournalApiError",
        status: 404,
      });
    });
  });

  describe("updateServerTripNotes", () => {
    it("PATCHes notes, including a clear", async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true }));
      vi.stubGlobal("fetch", fetchMock);

      await updateServerTripNotes("server-1", "");

      const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(init.method).toBe("PATCH");
      expect(JSON.parse(init.body as string)).toEqual({ notes: "" });
    });

    it("raises JournalApiError when the notes are rejected", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(jsonResponse({ error: "Notes cannot contain HTML tags" }, 400))
      );

      await expect(updateServerTripNotes("server-1", "<b>")).rejects.toMatchObject({
        name: "JournalApiError",
        status: 400,
      });
    });
  });

  describe("getServerTrip", () => {
    it("GETs the encoded trip id and returns the record", async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(makeRecord({ id: "server-1" })));
      vi.stubGlobal("fetch", fetchMock);

      const trip = await getServerTrip("trip/1");

      expect(trip.id).toBe("server-1");
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toContain("/api/trips/trip%2F1");
      // GETs carry no method override — the default in `request` — and no CSRF token.
      expect(init.method).toBeUndefined();
      expect((init.headers as Record<string, string>)["X-CSRF-Token"]).toBeUndefined();
    });

    it("raises JournalApiError when the trip does not exist", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(jsonResponse({ error: "Trip not found" }, 404))
      );

      await expect(getServerTrip("missing")).rejects.toMatchObject({
        name: "JournalApiError",
        status: 404,
      });
    });
  });

  describe("getJournalStats", () => {
    it("GETs stats, scoping to a commute when one is given", async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(makeStats({ commuteId: "work" })));
      vi.stubGlobal("fetch", fetchMock);

      const stats = await getJournalStats("work");

      expect(stats?.commuteId).toBe("work");
      const [url] = fetchMock.mock.calls[0] as unknown as [string];
      expect(url).toContain("/api/journal/stats?commuteId=work");
    });

    it("omits the commute query and tolerates a null report", async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(null));
      vi.stubGlobal("fetch", fetchMock);

      const stats = await getJournalStats();

      expect(stats).toBeNull();
      expect(String(fetchMock.mock.calls[0]![0])).toBe("/api/journal/stats");
    });

    it("raises JournalApiError when stats are unavailable", async () => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            jsonResponse({ error: "Trip tracking temporarily unavailable", degraded: true }, 503)
          )
      );

      await expect(getJournalStats()).rejects.toMatchObject({
        name: "JournalApiError",
        status: 503,
      });
    });
  });

  describe("getJournalTripsForDates", () => {
    it("GETs the inclusive date range and returns the envelope", async () => {
      const trips = [makeRecord({ id: "trip-1" })];
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ startDate: "2026-09-01", endDate: "2026-09-07", trips, count: 1 })
        );
      vi.stubGlobal("fetch", fetchMock);

      const range = await getJournalTripsForDates("2026-09-01", "2026-09-07");

      expect(range.count).toBe(1);
      expect(range.trips[0]!.id).toBe("trip-1");
      const [url] = fetchMock.mock.calls[0] as unknown as [string];
      expect(url).toBe("/api/journal/dates/2026-09-01/2026-09-07");
    });

    it("raises JournalApiError on a malformed range", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(jsonResponse({ error: "Invalid date range" }, 400))
      );

      await expect(getJournalTripsForDates("not-a-date", "2026-09-07")).rejects.toMatchObject({
        name: "JournalApiError",
        status: 400,
      });
    });
  });

  describe("getJournalSummary", () => {
    it("GETs the summary bundle", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse({
          recentTrips: [makeRecord({ id: "trip-1" })],
          stats: makeStats({ totalTrips: 42 }),
          totalTrips: 42,
        })
      );
      vi.stubGlobal("fetch", fetchMock);

      const summary = await getJournalSummary();

      expect(summary.recentTrips).toHaveLength(1);
      expect(summary.stats?.totalTrips).toBe(42);
      expect(summary.totalTrips).toBe(42);
      expect(String(fetchMock.mock.calls[0]![0])).toBe("/api/journal/summary");
    });

    it("returns a null stats report and raises on failure", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ recentTrips: [], stats: null, totalTrips: 0 }))
        .mockResolvedValueOnce(jsonResponse({ error: "Server error" }, 500));
      vi.stubGlobal("fetch", fetchMock);

      await expect(getJournalSummary()).resolves.toMatchObject({ stats: null, totalTrips: 0 });
      await expect(getJournalSummary()).rejects.toMatchObject({
        name: "JournalApiError",
        status: 500,
      });
    });
  });

  describe("classifyJournalFailure", () => {
    it("treats auth failures as retriable-later", () => {
      expect(classifyJournalFailure(new JournalApiError("Auth required", 401))).toBe("auth");
      expect(classifyJournalFailure(new JournalApiError("Forbidden", 403))).toBe("auth");
    });

    it("treats other 4xx as permanent", () => {
      expect(classifyJournalFailure(new JournalApiError("Bad request", 400))).toBe("permanent");
    });

    it("treats 5xx and network errors as retryable", () => {
      expect(classifyJournalFailure(new JournalApiError("Server error", 500))).toBe("retryable");
      expect(classifyJournalFailure(new JournalApiError("Unavailable", 503))).toBe("retryable");
      expect(classifyJournalFailure(new TypeError("Failed to fetch"))).toBe("retryable");
    });
  });
});
