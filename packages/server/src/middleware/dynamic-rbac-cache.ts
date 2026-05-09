/**
 * Dynamic RBAC Permission Caching
 *
 * Provides efficient permission checking with caching to reduce
 * database lookups and improve performance. Features include:
 * - Permission result caching with TTL
 * - Role-based permission inheritance
 * - Dynamic permission updates
 * - Cache invalidation on role changes
 * - Permission override support
 * - Audit trail for permission checks
 *
 * Security Best Practices:
 * - Short cache TTL to balance performance and security
 * - Automatic cache invalidation on permission changes
 * - Audit logging for permission denials
 * - Support for emergency permission revocation
 */

import { logger } from "../observability/logger.js";
import type { Permission, UserRole } from "./authentication.js";
import { getRolePermissions } from "./roles.js";
import { securityLogger } from "./security-logging.js";

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Cached permission result.
 */
interface CachedPermission {
  /** Whether permission is granted */
  granted: boolean;
  /** Cache timestamp */
  cachedAt: number;
  /** Cache entry ID */
  cacheId: string;
}

/**
 * Permission cache key.
 */
interface PermissionCacheKey {
  /** Role */
  role: UserRole;
  /** Permission being checked */
  permission: Permission;
  /** Resource ID (optional, for resource-specific permissions) */
  resourceId?: string;
  /** User ID (optional, for user-specific overrides) */
  userId?: string;
}

/**
 * Permission check result with metadata.
 */
export interface PermissionCheckResult {
  /** Whether permission is granted */
  granted: boolean;
  /** Whether result was from cache */
  fromCache: boolean;
  /** Cache age in milliseconds (if from cache) */
  cacheAge?: number;
  /** Reason for denial (if denied) */
  reason?: string;
  /** Required role (if denied) */
  requiredRole?: UserRole;
}

/**
 * Permission override for specific users/resources.
 */
export interface PermissionOverride {
  /** Override ID */
  overrideId: string;
  /** User ID this override applies to */
  userId: string;
  /** Permission being overridden */
  permission: Permission;
  /** Whether to grant (true) or deny (false) */
  grant: boolean;
  /** Resource ID (optional, for resource-specific overrides) */
  resourceId?: string;
  /** Override expiration (0 = no expiration) */
  expiresAt: number;
  /** Reason for override */
  reason?: string;
  /** Created by (admin user ID) */
  createdBy: string;
  /** Created at timestamp */
  createdAt: number;
}

/**
 * RBAC cache configuration.
 */
