/**
 * API Key Management endpoints with authorization controls.
 *
 * Provides:
 * - API key listing (user-scoped or admin all)
 * - API key creation with role assignment
 * - API key rotation with old key invalidation
 * - API key revocation
 * - API key permission viewing
 *
 * All endpoints are protected with proper RBAC authorization.
 */

import type { Context, MiddlewareHandler } from "hono";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { HTTPException } from "hono/http-exception";
import { logger } from "../observability/logger.js";
import {
  saveApiKey as dbSaveApiKey,
  updateApiKeyLastUsed as dbUpdateApiKeyLastUsed,
  loadApiKeyRegistry,
} from "../security/security-db.js";
import {
  type ApiKey,
  type ApiKeyScope,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type AuthContext,
  type Permission,
  type UserRole,
  assignRoleToApiKey,
  generateApiKey,
  getApiKeyById,
  getApiKeyPermissions,
  grantPermissionsToApiKey,
  hashApiKey,
  registerApiKey,
  revokeApiKey,
  revokePermissionsFromApiKey,
} from "./authentication.js";
import {
  type RbacAuthContext,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getRbacAuthContext,
  requireOwnershipOrAdmin,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  requirePermission,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  requireRole,
} from "./rbac.js";
import { securityLogger } from "./security-logging.js";

// ============================================================================
// Types
// ============================================================================

/**
 * API key creation request.
 */
export interface ApiKeyCreateRequest {
  /** Key ID (optional, auto-generated if not provided) */
  keyId?: string;
  /** Scope for the key */
  scope: ApiKeyScope;
  /** Rate limit tier (1-100) */
  rateLimitTier?: number;
  /** Role assignment */
  role?: UserRole;
  /** Additional permissions beyond role */
  additionalPermissions?: Permission[];
  /** Expiration time in seconds (0 = never expires) */
  expiresIn?: number;
  /** Description for the key */
  description?: string;
}

/**
 * API key response (safe - excludes secrets).
 */
export interface ApiKeyResponse {
  keyId: string;
  scope: ApiKeyScope;
  rateLimitTier: number;
  active: boolean;
  role?: UserRole;
  permissions: Permission[];
  createdAt: number;
  expiresAt: number;
  description?: string;
  lastUsedAt?: number;
  /** Full API key (only returned on creation) */
  apiKey?: string;
}

/**
 * API key list filters.
 */
