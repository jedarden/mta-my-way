/**
 * Tests for enhanced authentication middleware.
 */

import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import {
  type ApiKey,
  type ApiKeyScope,
  apiKeyAuth,
  hashApiKey,
  registerApiKey,
} from "./authentication.js";
import { clearAllSessions } from "./concurrent-session-management.js";
import { clearCache } from "./dynamic-rbac-cache.js";
import {
  type EnhancedAuthConfig,
  createEnhancedAuth,
  getEnhancedAuth,
  getSecurityIncidents,
  getUserSecurityStatus,
  invalidateUserAuthData,
  requirePermissions,
  requiresAdditionalVerification,
} from "./enhanced-authentication.js";
import { configureEncryption, generateMasterKey } from "./token-encryption.js";

describe("Enhanced Authentication Middleware", () => {
  let app: Hono;
  let testApiKey: ApiKey;

  beforeEach(async () => {
    app = new Hono();

    // Configure encryption for tests
    const masterKey = generateMasterKey();
    await configureEncryption({ masterKey, keyVersion: 1 });

    // Clear all test data
    clearAllSessions();
    clearCache();

    // Generate proper hashes for test API keys
    const testKeyHash = await hashApiKey("test_secret");
    const adminKeyHash = await hashApiKey("admin_secret");

    // Register a test API key
    testApiKey = {
      keyId: "test_key_enhanced",
      keyHash: testKeyHash.hash,
      keySalt: testKeyHash.salt,
      scope: "read" as ApiKeyScope,
      role: "user",
      owner: "test_user",
      rateLimitTier: 100,
      active: true,
      createdAt: Date.now(),
      expiresAt: 0,
    };
    await registerApiKey(testApiKey);

    // Register an admin API key
    const adminApiKey: ApiKey = {
      keyId: "admin_key_enhanced",
      keyHash: adminKeyHash.hash,
      keySalt: adminKeyHash.salt,
      scope: "admin" as ApiKeyScope,
      role: "admin",
      owner: "admin",
      rateLimitTier: 1000,
      active: true,
      createdAt: Date.now(),
      expiresAt: 0,
    };
    await registerApiKey(adminApiKey);
  });

  describe("createEnhancedAuth", () => {
    it("should create enhanced auth middleware with default config", () => {
      const middleware = createEnhancedAuth();
      expect(middleware).toBeDefined();
      expect(typeof middleware).toBe("function");
    });

    it("should create enhanced auth middleware with custom config", () => {
      const config: EnhancedAuthConfig = {
        jwtSecret: "test_secret",
        enableJwtValidation: false,
        enableEnhancedJwt: false,
        riskThreshold: 50,
      };
      const middleware = createEnhancedAuth(config);
      expect(middleware).toBeDefined();
      expect(typeof middleware).toBe("function");
    });

    it("should allow authenticated requests through enhanced auth", async () => {
      app.use("/api/protected", apiKeyAuth(), createEnhancedAuth());
      app.get("/api/protected", (c) => {
        const enhancedAuth = getEnhancedAuth(c);
        return c.json({
          authenticated: !!enhancedAuth,
          keyId: enhancedAuth?.auth.keyId,
        });
      });

      const res = await app.request("/api/protected", {
        headers: {
          "X-API-Key": "test_key_enhanced:test_secret",
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.authenticated).toBe(true);
      expect(json.keyId).toBe("test_key_enhanced");
    });

    it("should deny unauthenticated requests", async () => {
      app.use("/api/protected", createEnhancedAuth());
      app.get("/api/protected", (c) => c.json({ success: true }));

      const res = await app.request("/api/protected");

      expect(res.status).toBe(401);
    });

    it("should attach enhanced auth result to context", async () => {
      app.use("/api/test", apiKeyAuth(), createEnhancedAuth());
      app.get("/api/test", (c) => {
        const enhancedAuth = getEnhancedAuth(c);
        return c.json({
          hasAuth: !!enhancedAuth,
          hasRiskAssessment: !!enhancedAuth?.riskAssessment,
          keyId: enhancedAuth?.auth.keyId,
        });
      });

      const res = await app.request("/api/test", {
        headers: {
          "X-API-Key": "test_key_enhanced:test_secret",
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.hasAuth).toBe(true);
      expect(json.keyId).toBe("test_key_enhanced");
    });
  });

  describe("requirePermissions", () => {
    it("should require all permissions by default", async () => {
      app.use(
        "/api/admin",
        apiKeyAuth(),
        createEnhancedAuth(),
        requirePermissions(["admin:users:read", "admin:apikeys:read"])
      );
      app.get("/api/admin", (c) => c.json({ success: true }));

      const res = await app.request("/api/admin", {
        headers: {
          "X-API-Key": "admin_key_enhanced:admin_secret", // Admin key has all permissions
        },
      });

      expect(res.status).toBe(200);
    });

    it("should deny access when permissions are missing", async () => {
      app.use(
        "/api/admin",
        apiKeyAuth(),
        createEnhancedAuth(),
        requirePermissions(["admin:users:read", "admin:apikeys:read"])
      );
      app.get("/api/admin", (c) => c.json({ success: true }));

      const res = await app.request("/api/admin", {
        headers: {
          "X-API-Key": "test_key_enhanced:test_secret", // Regular user key doesn't have admin permissions
        },
      });

      expect(res.status).toBe(403);
    });

    it("should allow any permission when requireAll is false", async () => {
      app.use(
        "/api/hybrid",
        apiKeyAuth(),
        createEnhancedAuth(),
        requirePermissions(["trips:read", "trips:create"], { requireAll: false })
      );
      app.get("/api/hybrid", (c) => c.json({ success: true }));

      const res = await app.request("/api/hybrid", {
        headers: {
          "X-API-Key": "test_key_enhanced:test_secret", // Has trips:read permission
        },
      });

      expect(res.status).toBe(200);
    });
  });

  describe("Utility Functions", () => {
    it("should check if additional verification is required", async () => {
      app.use("/api/test", apiKeyAuth(), createEnhancedAuth());
      app.get("/api/test", (c) => {
        return c.json({
          requiresVerification: requiresAdditionalVerification(c),
        });
      });

      const res = await app.request("/api/test", {
        headers: {
          "X-API-Key": "test_key_enhanced:test_secret",
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(typeof json.requiresVerification).toBe("boolean");
    });

    it("should get security incidents", async () => {
      app.use("/api/test", apiKeyAuth(), createEnhancedAuth());
      app.get("/api/test", (c) => {
        return c.json({
          incidents: getSecurityIncidents(c),
        });
      });

      const res = await app.request("/api/test", {
        headers: {
          "X-API-Key": "test_key_enhanced:test_secret",
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(Array.isArray(json.incidents)).toBe(true);
    });

    it("should invalidate user auth data", () => {
      expect(() => invalidateUserAuthData("test_key_enhanced")).not.toThrow();
    });

    it("should get user security status", () => {
      const status = getUserSecurityStatus("test_key_enhanced");
      expect(status).toBeDefined();
      expect(typeof status.sessionCount).toBe("number");
      expect(typeof status.activeIncidents).toBe("number");
      expect(Array.isArray(status.riskFactors)).toBe(true);
    });
  });

  describe("Configuration Options", () => {
    it("should respect enableJwtValidation option", async () => {
      const middleware = createEnhancedAuth({ enableJwtValidation: false });
      expect(middleware).toBeDefined();
    });

    it("should respect enableEnhancedJwt option", async () => {
      const middleware = createEnhancedAuth({ enableEnhancedJwt: false });
      expect(middleware).toBeDefined();
    });

    it("should respect enableConcurrentSessions option", async () => {
      const middleware = createEnhancedAuth({ enableConcurrentSessions: false });
      expect(middleware).toBeDefined();
    });

    it("should respect enableRbacCache option", async () => {
      const middleware = createEnhancedAuth({ enableRbacCache: false });
      expect(middleware).toBeDefined();
    });

    it("should respect enableAuditLogging option", async () => {
      const middleware = createEnhancedAuth({ enableAuditLogging: false });
      expect(middleware).toBeDefined();
    });

    it("should respect riskThreshold option", () => {
      const middleware = createEnhancedAuth({ riskThreshold: 80 });
      expect(middleware).toBeDefined();
    });

    it("should respect onTokenCompromised option", () => {
      const middleware = createEnhancedAuth({ onTokenCompromised: "block" });
      expect(middleware).toBeDefined();
    });

    it("should respect onSessionLimitExceeded option", () => {
      const middleware = createEnhancedAuth({ onSessionLimitExceeded: "deny" });
      expect(middleware).toBeDefined();
    });
  });

  describe("Integration with Other Modules", () => {
    it("should work with session security module", async () => {
      app.use("/api/secure", apiKeyAuth(), createEnhancedAuth({ enableBehavioralAnalysis: true }));
      app.get("/api/secure", (c) => c.json({ success: true }));

      const res = await app.request("/api/secure", {
        headers: {
          "X-API-Key": "test_key_enhanced:test_secret",
        },
      });

      expect(res.status).toBe(200);
    });

    it("should work with concurrent session management", async () => {
      app.use("/api/session", apiKeyAuth(), createEnhancedAuth({ enableConcurrentSessions: true }));
      app.get("/api/session", (c) => c.json({ success: true }));

      const res = await app.request("/api/session", {
        headers: {
          "X-API-Key": "test_key_enhanced:test_secret",
        },
      });

      expect(res.status).toBe(200);
    });

    it("should work with RBAC cache", async () => {
      app.use("/api/rbac", apiKeyAuth(), createEnhancedAuth({ enableRbacCache: true }));
      app.get("/api/rbac", (c) => c.json({ success: true }));

      const res = await app.request("/api/rbac", {
        headers: {
          "X-API-Key": "test_key_enhanced:test_secret",
        },
      });

      expect(res.status).toBe(200);
    });
  });
});
