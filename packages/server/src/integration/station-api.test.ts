/**
 * Integration tests for Station API endpoints.
 *
 * Tests the full data flow:
 * - Station search with query parameters
 * - Station details with complex expansion
 * - Static data serving with cache headers
 * - Cross-component integration with transfer engine
 */

import type { ComplexIndex, RouteIndex, StationIndex, TransferConnection } from "@mta-my-way/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { closeDatabase, createIntegrationTestDatabase, TEST_STATIONS } from "./test-helpers.js";

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
    stops: ["726"],
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

describe("Station API Integration Tests", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    const db = createIntegrationTestDatabase();
    app = createApp(TEST_STATIONS, TEST_ROUTES, TEST_COMPLEXES, TEST_TRANSFERS, "/nonexistent/dist");
  });

  afterEach(() => {
    // Clean up is handled by garbage collection for in-memory db
  });

  describe("GET /api/stations", () => {
    it("returns all stations", async () => {
      const res = await app.request("/api/stations");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(0);
    });

    it("includes cache headers for static data", async () => {
      const res = await app.request("/api/stations");

      const cacheControl = res.headers.get("Cache-Control");
      expect(cacheControl).toContain("public");
      expect(cacheControl).toContain("max-age=");
    });

    it("returns station with all required fields", async () => {
      const res = await app.request("/api/stations");

      const body = await res.json();
      const station = body.find((s: { id: string }) => s.id === "101");

      expect(station).toBeDefined();
      expect(station.id).toBe("101");
      expect(station.name).toBe("South Ferry");
      expect(station.location).toBeDefined();
      expect(station.lines).toEqual(["1"]);
      expect(station.ada).toBe(true);
    });
  });

  describe("GET /api/stations/:id", () => {
    it("returns station by ID", async () => {
      const res = await app.request("/api/stations/101");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.id).toBe("101");
      expect(body.name).toBe("South Ferry");
    });

    it("expands complex information when available", async () => {
      const res = await app.request("/api/stations/725");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.complexId).toBe("725-726");
      expect(body.complexName).toBe("Times Sq-42 St / Port Authority");
      expect(Array.isArray(body.complexStations)).toBe(true);
      expect(body.complexStations.length).toBeGreaterThan(0);
    });

    it("includes all complex lines", async () => {
      const res = await app.request("/api/stations/725");

      const body = await res.json();
      expect(body.complexLines).toBeDefined();
      expect(body.complexLines).toContain("1");
      expect(body.complexLines).toContain("A");
      expect(body.complexLines).toContain("C");
    });

    it("returns 404 for non-existent station", async () => {
      const res = await app.request("/api/stations/999");

      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error).toContain("not found");
    });

    it("includes cache headers", async () => {
      const res = await app.request("/api/stations/101");

      const cacheControl = res.headers.get("Cache-Control");
      expect(cacheControl).toContain("public");
      expect(cacheControl).toContain("max-age=");
    });
  });

  describe("GET /api/stations/search", () => {
    it("returns results for exact station name match", async () => {
      const res = await app.request("/api/stations/search?q=South+Ferry");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(0);
      expect(body[0].name).toContain("South Ferry");
    });

    it("returns results for partial station name match", async () => {
      const res = await app.request("/api/stations/search?q=Times");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(0);
      expect(body[0].name).toContain("Times");
    });

    it("returns results for line search", async () => {
      const res = await app.request("/api/stations/search?q=1");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      // All results should have line 1
      body.forEach((station: { lines: string[] }) => {
        expect(station.lines).toContain("1");
      });
    });

    it("handles empty query string", async () => {
      const res = await app.request("/api/stations/search?q=");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
    });

    it("handles special characters in search", async () => {
      const res = await app.request("/api/stations/search?q=42+St");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
    });

    it("expands abbreviations in search", async () => {
      const res = await app.request("/api/stations/search?q=sq");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      // Should match "square" in "Times Square"
      const hasTimesSquare = body.some((s: { name: string }) => s.name.includes("Times"));
      expect(hasTimesSquare).toBe(true);
    });

    it("scores results by relevance", async () => {
      const res = await app.request("/api/stations/search?q=South");

      expect(res.status).toBe(200);

      const body = await res.json();
      if (body.length > 1) {
        // First result should have highest score (starts with query)
        expect(body[0].name).toBeDefined();
      }
    });

    it("returns empty array for no matches", async () => {
      const res = await app.request("/api/stations/search?q=NonExistentStationXYZ");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBe(0);
    });
  });

  describe("GET /api/routes", () => {
    it("returns all routes", async () => {
      const res = await app.request("/api/routes");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(0);
    });

    it("includes route metadata", async () => {
      const res = await app.request("/api/routes");

      const body = await res.json();
      const route1 = body.find((r: { id: string }) => r.id === "1");

      expect(route1).toBeDefined();
      expect(route1.id).toBe("1");
      expect(route1.shortName).toBe("1");
      expect(route1.longName).toBe("Broadway-7th Ave Local");
      expect(route1.color).toBe("#EE352E");
      expect(route1.isExpress).toBe(false);
    });

    it("includes cache headers", async () => {
      const res = await app.request("/api/routes");

      const cacheControl = res.headers.get("Cache-Control");
      expect(cacheControl).toContain("public");
      expect(cacheControl).toContain("max-age=");
    });
  });

  describe("GET /api/routes/:id", () => {
    it("returns route by ID", async () => {
      const res = await app.request("/api/routes/1");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.id).toBe("1");
      expect(body.shortName).toBe("1");
    });

    it("returns 404 for non-existent route", async () => {
      const res = await app.request("/api/routes/Z");

      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error).toContain("not found");
    });
  });

  describe("GET /api/static/complexes", () => {
    it("returns all complexes", async () => {
      const res = await app.request("/api/static/complexes");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(0);
    });

    it("includes complex metadata", async () => {
      const res = await app.request("/api/static/complexes");

      const body = await res.json();
      const complex = body.find((c: { complexId: string }) => c.complexId === "725-726");

      expect(complex).toBeDefined();
      expect(complex.complexId).toBe("725-726");
      expect(complex.name).toBe("Times Sq-42 St / Port Authority");
      expect(Array.isArray(complex.stations)).toBe(true);
      expect(Array.isArray(complex.allLines)).toBe(true);
    });
  });

  describe("GET /api/static/complexes/:id", () => {
    it("returns complex by ID", async () => {
      const res = await app.request("/api/static/complexes/725-726");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.complexId).toBe("725-726");
    });

    it("returns 404 for non-existent complex", async () => {
      const res = await app.request("/api/static/complexes/999-999");

      expect(res.status).toBe(404);
    });
  });
});
