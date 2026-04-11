/**
 * Authorization middleware for fine-grained access control.
 *
 * Provides:
 * - Resource-based access control (ownership verification)
 * - Action-based permissions (create, read, update, delete)
 * - Cross-origin request protection for state-changing operations
 * - Rate limit tier enforcement
 * - Admin-only operations protection
 * - Data access validation (user-scoped data isolation)
 * - Scope restriction helpers for filtering user data
 */

import type { Context, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { logger } from "../observability/logger.js";
import { type ApiKeyScope, type AuthContext, getAuthContext } from "./authentication.js";
import { securityLogger } from "./security-logging.js";

// Re-export RBAC types for compatibility
export type { PermissionAction, ResourceType, ResourcePolicy, AuthorizationResult };

// ============================================================================
// Types
// ============================================================================

/**
 * Permission action types for resource-based access control.
 */
export type PermissionAction = "create" | "read" | "update" | "delete" | "admin";

/**
 * Resource types that can be protected.
 */
export type ResourceType =
  | "trip"
  | "subscription"
  | "context"
  | "commute"
  | "journal"
  | "alert"
  | "equipment"
  | "prediction"
  | "admin";

/**
 * Resource access policy - defines who can access what.
 */
export interface ResourcePolicy {
  /** Resource type */
  resourceType: ResourceType;
  /** Required action */
  action: PermissionAction;
  /** Whether admin scope bypasses ownership checks */
  adminBypass?: boolean;
  /** Custom access check function */
  customCheck?: (context: Context, auth: AuthContext) => boolean | Promise<boolean>;
}

/**
 * Authorization result with detailed reason for denial.
 */
export interface AuthorizationResult {
  /** Whether access is granted */
  allowed: boolean;
  /** Reason for denial (if denied) */
  reason?: string;
  /** Required scope/permission (if denied) */
  required?: string;
}

// ============================================================================
// Resource ID Extraction Utilities
// ============================================================================

/**
 * Extract resource owner ID from various resource types.
 * This validates that the authenticated user owns the resource being accessed.
 */
export interface ResourceOwner {
  /** Owner identifier (e.g., subscription endpoint, trip ID with embedded user info) */
  ownerId: string;
  /** Whether the resource is public */
  isPublic: boolean;
}

/**
 * Extract owner identifier from a push subscription endpoint.
 * The endpoint itself serves as the owner identifier since it's unique per device.
 */
function _extractSubscriptionOwner(endpoint: string): ResourceOwner {
  return { ownerId: endpoint, isPublic: false };
}

/**
 * Extract owner identifier from a trip ID.
 * For manual trips, the trip ID contains a timestamp-based component.
 * For API-tracked trips, ownership should be validated via session.
 */
function _extractTripOwner(tripId: string): ResourceOwner {
  // Trip IDs are UUIDs - ownership is validated via database lookup
  // In a real system, trips would have a userId field
  return { ownerId: tripId, isPublic: false };
}

/**
 * Extract owner from a commute ID.
 */
function _extractCommuteOwner(commuteId: string): ResourceOwner {
  return { ownerId: commuteId, isPublic: false };
}

// ============================================================================
// Authorization Middleware
// ============================================================================

/**
 * Verify that the authenticated user has access to a specific resource.
 * Used for operations on specific user-owned resources (trips, subscriptions, etc.).
 */
export function requireResourceAccess(
  resourceType: ResourceType,
  action: PermissionAction,
  options: {
    /** Admin scope bypasses ownership checks */
    adminBypass?: boolean;
    /** Custom access check function */
    customCheck?: (context: Context, auth: AuthContext) => boolean | Promise<boolean>;
    /** Resource ID parameter name (for extracting from route params) */
    resourceIdParam?: string;
  } = {}
): MiddlewareHandler {
  const { adminBypass = true, customCheck } = options;

  return async (c, next) => {
    const auth = getAuthContext(c);

    // Must be authenticated
    if (!auth) {
      securityLogger.logAuthzFailure(c, resourceType, action);
      throw new HTTPException(401, { message: "Authentication required" });
    }

    // Admin bypass check
    if (adminBypass && auth.scope === "admin") {
      logger.info("Admin bypass for resource access", {
        keyId: auth.keyId,
        resourceType,
        action,
      });
      return next();
    }

    // Scope-based authorization check
    const scopeLevels: Record<ApiKeyScope, number> = { read: 1, write: 2, admin: 3 };
    const requiredScopeForAction: Record<PermissionAction, ApiKeyScope> = {
      create: "write",
      read: "read",
      update: "write",
      delete: "write",
      admin: "admin",
    };

    const requiredScope = requiredScopeForAction[action];
    if (scopeLevels[auth.scope] < scopeLevels[requiredScope]) {
      securityLogger.logAuthzFailure(c, resourceType, action);
      throw new HTTPException(403, {
        message: `Insufficient permissions. Required scope: ${requiredScope}`,
      });
    }

    // Custom access check if provided
    if (customCheck) {
      const hasAccess = await customCheck(c, auth);
      if (!hasAccess) {
        securityLogger.logAuthzFailure(c, resourceType, action);
        throw new HTTPException(403, {
          message: "Access denied to this resource",
        });
      }
    }

    return next();
  };
}

/**
 * Require admin scope for privileged operations.
 * Use for operations that affect system configuration or other users.
 */
export function requireAdmin(): MiddlewareHandler {
  return async (c, next) => {
    const auth = getAuthContext(c);

    if (!auth) {
      securityLogger.logAuthzFailure(c, "admin", "admin");
      throw new HTTPException(401, { message: "Authentication required" });
    }

    if (auth.scope !== "admin") {
      securityLogger.logAuthzFailure(c, "admin", "admin");
      throw new HTTPException(403, {
        message: "Admin privileges required",
      });
    }

    logger.info("Admin operation authorized", { keyId: auth.keyId });
    return next();
  };
}

/**
 * Require write scope for state-changing operations.
 * Use as a simpler alternative to requireResourceAccess for general write operations.
 */
export function requireWrite(): MiddlewareHandler {
  return async (c, next) => {
    const auth = getAuthContext(c);

    if (!auth) {
      securityLogger.logAuthzFailure(c, "api", "write");
      throw new HTTPException(401, { message: "Authentication required" });
    }

    const scopeLevels: Record<ApiKeyScope, number> = { read: 1, write: 2, admin: 3 };
    if (scopeLevels[auth.scope] < 2) {
      securityLogger.logAuthzFailure(c, "api", "write");
      throw new HTTPException(403, {
        message: "Write permissions required",
      });
    }

    return next();
  };
}

/**
 * Optional authorization - attaches auth context if present but doesn't require it.
 * Use for endpoints that have enhanced features for authenticated users.
 *
 * Note: This is already provided by authentication.ts but re-exported for convenience.
 */
export { optionalAuth, isAuthenticated } from "./authentication.js";

/**
 * Rate limit tier enforcement.
 * Ensures API key rate limits are respected based on assigned tier.
 */
export function enforceRateLimitTier(maxTier?: number): MiddlewareHandler {
  return async (c, next) => {
    const auth = getAuthContext(c);

    if (!auth) {
      // Unauthenticated requests use default rate limiting (middleware level)
      return next();
    }

    // Check if the API key's rate limit tier is within bounds
    if (maxTier !== undefined && auth.rateLimitTier > maxTier) {
      securityLogger.logAuthzFailure(c, "rate_limit", "tier_exceeded");
      throw new HTTPException(429, {
        message: "Rate limit tier exceeded for this operation",
      });
    }

    return next();
  };
}

// ============================================================================
// Cross-Origin Protection for State Changes
// ============================================================================

/**
 * Verify same-origin for state-changing operations.
 * Prevents CSRF attacks by validating the Origin header for POST/DELETE/PATCH.
 */
export function requireSameOrigin(): MiddlewareHandler {
  return async (c, next) => {
    const method = c.req.method;

    // Only apply to state-changing methods
    if (!["POST", "DELETE", "PATCH", "PUT"].includes(method)) {
      return next();
    }

    const origin = c.req.header("Origin");
    const host = c.req.header("Host");
    const referer = c.req.header("Referer");

    // Skip for API calls with proper authentication (API key or session)
    const auth = getAuthContext(c);
    if (auth && (auth.authMethod === "api_key" || auth.authMethod === "session")) {
      return next();
    }

    // For browser-based requests without auth, check Origin/Referer
    if (!origin && !referer) {
      securityLogger.logSuspiciousActivity(c, "missing_origin_referer");
      throw new HTTPException(403, {
        message: "Origin or Referer header required for state-changing operations",
      });
    }

    // Validate Origin matches Host (if Origin is present)
    if (origin && host) {
      const originHost = new URL(origin).host;
      if (originHost !== host) {
        securityLogger.logSuspiciousActivity(c, "origin_mismatch");
        throw new HTTPException(403, {
          message: "Cross-origin requests not allowed for state-changing operations",
        });
      }
    }

    // Validate Referer matches Host (if Referer is present and no Origin)
    if (referer && host && !origin) {
      const refererHost = new URL(referer).host;
      if (refererHost !== host) {
        securityLogger.logSuspiciousActivity(c, "referer_mismatch");
        throw new HTTPException(403, {
          message: "Cross-origin requests not allowed for state-changing operations",
        });
      }
    }

    return next();
  };
}

// ============================================================================
// Data Access Validation
// ============================================================================

/**
 * Validate that a request only accesses data the user is allowed to see.
 * Used for queries that might return user-scoped data.
 */
export function validateDataAccess(resourceType: ResourceType): MiddlewareHandler {
  return async (c, next) => {
    const auth = getAuthContext(c);

    // For authenticated users, ensure they can only access their own data
    if (auth) {
      // Check query parameters for user-scoped filters
      const userId = c.req.query("userId");
      const endpoint = c.req.query("endpoint");

      // If trying to access another user's data, require admin scope
      if ((userId || endpoint) && auth.scope !== "admin") {
        securityLogger.logAuthzFailure(c, resourceType, "read");
        throw new HTTPException(403, {
          message: "Access to other users' data requires admin privileges",
        });
      }
    }

    return next();
  };
}

// ============================================================================
// Authorization Check Utilities
// ============================================================================

/**
 * Check if the current context has authorization for a specific action.
 * Returns an AuthorizationResult with details.
 */
export function checkAuthorization(
  c: Context,
  resourceType: ResourceType,
  action: PermissionAction
): AuthorizationResult {
  const auth = getAuthContext(c);

  if (!auth) {
    return {
      allowed: false,
      reason: "Not authenticated",
      required: "Authentication required",
    };
  }

  const scopeLevels: Record<ApiKeyScope, number> = { read: 1, write: 2, admin: 3 };
  const requiredScopeForAction: Record<PermissionAction, ApiKeyScope> = {
    create: "write",
    read: "read",
    update: "write",
    delete: "write",
    admin: "admin",
  };

  const requiredScope = requiredScopeForAction[action];
  if (scopeLevels[auth.scope] < scopeLevels[requiredScope]) {
    return {
      allowed: false,
      reason: "Insufficient permissions",
      required: requiredScope,
    };
  }

  return { allowed: true };
}

/**
 * Require MFA verification for sensitive operations.
 * Use for operations that should require multi-factor authentication.
 */
export function requireMfa(): MiddlewareHandler {
  return async (c, next) => {
    const auth = getAuthContext(c);

    if (!auth) {
      securityLogger.logAuthzFailure(c, "mfa", "required");
      throw new HTTPException(401, { message: "Authentication required" });
    }

    // Check if MFA was verified for this session
    if (!auth.mfaVerified) {
      securityLogger.logAuthzFailure(c, "mfa", "required");
      throw new HTTPException(403, {
        message: "Multi-factor authentication required for this operation",
      });
    }

    logger.info("MFA-verified operation authorized", { keyId: auth.keyId });
    return next();
  };
}

/**
 * Audit log wrapper for privileged operations.
 * Logs all access to sensitive resources for compliance.
 */
export function auditLogAccess(
  resourceType: ResourceType,
  action: PermissionAction
): MiddlewareHandler {
  return async (c, next) => {
    const auth = getAuthContext(c);
    const clientIp =
      c.req.header("CF-Connecting-IP") ||
      c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ||
      c.req.header("X-Real-IP") ||
      "unknown";

    // Log the attempt
    logger.info("Privileged operation attempt", {
      keyId: auth?.keyId,
      resourceType,
      action,
      path: c.req.path,
      method: c.req.method,
      clientIp,
      authenticated: !!auth,
    });

    // Execute the operation
    await next();

    // Log the result
    const status = c.res.status;
    const success = status >= 200 && status < 300;

    logger.info("Privileged operation completed", {
      keyId: auth?.keyId,
      resourceType,
      action,
      path: c.req.path,
      status,
      success,
      clientIp,
    });
  };
}

// ============================================================================
// Scope Restriction Helpers
// ============================================================================

/**
 * Get the owner ID for an authenticated user, or "anonymous" for unauthenticated.
 * This is used to scope database queries to the user's own data.
 *
 * @param c - Hono context
 * @param allowAdminAll - If true, admins get undefined (no filter), otherwise they also get their own keyId
 * @returns Owner ID to use in queries, or undefined for admins to see all data
 */
export function getOwnerIdForAuthContext(
  c: Context,
  allowAdminAll: boolean = true
): string | undefined {
  const auth = getAuthContext(c);

  // Unauthenticated users get anonymous
  if (!auth) {
    return "anonymous";
  }

  // Admins can see all data if allowAdminAll is true
  if (allowAdminAll && auth.role === "admin") {
    return undefined; // No filter - return all data
  }

  // Regular authenticated users get their own keyId
  return auth.keyId || "anonymous";
}

/**
 * Apply ownership scope to query parameters.
 * Ensures non-admin users can only query their own resources.
 *
 * @param c - Hono context
 * @param params - Existing query parameters
 * @returns Parameters with ownership filter applied
 */
export function applyOwnershipScope<T extends Record<string, unknown>>(
  c: Context,
  params: T
): T & { ownerId?: string } {
  const ownerId = getOwnerIdForAuthContext(c, true);

  if (ownerId === undefined) {
    // Admin user - no ownership filter
    return params as T & { ownerId?: string };
  }

  // Non-admin user - add ownership filter
  return { ...params, ownerId };
}

/**
 * Require ownership of a resource for access.
 * This is a helper that validates ownership before allowing access.
 *
 * @param c - Hono context
 * @param resourceOwnerId - Owner ID of the resource being accessed
 * @returns true if access is allowed, throws HTTPException otherwise
 */
export function requireResourceOwnership(c: Context, resourceOwnerId: string): boolean {
  const auth = getAuthContext(c);

  // Admins bypass ownership checks
  if (auth?.role === "admin") {
    return true;
  }

  // Check if the user owns the resource
  const userOwnerId = auth?.keyId || "anonymous";

  if (userOwnerId !== resourceOwnerId && resourceOwnerId !== "anonymous") {
    securityLogger.logAuthzFailure(c, "resource", "ownership");
    throw new HTTPException(403, {
      message: "Access denied: you do not own this resource",
    });
  }

  return true;
}

/**
 * Scope options for database queries.
 */
export interface ScopeOptions {
  /** Owner ID to filter by (undefined = no filter, return all) */
  ownerId?: string;
  /** Additional filter criteria */
  filters?: Record<string, unknown>;
  /** Limit on number of results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

/**
 * Create scoped query options for database operations.
 * Automatically applies ownership filtering based on authentication.
 *
 * @param c - Hono context
 * @param baseOptions - Base query options
 * @returns Scoped options with ownership filter applied
 */
export function createScopedQuery<T extends ScopeOptions>(c: Context, baseOptions: T = {} as T): T {
  const ownerId = getOwnerIdForAuthContext(c, true);

  if (ownerId === undefined) {
    // Admin - return all data without ownership filter
    return baseOptions;
  }

  // Non-admin - apply ownership filter
  return {
    ...baseOptions,
    ownerId,
  } as T;
}

/**
 * Check if the current user can access another user's data.
 * Returns true if the user is an admin or if the targetUserId matches their own.
 *
 * @param c - Hono context
 * @param targetUserId - The user ID being accessed
 * @returns true if access is allowed
 */
export function canAccessUserData(c: Context, targetUserId: string): boolean {
  const auth = getAuthContext(c);

  // Admins can access any user's data
  if (auth?.role === "admin") {
    return true;
  }

  // Users can only access their own data
  return auth?.keyId === targetUserId;
}

/**
 * Filter a response to include only user-scoped data.
 * Removes sensitive information and ensures users only see their own data.
 *
 * @param c - Hono context
 * @param data - Data to filter
 * @param ownerField - Field name that contains the owner ID
 * @returns Filtered data
 */
export function filterUserScopedData<T extends Record<string, unknown>>(
  c: Context,
  data: T[],
  ownerField: string = "ownerId"
): T[] {
  const auth = getAuthContext(c);

  // Admins see all data
  if (auth?.role === "admin") {
    return data;
  }

  // Non-admins only see their own data
  const userOwnerId = auth?.keyId || "anonymous";

  return data.filter((item) => {
    const ownerId = item[ownerField] as string | undefined;
    return ownerId === userOwnerId || ownerId === "anonymous";
  });
}

/**
 * Validate that a list request is properly scoped.
 * Throws an error if a non-admin user tries to request another user's data.
 *
 * @param c - Hono context
 * @param requestedOwnerId - Owner ID from request (if any)
 * @throws HTTPException if access is denied
 */
export function validateListScope(c: Context, requestedOwnerId?: string): void {
  const auth = getAuthContext(c);

  // If no specific owner requested, this is fine (will be filtered by applyOwnershipScope)
  if (!requestedOwnerId) {
    return;
  }

  // Admins can request any owner's data
  if (auth?.role === "admin") {
    return;
  }

  // Non-admins can only request their own data
  const userOwnerId = auth?.keyId || "anonymous";

  if (requestedOwnerId !== userOwnerId) {
    securityLogger.logAuthzFailure(c, "list", "scope");
    throw new HTTPException(403, {
      message: "Access denied: you can only view your own data",
    });
  }
}