export interface RbacCacheConfig {
  /** Cache TTL in milliseconds (default: 5 minutes) */
  cacheTtl?: number;
  /** Maximum cache size (default: 10000 entries) */
  maxCacheSize?: number;
  /** Whether to enable audit logging (default: true) */
  enableAuditLogging?: boolean;
  /** Whether to enable permission overrides (default: true) */
  enableOverrides?: boolean;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: Required<Omit<RbacCacheConfig, "enableOverrides">> & {
  enableOverrides: boolean;
} = {
  cacheTtl: 5 * 60 * 1000, // 5 minutes
  maxCacheSize: 10000,
  enableAuditLogging: true,
  enableOverrides: true,
};

// ============================================================================
// Cache Storage
// ============================================================================

/**
 * Permission cache storage.
 */
const permissionCache = new Map<string, CachedPermission>();

/**
 * Permission overrides storage.
 */
const permissionOverrides = new Map<string, PermissionOverride>();

/**
 * Emergency revoked permissions (global deny list).
 */
const emergencyRevocations = new Set<Permission>();

/**
 * Cache statistics.
 */
const cacheStats = {
  hits: 0,
  misses: 0,
  sets: 0,
  invalidations: 0,
  evictions: 0,
};

// ============================================================================
// Cache Key Generation
// ============================================================================

/**
 * Generate cache key from permission check parameters.
 */
function generateCacheKey(key: PermissionCacheKey): string {
  const parts = [key.role, key.permission, key.resourceId || "", key.userId || ""];
  return parts.join(":");
}

/**
 * Generate override key.
 */
function generateOverrideKey(userId: string, permission: Permission, resourceId?: string): string {
  return [userId, permission, resourceId || ""].join(":");
}

// ============================================================================
// Permission Checking
// ============================================================================

/**
 * Check if a role has a specific permission.
 *
 * This function implements caching to improve performance for
 * repeated permission checks. Cache entries expire after TTL.
 *
 * @param role - User role to check
 * @param permission - Permission to check for
 * @param options - Additional options
 * @returns Permission check result
 */
export function checkPermission(
  role: UserRole,
  permission: Permission,
  options: {
    /** Resource ID for resource-specific checks */
    resourceId?: string;
    /** User ID for override checks */
    userId?: string;
    /** Cache configuration */
    config?: RbacCacheConfig;
  } = {}
): PermissionCheckResult {
  const { resourceId, userId, config: userConfig } = options;
  const config = { ...DEFAULT_CONFIG, ...userConfig };

  // Check emergency revocations first (bypasses all caching)
  if (emergencyRevocations.has(permission)) {
    if (config.enableAuditLogging) {
      logPermissionCheck({
        role,
        permission,
        granted: false,
        reason: "Emergency revocation",
      });
    }
    return {
      granted: false,
      fromCache: false,
      reason: "Permission revoked by emergency",
    };
  }

  // Check permission overrides (if enabled)
  if (config.enableOverrides && userId) {
    const overrideKey = generateOverrideKey(userId, permission, resourceId);
    const override = permissionOverrides.get(overrideKey);

    if (override) {
      // Check if override has expired
      if (override.expiresAt > 0 && Date.now() > override.expiresAt) {
        permissionOverrides.delete(overrideKey);
        logger.info("Permission override expired", { overrideId: override.overrideId });
      } else {
        // Apply override
        if (config.enableAuditLogging) {
          logPermissionCheck({
            role,
            permission,
            granted: override.grant,
            reason: `Override: ${override.reason || "No reason provided"}`,
            overrideId: override.overrideId,
          });
        }

        return {
          granted: override.grant,
          fromCache: false,
          reason: override.grant ? undefined : override.reason || "Permission denied by override",
        };
      }
    }
  }

  // Generate cache key
  const cacheKey: PermissionCacheKey = {
    role,
    permission,
    resourceId,
    userId,
  };
  const keyString = generateCacheKey(cacheKey);

  // Check cache
  const cached = permissionCache.get(keyString);
  const now = Date.now();

  if (cached) {
    const age = now - cached.cachedAt;

    // Check if cache entry is still valid
    if (age < config.cacheTtl) {
      cacheStats.hits++;

      if (config.enableAuditLogging && !cached.granted) {
        logPermissionCheck({
          role,
          permission,
          granted: false,
          reason: "Cached denial",
        });
      }

      return {
        granted: cached.granted,
        fromCache: true,
        cacheAge: age,
        reason: cached.granted ? undefined : "Permission denied (cached)",
      };
    }

    // Cache entry expired, remove it
    permissionCache.delete(keyString);
    cacheStats.evictions++;
  }

  cacheStats.misses++;

  // Check actual permissions
  const rolePermissions = getRolePermissions(role);
  const granted = rolePermissions.includes(permission);

  // Cache the result
  if (permissionCache.size >= config.maxCacheSize) {
    // Evict oldest entry (simple FIFO)
    const firstKey = permissionCache.keys().next().value;
    if (firstKey) {
      permissionCache.delete(firstKey);
      cacheStats.evictions++;
    }
  }

  permissionCache.set(keyString, {
    granted,
    cachedAt: now,
    cacheId: crypto.randomUUID(),
  });
  cacheStats.sets++;

  // Log denial
  if (config.enableAuditLogging && !granted) {
    logPermissionCheck({
      role,
      permission,
      granted: false,
      reason: "Insufficient permissions",
    });
  }

  return {
    granted,
    fromCache: false,
    reason: granted ? undefined : "Insufficient permissions",
    requiredRole: granted ? undefined : role,
  };
}

/**
 * Check multiple permissions at once.
 *
 * @param role - User role
 * @param permissions - Array of permissions to check
 * @param options - Additional options
 * @returns Map of permission to check result
 */
export function checkPermissions(
  role: UserRole,
  permissions: Permission[],
  options: {
    resourceId?: string;
    userId?: string;
    config?: RbacCacheConfig;
  } = {}
): Map<Permission, PermissionCheckResult> {
  const results = new Map<Permission, PermissionCheckResult>();

  for (const permission of permissions) {
    results.set(permission, checkPermission(role, permission, options));
  }

  return results;
}

/**
 * Check if all specified permissions are granted.
 *
 * @param role - User role
 * @param permissions - Array of permissions to check
 * @param options - Additional options
 * @returns true if all permissions are granted
 */
export function checkAllPermissions(
  role: UserRole,
  permissions: Permission[],
  options: {
    resourceId?: string;
    userId?: string;
    config?: RbacCacheConfig;
  } = {}
): boolean {
  for (const permission of permissions) {
    if (!checkPermission(role, permission, options).granted) {
      return false;
    }
  }
  return true;
}

/**
 * Check if any of the specified permissions are granted.
 *
 * @param role - User role
 * @param permissions - Array of permissions to check
 * @param options - Additional options
 * @returns true if any permission is granted
 */
export function checkAnyPermission(
  role: UserRole,
  permissions: Permission[],
  options: {
    resourceId?: string;
    userId?: string;
    config?: RbacCacheConfig;
  } = {}
): boolean {
  for (const permission of permissions) {
    if (checkPermission(role, permission, options).granted) {
      return true;
    }
  }
  return false;
}

// ============================================================================
// Permission Overrides
// ============================================================================

/**
 * Create a permission override.
 *
 * @param override - Override data
 * @returns Created override
 */
export function createPermissionOverride(
  override: Omit<PermissionOverride, "overrideId" | "createdAt">
): PermissionOverride {
  const fullOverride: PermissionOverride = {
    ...override,
    overrideId: crypto.randomUUID(),
    createdAt: Date.now(),
  };

  const key = generateOverrideKey(override.userId, override.permission, override.resourceId);

  permissionOverrides.set(key, fullOverride);

  // Invalidate cache for affected user
  invalidateUserCache(override.userId);

  logger.info("Permission override created", {
    overrideId: fullOverride.overrideId,
    userId: override.userId,
    permission: override.permission,
    grant: override.grant,
    reason: override.reason,
  });

  return fullOverride;
}

/**
 * Remove a permission override.
 *
 * @param overrideId - Override ID to remove
 * @returns true if override was removed
 */
export function removePermissionOverride(overrideId: string): boolean {
  for (const [key, override] of permissionOverrides.entries()) {
    if (override.overrideId === overrideId) {
      permissionOverrides.delete(key);
      invalidateUserCache(override.userId);
      logger.info("Permission override removed", {
        overrideId,
        userId: override.userId,
      });
      return true;
    }
  }
  return false;
}

/**
 * Get all overrides for a user.
 *
 * @param userId - User ID
 * @returns Array of overrides
 */
export function getUserOverrides(userId: string): PermissionOverride[] {
  const overrides: PermissionOverride[] = [];

  for (const [key, override] of permissionOverrides.entries()) {
    if (override.userId === userId) {
      // Check expiration
      if (override.expiresAt > 0 && Date.now() > override.expiresAt) {
        permissionOverrides.delete(key);
      } else {
        overrides.push(override);
      }
    }
  }

  return overrides;
}

/**
 * Clear all permission overrides.
 *
 * This is primarily useful for testing purposes to ensure
 * clean state between test runs.
 *
 * @returns Number of overrides cleared
 */
export function clearPermissionOverrides(): number {
  const count = permissionOverrides.size;
  permissionOverrides.clear();
  logger.info("Permission overrides cleared", { count });
  return count;
}

// ============================================================================
// Emergency Revocation
// ============================================================================

/**
 * Emergency revoke a permission globally.
 *
 * This bypasses all caching and overrides, immediately denying
 * the permission for all users. Use for security incidents.
 *
 * @param permission - Permission to revoke
 * @returns true if permission was newly revoked
 */
export function emergencyRevokePermission(permission: Permission): boolean {
  const newlyRevoked = emergencyRevocations.add(permission);

  // Clear entire cache to ensure revocation takes effect immediately
  clearCache();

  logger.warn("Permission emergency revoked", { permission });

  return newlyRevoked;
}

/**
 * Lift emergency revocation for a permission.
 *
 * @param permission - Permission to unrevoke
 * @returns true if permission was revoked
 */
export function liftEmergencyRevocation(permission: Permission): boolean {
  const wasRevoked = emergencyRevocations.delete(permission);

  if (wasRevoked) {
    logger.info("Emergency revocation lifted", { permission });
  }

  return wasRevoked;
}

/**
 * Get all emergency revoked permissions.
 *
 * @returns Array of revoked permissions
 */
export function getEmergencyRevocations(): Permission[] {
  return Array.from(emergencyRevocations);
}

/**
 * Clear all emergency revocations.
 */
export function clearEmergencyRevocations(): void {
  const count = emergencyRevocations.size;
  emergencyRevocations.clear();
  logger.info("Emergency revocations cleared", { count });
}

// ============================================================================
// Cache Management
// ============================================================================

/**
 * Invalidate cache for a specific role.
 *
 * @param role - Role to invalidate
 */
export function invalidateRoleCache(role: UserRole): void {
  const prefix = `${role}:`;
  let count = 0;

  for (const key of permissionCache.keys()) {
    if (key.startsWith(prefix)) {
      permissionCache.delete(key);
      count++;
    }
  }

  cacheStats.invalidations += count;

  if (count > 0) {
    logger.debug("Role cache invalidated", { role, count });
  }
}

/**
 * Invalidate cache for a specific user.
 *
 * @param userId - User ID to invalidate
 */
export function invalidateUserCache(userId: string): void {
  const suffix = `:${userId}`;
  let count = 0;

  for (const key of permissionCache.keys()) {
    if (key.endsWith(suffix)) {
      permissionCache.delete(key);
      count++;
    }
  }

  cacheStats.invalidations += count;

  if (count > 0) {
    logger.debug("User cache invalidated", { userId, count });
  }
}

/**
 * Invalidate cache for a specific permission.
 *
 * @param permission - Permission to invalidate
 */
export function invalidatePermissionCache(permission: Permission): void {
  let count = 0;

  for (const key of permissionCache.keys()) {
    // The cache key format is: role:permission:resourceId:userId
    // We need to check if this key starts with "role:permission:"
    // Since permissions can contain colons (e.g., "trips:read"), we can't just split by ":"
    // Instead, we check if the key matches the pattern where it starts with role:permission:
    const parts = key.split(":");
    if (parts.length >= 2) {
      // Reconstruct the permission part from parts[1] onwards
      // The format is role:permission[:resourceId[:userId]]
      // So parts[0] is role, and parts[1...] is permission plus optional resourceId/userId
      // We need to find where the permission ends and resourceId begins
      // Since we don't know the permission format, we check if the key starts with "role:permission:"
      const role = parts[0];
      const prefix = `${role}:${permission}:`;
      if (key.startsWith(prefix)) {
        permissionCache.delete(key);
        count++;
      }
    }
  }

  cacheStats.invalidations += count;

  if (count > 0) {
    logger.debug("Permission cache invalidated", { permission, count });
  }
}

/**
 * Clear entire permission cache.
 */
export function clearCache(): void {
  const size = permissionCache.size;
  permissionCache.clear();
  cacheStats.invalidations += size;
  logger.info("Permission cache cleared", { size });
}

/**
 * Clean expired cache entries.
 *
 * @returns Number of entries cleaned
 */
export function cleanExpiredEntries(config: RbacCacheConfig = {}): number {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const now = Date.now();
  let cleaned = 0;

  for (const [key, entry] of permissionCache.entries()) {
    if (now - entry.cachedAt > mergedConfig.cacheTtl) {
      permissionCache.delete(key);
      cleaned++;
    }
  }

  cacheStats.evictions += cleaned;

  if (cleaned > 0) {
    logger.debug("Expired cache entries cleaned", { cleaned });
  }

  return cleaned;
}

// ============================================================================
// Statistics and Monitoring
// ============================================================================

/**
 * Get cache statistics.
 */
export function getCacheStats(): {
  hits: number;
  misses: number;
  sets: number;
  invalidations: number;
  evictions: number;
  size: number;
  hitRate: number;
} {
  const total = cacheStats.hits + cacheStats.misses;
  const hitRate = total > 0 ? cacheStats.hits / total : 0;

  return {
    ...cacheStats,
    size: permissionCache.size,
    hitRate,
  };
}

/**
 * Reset cache statistics.
 */
export function resetCacheStats(): void {
  cacheStats.hits = 0;
  cacheStats.misses = 0;
  cacheStats.sets = 0;
  cacheStats.invalidations = 0;
  cacheStats.evictions = 0;
}

/**
 * Get cache size by role.
 */
export function getCacheSizeByRole(): Record<UserRole, number> {
  const sizes: Record<string, number> = {
    admin: 0,
    user: 0,
    guest: 0,
  };

  for (const key of permissionCache.keys()) {
    const role = key.split(":")[0] as UserRole;
    if (role in sizes) {
      sizes[role]++;
    }
  }

  return sizes as Record<UserRole, number>;
}

// ============================================================================
// Audit Logging
// ============================================================================

/**
 * Log permission check for audit trail.
 */
function logPermissionCheck(details: {
  role: UserRole;
  permission: Permission;
  granted: boolean;
  reason?: string;
  overrideId?: string;
}): void {
  logger.info("Permission check", {
    role: details.role,
    permission: details.permission,
    granted: details.granted,
    reason: details.reason,
    overrideId: details.overrideId,
  });

  if (!details.granted) {
    securityLogger.logAuthzFailure(
      { req: { header: () => undefined }, res: {} } as never,
      details.permission,
      details.role
    );
  }
}
