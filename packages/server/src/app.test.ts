/**
 * Integration tests for Hono API endpoints.
 *
 * Tests the API using in-memory Hono app with fixture data:
 * - GET /api/health — feed status and system health
 * - GET /api/stations — station index
 * - GET /api/stations/:id — single station with complex expansion
 * - GET /api/stations/search — type-ahead search
 * - GET /api/routes — route index
 * - GET /api/alerts — all alerts with metadata
 * - POST /api/commute/analyze — commute analysis
 *
 * Uses Zod schemas from @mta-my-way/shared for response validation.
 */

import type { ComplexIndex, RouteIndex, StationIndex, TravelTimeIndex } from "@mta-my-way/shared";
import type { Hono } from "hono";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createApp } from "./app.js";
import { initDelayPredictor } from "./delay-predictor.js";

// ---------------------------------------------------------------------------
// Minimal test fixtures
// ---------------------------------------------------------------------------

const STATIONS: StationIndex = {
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
    transfers: [
      { toStationId: "726", toLines: ["A", "C", "E"], walkingSeconds: 120, accessible: true },
    ],
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
};

const ROUTES: RouteIndex = {
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

const COMPLEXES: ComplexIndex = {
  "725-726": {
    complexId: "725-726",
    name: "Times Sq-42 St / Port Authority",
    stations: ["725", "726"],
    allLines: ["1", "2", "3", "7", "N", "Q", "R", "W", "S", "A", "C", "E"],
    allStopIds: ["725N", "725S", "726N", "726S"],
  },
};

const TRANSFERS: Record<
  string,
  Array<{ toStationId: string; toLines: string[]; walkingSeconds: number; accessible: boolean }>
> = {
  "725": [{ toStationId: "726", toLines: ["A", "C", "E"], walkingSeconds: 120, accessible: true }],
};

// Minimal travel times for delay predictor
const TRAVEL_TIMES: TravelTimeIndex = {
  "1": {
    "101N": {
      "102N": 120,
      "725N": 480,
    },
    "102N": {
      "725N": 360,
    },
  },
  A: {
    "726N": {
      "726N": 60,
    },
  },
};

// Initialize delay predictor before tests
beforeAll(() => {
  initDelayPredictor(TRAVEL_TIMES, STATIONS);
});

// Mock the cache module to provide predictable test data
vi.mock("./cache.js", () => ({
  getArrivals: vi.fn((stationId: string) => {
    if (stationId === "101") {
      return {
        stationId: "101",
        stationName: "South Ferry",
        updatedAt: Date.now(),
        feedAge: 5,
        northbound: [
          {
            line: "1",
            direction: "N",
            arrivalTime: Math.floor(Date.now() / 1000) + 120,
            minutesAway: 2,
            isAssigned: true,
            isRerouted: false,
            isExpress: false,
            tripId: "TEST_TRIP_1",
            destination: "Van Cortlandt Park-242 St",
            confidence: "high",
            feedName: "gtfs",
            feedAge: 5,
          },
        ],
        southbound: [],
        alerts: [],
      };
    }
    return null;
  }),
  getFeedStates: vi.fn(() => [
    {
      id: "gtfs",
      name: "A Division (1/2/3/4/5/6/7/S/GS)",
      circuitOpenAt: null,
      lastSuccessAt: Date.now(),
      lastPollAt: Date.now(),
      consecutiveFailures: 0,
      entityCount: 150,
      isStale: false,
      lastErrorMessage: null,
      latencyHistory: [100, 120, 95],
      errorTimestamps: [],
      parseErrors: 0,
      tripReplacementPeriod: 12000,
    },
  ]),
  avgLatency: vi.fn(() => 105),
  errorCount24h: vi.fn(() => 0),
  getPositions: vi.fn(() => null),
}));

vi.mock("./alerts-poller.js", () => ({
  getAllAlerts: vi.fn(() => []),
  getAlertsForLine: vi.fn(() => []),
  getAlertsStatus: vi.fn(() => ({
    alertCount: 0,
    lastSuccessAt: new Date().toISOString(),
    matchRate: 1,
    consecutiveFailures: 0,
    circuitOpen: false,
    unmatchedCount: 0,
  })),
}));

vi.mock("./delay-detector.js", () => ({
  getPredictedAlerts: vi.fn(() => []),
  getDelayDetectorStatus: vi.fn(() => ({
    trackedTrips: 0,
    activeAlerts: 0,
    thresholdMultiplier: 2.0,
    minTrainsForLineAlert: 2,
  })),
}));

vi.mock("./equipment-poller.js", () => ({
  getEquipmentForStation: vi.fn(() => null),
  getAllEquipment: vi.fn(() => []),
  getEquipmentStatus: vi.fn(() => ({
    lastUpdated: null,
    outageCount: 0,
    stationCount: 0,
  })),
  getStationsWithBrokenElevators: vi.fn(() => []),
}));

vi.mock("./push/subscriptions.js", () => ({
  getSubscriptionCount: vi.fn(() => 0),
  upsertSubscription: vi.fn(),
  removeSubscription: vi.fn(),
  updateSubscriptionFavorites: vi.fn(),
  updateSubscriptionQuietHours: vi.fn(),
  updateSubscriptionMorningScores: vi.fn(),
}));

vi.mock("./push/vapid.js", () => ({
  getVapidPublicKey: vi.fn(() => "test-public-key-base64"),
}));

vi.mock("./positions-interpolator.js", () => ({
  buildLineDiagram: vi.fn(() => null),
}));

vi.mock("./trip-lookup.js", () => ({
  lookupTrip: vi.fn(() => null),
}));

// ---------------------------------------------------------------------------
// Response schemas for validation
// ---------------------------------------------------------------------------

const HealthResponseSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  timestamp: z.string(),
  uptime_seconds: z.number(),
  feeds: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      status: z.enum(["ok", "stale", "circuit_open", "never_polled"]),
      lastSuccessAt: z.string().nullable(),
      lastPollAt: z.string().nullable(),
      consecutiveFailures: z.number(),
      entityCount: z.number().nullable(),
      lastError: z.string().nullable(),
      tripReplacementPeriod: z.number().nullable(),
      avgLatencyMs: z.number(),
      errorCount24h: z.number(),
      parseErrors: z.number(),
    })
  ),
  alerts: z.object({
    count: z.number(),
    lastSuccessAt: z.string().nullable(),
    matchRate: z.number(),
    consecutiveFailures: z.number(),
    circuitOpen: z.boolean(),
    unmatchedCount: z.number(),
  }),
  delayDetector: z.object({
    trackedTrips: z.number(),
    activeAlerts: z.number(),
    thresholdMultiplier: z.number(),
    minTrainsForLineAlert: z.number(),
  }),
  equipment: z.object({
    lastUpdated: z.string().nullable(),
    outageCount: z.number(),
    stationCount: z.number(),
  }),
  pushSubscriptions: z.number(),
  cacheHitRate: z.number(),
  memory: z.object({
    rssBytes: z.number(),
    heapUsedBytes: z.number(),
    heapTotalBytes: z.number(),
    externalBytes: z.number(),
  }),
  failingFeedsCount: z.number(),
});

