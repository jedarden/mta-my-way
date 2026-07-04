/**
 * Integration tests for Positions API endpoint.
 *
 * Tests the full data flow:
 * - Positions retrieval for routes
 * - Integration with GTFS-RT vehicle positions feed
 * - Response validation and caching
 */

import type {
  ComplexIndex,
  RouteIndex,
  StationIndex,
  TransferConnection,
} from "@mta-my-way/shared";
import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { TEST_STATIONS, closeDatabase, createIntegrationTestDatabase } from "./test-helpers.js";

// Mock the cache module for positions testing
vi.mock("../cache.js", async () => {
  const actual = await vi.importActual("../cache.js");
  return {
    ...actual,
    getPositions: vi.fn(),
  };
});

// Mock the positions-interpolator module
vi.mock("../positions-interpolator.js", async () => {
  const actual = await vi.importActual("../positions-interpolator.js");
  return {
    ...actual,
    buildLineDiagram: vi.fn(() => ({
      routeId: "1",
      routeColor: "#EE352E",
      stops: [
        { stopId: "101", stopName: "South Ferry", isTerminal: true, isTransferStation: false },
        { stopId: "102", stopName: "Rector St", isTerminal: false, isTransferStation: false },
        { stopId: "725", stopName: "Times Sq-42 St", isTerminal: true, isTransferStation: true },
      ],
      trains: [],
      computedAt: Date.now(),
    })),
  };
});

import { getPositions } from "../cache.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const TEST_ROUTES: RouteIndex = {
  "1": {
    id: "1",
    shortName: "1",
    longName: "Broadway-7th Ave Local",
    color: "#EE352E",
    textColor: "#FFFFFF",
    feedId: "gtfs",
    division: "A",
    stops: ["101", "102", "725"],
    isExpress: false,
  },
  A: {
    id: "A",
    shortName: "A",
    longName: "8th Ave Express",
    color: "#0039A6",
    textColor: "#FFFFFF",
    feedId: "gtfs-ace",
    division: "B",
    stops: ["726", "727"],
    isExpress: true,
  },
};

const TEST_COMPLEXES: ComplexIndex = {
  "725-726": {
    complexId: "725-726",
    name: "Times Sq-42 St / Port Authority",
    stations: ["725", "726"],
    allLines: ["1", "2", "3", "7", "N", "Q", "R", "W", "S", "A", "C", "E"],
    allStopIds: ["725N", "725S", "726N", "726S"],
  },
};

