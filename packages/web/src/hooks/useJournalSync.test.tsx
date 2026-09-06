/**
 * Tests for the offline-first journal sync.
 *
 * Covered through the exported sync steps rather than the mounted hook: the
 * steps carry the behaviour (merge, upload, tombstone) and the hook only adds
 * gating and retry timing around them.
 */

import type { Commute, TripRecord } from "@mta-my-way/shared";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFavoritesStore } from "../stores/favoritesStore";
import { UNMATCHED_SERVER_COMMUTE_ID, useJournalStore } from "../stores/journalStore";

function makeTrip(overrides: Partial<TripRecord> = {}): TripRecord {
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

const WORK_COMMUTE: Commute = {
  id: "work",
  name: "Work",
  origin: { stationId: "725", stationName: "Times Sq-42 St" },
  destination: { stationId: "631", stationName: "Grand Central-42 St" },
  preferredLines: ["7"],
  isPinned: false,
  enableTransferSuggestions: false,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function freshModules() {
  const sync = await import("./useJournalSync");
  const journalStore = await import("../stores/journalStore");
  const favoritesStore = await import("../stores/favoritesStore");
  return {
    sync,
    useJournalStore: journalStore.useJournalStore,
    useFavoritesStore: favoritesStore.useFavoritesStore,
  };
}

describe("useJournalSync", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
    document.cookie = "csrf_token=test-csrf-token";
    useFavoritesStore.setState({ commutes: [WORK_COMMUTE] });
    useJournalStore.setState({ stats: {}, dayOfWeekStats: {}, lastStationVisit: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.cookie = "csrf_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  });

  describe("groupServerTrips", () => {
    it("places a server trip on the commute it matches", async () => {
      const { sync } = await freshModules();

      const groups = sync.groupServerTrips([makeTrip()], [WORK_COMMUTE]);

      expect([...groups.keys()]).toEqual(["work"]);
    });

    it("keeps a trip that matches no commute instead of dropping it", async () => {
      const { sync } = await freshModules();

      const groups = sync.groupServerTrips(
        [makeTrip({ line: "A", origin: { stationId: "101", stationName: "Other" } })],
        [WORK_COMMUTE]
      );

      expect([...groups.keys()]).toEqual([UNMATCHED_SERVER_COMMUTE_ID]);
    });
  });

  describe("journalRecordsSignature", () => {
    it("is stable across record id changes, so a pull does not retrigger uploads", async () => {
      const { sync } = await freshModules();

      const before = sync.journalRecordsSignature({
        work: { records: [makeTrip({ id: "local-1" })] },
      });
      const after = sync.journalRecordsSignature({
        work: { records: [makeTrip({ id: "server-1" })] },
      });

      expect(before).toBe(after);
    });

    it("changes when a trip is added", async () => {
      const { sync } = await freshModules();

      const before = sync.journalRecordsSignature({ work: { records: [] } });
      const after = sync.journalRecordsSignature({ work: { records: [makeTrip()] } });

      expect(before).not.toBe(after);
    });
  });

  describe("pullServerTrips", () => {
    it("merges the server journal into the local one", async () => {
      const { sync, useJournalStore: store } = await freshModules();
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          jsonResponse({
            trips: [
              makeTrip({ id: "server-1", departureTime: 1_699_900_000 }),
              makeTrip({ id: "server-2", departureTime: 1_700_100_000 }),
            ],
            count: 2,
            limit: 100,
            offset: 0,
          })
        )
      );

      const ok = await sync.pullServerTrips();

      expect(ok).toBe(true);
      const records = store.getState().stats["work"]!.records;
      expect(records.map((r) => r.id)).toEqual(["server-1", "server-2"]);
      expect(store.getState().stats["work"]!.totalTrips).toBe(2);
    });

    it("does not resurrect a trip deleted while the server was unreachable", async () => {
      const { sync, useJournalStore: store } = await freshModules();
      const serverTrip = makeTrip({ id: "server-1" });
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(jsonResponse({ trips: [serverTrip], count: 1, limit: 100, offset: 0 }))
      );

      // First pull registers the server id, so a later delete knows where to go.
      await sync.pullServerTrips();
      sync.notifyJournalTripDeleted(serverTrip);
      store.getState().removeTripRecord("work", "server-1");

      // The delete could not reach the server, and the trip is pulled again.
      await sync.pullServerTrips();

      expect(store.getState().stats["work"]!.records).toHaveLength(0);
    });
  });

  describe("pushLocalTrips", () => {
    it("uploads local records the server has not acknowledged", async () => {
      const { sync, useJournalStore: store } = await freshModules();
      store.getState().addTripRecord("work", makeTrip());
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ success: true, trip: makeTrip({ id: "server-9" }) }, 201)
        );
      vi.stubGlobal("fetch", fetchMock);

      const blocked = await sync.pushLocalTrips();

      expect(blocked).toBe(false);
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toContain("/api/trips");
      expect(JSON.parse(init.body as string).origin).toBe("725");
    });

    it("does not re-upload a record that is already mirrored", async () => {
      const { sync, useJournalStore: store } = await freshModules();
      store.getState().addTripRecord("work", makeTrip());
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ success: true, trip: makeTrip({ id: "server-9" }) }, 201)
        );
      vi.stubGlobal("fetch", fetchMock);

      await sync.pushLocalTrips();
      await sync.pushLocalTrips();

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("reports a retryable failure and leaves the record queued", async () => {
      const { sync, useJournalStore: store } = await freshModules();
      store.getState().addTripRecord("work", makeTrip());
      const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
      vi.stubGlobal("fetch", fetchMock);

      const blocked = await sync.pushLocalTrips();

      expect(blocked).toBe(true);
      expect(store.getState().stats["work"]!.records).toHaveLength(1);
    });

    it("drops a permanently rejected record from the upload queue but keeps it locally", async () => {
      const { sync, useJournalStore: store } = await freshModules();
      store.getState().addTripRecord("work", makeTrip());
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: "Bad request" }, 400));
      vi.stubGlobal("fetch", fetchMock);

      const blocked = await sync.pushLocalTrips();
      // A second pass does not retry something the server refused outright.
      await sync.pushLocalTrips();

      expect(blocked).toBe(false);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(store.getState().stats["work"]!.records).toHaveLength(1);
    });
  });

  describe("mounted hook", () => {
    it("pulls the server journal once the session is known", async () => {
      const { sync, useJournalStore: store } = await freshModules();
      const { useJournalSync } = sync;
      const fetchMock = vi.fn().mockImplementation((input: unknown) => {
        const url = String(input);
        if (url.includes("/api/auth/session")) {
          return Promise.resolve(jsonResponse({ authenticated: true, profile: { userId: "u1" } }));
        }
        if (url.includes("/api/trips")) {
          return Promise.resolve(
            jsonResponse({
              trips: [makeTrip({ id: "server-1", departureTime: 1_699_900_000 })],
              count: 1,
              limit: 100,
              offset: 0,
            })
          );
        }
        return Promise.resolve(jsonResponse({ token: "t" }));
      });
      vi.stubGlobal("fetch", fetchMock);

      renderHook(() => useJournalSync());

      await waitFor(() => {
        expect(store.getState().stats["work"]!.totalTrips).toBe(1);
      });
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/trips"))).toBe(true);
    });

    it("makes no journal request while signed out", async () => {
      const { sync } = await freshModules();
      const { useJournalSync } = sync;
      const fetchMock = vi.fn().mockImplementation((input: unknown) => {
        const url = String(input);
        if (url.includes("/api/auth/session")) {
          return Promise.resolve(jsonResponse({ authenticated: false, profile: null }));
        }
        return Promise.resolve(jsonResponse({ trips: [], count: 0, limit: 100, offset: 0 }));
      });
      vi.stubGlobal("fetch", fetchMock);

      renderHook(() => useJournalSync());
      await act(async () => {
        await Promise.resolve();
      });

      expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/trips"))).toBe(false);
    });
  });
});
