/**
 * Security event logging middleware for Hono.
 *
 * Provides centralized logging for security-related events including:
 * - Authentication failures
 * - Authorization failures
 * - Rate limit exceeded
 * - Input validation failures
 * - Suspicious request patterns
 * - Blocked attacks
 */

import type { Context, MiddlewareHandler } from "hono";

/**
 * Security event severity levels.
 */
type SecuritySeverity = "low" | "medium" | "high" | "critical";

/**
 * Security event types.
 */
type SecurityEventType =
  | "auth_failure"
  | "authz_failure"
  | "rate_limit_exceeded"
  | "input_validation_failed"
  | "path_traversal_blocked"
  | "hpp_blocked"
  | "suspicious_request"
  | "blocked_attack"
  | "data_exfiltration_attempt"
  | "unusual_activity";

/**
 * Security event log entry.
 */
interface SecurityEvent {
  event: SecurityEventType;
  timestamp: string;
  severity: SecuritySeverity;
  ip?: string;
  userAgent?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  details?: Record<string, unknown>;
}

/**
 * Security event logger options.
 */
interface SecurityLoggerOptions {
  /** Minimum severity to log (default: "low") */
  minSeverity?: SecuritySeverity;
  /** Include user agent in logs (default: true) */
  includeUserAgent?: boolean;
  /** Include full request path (default: true, set false for PII) */
  includePath?: boolean;
  /** Custom log function (default: console.warn) */
  logFn?: (event: SecurityEvent) => void;
  /** Sanitize PII from paths (default: true) */
  sanitizePII?: boolean;
}

/**
 * Default log function - outputs to console.warn for security events.
 */
function defaultLogFn(event: SecurityEvent): void {
  console.warn(JSON.stringify(event));
}

/**
 * Extract client IP address from request headers.
 *
 * Checks Cloudflare connecting IP, X-Forwarded-For, and falls back
 * to a generic identifier.
 */
function extractClientIp(c: Context): string {
  return (
    c.req.header("CF-Connecting-IP") ||
    c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ||
    c.req.header("X-Real-IP") ||
    "unknown"
  );
}

/**
 * Extract user agent from request headers.
 */
function extractUserAgent(c: Context): string | undefined {
  // Handle cases where context might be incomplete (e.g., utility functions)
  if (!c?.req?.header) return undefined;
  return c.req.header("User-Agent") || undefined;
}

/**
 * Sanitize PII from request path.
 *
 * Removes potential PII like email addresses, phone numbers, and IDs
 * from the path before logging.
 */
function sanitizePathForLogging(path: string): string {
  // Remove potential IDs (UUIDs, numbers)
  let sanitized = path.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    ":id"
  );
  sanitized = sanitized.replace(/\b\d{10,}\b/g, ":id"); // Long numbers
  sanitized = sanitized.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, ":email");
  return sanitized;
}

/**
 * Severity order for comparison.
 */
const SEVERITY_ORDER: Record<SecuritySeverity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

/**
 * Check if a severity meets the minimum threshold.
 */
function meetsMinSeverity(severity: SecuritySeverity, min: SecuritySeverity): boolean {
  return SEVERITY_ORDER[severity] >= SEVERITY_ORDER[min];
}

/**
 * Security event logger class.
 *
 * Provides methods to log different types of security events.
 */
export class SecurityEventLogger {
  private options: Required<SecurityLoggerOptions>;

  constructor(options: SecurityLoggerOptions = {}) {
    this.options = {
      minSeverity: options.minSeverity ?? "low",
      includeUserAgent: options.includeUserAgent ?? true,
      includePath: options.includePath ?? true,
      logFn: options.logFn ?? defaultLogFn,
      sanitizePII: options.sanitizePII ?? true,
    };
  }

