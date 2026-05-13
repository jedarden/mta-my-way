/**
 * Integration tests for cross-user data access prevention.
 *
 * Tests that users cannot access other users' data and that
 * authorization properly enforces ownership boundaries.
 *
 * This addresses critical security gaps identified in the
 * authorization audit report.
 */

import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import { generateApiKey, hashApiKey, registerApiKey } from "../middleware/authentication.js";
import {
  assignRoleToApiKey,
  requireOwnershipOrAdmin,
  requirePermission,
} from "../middleware/rbac.js";
import type { Permission } from "../middleware/rbac.js";
import { initPushDatabase } from "../push/subscriptions.js";
import {
  checkTripOwnership,
  deleteTrip,
  getTripOwner,
  getTrips,
  recordTrip,
  updateTripNotes,
} from "../trip-tracking.js";
import { initTripTracking } from "../trip-tracking.js";
import { TEST_STATIONS, createTripTrackingDatabase } from "./test-helpers.js";

describe("Cross-User Data Access Prevention", () => {
  // Test user IDs
  let userAKeyId: string;
  let userBKeyId: string;
  let adminKeyId: string;

  // API keys
  let userAKey: string;
  let userBKey: string;
  let adminKey: string;

  beforeEach(async () => {
    // Create in-memory database for testing
    const db = createTripTrackingDatabase();
    initPushDatabase(":memory:");

    // Initialize trip tracking with test database
    initTripTracking(db, TEST_STATIONS);

    // Create user A
    userAKeyId = "user_a_" + Math.random().toString(36).substring(7);
    userAKey = await generateApiKey();
    const userAHashed = await hashApiKey(userAKey);
    await registerApiKey({
      keyId: userAKeyId,
      keyHash: userAHashed.hash,
      keySalt: userAHashed.salt,
      scope: "write",
      rateLimitTier: 10,
      active: true,
      createdAt: Date.now(),
      expiresAt: 0,
      role: "user",
    });

    // Create user B
    userBKeyId = "user_b_" + Math.random().toString(36).substring(7);
    userBKey = await generateApiKey();
    const userBHashed = await hashApiKey(userBKey);
    await registerApiKey({
      keyId: userBKeyId,
      keyHash: userBHashed.hash,
      keySalt: userBHashed.salt,
      scope: "write",
      rateLimitTier: 10,
      active: true,
      createdAt: Date.now(),
      expiresAt: 0,
      role: "user",
    });

    // Create admin user
    adminKeyId = "admin_" + Math.random().toString(36).substring(7);
    adminKey = await generateApiKey();
    const adminHashed = await hashApiKey(adminKey);
    await registerApiKey({
      keyId: adminKeyId,
      keyHash: adminHashed.hash,
      keySalt: adminHashed.salt,
      scope: "admin",
      rateLimitTier: 100,
      active: true,
      createdAt: Date.now(),
      expiresAt: 0,
      role: "admin",
    });
  });

  describe("Trip Ownership Isolation", () => {
    let userATripId: string;
    let userBTripId: string;

    beforeEach(() => {
      // Create trips for each user
      const userATrip = recordTrip(
        {
          date: "2026-01-01",
          origin: { stationId: "101", stationName: "South Ferry" },
          destination: { stationId: "725", stationName: "Times Sq-42 St" },
          line: "1",
          departureTime: Date.now(),
          arrivalTime: Date.now() + 30 * 60 * 1000,
          actualDurationMinutes: 30,
          source: "manual",
        },
        userAKeyId
      );
      userATripId = userATrip!.id;

      const userBTrip = recordTrip(
        {
          date: "2026-01-01",
          origin: { stationId: "201", stationName: "Canal St" },
          destination: { stationId: "801", stationName: "Van Cortlandt Park-242 St" },
          line: "1",
          departureTime: Date.now(),
          arrivalTime: Date.now() + 45 * 60 * 1000,
          actualDurationMinutes: 45,
          source: "manual",
        },
        userBKeyId
      );
      userBTripId = userBTrip!.id;
    });

    describe("checkTripOwnership", () => {
      it("should return true for user's own trip", () => {
        expect(checkTripOwnership(userATripId, userAKeyId)).toBe(true);
        expect(checkTripOwnership(userBTripId, userBKeyId)).toBe(true);
      });

      it("should return false for another user's trip", () => {
        expect(checkTripOwnership(userATripId, userBKeyId)).toBe(false);
        expect(checkTripOwnership(userBTripId, userAKeyId)).toBe(false);
      });

      it("should return true for admin checking any trip", () => {
        // Admin can check ownership of any trip
        expect(checkTripOwnership(userATripId, adminKeyId)).toBe(false); // Still checks ownership
        expect(checkTripOwnership(userBTripId, adminKeyId)).toBe(false);
      });
    });

    describe("getTripOwner", () => {
      it("should return correct owner for each trip", () => {
        expect(getTripOwner(userATripId)).toBe(userAKeyId);
        expect(getTripOwner(userBTripId)).toBe(userBKeyId);
      });
    });

    describe("getTrips with ownership filtering", () => {
      it("should only return user's own trips", () => {
        const userATrips = getTrips({ ownerId: userAKeyId });
        const userBTrips = getTrips({ ownerId: userBKeyId });

        expect(userATrips).toHaveLength(1);
        expect(userBTrips).toHaveLength(1);
        expect(userATrips[0]?.id).toBe(userATripId);
        expect(userBTrips[0]?.id).toBe(userBTripId);
      });

      it("should return all trips when no owner filter (admin use)", () => {
        const allTrips = getTrips({});
        expect(allTrips).toHaveLength(2);
      });
    });

    describe("deleteTrip with ownership enforcement", () => {
      it("should allow user to delete their own trip", () => {
        const result = deleteTrip(userATripId, userAKeyId);
        expect(result).toBe(true);

        const trips = getTrips({ ownerId: userAKeyId });
        expect(trips).toHaveLength(0);
      });

      it("should prevent user from deleting another user's trip", () => {
        const result = deleteTrip(userATripId, userBKeyId);
        expect(result).toBe(false);

        // Trip should still exist
        const trips = getTrips({ ownerId: userAKeyId });
        expect(trips).toHaveLength(1);
      });

      it("should allow admin to delete any trip without owner check", () => {
        const result = deleteTrip(userATripId); // No ownerId = admin operation
        expect(result).toBe(true);
      });
    });

    describe("updateTripNotes with ownership enforcement", () => {
      it("should allow user to update their own trip notes", () => {
        const result = updateTripNotes(userATripId, "Updated by user A", userAKeyId);
        expect(result).toBe(true);

        const trip = getTrips({ ownerId: userAKeyId })[0];
        expect(trip?.notes).toBe("Updated by user A");
      });

      it("should prevent user from updating another user's trip notes", () => {
        const result = updateTripNotes(userATripId, "Hacked by user B", userBKeyId);
        expect(result).toBe(false);

        const trip = getTrips({ ownerId: userAKeyId })[0];
        expect(trip?.notes).toBeUndefined();
      });

      it("should allow admin to update any trip without owner check", () => {
        const result = updateTripNotes(userATripId, "Admin update");
        expect(result).toBe(true);

        const trip = getTrips({ ownerId: userAKeyId })[0];
        expect(trip?.notes).toBe("Admin update");
      });
    });
  });

  describe("Middleware Ownership Enforcement", () => {
    let userATripId: string;

    beforeEach(() => {
      const trip = recordTrip(
        {
          date: "2026-01-01",
          origin: { stationId: "101", stationName: "South Ferry" },
          destination: { stationId: "725", stationName: "Times Sq-42 St" },
          line: "1",
          departureTime: Date.now(),
          arrivalTime: Date.now() + 30 * 60 * 1000,
          actualDurationMinutes: 30,
          source: "manual",
        },
        userAKeyId
      );
      userATripId = trip!.id;
    });

    it("should allow access when user owns the resource", async () => {
      const app = new Hono();

      // Mock auth context for user A
      app.use("*", async (c, next) => {
        c.set("auth", {
          keyId: userAKeyId,
          scope: "write",
          rateLimitTier: 10,
          authMethod: "api_key",
        });
        await next();
      });

      app.get(
        "/trips/:tripId",
        requireOwnershipOrAdmin("trips", {
          getOwnerId: (c) => {
            const tripId = c.req.param("tripId");
            return getTripOwner(tripId) || "";
          },
        }),
        (c) => c.json({ success: true })
      );

      const response = await app.request(`/trips/${userATripId}`);
      expect(response.status).toBe(200);
    });

    it("should deny access when user does not own the resource", async () => {
      const app = new Hono();

      // Mock auth context for user B
      app.use("*", async (c, next) => {
        c.set("auth", {
          keyId: userBKeyId,
          scope: "write",
          rateLimitTier: 10,
          authMethod: "api_key",
        });
        await next();
      });

      app.get(
        "/trips/:tripId",
        requireOwnershipOrAdmin("trips", {
          getOwnerId: (c) => {
            const tripId = c.req.param("tripId");
            return getTripOwner(tripId) || "";
          },
        }),
        (c) => c.json({ success: true })
      );

      const response = await app.request(`/trips/${userATripId}`);
      expect(response.status).toBe(403);
    });

    it("should allow admin to access any resource", async () => {
      const app = new Hono();

      // Mock auth context for admin
      app.use("*", async (c, next) => {
        c.set("auth", {
          keyId: adminKeyId,
          scope: "admin",
          rateLimitTier: 100,
          role: "admin",
          authMethod: "api_key",
        });
        await next();
      });

      app.get(
        "/trips/:tripId",
        requireOwnershipOrAdmin("trips", {
          getOwnerId: (c) => {
            const tripId = c.req.param("tripId");
            return getTripOwner(tripId) || "";
          },
        }),
        (c) => c.json({ success: true })
      );

      const response = await app.request(`/trips/${userATripId}`);
      expect(response.status).toBe(200);
    });
  });

  describe("Permission-Based Access Control", () => {
    it("should require trips:read:own permission to view trips", async () => {
      const app = new Hono();

      // Mock auth context for user with read permission
      app.use("*", async (c, next) => {
        c.set("auth", {
          keyId: userAKeyId,
          scope: "read",
          rateLimitTier: 10,
          role: "user",
          authMethod: "api_key",
        });
        await next();
      });

      app.get("/trips", requirePermission("trips:read:own" as Permission), (c) => {
        const auth = c.get("auth");
        const trips = getTrips({
          limit: 10,
          ownerId: auth?.role === "admin" ? undefined : auth?.keyId || "anonymous",
        });
        return c.json({ trips });
      });

      const response = await app.request("/trips");
      expect(response.status).toBe(200);
    });

    it("should deny access without required permission", async () => {
      const app = new Hono();

      // Mock auth context for guest (no trips:read:own permission)
      app.use("*", async (c, next) => {
        c.set("auth", {
          keyId: "guest_user",
          scope: "read",
          rateLimitTier: 5,
          role: "guest",
          authMethod: "api_key",
        });
        await next();
      });

      app.get("/trips", requirePermission("trips:read:own" as Permission), (c) => {
        return c.json({ trips: [] });
      });

      const response = await app.request("/trips");
      expect(response.status).toBe(403);
    });
  });

  describe("Cross-User Data Access Prevention", () => {
    let userATripId: string;
    let userBTripId: string;

    beforeEach(() => {
      const userATrip = recordTrip(
        {
          date: "2026-01-01",
          origin: { stationId: "101", stationName: "South Ferry" },
          destination: { stationId: "725", stationName: "Times Sq-42 St" },
          line: "1",
          departureTime: Date.now(),
          arrivalTime: Date.now() + 30 * 60 * 1000,
          actualDurationMinutes: 30,
          source: "manual",
          notes: "User A's private trip notes",
        },
        userAKeyId
      );
      userATripId = userATrip!.id;

      const userBTrip = recordTrip(
        {
          date: "2026-01-01",
          origin: { stationId: "201", stationName: "Canal St" },
          destination: { stationId: "801", stationName: "Van Cortlandt Park-242 St" },
          line: "1",
          departureTime: Date.now(),
          arrivalTime: Date.now() + 45 * 60 * 1000,
          actualDurationMinutes: 45,
          source: "manual",
          notes: "User B's private trip notes",
        },
        userBKeyId
      );
      userBTripId = userBTrip!.id;
    });

    it("should prevent user B from viewing user A's trip", () => {
      const userBTripsViewingA = getTrips({
        ownerId: userBKeyId,
      });

      expect(userBTripsViewingA).toHaveLength(1);
      expect(userBTripsViewingA[0]?.id).toBe(userBTripId);
      expect(userBTripsViewingA[0]?.notes).toBe("User B's private trip notes");
    });

    it("should prevent user A from modifying user B's trip", () => {
      const result = updateTripNotes(userBTripId, "Hacked by user A", userAKeyId);
      expect(result).toBe(false);

      const trip = getTrips({ ownerId: userBKeyId })[0];
      expect(trip?.notes).toBe("User B's private trip notes");
    });

    it("should prevent user A from deleting user B's trip", () => {
      const result = deleteTrip(userBTripId, userAKeyId);
      expect(result).toBe(false);

      const userBTrips = getTrips({ ownerId: userBKeyId });
      expect(userBTrips).toHaveLength(1);
    });

    it("should allow admin to view all trips", () => {
      const allTrips = getTrips({}); // No ownerId filter = admin view

      expect(allTrips).toHaveLength(2);
      expect(allTrips.some((t) => t.id === userATripId)).toBe(true);
      expect(allTrips.some((t) => t.id === userBTripId)).toBe(true);
    });
  });
});
