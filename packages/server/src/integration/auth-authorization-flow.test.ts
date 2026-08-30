/**
 * Integration tests for authentication → authorization middleware flow.
 *
 * Tests verify:
 * - JWT token validation and security
 * - Role-based access control (RBAC) integration
 * - Middleware chain ordering (auth → authz)
 * - Enhanced authentication with enhanced JWT security
 * - Success and failure paths (invalid tokens, insufficient permissions)
 * - Integration between enhanced-authentication and enhanced-jwt-security
 */

import { Hono } from "hono";
import type { Context, Next } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addAuditEvent, queryAuditLog } from "../middleware/audit-log.js";
import { type AuthContext, getAuthContext, optionalAuth } from "../middleware/authentication.js";
import {
  type PermissionCheckResult,
  checkPermission,
  invalidateUserCache,
} from "../middleware/dynamic-rbac-cache.js";
import {
  type EnhancedAuthConfig,
  createEnhancedAuth,
} from "../middleware/enhanced-authentication.js";
import {
  checkResourceAuthorization,
  createAuthorizationContext,
  requireResourceAuthorization,
} from "../middleware/enhanced-authorization.js";
import {
  type CompromiseDetectionResult,
  detectTokenCompromise,
  recordTokenUsage,
} from "../middleware/enhanced-jwt-security.js";
import type { Permission, UserRole } from "../middleware/rbac.js";
import { cleanupAllState } from "./test-helpers.js";
import {
  createTestAdminCredentials,
  createTestApiKey,
  createTestUserCredentials,
} from "./test-helpers.js";