  /**
   * Log a security event.
   */
  log(
    type: SecurityEventType,
    severity: SecuritySeverity,
    context: Context,
    details?: Record<string, unknown>
  ): void {
    if (!meetsMinSeverity(severity, this.options.minSeverity)) {
      return;
    }

    const event: SecurityEvent = {
      event: type,
      timestamp: new Date().toISOString(),
      severity,
    };

    if (this.options.includeUserAgent) {
      event.userAgent = extractUserAgent(context);
    }

    event.ip = extractClientIp(context);
    event.method = context.req.method;
    event.statusCode = context.res.status;

    if (this.options.includePath) {
      event.path = this.options.sanitizePII
        ? sanitizePathForLogging(context.req.path)
        : context.req.path;
    }

    if (details) {
      event.details = details;
    }

    this.options.logFn(event);
  }

  /**
   * Log authentication failure.
   */
  logAuthFailure(c: Context, reason: string): void {
    this.log("auth_failure", "high", c, { reason });
  }

  /**
   * Log authorization failure.
   */
  logAuthzFailure(c: Context, resource: string, action: string): void {
    this.log("authz_failure", "medium", c, { resource, action });
  }

  /**
   * Log rate limit exceeded.
   */
  logRateLimitExceeded(c: Context, limit: number, window: number): void {
    this.log("rate_limit_exceeded", "medium", c, { limit, window });
  }

  /**
   * Log input validation failure.
   */
  logInputValidationFailure(c: Context, field: string, reason: string): void {
    this.log("input_validation_failed", "low", c, { field, reason });
  }

  /**
   * Log path traversal attempt blocked.
   */
  logPathTraversalBlocked(c: Context, path: string): void {
    this.log("path_traversal_blocked", "high", c, {
      detectedPath: this.options.sanitizePII ? sanitizePathForLogging(path) : path,
    });
  }

  /**
   * Log HTTP parameter pollution attempt blocked.
   */
  logHPPBlocked(c: Context, parameters: string[]): void {
    this.log("hpp_blocked", "medium", c, { parameters });
  }

  /**
   * Log suspicious request pattern.
   */
  logSuspiciousRequest(c: Context, pattern: string, description: string): void {
    this.log("suspicious_request", "medium", c, { pattern, description });
  }

  /**
   * Log blocked attack.
   */
  logBlockedAttack(c: Context, attackType: string, description: string): void {
    this.log("blocked_attack", "critical", c, { attackType, description });
  }

  /**
   * Log data exfiltration attempt.
   */
  logDataExfiltrationAttempt(c: Context, method: string, target: string): void {
    this.log("data_exfiltration_attempt", "critical", c, { method, target });
  }

  /**
   * Log unusual activity.
   */
  logUnusualActivity(c: Context, activityType: string, description: string): void {
    this.log("unusual_activity", "low", c, { activityType, description });
  }

  /**
   * Log suspicious activity with severity level.
   */
  logSuspiciousActivity(
    c: Context,
    activityType: string,
    description: string,
    severity: SecuritySeverity = "medium"
  ): void {
    this.log("suspicious_request", severity, c, { activityType, description });
  }
}

/**
 * Global default security event logger.
 */
const defaultLogger = new SecurityEventLogger();

/**
 * Security event logging middleware factory.
 *
 * Creates a middleware that logs security events based on response
 * status codes and other indicators.
 *
 * This middleware automatically logs:
 * - 4xx client errors (potential attacks)
 * - 5xx server errors (potential issues)
 * - Requests with suspicious patterns
 */
export function securityLogging(options: SecurityLoggerOptions = {}): MiddlewareHandler {
  const logger = new SecurityEventLogger(options);

  return async (c, next) => {
    await next();

    // Log based on response status
    const status = c.res.status;

    if (status >= 400 && status < 500) {
      // Client errors - may indicate attack attempts
      if (status === 401 || status === 403) {
        logger.logAuthFailure(c, `HTTP ${status}`);
      } else if (status === 429) {
        logger.logRateLimitExceeded(c, 0, 0);
      } else if (status === 400) {
        logger.logInputValidationFailure(c, "request", "Bad Request");
      }
    } else if (status >= 500) {
      // Server errors - may indicate issues
      logger.log("unusual_activity", "medium", c, {
        activityType: "server_error",
        description: `HTTP ${status}`,
      });
    }
  };
}

/**
 * Export the default logger instance for use in other modules.
 */
export { defaultLogger as securityLogger };
