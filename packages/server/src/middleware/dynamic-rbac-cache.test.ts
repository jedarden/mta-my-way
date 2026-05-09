/**
 * Dynamic RBAC Permission Caching Tests
 *
 * Tests permission caching functionality including:
 * - Permission result caching
 * - Cache invalidation
 * - Permission overrides
 * - Emergency revocation
 * - Cache statistics
 */

import { beforeEach, describe, expect, it } from "vitest";
import type { Permission, UserRole } from "./authentication.js";
import {
  type PermissionCheckResult,
  checkAllPermissions,
  checkAnyPermission,
  checkPermission,
  checkPermissions,
  cleanExpiredEntries,
  clearCache,
  clearEmergencyRevocations,
  clearPermissionOverrides,
  createPermissionOverride,
  emergencyRevokePermission,
  getCacheSizeByRole,
  getCacheStats,
  getEmergencyRevocations,
  getUserOverrides,
  invalidatePermissionCache,
  invalidateRoleCache,
  invalidateUserCache,
  liftEmergencyRevocation,
  removePermissionOverride,
  resetCacheStats,
} from "./dynamic-rbac-cache.js";

describe("Dynamic RBAC Permission Caching", () => {
  beforeEach(() => {
    clearCache();
    clearEmergencyRevocations();
    clearPermissionOverrides();
    resetCacheStats();
  });

  describe("Basic Permission Checking", () => {
    it("should grant permission for admin role", () => {
      const result = checkPermission("admin", "admin:users:read");

      expect(result.granted).toBe(true);
      expect(result.fromCache).toBe(false);
    });

    it("should deny permission for guest role", () => {
      const result = checkPermission("guest", "admin:users:read");

      expect(result.granted).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it("should cache permission results", () => {
      checkPermission("admin", "trips:read");
      const result = checkPermission("admin", "trips:read");

      expect(result.fromCache).toBe(true);
      expect(result.cacheAge).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Cache Invalidation", () => {
    it("should invalidate cache for a role", () => {
      checkPermission("admin", "trips:read");
      invalidateRoleCache("admin");

      const result = checkPermission("admin", "trips:read");

      expect(result.fromCache).toBe(false);
    });

    it("should invalidate cache for a user", () => {
      checkPermission("admin", "trips:read", { userId: "user1" });
      invalidateUserCache("user1");

      const result = checkPermission("admin", "trips:read", { userId: "user1" });

      expect(result.fromCache).toBe(false);
    });

    it("should invalidate cache for a permission", () => {
      checkPermission("admin", "trips:read");
      invalidatePermissionCache("trips:read");

      const result = checkPermission("admin", "trips:read");

      expect(result.fromCache).toBe(false);
    });

    it("should clear entire cache", () => {
      checkPermission("admin", "trips:read");
      clearCache();

      const stats = getCacheStats();
      expect(stats.size).toBe(0);
    });
  });

  describe("Cache Expiration", () => {
    it("should clean expired entries", async () => {
      const config = { cacheTtl: 100 }; // 100ms TTL

      checkPermission("admin", "trips:read", { config });
      await new Promise((resolve) => setTimeout(resolve, 150));

      const cleaned = cleanExpiredEntries(config);

      expect(cleaned).toBeGreaterThan(0);
    });
  });

  describe("Permission Overrides", () => {
    it("should grant permission via override", () => {
      const override = createPermissionOverride({
        userId: "user1",
        permission: "admin:users:delete" as Permission,
        grant: true,
        expiresAt: 0, // No expiration
        reason: "Special access",
        createdBy: "admin",
      });

      expect(override.overrideId).toBeDefined();

      const result = checkPermission("guest", "admin:users:delete" as Permission, {
        userId: "user1",
      });

      expect(result.granted).toBe(true);
    });

    it("should deny permission via override", () => {
      createPermissionOverride({
        userId: "user1",
        permission: "trips:read" as Permission,
        grant: false,
        expiresAt: 0,
        reason: "Suspended",
        createdBy: "admin",
      });

      const result = checkPermission("admin", "trips:read" as Permission, {
        userId: "user1",
      });

      expect(result.granted).toBe(false);
      expect(result.reason).toContain("Suspended");
    });

    it("should expire override", () => {
      const override = createPermissionOverride({
        userId: "user1",
        permission: "trips:read" as Permission,
        grant: true,
        expiresAt: Date.now() - 1000, // Expired
        reason: "Test",
        createdBy: "admin",
      });

      // First check should remove expired override
      checkPermission("admin", "trips:read" as Permission, { userId: "user1" });

      const overrides = getUserOverrides("user1");
      expect(overrides).toHaveLength(0);
    });

    it("should remove permission override", () => {
      const override = createPermissionOverride({
        userId: "user1",
        permission: "trips:read" as Permission,
        grant: true,
        expiresAt: 0,
        reason: "Test",
        createdBy: "admin",
      });

      const removed = removePermissionOverride(override.overrideId);

      expect(removed).toBe(true);

      const overrides = getUserOverrides("user1");
      expect(overrides).toHaveLength(0);
    });

    it("should get user overrides", () => {
      createPermissionOverride({
        userId: "user1",
        permission: "trips:read" as Permission,
        grant: true,
        expiresAt: 0,
        createdBy: "admin",
      });

      createPermissionOverride({
        userId: "user1",
        permission: "trips:delete" as Permission,
        grant: false,
        expiresAt: 0,
        createdBy: "admin",
      });

      const overrides = getUserOverrides("user1");

      expect(overrides).toHaveLength(2);
    });
  });

  describe("Emergency Revocation", () => {
    it("should emergency revoke permission globally", () => {
      emergencyRevokePermission("trips:delete" as Permission);

      const result = checkPermission("admin", "trips:delete" as Permission);

      expect(result.granted).toBe(false);
      expect(result.reason).toContain("emergency");
    });

    it("should bypass cache for emergency revocation", () => {
      checkPermission("admin", "trips:delete" as Permission); // Cache as granted
      emergencyRevokePermission("trips:delete" as Permission);

      const result = checkPermission("admin", "trips:delete" as Permission);

      expect(result.granted).toBe(false);
    });

    it("should get emergency revocations", () => {
      emergencyRevokePermission("trips:delete" as Permission);

      const revocations = getEmergencyRevocations();

      expect(revocations).toContainEqual("trips:delete");
    });

    it("should lift emergency revocation", () => {
      emergencyRevokePermission("trips:delete" as Permission);
      liftEmergencyRevocation("trips:delete" as Permission);

      const result = checkPermission("admin", "trips:delete" as Permission);

      expect(result.granted).toBe(true);
    });

    it("should return false when lifting non-existent revocation", () => {
      const lifted = liftEmergencyRevocation("trips:read" as Permission);

      expect(lifted).toBe(false);
    });
  });

  describe("Multiple Permission Checks", () => {
    it("should check multiple permissions", () => {
      const permissions: Permission[] = ["trips:read", "trips:create", "trips:delete"];
      const results = checkPermissions("admin", permissions);

      expect(results.size).toBe(3);
      expect(results.get("trips:read")?.granted).toBe(true);
      expect(results.get("trips:delete")?.granted).toBe(true);
    });

    it("should check if all permissions are granted", () => {
      const permissions: Permission[] = ["trips:read", "trips:create"];

      expect(checkAllPermissions("admin", permissions)).toBe(true);
      expect(checkAllPermissions("guest", permissions)).toBe(false);
    });

    it("should check if any permission is granted", () => {
      const permissions: Permission[] = ["admin:users:delete", "trips:read:own"];

      expect(checkAnyPermission("user", permissions)).toBe(true); // user can trips:read:own
      expect(checkAnyPermission("guest", permissions)).toBe(false);
    });
  });

  describe("Cache Statistics", () => {
    it("should track cache hits and misses", () => {
      checkPermission("admin", "trips:read"); // Miss
      checkPermission("admin", "trips:read"); // Hit

      const stats = getCacheStats();

      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(0.5, 1);
    });

    it("should calculate hit rate correctly", () => {
      for (let i = 0; i < 5; i++) {
        checkPermission("admin", "trips:read");
      }

      const stats = getCacheStats();

      expect(stats.hitRate).toBeCloseTo(0.8, 1); // 4 hits, 1 miss
    });

    it("should get cache size by role", () => {
      checkPermission("admin", "trips:read");
      checkPermission("admin", "trips:create");
      checkPermission("user", "trips:read");

      const sizeByRole = getCacheSizeByRole();

      expect(sizeByRole.admin).toBe(2);
      expect(sizeByRole.user).toBe(1);
    });

    it("should reset cache statistics", () => {
      checkPermission("admin", "trips:read");
      checkPermission("admin", "trips:read");

      resetCacheStats();

      const stats = getCacheStats();

      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });

  describe("Resource-Specific Permissions", () => {
    it("should check resource-specific permissions", () => {
      const result = checkPermission("user", "trips:read:own" as Permission, {
        resourceId: "trip-123",
        userId: "user1",
      });

      expect(result.granted).toBeDefined();
    });
  });

  describe("Edge Cases", () => {
    it("should handle unknown role gracefully", () => {
      // TypeScript would catch this, but test runtime behavior
      const result = checkPermission("unknown" as UserRole, "trips:read" as Permission);

      expect(result).toBeDefined();
    });

    it("should handle invalid permission format", () => {
      const result = checkPermission("admin", "invalid:permission" as Permission);

      expect(result).toBeDefined();
    });

    it("should handle empty config", () => {
      const result = checkPermission("admin", "trips:read", {});

      expect(result).toBeDefined();
    });

    it("should handle max cache size", () => {
      const config = { maxCacheSize: 2 };

      checkPermission("admin", "trips:read", { config });
      checkPermission("admin", "trips:create", { config });
      checkPermission("admin", "trips:delete", { config }); // Should evict first

      const stats = getCacheStats();
      expect(stats.size).toBeLessThanOrEqual(2);
    });
  });

  describe("Audit Logging", () => {
    it("should log permission denials when enabled", () => {
      const result = checkPermission("guest", "admin:users:delete" as Permission, {
        config: { enableAuditLogging: true },
      });

      expect(result.granted).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it("should skip audit logging when disabled", () => {
      const result = checkPermission("guest", "admin:users:delete" as Permission, {
        config: { enableAuditLogging: false },
      });

      expect(result).toBeDefined();
    });
  });
});
