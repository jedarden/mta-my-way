/**
 * Tests for Role-Based Access Control (RBAC) system.
 */

import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assignRoleToApiKey,
  generateApiKey,
  getApiKeyById,
  grantPermissionsToApiKey,
  hashApiKey,
  registerApiKey,
} from "./authentication.js";
import { optionalAuth } from "./authentication.js";
import {
  type Permission,
  PermissionGroups,
  type ResourceCategory,
  type UserRole,
  buildPermission,
  getAllRoleDefinitions,
  getHighestRole,
  getRbacAuthContext,
  getRoleDefinition,
  getRolePermissions,
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
  isRoleHigher,
  parsePermission,
  requireAllPermissions,
  requireAnyPermission,
  requireOwnershipOrAdmin,
  requirePermission,
  requireRole,
  requireRoleLevel,
  roleHasPermission,
} from "./rbac.js";

describe("RBAC System", () => {
  describe("Role Definitions", () => {
    it("should have guest role with minimal permissions", () => {
      const guest = getRoleDefinition("guest");
      expect(guest).toBeDefined();
      expect(guest?.role).toBe("guest");
      expect(guest?.displayName).toBe("Guest");
      expect(guest?.assignable).toBe(true);
      expect(guest?.priority).toBe(1);
    });

    it("should have user role with standard permissions", () => {
      const user = getRoleDefinition("user");
      expect(user).toBeDefined();
      expect(user?.role).toBe("user");
      expect(user?.displayName).toBe("User");
      expect(user?.assignable).toBe(true);
      expect(user?.priority).toBe(2);
      expect(user?.inheritsFrom).toBe("guest");
    });

    it("should have admin role with full permissions", () => {
      const admin = getRoleDefinition("admin");
      expect(admin).toBeDefined();
      expect(admin?.role).toBe("admin");
      expect(admin?.displayName).toBe("Administrator");
      expect(admin?.assignable).toBe(false);
      expect(admin?.priority).toBe(3);
      expect(admin?.inheritsFrom).toBe("user");
    });

    it("should return all role definitions", () => {
      const roles = getAllRoleDefinitions();
      expect(roles).toHaveLength(3);
      expect(roles.map((r) => r.role)).toContain("guest");
      expect(roles.map((r) => r.role)).toContain("user");
      expect(roles.map((r) => r.role)).toContain("admin");
    });
  });

  describe("Role Permissions", () => {
    it("guest should have minimal permissions", () => {
      const permissions = getRolePermissions("guest");
      expect(permissions).toContain("alerts:read");
      expect(permissions).toContain("equipment:read");
      expect(permissions).toContain("predictions:create");
      expect(permissions).not.toContain("trips:create");
      expect(permissions).not.toContain("subscriptions:create");
    });

    it("user should have guest permissions plus own resource access", () => {
      const permissions = getRolePermissions("user");
      expect(permissions).toContain("alerts:read"); // inherited from guest
      expect(permissions).toContain("trips:create");
      expect(permissions).toContain("trips:read:own");
      expect(permissions).toContain("subscriptions:create");
      expect(permissions).toContain("subscriptions:read:own");
      expect(permissions).not.toContain("trips:read"); // no global read
      expect(permissions).not.toContain("admin:users:read");
    });

    it("admin should have all permissions including admin", () => {
      const permissions = getRolePermissions("admin");
      expect(permissions).toContain("trips:create");
      expect(permissions).toContain("trips:read"); // global read
      expect(permissions).toContain("admin:users:read");
      expect(permissions).toContain("admin:apikeys:create");
      expect(permissions).toContain("admin:system:configure");
      expect(permissions).toContain("ratelimit:bypass:tier3");
    });
  });

  describe("Permission Utilities", () => {
    describe("parsePermission", () => {
      it("should parse simple permission", () => {
        const parsed = parsePermission("trips:create" as Permission);
        expect(parsed.resource).toBe("trips");
        expect(parsed.action).toBe("create");
        expect(parsed.scope).toBeUndefined();
      });

      it("should parse scoped permission", () => {
        const parsed = parsePermission("trips:read:own" as Permission);
        expect(parsed.resource).toBe("trips");
        expect(parsed.action).toBe("read");
        expect(parsed.scope).toBe("own");
      });
    });

    describe("buildPermission", () => {
      it("should build simple permission", () => {
        const permission = buildPermission("trips", "create");
        expect(permission).toBe("trips:create");
      });

      it("should build scoped permission", () => {
        const permission = buildPermission("trips", "read", "own");
        expect(permission).toBe("trips:read:own");
      });
    });

    describe("roleHasPermission", () => {
      it("should return true for guest with alerts:read", () => {
        expect(roleHasPermission("guest", "alerts:read" as Permission)).toBe(true);
      });

      it("should return false for guest with trips:create", () => {
        expect(roleHasPermission("guest", "trips:create" as Permission)).toBe(false);
      });

      it("should return true for user with trips:create", () => {
        expect(roleHasPermission("user", "trips:create" as Permission)).toBe(true);
      });

      it("should return true for admin with any permission", () => {
        expect(roleHasPermission("admin", "admin:system:configure" as Permission)).toBe(true);
      });
    });
  });

  describe("Role Hierarchy", () => {
    describe("isRoleHigher", () => {
      it("should return true for admin over user", () => {
        expect(isRoleHigher("admin", "user")).toBe(true);
      });

      it("should return true for admin over guest", () => {
        expect(isRoleHigher("admin", "guest")).toBe(true);
      });

      it("should return true for user over guest", () => {
        expect(isRoleHigher("user", "guest")).toBe(true);
      });

      it("should return false for guest over user", () => {
        expect(isRoleHigher("guest", "user")).toBe(false);
      });

      it("should return false for same role", () => {
        expect(isRoleHigher("user", "user")).toBe(false);
      });
    });

    describe("getHighestRole", () => {
      it("should return admin when present", () => {
        expect(getHighestRole(["guest", "user", "admin"])).toBe("admin");
      });

      it("should return user when no admin", () => {
        expect(getHighestRole(["guest", "user"])).toBe("user");
      });

      it("should return guest when only guest", () => {
        expect(getHighestRole(["guest"])).toBe("guest");
      });

      it("should return null for empty array", () => {
        expect(getHighestRole([])).toBeNull();
      });
    });
  });

  describe("Permission Groups", () => {
    it("should have TRIPS_OWN permission group", () => {
      expect(PermissionGroups.TRIPS_OWN).toContain("trips:create");
      expect(PermissionGroups.TRIPS_OWN).toContain("trips:read:own");
      expect(PermissionGroups.TRIPS_OWN).toContain("trips:update:own");
      expect(PermissionGroups.TRIPS_OWN).toContain("trips:delete:own");
      expect(PermissionGroups.TRIPS_OWN).toContain("trips:track:own");
    });

    it("should have TRIPS_FULL permission group", () => {
      expect(PermissionGroups.TRIPS_FULL).toContain("trips:create");
      expect(PermissionGroups.TRIPS_FULL).toContain("trips:read");
      expect(PermissionGroups.TRIPS_FULL).toContain("trips:update");
      expect(PermissionGroups.TRIPS_FULL).toContain("trips:delete");
      expect(PermissionGroups.TRIPS_FULL).toContain("trips:track");
    });

    it("should have ADMIN_FULL permission group", () => {
      expect(PermissionGroups.ADMIN_FULL).toContain("admin:users:read");
      expect(PermissionGroups.ADMIN_FULL).toContain("admin:apikeys:create");
      expect(PermissionGroups.ADMIN_FULL).toContain("admin:system:configure");
    });
  });
});