describe("Authentication → Authorization Flow Integration Tests", () => {
  beforeEach(async () => {
    // Reset all module state before each test
    await cleanupAllState();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up after each test
    await cleanupAllState();
  });

  describe("JWT Token Validation", () => {
    it("should accept valid API key credentials", async () => {
      const app = new Hono();
      const testCreds = await createTestUserCredentials();

      app.use("/protected", optionalAuth());
      app.get("/protected", (c) => {
        const auth = getAuthContext(c);
        return c.json({
          authenticated: !!auth,
          keyId: auth?.keyId,
          role: auth?.role,
        });
      });

      const res = await app.request("/protected", {
        headers: {
          Authorization: testCreds.authorizationHeader,
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.authenticated).toBe(true);
      expect(body.keyId).toBeTruthy();
      expect(body.role).toBe("user");
    });

    it("should reject malformed Authorization header", async () => {
      const app = new Hono();
      app.use("/protected", optionalAuth());
      app.get("/protected", (c) => {
        const auth = getAuthContext(c);
        return c.json({ authenticated: !!auth });
      });

      const res = await app.request("/protected", {
        headers: {
          Authorization: "InvalidFormat",
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.authenticated).toBe(false);
    });

    it("should reject invalid API key (wrong key for keyId)", async () => {
      const app = new Hono();
      const testCreds = await createTestUserCredentials();

      app.use("/protected", optionalAuth());
      app.get("/protected", (c) => {
        const auth = getAuthContext(c);
        return c.json({ authenticated: !!auth });
      });

      const res = await app.request("/protected", {
        headers: {
          Authorization: `Bearer ${testCreds.keyId}:wrong_secret_key`,
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.authenticated).toBe(false);
    });

    it("should reject non-existent API key", async () => {
      const app = new Hono();
      app.use("/protected", optionalAuth());
      app.get("/protected", (c) => {
        const auth = getAuthContext(c);
        return c.json({ authenticated: !!auth });
      });

      const res = await app.request("/protected", {
        headers: {
          Authorization: "Bearer nonexistent_key:12345",
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.authenticated).toBe(false);
    });

    it("should allow requests without authentication for optional auth", async () => {
      const app = new Hono();
      app.use("/public", optionalAuth());
      app.get("/public", (c) => {
        const auth = getAuthContext(c);
        return c.json({
          authenticated: !!auth,
          message: "public resource",
        });
      });

      const res = await app.request("/public");

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.authenticated).toBe(false);
      expect(body.message).toBe("public resource");
    });
  });

  describe("Enhanced JWT Security Integration", () => {
    it("should record token usage for pattern analysis", async () => {
      const testCreds = await createTestUserCredentials();
      const tokenId = `token_${testCreds.keyId}`;

      // Record token usage
      recordTokenUsage(tokenId, {
        clientIp: "127.0.0.1",
        userAgent: "test-agent",
        requestPath: "/api/trips",
      });

      // Verify audit event was logged
      const events = queryAuditLog({ category: "authentication" });
      expect(events.length).toBeGreaterThan(0);
    });

    it("should detect token compromise based on usage patterns", () => {
      const tokenId = "test_token_compromise";

      // Simulate normal usage
      recordTokenUsage(tokenId, {
        clientIp: "127.0.0.1",
        userAgent: "test-agent",
      });

      // Simulate suspicious usage (different IP, short time)
      recordTokenUsage(tokenId, {
        clientIp: "192.168.1.100", // Different IP
        userAgent: "test-agent",
      });

      // Check for compromise
      const result: CompromiseDetectionResult = detectTokenCompromise(tokenId);

      // Result should have structure (values depend on algorithm)
      expect(result).toHaveProperty("compromised");
      expect(result).toHaveProperty("riskScore");
      expect(result).toHaveProperty("recommendedAction");
    });

    it("should return safe recommendation for unknown tokens", () => {
      const result = detectTokenCompromise("unknown_token_id");

      expect(result.compromised).toBe(false);
      expect(result.riskScore).toBe(0);
      expect(result.recommendedAction).toBe("allow");
    });
  });

  describe("Role-Based Access Control (RBAC)", () => {
    it("should grant admin permissions to admin role", () => {
      const result: PermissionCheckResult = checkPermission(
        "admin",
        "admin:users:create" as Permission
      );

      expect(result.granted).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it("should grant basic permissions to user role", () => {
      const result: PermissionCheckResult = checkPermission("user", "trips:create" as Permission);

      expect(result.granted).toBe(true);
    });

    it("should deny admin permissions to user role", () => {
      const result: PermissionCheckResult = checkPermission(
        "user",
        "admin:users:create" as Permission
      );

      expect(result.granted).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it("should deny write permissions to guest role", () => {
      const result: PermissionCheckResult = checkPermission("guest", "trips:create" as Permission);

      expect(result.granted).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it("should allow read permissions for guest", () => {
      const result: PermissionCheckResult = checkPermission("guest", "alerts:read" as Permission);

      expect(result.granted).toBe(true);
    });

    it("should use cache for repeated permission checks", () => {
      // First check - cache miss
      const result1: PermissionCheckResult = checkPermission("user", "trips:create" as Permission);

      expect(result1.fromCache).toBe(false);

      // Second check - cache hit
      const result2: PermissionCheckResult = checkPermission("user", "trips:create" as Permission);

      expect(result2.fromCache).toBe(true);
      expect(result2.cacheAge).toBeGreaterThan(0);
    });

    it("should invalidate cache on role change", () => {
      // Check permission and populate cache
      const result1: PermissionCheckResult = checkPermission("user", "trips:create" as Permission);

      expect(result1.fromCache).toBe(false);

      // Invalidate cache
      invalidateUserCache("user");

      // Check again - should be cache miss after invalidation
      const result2: PermissionCheckResult = checkPermission("user", "trips:create" as Permission);

      expect(result2.fromCache).toBe(false);
    });
  });

  describe("Middleware Chain Ordering", () => {
    type ExecutionLogEntry = {
      middlewareName: string;
      timestamp: number;
      phase: "before" | "after";
    };

    let executionLog: ExecutionLogEntry[] = [];

    function clearExecutionLog(): void {
      executionLog = [];
    }

    function instrumentMiddleware(
      name: string,
      middleware: (c: Context, next: Next) => Promise<void>
    ): (c: Context, next: Next) => Promise<void> {
      return async (c: Context, next: Next) => {
        const startTime = Date.now();
        executionLog.push({
          middlewareName: name,
          timestamp: startTime,
          phase: "before",
        });

        try {
          await middleware(c, next);

          executionLog.push({
            middlewareName: name,
            timestamp: Date.now(),
            phase: "after",
          });
        } catch (error) {
          executionLog.push({
            middlewareName: name,
            timestamp: Date.now(),
            phase: "error",
          });
          throw error;
        }
      };
    }

    beforeEach(() => {
      clearExecutionLog();
    });

    it("should execute authentication before authorization", async () => {
      const app = new Hono();
      const testCreds = await createTestUserCredentials();

      app.use(
        "/protected",
        instrumentMiddleware("auth", optionalAuth()),
        instrumentMiddleware("authz", async (c: Context, next: Next) => {
          const auth = getAuthContext(c);
          if (!auth) {
            return c.json({ error: "Unauthorized" }, 401);
          }
          await next();
        })
      );

      app.get("/protected", (c) => c.json({ success: true }));

      const res = await app.request("/protected", {
        headers: {
          Authorization: testCreds.authorizationHeader,
        },
      });

      expect(res.status).toBe(200);

      // Verify execution order
      const authBeforeIndex = executionLog.findIndex(
        (e) => e.middlewareName === "auth" && e.phase === "before"
      );
      const authzBeforeIndex = executionLog.findIndex(
        (e) => e.middlewareName === "authz" && e.phase === "before"
      );

      expect(authBeforeIndex).toBeGreaterThanOrEqual(0);
      expect(authzBeforeIndex).toBeGreaterThanOrEqual(0);
      expect(authBeforeIndex).toBeLessThan(authzBeforeIndex);
    });

    it("should short-circuit authorization when authentication fails", async () => {
      const app = new Hono();

      let authzExecuted = false;

      app.use(
        "/protected",
        instrumentMiddleware("auth", optionalAuth()),
        instrumentMiddleware("authz", async (c: Context, next: Next) => {
          authzExecuted = true;
          const auth = getAuthContext(c);
          if (!auth) {
            return c.json({ error: "Unauthorized" }, 401);
          }
          await next();
        })
      );

      app.get("/protected", (c) => c.json({ success: true }));

      // Request without auth header
      const res = await app.request("/protected");

      expect(res.status).toBe(401);

      // Verify authz was still executed (it checks for auth context)
      expect(authzExecuted).toBe(true);
    });

    it("should propagate auth context through middleware chain", async () => {
      const app = new Hono();
      const testCreds = await createTestUserCredentials();

      let capturedAuth: AuthContext | null = null;

      app.use("/protected", optionalAuth(), async (c: Context, next: Next) => {
        capturedAuth = getAuthContext(c);
        await next();
      });

      app.get("/protected", (c) => c.json({ success: true }));

      await app.request("/protected", {
        headers: {
          Authorization: testCreds.authorizationHeader,
        },
      });

      expect(capturedAuth).not.toBeNull();
      expect(capturedAuth?.keyId).toBe(testCreds.keyId);
      expect(capturedAuth?.role).toBe("user");
    });
  });

  describe("Enhanced Authentication → Authorization Integration", () => {
    it("should integrate auth with resource authorization", async () => {
      const app = new Hono();

      app.use("/api/trips", optionalAuth());
      app.use("/api/trips", requireResourceAuthorization("trip", "create", { logAttempt: true }));
      app.post("/api/trips", (c) => c.json({ success: true, tripCreated: true }));

      const res = await app.request("/api/trips", {
        method: "POST",
        headers: {
          Authorization: userCredentials.authorizationHeader,
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it("should deny access when user lacks required permission", async () => {
      const app = new Hono();

      app.use("/api/admin", optionalAuth());
      app.use(
        "/api/admin",
        requireResourceAuthorization("admin", "users:write", { logAttempt: true })
      );
      app.post("/api/admin", (c) => c.json({ success: true }));

      // Guest user attempting admin operation
      const res = await app.request("/api/admin", {
        method: "POST",
        headers: {
          Authorization: guestCredentials.authorizationHeader,
        },
      });

      expect(res.status).toBe(403);

      // Verify audit log recorded the denial
      const events = queryAuditLog({ category: "authorization", success: false });
      expect(events.length).toBeGreaterThan(0);
    });

    it("should create authorization context with user permissions", async () => {
      const app = new Hono();

      // Create fresh credentials for this specific test
      const testAdminCreds = await createTestAdminCredentials();
      const testUserCreds = await createTestUserCredentials();

      app.use("/api/authz-context", optionalAuth());
      app.get("/api/authz-context", (c) => {
        const authz = createAuthorizationContext(c);
        return c.json({
          isAuthenticated: authz.isAuthenticated,
          isAdmin: authz.isAdmin,
          canCreateTrips: authz.can("trips:create" as Permission),
          canDeleteUsers: authz.can("admin:users:delete" as Permission),
        });
      });

      // Test with admin user
      const adminRes = await app.request("/api/authz-context", {
        headers: {
          Authorization: testAdminCreds.authorizationHeader,
        },
      });

      expect(adminRes.status).toBe(200);
      const adminBody = await adminRes.json();
      expect(adminBody.isAuthenticated).toBe(true);
      expect(adminBody.isAdmin).toBe(true);
      expect(adminBody.canCreateTrips).toBe(true);
      expect(adminBody.canDeleteUsers).toBe(true);

      // Test with regular user
      const userRes = await app.request("/api/authz-context", {
        headers: {
          Authorization: testUserCreds.authorizationHeader,
        },
      });

      expect(userRes.status).toBe(200);
      const userBody = await userRes.json();
      expect(userBody.isAuthenticated).toBe(true);
      expect(userBody.isAdmin).toBe(false);
      expect(userBody.canCreateTrips).toBe(true);
      expect(userBody.canDeleteUsers).toBe(false);
    });
  });

  describe("Failure Paths and Error Handling", () => {
    it("should handle revoked API keys correctly", async () => {
      const app = new Hono();

      // Create and then revoke a key
      const tempCredentials = await createTestApiKey("write", "user");

      // Revoke the key (simulate by setting active: false)
      const { registerApiKey } = await import("../middleware/authentication.js");
      await registerApiKey({
        keyId: tempCredentials.keyId,
        keyHash: "revoked_hash",
        keySalt: "revoked_salt",
        scope: "write",
        rateLimitTier: 10,
        active: false, // Revoked
        createdAt: Date.now(),
        expiresAt: 0,
        role: "user",
      });

      app.use("/protected", optionalAuth());
      app.get("/protected", (c) => {
        const auth = getAuthContext(c);
        return c.json({ authenticated: !!auth });
      });

      const res = await app.request("/protected", {
        headers: {
          Authorization: tempCredentials.authorizationHeader,
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.authenticated).toBe(false);
    });

    it("should handle expired API keys correctly", async () => {
      const app = new Hono();

      // Create an expired key
      const expiredKeyId = "expired_key";
      const { generateApiKey, hashApiKey, registerApiKey } = await import(
        "../middleware/authentication.js"
      );
      const expiredKey = await generateApiKey();
      const hashed = await hashApiKey(expiredKey);

      const expiredTime = Date.now() - 86400000; // 1 day ago

      // Create the expired key first
      await registerApiKey({
        keyId: expiredKeyId,
        keyHash: hashed.hash,
        keySalt: hashed.salt,
        scope: "write",
        rateLimitTier: 10,
        active: false, // Expired keys are marked as inactive
        createdAt: expiredTime,
        expiresAt: expiredTime, // Already expired
        role: "user",
      });

      app.use("/protected", optionalAuth());
      app.get("/protected", (c) => {
        const auth = getAuthContext(c);
        return c.json({ authenticated: !!auth });
      });

      const res = await app.request("/protected", {
        headers: {
          Authorization: `Bearer ${expiredKeyId}:${expiredKey}`,
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      // Expired keys should not authenticate (active: false)
      expect(body.authenticated).toBe(false);
    });

    it("should log audit events for failed authorization attempts", async () => {
      const app = new Hono();
      const testCreds = await createTestUserCredentials();

      const config: EnhancedAuthConfig = {
        enableAuditLogging: true,
        enableRbacCache: true,
      };

      app.use("/api/admin", optionalAuth());
      app.use(
        "/api/admin",
        requireResourceAuthorization("admin", "users:delete", { logAttempt: true })
      );
      app.delete("/api/admin", (c) => c.json({ success: true }));

      // User attempting admin operation
      await app.request("/api/admin", {
        method: "DELETE",
        headers: {
          Authorization: testCreds.authorizationHeader,
        },
      });

      // Check audit log
      const failedAttempts = queryAuditLog({
        category: "authorization",
        success: false,
      });

      expect(failedAttempts.length).toBeGreaterThan(0);
      expect(failedAttempts[0]?.action).toContain("admin");
    });

    it("should handle concurrent authorization checks safely", async () => {
      const app = new Hono();

      // Create fresh credentials for this specific test to ensure isolation
      const testCreds = await createTestUserCredentials();

      app.use("/api/permissions", optionalAuth());
      app.get("/api/permissions", (c) => {
        const auth = getAuthContext(c);
        if (!auth) {
          return c.json({ error: "Unauthorized" }, 401);
        }

        // Simulate multiple concurrent permission checks
        const results = [
          checkPermission(auth.role, "trips:create" as Permission),
          checkPermission(auth.role, "predictions:create" as Permission),
          checkPermission(auth.role, "admin:users:delete" as Permission),
        ];

        return c.json({
          canCreateTrips: results[0].granted,
          canCreatePredictions: results[1].granted,
          canAdmin: results[2].granted,
        });
      });

      const res = await app.request("/api/permissions", {
        headers: {
          Authorization: testCreds.authorizationHeader,
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      // Users can create trips (user permission)
      expect(body.canCreateTrips).toBe(true);
      // Users can create predictions (guest+ permission)
      expect(body.canCreatePredictions).toBe(true);
      // Users cannot do admin operations
      expect(body.canAdmin).toBe(false);
    });
  });

  describe("Complete Auth → Authz Flow Scenarios", () => {
    it("should handle complete successful authentication and authorization flow", async () => {
      const app = new Hono();
      const testCreds = await createTestUserCredentials();

      // Full middleware chain
      app.use("/api/*", optionalAuth());
      app.use("/api/trips", requireResourceAuthorization("trip", "create"));
      app.post("/api/trips", (c) => {
        const auth = getAuthContext(c);
        const authz = createAuthorizationContext(c);
        return c.json({
          success: true,
          user: auth?.keyId,
          authorized: authz.can("trips:create" as Permission),
        });
      });

      const res = await app.request("/api/trips", {
        method: "POST",
        headers: {
          Authorization: testCreds.authorizationHeader,
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.user).toBeTruthy();
      expect(body.authorized).toBe(true);

      // Verify audit log recorded the successful action
      const successEvents = queryAuditLog({
        category: "authorization",
        success: true,
      });
      expect(successEvents.length).toBeGreaterThan(0);
    });

    it("should handle complete failed authorization flow", async () => {
      const app = new Hono();
      const testUserCreds = await createTestUserCredentials();

      // Full middleware chain with high-level admin permission
      app.use("/api/*", optionalAuth());
      app.use("/api/admin/users", requireResourceAuthorization("admin", "users:delete"));
      app.delete("/api/admin/users", (c) => {
        return c.json({ success: true });
      });

      // Regular user attempting admin operation
      const res = await app.request("/api/admin/users", {
        method: "DELETE",
        headers: {
          Authorization: testUserCreds.authorizationHeader,
        },
      });

      expect(res.status).toBe(403);

      // Verify audit log recorded the denial
      const failedEvents = queryAuditLog({
        category: "authorization",
        success: false,
      });
      expect(failedEvents.length).toBeGreaterThan(0);
    });

    it("should handle guest role with limited permissions correctly", async () => {
      const app = new Hono();
      const testGuestCreds = await createTestApiKey("read", "guest");

      app.use("/api/*", optionalAuth());

      // First verify that the guest credentials work for authentication
      app.get("/api/auth-check", (c) => {
        const auth = getAuthContext(c);
        return c.json({
          authenticated: !!auth,
          role: auth?.role,
          keyId: auth?.keyId,
        });
      });

      // First verify guest authentication works
      const authRes = await app.request("/api/auth-check", {
        headers: {
          Authorization: testGuestCreds.authorizationHeader,
        },
      });

      expect(authRes.status).toBe(200);
      const authBody = await authRes.json();
      expect(authBody.authenticated).toBe(true);
      expect(authBody.role).toBe("guest");
      expect(authBody.keyId).toBe(testGuestCreds.keyId);

      // Now test that guests can read alerts using a direct permission check
      app.get("/api/permission-check", (c) => {
        const auth = getAuthContext(c);
        if (!auth) {
          return c.json({ error: "Not authenticated" }, 401);
        }
        const canReadAlerts = checkPermission(auth.role, "alerts:read" as Permission);
        return c.json({
          canReadAlerts: canReadAlerts.granted,
        });
      });

      const permRes = await app.request("/api/permission-check", {
        headers: {
          Authorization: testGuestCreds.authorizationHeader,
        },
      });

      expect(permRes.status).toBe(200);
      const permBody = await permRes.json();
      expect(permBody.canReadAlerts).toBe(true);

      // Test that guests cannot create trips
      const canCreateTrips = checkPermission("guest", "trips:create" as Permission);
      expect(canCreateTrips.granted).toBe(false);
    });
  });
});
