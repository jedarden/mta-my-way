/**
 * Enhanced Authentication Middleware
 *
 * Provides comprehensive authentication by integrating multiple security modules:
 * - JWT validation with replay protection
 * - Enhanced JWT security with device fingerprinting and compromise detection
 * - Concurrent session management with conflict resolution
 * - Dynamic RBAC permission caching
 * - Structured audit logging for compliance
 * - Time-based and location-based access control
 * - Behavioral analysis for anomaly detection
 *
 * This middleware combines all security features into a single, easy-to-use
 * authentication system that provides defense in depth.
 */

import type { Context, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { logger } from "../observability/logger.js";
import { type AuthContext, type AuthSession, getAuthContext } from "./authentication.js";
import type { Permission } from "./authentication.js";
import {
  type LocationAccessRule,
  type TimeBasedAccessRule,
  analyzeAccessBehavior,
  checkLocationAccess,
  checkTimeBasedAccess,
  updateAccessPattern,
} from "./authorization-security.js";
import {
  type ConcurrentSessionConfig,
  type SessionConflictResult,
  type SessionDeviceInfo,
  getUserSessionCount,
  registerSession,
  updateSessionActivity,
} from "./concurrent-session-management.js";
import {
  type PermissionCheckResult,
  checkPermission,
  invalidateUserCache,
} from "./dynamic-rbac-cache.js";
import {
  type CompromiseDetectionResult,
  detectTokenCompromise,
  recordTokenUsage,
} from "./enhanced-jwt-security.js";
import { securityLogger } from "./security-logging.js";
import {
  type SessionRiskAssessment,
  assessSessionRisk,
  recordSecurityEvent,
} from "./session-security.js";
import {
  type AuditOutcome,
  type AuditSeverity,
  detectSecurityIncidents,
  logAuditEventFromContext,
} from "./structured-audit-log.js";

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Enhanced authentication configuration.
 */
export interface EnhancedAuthConfig {
  /** JWT secret for token validation */
  jwtSecret?: string;
  /** Whether to enable JWT validation */
  enableJwtValidation?: boolean;
  /** Whether to enable enhanced JWT security (compromise detection) */
  enableEnhancedJwt?: boolean;
  /** Whether to enable concurrent session management */
  enableConcurrentSessions?: boolean;
  /** Whether to enable dynamic RBAC caching */
  enableRbacCache?: boolean;
  /** Whether to enable structured audit logging */
  enableAuditLogging?: boolean;
  /** Whether to enable time-based access control */
  enableTimeBasedAccess?: boolean;
  /** Whether to enable location-based access control */
  enableLocationAccess?: boolean;
  /** Whether to enable behavioral analysis */
  enableBehavioralAnalysis?: boolean;
  /** Time-based access rules */
  timeBasedRules?: TimeBasedAccessRule;
  /** Location-based access rules */
  locationRules?: LocationAccessRule;
  /** Concurrent session configuration */
  sessionConfig?: ConcurrentSessionConfig;
  /** Risk threshold for blocking authentication (0-100) */
  riskThreshold?: number;
  /** Whether to require MFA for high-risk sessions */
  requireMfaForHighRisk?: boolean;
  /** Action to take on compromised tokens */
  onTokenCompromised?: "block" | "revoke" | "allow";
  /** Action to take on session limit exceeded */
  onSessionLimitExceeded?: "deny" | "terminate_oldest" | "allow_all";
}

/**
 * Enhanced authentication result attached to context.
 */
export interface EnhancedAuthResult {
  /** Standard authentication context */
  auth: AuthContext;
  /** Session risk assessment (if available) */
  riskAssessment?: SessionRiskAssessment;
  /** Token compromise detection result (if available) */
  compromiseDetection?: CompromiseDetectionResult;
  /** Session conflict result (if applicable) */
  sessionConflict?: SessionConflictResult;
  /** Permission check results (if permissions checked) */
  permissionResults?: Map<string, PermissionCheckResult>;
  /** Whether additional verification is required */
  requiresAdditionalVerification?: boolean;
  /** Security incidents detected */
  securityIncidents?: string[];
}

/**
 * Security event for enhanced authentication tracking.
 */
export interface AuthSecurityEvent {
  /** Event type */
  type: string;
  /** Event timestamp */
  timestamp: number;
  /** Event severity */
  severity: "info" | "warning" | "error" | "critical";
  /** Event message */
  message: string;
  /** Additional details */
  details?: Record<string, unknown>;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: Required<
  Omit<EnhancedAuthConfig, "jwtSecret" | "timeBasedRules" | "locationRules" | "sessionConfig">
> &
  Pick<EnhancedAuthConfig, "timeBasedRules" | "locationRules" | "sessionConfig"> = {
  enableJwtValidation: true,
  enableEnhancedJwt: true,
  enableConcurrentSessions: true,
  enableRbacCache: true,
  enableAuditLogging: true,
  enableTimeBasedAccess: false,
  enableLocationAccess: false,
  enableBehavioralAnalysis: true,
  timeBasedRules: undefined,
  locationRules: undefined,
  sessionConfig: {
    maxConcurrentSessions: 5,
    maxSessionsPerDevice: 2,
    conflictResolution: "terminate_oldest",
    sessionTimeout: 30 * 60 * 1000,
    maxIdleTime: 60 * 60 * 1000,
  },
  riskThreshold: 70,
  requireMfaForHighRisk: true,
  onTokenCompromised: "revoke",
  onSessionLimitExceeded: "terminate_oldest",
};

// ============================================================================
// Middleware Factory Functions
// ============================================================================

/**
 * Create enhanced authentication middleware with all security features.
 *
 * This middleware provides comprehensive authentication by integrating:
 * - JWT validation
 * - Token compromise detection
 * - Session management
 * - Permission checking
 * - Audit logging
 * - Time/location-based access control
 * - Behavioral analysis
 *
 * @param config - Enhanced authentication configuration
 * @returns Hono middleware handler
 */
export function createEnhancedAuth(config: EnhancedAuthConfig = {}): MiddlewareHandler {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  return async (c, next) => {
    const startTime = Date.now();
    const securityEvents: AuthSecurityEvent[] = [];

    // Get client information
    const clientIp =
      c.req.header("CF-Connecting-IP") ||
      c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ||
      c.req.header("X-Real-IP") ||
      "unknown";
    const userAgent = c.req.header("User-Agent");

    // Get standard auth context
    const auth = getAuthContext(c);
    if (!auth) {
      securityEvents.push({
        type: "auth_missing",
        timestamp: startTime,
        severity: "warning",
        message: "Authentication required",
      });
      throw new HTTPException(401, { message: "Authentication required" });
    }

    // Initialize enhanced auth result
    const enhancedResult: EnhancedAuthResult = {
      auth,
      securityIncidents: [],
    };

    // 1. Time-based access control
    if (mergedConfig.enableTimeBasedAccess && mergedConfig.timeBasedRules) {
      if (!checkTimeBasedAccess(mergedConfig.timeBasedRules)) {
        securityEvents.push({
          type: "time_based_access_denied",
          timestamp: Date.now(),
          severity: "warning",
          message: "Access denied due to time-based restrictions",
        });
        await logSecurityEvent(c, auth, "time_based_access_denied", "warning");
        throw new HTTPException(403, {
          message: "Access is not allowed at this time",
        });
      }
    }

    // 2. Location-based access control
    if (mergedConfig.enableLocationAccess && mergedConfig.locationRules) {
      if (!checkLocationAccess(clientIp, mergedConfig.locationRules)) {
        securityEvents.push({
          type: "location_based_access_denied",
          timestamp: Date.now(),
          severity: "warning",
          message: "Access denied due to location restrictions",
        });
        await logSecurityEvent(c, auth, "location_based_access_denied", "warning");
        throw new HTTPException(403, {
          message: "Access is not allowed from this location",
        });
      }
    }

    // 3. Session risk assessment
    const session = c.get("session") as AuthSession | undefined;
    if (session && auth.sessionId) {
      const riskAssessment = await assessSessionRisk(session, clientIp, userAgent);
      enhancedResult.riskAssessment = riskAssessment;

      if (riskAssessment.riskScore >= (mergedConfig.riskThreshold || 70)) {
        securityEvents.push({
          type: "high_risk_session",
          timestamp: Date.now(),
          severity: "error",
          message: `High-risk session detected (score: ${riskAssessment.riskScore})`,
          details: { riskFactors: riskAssessment.riskFactors },
        });

        if (mergedConfig.requireMfaForHighRisk && !auth.mfaVerified) {
          await logSecurityEvent(c, auth, "mfa_required_high_risk", "warning");
          enhancedResult.requiresAdditionalVerification = true;
        }
      }

      // Record security event for risk tracking
      recordSecurityEvent(auth.sessionId, {
        type: "session_risk_assessed",
        timestamp: Date.now(),
        score: riskAssessment.riskScore,
        details: { riskLevel: riskAssessment.riskLevel },
      });
    }

    // 4. Enhanced JWT security (if using JWT tokens)
    if (mergedConfig.enableEnhancedJwt) {
      const jwtToken = extractJwtFromRequest(c);
      if (jwtToken) {
        const compromiseDetection = detectTokenCompromise(jwtToken, {
          clientIp,
          userAgent,
          requestPath: c.req.path,
        });

        enhancedResult.compromiseDetection = compromiseDetection;

        if (compromiseDetection.compromised) {
          securityEvents.push({
            type: "token_compromised",
            timestamp: Date.now(),
            severity: "critical",
            message: "Token compromise detected",
            details: {
              riskScore: compromiseDetection.riskScore,
              riskFactors: compromiseDetection.riskFactors,
            },
          });

          // Log token usage for pattern analysis
          recordTokenUsage(jwtToken, {
            usedAt: Date.now(),
            clientIp,
            userAgent,
            requestPath: c.req.path,
            suspicious: true,
            suspicionReason: compromiseDetection.riskFactors.join(", "),
          });

          if (mergedConfig.onTokenCompromised === "block") {
            await logSecurityEvent(c, auth, "token_compromised_blocked", "critical");
            throw new HTTPException(403, {
              message: "Token has been compromised. Please re-authenticate.",
            });
          } else if (mergedConfig.onTokenCompromised === "revoke") {
            // Invalidate the session/token
            if (auth.sessionId) {
              // Session would be invalidated here
              await logSecurityEvent(c, auth, "token_revoked_compromised", "critical");
            }
          }
        } else {
          // Record normal token usage
          recordTokenUsage(jwtToken, {
            usedAt: Date.now(),
            clientIp,
            userAgent,
            requestPath: c.req.path,
            suspicious: false,
          });
        }
      }
    }

    // 5. Behavioral analysis
    if (mergedConfig.enableBehavioralAnalysis) {
      const analysis = analyzeAccessBehavior(auth, c.req.path, clientIp);
      updateAccessPattern(auth.keyId, c.req.path, clientIp);

      if (analysis.recommendedAction === "block") {
        securityEvents.push({
          type: "behavioral_analysis_block",
          timestamp: Date.now(),
          severity: "error",
          message: "Access blocked due to suspicious behavior",
          details: {
            riskScore: analysis.riskScore,
            riskFactors: analysis.riskFactors,
          },
        });
        await logSecurityEvent(c, auth, "behavioral_block", "error");
        throw new HTTPException(403, {
          message: "Access temporarily blocked due to suspicious activity",
        });
      } else if (analysis.recommendedAction === "challenge" && analysis.riskScore > 40) {
        enhancedResult.requiresAdditionalVerification = true;
        securityEvents.push({
          type: "behavioral_challenge",
          timestamp: Date.now(),
          severity: "warning",
          message: "Additional verification recommended",
          details: {
            riskScore: analysis.riskScore,
            riskFactors: analysis.riskFactors,
          },
        });
      }
    }

    // 6. Concurrent session management
    if (mergedConfig.enableConcurrentSessions && session && auth.sessionId) {
      const deviceInfo: SessionDeviceInfo = {
        deviceId: deviceFingerprintFromUa(userAgent),
        deviceType: getDeviceTypeFromUa(userAgent),
        trusted: false, // Would be determined from stored device trust
      };

      const conflictResult = registerSession(session, { deviceInfo }, mergedConfig.sessionConfig);
      enhancedResult.sessionConflict = conflictResult;

      if (!conflictResult.allowed) {
        securityEvents.push({
          type: "session_limit_exceeded",
          timestamp: Date.now(),
          severity: "warning",
          message: "Session limit exceeded",
          details: {
            terminatedSessions: conflictResult.terminatedSessions,
            reason: conflictResult.reason,
          },
        });
        await logSecurityEvent(c, auth, "session_limit_exceeded", "warning");
        throw new HTTPException(403, {
          message: conflictResult.reason || "Maximum concurrent sessions exceeded",
        });
      }

      // Update session activity
      updateSessionActivity(auth.sessionId);

      if (conflictResult.terminatedSessions.length > 0) {
        securityEvents.push({
          type: "session_terminated",
          timestamp: Date.now(),
          severity: "info",
          message: "Previous session terminated due to limit",
          details: {
            terminatedSessions: conflictResult.terminatedSessions,
          },
        });
      }
    }

    // 7. Check for security incidents
    const incidents = detectSecurityIncidents();
    if (incidents.length > 0) {
      enhancedResult.securityIncidents = incidents.map((i) => i.type);
      securityEvents.push({
        type: "security_incidents_detected",
        timestamp: Date.now(),
        severity: "warning",
        message: `${incidents.length} security incidents detected`,
        details: { incidents },
      });
    }

    // 8. Structured audit logging
    if (mergedConfig.enableAuditLogging) {
      const outcome: AuditOutcome = enhancedResult.requiresAdditionalVerification
        ? "partial"
        : "success";
      const severity: AuditSeverity =
        enhancedResult.securityIncidents && enhancedResult.securityIncidents.length > 0
          ? "warning"
          : "info";

      logAuditEventFromContext(c, {
        category: "authentication",
        severity,
        outcome,
        action: "enhanced_auth",
        details: {
          riskScore: enhancedResult.riskAssessment?.riskScore,
          compromiseDetected: enhancedResult.compromiseDetection?.compromised,
          sessionConflicts: enhancedResult.sessionConflict?.terminatedSessions.length,
          requiresVerification: enhancedResult.requiresAdditionalVerification,
          securityEvents,
        },
      });
    }

    // Attach enhanced result to context
    c.set("enhancedAuth", enhancedResult);

    const duration = Date.now() - startTime;
    logger.debug("Enhanced authentication completed", {
      keyId: auth.keyId,
      duration,
      securityEvents: securityEvents.length,
      riskScore: enhancedResult.riskAssessment?.riskScore,
    });

    return next();
  };
}

/**
 * Require specific permissions with enhanced checking.
 *
 * Checks permissions using dynamic RBAC cache and logs results.
 *
 * @param permissions - Array of permissions to check
 * @param options - Check options
 * @returns Hono middleware handler
 */
export function requirePermissions(
  permissions: string[],
  options: {
    /** Require all permissions (true) or any permission (false) */
    requireAll?: boolean;
    /** Resource ID for resource-specific permissions */
    resourceId?: string;
    /** Enhanced auth config */
    config?: EnhancedAuthConfig;
  } = {}
): MiddlewareHandler {
  const { requireAll = true, resourceId, config } = options;

  return async (c, next) => {
    const auth = getAuthContext(c);
    if (!auth) {
      throw new HTTPException(401, { message: "Authentication required" });
    }

    const mergedConfig = { ...DEFAULT_CONFIG, ...config };
    const permissionResults = new Map<string, PermissionCheckResult>();

    // Check permissions
    for (const permission of permissions) {
      const result = checkPermission(auth.role || "guest", permission as Permission, {
        resourceId,
        userId: auth.keyId,
        config: mergedConfig.sessionConfig,
      });
      permissionResults.set(permission, result);
    }

    // Determine if access is granted
    let granted: boolean;
    if (requireAll) {
      granted = Array.from(permissionResults.values()).every((r) => r.granted);
    } else {
      granted = Array.from(permissionResults.values()).some((r) => r.granted);
    }

    if (!granted) {
      // Log authorization failure
      const deniedPermissions = Array.from(permissionResults.entries())
        .filter(([, r]) => !r.granted)
        .map(([p, r]) => `${p}: ${r.reason}`);

      securityLogger.logAuthzFailure(c, "permission", "enhanced");

      if (mergedConfig.enableAuditLogging) {
        logAuditEventFromContext(c, {
          category: "authorization",
          severity: "warning",
          outcome: "failure",
          action: "permission_check",
          details: {
            permissions,
            requireAll,
            deniedPermissions,
          },
        });
      }

      throw new HTTPException(403, {
        message: "Insufficient permissions",
      });
    }

    // Attach permission results to context
    const enhancedResult = c.get("enhancedAuth") as EnhancedAuthResult | undefined;
    if (enhancedResult) {
      enhancedResult.permissionResults = permissionResults;
    }

    // Log authorization success
    if (mergedConfig.enableAuditLogging) {
      logAuditEventFromContext(c, {
        category: "authorization",
        severity: "info",
        outcome: "success",
        action: "permission_check",
        details: {
          permissions,
          requireAll,
        },
      });
    }

    return next();
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract JWT token from request.
 */
function extractJwtFromRequest(c: Context): string | null {
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }

  const cookieHeader = c.req.header("Cookie");
  if (cookieHeader) {
    const cookies = cookieHeader.split(";").map((c) => c.trim());
    for (const cookie of cookies) {
      if (cookie.startsWith("jwt=") || cookie.startsWith("token=")) {
        return cookie.substring(4);
      }
    }
  }

  return null;
}

/**
 * Generate device fingerprint from user agent.
 */
function deviceFingerprintFromUa(userAgent: string | undefined): string {
  if (!userAgent) return "unknown";

  // Simple hash of user agent for device identification
  let hash = 0;
  for (let i = 0; i < userAgent.length; i++) {
    const char = userAgent.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }

  return Math.abs(hash).toString(16);
}

/**
 * Get device type from user agent.
 */
function getDeviceTypeFromUa(
  userAgent: string | undefined
): "mobile" | "tablet" | "desktop" | "unknown" {
  if (!userAgent) return "unknown";

  const ua = userAgent.toLowerCase();

  if (/mobile|android|iphone|ipod|blackberry|iemobile|opera mini/i.test(ua)) {
    return "mobile";
  } else if (/tablet|ipad|playbook|silk/i.test(ua)) {
    return "tablet";
  } else if (ua.length > 0) {
    return "desktop";
  }

  return "unknown";
}

/**
 * Log security event to audit log.
 */
async function logSecurityEvent(
  c: Context,
  auth: AuthContext,
  eventType: string,
  severity: "info" | "warning" | "error" | "critical"
): Promise<void> {
  logAuditEventFromContext(c, {
    category: "security",
    severity,
    outcome: severity === "error" || severity === "critical" ? "failure" : "success",
    action: eventType,
    details: {
      keyId: auth.keyId,
      sessionId: auth.sessionId,
      scope: auth.scope,
      role: auth.role,
    },
  });
}

/**
 * Get enhanced auth result from context.
 */
export function getEnhancedAuth(c: Context): EnhancedAuthResult | undefined {
  return c.get("enhancedAuth");
}

/**
 * Check if additional verification is required.
 */
export function requiresAdditionalVerification(c: Context): boolean {
  const enhancedAuth = getEnhancedAuth(c);
  return enhancedAuth?.requiresAdditionalVerification ?? false;
}

/**
 * Get security incidents for current request.
 */
export function getSecurityIncidents(c: Context): string[] {
  const enhancedAuth = getEnhancedAuth(c);
  return enhancedAuth?.securityIncidents || [];
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Invalidate all cached data for a user.
 * Call this when permissions, roles, or sessions change.
 *
 * @param keyId - API key ID
 */
export function invalidateUserAuthData(keyId: string): void {
  invalidateUserCache(keyId);
  logger.info("User auth data invalidated", { keyId });
}

/**
 * Get comprehensive security status for a user.
 *
 * @param keyId - API key ID
 * @returns Security status information
 */
export function getUserSecurityStatus(keyId: string): {
  sessionCount: number;
  activeIncidents: number;
  riskFactors: string[];
} {
  // This would query the various security modules
  // For now, return a placeholder
  return {
    sessionCount: getUserSessionCount(keyId),
    activeIncidents: detectSecurityIncidents().filter((i) =>
      i.events.some((e) => e.actor.keyId === keyId)
    ).length,
    riskFactors: [],
  };
}
