/**
 * Integration tests for API endpoints with real database operations.
 *
 * Tests the full data flow:
 * - API request handling
 * - Database persistence
 * - Response validation
 * - Cross-component integration
 */

import type {
  ComplexIndex,
  RouteIndex,
  StationIndex,
  TransferConnection,
} from "@mta-my-way/shared";
import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createApp } from "../app.js";
import {
  getAllSubscriptions,
  getSubscriptionCount,
  initPushDatabase,
} from "../push/subscriptions.js";
import {
  deleteTrip,
  getTripById,
  getTrips,
  initTripTracking,
  recordTrip,
} from "../trip-tracking.js";
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
// Response schemas
// ---------------------------------------------------------------------------

const TripRecordSchema = z.object({
  id: z.string(),
  date: z.string(),
  origin: z.object({
    id: z.string(),
    name: z.string(),
  }),
  destination: z.object({
    id: z.string(),
    name: z.string(),
  }),
  line: z.string(),
  departureTime: z.number(),
  arrivalTime: z.number(),
  actualDurationMinutes: z.number(),
  scheduledDurationMinutes: z.number().optional(),
  source: z.enum(["manual", "inferred", "tracked"]),
  notes: z.string().optional(),
});

const TripsResponseSchema = z.object({
  trips: z.array(TripRecordSchema),
  count: z.number(),
  limit: z.number(),
  offset: z.number(),
});

