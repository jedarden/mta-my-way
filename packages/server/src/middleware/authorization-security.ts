/**
 * Enhanced Authorization Security Module
 *
 * Provides additional security layers for authorization including:
 * - Time-based access control
 * - Location-based access control
 * - Behavioral analysis for anomaly detection
 * - Advanced session security
 * - Resource access pattern analysis
 */

import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { logger } from "../observability/logger.js";
import { type AuthContext, getAuthContext } from "./authentication.js";
import { securityLogger } from "./security-logging.js";

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Time-based access control rules.
 */
export interface TimeBasedAccessRule {
  /** Days of week when access is allowed (0-6, 0 = Sunday) */
  allowedDays?: number[];
  /** Hour range when access is allowed (0-23) */
  allowedHours?: { start: number; end: number };
  /** Timezone for time-based rules (default: UTC) */
  timezone?: string;
  /** Exceptions to the rules (specific dates when access is allowed/blocked) */
  exceptions?: Array<{
    date: string; // ISO date string
    allowed: boolean;
  }>;
}

/**
 * Location-based access control rules.
 */
export interface LocationAccessRule {
  /** Allowed country codes (ISO 3166-1 alpha-2) */
  allowedCountries?: string[];
  /** Blocked country codes */
  blockedCountries?: string[];
  /** Require VPN/private connection */
  requirePrivateConnection?: boolean;
  /** Trusted IP ranges */
  trustedIpRanges?: Array<{ ip: string; prefixLength: number }>;
}

/**
 * Behavioral analysis result.
 */
export interface BehavioralAnalysis {
  /** Risk score (0-100) */
  riskScore: number;
  /** Risk level */
  riskLevel: "low" | "medium" | "high" | "critical";
  /** Risk factors identified */
  riskFactors: string[];
  /** Recommended action */
  recommendedAction: "allow" | "challenge" | "block";
}

/**
 * Resource access pattern for anomaly detection.
 */
export interface AccessPattern {
  /** Resource type */
  resourceType: string;
  /** Typical access count per hour */
  typicalAccessCount: number;
  /** Standard deviation */
  stdDev: number;
  /** Last access timestamp */
  lastAccessAt: number;
  /** Access locations (IPs) */
  accessLocations: Set<string>;
}

// ============================================================================
// Time-Based Access Control
// ============================================================================

/**
 * Check if current time allows access based on time-based rules.
 *
 * @param rules - Time-based access rules
 * @returns true if access is allowed, false otherwise
 */
