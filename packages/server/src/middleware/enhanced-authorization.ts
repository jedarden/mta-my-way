/**
 * Enhanced authorization utilities for consistent access control.
 *
 * Provides:
 * - Unified permission checking across resource and action types
 * - Resource-level ownership verification
 * - Batch authorization checks
 * - Authorization context builders
 * - Consistent error handling
 * - Integration with audit logging
 */

import type { Context, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { logAuthorizationFailure, logAuthorizationSuccess, logDataAccess } from "./audit-log.js";
import { type AuthContext, getAuthContext } from "./authentication.js";
import {
  type Permission,
  type RbacAuthContext,
  type UserRole,
  getRbacAuthContext,
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
  requireOwnershipOrAdmin,
  requirePermission,
  requireRole,
} from "./rbac.js";
import { securityLogger } from "./security-logging.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Unified resource action type combining RBAC and legacy authorization.
 */
export type ResourceAction = "create" | "read" | "update" | "delete" | "list" | "admin" | "manage";

/**
 * Resource type with associated permission namespace.
 */
export interface ResourceTypeConfig {
  /** Resource type identifier */
  type: string;
  /** Permission namespace (e.g., "trips" for "trips:create") */
  namespace: string;
  /** Whether this resource supports ownership checks */
  supportsOwnership: boolean;
  /** Default required permissions for each action */
  defaultPermissions: Partial<Record<ResourceAction, Permission>>;
}

/**
 * Authorization check result with detailed context.
 */
export interface AuthorizationCheck {
  /** Whether access is granted */
  allowed: boolean;
  /** Permission required */
  requiredPermission?: Permission;
  /** Required role if permission check failed */
  requiredRole?: UserRole;
  /** Reason for denial */
  reason?: string;
  /** Whether user can access own resources */
  canAccessOwn?: boolean;
}

/**
 * Batch authorization result.
 */
export interface BatchAuthorizationResult {
  /** Results keyed by resource ID */
  results: Map<string, AuthorizationCheck>;
  /** Total allowed */
  allowedCount: number;
  /** Total denied */
  deniedCount: number;
}

/**
 * Owner ID resolver function.
 */
export type OwnerIdResolver = (context: Context) => string | Promise<string>;

// ============================================================================
// Resource Type Registry
// ============================================================================

/**
 * Registry of resource type configurations.
 */
const RESOURCE_TYPES = new Map<string, ResourceTypeConfig>();

/**
 * Register a resource type configuration.
 */
export function registerResourceType(config: ResourceTypeConfig): void {
  RESOURCE_TYPES.set(config.type, config);
}

/**
 * Get resource type configuration.
 */
export function getResourceType(type: string): ResourceTypeConfig | undefined {
  return RESOURCE_TYPES.get(type);
}

/**
 * Initialize default resource types.
 */
function initializeDefaultResourceTypes(): void {
  registerResourceType({
    type: "trip",
    namespace: "trips",
    supportsOwnership: true,
    defaultPermissions: {
      create: "trips:create",
      read: "trips:read:own",
      update: "trips:update:own",
      delete: "trips:delete:own",
      list: "trips:read:own",
    },
  });

  registerResourceType({
    type: "subscription",
    namespace: "subscriptions",
    supportsOwnership: true,
    defaultPermissions: {
      create: "subscriptions:create",
      read: "subscriptions:read:own",
      update: "subscriptions:update:own",
      delete: "subscriptions:delete:own",
      list: "subscriptions:read:own",
    },
  });

  registerResourceType({
    type: "commute",
    namespace: "commutes",
    supportsOwnership: true,
    defaultPermissions: {
      create: "commutes:create",
      read: "commutes:read:own",
      update: "commutes:update:own",
      delete: "commutes:delete:own",
      list: "commutes:read:own",
    },
  });

  registerResourceType({
    type: "journal",
    namespace: "journals",
    supportsOwnership: true,
    defaultPermissions: {
      create: "journals:create",
      read: "journals:read:own",
      update: "journals:update:own",
      delete: "journals:delete:own",
      list: "journals:read:own",
    },
  });

  registerResourceType({
    type: "api_key",
    namespace: "apikeys",
    supportsOwnership: true,
    defaultPermissions: {
      create: "admin:apikeys:create",
      read: "admin:apikeys:read",
      update: "admin:apikeys:update",
      delete: "admin:apikeys:delete",
      list: "admin:apikeys:read",
    },
  });

  registerResourceType({
    type: "user",
    namespace: "users",
    supportsOwnership: false,
    defaultPermissions: {
      create: "admin:users:create",
      read: "admin:users:read",
      update: "admin:users:update",
      delete: "admin:users:delete",
      list: "admin:users:read",
    },
  });

  registerResourceType({
    type: "alert",
    namespace: "alerts",
    supportsOwnership: false,
    defaultPermissions: {
      create: "alerts:create",
      read: "alerts:read",
      update: "alerts:update",
      delete: "alerts:delete",
      list: "alerts:read",
    },
  });

  registerResourceType({
    type: "equipment",
    namespace: "equipment",
    supportsOwnership: false,
    defaultPermissions: {
      read: "equipment:read",
      list: "equipment:read",
    },
  });
}

// Initialize default resource types on module load
initializeDefaultResourceTypes();

// ============================================================================
// Unified Authorization Checking
// ============================================================================

/**
 * Check authorization for a resource action.
 */
export function checkResourceAuthorization(
  c: Context,
  resourceType: string,
  action: ResourceAction,
  options?: {
    /** Resource ID for ownership checks */
    resourceId?: string;
    /** Owner ID resolver for ownership checks */
    ownerIdResolver?: OwnerIdResolver;
    /** Custom permission override */
    customPermission?: Permission;
    /** Whether to check own-data permissions only */
    ownDataOnly?: boolean;
  }
): AuthorizationCheck {
  const auth = getRbacAuthContext(c);
  const resourceConfig = getResourceType(resourceType);

  if (!auth) {
    return {
      allowed: false,
      reason: "Authentication required",
    };
  }

  // Determine required permission
  let requiredPermission: Permission | undefined;
  if (options?.customPermission) {
    requiredPermission = options.customPermission;
  } else if (resourceConfig?.defaultPermissions[action]) {
    requiredPermission = resourceConfig.defaultPermissions[action]!;
  } else {
    // Build permission from namespace
    const namespace = resourceConfig?.namespace || resourceType;
    const suffix = action === "list" ? "read" : action;
    const ownSuffix = options?.ownDataOnly ? ":own" : "";
    requiredPermission = `${namespace}:${suffix}${ownSuffix}` as Permission;
  }

  // Check if user has the required permission
  const hasRequiredPermission = requiredPermission && hasPermission(c, requiredPermission);

  // Check if user has own-data permission as fallback
  const ownPermission = requiredPermission?.includes(":own")
    ? requiredPermission
    : (`${requiredPermission}:own` as Permission);
  const hasOwnPermission = ownPermission && hasPermission(c, ownPermission);

  if (hasRequiredPermission) {
    return {
      allowed: true,
      requiredPermission,
    };
  }

  // Check ownership for resources that support it
  if (resourceConfig?.supportsOwnership && hasOwnPermission) {
    return {
      allowed: true,
      requiredPermission: ownPermission,
      canAccessOwn: true,
    };
  }

  // Build detailed denial reason
  const result: AuthorizationCheck = {
    allowed: false,
    requiredPermission,
    canAccessOwn: hasOwnPermission,
  };

  if (!requiredPermission) {
    result.reason = `No permission defined for ${resourceType}:${action}`;
  } else {
    // Determine what role/permission would grant access
    result.reason = `Permission required: ${requiredPermission}`;

    // Suggest what's needed for own data access
    if (hasOwnPermission) {
      result.reason += " (own data only)";
    }
  }

  return result;
}

/**
 * Require authorization for a resource action.
 * Throws HTTPException if authorization fails.
 */
export function requireResourceAuthorization(
  resourceType: string,
  action: ResourceAction,
  options?: {
    /** Resource ID for ownership checks */
    resourceId?: string;
    /** Owner ID resolver for ownership checks */
    ownerIdResolver?: OwnerIdResolver;
    /** Custom permission override */
    customPermission?: Permission;
    /** Whether to check own-data permissions only */
    ownDataOnly?: boolean;
    /** Whether to log authorization attempts */
    logAttempt?: boolean;
  }
): MiddlewareHandler {
  return async (c, next) => {
    const check = checkResourceAuthorization(c, resourceType, action, options);

    if (!check.allowed) {
      // Log the failed authorization
      if (options?.logAttempt !== false) {
        logAuthorizationFailure(c, resourceType, action, check.reason);
      }

      throw new HTTPException(check.requiredPermission ? 403 : 401, {
        message: check.reason || "Access denied",
      });
    }

    // Log successful authorization
    if (options?.logAttempt !== false) {
      logAuthorizationSuccess(c, resourceType, action);
    }

    // For own-data access, verify ownership if resource ID is provided
    if (check.canAccessOwn && options?.resourceId) {
      const auth = getRbacAuthContext(c);
      const ownerId = options.ownerIdResolver
        ? await options.ownerIdResolver(c)
        : auth?.keyId || "anonymous";

      // If the resource ID doesn't match the owner ID, deny access
      if (options.resourceId !== ownerId) {
        logAuthorizationFailure(c, resourceType, action, "Resource ownership required");
        throw new HTTPException(403, {
          message: "You can only access your own resources",
        });
      }
    }

    return next();
  };
}

/**
 * Require ownership of a resource with flexible ownership verification.
 */
export function requireResourceOwnership(
  resourceType: string,
  options: {
    /** Resource ID parameter name */
    resourceIdParam?: string;
    /** Custom owner ID resolver */
    ownerIdResolver?: OwnerIdResolver;
    /** Whether admin bypass is allowed */
    adminBypass?: boolean;
  } = {}
): MiddlewareHandler {
  const { resourceIdParam = "id", ownerIdResolver, adminBypass = true } = options;

  return async (c, next) => {
    const auth = getRbacAuthContext(c);

    if (!auth) {
      throw new HTTPException(401, { message: "Authentication required" });
    }

    // Admin bypass
    if (adminBypass && auth.role === "admin") {
      return next();
    }

    // Get owner ID
    let ownerId: string;
    if (ownerIdResolver) {
      ownerId = await ownerIdResolver(c);
    } else {
      ownerId = c.req.param(resourceIdParam) || "";
    }

    // Check ownership
    if (auth.keyId !== ownerId && ownerId !== "anonymous") {
      logDataAccess(c, resourceType, "access", ownerId, false);
      throw new HTTPException(403, {
        message: "You can only access your own resources",
      });
    }

    logDataAccess(c, resourceType, "access", ownerId, true);
    return next();
  };
}

// ============================================================================
// Batch Authorization
// ============================================================================

/**
 * Check authorization for multiple resources at once.
 */
export function checkBatchAuthorization(
  c: Context,
  resourceType: string,
  action: ResourceAction,
  resourceIds: string[]
): BatchAuthorizationResult {
  const results = new Map<string, AuthorizationCheck>();
  let allowedCount = 0;
  let deniedCount = 0;

  for (const resourceId of resourceIds) {
    const check = checkResourceAuthorization(c, resourceType, action, {
      resourceId,
      ownDataOnly: true,
    });

    results.set(resourceId, check);

    if (check.allowed) {
      allowedCount++;
    } else {
      deniedCount++;
    }
  }

  return {
    results,
    allowedCount,
    deniedCount,
  };
}

/**
 * Filter resources based on authorization.
 */
export function filterAuthorizedResources<T extends { id: string }>(
  c: Context,
  resourceType: string,
  action: ResourceAction,
  resources: T[]
): T[] {
  const auth = getRbacAuthContext(c);

  // Admins see everything
  if (auth?.role === "admin") {
    return resources;
  }

  // For regular users, filter by ownership
  const resourceConfig = getResourceType(resourceType);
  if (resourceConfig?.supportsOwnership) {
    return resources.filter((r) => r.id === auth?.keyId || r.id.startsWith(auth?.keyId || ""));
  }

  // For non-owned resources, check permission
  const check = checkResourceAuthorization(c, resourceType, action);
  return check.allowed ? resources : [];
}

// ============================================================================
// Authorization Context Builders
// ============================================================================

/**
 * Create an authorization context for use in handlers.
 */
export function createAuthorizationContext(c: Context): {
  auth: RbacAuthContext | undefined;
  isAuthenticated: boolean;
  isAdmin: boolean;
  can: (permission: Permission) => boolean;
  canAny: (permissions: Permission[]) => boolean;
  canAll: (permissions: Permission[]) => boolean;
  canAccessResource: (
    resourceType: string,
    action: ResourceAction,
    resourceId?: string
  ) => AuthorizationCheck;
  isOwner: (resourceId: string) => boolean;
} {
  const auth = getRbacAuthContext(c);

  return {
    auth,
    isAuthenticated: !!auth,
    isAdmin: auth?.role === "admin",
    can: (permission: Permission) => hasPermission(c, permission),
    canAny: (permissions: Permission[]) => hasAnyPermission(c, permissions),
    canAll: (permissions: Permission[]) => hasAllPermissions(c, permissions),
    canAccessResource: (resourceType: string, action: ResourceAction, resourceId?: string) =>
      checkResourceAuthorization(c, resourceType, action, { resourceId }),
    isOwner: (resourceId: string) => auth?.keyId === resourceId || auth?.keyId === "admin",
  };
}

/**
 * Middleware to attach authorization context to the request.
 */
export function withAuthorizationContext(): MiddlewareHandler {
  return async (c, next) => {
    const authz = createAuthorizationContext(c);
    c.set("authz", authz);
    return next();
  };
}

/**
 * Get authorization context from request.
 */
export function getAuthorizationContext(
  c: Context
): ReturnType<typeof createAuthorizationContext> | undefined {
  return c.get("authz");
}

// ============================================================================
// Re-exports for convenience
// ============================================================================

export {
  getRbacAuthContext,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  requirePermission,
  requireRole,
  requireOwnershipOrAdmin,
  type Permission,
  type RbacAuthContext,
  type UserRole,
} from "./rbac.js";
