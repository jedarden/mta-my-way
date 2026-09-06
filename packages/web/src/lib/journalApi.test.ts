/**
 * Unit tests for the server journal client.
 *
 * The sync layer depends on these calls failing in distinguishable ways, so
 * the request shape and the failure classification are both covered here.
 */

import type { TripRecord } from "@mta-my-way/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  JournalApiError,
  classifyJournalFailure,
  createServerTrip,
  deleteServerTrip,
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
      expect(classifyJournalFailure(new JournalApiError("Unavailable", 503))).toBe("retryable");
      expect(classifyJournalFailure(new TypeError("Failed to fetch"))).toBe("retryable");
    });
  });
});
