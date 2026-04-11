/**
 * Integration tests for enhanced authorization features.
 *
 * Tests:
 * - API key management with authorization
 * - Audit log system
 * - Admin operations
 * - Enhanced authorization utilities
 */

import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getUserSummaries, revokeAllUserApiKeys } from "../middleware/admin-operations.js";
import {
  type ApiKeyCreateRequest,
  canAssignRole,
  canGrantPermissions,
  getSafeApiKeyResponse,
  registerApiKeyWithMetadata,
  validateApiKeyCreateRequest,
} from "../middleware/api-key-management.js";
import {
  addAuditEvent,
  applyAuditLogRetention,
  clearAuditLog,
  exportAuditLogAsCsv,
  exportAuditLogAsJson,
  getAuditLogForResource,
  getAuditLogStats,
  getFailedAuthzAttempts,
  queryAuditLog,
} from "../middleware/audit-log.js";
import {
  generateApiKey,
  getApiKeyById,
  hashApiKey,
  registerApiKey,
} from "../middleware/authentication.js";
import { optionalAuth } from "../middleware/authentication.js";
import {
  checkResourceAuthorization,
  createAuthorizationContext,
  filterAuthorizedResources,
  getResourceType,
  registerResourceType,
  requireResourceAuthorization,
} from "../middleware/enhanced-authorization.js";
import { type Permission, type UserRole } from "../middleware/rbac.js";

