/**
 * Integration tests for Routes and Complexes API endpoints.
 *
 * Tests the full data flow:
 * - Routes API endpoints
 * - Complexes API endpoints
 * - Cross-referencing between routes and complexes
 * - Response validation and caching
 */

import type {
  ComplexIndex,
  RouteIndex,
  StationIndex,
  TransferConnection,
} from "@mta-my-way/shared";
import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { TEST_STATIONS, closeDatabase, createIntegrationTestDatabase } from "./test-helpers.js";

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
  "2": {
    id: "2",
    shortName: "2",
    longName: "7th Ave Express",
    color: "#EE352E",
    textColor: "#FFFFFF",
    feedId: "gtfs",
    division: "A",
    stops: ["725"],
    isExpress: true,
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
  C: {
    id: "C",
    shortName: "C",
    longName: "8th Ave Local",
    color: "#0039A6",
    textColor: "#FFFFFF",
    feedId: "gtfs-ace",
    division: "B",
    stops: ["726"],
    isExpress: false,
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
  "penn-single": {
    complexId: "penn-single",
    name: "34 St-Penn Station",
    stations: ["727"],
    allLines: ["A", "C", "E"],
    allStopIds: ["727N", "727S"],
  },
};

const TEST_TRANSFERS: Record<string, TransferConnection[]> = {
  "725": [{ toStationId: "726", toLines: ["A", "C", "E"], walkingSeconds: 120, accessible: true }],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Routes and Complexes API Integration Tests", () => {
  let db: Database.Database;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
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
    closeDatabase(db);
  });

  describe("GET /api/routes", () => {
    it("returns all routes", async () => {
      const res = await app.request("/api/routes");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBe(4);
    });

    it("includes all route fields", async () => {
      const res = await app.request("/api/routes");

      const body = await res.json();
      const route1 = body.find((r: Route) => r.id === "1");

      expect(route1).toBeDefined();
      expect(route1.id).toBe("1");
      expect(route1.shortName).toBe("1");
      expect(route1.longName).toBe("Broadway-7th Ave Local");
      expect(route1.color).toBe("#EE352E");
      expect(route1.textColor).toBe("#FFFFFF");
      expect(route1.feedId).toBe("gtfs");
      expect(route1.division).toBe("A");
      expect(route1.isExpress).toBe(false);
      expect(Array.isArray(route1.stops)).toBe(true);
    });

    it("sets cache headers for static data", async () => {
      const res = await app.request("/api/routes");

      const cacheControl = res.headers.get("Cache-Control");
      expect(cacheControl).toContain("public");
      expect(cacheControl).toContain("max-age=");
      expect(cacheControl).toContain("stale-while-revalidate");
    });

    it("returns both local and express routes", async () => {
      const res = await app.request("/api/routes");

      const body = await res.json();
      const localRoutes = body.filter((r: Route) => !r.isExpress);
      const expressRoutes = body.filter((r: Route) => r.isExpress);

      expect(localRoutes.length).toBeGreaterThan(0);
      expect(expressRoutes.length).toBeGreaterThan(0);
    });

    it("returns routes from different divisions", async () => {
      const res = await app.request("/api/routes");

      const body = await res.json();
      const divisions = new Set(body.map((r: Route) => r.division));

      expect(divisions.has("A")).toBe(true);
      expect(divisions.has("B")).toBe(true);
    });

    it("includes stop IDs for each route", async () => {
      const res = await app.request("/api/routes");

      const body = await res.json();
      const route1 = body.find((r: Route) => r.id === "1");

      expect(route1.stops).toContain("101");
      expect(route1.stops).toContain("102");
      expect(route1.stops).toContain("725");
    });
  });

  describe("GET /api/routes/:id", () => {
    it("returns route by ID", async () => {
      const res = await app.request("/api/routes/1");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.id).toBe("1");
      expect(body.shortName).toBe("1");
      expect(body.longName).toBe("Broadway-7th Ave Local");
    });

    it("returns 404 for non-existent route", async () => {
      const res = await app.request("/api/routes/Z");

      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error).toContain("not found");
    });

    it("sets cache headers", async () => {
      const res = await app.request("/api/routes/A");

      const cacheControl = res.headers.get("Cache-Control");
      expect(cacheControl).toContain("public");
      expect(cacheControl).toContain("max-age=");
    });

    it("returns express route with isExpress=true", async () => {
      const res = await app.request("/api/routes/2");

      const body = await res.json();
      expect(body.isExpress).toBe(true);
    });

    it("returns local route with isExpress=false", async () => {
      const res = await app.request("/api/routes/C");

      const body = await res.json();
      expect(body.isExpress).toBe(false);
    });
  });

  describe("GET /api/static/complexes", () => {
    it("returns all complexes", async () => {
      const res = await app.request("/api/static/complexes");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBe(2);
    });

    it("includes all complex fields", async () => {
      const res = await app.request("/api/static/complexes");

      const body = await res.json();
      const timesSq = body.find((c: Complex) => c.complexId === "725-726");

      expect(timesSq).toBeDefined();
      expect(timesSq.complexId).toBe("725-726");
      expect(timesSq.name).toBe("Times Sq-42 St / Port Authority");
      expect(Array.isArray(timesSq.stations)).toBe(true);
      expect(Array.isArray(timesSq.allLines)).toBe(true);
      expect(Array.isArray(timesSq.allStopIds)).toBe(true);
    });

    it("includes all lines serving the complex", async () => {
      const res = await app.request("/api/static/complexes");

      const body = await res.json();
      const timesSq = body.find((c: Complex) => c.complexId === "725-726");

      expect(timesSq.allLines).toContain("1");
      expect(timesSq.allLines).toContain("A");
      expect(timesSq.allLines).toContain("N");
    });

    it("includes all stop IDs for the complex", async () => {
      const res = await app.request("/api/static/complexes");

      const body = await res.json();
      const timesSq = body.find((c: Complex) => c.complexId === "725-726");

      expect(timesSq.allStopIds).toContain("725N");
      expect(timesSq.allStopIds).toContain("725S");
      expect(timesSq.allStopIds).toContain("726N");
      expect(timesSq.allStopIds).toContain("726S");
    });

    it("sets cache headers", async () => {
      const res = await app.request("/api/static/complexes");

      const cacheControl = res.headers.get("Cache-Control");
      expect(cacheControl).toContain("public");
      expect(cacheControl).toContain("max-age=");
    });

    it("handles single-station complexes", async () => {
      const res = await app.request("/api/static/complexes");

      const body = await res.json();
      const penn = body.find((c: Complex) => c.complexId === "penn-single");

      expect(penn).toBeDefined();
      expect(penn.stations).toEqual(["727"]);
      expect(penn.allLines).toEqual(["A", "C", "E"]);
    });
  });

  describe("GET /api/static/complexes/:id", () => {
    it("returns complex by ID", async () => {
      const res = await app.request("/api/static/complexes/725-726");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.complexId).toBe("725-726");
      expect(body.name).toBe("Times Sq-42 St / Port Authority");
    });

    it("returns 404 for non-existent complex", async () => {
      const res = await app.request("/api/static/complexes/nonexistent");

      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error).toContain("not found");
    });

    it("sets cache headers", async () => {
      const res = await app.request("/api/static/complexes/penn-single");

      const cacheControl = res.headers.get("Cache-Control");
      expect(cacheControl).toContain("public");
      expect(cacheControl).toContain("max-age=");
    });
  });

  describe("Cross-referencing between routes and complexes", () => {
    it("routes include stops that are in complexes", async () => {
      const routesRes = await app.request("/api/routes/1");
      const route1 = await routesRes.json();

      expect(route1.stops).toContain("725");

      const complexesRes = await app.request("/api/static/complexes/725-726");
      const complex = await complexesRes.json();

      expect(complex.stations).toContain("725");
    });

    it("complex allLines include routes from their stations", async () => {
      const complexesRes = await app.request("/api/static/complexes/725-726");
      const complex = await complexesRes.json();

      // Complex should include line 1 from station 725
      expect(complex.allLines).toContain("1");

      // And line A from station 726
      expect(complex.allLines).toContain("A");
    });
  });

  describe("Data integrity", () => {
    it("all route stop IDs reference valid stations", async () => {
      const routesRes = await app.request("/api/routes");
      const routes = await routesRes.json();

      for (const route of routes) {
        for (const stopId of route.stops) {
          expect(TEST_STATIONS[stopId]).toBeDefined();
        }
      }
    });

    it("all complex station IDs reference valid stations", async () => {
      const complexesRes = await app.request("/api/static/complexes");
      const complexes = await complexesRes.json();

      for (const complex of complexes) {
        for (const stationId of complex.stations) {
          expect(TEST_STATIONS[stationId]).toBeDefined();
        }
      }
    });

    it("all complex stop IDs have corresponding station IDs", async () => {
      const complexesRes = await app.request("/api/static/complexes");
      const complexes = await complexesRes.json();

      for (const complex of complexes) {
        for (const stationId of complex.stations) {
          const station = TEST_STATIONS[stationId];
          expect(complex.allStopIds).toContain(station.northStopId);
          expect(complex.allStopIds).toContain(station.southStopId);
        }
      }
    });
  });
});