const StationSchema = z.object({
  id: z.string(),
  name: z.string(),
  lat: z.number(),
  lon: z.number(),
  lines: z.array(z.string()),
  northStopId: z.string(),
  southStopId: z.string(),
  transfers: z.array(
    z.object({
      toStationId: z.string(),
      toLines: z.array(z.string()),
      walkingSeconds: z.number(),
      accessible: z.boolean(),
    })
  ),
  ada: z.boolean(),
  borough: z.string(),
  complex: z.string().optional(),
});

const RouteSchema = z.object({
  id: z.string(),
  shortName: z.string(),
  longName: z.string(),
  color: z.string(),
  textColor: z.string(),
  feedId: z.string(),
  division: z.enum(["A", "B"]),
  stops: z.array(z.string()),
});

const AlertsResponseSchema = z.object({
  alerts: z.array(
    z.object({
      id: z.string(),
      severity: z.enum(["info", "warning", "severe"]),
      source: z.enum(["official", "predicted"]),
      headline: z.string(),
      description: z.string(),
      affectedLines: z.array(z.string()),
      activePeriod: z.object({
        start: z.number(),
        end: z.number().optional(),
      }),
      cause: z.string(),
      effect: z.string(),
      isRaw: z.boolean().optional(),
    })
  ),
  meta: z.object({
    count: z.number(),
    officialCount: z.number(),
    predictedCount: z.number(),
    lastUpdatedAt: z.string().nullable(),
    matchRate: z.number(),
    consecutiveFailures: z.number(),
    circuitOpen: z.boolean(),
    delayDetector: z.object({
      trackedTrips: z.number(),
      activeAlerts: z.number(),
      thresholdMultiplier: z.number(),
      minTrainsForLineAlert: z.number(),
    }),
  }),
});

