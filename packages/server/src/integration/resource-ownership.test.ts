/**
 * Integration tests pinning per-user ownership on every resource-identifier-
 * scoped write route, re-verifying §3.1 of docs/authorization-audit.md
 * (2026-04-09: "the current resource ownership validation is insufficient
 * for production use").
 *
 * The audit's four ownership findings were closed by later work: trips and
 * push_subscriptions both carry an owner_id column, every route that takes a
 * resource identifier wires requireOwnershipOrAdmin with a database-backed
 * owner lookup, and /api/preferences derives its owner server-side from the
 * validated session so no client-supplied resource identifier exists. The
 * read-side closure is pinned by read-endpoints-authz.test.ts; these tests
 * pin the write side to the real app: user B's credentials against user A's
 * resource must fail with 403 (401 unauthenticated) without mutating the
 * resource, while the owner's identical request succeeds.
 */

import type { ComplexIndex, RouteIndex, TransferConnection } from "@mta-my-way/shared";
import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import {
  getSubscriptionOwner,
  getSubscriptionsByOwner,
  initPushDatabase,
} from "../push/subscriptions.js";
import { initTripTracking } from "../trip-tracking.js";
import {
  TEST_STATIONS,
  type TestAuthCredentials,
  cleanupAllState,
  closeDatabase,
  createIntegrationTestDatabase,
  createTestUserCredentials,
  requestWithAuthAndCsrf,
  requestWithCsrf,
} from "./test-helpers.js";

// ---------------------------------------------------------------------------
// Test fixtures (mirrors read-endpoints-authz.test.ts)
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

