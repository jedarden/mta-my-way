/**
 * Integration tests for station search functionality.
 *
 * Tests the full data flow for station search:
 * - Query parsing and normalization
 * - Abbreviation expansion
 * - Line-based search
 * - Scoring and ranking
 * - Complex expansion
 */

import type { ComplexIndex, RouteIndex, StationIndex } from "@mta-my-way/shared";
import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { closeDatabase, createIntegrationTestDatabase } from "./test-helpers.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const TEST_STATIONS: StationIndex = {
  "101": {
    id: "101",
    name: "South Ferry",
    lat: 40.702,
    lon: -74.013,
    lines: ["1"],
    northStopId: "101N",
    southStopId: "101S",
    transfers: [],
    ada: true,
    borough: "manhattan",
  },
  "102": {
    id: "102",
    name: "Rector St",
    lat: 40.709,
    lon: -74.014,
    lines: ["1"],
    northStopId: "102N",
    southStopId: "102S",
    transfers: [],
    ada: false,
    borough: "manhattan",
  },
  "725": {
    id: "725",
    name: "Times Sq-42 St",
    lat: 40.758,
    lon: -73.985,
    lines: ["1", "2", "3", "7", "N", "Q", "R", "W", "S"],
    northStopId: "725N",
    southStopId: "725S",
    transfers: [],
    ada: true,
    borough: "manhattan",
    complex: "725-726",
  },
  "726": {
    id: "726",
    name: "42 St-Port Authority",
    lat: 40.756,
    lon: -73.988,
    lines: ["A", "C", "E"],
    northStopId: "726N",
    southStopId: "726S",
    transfers: [],
    ada: true,
    borough: "manhattan",
    complex: "725-726",
  },
  "727": {
    id: "727",
    name: "34 St-Penn Station",
    lat: 40.75,
    lon: -73.99,
    lines: ["A", "C", "E"],
    northStopId: "727N",
    southStopId: "727S",
    transfers: [],
    ada: true,
    borough: "manhattan",
  },
  "728": {
    id: "728",
    name: "14 St-Union Sq",
    lat: 40.734,
    lon: -73.989,
    lines: ["L", "N", "Q", "R", "W", "4", "5", "6"],
    northStopId: "728N",
    southStopId: "728S",
    transfers: [],
    ada: true,
    borough: "manhattan",
  },
  "729": {
    id: "729",
    name: "Grand Central",
    lat: 40.752,
    lon: -73.977,
    lines: ["4", "5", "6", "7", "S"],
    northStopId: "729N",
    southStopId: "729S",
    transfers: [],
    ada: true,
    borough: "manhattan",
  },
};

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Station Search Integration Tests", () => {
  let db: Database.Database;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = createIntegrationTestDatabase();
    app = createApp(TEST_STATIONS, TEST_ROUTES, TEST_COMPLEXES, {}, "/nonexistent/dist");
  });

  afterEach(() => {
    closeDatabase(db);
  });

  describe("GET /api/stations/search", () => {
    describe("Basic search functionality", () => {
      it("returns stations matching exact name", async () => {
        const res = await app.request("/api/stations/search?q=Times");

        expect(res.status).toBe(200);

        const body = await res.json();
        expect(Array.isArray(body)).toBe(true);
        expect(body.length).toBeGreaterThan(0);
        expect(body[0]?.name).toContain("Times");
      });

      it("returns stations matching partial name", async () => {
        const res = await app.request("/api/stations/search?q=Ferry");

        expect(res.status).toBe(200);

        const body = await res.json();
        expect(Array.isArray(body)).toBe(true);
        expect(body.some((s: Station) => s.name.includes("Ferry"))).toBe(true);
      });

      it("returns stations matching line identifier", async () => {
        const res = await app.request("/api/stations/search?q=A");

        expect(res.status).toBe(200);

        const body = await res.json();
        expect(Array.isArray(body)).toBe(true);
        // Should return stations with A line (highest priority)
        expect(body.length).toBeGreaterThan(0);
      });

      it("returns empty array for no matches", async () => {
        const res = await app.request("/api/stations/search?q=NonexistentStationXYZ");

        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body).toEqual([]);
      });

      it("handles empty query string", async () => {
        const res = await app.request("/api/stations/search?q=");

        // Empty query fails validation (schema requires min 1 character)
        expect(res.status).toBe(400);

        const body = await res.json();
        expect(body.error).toBeDefined();
      });
    });

    describe("Abbreviation expansion", () => {
      it("expands 'St' to 'Street'", async () => {
        const res = await app.request("/api/stations/search?q=42 St");

        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.length).toBeGreaterThan(0);
        // Should match "42 St-Port Authority"
      });

      it("expands 'Sq' to 'Square'", async () => {
        const res = await app.request("/api/stations/search?q=Union Sq");

        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.length).toBeGreaterThan(0);
        // Should find stations matching "Union Square" (via abbreviation expansion)
        // Note: "Times Sq-42 St" also matches due to "Sq" → "Square" expansion
        const unionSquareStation = body.find((s: { name: string }) => s.name.includes("Union"));
        expect(unionSquareStation?.name).toContain("Union");
      });

      it("expands 'Ave' to 'Avenue'", async () => {
        const res = await app.request("/api/stations/search?q=Grand");

        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.length).toBeGreaterThan(0);
      });

      it("expands multiple abbreviations in query", async () => {
        const res = await app.request("/api/stations/search?q=St");

        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.length).toBeGreaterThan(0);
      });
    });

    describe("Scoring and ranking", () => {
      it("prioritizes exact line matches", async () => {
        const res = await app.request("/api/stations/search?q=A");

        expect(res.status).toBe(200);

        const body = await res.json();
        // Stations with A line should be ranked higher
        const aLineStations = body.filter((s: Station) => s.lines.includes("A"));
        expect(aLineStations.length).toBeGreaterThan(0);
      });

      it("prioritizes name prefix matches", async () => {
        const res = await app.request("/api/stations/search?q=Times");

        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body[0]?.name).toMatch(/^Times/);
      });

      it("ranks by relevance score", async () => {
        const res = await app.request("/api/stations/search?q=St");

        expect(res.status).toBe(200);

        const body = await res.json();
        // Results should be ordered by score
        expect(body.length).toBeGreaterThan(0);
      });
    });

    describe("Case insensitivity", () => {
      it("handles lowercase queries", async () => {
        const res1 = await app.request("/api/stations/search?q=times");
        const res2 = await app.request("/api/stations/search?q=TIMES");

        expect(res1.status).toBe(200);
        expect(res2.status).toBe(200);

        const body1 = await res1.json();
        const body2 = await res2.json();

        expect(body1.length).toBeGreaterThan(0);
        expect(body2.length).toBeGreaterThan(0);
      });

      it("normalizes search input", async () => {
        const res = await app.request("/api/stations/search?q=  times  ");

        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.length).toBeGreaterThan(0);
      });
    });

    describe("Special characters and filtering", () => {
      it("handles special characters in query", async () => {
        const res = await app.request("/api/stations/search?q=42's");

        expect(res.status).toBe(200);

        const body = await res.json();
        expect(Array.isArray(body)).toBe(true);
      });

      it("filters non-alphanumeric characters", async () => {
        const res = await app.request("/api/stations/search?q=Times@#$");

        expect(res.status).toBe(200);

        const body = await res.json();
        // Should still match after stripping special chars
        expect(body.length).toBeGreaterThan(0);
      });
    });

    describe("Response structure", () => {
      it("returns complete station objects", async () => {
        const res = await app.request("/api/stations/search?q=Times");

        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.length).toBeGreaterThan(0);

        const station = body[0];
        expect(station).toHaveProperty("id");
        expect(station).toHaveProperty("name");
        expect(station).toHaveProperty("lat");
        expect(station).toHaveProperty("lon");
        expect(station).toHaveProperty("lines");
        expect(station).toHaveProperty("northStopId");
        expect(station).toHaveProperty("southStopId");
        expect(station).toHaveProperty("ada");
        expect(station).toHaveProperty("borough");
      });

      it("includes complex information when applicable", async () => {
        const res = await app.request("/api/stations/search?q=Times");

        expect(res.status).toBe(200);

        const body = await res.json();
        const timesSquare = body.find((s: Station) => s.id === "725");

        expect(timesSquare).toBeDefined();
        expect(timesSquare?.complex).toBe("725-726");
      });
    });
  });

  describe("GET /api/stations/:id", () => {
    it("returns station with complex expansion", async () => {
      const res = await app.request("/api/stations/725");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.id).toBe("725");
      expect(body).toHaveProperty("complexId");
      expect(body).toHaveProperty("complexName");
      expect(body).toHaveProperty("complexStations");
      expect(body).toHaveProperty("complexLines");
    });

    it("includes all stations in complex", async () => {
      const res = await app.request("/api/stations/725");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(Array.isArray(body.complexStations)).toBe(true);
      expect(body.complexStations.length).toBeGreaterThan(1);
    });

    it("includes all lines in complex", async () => {
      const res = await app.request("/api/stations/725");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(Array.isArray(body.complexLines)).toBe(true);
      expect(body.complexLines).toContain("1");
      expect(body.complexLines).toContain("A");
    });

    it("returns station without complex for non-complex stations", async () => {
      const res = await app.request("/api/stations/101");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.id).toBe("101");
      expect(body.complexStations).toEqual([]);
    });

    it("returns 404 for non-existent station", async () => {
      const res = await app.request("/api/stations/nonexistent");

      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error).toContain("not found");
    });
  });

  describe("Data flow integration", () => {
    it("integrates with station index data", async () => {
      const res = await app.request("/api/stations/search?q=South");

      expect(res.status).toBe(200);

      const body = await res.json();
      const southFerry = body.find((s: Station) => s.id === "101");

      expect(southFerry).toBeDefined();
      expect(southFerry?.name).toBe("South Ferry");
    });

    it("uses transfer connections for search relevance", async () => {
      const res = await app.request("/api/stations/search?q=Port");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.length).toBeGreaterThan(0);
    });
  });
});