const CommuteAnalyzeResponseSchema = z.object({
  commuteId: z.string(),
  origin: z.object({
    stationId: z.string(),
    stationName: z.string(),
  }),
  destination: z.object({
    stationId: z.string(),
    stationName: z.string(),
  }),
  directRoutes: z.array(z.any()),
  transferRoutes: z.array(z.any()),
  recommendation: z.enum(["direct", "transfer"]),
  timestamp: z.number(),
  walkingOption: z.any().optional(),
});

// ---------------------------------------------------------------------------
// Test helper
// ---------------------------------------------------------------------------

function createTestApp(): Hono {
  return createApp(STATIONS, ROUTES, COMPLEXES, TRANSFERS, "/nonexistent/dist");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("API /api/health", () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
  });

  it("returns 200 when system is healthy", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);

    const body = await res.json();
    const parsed = HealthResponseSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.status).toBe("ok");
      expect(parsed.data.feeds).toHaveLength(1);
      expect(parsed.data.feeds[0].status).toBe("ok");
    }
  });

  it("includes feed latency metrics", async () => {
    const res = await app.request("/api/health");
    const body = await res.json();

    expect(body.feeds[0].avgLatencyMs).toBe(105);
    expect(body.feeds[0].errorCount24h).toBe(0);
  });

  it("includes memory usage", async () => {
    const res = await app.request("/api/health");
    const body = await res.json();

    expect(body.memory.rssBytes).toBeGreaterThan(0);
    expect(body.memory.heapUsedBytes).toBeGreaterThan(0);
  });
});

describe("API /api/stations", () => {
  let app: Hono;

  beforeEach(() => {
    app = createTestApp();
  });

  it("returns all stations", async () => {
    const res = await app.request("/api/stations");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(Object.keys(STATIONS).length);

    // Validate each station shape
    for (const station of body) {
      const parsed = StationSchema.safeParse(station);
      expect(parsed.success).toBe(true);
    }
  });

  it("sets appropriate cache headers", async () => {
    const res = await app.request("/api/stations");
    const cacheControl = res.headers.get("Cache-Control");
    expect(cacheControl).toContain("public");
    expect(cacheControl).toContain("max-age");
  });
});

describe("API /api/stations/:id", () => {
  let app: Hono;

  beforeEach(() => {
    app = createTestApp();
  });

  it("returns single station with complex expansion", async () => {
    const res = await app.request("/api/stations/725");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.id).toBe("725");
    expect(body.name).toBe("Times Sq-42 St");
    expect(body.complexId).toBe("725-726");
    expect(body.complexStations).toHaveLength(2);
    expect(body.complexLines).toContain("A");
    expect(body.complexLines).toContain("1");
  });

  it("returns 404 for unknown station", async () => {
    const res = await app.request("/api/stations/999");
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.error).toContain("not found");
  });

  it("station without complex has empty complexStations", async () => {
    const res = await app.request("/api/stations/101");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.complexStations).toEqual([]);
    expect(body.complexLines).toEqual(body.lines);
  });
});