describe("Enhanced Authorization Integration Tests", () => {
  let testKeyId: string;
  let testApiKey: string;
  let adminKeyId: string;
  let adminApiKey: string;

  beforeEach(async () => {
    // Create test user API key
    testKeyId = "test_key_" + Math.random().toString(36).substring(7);
    testApiKey = await generateApiKey();
    const hashed = await hashApiKey(testApiKey);

    const testKeyData = {
      keyId: testKeyId,
      keyHash: hashed.hash,
      keySalt: hashed.salt,
      scope: "write",
      rateLimitTier: 10,
      active: true,
      createdAt: Date.now(),
      expiresAt: 0,
      role: "user",
    };

    await registerApiKey(testKeyData);
    registerApiKeyWithMetadata(testKeyData, "Test user key");

    // Create admin API key
    adminKeyId = "admin_key_" + Math.random().toString(36).substring(7);
    adminApiKey = await generateApiKey();
    const adminHashed = await hashApiKey(adminApiKey);

    const adminKeyData = {
      keyId: adminKeyId,
      keyHash: adminHashed.hash,
      keySalt: adminHashed.salt,
      scope: "admin",
      rateLimitTier: 100,
      active: true,
      createdAt: Date.now(),
      expiresAt: 0,
      role: "admin",
    };

    await registerApiKey(adminKeyData);
    registerApiKeyWithMetadata(adminKeyData, "Admin key");

    // Clear audit log between tests
    clearAuditLog();
  });

  afterEach(() => {
    // Clean up
    clearAuditLog();
  });

  describe("API Key Management", () => {
    describe("validateApiKeyCreateRequest", () => {
      it("should validate a valid request from admin", () => {
        const auth = { keyId: adminKeyId, role: "admin" as UserRole };
        const request: ApiKeyCreateRequest = {
          scope: "read",
          rateLimitTier: 5,
          role: "user",
        };

        const result = validateApiKeyCreateRequest(auth, request);
        expect(result.valid).toBe(true);
      });

      it("should reject admin scope from non-admin", () => {
        const auth = { keyId: testKeyId, role: "user" as UserRole };
        const request: ApiKeyCreateRequest = {
          scope: "admin",
        };

        const result = validateApiKeyCreateRequest(auth, request);
        expect(result.valid).toBe(false);
        expect(result.error).toContain("Only admins");
      });

      it("should reject invalid rate limit tier", () => {
        const auth = { keyId: adminKeyId, role: "admin" as UserRole };
        const request: ApiKeyCreateRequest = {
          scope: "read",
          rateLimitTier: 200,
        };

        const result = validateApiKeyCreateRequest(auth, request);
        expect(result.valid).toBe(false);
        expect(result.error).toContain("between 1 and 100");
      });

      it("should reject role assignment by non-admin", () => {
        const auth = { keyId: testKeyId, role: "user" as UserRole };
        const request: ApiKeyCreateRequest = {
          scope: "read",
          role: "admin",
        };

        const result = validateApiKeyCreateRequest(auth, request);
        expect(result.valid).toBe(false);
        expect(result.error).toContain("cannot assign role");
      });
    });

    describe("canAssignRole and canGrantPermissions", () => {
      it("should allow admin to assign any role", () => {
        expect(canAssignRole("admin", "admin")).toBe(true);
        expect(canAssignRole("admin", "user")).toBe(true);
        expect(canAssignRole("admin", "guest")).toBe(true);
      });

      it("should allow user to assign only guest role", () => {
        expect(canAssignRole("user", "guest")).toBe(true);
        expect(canAssignRole("user", "user")).toBe(false);
        expect(canAssignRole("user", "admin")).toBe(false);
      });

      it("should not allow guest to assign roles", () => {
        expect(canAssignRole("guest", "guest")).toBe(false);
        expect(canAssignRole("guest", "user")).toBe(false);
      });

      it("should allow admin to grant any permissions", () => {
        expect(canGrantPermissions("admin", ["admin:users:read" as Permission])).toBe(true);
      });

      it("should not allow non-admin to grant admin permissions", () => {
        expect(canGrantPermissions("user", ["admin:users:read" as Permission])).toBe(false);
      });
    });

    describe("getSafeApiKeyResponse", () => {
      it("should return API key without secret", () => {
        const response = getSafeApiKeyResponse(testKeyId);

        expect(response).not.toBeNull();
        expect(response?.keyId).toBe(testKeyId);
        expect(response?.scope).toBe("write");
        expect(response).not.toHaveProperty("apiKey");
      });

      it("should return null for non-existent key", () => {
        const response = getSafeApiKeyResponse("nonexistent");
        expect(response).toBeNull();
      });
    });
  });

  describe("Audit Log System", () => {
    it("should add and retrieve audit events", () => {
      const eventId = addAuditEvent({
        category: "authentication",
        severity: "info",
        action: "login",
        success: true,
        performedBy: testKeyId,
        role: "user",
      });

      expect(eventId).toBeDefined();
      expect(eventId).toMatch(/^audit_\d+_\d+$/);

      const events = queryAuditLog({ performedBy: testKeyId });
      expect(events).toHaveLength(1);
      expect(events[0]?.action).toBe("login");
    });

    it("should filter audit events by category", () => {
      addAuditEvent({
        category: "authentication",
        severity: "info",
        action: "login",
        success: true,
      });

      addAuditEvent({
        category: "authorization",
        severity: "warning",
        action: "access_denied",
        success: false,
      });

      const authEvents = queryAuditLog({ category: "authentication" });
      expect(authEvents).toHaveLength(1);
      expect(authEvents[0]?.category).toBe("authentication");
    });

    it("should filter audit events by success status", () => {
      addAuditEvent({
        category: "authorization",
        severity: "info",
        action: "access_granted",
        success: true,
      });

      addAuditEvent({
        category: "authorization",
        severity: "warning",
        action: "access_denied",
        success: false,
      });

      const failedEvents = queryAuditLog({ success: false });
      expect(failedEvents).toHaveLength(1);
      expect(failedEvents[0]?.success).toBe(false);
    });

    it("should get audit log statistics", () => {
      addAuditEvent({
        category: "authentication",
        severity: "info",
        action: "login",
        success: true,
      });

      addAuditEvent({
        category: "authorization",
        severity: "warning",
        action: "access_denied",
        success: false,
      });

      const stats = getAuditLogStats();
      expect(stats.totalEvents).toBe(2);
      expect(stats.eventsByCategory.authentication).toBe(1);
      expect(stats.eventsByCategory.authorization).toBe(1);
    });

    it("should export audit log as JSON", () => {
      addAuditEvent({
        category: "authentication",
        severity: "info",
        action: "login",
        success: true,
      });

      const json = exportAuditLogAsJson();
      expect(() => JSON.parse(json)).not.toThrow();

      const parsed = JSON.parse(json);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(1);
    });

    it("should export audit log as CSV", () => {
      addAuditEvent({
        category: "authentication",
        severity: "info",
        action: "login",
        success: true,
      });

      const csv = exportAuditLogAsCsv();
      expect(csv).toContain("id,timestamp,category,severity,action");
      expect(csv).toContain("authentication,info,login");
    });

    it("should get audit log for a specific resource", () => {
      addAuditEvent({
        category: "authorization",
        severity: "info",
        action: "trips:create",
        resourceType: "trip",
        resourceId: "trip-123",
        success: true,
      });

      const events = getAuditLogForResource("trip", "trip-123");
      expect(events).toHaveLength(1);
      expect(events[0]?.resourceId).toBe("trip-123");
    });

    it("should get failed authorization attempts", () => {
      addAuditEvent({
        category: "authorization",
        severity: "warning",
        action: "trips:delete",
        success: false,
        performedBy: testKeyId,
      });

      const failed = getFailedAuthzAttempts(testKeyId);
      expect(failed).toHaveLength(1);
      expect(failed[0]?.success).toBe(false);
    });

    it("should apply retention policy", () => {
      // Add an old event
      const oldTimestamp = Date.now() - 48 * 60 * 60 * 1000; // 48 hours ago
      const eventId = addAuditEvent({
        category: "authentication",
        severity: "info",
        action: "old_login",
        success: true,
      });

      // Manually set the timestamp (hacky but works for test)
      const event = queryAuditLog({})[0];
      if (event) {
        Object.assign(event, { timestamp: oldTimestamp });
      }

      // Apply 24h retention
      const removed = applyAuditLogRetention(24 * 60 * 60 * 1000);
      expect(removed).toBeGreaterThan(0);
    });
  });

  describe("Admin Operations", () => {
    it("should get system status", () => {
      const status = getSystemStatus();

      expect(status).toBeDefined();
      expect(status.uptime).toBeGreaterThan(0);
      expect(status.memory).toBeDefined();
      expect(status.apiKeys).toBeDefined();
      expect(status.auditLog).toBeDefined();
    });

    it("should get user summaries", () => {
      const users = getUserSummaries();

      expect(Array.isArray(users)).toBe(true);
      expect(users.length).toBeGreaterThan(0);

      // Should have entries for our test keys
      const testUser = users.find((u) => u.keyId === testKeyId.split("_")[0]);
      expect(testUser).toBeDefined();
    });

    it("should revoke all user API keys", () => {
      const result = revokeAllUserApiKeys(testKeyId);

      expect(result.total).toBeGreaterThan(0);
      expect(result.succeeded.length).toBeGreaterThan(0);
      expect(result.failed).toEqual([]);

      // Verify keys are revoked
      const key = getApiKeyById(testKeyId);
      expect(key?.active).toBe(false);
    });
  });

  describe("Enhanced Authorization Utilities", () => {
    let app: Hono;

    beforeEach(() => {
      app = new Hono();
    });

    describe("checkResourceAuthorization", () => {
      it("should deny unauthenticated requests", () => {
        const c = { get: () => undefined } as any;

        const check = checkResourceAuthorization(c, "trip", "create");
        expect(check.allowed).toBe(false);
      });

      it("should allow authenticated user with correct permission", async () => {
        app.use("/trips", optionalAuth());
        app.get("/trips", (c) => {
          const check = checkResourceAuthorization(c, "trip", "create");
          return c.json(check);
        });

        const res = await app.request("/trips", {
          headers: {
            Authorization: `Bearer ${testKeyId}:${testApiKey}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.allowed).toBe(true);
      });
    });

    describe("requireResourceAuthorization middleware", () => {
      it("should allow access with correct permission", async () => {
        app.use(
          "/trips",
          optionalAuth(),
          requireResourceAuthorization("trip", "create", { logAttempt: true })
        );
        app.post("/trips", (c) => c.json({ success: true }));

        const res = await app.request("/trips", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${testKeyId}:${testApiKey}`,
          },
        });

        expect(res.status).toBe(200);
      });

      it("should deny access without permission", async () => {
        // Create a guest key (no trip permissions)
        const guestKeyId = "guest_key_test";
        const guestKey = await generateApiKey();
        const hashed = await hashApiKey(guestKey);

        await registerApiKey({
          keyId: guestKeyId,
          keyHash: hashed.hash,
          keySalt: hashed.salt,
          scope: "read",
          rateLimitTier: 1,
          active: true,
          createdAt: Date.now(),
          expiresAt: 0,
          role: "guest",
        });

        app.use("/trips", optionalAuth(), requireResourceAuthorization("trip", "create"));
        app.post("/trips", (c) => c.json({ success: true }));

        const res = await app.request("/trips", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${guestKeyId}:${guestKey}`,
          },
        });

        expect(res.status).toBe(403);
      });
    });

    describe("createAuthorizationContext", () => {
      it("should create authorization context for authenticated user", async () => {
        app.use("/ctx", optionalAuth(), (c) => {
          const authz = createAuthorizationContext(c);
          return c.json({
            isAuthenticated: authz.isAuthenticated,
            isAdmin: authz.isAdmin,
            keyId: authz.auth?.keyId,
          });
        });

        const res = await app.request("/ctx", {
          headers: {
            Authorization: `Bearer ${testKeyId}:${testApiKey}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.isAuthenticated).toBe(true);
        expect(body.isAdmin).toBe(false);
        expect(body.keyId).toBe(testKeyId);
      });

      it("should create context for admin user", async () => {
        app.use("/ctx", optionalAuth(), (c) => {
          const authz = createAuthorizationContext(c);
          return c.json({
            isAuthenticated: authz.isAuthenticated,
            isAdmin: authz.isAdmin,
            canCreateTrips: authz.can("trips:create" as Permission),
          });
        });

        const res = await app.request("/ctx", {
          headers: {
            Authorization: `Bearer ${adminKeyId}:${adminApiKey}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.isAuthenticated).toBe(true);
        expect(body.isAdmin).toBe(true);
        expect(body.canCreateTrips).toBe(true);
      });
    });

    describe("filterAuthorizedResources", () => {
      it("should return all resources for admin", async () => {
        const resources = [{ id: "resource-1" }, { id: "resource-2" }, { id: "resource-3" }];

        const app = new Hono();
        app.use("/resources", optionalAuth(), (c) => {
          const filtered = filterAuthorizedResources(c, "trip", "read", resources);
          return c.json(filtered);
        });

        const res = await app.request("/resources", {
          headers: {
            Authorization: `Bearer ${adminKeyId}:${adminApiKey}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toHaveLength(3);
      });

      it("should filter resources for regular user", async () => {
        const resources = [
          { id: testKeyId }, // User's own resource
          { id: adminKeyId }, // Admin's resource
          { id: "other-resource" },
        ];

        const app = new Hono();
        app.use("/resources", optionalAuth(), (c) => {
          const filtered = filterAuthorizedResources(c, "trip", "read", resources);
          return c.json(filtered);
        });

        const res = await app.request("/resources", {
          headers: {
            Authorization: `Bearer ${testKeyId}:${testApiKey}`,
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        // User should only see their own resources
        expect(body).toHaveLength(1);
        expect(body[0].id).toBe(testKeyId);
      });
    });

    describe("registerResourceType", () => {
      it("should allow custom resource type registration", () => {
        registerResourceType({
          type: "custom_resource",
          namespace: "custom",
          supportsOwnership: true,
          defaultPermissions: {
            create: "custom:create" as Permission,
            read: "custom:read:own" as Permission,
          },
        });

        const config = getResourceType("custom_resource");
        expect(config).toBeDefined();
        expect(config?.namespace).toBe("custom");
        expect(config?.supportsOwnership).toBe(true);
      });
    });
  });
});

// Helper function to import getSystemStatus
function getSystemStatus() {
  return require("../middleware/admin-operations.js").getSystemStatus();
}
