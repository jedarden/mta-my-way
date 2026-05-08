/**
 * Tests for role definitions and permissions.
 */

import { describe, expect, it } from "vitest";
import type { Permission, UserRole } from "./authentication.js";
import { getRolePermissions } from "./roles.js";

describe("Role Definitions", () => {
  describe("Guest Role", () => {
    const guestPermissions = getRolePermissions("guest");

    it("includes alerts:read permission", () => {
      expect(guestPermissions).toContain("alerts:read" as Permission);
    });

    it("includes equipment:read permission", () => {
      expect(guestPermissions).toContain("equipment:read" as Permission);
    });

    it("includes predictions:create permission", () => {
      expect(guestPermissions).toContain("predictions:create" as Permission);
    });

    it("includes predictions:read:own permission", () => {
      expect(guestPermissions).toContain("predictions:read:own" as Permission);
    });

    it("includes oauth:authorize permission", () => {
      expect(guestPermissions).toContain("oauth:authorize" as Permission);
    });

    it("does not include trips:create permission", () => {
      expect(guestPermissions).not.toContain("trips:create" as Permission);
    });

    it("does not include subscriptions:create permission", () => {
      expect(guestPermissions).not.toContain("subscriptions:create" as Permission);
    });

    it("does not include admin permissions", () => {
      expect(guestPermissions).not.toContain("admin:users:read" as Permission);
      expect(guestPermissions).not.toContain("admin:system:configure" as Permission);
    });
  });

  describe("User Role", () => {
    const userPermissions = getRolePermissions("user");

    it("includes all guest permissions", () => {
      const guestPermissions = getRolePermissions("guest");
      guestPermissions.forEach((permission) => {
        expect(userPermissions).toContain(permission);
      });
    });

    it("includes trips:create permission", () => {
      expect(userPermissions).toContain("trips:create" as Permission);
    });

    it("includes trips:read:own permission", () => {
      expect(userPermissions).toContain("trips:read:own" as Permission);
    });

    it("includes trips:update:own permission", () => {
      expect(userPermissions).toContain("trips:update:own" as Permission);
    });

    it("includes trips:delete:own permission", () => {
      expect(userPermissions).toContain("trips:delete:own" as Permission);
    });

    it("includes trips:track:own permission", () => {
      expect(userPermissions).toContain("trips:track:own" as Permission);
    });

    it("includes subscriptions:create permission", () => {
      expect(userPermissions).toContain("subscriptions:create" as Permission);
    });

    it("includes subscriptions:read:own permission", () => {
      expect(userPermissions).toContain("subscriptions:read:own" as Permission);
    });

    it("includes commutes:create permission", () => {
      expect(userPermissions).toContain("commutes:create" as Permission);
    });

    it("includes journals:create permission", () => {
      expect(userPermissions).toContain("journals:create" as Permission);
    });

    it("includes mfa:setup permission", () => {
      expect(userPermissions).toContain("mfa:setup" as Permission);
    });

    it("does not include global trips:read permission", () => {
      expect(userPermissions).not.toContain("trips:read" as Permission);
    });

    it("does not include admin permissions", () => {
      expect(userPermissions).not.toContain("admin:users:read" as Permission);
      expect(userPermissions).not.toContain("admin:apikeys:create" as Permission);
    });
  });

  describe("Admin Role", () => {
    const adminPermissions = getRolePermissions("admin");

    it("includes all user permissions", () => {
      const userPermissions = getRolePermissions("user");
      userPermissions.forEach((permission) => {
        expect(adminPermissions).toContain(permission);
      });
    });

    it("includes global trips:read permission", () => {
      expect(adminPermissions).toContain("trips:read" as Permission);
    });

    it("includes global trips:update permission", () => {
      expect(adminPermissions).toContain("trips:update" as Permission);
    });

    it("includes global trips:delete permission", () => {
      expect(adminPermissions).toContain("trips:delete" as Permission);
    });

    it("includes alerts:create permission", () => {
      expect(adminPermissions).toContain("alerts:create" as Permission);
    });

    it("includes equipment:update permission", () => {
      expect(adminPermissions).toContain("equipment:update" as Permission);
    });

    it("includes admin:users:read permission", () => {
      expect(adminPermissions).toContain("admin:users:read" as Permission);
    });

    it("includes admin:users:update permission", () => {
      expect(adminPermissions).toContain("admin:users:update" as Permission);
    });

    it("includes admin:users:delete permission", () => {
      expect(adminPermissions).toContain("admin:users:delete" as Permission);
    });

    it("includes admin:apikeys:create permission", () => {
      expect(adminPermissions).toContain("admin:apikeys:create" as Permission);
    });

    it("includes admin:apikeys:rotate permission", () => {
      expect(adminPermissions).toContain("admin:apikeys:rotate" as Permission);
    });

    it("includes admin:system:configure permission", () => {
      expect(adminPermissions).toContain("admin:system:configure" as Permission);
    });

    it("includes admin:roles:manage permission", () => {
      expect(adminPermissions).toContain("admin:roles:manage" as Permission);
    });

    it("includes oauth:revoke permission", () => {
      expect(adminPermissions).toContain("oauth:revoke" as Permission);
    });

    it("includes mfa:disable permission", () => {
      expect(adminPermissions).toContain("mfa:disable" as Permission);
    });

    it("includes rate limit bypass permissions", () => {
      expect(adminPermissions).toContain("ratelimit:bypass:tier1" as Permission);
      expect(adminPermissions).toContain("ratelimit:bypass:tier2" as Permission);
      expect(adminPermissions).toContain("ratelimit:bypass:tier3" as Permission);
    });
  });
});

