/**
 * Named user fixtures for the three roles the server's RBAC recognizes:
 * admin, regular user and guest.
 *
 * {@link createMockUser} in `middleware/execution-context.ts` builds a single
 * user whose shape mirrors the server, but every caller still has to spell out
 * the role, the role array and a plausible permission list. These fixtures are
 * the role-specific presets on top of it: one call yields a complete user
 * whose permission list mirrors the server's own role ladder
 * (`packages/server/src/middleware/roles.ts`), so an RBAC test can assert
 * against real permission strings instead of hand-written ones.
 *
 * Like every builder here, fixtures are deterministic — fixed IDs and the
 * shared fixed epoch — and every field can be overridden whole. A fresh object
 * is returned per call, so two tests can never mutate each other's fixture.
 */

import {
  MOCK_CONTEXT_TIMESTAMP,
  type MockUser,
  type MockUserRole,
  createMockUser,
} from "./middleware/execution-context";

// ============================================================================
// Permission lists
// ============================================================================

/**
 * What a guest may do, mirroring the server's `GUEST_PERMISSIONS`: read public
 * data, create predictions and start an OAuth flow.
 */
export const GUEST_PERMISSIONS = [
  "alerts:read",
  "equipment:read",
  "predictions:create",
  "predictions:read:own",
  "oauth:authorize",
] as const;

/**
 * What a regular user may do, mirroring the server's `USER_PERMISSIONS`:
 * everything a guest may, plus CRUD on their own trips, subscriptions,
 * commutes and journals, plus MFA self-service.
 */
export const REGULAR_USER_PERMISSIONS = [
  ...GUEST_PERMISSIONS,
  "trips:create",
  "trips:read:own",
  "trips:update:own",
  "trips:delete:own",
  "trips:track:own",
  "subscriptions:create",
  "subscriptions:read:own",
  "subscriptions:update:own",
  "subscriptions:delete:own",
  "commutes:create",
  "commutes:read:own",
  "commutes:update:own",
  "commutes:delete:own",
  "journals:create",
  "journals:read:own",
  "journals:update:own",
  "journals:delete:own",
  "mfa:setup",
  "mfa:verify",
] as const;

/**
 * What an admin may do, mirroring the server's `ADMIN_PERMISSIONS`: everything
 * a user may, plus unrestricted access to every user-owned resource, alert and
 * equipment management, the `admin:*` family, and rate-limit bypass.
 *
 * The server expands this role to a literal permission list rather than a
 * `"*"` wildcard, so the fixture carries the expanded list too and an RBAC
 * check against any single permission behaves the same in a test as in
 * production.
 */
export const ADMIN_USER_PERMISSIONS = [
  ...REGULAR_USER_PERMISSIONS,
  "trips:read",
  "trips:update",
  "trips:delete",
  "trips:track",
  "subscriptions:read",
  "subscriptions:update",
  "subscriptions:delete",
  "commutes:read",
  "commutes:update",
  "commutes:delete",
  "journals:read",
  "journals:update",
  "journals:delete",
  "alerts:create",
  "alerts:update",
  "alerts:delete",
  "equipment:update",
  "predictions:read",
  "admin:users:create",
  "admin:users:read",
  "admin:users:update",
  "admin:users:delete",
  "admin:apikeys:read",
  "admin:apikeys:create",
  "admin:apikeys:update",
  "admin:apikeys:delete",
  "admin:apikeys:rotate",
  "admin:sessions:read",
  "admin:sessions:revoke",
  "admin:audit:read",
  "admin:system:configure",
  "admin:roles:manage",
  "oauth:revoke",
  "mfa:disable",
  "ratelimit:bypass:tier1",
  "ratelimit:bypass:tier2",
  "ratelimit:bypass:tier3",
] as const;

// ============================================================================
// Role fixtures
// ============================================================================

/**
 * The admin fixture: highest-weight role, the expanded admin permission list.
 *
 * @param overrides - Fields to replace (each replaces whole, arrays included)
 * @returns A complete admin user
 *
 * @example An admin that was deactivated
 * ```typescript
 * const admin = adminUser({ active: false });
 * ```
 */
