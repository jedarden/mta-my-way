/**
 * Tests for authentication middleware.
 */

import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ApiKey,
  type ApiKeyScope,
  apiKeyAuth,
  createSession,
  getAuthContext,
  invalidateAllSessionsForKey,
  invalidateSession,
  isAuthenticated,
  optionalAuth,
  registerApiKey,
  requireScope,
  signedRequestAuth,
} from "./authentication.js";

describe("Authentication Middleware", () => {
  let app: Hono;
  let testApiKey: ApiKey;

  beforeEach(() => {
    app = new Hono();

    // Register a test API key
    testApiKey = {
      keyId: "test_key_123",
      keyHash: "dGVzdF9zZWNyZXQ=", // base64 of "test_secret" (first 16 chars)
      scope: "read" as ApiKeyScope,
      owner: "test_user",
      rateLimitTier: 100,
      active: true,
      createdAt: Date.now(),
      expiresAt: 0, // No expiration
    };
    registerApiKey(testApiKey);

    // Register a write scope API key
    const writeApiKey: ApiKey = {
      keyId: "write_key_456",
      keyHash: "d3JpdGVfc2VjcmV0",
      scope: "write" as ApiKeyScope,
      owner: "test_user",
      rateLimitTier: 200,
      active: true,
      createdAt: Date.now(),
      expiresAt: 0,
    };
    registerApiKey(writeApiKey);

    // Register an admin API key
    const adminApiKey: ApiKey = {
      keyId: "admin_key_789",
      keyHash: "YWRtaW5fc2VjcmV0",
      scope: "admin" as ApiKeyScope,
      owner: "admin",
      rateLimitTier: 1000,
      active: true,
      createdAt: Date.now(),
      expiresAt: 0,
    };
    registerApiKey(adminApiKey);
  });

  describe("apiKeyAuth", () => {
    it("should authenticate with valid API key in Authorization header", async () => {
      app.use("*", apiKeyAuth());
      app.get("/test", (c) => {
        const auth = getAuthContext(c);
        return c.json({ authenticated: !!auth, keyId: auth?.keyId });
      });

      const res = await app.request("/test", {
        headers: {
          Authorization: "Bearer test_key_123:test_secret",
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.authenticated).toBe(true);
      expect(json.keyId).toBe("test_key_123");
    });

    it("should authenticate with valid API key in X-API-Key header", async () => {
      app.use("*", apiKeyAuth());
      app.get("/test", (c) => {
        const auth = getAuthContext(c);
        return c.json({ authenticated: !!auth });
      });

      const res = await app.request("/test", {
        headers: {
          "X-API-Key": "test_key_123:test_secret",
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.authenticated).toBe(true);
    });

    it("should reject invalid API key", async () => {
      app.use("*", apiKeyAuth());
      app.get("/test", (c) => c.json({ ok: true }));

      const res = await app.request("/test", {
        headers: {
          Authorization: "Bearer invalid_key:wrong_secret",
        },
      });

      expect(res.status).toBe(401);
    });

    it("should reject request without API key", async () => {
      app.use("*", apiKeyAuth());
      app.get("/test", (c) => c.json({ ok: true }));

      const res = await app.request("/test");

      expect(res.status).toBe(401);
    });

    it("should enforce required scope", async () => {
      app.use("*", apiKeyAuth({ requiredScope: "write" }));
      app.get("/test", (c) => c.json({ ok: true }));

      // Read-only key should not have access to write scope
      const res = await app.request("/test", {
        headers: {
          Authorization: "Bearer test_key_123:test_secret",
        },
      });

      expect(res.status).toBe(403);
    });

    it("should allow write scope for write-required endpoint", async () => {
      app.use("*", apiKeyAuth({ requiredScope: "write" }));
      app.get("/test", (c) => {
        const auth = getAuthContext(c);
        return c.json({ scope: auth?.scope });
      });

      const res = await app.request("/test", {
        headers: {
          Authorization: "Bearer write_key_456:write_secret",
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.scope).toBe("write");
    });

    it("should reject expired API key", async () => {
      const expiredKey: ApiKey = {
        keyId: "expired_key",
        keyHash: "ZXhwaXJlZF9zZWNyZXQ=",
        scope: "read",
        active: true,
        createdAt: Date.now() - 100_000,
        expiresAt: Date.now() - 1000, // Expired
        rateLimitTier: 100,
      };
      registerApiKey(expiredKey);

      app.use("*", apiKeyAuth());
      app.get("/test", (c) => c.json({ ok: true }));

      const res = await app.request("/test", {
        headers: {
          Authorization: "Bearer expired_key:expired_secret",
        },
      });

      expect(res.status).toBe(401);
    });

    it("should reject inactive API key", async () => {
      const inactiveKey: ApiKey = {
        keyId: "inactive_key",
        keyHash: "aW5hY3RpdmVfc2VjcmV0",
        scope: "read",
        active: false,
        createdAt: Date.now(),
        expiresAt: 0,
        rateLimitTier: 100,
      };
      registerApiKey(inactiveKey);

      app.use("*", apiKeyAuth());
      app.get("/test", (c) => c.json({ ok: true }));

      const res = await app.request("/test", {
        headers: {
          Authorization: "Bearer inactive_key:inactive_secret",
        },
      });

      expect(res.status).toBe(401);
    });
  });

  describe("session management", () => {
    it("should create and validate session", async () => {
      const sessionId = createSession("test_key_123", "127.0.0.1", "test-agent");

      expect(sessionId).toBeTruthy();
      expect(typeof sessionId).toBe("string");

      app.use("*", apiKeyAuth({ allowSessions: true }));
      app.get("/test", (c) => {
        const auth = getAuthContext(c);
        return c.json({ authenticated: !!auth, hasSession: !!auth?.sessionId });
      });

      const res = await app.request("/test", {
        headers: {
          Authorization: `Bearer ${sessionId}`,
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.authenticated).toBe(true);
      expect(json.hasSession).toBe(true);
    });

    it("should invalidate session", () => {
      const sessionId = createSession("test_key_123", "127.0.0.1");

      const result = invalidateSession(sessionId);
      expect(result).toBe(true);

      // Second invalidation should return false
      const result2 = invalidateSession(sessionId);
      expect(result2).toBe(false);
    });

    it("should invalidate all sessions for a key", () => {
      // Create multiple sessions for test_key_123
      const session1 = createSession("test_key_123", "127.0.0.1");
      const session2 = createSession("test_key_123", "127.0.0.2");
      // Create a session for a different key
      createSession("write_key_456", "127.0.0.3");

      // Count total sessions before invalidation
      const initialSessionCount = 3; // From this test

      const count = invalidateAllSessionsForKey("test_key_123");
      // Should invalidate all sessions for test_key_123 (3 including the one from the previous test)
      expect(count).toBeGreaterThanOrEqual(2);
    });
  });

  describe("optionalAuth", () => {
    it("should attach auth context when credentials provided", async () => {
      app.use("*", optionalAuth());
      app.get("/test", (c) => {
        const auth = getAuthContext(c);
        return c.json({ authenticated: !!auth, keyId: auth?.keyId });
      });

      const res = await app.request("/test", {
        headers: {
          Authorization: "Bearer test_key_123:test_secret",
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.authenticated).toBe(true);
      expect(json.keyId).toBe("test_key_123");
    });

    it("should proceed without auth when no credentials provided", async () => {
      app.use("*", optionalAuth());
      app.get("/test", (c) => {
        const auth = getAuthContext(c);
        return c.json({ authenticated: !!auth });
      });

      const res = await app.request("/test");

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.authenticated).toBe(false);
    });
  });

  describe("requireScope", () => {
    it("should require specific scope", async () => {
      app.use("*", apiKeyAuth({ requiredScope: "read" }));
      app.use("/admin/*", requireScope("admin"));
      app.get("/admin/test", (c) => c.json({ ok: true }));

      // Read key should not have admin access
      const res = await app.request("/admin/test", {
        headers: {
          Authorization: "Bearer test_key_123:test_secret",
        },
      });

      expect(res.status).toBe(403);
    });

    it("should allow admin scope for admin endpoint", async () => {
      app.use("*", apiKeyAuth({ requiredScope: "read" }));
      app.use("/admin/*", requireScope("admin"));
      app.get("/admin/test", (c) => c.json({ ok: true }));

      const res = await app.request("/admin/test", {
        headers: {
          Authorization: "Bearer admin_key_789:admin_secret",
        },
      });

      expect(res.status).toBe(200);
    });
  });

  describe("signedRequestAuth", () => {
    it("should require signature headers", async () => {
      app.use("*", signedRequestAuth());
      app.get("/test", (c) => c.json({ ok: true }));

      const res = await app.request("/test");

      expect(res.status).toBe(401);
    });

    it("should reject invalid timestamp format", async () => {
      app.use("*", signedRequestAuth());
      app.get("/test", (c) => c.json({ ok: true }));

      const res = await app.request("/test", {
        headers: {
          "X-Signature": "hmac_sha256:abc123",
          "X-API-Key-Id": "test_key_123",
          "X-Timestamp": "invalid",
        },
      });

      expect(res.status).toBe(400);
    });

    it("should reject invalid signature format", async () => {
      app.use("*", signedRequestAuth());
      app.get("/test", (c) => c.json({ ok: true }));

      const res = await app.request("/test", {
        headers: {
          "X-Signature": "invalid_signature",
          "X-API-Key-Id": "test_key_123",
          "X-Timestamp": Date.now().toString(),
        },
      });

      expect(res.status).toBe(401);
    });
  });

  describe("helper functions", () => {
    it("isAuthenticated should return true when authenticated", async () => {
      app.use("*", apiKeyAuth());
      app.get("/test", (c) => {
        return c.json({ authenticated: isAuthenticated(c) });
      });

      const res = await app.request("/test", {
        headers: {
          Authorization: "Bearer test_key_123:test_secret",
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.authenticated).toBe(true);
    });

    it("isAuthenticated should return false when not authenticated", async () => {
      app.get("/test", (c) => {
        return c.json({ authenticated: isAuthenticated(c) });
      });

      const res = await app.request("/test");

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.authenticated).toBe(false);
    });
  });
});