describe("Permission Inheritance", () => {
  it("user has more permissions than guest", () => {
    const guestPermissions = getRolePermissions("guest");
    const userPermissions = getRolePermissions("user");

    expect(userPermissions.length).toBeGreaterThan(guestPermissions.length);
  });

  it("admin has more permissions than user", () => {
    const userPermissions = getRolePermissions("user");
    const adminPermissions = getRolePermissions("admin");

    expect(adminPermissions.length).toBeGreaterThan(userPermissions.length);
  });

  it("all permissions are unique within a role", () => {
    const roles: UserRole[] = ["guest", "user", "admin"];

    roles.forEach((role) => {
      const permissions = getRolePermissions(role);
      const uniquePermissions = new Set(permissions);
      expect(permissions.length).toBe(uniquePermissions.size);
    });
  });
});

describe("getRolePermissions", () => {
  it("returns empty array for unknown role", () => {
    const permissions = getRolePermissions("unknown" as UserRole);
    expect(permissions).toEqual([]);
  });

  it("returns consistent results for same role", () => {
    const guest1 = getRolePermissions("guest");
    const guest2 = getRolePermissions("guest");

    expect(guest1).toEqual(guest2);
  });
});

describe("Permission Categories", () => {
  it("guest has read-only permissions for public data", () => {
    const guestPermissions = getRolePermissions("guest");
    const readPermissions = guestPermissions.filter((p) => p.includes(":read"));

    expect(readPermissions.length).toBeGreaterThan(0);
  });

  it("user has create permissions for own resources", () => {
    const userPermissions = getRolePermissions("user");
    const createPermissions = userPermissions.filter((p) => p.includes(":create"));

    expect(createPermissions).toContain("trips:create");
    expect(createPermissions).toContain("subscriptions:create");
    expect(createPermissions).toContain("commutes:create");
    expect(createPermissions).toContain("journals:create");
  });

  it("admin has delete permissions for all resources", () => {
    const adminPermissions = getRolePermissions("admin");
    const deletePermissions = adminPermissions.filter((p) => p.includes(":delete"));

    expect(deletePermissions).toContain("trips:delete");
    expect(deletePermissions).toContain("subscriptions:delete");
    expect(deletePermissions).toContain("commutes:delete");
    expect(deletePermissions).toContain("journals:delete");
  });
});