describe("API /api/stations/search", () => {
  let app: Hono;

  beforeEach(() => {
    app = createTestApp();
  });

  it("searches by station name", async () => {
    const res = await app.request("/api/stations/search?q=Times");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.length).toBeGreaterThan(0);
    expect(body[0].name).toContain("Times");
  });

  it("searches by line ID (case-insensitive)", async () => {
    const res = await app.request("/api/stations/search?q=1");
    expect(res.status).toBe(200);

    const body = await res.json();
    // Should include stations on the 1 line
    expect(body.some((s: { lines: string[] }) => s.lines.includes("1"))).toBe(true);
  });

  it("returns 400 for empty query", async () => {
    const res = await app.request("/api/stations/search?q=");
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toContain("required");
  });

  it("returns empty array for no matches", async () => {
    const res = await app.request("/api/stations/search?q=NonexistentStation");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual([]);
  });
});

describe("API /api/routes", () => {
  let app: Hono;

  beforeEach(() => {
    app = createTestApp();
  });

  it("returns all routes", async () => {
    const res = await app.request("/api/routes");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(Object.keys(ROUTES).length);

    for (const route of body) {
      const parsed = RouteSchema.safeParse(route);
      expect(parsed.success).toBe(true);
    }
  });

  it("returns single route by ID", async () => {
    const res = await app.request("/api/routes/1");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.id).toBe("1");
    expect(body.shortName).toBe("1");
    expect(body.division).toBe("A");
  });

  it("returns 404 for unknown route", async () => {
    const res = await app.request("/api/routes/Z");
    expect(res.status).toBe(404);
  });
});

describe("API /api/alerts", () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
  });

  it("returns alerts with metadata", async () => {
    const res = await app.request("/api/alerts");
    expect(res.status).toBe(200);

    const body = await res.json();
    const parsed = AlertsResponseSchema.safeParse(body);
    expect(parsed.success).toBe(true);
  });

  it("includes cache headers", async () => {
    const res = await app.request("/api/alerts");
    const cacheControl = res.headers.get("Cache-Control");
    expect(cacheControl).toContain("public");
  });
});

describe("API /api/alerts/:lineId", () => {
  let app: Hono;

  beforeEach(() => {
    app = createTestApp();
  });

  it("filters alerts by line ID", async () => {
    const res = await app.request("/api/alerts/1");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.lineId).toBe("1");
    expect(Array.isArray(body.alerts)).toBe(true);
  });

  it("normalizes line ID to uppercase", async () => {
    const res = await app.request("/api/alerts/a");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.lineId).toBe("A");
  });
});

describe("API /api/commute/analyze", () => {
  let app: Hono;

  beforeEach(() => {
    app = createTestApp();
  });

  it("validates request body schema", async () => {
    const res = await app.request("/api/commute/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        originId: "101",
        destinationId: "726",
      }),
    });

    expect(res.status).toBe(200);

    const body = await res.json();
    const parsed = CommuteAnalyzeResponseSchema.safeParse(body);
    expect(parsed.success).toBe(true);

    if (parsed.success) {
      expect(parsed.data.origin.stationId).toBe("101");
      expect(parsed.data.destination.stationId).toBe("726");
    }
  });

  it("returns 404 for unknown origin station", async () => {
    const res = await app.request("/api/commute/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        originId: "999",
        destinationId: "726",
      }),
    });

    expect(res.status).toBe(404);
  });

  it("returns 404 for unknown destination station", async () => {
    const res = await app.request("/api/commute/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        originId: "101",
        destinationId: "999",
      }),
    });

    expect(res.status).toBe(404);
  });

  it("accepts optional parameters", async () => {
    const res = await app.request("/api/commute/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        originId: "101",
        destinationId: "726",
        preferredLines: ["1"],
        commuteId: "work",
        accessibleMode: true,
      }),
    });

    expect(res.status).toBe(200);
  });
});

