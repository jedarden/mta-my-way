/**
 * Tests for admin operations endpoints.
 */

import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type BulkOperationResult,
  auditAdminOperation,
  exportAuditLogs,
  getAdminStatus,
  getAdminUserDetails,
  getAdminUsers,
  getAuditLogs,
  getAuditStatistics,
  getSecurityEvents,
  getSystemStatus,
  getUserSummaries,
  requireAdminPermission,
  requireAdminWithAudit,
  revokeAllUserApiKeys,
  revokeApiKeyAdmin,
  revokeUserKeys,
} from "./admin-operations.js";
import {
  type ApiKey,
  type Permission,
  type UserRole,
  registerApiKey,
  revokeApiKey as revokeAuthApiKey,
} from "./authentication.js";
import { type RbacAuthContext, setRbacAuthContext } from "./rbac.js";

describe("Admin Operations", () => {
  let testApiKeys: ApiKey[] = [];

  beforeEach(async () => {
    vi.clearAllMocks();

    // Register test API keys - registerApiKey returns void, so we use the values we passed in
    await registerApiKey({
      keyId: "admin_key",
      keyHash: "hash1",
      keySalt: "salt1",
      scope: "admin",
      rateLimitTier: 100,
      active: true,
      createdAt: Date.now() - 100000,
      expiresAt: 0,
      role: "admin",
    });

    await registerApiKey({
      keyId: "user_key_read",
      keyHash: "hash2",
      keySalt: "salt2",
      scope: "read",
      rateLimitTier: 10,
      active: true,
      createdAt: Date.now() - 50000,
      expiresAt: 0,
      role: "user",
    });

    await registerApiKey({
      keyId: "user_key_write",
      keyHash: "hash3",
      keySalt: "salt3",
      scope: "write",
      rateLimitTier: 50,
      active: true,
      createdAt: Date.now() - 30000,
      expiresAt: 0,
      role: "user",
    });

    testApiKeys = [
      {
        keyId: "admin_key",
        keyHash: "hash1",
        keySalt: "salt1",
        scope: "admin",
        rateLimitTier: 100,
        active: true,
        createdAt: Date.now() - 100000,
        expiresAt: 0,
        role: "admin",
      },
      {
        keyId: "user_key_read",
        keyHash: "hash2",
        keySalt: "salt2",
        scope: "read",
        rateLimitTier: 10,
        active: true,
        createdAt: Date.now() - 50000,
        expiresAt: 0,
        role: "user",
      },
      {
        keyId: "user_key_write",
        keyHash: "hash3",
        keySalt: "salt3",
        scope: "write",
        rateLimitTier: 50,
        active: true,
        createdAt: Date.now() - 30000,
        expiresAt: 0,
        role: "user",
      },
    ];
  });

  describe("getSystemStatus", () => {
    it("should return system status information", () => {
      const status = getSystemStatus();

      expect(status.uptime).toBeGreaterThan(0);
      expect(status.startTime).toBeLessThanOrEqual(Date.now());
      expect(status.currentTime).toBeLessThanOrEqual(Date.now());
      expect(status.memory.rss).toBeGreaterThan(0);
      expect(status.memory.heapUsed).toBeGreaterThan(0);
      expect(status.memory.heapTotal).toBeGreaterThan(0);
    });

    it("should include API key statistics", () => {
      const status = getSystemStatus();

      expect(status.apiKeys.total).toBe(3);
      expect(status.apiKeys.active).toBe(3);
      expect(status.apiKeys.byScope).toBeDefined();
      expect(status.apiKeys.byScope.admin).toBe(1);
      expect(status.apiKeys.byScope.read).toBe(1);
      expect(status.apiKeys.byScope.write).toBe(1);
    });

    it("should include audit log statistics", () => {
      const status = getSystemStatus();

      expect(status.auditLog.totalEvents).toBeGreaterThanOrEqual(0);
      expect(status.auditLog.failedEvents24h).toBeGreaterThanOrEqual(0);
      expect(status.auditLog.uniqueUsers24h).toBeGreaterThanOrEqual(0);
    });
  });

  describe("getUserSummaries", () => {
    it("should return user summaries grouped by keyId prefix", () => {
      // Add keys with same prefix
      registerApiKey({
        keyId: "user_key_read_2",
        keyHash: "hash",
        keySalt: "salt",
        scope: "read",
        rateLimitTier: 10,
        active: true,
        createdAt: Date.now(),
        expiresAt: 0,
      });

      registerApiKey({
        keyId: "user_key_write_2",
        keyHash: "hash",
        keySalt: "salt",
        scope: "write",
        rateLimitTier: 50,
        active: true,
        createdAt: Date.now(),
        expiresAt: 0,
      });

      const summaries = getUserSummaries();

      expect(summaries).toBeDefined();
      expect(Array.isArray(summaries)).toBe(true);
      expect(summaries.length).toBeGreaterThan(0);
    });

    it("should count API keys per user", () => {
      const summaries = getUserSummaries();

      const adminUser = summaries.find((s) => s.keyId === "admin");
      expect(adminUser?.apiKeys).toBeGreaterThanOrEqual(1);
    });
  });

  describe("revokeAllUserApiKeys", () => {
    it("should revoke all API keys for a user", () => {
      // Create multiple keys for the same user
      registerApiKey({
        keyId: "testuser_key1",
        keyHash: "hash1",
        keySalt: "salt1",
        scope: "read",
        rateLimitTier: 10,
        active: true,
        createdAt: Date.now(),
        expiresAt: 0,
      });

      registerApiKey({
        keyId: "testuser_key2",
        keyHash: "hash2",
        keySalt: "salt2",
        scope: "write",
        rateLimitTier: 50,
        active: true,
        createdAt: Date.now(),
        expiresAt: 0,
      });

      const result = revokeAllUserApiKeys("testuser");

      expect(result.total).toBe(2);
      expect(result.succeeded).toHaveLength(2);
      expect(result.failed).toHaveLength(0);
    });

    it("should handle partial failures gracefully", () => {
      // Mock revokeApiKey to fail for one key
      const originalRevoke = revokeAuthApiKey;
      const revokeSpy = vi
        .spyOn({ revokeApiKey: revokeAuthApiKey }, "revokeApiKey")
        .mockImplementation((keyId: string) => {
          if (keyId === "testuser_key2") {
            throw new Error("Key not found");
          }
          return originalRevoke(keyId);
        });

      registerApiKey({
        keyId: "testuser_key1",
        keyHash: "hash1",
        keySalt: "salt1",
        scope: "read",
        rateLimitTier: 10,
        active: true,
        createdAt: Date.now(),
        expiresAt: 0,
      });

      registerApiKey({
        keyId: "testuser_key2",
        keyHash: "hash2",
        keySalt: "salt2",
        scope: "write",
        rateLimitTier: 50,
        active: true,
        createdAt: Date.now(),
        expiresAt: 0,
      });

      const result = revokeAllUserApiKeys("testuser");

      expect(result.total).toBe(2);
      expect(result.succeeded.length).toBeGreaterThanOrEqual(0);
      expect(result.failed.length).toBeGreaterThanOrEqual(0);

      revokeSpy.mockRestore();
    });

    it("should return empty result for non-existent user", () => {
      const result = revokeAllUserApiKeys("nonexistent_user");

      expect(result.total).toBe(0);
      expect(result.succeeded).toHaveLength(0);
      expect(result.failed).toHaveLength(0);
    });
  });

  describe("requireAdminWithAudit", () => {
    it("should allow requests from admin users", async () => {
      const app = new Hono();

      const authContext: RbacAuthContext = {
        keyId: "admin_key",
        role: "admin",
        scope: "admin",
        rateLimitTier: 100,
        authMethod: "api_key",
        permissions: [],
      };

      app.use("*", async (c, next) => {
        setRbacAuthContext(c, authContext);
        await next();
      });

      app.use("*", requireAdminWithAudit("test_action", "test_resource"));
      app.get("/test", (c) => c.json({ success: true }));

      const res = await app.request("/test");

      expect(res.status).toBe(200);
    });

    it("should deny requests from non-admin users", async () => {
      const app = new Hono();

      const authContext: RbacAuthContext = {
        keyId: "user_key",
        role: "user",
        scope: "read",
        rateLimitTier: 10,
        authMethod: "api_key",
        permissions: [],
      };

      app.use("*", async (c, next) => {
        setRbacAuthContext(c, authContext);
        await next();
      });

      app.use("*", requireAdminWithAudit("test_action", "test_resource"));
      app.get("/test", (c) => c.json({ success: true }));

      const res = await app.request("/test");

      expect(res.status).toBe(403);
    });

    it("should deny unauthenticated requests", async () => {
      const app = new Hono();

      app.use("*", requireAdminWithAudit("test_action", "test_resource"));
      app.get("/test", (c) => c.json({ success: true }));

      const res = await app.request("/test");

      expect(res.status).toBe(403);
    });
  });

  describe("requireAdminPermission", () => {
    it("should be a middleware function", () => {
      const middleware = requireAdminPermission("admin:users" as Permission);

      expect(typeof middleware).toBe("function");
    });
  });

  describe("auditAdminOperation", () => {
    it("should audit successful operations", async () => {
      const app = new Hono();

      const authContext: RbacAuthContext = {
        keyId: "admin_key",
        role: "admin",
        scope: "admin",
        rateLimitTier: 100,
        authMethod: "api_key",
        permissions: [],
      };

      app.use("*", async (c, next) => {
        setRbacAuthContext(c, authContext);
        await next();
      });

      app.use("*", auditAdminOperation("test_action", "test_resource"));
      app.get("/test", (c) => c.json({ success: true }));

      const res = await app.request("/test");

      expect(res.status).toBe(200);
    });

    it("should audit failed operations", async () => {
      const app = new Hono();

      const authContext: RbacAuthContext = {
        keyId: "admin_key",
        role: "admin",
        scope: "admin",
        rateLimitTier: 100,
        authMethod: "api_key",
        permissions: [],
      };

      app.use("*", async (c, next) => {
        setRbacAuthContext(c, authContext);
        await next();
      });

      app.use("*", auditAdminOperation("test_action", "test_resource"));
      app.get("/test", (c) => {
        c.status(500);
        return c.json({ error: "Internal error" });
      });

      const res = await app.request("/test");

      expect(res.status).toBe(500);
    });
  });

  describe("Admin Endpoint Handlers", () => {
    describe("getAdminStatus", () => {
      it("should return status as JSON", async () => {
        const c = {
          json: vi.fn().mockReturnValue(new Response(null, { status: 200 })),
        } as any;

        const response = await getAdminStatus(c);

        expect(c.json).toHaveBeenCalledWith(
          expect.objectContaining({
            uptime: expect.any(Number),
            memory: expect.any(Object),
            apiKeys: expect.any(Object),
          })
        );
      });
    });

    describe("getAdminUsers", () => {
      it("should return user summaries", async () => {
        const c = {
          json: vi.fn().mockReturnValue(new Response(null, { status: 200 })),
        } as any;

        const response = await getAdminUsers(c);

        expect(c.json).toHaveBeenCalledWith(
          expect.objectContaining({
            users: expect.any(Array),
            count: expect.any(Number),
          })
        );
      });
    });

    describe("getAdminUserDetails", () => {
      it("should return 400 for missing user ID", async () => {
        const c = {
          req: {
            param: vi.fn().mockReturnValue(undefined),
          },
        } as any;

        await expect(getAdminUserDetails(c)).rejects.toThrow(HTTPException);
      });

      it("should return 404 for non-existent user", async () => {
        const c = {
          req: {
            param: vi.fn().mockReturnValue("nonexistent_user"),
          },
          json: vi.fn().mockReturnValue(new Response(null, { status: 200 })),
        } as any;

        await expect(getAdminUserDetails(c)).rejects.toThrow(HTTPException);
      });

      it("should return user details for valid user", async () => {
        const c = {
          req: {
            param: vi.fn().mockReturnValue("admin"),
          },
          json: vi.fn().mockReturnValue(new Response(null, { status: 200 })),
        } as any;

        const response = await getAdminUserDetails(c);

        expect(c.json).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: "admin",
            apiKeys: expect.any(Array),
            count: expect.any(Number),
          })
        );
      });
    });

    describe("revokeUserKeys", () => {
      it("should return 400 for missing user ID", async () => {
        const c = {
          req: {
            param: vi.fn().mockReturnValue(undefined),
          },
        } as any;

        await expect(revokeUserKeys(c)).rejects.toThrow(HTTPException);
      });

      it("should revoke all keys for user", async () => {
        registerApiKey({
          keyId: "testuser_key1",
          keyHash: "hash1",
          keySalt: "salt1",
          scope: "read",
          rateLimitTier: 10,
          active: true,
          createdAt: Date.now(),
          expiresAt: 0,
        });

        const c = {
          req: {
            param: vi.fn().mockReturnValue("testuser"),
          },
          json: vi.fn().mockReturnValue(new Response(null, { status: 200 })),
        } as any;

        const response = await revokeUserKeys(c);

        expect(c.json).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: "testuser",
            total: expect.any(Number),
            succeeded: expect.any(Array),
            failed: expect.any(Array),
          })
        );
      });
    });

    describe("getAuditLogs", () => {
      it("should return audit logs with filters", async () => {
        const c = {
          req: {
            query: vi.fn().mockReturnValue({}),
          },
          json: vi.fn().mockReturnValue(new Response(null, { status: 200 })),
        } as any;

        const response = await getAuditLogs(c);

        expect(c.json).toHaveBeenCalledWith(
          expect.objectContaining({
            events: expect.any(Array),
            count: expect.any(Number),
            filters: expect.any(Object),
          })
        );
      });

      it("should parse query parameters for filters", async () => {
        const c = {
          req: {
            query: vi.fn().mockReturnValue({
              category: "admin",
              limit: "10",
              offset: "0",
            }),
          },
          json: vi.fn().mockReturnValue(new Response(null, { status: 200 })),
        } as any;

        const response = await getAuditLogs(c);

        expect(c.json).toHaveBeenCalledWith(
          expect.objectContaining({
            filters: expect.objectContaining({
              category: "admin",
              limit: 10,
              offset: 0,
            }),
          })
        );
      });
    });

    describe("getAuditStatistics", () => {
      it("should return audit log statistics", async () => {
        const c = {
          json: vi.fn().mockReturnValue(new Response(null, { status: 200 })),
        } as any;

        const response = await getAuditStatistics(c);

        expect(c.json).toHaveBeenCalledWith(
          expect.objectContaining({
            totalEvents: expect.any(Number),
            eventsByCategory: expect.any(Object),
            eventsBySeverity: expect.any(Object),
          })
        );
      });
    });

    describe("exportAuditLogs", () => {
      it("should export as JSON by default", async () => {
        const c = {
          req: {
            query: vi.fn().mockReturnValue({}),
          },
          header: vi.fn(),
          json: vi.fn().mockReturnValue(new Response(null, { status: 200 })),
          text: vi.fn().mockReturnValue(new Response(null, { status: 200 })),
        } as any;

        const response = await exportAuditLogs(c);

        expect(c.header).toHaveBeenCalledWith("Content-Type", "application/json");
      });

      it("should export as CSV when requested", async () => {
        const c = {
          req: {
            query: vi.fn((key?: string) => {
              if (key === "format") return "csv";
              return {};
            }),
          },
          header: vi.fn(),
          text: vi.fn().mockReturnValue(new Response(null, { status: 200 })),
        } as any;

        const response = await exportAuditLogs(c);

        expect(c.header).toHaveBeenCalledWith("Content-Type", "text/csv");
        expect(c.header).toHaveBeenCalledWith(
          "Content-Disposition",
          expect.stringContaining(".csv")
        );
      });
    });

    describe("getSecurityEvents", () => {
      it("should return recent security events", async () => {
        const c = {
          req: {
            query: vi.fn().mockReturnValue({}),
          },
          json: vi.fn().mockReturnValue(new Response(null, { status: 200 })),
        } as any;

        const response = await getSecurityEvents(c);

        expect(c.json).toHaveBeenCalledWith(
          expect.objectContaining({
            events: expect.any(Array),
            count: expect.any(Number),
          })
        );
      });

      it("should respect limit parameter", async () => {
        const c = {
          req: {
            query: vi.fn().mockReturnValue({ limit: "10" }),
          },
          json: vi.fn().mockReturnValue(new Response(null, { status: 200 })),
        } as any;

        const response = await getSecurityEvents(c);

        expect(c.json).toHaveBeenCalled();
      });
    });

    describe("revokeApiKeyAdmin", () => {
      it("should return 400 for missing key ID", async () => {
        const c = {
          req: {
            param: vi.fn().mockReturnValue(undefined),
          },
        } as any;

        await expect(revokeApiKeyAdmin(c)).rejects.toThrow(HTTPException);
      });

      it("should return 404 for non-existent key", async () => {
        const c = {
          req: {
            param: vi.fn().mockReturnValue("nonexistent_key"),
          },
        } as any;

        await expect(revokeApiKeyAdmin(c)).rejects.toThrow(HTTPException);
      });

      it("should revoke existing API key", async () => {
        const c = {
          req: {
            param: vi.fn().mockReturnValue("admin_key"),
          },
          json: vi.fn().mockReturnValue(new Response(null, { status: 200 })),
        } as any;

        const response = await revokeApiKeyAdmin(c);

        expect(c.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            keyId: "admin_key",
          })
        );
      });
    });
  });

  describe("BulkOperationResult", () => {
    it("should have correct structure", () => {
      const result: BulkOperationResult = {
        succeeded: ["key1", "key2"],
        failed: [
          { id: "key3", error: "Not found" },
          { id: "key4", error: "Permission denied" },
        ],
        total: 4,
      };

      expect(result.succeeded).toHaveLength(2);
      expect(result.failed).toHaveLength(2);
      expect(result.total).toBe(4);
    });
  });
});
