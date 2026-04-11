/**
 * Admin operations endpoints for system and user management.
 *
 * Provides:
 * - System status and configuration viewing
 * - User management operations
 * - Bulk operations with authorization checks
 * - Admin audit log access
 *
 * All endpoints require admin role and are logged for compliance.
 */

import type { Context, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { logger } from "../observability/logger.js";
import {
  type AuditEvent,
  type AuditEventCategory,
  type AuditEventSeverity,
  type AuditLogFilters,
  addAuditEvent,
  exportAuditLogAsCsv,
  exportAuditLogAsJson,
  getAuditLogStats,
  getRecentSecurityEvents,
  queryAuditLog,
} from "./audit-log.js";
import {
  type ApiKey,
  getApiKeyById,
  getRegisteredApiKeys,
  revokeApiKey,
} from "./authentication.js";
import { type Permission, getRbacAuthContext, requirePermission, requireRole } from "./rbac.js";
import { securityLogger } from "./security-logging.js";

// ============================================================================
// Types
// ============================================================================

/**
 * System status information.
 */
export interface SystemStatus {
  uptime: number;
  startTime: number;
  currentTime: number;
  memory: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
  };
  apiKeys: {
    total: number;
    active: number;
    byScope: Record<string, number>;
  };
  auditLog: {
    totalEvents: number;
    failedEvents24h: number;
    uniqueUsers24h: number;
  };
}

/**
 * Bulk operation result.
 */
export interface BulkOperationResult {
  succeeded: string[];
  failed: Array<{ id: string; error: string }>;
  total: number;
}

/**
 * User summary for admin view.
 */
export interface UserSummary {
  keyId: string;
  role?: string;
  scope?: string;
  apiKeys: number;
  lastActivity?: number;
}

// ============================================================================
// System Status
// ============================================================================

/** Server start time for uptime calculation */
const SERVER_START_TIME = Date.now();

/**
 * Get system status for admin dashboard.
 */
export function getSystemStatus(): SystemStatus {
  const memUsage = process.memoryUsage();
  const apiKeys = getRegisteredApiKeys();

  const activeKeys = apiKeys.filter((k) => k.active);
  const byScope: Record<string, number> = {};
  for (const key of activeKeys) {
    byScope[key.scope] = (byScope[key.scope] || 0) + 1;
  }

  const auditLogStats = getAuditLogStats();

  return {
    uptime: Date.now() - SERVER_START_TIME,
    startTime: SERVER_START_TIME,
    currentTime: Date.now(),
    memory: {
      rss: memUsage.rss,
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
    },
    apiKeys: {
      total: apiKeys.length,
      active: activeKeys.length,
      byScope,
    },
    auditLog: {
      totalEvents: auditLogStats.totalEvents,
      failedEvents24h: auditLogStats.failedEvents24h,
      uniqueUsers24h: auditLogStats.uniqueUsers24h,
    },
  };
}

// ============================================================================
// User Management
// ============================================================================

/**
 * Get user summaries for admin view.
 * Groups API keys by user (keyId prefix).
 */
export function getUserSummaries(): UserSummary[] {
  const apiKeys = getRegisteredApiKeys();
  const userMap = new Map<string, UserSummary>();

  for (const key of apiKeys) {
    // Extract user ID (first part of keyId before underscore)
    const userId = key.keyId.split("_")[0] || key.keyId;

    let summary = userMap.get(userId);
    if (!summary) {
      summary = {
        keyId: userId,
        apiKeys: 0,
      };
      userMap.set(userId, summary);
    }

    summary.apiKeys++;
    if (key.role && !summary.role) {
      summary.role = key.role;
    }
    if (key.scope && !summary.scope) {
      summary.scope = key.scope;
    }
  }

  return Array.from(userMap.values()).sort((a, b) => a.keyId.localeCompare(b.keyId));
}

/**
 * Revoke all API keys for a user.
 */