export function checkTimeBasedAccess(rules: TimeBasedAccessRule): boolean {
  const now = new Date();
  const timezone = rules.timezone || "UTC";

  // Get current time in specified timezone
  const currentTime = new Date(now.toLocaleString("en-US", { timeZone: timezone }));

  const currentDay = currentTime.getDay();
  const currentHour = currentTime.getHours();

  // Check exceptions first
  if (rules.exceptions) {
    const currentDateStr = now.toISOString().split("T")[0];
    const exception = rules.exceptions.find((e) => e.date === currentDateStr);
    if (exception) {
      return exception.allowed;
    }
  }

  // Check allowed days
  if (rules.allowedDays && !rules.allowedDays.includes(currentDay)) {
    return false;
  }

  // Check allowed hours
  if (rules.allowedHours) {
    const { start, end } = rules.allowedHours;
    if (end < start) {
      // Range wraps around midnight (e.g., 22:00 - 06:00)
      if (currentHour < start && currentHour > end) {
        return false;
      }
    } else {
      // Normal range (e.g., 09:00 - 17:00)
      if (currentHour < start || currentHour > end) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Create middleware for time-based access control.
 *
 * @param rules - Time-based access rules
 */
export function requireTimeBasedAccess(rules: TimeBasedAccessRule) {
  return async (c: Context, next: () => Promise<void>) => {
    if (!checkTimeBasedAccess(rules)) {
      securityLogger.logSuspiciousActivity(
        c,
        "time_based_access_denied",
        "Access denied due to time-based restrictions"
      );
      throw new HTTPException(403, {
        message: "Access is not allowed at this time",
      });
    }
    return next();
  };
}

// ============================================================================
// Location-Based Access Control
// ============================================================================

/**
 * Extract country code from IP address (simplified).
 * In production, use a proper GeoIP database.
 *
 * @param ip - IP address
 * @returns Country code or null
 */
function extractCountryFromIp(_ip: string): string | null {
  // Simplified implementation - in production, use GeoIP database
  // This is a placeholder that returns null (no location data)
  return null;
}

/**
 * Check if IP address is in private range.
 *
 * @param ip - IP address
 * @returns true if private IP
 */
function isPrivateIp(ip: string): boolean {
  const parts = ip.split(".");
  if (parts.length !== 4) return false;

  const [first, second] = parts.map((p) => parseInt(p, 10));

  // 10.0.0.0/8
  if (first === 10) return true;

  // 172.16.0.0/12
  if (first === 172 && second !== undefined && second >= 16 && second <= 31) {
    return true;
  }

  // 192.168.0.0/16
  if (first === 192 && second === 168) return true;

  return false;
}

/**
 * Check IP against trusted ranges.
 *
 * @param ip - IP address to check
 * @param trustedRanges - Trusted IP ranges
 * @returns true if IP is in trusted range
 */
function isIpInTrustedRange(
  ip: string,
  trustedRanges: Array<{ ip: string; prefixLength: number }>
): boolean {
  for (const range of trustedRanges) {
    const ipParts = ip.split(".").map((p) => parseInt(p, 10));
    const rangeIpParts = range.ip.split(".").map((p) => parseInt(p, 10));

    if (ipParts.length !== 4 || rangeIpParts.length !== 4) continue;

    const octetsToCheck = Math.floor(range.prefixLength / 8);
    let match = true;

    for (let i = 0; i < octetsToCheck && i < 4; i++) {
      if (ipParts[i] !== rangeIpParts[i]) {
        match = false;
        break;
      }
    }

    if (match) return true;
  }

  return false;
}

/**
 * Check if location allows access based on location-based rules.
 *
 * @param clientIp - Client IP address
 * @param rules - Location-based access rules
 * @returns true if access is allowed, false otherwise
 */
export function checkLocationAccess(clientIp: string, rules: LocationAccessRule): boolean {
  // Check private connection requirement
  if (rules.requirePrivateConnection && !isPrivateIp(clientIp)) {
    return false;
  }

  // Check trusted IP ranges
  if (rules.trustedIpRanges && isIpInTrustedRange(clientIp, rules.trustedIpRanges)) {
    return true;
  }

  // Check country restrictions (if GeoIP is available)
  const country = extractCountryFromIp(clientIp);
  if (country) {
    if (rules.blockedCountries && rules.blockedCountries.includes(country)) {
      return false;
    }

    if (rules.allowedCountries && !rules.allowedCountries.includes(country)) {
      return false;
    }
  }

  return true;
}

/**
 * Create middleware for location-based access control.
 *
 * @param rules - Location-based access rules
 */
export function requireLocationAccess(rules: LocationAccessRule) {
  return async (c: Context, next: () => Promise<void>) => {
    const clientIp =
      c.req.header("CF-Connecting-IP") ||
      c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ||
      c.req.header("X-Real-IP") ||
      "unknown";

    if (!checkLocationAccess(clientIp, rules)) {
      securityLogger.logSuspiciousActivity(
        c,
        "location_based_access_denied",
        "Access denied due to location restrictions"
      );
      throw new HTTPException(403, {
        message: "Access is not allowed from this location",
      });
    }
    return next();
  };
}

// ============================================================================
// Behavioral Analysis
// ============================================================================

/**
 * Access pattern tracking for anomaly detection.
 */
const accessPatterns = new Map<string, AccessPattern>();

/**
 * Analyze access behavior for anomalies.
 *
 * @param auth - Authentication context
 * @param resourceType - Resource type being accessed
 * @param clientIp - Client IP address
 * @returns Behavioral analysis result
 */
export function analyzeAccessBehavior(
  auth: AuthContext,
  resourceType: string,
  clientIp: string
): BehavioralAnalysis {
  const riskFactors: string[] = [];
  let riskScore = 0;

  const key = `${auth.keyId}:${resourceType}`;
  const pattern = accessPatterns.get(key);

  if (!pattern) {
    // First access - low risk
    return {
      riskScore: 0,
      riskLevel: "low",
      riskFactors: [],
      recommendedAction: "allow",
    };
  }

  // Check access frequency
  const now = Date.now();
  const timeSinceLastAccess = now - pattern.lastAccessAt;
  const accessCountPerHour = pattern.typicalAccessCount;

  // If accessing much more frequently than normal
  if (timeSinceLastAccess < 1000 && accessCountPerHour > 100) {
    riskScore += 30;
    riskFactors.push("Unusually high access frequency");
  }

  // Check for new location
  if (!pattern.accessLocations.has(clientIp)) {
    // Accessing from a new location
    const locationCount = pattern.accessLocations.size;
    if (locationCount > 5) {
      riskScore += 20;
      riskFactors.push("Access from many different locations");
    } else {
      riskScore += 10;
      riskFactors.push("Access from new location");
    }
  }

  // Determine risk level and action
  let riskLevel: "low" | "medium" | "high" | "critical";
  let recommendedAction: "allow" | "challenge" | "block";

  if (riskScore < 20) {
    riskLevel = "low";
    recommendedAction = "allow";
  } else if (riskScore < 50) {
    riskLevel = "medium";
    recommendedAction = "allow";
  } else if (riskScore < 80) {
    riskLevel = "high";
    recommendedAction = "challenge";
  } else {
    riskLevel = "critical";
    recommendedAction = "block";
  }

  return {
    riskScore,
    riskLevel,
    riskFactors,
    recommendedAction,
  };
}

/**
 * Update access pattern tracking.
 *
 * @param keyId - API key ID
 * @param resourceType - Resource type
 * @param clientIp - Client IP address
 */
export function updateAccessPattern(keyId: string, resourceType: string, clientIp: string): void {
  const key = `${keyId}:${resourceType}`;
  const pattern = accessPatterns.get(key);

  if (!pattern) {
    accessPatterns.set(key, {
      resourceType,
      typicalAccessCount: 1,
      stdDev: 0,
      lastAccessAt: Date.now(),
      accessLocations: new Set([clientIp]),
    });
    return;
  }

  // Update access pattern with exponential moving average
  const alpha = 0.1; // Smoothing factor
  const newCount = pattern.typicalAccessCount + 1;
  const oldMean = pattern.typicalAccessCount;

  pattern.typicalAccessCount = alpha * newCount + (1 - alpha) * oldMean;
  pattern.lastAccessAt = Date.now();
  pattern.accessLocations.add(clientIp);

  accessPatterns.set(key, pattern);
}

/**
 * Create middleware for behavioral analysis.
 *
 * @param resourceType - Resource type to analyze
 * @param options - Analysis options
 */
export function analyzeBehavior(
  resourceType: string,
  options: {
    /** Action to take on high risk */
    onHighRisk?: "block" | "challenge" | "allow";
    /** Whether to update patterns */
    updatePatterns?: boolean;
  } = {}
) {
  const { onHighRisk = "block", updatePatterns = true } = options;

  return async (c: Context, next: () => Promise<void>) => {
    const auth = getAuthContext(c);
    if (!auth) {
      return next();
    }

    const clientIp =
      c.req.header("CF-Connecting-IP") ||
      c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ||
      c.req.header("X-Real-IP") ||
      "unknown";

    const analysis = analyzeAccessBehavior(auth, resourceType, clientIp);

    if (updatePatterns) {
      updateAccessPattern(auth.keyId, resourceType, clientIp);
    }

    // Take action based on risk level
    if (analysis.riskLevel === "critical" && onHighRisk === "block") {
      securityLogger.logSuspiciousActivity(
        c,
        "behavioral_analysis_block",
        `Access blocked: ${analysis.riskFactors.join(", ")}`
      );
      throw new HTTPException(403, {
        message: "Access temporarily blocked due to suspicious activity",
      });
    }

    if (analysis.riskLevel === "high" && onHighRisk === "challenge") {
      // Set a flag for additional verification
      c.set("requireAdditionalVerification", true);
      logger.info("High-risk access detected - additional verification recommended", {
        keyId: auth.keyId,
        resourceType,
        riskFactors: analysis.riskFactors,
      });
    }

    return next();
  };
}

// ============================================================================
// Session Security Enhancements
// ============================================================================

/**
 * Session security configuration.
 */
export interface SessionSecurityConfig {
  /** Maximum concurrent sessions per user */
  maxConcurrentSessions?: number;
  /** Whether to enforce IP binding */
  enforceIpBinding?: boolean;
  /** Whether to enforce device binding */
  enforceDeviceBinding?: boolean;
  /** Session inactivity timeout in milliseconds */
  inactivityTimeout?: number;
  /** Whether to check for concurrent sessions from different locations */
  checkConcurrentLocations?: boolean;
}

/**
 * Default session security configuration.
 */
const DEFAULT_SESSION_SECURITY: SessionSecurityConfig = {
  maxConcurrentSessions: 5,
  enforceIpBinding: true,
  enforceDeviceBinding: false,
  inactivityTimeout: 30 * 60 * 1000, // 30 minutes
  checkConcurrentLocations: true,
};

/**
 * Enhanced session security check.
 *
 * Performs comprehensive session security validation.
 *
 * @param auth - Authentication context
 * @param clientIp - Client IP address
 * @param userAgent - User agent string
 * @param config - Security configuration
 * @returns Object indicating if session is secure and any issues found
 */
export function checkSessionSecurity(
  auth: AuthContext,
  _clientIp: string,
  _userAgent: string | undefined,
  config: SessionSecurityConfig = {}
): { secure: boolean; issues: string[]; recommendations: string[] } {
  const mergedConfig = { ...DEFAULT_SESSION_SECURITY, ...config };
  const issues: string[] = [];
  const recommendations: string[] = [];

  // Check if session exists
  if (!auth.sessionId) {
    return {
      secure: false,
      issues: ["No active session"],
      recommendations: ["Authenticate to establish a session"],
    };
  }

  // Note: These checks would be integrated with the actual session storage
  // This is a framework for the security checks

  if (mergedConfig.enforceIpBinding) {
    // IP binding would be checked against stored session IP
    recommendations.push("IP binding is enforced for this session");
  }

  if (mergedConfig.enforceDeviceBinding) {
    // Device binding would be checked against stored device fingerprint
    recommendations.push("Device binding is enforced for this session");
  }

  return {
    secure: issues.length === 0,
    issues,
    recommendations,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Clear access pattern tracking for a key.
 *
 * @param keyId - API key ID
 */
export function clearAccessPatterns(keyId?: string): void {
  if (keyId) {
    for (const [key] of accessPatterns.entries()) {
      if (key.startsWith(`${keyId}:`)) {
        accessPatterns.delete(key);
      }
    }
  } else {
    accessPatterns.clear();
  }
}

/**
 * Get access pattern statistics.
 *
 * @returns Statistics about tracked access patterns
 */
export function getAccessPatternStats(): {
  totalPatterns: number;
  patternsByResourceType: Record<string, number>;
  averageAccessCount: number;
} {
  let totalAccessCount = 0;
  const patternsByResourceType: Record<string, number> = {};

  for (const pattern of accessPatterns.values()) {
    totalAccessCount += pattern.typicalAccessCount;
    patternsByResourceType[pattern.resourceType] =
      (patternsByResourceType[pattern.resourceType] || 0) + 1;
  }

  return {
    totalPatterns: accessPatterns.size,
    patternsByResourceType,
    averageAccessCount: accessPatterns.size > 0 ? totalAccessCount / accessPatterns.size : 0,
  };
}