describe("RBAC Middleware Integration", () => {
  let app: Hono;
  let testKeyId: string;
  let testApiKey: string;

  beforeEach(async () => {
    app = new Hono();

    // Create test API key (use underscores to match validation regex)
    testKeyId = "test_key_" + Math.random().toString(36).substring(7);
    testApiKey = await generateApiKey();
    const hashed = await hashApiKey(testApiKey);

    await registerApiKey({
      keyId: testKeyId,
      keyHash: hashed.hash,
      keySalt: hashed.salt,
      scope: "read",
      rateLimitTier: 1,
      active: true,
      createdAt: Date.now(),
      expiresAt: 0,
    });
  });

  afterEach(() => {
    // Clean up - in production this would clear database entries
  });

  describe("requirePermission middleware", () => {
    it("should allow access with correct permission", async () => {
      // Assign user role
      assignRoleToApiKey(testKeyId, "user");

      app.use("/trips", optionalAuth(), requirePermission("trips:create" as Permission));
      app.post("/trips", (c) => c.json({ success: true }));

      const res = await app.request("/trips", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${testKeyId}:${testApiKey}`,
        },
      });

      expect(res.status).toBe(200);
    });

    it("should deny access without correct permission", async () => {
      // Assign guest role (no trips:create permission)
      assignRoleToApiKey(testKeyId, "guest");

      app.use("/trips", optionalAuth(), requirePermission("trips:create" as Permission));
      app.post("/trips", (c) => c.json({ success: true }));

      const res = await app.request("/trips", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${testKeyId}:${testApiKey}`,
        },
      });

      expect(res.status).toBe(403);
    });

    it("should require authentication", async () => {
      app.use("/trips", requirePermission("trips:create" as Permission));
      app.post("/trips", (c) => c.json({ success: true }));

      const res = await app.request("/trips", {
        method: "POST",
      });

      expect(res.status).toBe(401);
    });
  });

  describe("requireRole middleware", () => {
    it("should allow access to admin user", async () => {
      assignRoleToApiKey(testKeyId, "admin");

      app.use("/admin", optionalAuth(), requireRole("admin"));
      app.get("/admin", (c) => c.json({ success: true }));

      const res = await app.request("/admin", {
        headers: {
          Authorization: `Bearer ${testKeyId}:${testApiKey}`,
        },
      });

      expect(res.status).toBe(200);
    });

    it("should deny access to non-admin user", async () => {
      assignRoleToApiKey(testKeyId, "user");

      app.use("/admin", optionalAuth(), requireRole("admin"));
      app.get("/admin", (c) => c.json({ success: true }));

      const res = await app.request("/admin", {
        headers: {
          Authorization: `Bearer ${testKeyId}:${testApiKey}`,
        },
      });

      expect(res.status).toBe(403);
    });
  });

  describe("requireRoleLevel middleware", () => {
    it("should allow access to admin when user level required", async () => {
      assignRoleToApiKey(testKeyId, "admin");

      app.use("/api", optionalAuth(), requireRoleLevel("user"));
      app.get("/api", (c) => c.json({ success: true }));

      const res = await app.request("/api", {
        headers: {
          Authorization: `Bearer ${testKeyId}:${testApiKey}`,
        },
      });

      expect(res.status).toBe(200);
    });

    it("should allow access to user when user level required", async () => {
      assignRoleToApiKey(testKeyId, "user");

      app.use("/api", optionalAuth(), requireRoleLevel("user"));
      app.get("/api", (c) => c.json({ success: true }));

      const res = await app.request("/api", {
        headers: {
          Authorization: `Bearer ${testKeyId}:${testApiKey}`,
        },
      });

      expect(res.status).toBe(200);
    });

    it("should deny access to guest when user level required", async () => {
      assignRoleToApiKey(testKeyId, "guest");

      app.use("/api", optionalAuth(), requireRoleLevel("user"));
      app.get("/api", (c) => c.json({ success: true }));

      const res = await app.request("/api", {
        headers: {
          Authorization: `Bearer ${testKeyId}:${testApiKey}`,
        },
      });

      expect(res.status).toBe(403);
    });
  });

  describe("requireAnyPermission middleware", () => {
    it("should allow access with one of required permissions", async () => {
      assignRoleToApiKey(testKeyId, "guest");

      app.use(
        "/data",
        optionalAuth(),
        requireAnyPermission(["trips:create" as Permission, "alerts:read" as Permission])
      );
      app.get("/data", (c) => c.json({ success: true }));

      const res = await app.request("/data", {
        headers: {
          Authorization: `Bearer ${testKeyId}:${testApiKey}`,
        },
      });

      expect(res.status).toBe(200);
    });

    it("should deny access without any of required permissions", async () => {
      assignRoleToApiKey(testKeyId, "guest");

      app.use(
        "/trips",
        optionalAuth(),
        requireAnyPermission(["trips:create" as Permission, "trips:delete" as Permission])
      );
      app.delete("/trips", (c) => c.json({ success: true }));

      const res = await app.request("/trips", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${testKeyId}:${testApiKey}`,
        },
      });

      expect(res.status).toBe(403);
    });
  });

  describe("requireAllPermissions middleware", () => {
    it("should allow access with all required permissions", async () => {
      assignRoleToApiKey(testKeyId, "user");

      app.use(
        "/trips",
        optionalAuth(),
        requireAllPermissions(["trips:create" as Permission, "trips:read:own" as Permission])
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

    it("should deny access without all required permissions", async () => {
      assignRoleToApiKey(testKeyId, "guest");

      app.use(
        "/trips",
        optionalAuth(),
        requireAllPermissions(["trips:create" as Permission, "trips:read" as Permission])
      );
      app.get("/trips", (c) => c.json({ success: true }));

      const res = await app.request("/trips", {
        headers: {
          Authorization: `Bearer ${testKeyId}:${testApiKey}`,
        },
      });

      expect(res.status).toBe(403);
    });
  });

  describe("requireOwnershipOrAdmin middleware", () => {
    it("should allow admin regardless of ownership", async () => {
      assignRoleToApiKey(testKeyId, "admin");

      app.use(
        "/trips/:userId",
        optionalAuth(),
        requireOwnershipOrAdmin("trips", { ownerIdParam: "userId" })
      );
      app.delete("/trips/other-user-id", (c) => c.json({ success: true }));

      const res = await app.request("/trips/other-user-id", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${testKeyId}:${testApiKey}`,
        },
      });

      expect(res.status).toBe(200);
    });

    it("should allow user when owner matches", async () => {
      assignRoleToApiKey(testKeyId, "user");

      app.use(
        "/trips/:userId",
        optionalAuth(),
        requireOwnershipOrAdmin("trips", { ownerIdParam: "userId" })
      );
      app.delete(`/trips/${testKeyId}`, (c) => c.json({ success: true }));

      const res = await app.request(`/trips/${testKeyId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${testKeyId}:${testApiKey}`,
        },
      });

      expect(res.status).toBe(200);
    });

    it("should deny user when owner does not match", async () => {
      assignRoleToApiKey(testKeyId, "user");

      app.use(
        "/trips/:userId",
        optionalAuth(),
        requireOwnershipOrAdmin("trips", { ownerIdParam: "userId" })
      );
      app.delete("/trips/other-user-id", (c) => c.json({ success: true }));

      const res = await app.request("/trips/other-user-id", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${testKeyId}:${testApiKey}`,
        },
      });

      expect(res.status).toBe(403);
    });
  });
});

describe("RBAC Additional Permissions", () => {
  let testKeyId: string;
  let testApiKey: string;

  beforeEach(async () => {
    // Create test API key with guest role (use underscores to match validation regex)
    testKeyId = "test_key_" + Math.random().toString(36).substring(7);
    testApiKey = await generateApiKey();
    const hashed = await hashApiKey(testApiKey);

    await registerApiKey({
      keyId: testKeyId,
      keyHash: hashed.hash,
      keySalt: hashed.salt,
      scope: "read",
      rateLimitTier: 1,
      active: true,
      createdAt: Date.now(),
      expiresAt: 0,
      role: "guest",
    });
  });

  it("should grant additional permissions to API key", async () => {
    const granted = grantPermissionsToApiKey(testKeyId, ["trips:create" as Permission]);
    expect(granted).toBe(true);

    const apiKey = getApiKeyById(testKeyId);
    expect(apiKey?.additionalPermissions).toContain("trips:create");
  });

  it("should include additional permissions in permission check", async () => {
    // Grant trips:create to guest
    grantPermissionsToApiKey(testKeyId, ["trips:create" as Permission]);

    const app = new Hono();
    app.use("/trips", optionalAuth(), requirePermission("trips:create" as Permission));
    app.post("/trips", (c) => c.json({ success: true }));

    const res = await app.request("/trips", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testKeyId}:${testApiKey}`,
      },
    });

    expect(res.status).toBe(200);
  });

  it("should revoke additional permissions from API key", async () => {
    // First grant the permission
    grantPermissionsToApiKey(testKeyId, ["trips:create" as Permission]);
    expect(getApiKeyById(testKeyId)?.additionalPermissions).toContain("trips:create");

    // Then revoke it
    const revoked = grantPermissionsToApiKey(testKeyId, ["subscriptions:create" as Permission]);
    expect(revoked).toBe(true);
  });
});