export function revokeAllUserApiKeys(userId: string): BulkOperationResult {
  const apiKeys = getRegisteredApiKeys();
  const result: BulkOperationResult = {
    succeeded: [],
    failed: [],
    total: 0,
  };

  for (const key of apiKeys) {
    // Check if this key belongs to the user
    if (!key.keyId.startsWith(userId)) continue;

    result.total++;

    try {
      revokeApiKey(key.keyId);
      result.succeeded.push(key.keyId);
    } catch (error) {
      result.failed.push({
        id: key.keyId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return result;
}

// ============================================================================
// Middleware
// ============================================================================

/**
 * Require admin role with audit logging.
 */
export function requireAdminWithAudit(action: string, resourceType?: string): MiddlewareHandler {
  return async (c, next) => {
    const auth = getRbacAuthContext(c);

    // First check if user is admin
    if (!auth || auth.role !== "admin") {
      securityLogger.logAuthzFailure(c, "admin", action);

      // Log the failed attempt
      addAuditEvent({
        category: "admin",
        severity: "warning",
        action,
        resourceType,
        success: false,
        performedBy: auth?.keyId,
        role: auth?.role,
        clientIp:
          c.req.header("CF-Connecting-IP") ||
          c.req.header("X-Forwarded-For")?.split(",")[0] ||
          "unknown",
        userAgent: c.req.header("User-Agent"),
        path: c.req.path,
        method: c.req.method,
        error: "Admin role required",
      });

      throw new HTTPException(403, {
        message: "Admin privileges required",
      });
    }

    // Log the successful admin access
    addAuditEvent({
      category: "admin",
      severity: "info",
      action,
      resourceType,
      success: true,
      performedBy: auth.keyId,
      role: auth.role,
      clientIp:
        c.req.header("CF-Connecting-IP") ||
        c.req.header("X-Forwarded-For")?.split(",")[0] ||
        "unknown",
      userAgent: c.req.header("User-Agent"),
      path: c.req.path,
      method: c.req.method,
    });

    return next();
  };
}

/**
 * Require specific admin permission.
 */
export function requireAdminPermission(permission: Permission): MiddlewareHandler {
  return requirePermission(permission);
}

/**
 * Audit log for admin operations.
 */
export function auditAdminOperation(action: string, resourceType?: string): MiddlewareHandler {
  return async (c, next) => {
    const auth = getRbacAuthContext(c);
    const startTime = Date.now();

    // Execute the operation
    await next();

    // Log the result
    const status = c.res.status;
    const success = status >= 200 && status < 300;
    const duration = Date.now() - startTime;

    addAuditEvent({
      category: "admin",
      severity: success ? "info" : "error",
      action,
      resourceType,
      success,
      performedBy: auth?.keyId,
      role: auth?.role,
      clientIp:
        c.req.header("CF-Connecting-IP") ||
        c.req.header("X-Forwarded-For")?.split(",")[0] ||
        "unknown",
      userAgent: c.req.header("User-Agent"),
      path: c.req.path,
      method: c.req.method,
      metadata: {
        status,
        duration,
      },
    });
  };
}

// ============================================================================
// Admin Endpoint Handlers
// ============================================================================

/**
 * GET /admin/status - Get system status.
 */
export async function getAdminStatus(c: Context): Promise<Response> {
  const status = getSystemStatus();
  return c.json(status);
}

/**
 * GET /admin/users - Get user summaries.
 */
export async function getAdminUsers(c: Context): Promise<Response> {
  const users = getUserSummaries();
  return c.json({
    users,
    count: users.length,
  });
}

/**
 * GET /admin/users/:userId - Get details for a specific user.
 */
export async function getAdminUserDetails(c: Context): Promise<Response> {
  const userId = c.req.param("userId");

  if (!userId) {
    throw new HTTPException(400, { message: "User ID is required" });
  }

  const apiKeys = getRegisteredApiKeys();
  const userKeys = apiKeys.filter((k) => k.keyId.startsWith(userId));

  if (userKeys.length === 0) {
    throw new HTTPException(404, { message: "User not found" });
  }

  return c.json({
    userId,
    apiKeys: userKeys.map((k) => ({
      keyId: k.keyId,
      scope: k.scope,
      rateLimitTier: k.rateLimitTier,
      active: k.active,
      role: k.role,
      createdAt: k.createdAt,
      expiresAt: k.expiresAt,
    })),
    count: userKeys.length,
  });
}

/**
 * DELETE /admin/users/:userId/keys - Revoke all keys for a user.
 */
export async function revokeUserKeys(c: Context): Promise<Response> {
  const userId = c.req.param("userId");

  if (!userId) {
    throw new HTTPException(400, { message: "User ID is required" });
  }

  const result = revokeAllUserApiKeys(userId);

  logger.info("Admin revoked all user keys", {
    userId,
    succeeded: result.succeeded.length,
    failed: result.failed.length,
  });

  return c.json({
    userId,
    ...result,
  });
}

/**
 * GET /admin/audit - Get audit log with filters.
 */
export async function getAuditLogs(c: Context): Promise<Response> {
  const query = c.req.query();

  const filters: AuditLogFilters = {
    category: query.category as AuditEventCategory,
    severity: query.severity as AuditEventSeverity,
    action: query.action,
    resourceType: query.resourceType,
    resourceId: query.resourceId,
    performedBy: query.performedBy,
    success: query.success === "true" ? true : query.success === "false" ? false : undefined,
    limit: query.limit ? parseInt(query.limit, 10) : undefined,
    offset: query.offset ? parseInt(query.offset, 10) : undefined,
  };

  const events = queryAuditLog(filters);

  return c.json({
    events,
    count: events.length,
    filters,
  });
}

/**
 * GET /admin/audit/stats - Get audit log statistics.
 */
export async function getAuditStatistics(c: Context): Promise<Response> {
  const stats = getAuditLogStats();
  return c.json(stats);
}

/**
 * GET /admin/audit/export - Export audit log.
 */
export async function exportAuditLogs(c: Context): Promise<Response> {
  const format = c.req.query("format") || "json";
  const query = c.req.query();

  const filters: AuditLogFilters = {
    category: query.category as AuditEventCategory,
    severity: query.severity as AuditEventSeverity,
    limit: query.limit ? parseInt(query.limit, 10) : undefined,
  };

  if (format === "csv") {
    const csv = exportAuditLogAsCsv(filters);
    c.header("Content-Type", "text/csv");
    c.header("Content-Disposition", `attachment; filename="audit-log-${Date.now()}.csv"`);
    return c.text(csv);
  }

  const json = exportAuditLogAsJson(filters);
  c.header("Content-Type", "application/json");
  c.header("Content-Disposition", `attachment; filename="audit-log-${Date.now()}.json"`);
  return c.text(json);
}

/**
 * GET /admin/security - Get recent security events.
 */
export async function getSecurityEvents(c: Context): Promise<Response> {
  const limit = c.req.query("limit") ? parseInt(c.req.query("limit"), 10) : 50;
  const events = getRecentSecurityEvents(limit);

  return c.json({
    events,
    count: events.length,
  });
}

/**
 * POST /admin/keys/:keyId/revoke - Revoke a specific API key.
 */
export async function revokeApiKeyAdmin(c: Context): Promise<Response> {
  const keyId = c.req.param("keyId");

  if (!keyId) {
    throw new HTTPException(400, { message: "Key ID is required" });
  }

  const key = getApiKeyById(keyId);
  if (!key) {
    throw new HTTPException(404, { message: "API key not found" });
  }

  revokeApiKey(keyId);

  logger.info("Admin revoked API key", { keyId });

  return c.json({
    success: true,
    keyId,
  });
}

// ============================================================================
// Re-exports
// ============================================================================

export {
  addAuditEvent,
  queryAuditLog,
  getAuditLogStats,
  exportAuditLogAsJson,
  exportAuditLogAsCsv,
  getRecentSecurityEvents,
  type AuditEvent,
  type AuditLogFilters,
  type AuditEventCategory,
  type AuditEventSeverity,
};