describe("Resource-identifier write routes enforce per-user ownership", () => {
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

  /**
   * Register a push subscription for the given user and return the endpoint.
   * The subscription's owner is the caller's keyId, asserted here so a
   * subscribe path that drops ownership fails loudly instead of silently
   * weakening every cross-user assertion below.
   */
  async function createSubscription(creds: TestAuthCredentials): Promise<string> {
    const endpoint = `https://fcm.googleapis.com/fcm/send/${creds.keyId}-endpoint`;
    const res = await requestWithAuthAndCsrf(
      app,
      "/api/push/subscribe",
      { Authorization: creds.authorizationHeader },
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription: {
            endpoint,
            keys: { p256dh: "test-p256dh", auth: "test-auth" },
          },
          favorites: [{ id: "fav-1", stationId: "101", lines: ["1"], direction: "both" }],
        }),
      }
    );
    expect(res.status).toBe(200);
    expect(await getSubscriptionOwner(endpoint)).toBe(creds.keyId);
    return endpoint;
  }

  describe("PATCH /api/trips/:tripId/notes", () => {
    it("403s user B updating user A's trip and leaves the notes untouched", async () => {
      const now = Math.floor(Date.now() / 1000);
      const tripId = await createTrip(
        { Authorization: userA.authorizationHeader },
        { departureTime: now - 1800, arrivalTime: now }
      );

      const cross = await requestWithAuthAndCsrf(
        app,
        `/api/trips/${tripId}/notes`,
        { Authorization: userB.authorizationHeader },
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: "injected by user B" }),
        }
      );
      expect(cross.status).toBe(403);

      const owner = await app.request(`/api/trips/${tripId}`, {
        headers: { Authorization: userA.authorizationHeader },
      });
      expect(owner.status).toBe(200);
      const trip = (await owner.json()) as { notes?: string };
      expect(trip.notes).toBeUndefined();
    });

    it("lets the owner update their own trip notes", async () => {
      const now = Math.floor(Date.now() / 1000);
      const tripId = await createTrip(
        { Authorization: userA.authorizationHeader },
        { departureTime: now - 1800, arrivalTime: now }
      );

      const res = await requestWithAuthAndCsrf(
        app,
        `/api/trips/${tripId}/notes`,
        { Authorization: userA.authorizationHeader },
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: "ran 4 min late" }),
        }
      );
      expect(res.status).toBe(200);
    });
  });

  describe("DELETE /api/trips/:tripId", () => {
    it("403s user B deleting user A's trip and keeps the trip", async () => {
      const now = Math.floor(Date.now() / 1000);
      const tripId = await createTrip(
        { Authorization: userA.authorizationHeader },
        { departureTime: now - 1800, arrivalTime: now }
      );

      const cross = await requestWithAuthAndCsrf(
        app,
        `/api/trips/${tripId}`,
        { Authorization: userB.authorizationHeader },
        { method: "DELETE" }
      );
      expect(cross.status).toBe(403);

      const owner = await app.request(`/api/trips/${tripId}`, {
        headers: { Authorization: userA.authorizationHeader },
      });
      expect(owner.status).toBe(200);
    });

    it("lets the owner delete their own trip", async () => {
      const now = Math.floor(Date.now() / 1000);
      const tripId = await createTrip(
        { Authorization: userA.authorizationHeader },
        { departureTime: now - 1800, arrivalTime: now }
      );

      const res = await requestWithAuthAndCsrf(
        app,
        `/api/trips/${tripId}`,
        { Authorization: userA.authorizationHeader },
        { method: "DELETE" }
      );
      expect(res.status).toBe(200);

      const gone = await app.request(`/api/trips/${tripId}`, {
        headers: { Authorization: userA.authorizationHeader },
      });
      expect(gone.status).toBe(404);
    });
  });

  describe("DELETE /api/push/unsubscribe", () => {
    it("403s user B removing user A's subscription and keeps it", async () => {
      const endpoint = await createSubscription(userA);

      const cross = await requestWithAuthAndCsrf(
        app,
        "/api/push/unsubscribe",
        { Authorization: userB.authorizationHeader },
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint }),
        }
      );
      expect(cross.status).toBe(403);

      // The subscription must still exist and still belong to user A.
      expect(await getSubscriptionOwner(endpoint)).toBe(userA.keyId);
    });

    it("lets the owner remove their own subscription", async () => {
      const endpoint = await createSubscription(userA);

      const res = await requestWithAuthAndCsrf(
        app,
        "/api/push/unsubscribe",
        { Authorization: userA.authorizationHeader },
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint }),
        }
      );
      expect(res.status).toBe(200);
      expect(await getSubscriptionOwner(endpoint)).toBeUndefined();
    });
  });

  describe("PATCH /api/push/subscription", () => {
    it("403s user B updating user A's subscription and leaves it unchanged", async () => {
      const endpoint = await createSubscription(userA);

      // Subscribe seeds default quiet hours, so compare against the
      // pre-attempt record rather than null.
      const before = await getSubscriptionsByOwner(userA.keyId, userA.keyId);
      const beforeRecord = before?.find((s) => s.endpoint === endpoint);
      expect(beforeRecord).toBeDefined();

      const cross = await requestWithAuthAndCsrf(
        app,
        "/api/push/subscription",
        { Authorization: userB.authorizationHeader },
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpoint,
            quietHours: { enabled: true, startHour: 22, endHour: 6 },
          }),
        }
      );
      expect(cross.status).toBe(403);

      const owned = await getSubscriptionsByOwner(userA.keyId, userA.keyId);
      const record = owned?.find((s) => s.endpoint === endpoint);
      expect(record).toBeDefined();
      // User B's quiet hours were not applied — the record is untouched.
      expect(record?.quietHours).toBe(beforeRecord?.quietHours);
      expect(record?.updatedAt).toBe(beforeRecord?.updatedAt);
    });

    it("lets the owner update their own subscription", async () => {
      const endpoint = await createSubscription(userA);

      const res = await requestWithAuthAndCsrf(
        app,
        "/api/push/subscription",
        { Authorization: userA.authorizationHeader },
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpoint,
            quietHours: { enabled: true, startHour: 22, endHour: 6 },
          }),
        }
      );
      expect(res.status).toBe(200);

      const owned = await getSubscriptionsByOwner(userA.keyId, userA.keyId);
      const record = owned?.find((s) => s.endpoint === endpoint);
      expect(JSON.parse(record?.quietHours ?? "{}")).toEqual({
        enabled: true,
        startHour: 22,
        endHour: 6,
      });
    });
  });

  describe("unauthenticated writes are rejected before any existence check", () => {
    it("401s all four resource-identifier write routes", async () => {
      const now = Math.floor(Date.now() / 1000);
      const tripId = await createTrip(
        { Authorization: userA.authorizationHeader },
        { departureTime: now - 1800, arrivalTime: now }
      );
      const endpoint = await createSubscription(userA);

      // Anonymous write requests without an Origin header are stopped by
      // the same-origin gate with 403 before any middleware that could
      // reveal whether the resource exists. Sending a valid same-origin
      // Origin exercises the next gate: authentication returns 401
      // without ever consulting the resource lookup.
      const anonymousNotes = await requestWithCsrf(app, `/api/trips/${tripId}/notes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Origin: "https://localhost" },
        body: JSON.stringify({ notes: "anonymous" }),
      });
      expect(anonymousNotes.status).toBe(401);

      const anonymousDelete = await requestWithCsrf(app, `/api/trips/${tripId}`, {
        method: "DELETE",
        headers: { Origin: "https://localhost" },
      });
      expect(anonymousDelete.status).toBe(401);

      const anonymousUnsubscribe = await requestWithCsrf(app, "/api/push/unsubscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Origin: "https://localhost" },
        body: JSON.stringify({ endpoint }),
      });
      expect(anonymousUnsubscribe.status).toBe(401);

      const anonymousPatchSubscription = await requestWithCsrf(app, "/api/push/subscription", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Origin: "https://localhost" },
        body: JSON.stringify({
          endpoint,
          quietHours: { enabled: true, startHour: 1, endHour: 5 },
        }),
      });
      expect(anonymousPatchSubscription.status).toBe(401);
    });
  });
});