const SuccessResponseSchema = z.object({
  success: z.boolean(),
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("API Integration Tests", () => {
  let db: Database.Database;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = createIntegrationTestDatabase();
    initTripTracking(db, TEST_STATIONS);
    initPushDatabase(":memory:");

    // Create app with test data
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

  describe("POST /api/trips", () => {
    it("creates trip and persists to database", async () => {
      const now = Date.now();

      const res = await app.request("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: "2026-04-06",
          origin: { id: "101", name: "South Ferry" },
          destination: { id: "725", name: "Times Sq-42 St" },
          line: "1",
          departureTime: now - 3600000,
          arrivalTime: now,
          notes: "Test trip",
        }),
      });

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.trip).toBeDefined();

      // Verify it's in the database
      const retrieved = getTripById(body.trip.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.notes).toBe("Test trip");
    });

    it("validates required fields", async () => {
      const res = await app.request("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Missing required fields
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Missing required fields");
    });

    it("calculates actual duration from timestamps", async () => {
      const now = Date.now();
      const departureTime = now - 5400000; // 90 minutes ago

      const res = await app.request("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: { id: "101", name: "South Ferry" },
          destination: { id: "725", name: "Times Sq-42 St" },
          line: "1",
          departureTime,
          arrivalTime: now,
        }),
      });

      const body = await res.json();
      expect(body.trip.actualDurationMinutes).toBe(90);
    });

    it("uses current date when not provided", async () => {
      const now = Date.now();
      const expectedDate = new Date(now).toISOString().split("T")[0];

      const res = await app.request("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: { id: "101", name: "South Ferry" },
          destination: { id: "725", name: "Times Sq-42 St" },
          line: "1",
          departureTime: now - 3600000,
          arrivalTime: now,
        }),
      });

      const body = await res.json();
      expect(body.trip.date).toBe(expectedDate);
    });

    it("returns 500 on database error", () => {
      closeDatabase(db);

      return app
        .request("/api/trips", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            origin: { id: "101", name: "South Ferry" },
            destination: { id: "725", name: "Times Sq-42 St" },
            line: "1",
            departureTime: Date.now() - 3600000,
            arrivalTime: Date.now(),
          }),
        })
        .then((res) => {
          expect(res.status).toBe(500);
        });
    });
  });

  describe("GET /api/trips", () => {
    let tripIds: string[];

    beforeEach(() => {
      // Create test trips
      const now = Date.now();
      const t1 = recordTrip({
        date: "2026-04-06",
        origin: { id: "101", name: "South Ferry" },
        destination: { id: "725", name: "Times Sq-42 St" },
        line: "1",
        departureTime: now - 3600000,
        arrivalTime: now,
        actualDurationMinutes: 60,
        source: "manual",
      });
      const t2 = recordTrip({
        date: "2026-04-06",
        origin: { id: "725", name: "Times Sq-42 St" },
        destination: { id: "726", name: "42 St-Port Authority" },
        line: "A",
        departureTime: now - 7200000,
        arrivalTime: now - 3600000,
        actualDurationMinutes: 60,
        source: "manual",
      });
      tripIds = [t1!.id, t2!.id];
    });

    it("returns trips with pagination", async () => {
      const res = await app.request("/api/trips?limit=10&offset=0");

      expect(res.status).toBe(200);

      const body = await res.json();
      const parsed = TripsResponseSchema.safeParse(body);
      expect(parsed.success).toBe(true);

      if (parsed.success) {
        expect(parsed.data.trips).toHaveLength(2);
        expect(parsed.data.limit).toBe(10);
        expect(parsed.data.offset).toBe(0);
      }
    });

    it("filters by origin station", async () => {
      const res = await app.request("/api/trips?originId=101");

      const body = await res.json();
      expect(body.trips).toHaveLength(1);
      expect(body.trips[0]?.origin.id).toBe("101");
    });

    it("filters by destination station", async () => {
      const res = await app.request("/api/trips?destinationId=726");

      const body = await res.json();
      expect(body.trips).toHaveLength(1);
      expect(body.trips[0]?.destination.id).toBe("726");
    });

    it("filters by line", async () => {
      const res = await app.request("/api/trips?line=1");

      const body = await res.json();
      expect(body.trips).toHaveLength(1);
      expect(body.trips[0]?.line).toBe("1");
    });

    it("filters by date range", async () => {
      const res = await app.request("/api/trips?startDate=2026-04-06&endDate=2026-04-06");

      const body = await res.json();
      expect(body.trips).toHaveLength(2);
    });

    it("respects limit parameter", async () => {
      const res = await app.request("/api/trips?limit=1");

      const body = await res.json();
      expect(body.trips).toHaveLength(1);
    });

    it("respects offset parameter", async () => {
      const res = await app.request("/api/trips?limit=10&offset=1");

      const body = await res.json();
      expect(body.trips).toHaveLength(1);
    });
  });

  describe("GET /api/trips/:tripId", () => {
    it("returns trip by ID", async () => {
      const now = Date.now();
      const created = recordTrip({
        date: "2026-04-06",
        origin: { id: "101", name: "South Ferry" },
        destination: { id: "725", name: "Times Sq-42 St" },
        line: "1",
        departureTime: now - 3600000,
        arrivalTime: now,
        actualDurationMinutes: 60,
        source: "manual",
      });

      const res = await app.request(`/api/trips/${created!.id}`);

      expect(res.status).toBe(200);

      const body = await res.json();
      const parsed = TripRecordSchema.safeParse(body);
      expect(parsed.success).toBe(true);

      if (parsed.success) {
        expect(parsed.data.id).toBe(created!.id);
        expect(parsed.data.origin.id).toBe("101");
      }
    });

    it("returns 404 for non-existent trip", async () => {
      const res = await app.request("/api/trips/non-existent-id");

      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error).toContain("not found");
    });
  });

  describe("PATCH /api/trips/:tripId/notes", () => {
    it("updates trip notes", async () => {
      const now = Date.now();
      const created = recordTrip({
        date: "2026-04-06",
        origin: { id: "101", name: "South Ferry" },
        destination: { id: "725", name: "Times Sq-42 St" },
        line: "1",
        departureTime: now - 3600000,
        arrivalTime: now,
        actualDurationMinutes: 60,
        source: "manual",
      });

      const res = await app.request(`/api/trips/${created!.id}/notes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: "Updated notes" }),
      });

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);

      // Verify in database
      const retrieved = getTripById(created!.id);
      expect(retrieved?.notes).toBe("Updated notes");
    });

    it("returns 400 for missing notes field", async () => {
      const res = await app.request("/api/trips/any-id/notes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });

    it("returns 404 for non-existent trip", async () => {
      const res = await app.request("/api/trips/non-existent/notes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: "Test" }),
      });

      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/trips/:tripId", () => {
    it("deletes trip from database", async () => {
      const now = Date.now();
      const created = recordTrip({
        date: "2026-04-06",
        origin: { id: "101", name: "South Ferry" },
        destination: { id: "725", name: "Times Sq-42 St" },
        line: "1",
        departureTime: now - 3600000,
        arrivalTime: now,
        actualDurationMinutes: 60,
        source: "manual",
      });

      const res = await app.request(`/api/trips/${created!.id}`, {
        method: "DELETE",
      });

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);

      // Verify deleted from database
      const retrieved = getTripById(created!.id);
      expect(retrieved).toBeNull();
    });

    it("returns 404 for non-existent trip", async () => {
      const res = await app.request("/api/trips/non-existent", {
        method: "DELETE",
      });

      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/journal/stats", () => {
    beforeEach(() => {
      const now = Date.now();
      // Create trips with known durations for statistics
      recordTrip({
        date: "2026-04-06",
        origin: { id: "101", name: "South Ferry" },
        destination: { id: "725", name: "Times Sq-42 St" },
        line: "1",
        departureTime: now - 3600000,
        arrivalTime: now,
        actualDurationMinutes: 50,
        scheduledDurationMinutes: 45,
        source: "manual",
      });
      recordTrip({
        date: "2026-04-06",
        origin: { id: "101", name: "South Ferry" },
        destination: { id: "725", name: "Times Sq-42 St" },
        line: "1",
        departureTime: now - 7200000,
        arrivalTime: now - 3600000,
        actualDurationMinutes: 60,
        scheduledDurationMinutes: 55,
        source: "manual",
      });
    });

    it("returns commute statistics", async () => {
      const res = await app.request("/api/journal/stats");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty("commuteId");
      expect(body).toHaveProperty("averageDurationMinutes");
      expect(body).toHaveProperty("medianDurationMinutes");
      expect(body).toHaveProperty("totalTrips");
      expect(body).toHaveProperty("onTimePercentage");
    });

    it("calculates correct average", async () => {
      const res = await app.request("/api/journal/stats");

      const body = await res.json();
      expect(body.averageDurationMinutes).toBe(55); // (50 + 60) / 2
    });

    it("accepts custom commuteId", async () => {
      const res = await app.request("/api/journal/stats?commuteId=work");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.commuteId).toBe("work");
    });
  });

  describe("GET /api/journal/summary", () => {
    beforeEach(() => {
      const now = Date.now();
      recordTrip({
        id: "summary-1",
        date: "2026-04-06",
        origin: { id: "101", name: "South Ferry" },
        destination: { id: "725", name: "Times Sq-42 St" },
        line: "1",
        departureTime: now - 3600000,
        arrivalTime: now,
        actualDurationMinutes: 60,
        source: "manual",
      });
    });

    it("returns summary with recent trips and stats", async () => {
      const res = await app.request("/api/journal/summary");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty("recentTrips");
      expect(body).toHaveProperty("stats");
      expect(body).toHaveProperty("totalTrips");
      expect(Array.isArray(body.recentTrips)).toBe(true);
    });
  });

  describe("Push notification API integration", () => {
    describe("POST /api/push/subscribe", () => {
      it("stores subscription in database", async () => {
        const beforeCount = getSubscriptionCount();

        const res = await app.request("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subscription: {
              endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint",
              keys: {
                p256dh: "test-p256dh",
                auth: "test-auth",
              },
            },
            favorites: [{ id: "fav-1", stationId: "101", lines: ["1"], direction: "both" }],
          }),
        });

        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.success).toBe(true);

        // Verify stored in database
        const afterCount = getSubscriptionCount();
        expect(afterCount).toBe(beforeCount + 1);

        const all = getAllSubscriptions();
        const created = all.find(
          (s) => s.endpoint === "https://fcm.googleapis.com/fcm/send/test-endpoint"
        );
        expect(created).toBeDefined();
      });

      it("validates request body", async () => {
        const res = await app.request("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            // Invalid request
          }),
        });

        // Should return validation error
        expect([400, 422]).toContain(res.status);
      });
    });

    describe("DELETE /api/push/unsubscribe", () => {
      beforeEach(() => {
        // Mock upsertSubscription to create a subscription
        vi.doMock("../push/subscriptions.js", () => ({
          getSubscriptionCount: vi.fn(() => 1),
          upsertSubscription: vi.fn(),
          removeSubscription: vi.fn(() => true),
        }));
      });

      it("validates endpoint in request body", async () => {
        const res = await app.request("/api/push/unsubscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint",
          }),
        });

        // Should succeed or return validation error
        expect([200, 400]).toContain(res.status);
      });
    });
  });

  describe("Data flow integration tests", () => {
    it("creates trip via API and retrieves via database function", async () => {
      const now = Date.now();

      // Create via API
      const res = await app.request("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: { id: "101", name: "South Ferry" },
          destination: { id: "725", name: "Times Sq-42 St" },
          line: "1",
          departureTime: now - 3600000,
          arrivalTime: now,
          notes: "Integration test",
        }),
      });

      const apiResponse = await res.json();
      const tripId = apiResponse.trip.id;

      // Retrieve via database function
      const dbTrip = getTripById(tripId);

      expect(dbTrip).toBeDefined();
      expect(dbTrip?.id).toBe(tripId);
      expect(dbTrip?.notes).toBe("Integration test");
    });

    it("updates trip via API and retrieves via GET endpoint", async () => {
      const now = Date.now();
      const created = recordTrip({
        id: "flow-test-1",
        date: "2026-04-06",
        origin: { id: "101", name: "South Ferry" },
        destination: { id: "725", name: "Times Sq-42 St" },
        line: "1",
        departureTime: now - 3600000,
        arrivalTime: now,
        actualDurationMinutes: 60,
        source: "manual",
      });

      // Update via API
      await app.request(`/api/trips/${created!.id}/notes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: "Updated via API" }),
      });

      // Retrieve via API
      const res = await app.request(`/api/trips/${created!.id}`);
      const body = await res.json();

      expect(body.notes).toBe("Updated via API");
    });

    it("deletes trip via API and verifies via database function", async () => {
      const now = Date.now();
      const created = recordTrip({
        id: "flow-test-2",
        date: "2026-04-06",
        origin: { id: "101", name: "South Ferry" },
        destination: { id: "725", name: "Times Sq-42 St" },
        line: "1",
        departureTime: now - 3600000,
        arrivalTime: now,
        actualDurationMinutes: 60,
        source: "manual",
      });

      // Delete via API
      await app.request(`/api/trips/${created!.id}`, {
        method: "DELETE",
      });

      // Verify via database function
      const retrieved = getTripById(created!.id);
      expect(retrieved).toBeNull();
    });
  });
});
