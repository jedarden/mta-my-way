/**
 * Role-Based Access Control (RBAC) system.
 *
 * Provides:
 * - User role definitions (admin, user, guest)
 * - Granular permission system
 * - Role-to-permission mappings
 * - Role hierarchy with inheritance
 * - RBAC middleware for Hono
 * - Permission checking utilities
 *
 * This module extends the existing scope-based authorization with a more
 * flexible role and permission system that allows for fine-grained access control.
 */

import type { Context, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { logger } from "../observability/logger.js";
import {
  type ApiKey,
  type AuthContext,
  assignRoleToApiKey as authAssignRole,
  getApiKeyPermissions as authGetApiKeyPermissions,
  grantPermissionsToApiKey as authGrantPermissions,
  revokePermissionsFromApiKey as authRevokePermissions,
  getAuthContext,
} from "./authentication.js";
import { securityLogger } from "./security-logging.js";

// Re-export the types from authentication for convenience
export type { UserRole, Permission } from "./authentication.js";

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Resource categories for grouping permissions.
 */
export type ResourceCategory =
  | "trips"
  | "subscriptions"
  | "commutes"
  | "journals"
  | "alerts"
  | "equipment"
  | "predictions"
  | "admin"
  | "oauth"
  | "mfa"
  | "ratelimit";

/**
 * Action types for permissions.
 */
export type PermissionAction = "create" | "read" | "update" | "delete" | "manage";

/**
 * Role definition with permissions and metadata.
 */
export interface RoleDefinition {
  /** Role identifier */
  role: UserRole;
  /** Display name */
  displayName: string;
  /** Description of the role */
  description: string;
  /** Permissions granted to this role */
  permissions: Permission[];
  /** Whether this role can be assigned to users */
  assignable: boolean;
  /** Parent role for inheritance (optional) */
  inheritsFrom?: UserRole;
  /** Priority level for role hierarchy (higher = more privileges) */
  priority: number;
}

/**
 * RBAC configuration options.
 */
export interface RbacOptions {
  /** Whether to allow role inheritance */
  enableInheritance?: boolean;
  /** Whether to log all authorization checks */
  logAuthorizationChecks?: boolean;
  /** Custom permission checker function */
  customPermissionChecker?: (
    context: Context,
    permission: Permission,
    auth: AuthContext
  ) => boolean | Promise<boolean>;
}

// ============================================================================
// Role Definitions
// ============================================================================

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
const ROLE_DEFINITIONS: Map<UserRole, RoleDefinition> = new Map([
  [
    "guest",
    {
      role: "guest",
      displayName: "Guest",
      description: "Unauthenticated users with minimal access",
      permissions: GUEST_PERMISSIONS,
      assignable: true,
      priority: 1,
    },
  ],
  [
    "user",
    {
      role: "user",
      displayName: "User",
      description: "Authenticated users with standard access",
      permissions: USER_PERMISSIONS,
      assignable: true,
      inheritsFrom: "guest",
      priority: 2,
    },
  ],
  [
    "admin",
    {
      role: "admin",
      displayName: "Administrator",
      description: "System administrators with full access",
      permissions: ADMIN_PERMISSIONS,
      assignable: false, // Admin role should be manually assigned
      inheritsFrom: "user",
      priority: 3,
    },
  ],
]);

// ============================================================================
// Permission Utilities
// ============================================================================

/**
 * Parse a permission string into resource and action.
 * Example: "trips:create" -> { resource: "trips", action: "create" }
 */
export function parsePermission(permission: Permission): {
  resource: ResourceCategory;
  action: PermissionAction;
  scope?: "own";
} {
  const parts = permission.split(":");
  if (parts.length < 2) {
    throw new Error(`Invalid permission format: ${permission}`);
  }

  const resource = parts[0] as ResourceCategory;
  const action = parts[1] as PermissionAction;
  const scope = parts[2] as "own" | undefined;

  return { resource, action, scope };
}

/**
 * Build a permission string from components.
 */
export function buildPermission(
  resource: ResourceCategory,
  action: PermissionAction,
  scope?: "own"
): Permission {
  const base = `${resource}:${action}` as Permission;
  return scope ? (`${base}:${scope}` as Permission) : base;
}

/**
 * Get all permissions for a role including inherited permissions.
 */
export function getRolePermissions(role: UserRole): Permission[] {
  const roleDef = ROLE_DEFINITIONS.get(role);
  if (!roleDef) {
    logger.warn("Unknown role requested", { role });
    return [];
  }

  let permissions = [...roleDef.permissions];

  // Include inherited permissions
  if (roleDef.inheritsFrom) {
    const inheritedPermissions = getRolePermissions(roleDef.inheritsFrom);
    permissions = [...new Set([...permissions, ...inheritedPermissions])];
  }

  return permissions;
}

/**
 * Get role definition by role name.
 */
export function getRoleDefinition(role: UserRole): RoleDefinition | undefined {
  return ROLE_DEFINITIONS.get(role);
}

/**
 * Get all role definitions.
 */
export function getAllRoleDefinitions(): RoleDefinition[] {
  return Array.from(ROLE_DEFINITIONS.values());
}

/**
 * Check if a role has a specific permission.
 */
export function roleHasPermission(role: UserRole, permission: Permission): boolean {
  const permissions = getRolePermissions(role);
  return permissions.includes(permission);
}

/**
 * Check if one role has higher priority than another.
 * Returns true if role1 has higher priority than role2.
 */
export function isRoleHigher(role1: UserRole, role2: UserRole): boolean {
  const def1 = ROLE_DEFINITIONS.get(role1);
  const def2 = ROLE_DEFINITIONS.get(role2);

  if (!def1 || !def2) return false;

  return def1.priority > def2.priority;
}

/**
 * Get the highest role from a list of roles.
 */
export function getHighestRole(roles: UserRole[]): UserRole | null {
  if (roles.length === 0) return null;

  let highest = roles[0];
  for (const role of roles) {
    if (isRoleHigher(role, highest)) {
      highest = role;
    }
  }

  return highest;
}

// ============================================================================
// Authorization Context Enhancement
// ============================================================================

/**
 * Extended auth context that includes RBAC role information.
 */
export interface RbacAuthContext extends AuthContext {
  /** User role */
  role?: UserRole;
  /** All roles assigned to the user */
  roles?: UserRole[];
  /** Specific permissions granted to this user (beyond role permissions) */
  additionalPermissions?: Permission[];
}

/**
 * Get RBAC auth context from Hono context.
 */
export function getRbacAuthContext(c: Context): RbacAuthContext | undefined {
  const auth = getAuthContext(c);
  if (!auth) return undefined;

  // Add role information from auth context if available
  return {
    ...auth,
    role: auth.role as UserRole | undefined,
    roles: auth.roles as UserRole[] | undefined,
    additionalPermissions: auth.additionalPermissions as Permission[] | undefined,
  };
}

// ============================================================================
// Permission Checking
// ============================================================================

/**
 * Check if the current context has a specific permission.
 */
export function hasPermission(
  c: Context,
  permission: Permission,
  options?: RbacOptions
): boolean {
  const auth = getRbacAuthContext(c);

  // Unauthenticated users only have guest permissions
  const role = auth?.role || "guest";
  const rolePermissions = getRolePermissions(role);

  // Check role permissions
  if (rolePermissions.includes(permission)) {
    if (options?.logAuthorizationChecks) {
      logger.debug("Permission granted via role", { role, permission });
    }
    return true;
  }

  // Check additional permissions if available
  if (auth?.additionalPermissions?.includes(permission)) {
    if (options?.logAuthorizationChecks) {
      logger.debug("Permission granted via additional permissions", { permission });
    }
    return true;
  }

  if (options?.logAuthorizationChecks) {
    logger.debug("Permission denied", { role, permission });
  }

  return false;
}

/**
 * Check if the current context has any of the specified permissions.
 */
export function hasAnyPermission(
  c: Context,
  permissions: Permission[],
  options?: RbacOptions
): boolean {
  return permissions.some((permission) => hasPermission(c, permission, options));
}

/**
 * Check if the current context has all of the specified permissions.
 */
export function hasAllPermissions(
  c: Context,
  permissions: Permission[],
  options?: RbacOptions
): boolean {
  return permissions.every((permission) => hasPermission(c, permission, options));
}

// ============================================================================
// RBAC Middleware
// ============================================================================

/**
 * Require a specific permission for access.
 *
 * @example
 * ```ts
 * app.post("/trips", requirePermission("trips:create"), async (c) => {
 *   // Handler code
 * });
 * ```
 */
export function requirePermission(
  permission: Permission,
  options?: RbacOptions
): MiddlewareHandler {
  return async (c, next) => {
    const auth = getRbacAuthContext(c);

    if (!auth) {
      securityLogger.logAuthzFailure(c, "rbac", permission);
      throw new HTTPException(401, { message: "Authentication required" });
    }

    // Use custom permission checker if provided
    if (options?.customPermissionChecker) {
      const hasCustomPermission = await options.customPermissionChecker(c, permission, auth);
      if (!hasCustomPermission) {
        securityLogger.logAuthzFailure(c, "rbac", permission);
        throw new HTTPException(403, {
          message: `Permission denied: ${permission}`,
        });
      }
      return next();
    }

    // Standard permission check
    if (!hasPermission(c, permission, options)) {
      securityLogger.logAuthzFailure(c, "rbac", permission);
      throw new HTTPException(403, {
        message: `Permission denied: ${permission}`,
      });
    }

    return next();
  };
}

/**
 * Require any of the specified permissions for access.
 */
export function requireAnyPermission(
  permissions: Permission[],
  options?: RbacOptions
): MiddlewareHandler {
  return async (c, next) => {
    const auth = getRbacAuthContext(c);

    if (!auth) {
      securityLogger.logAuthzFailure(c, "rbac", "any_permission");
      throw new HTTPException(401, { message: "Authentication required" });
    }

    if (!hasAnyPermission(c, permissions, options)) {
      securityLogger.logAuthzFailure(c, "rbac", "any_permission");
      throw new HTTPException(403, {
        message: `Permission denied. Required: ${permissions.join(" or ")}`,
      });
    }

    return next();
  };
}

/**
 * Require all of the specified permissions for access.
 */
export function requireAllPermissions(
  permissions: Permission[],
  options?: RbacOptions
): MiddlewareHandler {
  return async (c, next) => {
    const auth = getRbacAuthContext(c);

    if (!auth) {
      securityLogger.logAuthzFailure(c, "rbac", "all_permissions");
      throw new HTTPException(401, { message: "Authentication required" });
    }

    if (!hasAllPermissions(c, permissions, options)) {
      securityLogger.logAuthzFailure(c, "rbac", "all_permissions");
      throw new HTTPException(403, {
        message: `Permission denied. Required: ${permissions.join(" and ")}`,
      });
    }

    return next();
  };
}

/**
 * Require a specific role for access.
 *
 * @example
 * ```ts
 * app.delete("/admin/users/:id", requireRole("admin"), async (c) => {
 *   // Handler code
 * });
 * ```
 */
export function requireRole(requiredRole: UserRole): MiddlewareHandler {
  return async (c, next) => {
    const auth = getRbacAuthContext(c);

    if (!auth) {
      securityLogger.logAuthzFailure(c, "rbac", requiredRole);
      throw new HTTPException(401, { message: "Authentication required" });
    }

    const userRole = auth.role || "guest";

    // Check if user has the required role or higher
    if (!isRoleHigher(userRole, requiredRole) && userRole !== requiredRole) {
      securityLogger.logAuthzFailure(c, "rbac", requiredRole);
      throw new HTTPException(403, {
        message: `Role required: ${requiredRole}`,
      });
    }

    return next();
  };
}

/**
 * Require at least the specified role level.
 * Allows access to users with the role or any higher-priority role.
 */
export function requireRoleLevel(minRole: UserRole): MiddlewareHandler {
  return async (c, next) => {
    const auth = getRbacAuthContext(c);

    if (!auth) {
      securityLogger.logAuthzFailure(c, "rbac", minRole);
      throw new HTTPException(401, { message: "Authentication required" });
    }

    const userRole = auth.role || "guest";

    // Check if user has at least the minimum required role
    if (!isRoleHigher(userRole, minRole) && userRole !== minRole) {
      securityLogger.logAuthzFailure(c, "rbac", minRole);
      throw new HTTPException(403, {
        message: `Minimum role required: ${minRole}`,
      });
    }

    return next();
  };
}

/**
 * Require ownership of a resource or admin role.
 *
 * This middleware checks if the authenticated user owns the resource
 * being accessed. Admin users bypass the ownership check.
 *
 * @param resourceType - The type of resource being accessed
 * @param ownerIdParam - The parameter name containing the owner ID (default: "userId")
 * @param getOwnerId - Custom function to extract owner ID from context
 */
export function requireOwnershipOrAdmin(
  resourceType: ResourceCategory,
  options?: {
    ownerIdParam?: string;
    getOwnerId?: (c: Context) => string | Promise<string>;
    adminBypass?: boolean;
  }
): MiddlewareHandler {
  const { ownerIdParam = "userId", getOwnerId, adminBypass = true } = options || {};

  return async (c, next) => {
    const auth = getRbacAuthContext(c);

    if (!auth) {
      securityLogger.logAuthzFailure(c, resourceType, "ownership");
      throw new HTTPException(401, { message: "Authentication required" });
    }

    // Admin bypass check
    if (adminBypass && auth.role === "admin") {
      logger.debug("Admin bypass for ownership check", { resourceType });
      return next();
    }

    // Get the owner ID
    let ownerId: string;
    if (getOwnerId) {
      ownerId = await getOwnerId(c);
    } else {
      ownerId = c.req.param(ownerIdParam) || "";
    }

    // Check ownership
    if (auth.keyId !== ownerId) {
      securityLogger.logAuthzFailure(c, resourceType, "ownership");
      throw new HTTPException(403, {
        message: `Access denied: ${resourceType} ownership required`,
      });
    }

    return next();
  };
}

/**
 * Conditional permission check middleware.
 *
 * Executes different middleware based on the user's role.
 * Useful for implementing role-specific behavior.
 *
 * @example
 * ```ts
 * app.get(
 *   "/trips",
 *   conditionalByRole({
 *     admin: adminTripsHandler,
 *     user: userTripsHandler,
 *     guest: guestTripsHandler,
 *   })
 * );
 * ```
 */
export function conditionalByRole(
  handlers: Partial<Record<UserRole, MiddlewareHandler>>
): MiddlewareHandler {
  return async (c, next) => {
    const auth = getRbacAuthContext(c);
    const role = auth?.role || "guest";

    const handler = handlers[role];

    if (handler) {
      return handler(c, next);
    }

    // Fall through to next middleware if no handler for this role
    return next();
  };
}

// ============================================================================
// Role Management Functions
// ============================================================================

/**
 * Assign a role to an API key.
 * Note: In production, this should update a database.
 * This function delegates to the authentication module.
 */
export function assignRoleToApiKey(keyId: string, role: UserRole): boolean {
  const roleDef = ROLE_DEFINITIONS.get(role);
  if (!roleDef || !roleDef.assignable) {
    logger.warn("Attempted to assign non-assignable role", { keyId, role });
    return false;
  }

  return authAssignRole(keyId, role);
}

/**
 * Grant additional permissions to an API key.
 * Note: In production, this should update a database.
 * This function delegates to the authentication module.
 */
export function grantPermissionsToApiKey(
  keyId: string,
  permissions: Permission[]
): boolean {
  return authGrantPermissions(keyId, permissions);
}

/**
 * Revoke additional permissions from an API key.
 * This function delegates to the authentication module.
 */
export function revokePermissionsFromApiKey(
  keyId: string,
  permissions: Permission[]
): boolean {
  return authRevokePermissions(keyId, permissions);
}

/**
 * Get all permissions for an API key (role + additional).
 * This function delegates to the authentication module.
 */
export function getApiKeyPermissions(keyId: string): Permission[] {
  return authGetApiKeyPermissions(keyId);
}

// ============================================================================
// Permission Groups for Common Use Cases
// ============================================================================

/**
 * Permission groups for common functionality areas.
 */
export const PermissionGroups = {
  /** Full trip access (create, read, update, delete, track) */
  TRIPS_FULL: [
    "trips:create",
    "trips:read",
    "trips:update",
    "trips:delete",
    "trips:track",
  ] as Permission[],

  /** Own trip access only */
  TRIPS_OWN: [
    "trips:create",
    "trips:read:own",
    "trips:update:own",
    "trips:delete:own",
    "trips:track:own",
  ] as Permission[],

  /** Full subscription access */
  SUBSCRIPTIONS_FULL: [
    "subscriptions:create",
    "subscriptions:read",
    "subscriptions:update",
    "subscriptions:delete",
  ] as Permission[],

  /** Full admin access */
  ADMIN_FULL: [
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
  ] as Permission[],
} as const;
