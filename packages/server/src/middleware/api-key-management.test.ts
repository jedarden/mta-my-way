/**
 * Tests for API key management endpoints.
 */

import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as logger from "../observability/logger.js";
import {
  type ApiKeyCreateRequest,
  type ApiKeyListFilters,
  type ApiKeyResponse,
  type ApiKeyScope,
  type Permission,
  type UserRole,
  canAssignRole,
  canGrantPermissions,
  getApiKeysForUser,
  getSafeApiKeyResponse,
  listApiKeys,
  logApiKeyOperation,
  registerApiKeyWithMetadata,
  requireApiKeyOwnershipOrAdmin,
  updateApiKeyLastUsed,
  validateApiKeyCreateRequest,
} from "./api-key-management.js";
import {
  type ApiKey,
  generateApiKey,
  getApiKeyById,
  hashApiKey,
  registerApiKey,
  revokeApiKey,
} from "./authentication.js";
import { setRbacAuthContext } from "./rbac.js";

describe("API Key Management", () => {
  beforeEach(async () => {
    // Register test API keys in BOTH storage systems
    // First register in authentication system
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
    // Then register in metadata registry
    registerApiKeyWithMetadata(
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
      "Admin API key"
    );

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
    registerApiKeyWithMetadata(
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
      "User read API key"
    );

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
    registerApiKeyWithMetadata(
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
      "User write API key"
    );

    await registerApiKey({
      keyId: "guest_key",
      keyHash: "hash4",
      keySalt: "salt4",
      scope: "read",
      rateLimitTier: 5,
      active: true,
      createdAt: Date.now() - 20000,
      expiresAt: 0,
      role: "guest",
    });
    registerApiKeyWithMetadata(
      {
        keyId: "guest_key",
        keyHash: "hash4",
        keySalt: "salt4",
        scope: "read",
        rateLimitTier: 5,
        active: true,
        createdAt: Date.now() - 20000,
        expiresAt: 0,
        role: "guest",
      },
      "Guest API key"
    );
  });

  describe("registerApiKeyWithMetadata", () => {
    it("should register API key with metadata", async () => {
      const key: ApiKey = {
        keyId: "test_key",
        keyHash: "test_hash",
        keySalt: "test_salt",
        scope: "read",
        rateLimitTier: 10,
        active: true,
        createdAt: Date.now(),
        expiresAt: 0,
      };

      await registerApiKey(key);
      registerApiKeyWithMetadata(key, "Test API key for unit tests");

      const response = getSafeApiKeyResponse("test_key");
      expect(response).toBeDefined();
      expect(response?.description).toBe("Test API key for unit tests");
    });

    it("should register API key without description", async () => {
      const key: ApiKey = {
        keyId: "test_key_2",
        keyHash: "test_hash",
        keySalt: "test_salt",
        scope: "write",
        rateLimitTier: 50,
        active: true,
        createdAt: Date.now(),
        expiresAt: 0,
      };

      await registerApiKey(key);
      registerApiKeyWithMetadata(key);

      const response = getSafeApiKeyResponse("test_key_2");
      expect(response).toBeDefined();
      expect(response?.description).toBeUndefined();
    });
  });

  describe("updateApiKeyLastUsed", () => {
    it("should update last used timestamp", () => {
      updateApiKeyLastUsed("admin_key");

      const response = getSafeApiKeyResponse("admin_key");
      expect(response?.lastUsedAt).toBeDefined();
      expect(response?.lastUsedAt).toBeLessThanOrEqual(Date.now());
    });

    it("should handle non-existent key gracefully", () => {
      expect(() => updateApiKeyLastUsed("nonexistent_key")).not.toThrow();
    });
  });

  describe("getApiKeysForUser", () => {
    it("should return all keys for admin", () => {
      const keys = getApiKeysForUser("", true);

      expect(keys.length).toBeGreaterThanOrEqual(4);
    });

    it("should return only user's own keys for non-admin", () => {
      const keys = getApiKeysForUser("user_key", false);

      expect(keys.length).toBeGreaterThanOrEqual(0);
      expect(keys.every((k) => k.keyId.startsWith("user_key"))).toBe(true);
    });

    it("should include last used timestamp", () => {
      updateApiKeyLastUsed("admin_key");

      const keys = getApiKeysForUser("", true);
      const adminKey = keys.find((k) => k.keyId === "admin_key");

      expect(adminKey?.lastUsedAt).toBeDefined();
    });

    it("should sort by creation time descending", () => {
      const keys = getApiKeysForUser("", true);

      for (let i = 0; i < keys.length - 1; i++) {
        expect(keys[i]?.createdAt).toBeGreaterThanOrEqual(keys[i + 1]?.createdAt || 0);
      }
    });
  });

  describe("listApiKeys", () => {
    it("should return paginated results", () => {
      const filters: ApiKeyListFilters = {
        limit: 2,
        offset: 0,
      };

      const keys = listApiKeys(filters, true, "");

      expect(keys.length).toBeLessThanOrEqual(2);
    });

    it("should filter by active status", () => {
      const activeFilters: ApiKeyListFilters = {
        active: true,
      };

      const activeKeys = listApiKeys(activeFilters, true, "");
      expect(activeKeys.every((k) => k.active === true)).toBe(true);

      const inactiveFilters: ApiKeyListFilters = {
        active: false,
      };

      const inactiveKeys = listApiKeys(inactiveFilters, true, "");
      expect(inactiveKeys.every((k) => k.active === false)).toBe(true);
    });

    it("should filter by role", () => {
      const filters: ApiKeyListFilters = {
        role: "admin" as UserRole,
      };

      const keys = listApiKeys(filters, true, "");

      expect(keys.every((k) => k.role === "admin")).toBe(true);
    });

    it("should filter by scope", () => {
      const filters: ApiKeyListFilters = {
        scope: "read" as ApiKeyScope,
      };

      const keys = listApiKeys(filters, true, "");

      expect(keys.every((k) => k.scope === "read")).toBe(true);
    });

    it("should apply offset for pagination", () => {
      const page1 = listApiKeys({ limit: 2, offset: 0 }, true, "");
      const page2 = listApiKeys({ limit: 2, offset: 2 }, true, "");

      expect(page1.length).toBeLessThanOrEqual(2);
      expect(page2.length).toBeLessThanOrEqual(2);

      // Ensure different results
      if (page1.length === 2 && page2.length === 2) {
        expect(page1[0]?.keyId).not.toBe(page2[0]?.keyId);
      }
    });
  });

  describe("getSafeApiKeyResponse", () => {
    it("should return key without secret", () => {
      const response = getSafeApiKeyResponse("admin_key");

      expect(response).toBeDefined();
      expect(response?.keyId).toBe("admin_key");
      expect(response?.apiKey).toBeUndefined(); // Never include secret
    });

    it("should return null for non-existent key", () => {
      const response = getSafeApiKeyResponse("nonexistent_key");

      expect(response).toBeNull();
    });

    it("should include all safe fields", () => {
      const response = getSafeApiKeyResponse("admin_key");

      expect(response?.keyId).toBeDefined();
      expect(response?.scope).toBeDefined();
      expect(response?.rateLimitTier).toBeDefined();
      expect(response?.active).toBeDefined();
      expect(response?.role).toBeDefined();
      expect(response?.permissions).toBeDefined();
      expect(response?.createdAt).toBeDefined();
      expect(response?.expiresAt).toBeDefined();
    });
  });

  describe("canAssignRole", () => {
    it("should allow admins to assign any role", () => {
      expect(canAssignRole("admin" as UserRole, "admin" as UserRole)).toBe(true);
      expect(canAssignRole("admin" as UserRole, "user" as UserRole)).toBe(true);
      expect(canAssignRole("admin" as UserRole, "guest" as UserRole)).toBe(true);
    });

    it("should allow users to assign guest role only", () => {
      expect(canAssignRole("user" as UserRole, "guest" as UserRole)).toBe(true);
      expect(canAssignRole("user" as UserRole, "user" as UserRole)).toBe(false);
      expect(canAssignRole("user" as UserRole, "admin" as UserRole)).toBe(false);
    });

    it("should not allow guests to assign roles", () => {
      expect(canAssignRole("guest" as UserRole, "guest" as UserRole)).toBe(false);
      expect(canAssignRole("guest" as UserRole, "user" as UserRole)).toBe(false);
      expect(canAssignRole("guest" as UserRole, "admin" as UserRole)).toBe(false);
    });

    it("should handle undefined assigner role", () => {
      expect(canAssignRole(undefined, "guest" as UserRole)).toBe(false);
    });
  });

  describe("canGrantPermissions", () => {
    it("should allow admins to grant any permissions", () => {
      const permissions: Permission[] = [
        "admin:users" as Permission,
        "apikeys:create" as Permission,
        "trips:delete" as Permission,
      ];

      expect(canGrantPermissions("admin" as UserRole, permissions)).toBe(true);
    });

    it("should prevent non-admins from granting admin permissions", () => {
      const permissions: Permission[] = ["admin:users" as Permission];

      expect(canGrantPermissions("user" as UserRole, permissions)).toBe(false);
      expect(canGrantPermissions("guest" as UserRole, permissions)).toBe(false);
    });

    it("should allow non-admins to grant non-admin permissions", () => {
      const permissions: Permission[] = [
        "trips:create" as Permission,
        "subscriptions:update" as Permission,
      ];

      expect(canGrantPermissions("user" as UserRole, permissions)).toBe(true);
    });

    it("should handle undefined role", () => {
      const permissions: Permission[] = ["trips:create" as Permission];

      expect(canGrantPermissions(undefined, permissions)).toBe(false);
    });
  });

  describe("validateApiKeyCreateRequest", () => {
    const adminAuth = {
      keyId: "admin_key",
      role: "admin" as UserRole,
      scope: "admin" as ApiKeyScope,
      rateLimitTier: 100,
      authMethod: "api_key",
      permissions: [],
    };

    const userAuth = {
      keyId: "user_key",
      role: "user" as UserRole,
      scope: "read" as ApiKeyScope,
      rateLimitTier: 10,
      authMethod: "api_key",
      permissions: [],
    };

    it("should validate correct request", () => {
      const request: ApiKeyCreateRequest = {
        scope: "read" as ApiKeyScope,
        rateLimitTier: 10,
      };

      const result = validateApiKeyCreateRequest(adminAuth, request);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should reject invalid scope", () => {
      const request: ApiKeyCreateRequest = {
        scope: "invalid" as ApiKeyScope,
        rateLimitTier: 10,
      };

      const result = validateApiKeyCreateRequest(adminAuth, request);

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Invalid scope");
    });

    it("should reject rate limit tier out of range", () => {
      const request1: ApiKeyCreateRequest = {
        scope: "read" as ApiKeyScope,
        rateLimitTier: 0,
      };

      const result1 = validateApiKeyCreateRequest(adminAuth, request1);

      expect(result1.valid).toBe(false);
      expect(result1.error).toBe("Rate limit tier must be between 1 and 100");

      const request2: ApiKeyCreateRequest = {
        scope: "read" as ApiKeyScope,
        rateLimitTier: 101,
      };

      const result2 = validateApiKeyCreateRequest(adminAuth, request2);

      expect(result2.valid).toBe(false);
    });

    it("should accept rate limit tier within range", () => {
      const request: ApiKeyCreateRequest = {
        scope: "read" as ApiKeyScope,
        rateLimitTier: 50,
      };

      const result = validateApiKeyCreateRequest(adminAuth, request);

      expect(result.valid).toBe(true);
    });

    it("should prevent non-admins from assigning higher roles", () => {
      const request: ApiKeyCreateRequest = {
        scope: "read" as ApiKeyScope,
        role: "admin" as UserRole,
      };

      const result = validateApiKeyCreateRequest(userAuth, request);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("cannot assign role");
    });

    it("should prevent non-admins from granting admin permissions", () => {
      const request: ApiKeyCreateRequest = {
        scope: "read" as ApiKeyScope,
        additionalPermissions: ["admin:users" as Permission],
      };

      const result = validateApiKeyCreateRequest(userAuth, request);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("cannot grant admin permissions");
    });

    it("should prevent non-admins from creating admin-scoped keys", () => {
      const request: ApiKeyCreateRequest = {
        scope: "admin" as ApiKeyScope,
      };

      const result = validateApiKeyCreateRequest(userAuth, request);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Only admins can create admin-scoped keys");
    });

    it("should allow admins to create admin-scoped keys", () => {
      const request: ApiKeyCreateRequest = {
        scope: "admin" as ApiKeyScope,
      };

      const result = validateApiKeyCreateRequest(adminAuth, request);

      expect(result.valid).toBe(true);
    });
  });

  describe("requireApiKeyOwnershipOrAdmin", () => {
    it("should allow access to own API keys", async () => {
      const app = new Hono();

      const authContext = {
        keyId: "user_key_read",
        role: "user" as UserRole,
        scope: "read" as ApiKeyScope,
        rateLimitTier: 10,
        authMethod: "api_key",
        permissions: [],
      };

      app.use("*", async (c, next) => {
        setRbacAuthContext(c, authContext);
        await next();
      });

      app.get("/test/:keyId", requireApiKeyOwnershipOrAdmin(), (c) => c.json({ success: true }));

      const res = await app.request("/test/user_key_read");

      expect(res.status).toBe(200);
    });

    it("should allow admins to access any key", async () => {
      const app = new Hono();

      const authContext = {
        keyId: "admin_key",
        role: "admin" as UserRole,
        scope: "admin" as ApiKeyScope,
        rateLimitTier: 100,
        authMethod: "api_key",
        permissions: [],
      };

      app.use("*", async (c, next) => {
        setRbacAuthContext(c, authContext);
        await next();
      });

      app.get("/test/:keyId", requireApiKeyOwnershipOrAdmin(), (c) => c.json({ success: true }));

      const res = await app.request("/test/user_key_read");

      expect(res.status).toBe(200);
    });

    it("should deny access to other users' keys", async () => {
      const app = new Hono();

      const authContext = {
        keyId: "user_key_read",
        role: "user" as UserRole,
        scope: "read" as ApiKeyScope,
        rateLimitTier: 10,
        authMethod: "api_key",
        permissions: [],
      };

      app.use("*", async (c, next) => {
        setRbacAuthContext(c, authContext);
        await next();
      });

      app.get("/test/:keyId", requireApiKeyOwnershipOrAdmin(), (c) => c.json({ success: true }));

      const res = await app.request("/test/admin_key");

      expect(res.status).toBe(403);
    });
  });

  describe("logApiKeyOperation", () => {
    it("should log successful operations", () => {
      const loggerSpy = vi.spyOn(logger.logger, "info").mockImplementation(() => {});

      logApiKeyOperation("create", "new_key", { keyId: "admin", role: "admin" } as never, true);

      expect(loggerSpy).toHaveBeenCalled();

      loggerSpy.mockRestore();
    });

    it("should log failed operations", () => {
      const loggerSpy = vi.spyOn(logger.logger, "info").mockImplementation(() => {});

      logApiKeyOperation("create", "new_key", { keyId: "user", role: "user" } as never, false, {
        reason: "Quota exceeded",
      });

      expect(loggerSpy).toHaveBeenCalled();

      loggerSpy.mockRestore();
    });
  });

  describe("Integration: API Key Lifecycle", () => {
    it("should handle complete API key lifecycle", async () => {
      // Create a key ID and API key
      const keyId = `test_key_${Date.now()}`;
      const apiKey = await generateApiKey();

      expect(apiKey).toBeDefined();
      expect(keyId).toBeDefined();

      // Hash the API key for storage
      const { hash, salt } = await hashApiKey(apiKey);

      // Create key object
      const keyObj: ApiKey = {
        keyId,
        keyHash: hash,
        keySalt: salt,
        scope: "read",
        rateLimitTier: 10,
        active: true,
        createdAt: Date.now(),
        expiresAt: 0,
      };

      // Register in both storage systems
      await registerApiKey(keyObj);
      registerApiKeyWithMetadata(keyObj, "Test key");

      // Get from metadata registry
      const response = getSafeApiKeyResponse(keyId);
      expect(response?.keyId).toBe(keyId);
      expect(response?.description).toBe("Test key");

      // Update last used
      updateApiKeyLastUsed(keyId);
      const updated = getSafeApiKeyResponse(keyId);
      expect(updated?.lastUsedAt).toBeDefined();

      // Revoke (this updates the apiKeys Map in authentication.ts)
      revokeApiKey(keyId);

      // Verify revoked - getApiKeyById reads from apiKeys Map
      const revoked = getApiKeyById(keyId);
      expect(revoked?.active).toBe(false);
    });
  });

  describe("ApiKeyResponse Type", () => {
    it("should have correct structure", () => {
      const response: ApiKeyResponse = {
        keyId: "test_key",
        scope: "read" as ApiKeyScope,
        rateLimitTier: 10,
        active: true,
        role: "user" as UserRole,
        permissions: [],
        createdAt: Date.now(),
        expiresAt: 0,
        description: "Test",
        lastUsedAt: Date.now(),
      };

      expect(response.keyId).toBe("test_key");
      expect(response.scope).toBe("read");
      expect(response.role).toBe("user");
      expect(response.permissions).toEqual([]);
    });

    it("should allow optional apiKey field only on creation", () => {
      const responseWithoutKey: ApiKeyResponse = {
        keyId: "test_key",
        scope: "read" as ApiKeyScope,
        rateLimitTier: 10,
        active: true,
        role: "guest" as UserRole,
        permissions: [],
        createdAt: Date.now(),
        expiresAt: 0,
      };

      expect(responseWithoutKey.apiKey).toBeUndefined();

      const responseWithKey: ApiKeyResponse = {
        ...responseWithoutKey,
        apiKey: "test_key:secret",
      };

      expect(responseWithKey.apiKey).toBe("test_key:secret");
    });
  });

  describe("ApiKeyCreateRequest Type", () => {
    it("should validate required fields", () => {
      const request: ApiKeyCreateRequest = {
        scope: "write" as ApiKeyScope,
      };

      expect(request.scope).toBe("write");
    });

    it("should allow all optional fields", () => {
      const request: ApiKeyCreateRequest = {
        keyId: "custom_key_id",
        scope: "admin" as ApiKeyScope,
        rateLimitTier: 100,
        role: "admin" as UserRole,
        additionalPermissions: ["admin:users" as Permission],
        expiresIn: 3600,
        description: "Admin key for testing",
      };

      expect(request.keyId).toBe("custom_key_id");
      expect(request.rateLimitTier).toBe(100);
      expect(request.role).toBe("admin");
      expect(request.additionalPermissions).toContain("admin:users");
      expect(request.expiresIn).toBe(3600);
      expect(request.description).toBe("Admin key for testing");
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty filters", () => {
      const keys = listApiKeys({}, true, "");

      expect(Array.isArray(keys)).toBe(true);
    });

    it("should handle large offset values", () => {
      const keys = listApiKeys({ offset: 10000 }, true, "");

      expect(keys).toEqual([]);
    });

    it("should handle limit of 0", () => {
      const keys = listApiKeys({ limit: 0 }, true, "");

      expect(keys).toEqual([]);
    });

    it("should handle very large limit", () => {
      const keys = listApiKeys({ limit: 999999 }, true, "");

      expect(keys.length).toBeLessThanOrEqual(999999);
    });
  });
});
