/**
 * Tests for the role fixtures in `user-fixtures.ts`.
 *
 * The important properties are that each role fixture is complete and
 * deterministic, that the permission ladders nest the way the server's
 * `roles.ts` defines them (guest ⊂ user ⊂ admin), and that overrides stay
 * whole-field.
 */

import { MOCK_CONTEXT_TIMESTAMP } from "@mta-my-way/shared/testing/middleware";
import {
  ADMIN_USER_PERMISSIONS,
  GUEST_PERMISSIONS,
  REGULAR_USER_PERMISSIONS,
  adminUser,
  createUserFixtures,
  guestUser,
  regularUser,
  userFixtureFor,
} from "@mta-my-way/shared/testing/user-fixtures";
import { describe, expect, it } from "vitest";

describe("adminUser", () => {
  it("returns a complete admin with the expanded permission list", () => {
    const admin = adminUser();

    expect(admin).toEqual({
      id: "user-admin-1",
      username: "admin-rider",
      email: "admin-rider@example.com",
      role: "admin",
      roles: ["admin"],
      permissions: ADMIN_USER_PERMISSIONS,
      active: true,
      createdAt: MOCK_CONTEXT_TIMESTAMP,
    });
  });

  it("carries the admin-only permission family", () => {
    const admin = adminUser();

    expect(admin.permissions).toContain("admin:audit:read");
    expect(admin.permissions).toContain("ratelimit:bypass:tier1");
  });

  it("replaces whole fields, permission arrays included", () => {
    const admin = adminUser({ permissions: ["alerts:read"], active: false });

    expect(admin.permissions).toEqual(["alerts:read"]);
    expect(admin.active).toBe(false);
    expect(admin.role).toBe("admin");
  });
});

describe("regularUser", () => {
  it("returns a complete regular user with the user permission list", () => {
    const user = regularUser();

    expect(user).toEqual({
      id: "user-regular-1",
      username: "test-rider",
      email: "test-rider@example.com",
      role: "user",
      roles: ["user"],
      permissions: REGULAR_USER_PERMISSIONS,
      active: true,
      createdAt: MOCK_CONTEXT_TIMESTAMP,
    });
  });

  it("may manage its own trips but not read anyone else's", () => {
    const user = regularUser();

    expect(user.permissions).toContain("trips:create");
    expect(user.permissions).toContain("trips:read:own");
    expect(user.permissions).not.toContain("trips:read");
  });
});

describe("guestUser", () => {
  it("returns a complete guest with the guest permission list", () => {
    const guest = guestUser();

    expect(guest).toEqual({
      id: "user-guest-1",
      username: "guest-rider",
      email: "guest-rider@example.com",
      role: "guest",
      roles: ["guest"],
      permissions: GUEST_PERMISSIONS,
      active: true,
      createdAt: MOCK_CONTEXT_TIMESTAMP,
    });
  });

  it("reads public data but cannot create trip records", () => {
    const guest = guestUser();

    expect(guest.permissions).toContain("alerts:read");
    expect(guest.permissions).not.toContain("trips:create");
  });
});

describe("permission ladders", () => {
  it("nests guest permissions inside user permissions", () => {
    expect(REGULAR_USER_PERMISSIONS).toEqual(expect.arrayContaining([...GUEST_PERMISSIONS]));
    expect(GUEST_PERMISSIONS.some((p) => !REGULAR_USER_PERMISSIONS.includes(p))).toBe(false);
  });

  it("nests user permissions inside admin permissions", () => {
    expect(ADMIN_USER_PERMISSIONS).toEqual(expect.arrayContaining([...REGULAR_USER_PERMISSIONS]));
  });

  it("keeps each ladder strictly larger than the one below it", () => {
    expect(new Set(GUEST_PERMISSIONS).size).toBeLessThan(new Set(REGULAR_USER_PERMISSIONS).size);
    expect(new Set(REGULAR_USER_PERMISSIONS).size).toBeLessThan(
      new Set(ADMIN_USER_PERMISSIONS).size
    );
  });
});

describe("createUserFixtures", () => {
  it("builds all three roles from one call", () => {
    const { admin, regular, guest } = createUserFixtures();

    expect(admin.role).toBe("admin");
    expect(regular.role).toBe("user");
    expect(guest.role).toBe("guest");
  });

  it("gives each role a distinct identity", () => {
    const { admin, regular, guest } = createUserFixtures();
    const ids = new Set([admin.id, regular.id, guest.id]);

    expect(ids.size).toBe(3);
  });

  it("applies per-role overrides without touching the others", () => {
    const { admin, regular, guest } = createUserFixtures({
      admin: { active: false },
      guest: { permissions: ["alerts:read"] },
    });

    expect(admin.active).toBe(false);
    expect(regular.active).toBe(true);
    expect(guest.permissions).toEqual(["alerts:read"]);
  });

  it("is deterministic across calls", () => {
    expect(createUserFixtures()).toEqual(createUserFixtures());
  });
});

describe("userFixtureFor", () => {
  it("round-trips every role", () => {
    for (const role of ["admin", "user", "guest"] as const) {
      expect(userFixtureFor(role).role).toBe(role);
    }
  });

  it("forwards overrides to the role's builder", () => {
    expect(userFixtureFor("guest", { username: "walk-up" }).username).toBe("walk-up");
  });
});
