/**
 * Role definitions and permissions.
 *
 * This module is separated to avoid circular dependencies between
 * authentication.ts and rbac.ts
 */

import type { Permission, UserRole } from "./authentication.js";

/**
 * Guest role - lowest privileges.
 * Guests can only read public data and create their own account.
 */
const GUEST_PERMISSIONS: Permission[] = [
  "alerts:read",
  "equipment:read",
  "predictions:create",
  "predictions:read:own",
  "oauth:authorize",
];

/**
 * User role - standard privileges.
 * Users can manage their own trips, subscriptions, commutes, and journals.
 */
const USER_PERMISSIONS: Permission[] = [
  // All guest permissions
  ...GUEST_PERMISSIONS,
  // Trip permissions
  "trips:create",
  "trips:read:own",
  "trips:update:own",
  "trips:delete:own",
  "trips:track:own",
  // Subscription permissions
  "subscriptions:create",
  "subscriptions:read:own",
  "subscriptions:update:own",
  "subscriptions:delete:own",
  // Commute permissions
  "commutes:create",
  "commutes:read:own",
  "commutes:update:own",
  "commutes:delete:own",
  // Journal permissions
  "journals:create",
  "journals:read:own",
  "journals:update:own",
  "journals:delete:own",
  // MFA
  "mfa:setup",
  "mfa:verify",
];

/**
 * Admin role - highest privileges.
 * Admins have full access to all resources and system configuration.
 */
const ADMIN_PERMISSIONS: Permission[] = [
  // All user permissions
  ...USER_PERMISSIONS,
  // Full trip access
  "trips:read",
  "trips:update",
  "trips:delete",
  "trips:track",
  // Full subscription access
  "subscriptions:read",
  "subscriptions:update",
  "subscriptions:delete",
  // Full commute access
  "commutes:read",
  "commutes:update",
  "commutes:delete",
  // Full journal access
  "journals:read",
  "journals:update",
  "journals:delete",
  // Alert management
  "alerts:create",
  "alerts:update",
  "alerts:delete",
  // Equipment management
  "equipment:update",
  // Full predictions access
  "predictions:read",
  // Admin permissions
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
  // OAuth management
  "oauth:revoke",
  // MFA management
  "mfa:disable",
  // Rate limit bypass
  "ratelimit:bypass:tier1",
  "ratelimit:bypass:tier2",
  "ratelimit:bypass:tier3",
];

/**
 * Role definitions registry.
 */
const ROLE_DEFINITIONS: Map<UserRole, { permissions: Permission[]; inheritsFrom?: UserRole }> =
  new Map([
    [
      "guest",
      {
        permissions: GUEST_PERMISSIONS,
      },
    ],
    [
      "user",
      {
        permissions: USER_PERMISSIONS,
        inheritsFrom: "guest",
      },
    ],
    [
      "admin",
      {
        permissions: ADMIN_PERMISSIONS,
        inheritsFrom: "user",
      },
    ],
  ]);

/**
 * Get all permissions for a given role.
 * Handles role inheritance.
 */
export function getRolePermissions(role: UserRole): Permission[] {
  const roleDef = ROLE_DEFINITIONS.get(role);
  if (!roleDef) return [];

  // Get inherited permissions first
  let permissions: Permission[] = [];
  if (roleDef.inheritsFrom) {
    permissions = getRolePermissions(roleDef.inheritsFrom);
  }

  // Add this role's permissions
  return [...new Set([...permissions, ...roleDef.permissions])];
}