describe("API /api/arrivals/:stationId", () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
  });

  it("returns arrivals for known station", async () => {
    const res = await app.request("/api/arrivals/101");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.stationId).toBe("101");
    expect(body.stationName).toBe("South Ferry");
    expect(Array.isArray(body.northbound)).toBe(true);
    expect(Array.isArray(body.southbound)).toBe(true);
  });

  it("returns 404 for unknown station", async () => {
    const res = await app.request("/api/arrivals/999");
    expect(res.status).toBe(404);
  });

  it("includes cache headers", async () => {
    const res = await app.request("/api/arrivals/101");
    const cacheControl = res.headers.get("Cache-Control");
    expect(cacheControl).toContain("public");
  });
});

describe("API Push notification endpoints", () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
  });

  it("GET /api/push/vapid-public-key returns the key", async () => {
    const res = await app.request("/api/push/vapid-public-key");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.publicKey).toBe("test-public-key-base64");
  });

  it("POST /api/push/subscribe validates request body", async () => {
    const res = await app.request("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscription: {
          endpoint: "https://fcm.googleapis.com/fcm/send/test",
          keys: {
            p256dh: "test-key",
            auth: "test-auth",
          },
        },
        favorites: [{ id: "fav-1", stationId: "101", lines: ["1"], direction: "both" }],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("DELETE /api/push/unsubscribe validates request body", async () => {
    const res = await app.request("/api/push/unsubscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: "https://fcm.googleapis.com/fcm/send/test",
      }),
    });

    expect(res.status).toBe(200);
  });

  it("PATCH /api/push/subscription updates favorites", async () => {
    const res = await app.request("/api/push/subscription", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: "https://fcm.googleapis.com/fcm/send/test",
        favorites: [{ id: "fav-1", stationId: "101", lines: ["1"], direction: "both" }],
      }),
    });

    expect(res.status).toBe(200);
  });
});

describe("Security headers", () => {
  let app: Hono;

  beforeEach(() => {
    app = createTestApp();
  });

  it("sets CSP headers on API responses", async () => {
    const res = await app.request("/api/health");

    const csp = res.headers.get("Content-Security-Policy");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
  });

  it("sets X-Content-Type-Options: nosniff", async () => {
    const res = await app.request("/api/health");

    const header = res.headers.get("X-Content-Type-Options");
    expect(header).toBe("nosniff");
  });

  it("sets X-Frame-Options: DENY", async () => {
    const res = await app.request("/api/health");

    const header = res.headers.get("X-Frame-Options");
    expect(header).toBe("DENY");
  });

  it("sets Referrer-Policy", async () => {
    const res = await app.request("/api/health");

    const header = res.headers.get("Referrer-Policy");
    expect(header).toBe("strict-origin-when-cross-origin");
  });

  it("sets Strict-Transport-Security", async () => {
    const res = await app.request("/api/health");

    const header = res.headers.get("Strict-Transport-Security");
    expect(header).toContain("max-age=31536000");
    expect(header).toContain("includeSubDomains");
  });
});

describe("Rate limiting", () => {
  let app: Hono;

  beforeEach(() => {
    app = createTestApp();
  });

  it("allows requests within rate limit", async () => {
    const res = await app.request("/api/health", {
      headers: { "CF-Connecting-IP": "127.0.0.1" },
    });

    expect(res.status).toBe(200);
  });

  // Note: Full rate limit testing is difficult in unit tests due to timing
  // The token bucket implementation is tested indirectly via integration
});

describe("API Error handling", () => {
  let app: Hono;

  beforeEach(() => {
    app = createTestApp();
  });

  it("returns 404 for unknown API routes", async () => {
    const res = await app.request("/api/unknown");
    // Unknown API routes return 404
    expect(res.status).toBe(404);
  });

  it("handles malformed JSON in POST requests", async () => {
    const res = await app.request("/api/commute/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not valid json",
    });

    // Malformed JSON returns 400 Bad Request
    expect(res.status).toBe(400);
  });
});
