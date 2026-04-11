/**
 * Audit log system for tracking security-relevant events.
 *
 * Provides:
 * - Structured logging of authorization events
 * - Audit log retrieval for admins
 * - Event filtering and querying
 * - Audit log export capabilities
 * - Compliance-ready event tracking
 *
 * This system maintains an in-memory log of security events for
 * compliance and incident response. In production, this should be
 * backed by a persistent store with proper retention policies.
 */

import type { Context } from "hono";
import { logger } from "../observability/logger.js";
import { type RbacAuthContext, getRbacAuthContext } from "./rbac.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Audit event categories for grouping related events.
 */
export type AuditEventCategory =
  | "authentication"
  | "authorization"
  | "api_keys"
  | "users"
  | "sessions"
  | "admin"
  | "data_access"
  | "configuration"
  | "security";

/**
 * Audit event severity levels.
 */
export type AuditEventSeverity = "info" | "warning" | "error" | "critical";

/**
 * Audit event entry.
 */
export interface AuditEvent {
  /** Unique event ID */
  id: string;
  /** Timestamp (Unix ms) */
  timestamp: number;
  /** Event category */
  category: AuditEventCategory;
  /** Event severity */
  severity: AuditEventSeverity;
  /** Event type/action */
  action: string;
  /** Resource type affected */
  resourceType?: string;
  /** Resource ID affected */
  resourceId?: string;
  /** User who performed the action */
  performedBy?: string;
  /** User's role */
  role?: string;
  /** Whether the action succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Client IP address */
  clientIp?: string;
  /** User agent */
  userAgent?: string;
  /** Request path */
  path?: string;
  /** Request method */
  method?: string;
  /** Additional event metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Audit log filters for querying.
 */
export interface AuditLogFilters {
  /** Filter by category */
  category?: AuditEventCategory;
  /** Filter by severity */
  severity?: AuditEventSeverity;
  /** Filter by action */
  action?: string;
  /** Filter by resource type */
  resourceType?: string;
  /** Filter by resource ID */
  resourceId?: string;
  /** Filter by performer */
  performedBy?: string;
  /** Filter by success status */
  success?: boolean;
  /** Start timestamp (inclusive) */
  startTimestamp?: number;
  /** End timestamp (inclusive) */
  endTimestamp?: number;
  /** Maximum results to return */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

/**
 * Audit log statistics.
 */
export interface AuditLogStats {
  /** Total events in log */
  totalEvents: number;
  /** Events by category */
  eventsByCategory: Record<AuditEventCategory, number>;
  /** Events by severity */
  eventsBySeverity: Record<AuditEventSeverity, number>;
  /** Failed events in last 24h */
  failedEvents24h: number;
  /** Unique users in last 24h */
  uniqueUsers24h: number;
  /** Most common actions in last 24h */
  topActions24h: Array<{ action: string; count: number }>;
}

// ============================================================================
// In-Memory Audit Log Store
// ============================================================================

/**
 * Maximum number of audit events to keep in memory.
 * In production, this should be a persistent store with retention policies.
 */
const MAX_AUDIT_EVENTS = 10000;

/**
 * In-memory audit log storage.
 * Events are stored in reverse chronological order (newest first).
 */
const AUDIT_LOG: AuditEvent[] = [];

/**
 * Event ID counter for generating unique IDs.
 */
let eventIdCounter = 0;

// ============================================================================
// Audit Log Utilities
// ============================================================================

/**
 * Generate a unique event ID.
 */
function generateEventId(): string {
  return `audit_${Date.now()}_${++eventIdCounter}`;
}

/**
 * Add an event to the audit log.
 */
export function addAuditEvent(event: Omit<AuditEvent, "id" | "timestamp">): string {
  const auditEvent: AuditEvent = {
    id: generateEventId(),
    timestamp: Date.now(),
    ...event,
  };

  // Add to beginning of array (newest first)
  AUDIT_LOG.unshift(auditEvent);

  // Prune old events if we exceed the limit
  if (AUDIT_LOG.length > MAX_AUDIT_EVENTS) {
    const removed = AUDIT_LOG.splice(MAX_AUDIT_EVENTS);
    logger.debug("Pruned old audit events", { count: removed.length });
  }

  // Log to standard logger for immediate visibility
  const logLevel =
    auditEvent.severity === "critical"
      ? "error"
      : auditEvent.severity === "error"
        ? "warn"
        : auditEvent.severity === "warning"
          ? "warn"
          : "info";

  logger[logLevel]("Audit event", {
    id: auditEvent.id,
    category: auditEvent.category,
    action: auditEvent.action,
    success: auditEvent.success,
    performedBy: auditEvent.performedBy,
    resourceType: auditEvent.resourceType,
    resourceId: auditEvent.resourceId,
  });

  return auditEvent.id;
}

/**
 * Get client IP address from context.
 */
export function getClientIp(c: Context): string {
  return (
    c.req.header("CF-Connecting-IP") ||
    c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ||
    c.req.header("X-Real-IP") ||
    "unknown"
  );
}

/**
 * Get user agent from context.
 */
export function getUserAgent(c: Context): string {
  return c.req.header("User-Agent") || "unknown";
}

/**
 * Extract auth context for audit logging.
 */
export function extractAuthContext(c: Context): {
  performedBy?: string;
  role?: string;
} {
  const auth = getRbacAuthContext(c);
  return {
    performedBy: auth?.keyId,
    role: auth?.role,
  };
}

// ============================================================================
// Audit Log Queries
// ============================================================================

/**
 * Query audit log with filters.
 */
export function queryAuditLog(filters: AuditLogFilters = {}): AuditEvent[] {
  let results = AUDIT_LOG;

  // Apply filters
  if (filters.category) {
    results = results.filter((e) => e.category === filters.category);
  }
  if (filters.severity) {
    results = results.filter((e) => e.severity === filters.severity);
  }
  if (filters.action) {
    results = results.filter((e) => e.action === filters.action);
  }
  if (filters.resourceType) {
    results = results.filter((e) => e.resourceType === filters.resourceType);
  }
  if (filters.resourceId) {
    results = results.filter((e) => e.resourceId === filters.resourceId);
  }
  if (filters.performedBy) {
    results = results.filter((e) => e.performedBy === filters.performedBy);
  }
  if (filters.success !== undefined) {
    results = results.filter((e) => e.success === filters.success);
  }
  if (filters.startTimestamp) {
    results = results.filter((e) => e.timestamp >= filters.startTimestamp!);
  }
  if (filters.endTimestamp) {
    results = results.filter((e) => e.timestamp <= filters.endTimestamp!);
  }

  // Apply pagination
  const offset = filters.offset || 0;
  const limit = filters.limit || 100;
  results = results.slice(offset, offset + limit);

  return results;
}

/**
 * Get audit log statistics.
 */
export function getAuditLogStats(): AuditLogStats {
  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;

  const eventsByCategory: Record<AuditEventCategory, number> = {
    authentication: 0,
    authorization: 0,
    api_keys: 0,
    users: 0,
    sessions: 0,
    admin: 0,
    data_access: 0,
    configuration: 0,
    security: 0,
  };

  const eventsBySeverity: Record<AuditEventSeverity, number> = {
    info: 0,
    warning: 0,
    error: 0,
    critical: 0,
  };

  let failedEvents24h = 0;
  const uniqueUsers24h = new Set<string>();
  const actions24h = new Map<string, number>();

  for (const event of AUDIT_LOG) {
    // Category stats
    eventsByCategory[event.category]++;

    // Severity stats
    eventsBySeverity[event.severity]++;

    // Last 24h stats
    if (event.timestamp >= dayAgo) {
      if (!event.success) {
        failedEvents24h++;
      }
      if (event.performedBy) {
        uniqueUsers24h.add(event.performedBy);
      }
      const count = actions24h.get(event.action) || 0;
      actions24h.set(event.action, count + 1);
    }
  }

  // Get top actions
  const topActions24h = Array.from(actions24h.entries())
    .map(([action, count]) => ({ action, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalEvents: AUDIT_LOG.length,
    eventsByCategory,
    eventsBySeverity,
    failedEvents24h,
    uniqueUsers24h: uniqueUsers24h.size,
    topActions24h,
  };
}

/**
 * Get audit log for a specific resource.
 */
export function getAuditLogForResource(
  resourceType: string,
  resourceId: string,
  limit = 100
): AuditEvent[] {
  return queryAuditLog({
    resourceType,
    resourceId,
    limit,
  });
}

/**
 * Get audit log for a specific user.
 */
export function getAuditLogForUser(performedBy: string, limit = 100): AuditEvent[] {
  return queryAuditLog({
    performedBy,
    limit,
  });
}

/**
 * Get failed authorization attempts for a user.
 */
export function getFailedAuthzAttempts(performedBy?: string, limit = 50): AuditEvent[] {
  const filters: AuditLogFilters = {
    category: "authorization",
    success: false,
    limit,
  };
  if (performedBy) {
    filters.performedBy = performedBy;
  }
  return queryAuditLog(filters);
}

/**
 * Get recent security events.
 */
export function getRecentSecurityEvents(limit = 50): AuditEvent[] {
  return queryAuditLog({
    category: "security",
    limit,
  });
}

// ============================================================================
// Audit Log Helpers for Common Operations
// ============================================================================

/**
 * Log a successful authorization check.
 */
export function logAuthorizationSuccess(c: Context, resourceType: string, action: string): string {
  const auth = extractAuthContext(c);
  return addAuditEvent({
    category: "authorization",
    severity: "info",
    action: `${resourceType}:${action}`,
    resourceType,
    success: true,
    performedBy: auth.performedBy,
    role: auth.role,
    clientIp: getClientIp(c),
    userAgent: getUserAgent(c),
    path: c.req.path,
    method: c.req.method,
  });
}

/**
 * Log a failed authorization check.
 */
export function logAuthorizationFailure(
  c: Context,
  resourceType: string,
  action: string,
  reason?: string
): string {
  const auth = extractAuthContext(c);
  return addAuditEvent({
    category: "authorization",
    severity: "warning",
    action: `${resourceType}:${action}`,
    resourceType,
    success: false,
    error: reason,
    performedBy: auth.performedBy,
    role: auth.role,
    clientIp: getClientIp(c),
    userAgent: getUserAgent(c),
    path: c.req.path,
    method: c.req.method,
  });
}

/**
 * Log API key creation.
 */
export function logApiKeyCreated(c: Context, keyId: string, scope: string, role?: string): string {
  const auth = extractAuthContext(c);
  return addAuditEvent({
    category: "api_keys",
    severity: "info",
    action: "api_key:create",
    resourceType: "api_key",
    resourceId: keyId,
    success: true,
    performedBy: auth.performedBy,
    role: auth.role,
    clientIp: getClientIp(c),
    userAgent: getUserAgent(c),
    metadata: { scope, role },
  });
}

/**
 * Log API key revocation.
 */
export function logApiKeyRevoked(c: Context, keyId: string, revokedByKey?: string): string {
  const auth = extractAuthContext(c);
  return addAuditEvent({
    category: "api_keys",
    severity: "warning",
    action: "api_key:revoke",
    resourceType: "api_key",
    resourceId: keyId,
    success: true,
    performedBy: revokedByKey || auth.performedBy,
    role: auth.role,
    clientIp: getClientIp(c),
    userAgent: getUserAgent(c),
  });
}

/**
 * Log admin operation.
 */
export function logAdminOperation(
  c: Context,
  action: string,
  resourceType?: string,
  resourceId?: string,
  success = true,
  metadata?: Record<string, unknown>
): string {
  const auth = extractAuthContext(c);
  return addAuditEvent({
    category: "admin",
    severity: success ? "info" : "error",
    action,
    resourceType,
    resourceId,
    success,
    performedBy: auth.performedBy,
    role: auth.role,
    clientIp: getClientIp(c),
    userAgent: getUserAgent(c),
    path: c.req.path,
    method: c.req.method,
    metadata,
  });
}

/**
 * Log data access.
 */
export function logDataAccess(
  c: Context,
  resourceType: string,
  action: string,
  resourceId?: string,
  isOwnData = true
): string {
  const auth = extractAuthContext(c);
  return addAuditEvent({
    category: "data_access",
    severity: isOwnData ? "info" : "warning",
    action: `${resourceType}:${action}`,
    resourceType,
    resourceId,
    success: true,
    performedBy: auth.performedBy,
    role: auth.role,
    clientIp: getClientIp(c),
    userAgent: getUserAgent(c),
    metadata: { isOwnData },
  });
}

/**
 * Log security event.
 */
export function logSecurityEvent(
  c: Context,
  action: string,
  severity: AuditEventSeverity,
  details?: Record<string, unknown>
): string {
  const auth = extractAuthContext(c);
  return addAuditEvent({
    category: "security",
    severity,
    action,
    success: severity !== "critical" && severity !== "error",
    performedBy: auth.performedBy,
    role: auth.role,
    clientIp: getClientIp(c),
    userAgent: getUserAgent(c),
    path: c.req.path,
    method: c.req.method,
    metadata: details,
  });
}

// ============================================================================
// Audit Log Export
// ============================================================================

/**
 * Export audit log as JSON.
 */
export function exportAuditLogAsJson(filters?: AuditLogFilters): string {
  const events = queryAuditLog(filters);
  return JSON.stringify(events, null, 2);
}

/**
 * Export audit log as CSV.
 */
export function exportAuditLogAsCsv(filters?: AuditLogFilters): string {
  const events = queryAuditLog(filters);

  const headers = [
    "id",
    "timestamp",
    "category",
    "severity",
    "action",
    "resourceType",
    "resourceId",
    "performedBy",
    "role",
    "success",
    "error",
    "clientIp",
    "userAgent",
    "path",
    "method",
  ];

  const rows = events.map((e) => [
    e.id,
    new Date(e.timestamp).toISOString(),
    e.category,
    e.severity,
    e.action,
    e.resourceType || "",
    e.resourceId || "",
    e.performedBy || "",
    e.role || "",
    e.success.toString(),
    e.error || "",
    e.clientIp || "",
    e.userAgent || "",
    e.path || "",
    e.method || "",
  ]);

  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

// ============================================================================
// Cleanup and Maintenance
// ============================================================================

/**
 * Clear old audit events based on retention policy.
 * In production, this would be handled by the database.
 */
export function applyAuditLogRetention(maxAgeMs: number): number {
  const cutoff = Date.now() - maxAgeMs;
  const beforeCount = AUDIT_LOG.length;

  // Remove old events
  for (let i = AUDIT_LOG.length - 1; i >= 0; i--) {
    if (AUDIT_LOG[i]!.timestamp < cutoff) {
      AUDIT_LOG.splice(i, 1);
    }
  }

  const removed = beforeCount - AUDIT_LOG.length;
  if (removed > 0) {
    logger.info("Applied audit log retention", {
      cutoff: new Date(cutoff).toISOString(),
      removed,
      remaining: AUDIT_LOG.length,
    });
  }

  return removed;
}

/**
 * Clear all audit events (use with caution).
 */
export function clearAuditLog(): number {
  const count = AUDIT_LOG.length;
  AUDIT_LOG.length = 0;
  logger.warn("Audit log cleared", { previousCount: count });
  return count;
}