export interface ApiKeyListFilters {
  /** Filter by active status */
  active?: boolean;
  /** Filter by role */
  role?: UserRole;
  /** Filter by scope */
  scope?: ApiKeyScope;
  /** Filter by owner (keyId prefix) */
  ownerId?: string;
  /** Maximum results to return */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

// ============================================================================
// In-Memory Storage (write-through cache backed by security-db.ts)
// ============================================================================

/**
 * In-memory cache for API key metadata; authoritative store is SQLite via
 * security-db.ts. Writes go to both Maps and DB; on startup, initApiKeyRegistryFromDb
 * rehydrates these Maps from the database so state survives pod restarts.
 */
const API_KEY_REGISTRY = new Map<string, ApiKey>();

/**
 * Track when API keys were last used.
 */
const API_KEY_LAST_USED = new Map<string, number>();

/**
 * Track API key descriptions.
 */
const API_KEY_DESCRIPTIONS = new Map<string, string>();

// ============================================================================
// API Key Management Utilities
// ============================================================================

/**
 * Register an API key with metadata.
 */
export function registerApiKeyWithMetadata(key: ApiKey, description?: string): void {
  API_KEY_REGISTRY.set(key.keyId, key);
  if (description) {
    API_KEY_DESCRIPTIONS.set(key.keyId, description);
  }
  dbSaveApiKey(key, description);
}

/**
 * Update the last used timestamp for an API key.
 */
export function updateApiKeyLastUsed(keyId: string): void {
  const now = Date.now();
  API_KEY_LAST_USED.set(keyId, now);
  dbUpdateApiKeyLastUsed(keyId, now);
}

/**
 * Load API key registry from the database into the in-memory Maps.
 * Also registers each key with the authentication system so auth survives restart.
 */
export async function initApiKeyRegistryFromDb(): Promise<void> {
  const entries = loadApiKeyRegistry();
  for (const { key, description, lastUsedAt } of entries) {
    const apiKey: ApiKey = {
      keyId: key.keyId,
      keyHash: key.keyHash,
      keySalt: key.keySalt,
      scope: key.scope as ApiKeyScope,
      role: key.role as UserRole | undefined,
      additionalPermissions: (key.additionalPermissions ?? []) as Permission[],
      owner: key.owner,
      rateLimitTier: key.rateLimitTier,
      active: key.active,
      createdAt: key.createdAt,
      expiresAt: key.expiresAt,
      failedAttempts: key.failedAttempts,
      lastFailedAt: key.lastFailedAt,
      lockedUntil: key.lockedUntil,
    };
    API_KEY_REGISTRY.set(key.keyId, apiKey);
    if (description) API_KEY_DESCRIPTIONS.set(key.keyId, description);
    if (lastUsedAt) API_KEY_LAST_USED.set(key.keyId, lastUsedAt);
    // Re-register in the auth system so API keys survive pod restarts.
    await registerApiKey(apiKey);
  }
  if (entries.length > 0) {
    logger.info("API key registry loaded from database", { count: entries.length });
  }
}

/**
 * Get all API keys for a user (by keyId prefix).
 * Admins can see all keys.
 */
export function getApiKeysForUser(ownerId: string, isAdmin: boolean): ApiKeyResponse[] {
  const keys: ApiKeyResponse[] = [];

  for (const [keyId, key] of API_KEY_REGISTRY.entries()) {
    // Non-admins only see their own keys
    if (!isAdmin && !keyId.startsWith(ownerId)) {
      continue;
    }

    const permissions = getApiKeyPermissions(keyId);
    const description = API_KEY_DESCRIPTIONS.get(keyId);

    keys.push({
      keyId,
      scope: key.scope,
      rateLimitTier: key.rateLimitTier,
      active: key.active,
      role: key.role,
      permissions,
      createdAt: key.createdAt,
      expiresAt: key.expiresAt,
      description,
      lastUsedAt: API_KEY_LAST_USED.get(keyId),
    });
  }

  return keys.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Get API keys with filtering.
 */
export function listApiKeys(
  filters: ApiKeyListFilters,
  isAdmin: boolean,
  ownerKey?: string
): ApiKeyResponse[] {
  let keys = getApiKeysForUser(ownerKey || "", isAdmin);

  // Apply filters
  if (filters.active !== undefined) {
    keys = keys.filter((k) => k.active === filters.active);
  }
  if (filters.role) {
    keys = keys.filter((k) => k.role === filters.role);
  }
  if (filters.scope) {
    keys = keys.filter((k) => k.scope === filters.scope);
  }
  const ownerId = filters.ownerId;
  if (ownerId && !isAdmin) {
    keys = keys.filter((k) => k.keyId.startsWith(ownerId));
  }

  // Apply pagination
  const offset = filters.offset ?? 0;
  const limit = filters.limit ?? 50;
  if (limit === 0) return [];
  keys = keys.slice(offset, offset + limit);

  return keys;
}

/**
 * Get a safe API key response (never includes the secret).
 */
export function getSafeApiKeyResponse(keyId: string): ApiKeyResponse | null {
  const key = API_KEY_REGISTRY.get(keyId);
  if (!key) return null;

  const permissions = getApiKeyPermissions(keyId);
  const description = API_KEY_DESCRIPTIONS.get(keyId);

  return {
    keyId,
    scope: key.scope,
    rateLimitTier: key.rateLimitTier,
    active: key.active,
    role: key.role,
    permissions,
    createdAt: key.createdAt,
    expiresAt: key.expiresAt,
    description,
    lastUsedAt: API_KEY_LAST_USED.get(keyId),
  };
}

/**
 * Validate that a role can be assigned by the current user.
 */
export function canAssignRole(assignerRole: UserRole | undefined, targetRole: UserRole): boolean {
  // Admins can assign any role
  if (assignerRole === "admin") return true;

  // Users can only assign guest role
  if (assignerRole === "user" && targetRole === "guest") return true;

  // Guests cannot assign roles
  return false;
}

/**
 * Validate that permissions can be granted.
 */
export function canGrantPermissions(
  assignerRole: UserRole | undefined,
  permissions: Permission[]
): boolean {
  // Undefined role cannot grant permissions
  if (assignerRole === undefined) return false;

  // Admins can grant any permission
  if (assignerRole === "admin") return true;

  // Non-admins cannot grant admin permissions
  const adminPermissions = permissions.filter((p) => p.startsWith("admin:"));
  if (adminPermissions.length > 0) return false;

  return true;
}

// ============================================================================
// Middleware
// ============================================================================

/**
 * Require ownership of an API key or admin role.
 */
export function requireApiKeyOwnershipOrAdmin(): MiddlewareHandler {
  return requireOwnershipOrAdmin("apikeys", {
    getOwnerId: (c: Context) => {
      const keyId = c.req.param("keyId") || c.req.query("keyId") || "";
      return keyId;
    },
    adminBypass: true,
  });
}

/**
 * Validate API key creation request.
 */
export function validateApiKeyCreateRequest(
  auth: RbacAuthContext | undefined,
  request: ApiKeyCreateRequest
): { valid: boolean; error?: string } {
  // Validate scope
  const validScopes: ApiKeyScope[] = ["read", "write", "admin"];
  if (!validScopes.includes(request.scope)) {
    return { valid: false, error: "Invalid scope" };
  }

  // Validate rate limit tier
  if (
    request.rateLimitTier !== undefined &&
    (request.rateLimitTier < 1 || request.rateLimitTier > 100)
  ) {
    return { valid: false, error: "Rate limit tier must be between 1 and 100" };
  }

  // Validate role assignment
  if (request.role && auth && !canAssignRole(auth.role, request.role)) {
    return {
      valid: false,
      error: `You cannot assign role '${request.role}'`,
    };
  }

  // Validate additional permissions
  if (request.additionalPermissions && auth) {
    if (!canGrantPermissions(auth.role, request.additionalPermissions)) {
      return {
        valid: false,
        error: "You cannot grant admin permissions",
      };
    }
  }

  // Non-admins cannot create admin-scoped keys
  if (request.scope === "admin" && auth?.role !== "admin") {
    return {
      valid: false,
      error: "Only admins can create admin-scoped keys",
    };
  }

  return { valid: true };
}

// ============================================================================
// Audit Logging
// ============================================================================

/**
 * Log API key management operations.
 */
export function logApiKeyOperation(
  operation: "create" | "rotate" | "revoke" | "update",
  keyId: string,
  auth: RbacAuthContext | undefined,
  success: boolean,
  details?: Record<string, unknown>
): void {
  logger.info("API key operation", {
    operation,
    keyId,
    performedBy: auth?.keyId,
    role: auth?.role,
    success,
    ...details,
  });

  if (!success) {
    securityLogger.logAuthzFailure({ get: () => auth } as unknown as Context, "apikeys", operation);
  }
}

// ============================================================================
// Re-exports for convenience
// ============================================================================

export {
  assignRoleToApiKey,
  generateApiKey,
  getApiKeyById,
  getApiKeyPermissions,
  grantPermissionsToApiKey,
  hashApiKey,
  registerApiKey,
  revokeApiKey,
  revokePermissionsFromApiKey,
  type ApiKey,
  type ApiKeyScope,
  type Permission,
  type UserRole,
};
