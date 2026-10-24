/**
 * Integration tests for the read endpoints flagged in
 * docs/authorization-audit.md §2.2/§3.3 (2026-04-09 audit).
 *
 * The audit found GET /api/trips, GET /api/trips/:tripId,
 * GET /api/journal/stats, GET /api/journal/dates/:startDate/:endDate and
 * GET /api/journal/summary answering without authentication. The gap was
 * closed on 2026-04-10 (a01d1513) by wiring requirePermission /
 * requireOwnershipOrAdmin onto every read route and scoping handler
 * queries by owner; these tests pin that closure to the real app so the
 * read surface cannot silently regress to unauthenticated or cross-user
 * reads.
 */

import type { ComplexIndex, RouteIndex, TransferConnection } from "@mta-my-way/shared";
import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { initPushDatabase } from "../push/subscriptions.js";
import { initTripTracking } from "../trip-tracking.js";
import {
  TEST_STATIONS,
  type TestAuthCredentials,
  cleanupAllState,
  closeDatabase,
  createIntegrationTestDatabase,
  createTestUserCredentials,
  requestWithAuthAndCsrf,
} from "./test-helpers.js";

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

describe("Audit-flagged read endpoints enforce authorization", () => {
  let db: Database.Database;
  let app: ReturnType<typeof createApp>;
  let userA: TestAuthCredentials;
  let userB: TestAuthCredentials;

  beforeEach(async () => {
    await cleanupAllState();
    db = createIntegrationTestDatabase();
    initTripTracking(db, TEST_STATIONS);
    initPushDatabase(":memory:");

    userA = await createTestUserCredentials();
    userB = await createTestUserCredentials();
    expect(userA.keyId).not.toBe(userB.keyId);

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

  /** Record a trip for the given user via the API and return its ID. */
  async function createTrip(
    headers: { Authorization: string },
    overrides: { date?: string; departureTime: number; arrivalTime: number }
  ): Promise<string> {
    const res = await requestWithAuthAndCsrf(app, "/api/trips", headers, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        origin: "101",
        destination: "725",
        line: "1",
        ...overrides,
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { trip: { id: string } };
    return body.trip.id;
  }

  describe("anonymous requests are rejected with 401", () => {
    it("GET /api/trips", async () => {
      const res = await app.request("/api/trips");
      expect(res.status).toBe(401);
    });

    it("GET /api/trips/:tripId cannot probe existence", async () => {
      const res = await app.request("/api/trips/00000000-0000-4000-8000-000000000000");
      // Authentication must precede the existence check: an anonymous
      // caller learns nothing about which trip IDs are real.
      expect(res.status).toBe(401);
    });

    it("GET /api/journal/stats", async () => {
      const res = await app.request("/api/journal/stats");
      expect(res.status).toBe(401);
    });

    it("GET /api/journal/dates/:startDate/:endDate", async () => {
      const res = await app.request("/api/journal/dates/2026-04-06/2026-04-07");
      expect(res.status).toBe(401);
    });

    it("GET /api/journal/summary", async () => {
      const res = await app.request("/api/journal/summary");
      expect(res.status).toBe(401);
    });
  });

  describe("cross-user reads fail", () => {
    it("returns 403 when user B reads user A's trip by ID, 200 for the owner", async () => {
      const now = Math.floor(Date.now() / 1000);
      const tripId = await createTrip(
        { Authorization: userA.authorizationHeader },
        {
          departureTime: now - 1800,
          arrivalTime: now,
        }
      );

      const owner = await app.request(`/api/trips/${tripId}`, {
        headers: { Authorization: userA.authorizationHeader },
      });
      expect(owner.status).toBe(200);

      const cross = await app.request(`/api/trips/${tripId}`, {
        headers: { Authorization: userB.authorizationHeader },
      });
      expect(cross.status).toBe(403);
    });

    it("returns 404 for an authenticated user and a trip that does not exist", async () => {
      const res = await app.request("/api/trips/00000000-0000-4000-8000-000000000000", {
        headers: { Authorization: userA.authorizationHeader },
      });
      expect(res.status).toBe(404);
    });

    it("scopes the GET /api/trips listing to the caller's own trips", async () => {
      const now = Math.floor(Date.now() / 1000);
      const aTripId = await createTrip(
        { Authorization: userA.authorizationHeader },
        {
          date: "2026-04-06",
          departureTime: now - 3600,
          arrivalTime: now - 1800,
        }
      );
      const bTripId = await createTrip(
        { Authorization: userB.authorizationHeader },
        {
          date: "2026-04-06",
          departureTime: now - 1800,
          arrivalTime: now,
        }
      );

      const res = await app.request("/api/trips", {
        headers: { Authorization: userB.authorizationHeader },
      });
      expect(res.status).toBe(200);

      const body = (await res.json()) as { trips: { id: string }[]; count: number };
      expect(body.count).toBe(1);
      expect(body.trips.map((t) => t.id)).toEqual([bTripId]);
      expect(body.trips.map((t) => t.id)).not.toContain(aTripId);
    });

    it("excludes user A's trips from GET /api/journal/dates results", async () => {
      const now = Math.floor(Date.now() / 1000);
      const aTripId = await createTrip(
        { Authorization: userA.authorizationHeader },
        {
          date: "2026-04-06",
          departureTime: now - 3600,
          arrivalTime: now - 1800,
        }
      );
      const bTripId = await createTrip(
        { Authorization: userB.authorizationHeader },
        {
          date: "2026-04-06",
          departureTime: now - 1800,
          arrivalTime: now,
        }
      );

      const res = await app.request("/api/journal/dates/2026-04-06/2026-04-07", {
        headers: { Authorization: userB.authorizationHeader },
      });
      expect(res.status).toBe(200);

      const body = (await res.json()) as { trips: { id: string }[]; count: number };
      expect(body.count).toBe(1);
      expect(body.trips.map((t) => t.id)).toEqual([bTripId]);
      expect(body.trips.map((t) => t.id)).not.toContain(aTripId);
    });

    it("computes GET /api/journal/stats from the caller's trips only", async () => {
      const now = Math.floor(Date.now() / 1000);
      // A: one 10-minute trip; B: one 30-minute trip. If A's trip leaked
      // into B's stats the average would be 20, not 30.
      await createTrip(
        { Authorization: userA.authorizationHeader },
        {
          date: "2026-04-06",
          departureTime: now - 3600,
          arrivalTime: now - 3000,
        }
      );
      await createTrip(
        { Authorization: userB.authorizationHeader },
        {
          date: "2026-04-06",
          departureTime: now - 1800,
          arrivalTime: now,
        }
      );

      const res = await app.request("/api/journal/stats", {
        headers: { Authorization: userB.authorizationHeader },
      });
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        totalTrips: number;
        averageDurationMinutes: number;
      };
      expect(body.totalTrips).toBe(1);
      expect(body.averageDurationMinutes).toBe(30);
    });

    it("excludes user A's trips from GET /api/journal/summary", async () => {
      const now = Math.floor(Date.now() / 1000);
      const aTripId = await createTrip(
        { Authorization: userA.authorizationHeader },
        {
          date: "2026-04-06",
          departureTime: now - 3600,
          arrivalTime: now - 3000,
        }
      );
      const bTripId = await createTrip(
        { Authorization: userB.authorizationHeader },
        {
          date: "2026-04-06",
          departureTime: now - 1800,
          arrivalTime: now - 1600,
        }
      );

      const res = await app.request("/api/journal/summary", {
        headers: { Authorization: userB.authorizationHeader },
      });
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        recentTrips: { id: string }[];
        totalTrips: number;
      };
      expect(body.totalTrips).toBe(1);
      expect(body.recentTrips.map((t) => t.id)).toEqual([bTripId]);
      expect(body.recentTrips.map((t) => t.id)).not.toContain(aTripId);
    });
  });
});