const TEST_TRANSFERS: Record<string, TransferConnection[]> = {
  "725": [{ toStationId: "726", toLines: ["A", "C", "E"], walkingSeconds: 120, accessible: true }],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Positions API Integration Tests", () => {
  let db: Database.Database;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-10T08:00:00Z"));
    db = createIntegrationTestDatabase();
    app = createApp(
      TEST_STATIONS,
      TEST_ROUTES,
      TEST_COMPLEXES,
      TEST_TRANSFERS,
      "/nonexistent/dist"
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    closeDatabase(db);
  });

  describe("GET /api/positions/:lineId", () => {
    it("returns positions for specific route", async () => {
      const mockPositions = {
        trains: [
          {
            tripId: "1-trip-1",
            routeId: "1",
            direction: "N" as const,
            currentStopSequence: 1,
            status: "IN_TRANSIT_TO" as const,
            currentStopId: "101",
            timestamp: Date.now(),
            isAssigned: true,
            destination: "Van Cortlandt Park",
          },
        ],
        feedAge: 0,
      };

      vi.mocked(getPositions).mockReturnValue(mockPositions);

      const res = await app.request("/api/positions/1");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toBeDefined();
      expect(body).toHaveProperty("trains");
      expect(Array.isArray(body.trains)).toBe(true);
    });

    it("returns empty array when no positions available", async () => {
      vi.mocked(getPositions).mockReturnValue({ trains: [], feedAge: 0 });

      const res = await app.request("/api/positions/1");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty("trains");
      expect(Array.isArray(body.trains)).toBe(true);
      expect(body.trains.length).toBe(0);
    });

    it("returns 404 when positions not found for route", async () => {
      vi.mocked(getPositions).mockReturnValue(null);

      const res = await app.request("/api/positions/Z");

      expect(res.status).toBe(404);
    });

    it("sets cache headers", async () => {
      vi.mocked(getPositions).mockReturnValue({ trains: [], feedAge: 0 });

      const res = await app.request("/api/positions/1");

      const cacheControl = res.headers.get("Cache-Control");
      expect(cacheControl).toContain("public");
      expect(cacheControl).toContain("max-age=");
    });
  });

  describe("Response structure", () => {
    it("returns diagram data with required fields", async () => {
      const mockPositions = {
        trains: [
          {
            tripId: "1-trip-structure",
            routeId: "1",
            direction: "N" as const,
            currentStopSequence: 1,
            status: "STOPPED_AT" as const,
            currentStopId: "101",
            timestamp: Date.now(),
            isAssigned: true,
            destination: "Van Cortlandt Park",
          },
        ],
        feedAge: 0,
      };

      vi.mocked(getPositions).mockReturnValue(mockPositions);

      const res = await app.request("/api/positions/1");

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty("routeId");
      expect(body).toHaveProperty("routeColor");
      expect(body).toHaveProperty("stops");
      expect(body).toHaveProperty("trains");
      expect(body).toHaveProperty("computedAt");
    });

    it("includes interpolated train data", async () => {
      const mockPositions = {
        trains: [
          {
            tripId: "1-trip-metadata",
            routeId: "1",
            direction: "N" as const,
            currentStopSequence: 1,
            status: "IN_TRANSIT_TO" as const,
            currentStopId: "101",
            timestamp: Date.now(),
            isAssigned: true,
            destination: "Van Cortlandt Park",
            delay: 30,
          },
        ],
        feedAge: 0,
      };

      vi.mocked(getPositions).mockReturnValue(mockPositions);

      const res = await app.request("/api/positions/1");

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.routeId).toBe("1");
      expect(typeof body.computedAt).toBe("number");
    });
  });

  describe("Data flow integration", () => {
    it("integrates with positions cache", async () => {
      const mockPositions = {
        trains: [
          {
            tripId: "1-trip-cache-test",
            routeId: "1",
            direction: "N" as const,
            currentStopSequence: 1,
            status: "IN_TRANSIT_TO" as const,
            currentStopId: "101",
            timestamp: Date.now(),
            isAssigned: true,
            destination: "Van Cortlandt Park",
          },
        ],
        feedAge: 0,
      };

      vi.mocked(getPositions).mockReturnValue(mockPositions);

      const res = await app.request("/api/positions/1");
      expect(res.status).toBe(200);

      expect(getPositions).toHaveBeenCalledWith("1");
    });

    it("handles multiple vehicles on same route", async () => {
      const mockPositions = {
        trains: [
          {
            tripId: "1-trip-a",
            routeId: "1",
            direction: "N" as const,
            currentStopSequence: 1,
            status: "IN_TRANSIT_TO" as const,
            currentStopId: "101",
            timestamp: Date.now(),
            isAssigned: true,
            destination: "Van Cortlandt Park",
          },
          {
            tripId: "1-trip-b",
            routeId: "1",
            direction: "S" as const,
            currentStopSequence: 5,
            status: "STOPPED_AT" as const,
            currentStopId: "725",
            timestamp: Date.now(),
            isAssigned: true,
            destination: "South Ferry",
          },
        ],
        feedAge: 0,
      };

      vi.mocked(getPositions).mockReturnValue(mockPositions);

      const res = await app.request("/api/positions/1");

      expect(res.status).toBe(200);
      expect(getPositions).toHaveBeenCalledWith("1");
    });
  });

  describe("Route filtering", () => {
    it("returns positions for route 1", async () => {
      const mockPositions = {
        trains: [
          {
            tripId: "1-trip-route-1",
            routeId: "1",
            direction: "N" as const,
            currentStopSequence: 1,
            status: "IN_TRANSIT_TO" as const,
            currentStopId: "101",
            timestamp: Date.now(),
            isAssigned: true,
            destination: "Van Cortlandt Park",
          },
        ],
        feedAge: 0,
      };

      vi.mocked(getPositions).mockReturnValue(mockPositions);

      const res = await app.request("/api/positions/1");

      expect(res.status).toBe(200);
      expect(getPositions).toHaveBeenCalledWith("1");
    });

    it("returns positions for route A", async () => {
      const mockPositions = {
        trains: [
          {
            tripId: "A-trip-route-a",
            routeId: "A",
            direction: "S" as const,
            currentStopSequence: 3,
            status: "INCOMING_AT" as const,
            currentStopId: "726",
            timestamp: Date.now(),
            isAssigned: true,
            destination: "Far Rockaway",
          },
        ],
        feedAge: 0,
      };

      vi.mocked(getPositions).mockReturnValue(mockPositions);

      const res = await app.request("/api/positions/A");

      expect(res.status).toBe(200);
      expect(getPositions).toHaveBeenCalledWith("A");
    });
  });
});
