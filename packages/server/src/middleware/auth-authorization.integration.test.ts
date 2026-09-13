/**
 * Integration tests for the authentication → authorization middleware chain.
 *
 * The production chain on every /api/* route is:
 *
 *   optionalAuth()            — extracts credentials, validates them, and
 *                               (on success) attaches the auth context
 *     ↓
 *   requirePermission() /     — reads that context and enforces role,
 *   requireResourceAccess()     scope, and ownership rules
 *
 * These tests drive that chain end-to-end through `createApp` and cover:
 * - Credential extraction (Authorization header, X-API-Key header, query param)
 * - Token validation failure paths (malformed, unknown, wrong secret, revoked)
 * - Role-based access control (guest < user < admin hierarchy)
 * - Scope-based permission checks (read < write < admin)
 * - Propagation: the auth state attached by the authentication middleware is
 *   what the authorization middleware (and the handlers) act on
 * - The strict `apiKeyAuth` middleware mounted directly, including key
 *   expiration, scope requirements, role gates, and lockout
 * - The JWT validation utilities that back the auth stack's token handling
 *
 * Every assertion pins an exact status (or message) rather than accepting a
 * range, so a regression in any layer of the chain fails the test.
 */

import type { ComplexIndex, RouteIndex, StationIndex, TravelTimeIndex } from "@mta-my-way/shared";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { initDelayPredictor } from "../delay-predictor.js";
import {
  type TestAuthCredentials,
  cleanupAllState,
  createTestApiKey,
  createTestReadCredentials,
  createTestUserCredentials,
} from "../integration/test-helpers.js";
import { closePushDatabase, initPushDatabase } from "../push/subscriptions.js";
import { initTripTracking } from "../trip-tracking.js";
import {
  apiKeyAuth,
  generateApiKey,
  grantPermissionsToApiKey,
  hashApiKey,
  registerApiKey,
  revokeApiKey,
  revokePermissionsFromApiKey,
} from "./authentication.js";
import { createJwt, verifyJwt } from "./jwt-validation.js";
import {
  getRbacAuthContext,
  getRolePermissions,
  requirePermission,
  requireRole,
  requireRoleLevel,
} from "./rbac.js";

// ---------------------------------------------------------------------------
// Minimal feed fixtures — only what createApp and the trips routes need.
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
  "725": {
    id: "725",
    name: "Times Sq-42 St",
    lat: 40.758,
    lon: -73.985,
    lines: ["1"],
    northStopId: "725N",
    southStopId: "725S",
    transfers: [],
    ada: true,
    borough: "manhattan",
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
    stops: ["101", "725"],
    isExpress: false,
  },
};

const COMPLEXES: ComplexIndex = {};
const TRANSFERS = {};
const TRAVEL_TIMES: TravelTimeIndex = {};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Register a key with full control over its lifecycle fields. */
async function registerTestKey(options: {
  scope?: "read" | "write" | "admin";
  role?: "guest" | "user" | "admin";
  expiresAt?: number;
}): Promise<TestAuthCredentials> {
  const keyId = `test_key_${Math.random().toString(36).substring(7)}`;
  const apiKey = await generateApiKey();
  const hashed = await hashApiKey(apiKey);

  await registerApiKey({
    keyId,
    keyHash: hashed.hash,
    keySalt: hashed.salt,
    scope: options.scope ?? "read",
    role: options.role ?? "user",
    rateLimitTier: 10,
    active: true,
    createdAt: Date.now(),
    expiresAt: options.expiresAt ?? 0,
    failedAttempts: 0,
  });

  return { keyId, apiKey, authorizationHeader: `Bearer ${keyId}:${apiKey}` };
}

/** Fetch a CSRF token (the app issues one from /api/csrf-token). */
async function getCsrfToken(app: Hono): Promise<string> {
  const res = await app.request("/api/csrf-token");
  expect(res.status).toBe(200);
  const body = (await res.json()) as { token: string };
  return body.token;
}

/** POST a valid trip payload with authentication and CSRF handled. */
async function postTrip(app: Hono, creds: TestAuthCredentials): Promise<Response> {
  const token = await getCsrfToken(app);
  const nowSec = Math.floor(Date.now() / 1000);
  return app.request("/api/trips", {
    method: "POST",
    headers: {
      Authorization: creds.authorizationHeader,
      "Content-Type": "application/json",
      "X-CSRF-Token": token,
    },
    body: JSON.stringify({
      origin: "101",
      destination: "725",
      line: "1",
      departureTime: nowSec - 3600,
      arrivalTime: nowSec,
    }),
  });
}