export function adminUser(overrides: Partial<MockUser> = {}): MockUser {
  return createMockUser({
    id: "user-admin-1",
    username: "admin-rider",
    email: "admin-rider@example.com",
    role: "admin",
    roles: ["admin"],
    permissions: [...ADMIN_USER_PERMISSIONS],
    createdAt: MOCK_CONTEXT_TIMESTAMP,
    ...overrides,
  });
}

/**
 * The regular user fixture: the standard rider account, and the same defaults
 * {@link createMockUser} produces, made explicit and independently overridable.
 *
 * @param overrides - Fields to replace (each replaces whole, arrays included)
 * @returns A complete regular user
 *
 * @example A user scoped to one trip
 * ```typescript
 * const rider = regularUser({ permissions: ["trips:read:own"] });
 * ```
 */
export function regularUser(overrides: Partial<MockUser> = {}): MockUser {
  return createMockUser({
    id: "user-regular-1",
    username: "test-rider",
    email: "test-rider@example.com",
    role: "user",
    roles: ["user"],
    permissions: [...REGULAR_USER_PERMISSIONS],
    createdAt: MOCK_CONTEXT_TIMESTAMP,
    ...overrides,
  });
}

/**
 * The guest fixture: unauthenticated visitor, lowest privileges.
 *
 * The guest still has an ID because the server attributes audit events to a
 * guest's session identity rather than leaving `performedBy` empty.
 *
 * @param overrides - Fields to replace (each replaces whole, arrays included)
 * @returns A complete guest user
 *
 * @example A guest reading public alerts
 * ```typescript
 * const guest = guestUser();
 * expect(guest.permissions).toContain("alerts:read");
 * expect(guest.permissions).not.toContain("trips:create");
 * ```
 */
export function guestUser(overrides: Partial<MockUser> = {}): MockUser {
  return createMockUser({
    id: "user-guest-1",
    username: "guest-rider",
    email: "guest-rider@example.com",
    role: "guest",
    roles: ["guest"],
    permissions: [...GUEST_PERMISSIONS],
    createdAt: MOCK_CONTEXT_TIMESTAMP,
    ...overrides,
  });
}

// ============================================================================
// Fixture sets
// ============================================================================

/** The three role fixtures together, one field of shared type per role. */
export interface UserFixtureSet {
  /** Highest-privilege account */
  admin: MockUser;
  /** Standard rider account */
  regular: MockUser;
  /** Unauthenticated visitor */
  guest: MockUser;
}

/**
 * Build all three role fixtures at once, each coherent on its own.
 *
 * @param overrides - Per-role overrides; a role given here replaces that
 *   fixture's fields whole, exactly as the single-role builders would
 * @returns Admin, regular and guest fixtures built from one call
 *
 * @example A role matrix test
 * ```typescript
 * const { admin, regular, guest } = createUserFixtures();
 * for (const user of [admin, regular, guest]) {
 *   expect(user.permissions).toContain("alerts:read");
 * }
 * expect(guest.permissions).not.toContain("trips:create");
 * ```
 */
export function createUserFixtures(
  overrides: {
    admin?: Partial<MockUser>;
    regular?: Partial<MockUser>;
    guest?: Partial<MockUser>;
  } = {}
): UserFixtureSet {
  return {
    admin: adminUser(overrides.admin),
    regular: regularUser(overrides.regular),
    guest: guestUser(overrides.guest),
  };
}

/**
 * Look up a role fixture by the role itself, for tests that parameterize over
 * roles rather than hard-coding one fixture per case.
 *
 * @param role - The role to build a fixture for
 * @param overrides - Fields to replace, forwarded to the role's builder
 * @returns The fixture for `role`
 *
 * @example Parameterizing over every role
 * ```typescript
 * for (const role of ["admin", "user", "guest"] as const) {
 *   const user = userFixtureFor(role);
 *   expect(user.role).toBe(role);
 * }
 * ```
 */
export function userFixtureFor(role: MockUserRole, overrides: Partial<MockUser> = {}): MockUser {
  switch (role) {
    case "admin":
      return adminUser(overrides);
    case "guest":
      return guestUser(overrides);
    default:
      return regularUser(overrides);
  }
}