/**
 * Build a minimal app that mounts the strict authentication middleware and
 * the RBAC authorization middlewares directly, so their contracts (key
 * expiration, scope requirements, role gates, context propagation) can be
 * exercised in isolation from the production route wiring.
 */
function buildStrictChainApp(requiredScope: "read" | "write" | "admin"): Hono {
  const strict = new Hono();

  strict.use("/api/*", apiKeyAuth({ requiredScope }));

  // Returns the auth context as seen by the handler — the propagation probe.
  strict.get("/api/whoami", (c) => {
    const auth = getRbacAuthContext(c);
    return c.json({
      keyId: auth?.keyId,
      role: auth?.role,
      scope: auth?.scope,
      authMethod: auth?.authMethod,
    });
  });

  strict.get("/api/admin-only", requireRole("admin"), (c) => c.json({ ok: true }));
  strict.get("/api/user-or-higher", requireRoleLevel("user"), (c) => c.json({ ok: true }));
  strict.get("/api/trips", requirePermission("trips:read:own"), (c) => c.json({ ok: true }));

  return strict;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Authentication and authorization middleware chain", () => {
  let app: Hono;

  beforeEach(async () => {
    await cleanupAllState();
    // The trips routes gate on the push database and trip tracking lazily
    // binds to it on first write — the same production wiring as index.ts.
    initPushDatabase(":memory:");
    initTripTracking(null, STATIONS);
    initDelayPredictor(TRAVEL_TIMES, STATIONS);
    app = createApp(STATIONS, ROUTES, COMPLEXES, TRANSFERS, "");
  });

  afterEach(() => {
    closePushDatabase();
  });

  describe("Authentication middleware: token extraction from headers", () => {
    it("authenticates a valid key sent as an Authorization Bearer header", async () => {
      const creds = await createTestUserCredentials();
      const res = await app.request("/api/trips", {
        headers: { Authorization: creds.authorizationHeader },
      });
      expect(res.status).toBe(200);
    });

    it("authenticates a valid key sent as an X-API-Key header", async () => {
      const creds = await createTestUserCredentials();
      const res = await app.request("/api/trips", {
        headers: { "X-API-Key": `${creds.keyId}:${creds.apiKey}` },
      });
      expect(res.status).toBe(200);
    });

    it("authenticates a valid key sent as an api_key query parameter", async () => {
      const creds = await createTestUserCredentials();
      const res = await app.request(
        `/api/trips?api_key=${encodeURIComponent(`${creds.keyId}:${creds.apiKey}`)}`
      );
      expect(res.status).toBe(200);
    });

    it("does not authenticate a Bearer token without the keyId:secret separator", async () => {
      const creds = await createTestUserCredentials();
      const res = await app.request("/api/trips", {
        headers: { Authorization: `Bearer ${creds.apiKey}` },
      });
      // The token cannot be parsed into credentials, so the authorization
      // middleware sees no auth context and rejects with 401.
      expect(res.status).toBe(401);
    });
  });

  describe("Authentication middleware: token validation failure paths", () => {
    it("rejects a request with no credentials with 401", async () => {
      const res = await app.request("/api/trips");
      expect(res.status).toBe(401);
      // Hono surfaces HTTPException messages as the plain-text body.
      expect(await res.text()).toBe("Authentication required");
    });

    it("rejects a malformed token with 401", async () => {
      const res = await app.request("/api/trips", {
        headers: { Authorization: "Bearer not-a-valid-token" },
      });
      expect(res.status).toBe(401);
    });

    it("rejects an unknown key id with 401", async () => {
      const res = await app.request("/api/trips", {
        headers: { Authorization: "Bearer test_key_unknown:some-secret" },
      });
      expect(res.status).toBe(401);
    });

    it("rejects a valid key id paired with the wrong secret with 401", async () => {
      const creds = await createTestUserCredentials();
      const res = await app.request("/api/trips", {
        headers: { Authorization: `Bearer ${creds.keyId}:wrong-secret-value` },
      });
      expect(res.status).toBe(401);
    });

    it("rejects a revoked key with 401", async () => {
      const creds = await createTestApiKey("write", "user");
      const before = await app.request("/api/trips", {
        headers: { Authorization: creds.authorizationHeader },
      });
      expect(before.status).toBe(200);

      expect(revokeApiKey(creds.keyId)).toBe(true);

      const after = await app.request("/api/trips", {
        headers: { Authorization: creds.authorizationHeader },
      });
      expect(after.status).toBe(401);
    });
  });

  describe("Strict apiKeyAuth middleware chain", () => {
    it("rejects an expired key with 401", async () => {
      const strict = buildStrictChainApp("read");
      const creds = await registerTestKey({
        scope: "read",
        role: "user",
        expiresAt: Date.now() - 1000,
      });
      const res = await strict.request("/api/whoami", {
        headers: { Authorization: creds.authorizationHeader },
      });
      expect(res.status).toBe(401);
    });

    it("enforces the required scope even for a valid key", async () => {
      const strict = buildStrictChainApp("write");
      const creds = await createTestReadCredentials();
      const res = await strict.request("/api/whoami", {
        headers: { Authorization: creds.authorizationHeader },
      });
      expect(res.status).toBe(403);
      expect(await res.text()).toContain("Required scope: write");
    });

    it("propagates the auth context (keyId, role, scope, method) to the handler", async () => {
      const strict = buildStrictChainApp("read");
      const creds = await createTestReadCredentials();
      const res = await strict.request("/api/whoami", {
        headers: { Authorization: creds.authorizationHeader },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        keyId?: string;
        role?: string;
        scope?: string;
        authMethod?: string;
      };
      expect(body.keyId).toBe(creds.keyId);
      expect(body.role).toBe("user");
      expect(body.scope).toBe("read");
      expect(body.authMethod).toBe("api_key");
    });

    it("requireRole admits the required role and rejects lower roles", async () => {
      const strict = buildStrictChainApp("read");
      const admin = await createTestApiKey("admin", "admin");
      const user = await createTestUserCredentials();

      const adminRes = await strict.request("/api/admin-only", {
        headers: { Authorization: admin.authorizationHeader },
      });
      expect(adminRes.status).toBe(200);

      const userRes = await strict.request("/api/admin-only", {
        headers: { Authorization: user.authorizationHeader },
      });
      expect(userRes.status).toBe(403);
      expect(await userRes.text()).toContain("admin");
    });

    it("requireRoleLevel admits a user and rejects a guest", async () => {
      const strict = buildStrictChainApp("read");
      const user = await createTestUserCredentials();
      const guest = await createTestApiKey("read", "guest");

      const userRes = await strict.request("/api/user-or-higher", {
        headers: { Authorization: user.authorizationHeader },
      });
      expect(userRes.status).toBe(200);

      const guestRes = await strict.request("/api/user-or-higher", {
        headers: { Authorization: guest.authorizationHeader },
      });
      expect(guestRes.status).toBe(403);
    });

    it("requirePermission follows the role hierarchy on the mounted chain", async () => {
      const strict = buildStrictChainApp("read");
      const user = await createTestUserCredentials();
      const guest = await createTestApiKey("read", "guest");

      const userRes = await strict.request("/api/trips", {
        headers: { Authorization: user.authorizationHeader },
      });
      expect(userRes.status).toBe(200);

      const guestRes = await strict.request("/api/trips", {
        headers: { Authorization: guest.authorizationHeader },
      });
      expect(guestRes.status).toBe(403);
    });

    it("locks out an IP after repeated failed authentication attempts", async () => {
      const strict = buildStrictChainApp("read");
      const creds = await createTestUserCredentials();

      let sawLockout = false;
      for (let attempt = 0; attempt < 8; attempt++) {
        const res = await strict.request("/api/whoami", {
          headers: { Authorization: `Bearer ${creds.keyId}:wrong-secret` },
        });
        if (res.status === 429) {
          sawLockout = true;
          break;
        }
        expect(res.status).toBe(401);
      }
      expect(sawLockout).toBe(true);
    });
  });

  describe("Authorization middleware: role-based access control", () => {
    it("admits a user role to read its own trips (happy path)", async () => {
      const creds = await createTestUserCredentials();
      const res = await app.request("/api/trips", {
        headers: { Authorization: creds.authorizationHeader },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("Cache-Control")).toContain("max-age=15");
    });

    it("admits an admin role, which inherits user permissions", async () => {
      const admin = await createTestApiKey("admin", "admin");
      const res = await app.request("/api/trips", {
        headers: { Authorization: admin.authorizationHeader },
      });
      expect(res.status).toBe(200);
    });

    it("forbids — but does not reject — a guest role lacking the permission", async () => {
      const guest = await createTestApiKey("read", "guest");
      const res = await app.request("/api/trips", {
        headers: { Authorization: guest.authorizationHeader },
      });
      // 403 (authenticated, insufficient role) — not 401 (unauthenticated).
      // The distinction proves the auth context reached the authorization
      // middleware and only the permission check failed.
      expect(res.status).toBe(403);
      expect(await res.text()).toBe("Permission denied: trips:read:own");
    });

    it("grants additional permissions to a key, flipping 403 to 200", async () => {
      const guest = await createTestApiKey("read", "guest");

      // The role alone does not carry the permission…
      expect(getRolePermissions("guest")).not.toContain("trips:read:own");
      expect(getRolePermissions("user")).toContain("trips:read:own");

      const denied = await app.request("/api/trips", {
        headers: { Authorization: guest.authorizationHeader },
      });
      expect(denied.status).toBe(403);

      // …and a per-key grant adds it on top of the role.
      expect(grantPermissionsToApiKey(guest.keyId, ["trips:read:own"])).toBe(true);

      const allowed = await app.request("/api/trips", {
        headers: { Authorization: guest.authorizationHeader },
      });
      expect(allowed.status).toBe(200);
    });

    it("revokes the additional permission, flipping back to 403", async () => {
      const guest = await createTestApiKey("read", "guest");
      grantPermissionsToApiKey(guest.keyId, ["trips:read:own"]);

      const allowed = await app.request("/api/trips", {
        headers: { Authorization: guest.authorizationHeader },
      });
      expect(allowed.status).toBe(200);

      expect(revokePermissionsFromApiKey(guest.keyId, ["trips:read:own"])).toBe(true);

      const denied = await app.request("/api/trips", {
        headers: { Authorization: guest.authorizationHeader },
      });
      expect(denied.status).toBe(403);
    });
  });

  describe("Authorization middleware: scope-based permission checks", () => {
    it("admits a write-scope key to record a trip (happy path)", async () => {
      const creds = await createTestUserCredentials();
      const res = await postTrip(app, creds);
      expect(res.status).toBe(201);
      const body = (await res.json()) as { trip?: { id: string } };
      expect(body.trip?.id).toBeDefined();

      // The handler scoped the new resource to the authenticated key —
      // the auth state propagated all the way into the data layer.
      const fetched = await app.request(`/api/trips/${body.trip?.id}`, {
        headers: { Authorization: creds.authorizationHeader },
      });
      expect(fetched.status).toBe(200);
      const trip = (await fetched.json()) as { ownerId?: string };
      expect(trip.ownerId).toBe(creds.keyId);
    });

    it("forbids a read-scope key from recording a trip", async () => {
      const creds = await createTestReadCredentials();
      const res = await postTrip(app, creds);
      expect(res.status).toBe(403);
      expect(await res.text()).toContain("Required scope: write");
    });

    it("admits an admin-scope key via the admin bypass", async () => {
      const admin = await createTestApiKey("admin", "admin");
      const res = await postTrip(app, admin);
      expect(res.status).toBe(201);
    });

    it("rejects a state-changing request without a CSRF token before route authorization", async () => {
      const creds = await createTestUserCredentials();
      const res = await app.request("/api/commute/analyze", {
        method: "POST",
        headers: {
          Authorization: creds.authorizationHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      // Valid credentials, but the CSRF middleware earlier in the chain
      // rejects the write before the route's authorization middlewares run.
      expect(res.status).toBe(403);
      expect(await res.text()).toBe("Invalid CSRF token");

      // With a token, the same request gets past CSRF and is then rejected
      // by the scope-based authorization middleware instead.
      const readonly = await createTestReadCredentials();
      const scoped = await app.request("/api/commute/analyze", {
        method: "POST",
        headers: {
          Authorization: readonly.authorizationHeader,
          "Content-Type": "application/json",
          "X-CSRF-Token": await getCsrfToken(app),
        },
        body: JSON.stringify({}),
      });
      expect(scoped.status).toBe(403);
      expect(await scoped.text()).toContain("Required scope: write");
    });
  });

  describe("Auth state propagation between middlewares", () => {
    it("scopes list results to the authenticated owner", async () => {
      const owner = await createTestUserCredentials();
      const stranger = await createTestUserCredentials();
      const created = await postTrip(app, owner);
      expect(created.status).toBe(201);

      const ownRes = await app.request("/api/trips", {
        headers: { Authorization: owner.authorizationHeader },
      });
      expect(ownRes.status).toBe(200);
      const ownBody = (await ownRes.json()) as { trips: Array<{ id: string }>; count: number };
      expect(ownBody.count).toBe(1);

      // The stranger's auth context carries a different keyId, so the
      // handler scopes the query away from the owner's trip.
      const strangerRes = await app.request("/api/trips", {
        headers: { Authorization: stranger.authorizationHeader },
      });
      expect(strangerRes.status).toBe(200);
      const strangerBody = (await strangerRes.json()) as { count: number };
      expect(strangerBody.count).toBe(0);
    });

    it("enforces resource ownership: owner and admin admitted, stranger denied", async () => {
      const owner = await createTestUserCredentials();
      const stranger = await createTestUserCredentials();
      const created = await postTrip(app, owner);
      expect(created.status).toBe(201);
      const { trip } = (await created.json()) as { trip: { id: string } };

      const ownerRes = await app.request(`/api/trips/${trip.id}`, {
        headers: { Authorization: owner.authorizationHeader },
      });
      expect(ownerRes.status).toBe(200);

      const strangerRes = await app.request(`/api/trips/${trip.id}`, {
        headers: { Authorization: stranger.authorizationHeader },
      });
      expect(strangerRes.status).toBe(403);

      const admin = await createTestApiKey("admin", "admin");
      const adminRes = await app.request(`/api/trips/${trip.id}`, {
        headers: { Authorization: admin.authorizationHeader },
      });
      expect(adminRes.status).toBe(200);
    });
  });

  describe("JWT token validation utilities", () => {
    const SECRET = "integration-test-signing-secret";

    it("verifies a freshly signed token and returns its claims", async () => {
      const token = await createJwt({ sub: "user-1", role: "user" }, SECRET, {
        expiresIn: 300,
        issuer: "mta-my-way",
        audience: "mta-my-way-api",
      });
      const result = await verifyJwt(token, SECRET);
      expect(result.valid).toBe(true);
      expect(result.payload?.sub).toBe("user-1");
      expect(result.payload?.role).toBe("user");
      expect(result.payload?.iss).toBe("mta-my-way");
    });

    it("rejects an expired token", async () => {
      // Validation allows a 60s default clock skew, so the token must be
      // expired by more than that to be rejected.
      const token = await createJwt({ sub: "user-1" }, SECRET, { expiresIn: -120 });
      const result = await verifyJwt(token, SECRET);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("rejects a token signed with a different secret", async () => {
      const token = await createJwt({ sub: "user-1" }, SECRET, { expiresIn: 300 });
      const result = await verifyJwt(token, `${SECRET}-rotated`);
      expect(result.valid).toBe(false);
    });

    it("rejects a token whose payload was tampered with", async () => {
      const token = await createJwt({ sub: "user-1", role: "user" }, SECRET, { expiresIn: 300 });
      const [header, , signature] = token.split(".");
      const forged = JSON.stringify({ sub: "user-1", role: "admin" });
      const forgedPayload = btoa(forged).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      const result = await verifyJwt(`${header}.${forgedPayload}.${signature}`, SECRET);
      expect(result.valid).toBe(false);
    });

    it("rejects structurally invalid tokens", async () => {
      expect((await verifyJwt("not-a-jwt", SECRET)).valid).toBe(false);
      expect((await verifyJwt("a.b", SECRET)).valid).toBe(false);
      expect((await verifyJwt("", SECRET)).valid).toBe(false);
    });
  });

  describe("Middleware ordering and end-to-end flow", () => {
    it("applies security headers to authenticated responses", async () => {
      const creds = await createTestUserCredentials();
      const res = await app.request("/api/trips", {
        headers: { Authorization: creds.authorizationHeader },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    });

    it("runs the full journey: reject anonymous → authenticate → record → scope", async () => {
      const owner = await createTestUserCredentials();
      const stranger = await createTestUserCredentials();
      const admin = await createTestApiKey("admin", "admin");

      // 1. Anonymous request is rejected by the authorization middleware.
      const anonymous = await app.request("/api/trips");
      expect(anonymous.status).toBe(401);

      // 2. Valid credentials pass authentication and authorization.
      const authorized = await app.request("/api/trips", {
        headers: { Authorization: owner.authorizationHeader },
      });
      expect(authorized.status).toBe(200);

      // 3. The authenticated user records a trip.
      const created = await postTrip(app, owner);
      expect(created.status).toBe(201);
      const { trip } = (await created.json()) as { trip: { id: string } };

      // 4. The owner sees it; the stranger does not; the admin bypasses
      //    the ownership scope.
      const own = await app.request("/api/trips", {
        headers: { Authorization: owner.authorizationHeader },
      });
      const ownBody = (await own.json()) as { trips: Array<{ id: string }>; count: number };
      expect(ownBody.count).toBe(1);
      expect(ownBody.trips[0]?.id).toBe(trip.id);

      const strangerRes = await app.request(`/api/trips/${trip.id}`, {
        headers: { Authorization: stranger.authorizationHeader },
      });
      expect(strangerRes.status).toBe(403);

      const adminRes = await app.request(`/api/trips/${trip.id}`, {
        headers: { Authorization: admin.authorizationHeader },
      });
      expect(adminRes.status).toBe(200);
    });
  });
});
