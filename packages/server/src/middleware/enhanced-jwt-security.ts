/**
 * Enhanced JWT Security Module
 *
 * Extends JWT validation with advanced security features including:
 * - Token theft detection through geographic analysis
 * - Device fingerprinting for token binding
 * - Token usage pattern analysis
 * - Suspicious activity detection
 * - Token compromise response
 * - Enhanced token revocation
 *
 * Security Best Practices:
 * - Bind tokens to specific devices and locations
 * - Detect anomalous token usage patterns
 * - Implement automatic token revocation on compromise
 * - Provide detailed audit trail for token operations
 */

import { logger } from "../observability/logger.js";
import { securityLogger } from "./security-logging.js";

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Device fingerprint for token binding.
 */
export interface DeviceFingerprint {
  /** Unique device identifier */
  deviceId: string;
  /** User agent hash */
  userAgentHash: string;
  /** Device type */
  deviceType: "mobile" | "tablet" | "desktop" | "unknown";
  /** OS family */
  osFamily?: string;
  /** Browser family */
  browserFamily?: string;
  /** IP address */
  ipAddress?: string;
  /** First seen timestamp */
  firstSeenAt: number;
  /** Last seen timestamp */
  lastSeenAt: number;
  /** Trust level */
  trustLevel: "unknown" | "trusted" | "compromised";
}

/**
 * Token usage record for pattern analysis.
 */
export interface TokenUsageRecord {
  /** Token ID (jti claim) */
  tokenId: string;
  /** Usage timestamp */
  usedAt: number;
  /** Client IP address */
  clientIp: string;
  /** User agent */
  userAgent?: string;
  /** Request path */
  requestPath?: string;
  /** Geographic location (if available) */
  location?: {
    country?: string;
    city?: string;
    coordinates?: { lat: number; lon: number };
  };
  /** Device fingerprint */
  deviceFingerprint?: string;
  /** Whether usage was flagged as suspicious */
  suspicious: boolean;
  /** Suspicion reason (if flagged) */
  suspicionReason?: string;
}

/**
 * Token compromise detection result.
 */
export interface CompromiseDetectionResult {
  /** Whether compromise is suspected */
  compromised: boolean;
  /** Risk score (0-100) */
  riskScore: number;
  /** Risk factors identified */
  riskFactors: string[];
  /** Recommended action */
  recommendedAction: "allow" | "challenge" | "revoke" | "block";
  /** Detailed analysis */
  analysis: {
    /** Geographic anomaly detected */
    geographicAnomaly: boolean;
    /** Device anomaly detected */
    deviceAnomaly: boolean;
    /** Time-based anomaly detected */
    timeAnomaly: boolean;
    /** Usage frequency anomaly detected */
    frequencyAnomaly: boolean;
  };
}

/**
 * Enhanced JWT validation options.
 */
export interface EnhancedJwtValidationOptions {
  /** Enable device binding */
  enableDeviceBinding?: boolean;
  /** Enable geographic validation */
  enableGeographicValidation?: boolean;
  /** Enable usage pattern analysis */
  enablePatternAnalysis?: boolean;
  /** Maximum geographic distance change (km, default: 1000) */
  maxGeoDistance?: number;
  /** Maximum time-based anomaly threshold (hours, default: 12) */
  maxTimeAnomaly?: number;
  /** Token revocation check enabled */
  checkRevocation?: boolean;
}

/**
 * Token revocation record.
 */
export interface TokenRevocation {
  /** Token ID (jti) */
  tokenId: string;
  /** Revocation timestamp */
  revokedAt: number;
  /** Revocation reason */
  reason: string;
  /** Revoked by (admin user ID) */
  revokedBy: string;
  /** Whether revocation is global (all instances) */
  global: boolean;
}

// ============================================================================
// Storage
// ============================================================================

/**
 * Token usage tracking.
 */
const tokenUsageRecords = new Map<string, TokenUsageRecord[]>();

/**
 * Device fingerprint storage.
 * Reserved for future device tracking features.
 */
const _deviceFingerprints = new Map<string, DeviceFingerprint>();

/**
 * Token revocation list.
 */
const tokenRevocations = new Map<string, TokenRevocation>();

/**
 * Compromised tokens (suspected only, not confirmed).
 */
const suspectedCompromises = new Set<string>();

// ============================================================================
// Device Fingerprinting
// ============================================================================

/**
 * Generate device fingerprint from request context.
 *
 * @param userAgent - User agent string
 * @param ipAddress - Client IP address
 * @returns Device fingerprint
 */
export function generateDeviceFingerprint(
  userAgent?: string,
  ipAddress?: string
): DeviceFingerprint {
  // Generate user agent hash
  const userAgentHash = userAgent ? hashString(userAgent) : "unknown";

  // Detect device type
  const ua = userAgent?.toLowerCase() || "";
  let deviceType: "mobile" | "tablet" | "desktop" | "unknown" = "unknown";
  if (/mobile|android|iphone|ipod|blackberry|iemobile|opera mini/i.test(ua)) {
    deviceType = "mobile";
  } else if (/tablet|ipad|playbook|silk/i.test(ua)) {
    deviceType = "tablet";
  } else if (ua.length > 0) {
    deviceType = "desktop";
  }

  // Detect OS
  let osFamily: string | undefined;
  if (/android/i.test(ua)) {
    osFamily = "Android";
  } else if (/ios|iphone|ipad|ipod/i.test(ua)) {
    osFamily = "iOS";
  } else if (/windows/i.test(ua)) {
    osFamily = "Windows";
  } else if (/macintosh|mac os x/i.test(ua)) {
    osFamily = "macOS";
  } else if (/linux/i.test(ua)) {
    osFamily = "Linux";
  }

  // Detect browser
  let browserFamily: string | undefined;
  if (/chrome|crios/i.test(ua) && !/edge|opr|brave/i.test(ua)) {
    browserFamily = "Chrome";
  } else if (/safari/i.test(ua) && !/chrome/i.test(ua)) {
    browserFamily = "Safari";
  } else if (/firefox/i.test(ua)) {
    browserFamily = "Firefox";
  } else if (/edge|edg/i.test(ua)) {
    browserFamily = "Edge";
  } else if (/opr|opera/i.test(ua)) {
    browserFamily = "Opera";
  }

  // Generate unique device ID
  const deviceId = [userAgentHash.substring(0, 8), deviceType, osFamily || "unknown"].join("-");

  return {
    deviceId,
    userAgentHash,
    deviceType,
    osFamily,
    browserFamily,
    ipAddress,
    firstSeenAt: Date.now(),
    lastSeenAt: Date.now(),
    trustLevel: "unknown",
  };
}

/**
 * Hash a string for fingerprinting.
 */
function hashString(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

// ============================================================================
// Token Usage Tracking
// ============================================================================

/**
 * Record token usage for pattern analysis.
 *
 * @param tokenId - Token ID (jti claim)
 * @param record - Usage record
 */
export function recordTokenUsage(tokenId: string, record: Omit<TokenUsageRecord, "tokenId">): void {
  const fullRecord: TokenUsageRecord = {
    ...record,
    tokenId,
  };

  const records = tokenUsageRecords.get(tokenId) || [];
  records.push(fullRecord);

  // Keep only last 100 records per token
  if (records.length > 100) {
    records.shift();
  }

  tokenUsageRecords.set(tokenId, records);
}

/**
 * Get token usage history.
 *
 * @param tokenId - Token ID
 * @returns Usage records
 */
export function getTokenUsage(tokenId: string): TokenUsageRecord[] {
  return tokenUsageRecords.get(tokenId) || [];
}

// ============================================================================
// Compromise Detection
// ============================================================================

/**
 * Detect token compromise through pattern analysis.
 *
 * @param tokenId - Token ID
 * @param currentContext - Current request context
 * @param options - Detection options
 * @returns Compromise detection result
 */
export function detectTokenCompromise(
  tokenId: string,
  currentContext: {
    clientIp: string;
    userAgent?: string;
    requestPath?: string;
    location?: TokenUsageRecord["location"];
  },
  options: EnhancedJwtValidationOptions = {}
): CompromiseDetectionResult {
  const mergedOptions = {
    enableDeviceBinding: true,
    enableGeographicValidation: true,
    enablePatternAnalysis: true,
    maxGeoDistance: 1000,
    maxTimeAnomaly: 12,
    checkRevocation: true,
    ...options,
  };

  const riskFactors: string[] = [];
  let riskScore = 0;
  const analysis = {
    geographicAnomaly: false,
    deviceAnomaly: false,
    timeAnomaly: false,
    frequencyAnomaly: false,
  };

  // Check if token is revoked
  if (mergedOptions.checkRevocation) {
    const revocation = tokenRevocations.get(tokenId);
    if (revocation) {
      return {
        compromised: true,
        riskScore: 100,
        riskFactors: ["Token has been revoked"],
        recommendedAction: "block",
        analysis,
      };
    }
  }

  // Check if token is suspected compromise
  if (suspectedCompromises.has(tokenId)) {
    return {
      compromised: true,
      riskScore: 90,
      riskFactors: ["Token is flagged as suspected compromise"],
      recommendedAction: "revoke",
      analysis,
    };
  }

  const records = getTokenUsage(tokenId);
  const now = Date.now();

  // Need at least one previous record for comparison
  if (records.length === 0) {
    return {
      compromised: false,
      riskScore: 0,
      riskFactors: [],
      recommendedAction: "allow",
      analysis,
    };
  }

  // Get most recent record for comparison
  const mostRecent = records[records.length - 1]!;

  // Geographic analysis
  if (mergedOptions.enableGeographicValidation && currentContext.location) {
    const geoResult = analyzeGeographicAnomaly(
      mostRecent,
      currentContext,
      mergedOptions.maxGeoDistance
    );
    if (geoResult.anomalous) {
      analysis.geographicAnomaly = true;
      riskScore += geoResult.riskScore;
      riskFactors.push(geoResult.reason);
    }
  }

  // Device analysis
  if (mergedOptions.enableDeviceBinding) {
    const deviceResult = analyzeDeviceAnomaly(mostRecent, currentContext);
    if (deviceResult.anomalous) {
      analysis.deviceAnomaly = true;
      riskScore += deviceResult.riskScore;
      riskFactors.push(deviceResult.reason);
    }
  }

  // Time-based analysis
  if (mergedOptions.enablePatternAnalysis) {
    const timeResult = analyzeTimeAnomaly(records, now, mergedOptions.maxTimeAnomaly);
    if (timeResult.anomalous) {
      analysis.timeAnomaly = true;
      riskScore += timeResult.riskScore;
      riskFactors.push(timeResult.reason);
    }
  }

  // Frequency analysis
  if (mergedOptions.enablePatternAnalysis) {
    const freqResult = analyzeFrequencyAnomaly(records, now);
    if (freqResult.anomalous) {
      analysis.frequencyAnomaly = true;
      riskScore += freqResult.riskScore;
      riskFactors.push(freqResult.reason);
    }
  }

  // Determine recommended action
  let recommendedAction: "allow" | "challenge" | "revoke" | "block";
  if (riskScore >= 80) {
    recommendedAction = "revoke";
  } else if (riskScore >= 60) {
    recommendedAction = "challenge";
  } else if (riskScore >= 40) {
    recommendedAction = "allow"; // Log but allow
  } else {
    recommendedAction = "allow";
  }

  return {
    compromised: riskScore >= 60,
    riskScore,
    riskFactors,
    recommendedAction,
    analysis,
  };
}

/**
 * Analyze geographic anomaly.
 */
function analyzeGeographicAnomaly(
  previous: TokenUsageRecord,
  current: { location?: TokenUsageRecord["location"] },
  maxDistanceKm: number
): { anomalous: boolean; riskScore: number; reason: string } {
  if (!previous.location || !current.location) {
    return { anomalous: false, riskScore: 0, reason: "" };
  }

  const distance = calculateDistance(
    previous.location.coordinates?.lat || 0,
    previous.location.coordinates?.lon || 0,
    current.location.coordinates?.lat || 0,
    current.location.coordinates?.lon || 0
  );

  if (distance > maxDistanceKm) {
    return {
      anomalous: true,
      riskScore: 40,
      reason: `Token used from location ${Math.floor(distance)}km away from previous use`,
    };
  }

  // Country change is also suspicious
  if (
    previous.location.country &&
    current.location.country &&
    previous.location.country !== current.location.country
  ) {
    return {
      anomalous: true,
      riskScore: 30,
      reason: `Token used from different country (${previous.location.country} → ${current.location.country})`,
    };
  }

  return { anomalous: false, riskScore: 0, reason: "" };
}

/**
 * Analyze device anomaly.
 */
function analyzeDeviceAnomaly(
  previous: TokenUsageRecord,
  current: { userAgent?: string; clientIp: string }
): { anomalous: boolean; riskScore: number; reason: string } {
  // User agent change
  if (previous.userAgent && current.userAgent && previous.userAgent !== current.userAgent) {
    const previousFp = generateDeviceFingerprint(previous.userAgent);
    const currentFp = generateDeviceFingerprint(current.userAgent);

    if (previousFp.userAgentHash !== currentFp.userAgentHash) {
      return {
        anomalous: true,
        riskScore: 25,
        reason: "Token used from different device/browser",
      };
    }
  }

  // IP address change (same subnet is OK)
  if (previous.clientIp && current.clientIp !== previous.clientIp) {
    const sameSubnet = areIpsInSameSubnet(previous.clientIp, current.clientIp, 24);
    if (!sameSubnet) {
      return {
        anomalous: true,
        riskScore: 15,
        reason: "Token used from different IP subnet",
      };
    }
  }

  return { anomalous: false, riskScore: 0, reason: "" };
}

/**
 * Analyze time-based anomaly.
 */
function analyzeTimeAnomaly(
  records: TokenUsageRecord[],
  now: number,
  maxHours: number
): { anomalous: boolean; riskScore: number; reason: string } {
  if (records.length < 2) {
    return { anomalous: false, riskScore: 0, reason: "" };
  }

  const mostRecent = records[records.length - 1]!;
  const timeSinceLastUse = now - mostRecent.usedAt;
  const hoursSinceLastUse = timeSinceLastUse / (60 * 60 * 1000);

  // Token used after long idle period
  if (hoursSinceLastUse > maxHours * 2) {
    return {
      anomalous: true,
      riskScore: 10,
      reason: `Token used after ${Math.floor(hoursSinceLastUse)} hours of inactivity`,
    };
  }

  // Unusual usage time (e.g., 3 AM when normally used during business hours)
  const hour = new Date(now).getHours();
  const typicalHours = records.map((r) => new Date(r.usedAt).getHours());
  const avgHour = typicalHours.reduce((a, b) => a + b, 0) / typicalHours.length;

  if (Math.abs(hour - avgHour) > 8) {
    return {
      anomalous: true,
      riskScore: 5,
      reason: "Token used at unusual time",
    };
  }

  return { anomalous: false, riskScore: 0, reason: "" };
}

/**
 * Analyze frequency anomaly.
 */
function analyzeFrequencyAnomaly(
  records: TokenUsageRecord[],
  now: number
): { anomalous: boolean; riskScore: number; reason: string } {
  if (records.length < 5) {
    return { anomalous: false, riskScore: 0, reason: "" };
  }

  // Count uses in last hour
  const oneHourAgo = now - 60 * 60 * 1000;
  const recentUses = records.filter((r) => r.usedAt > oneHourAgo).length;

  // Calculate typical hourly usage
  const oldestTime = records[0]!.usedAt;
  const timeSpan = (now - oldestTime) / (60 * 60 * 1000);
  const avgHourlyUsage = records.length / Math.max(timeSpan, 1);

  // More than 10x typical usage
  if (recentUses > avgHourlyUsage * 10 && recentUses > 20) {
    return {
      anomalous: true,
      riskScore: 20,
      reason: `Unusually high token usage (${recentUses} times in last hour)`,
    };
  }

  return { anomalous: false, riskScore: 0, reason: "" };
}

/**
 * Calculate distance between two coordinates using Haversine formula.
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Check if two IPs are in the same subnet.
 */
function areIpsInSameSubnet(ip1: string, ip2: string, prefixLength: number): boolean {
  const parts1 = ip1.split(".").map((p) => parseInt(p, 10));
  const parts2 = ip2.split(".").map((p) => parseInt(p, 10));

  if (parts1.length !== 4 || parts2.length !== 4) {
    return false;
  }

  const octetsToCompare = Math.floor(prefixLength / 8);

  for (let i = 0; i < octetsToCompare && i < 4; i++) {
    if (parts1[i] !== parts2[i]) {
      return false;
    }
  }

  return true;
}

// ============================================================================
// Token Revocation
// ============================================================================

/**
 * Revoke a token.
 *
 * @param tokenId - Token ID to revoke
 * @param reason - Revocation reason
 * @param revokedBy - Admin user ID
 * @param global - Whether revocation is global
 * @returns Revocation record
 */
export function revokeToken(
  tokenId: string,
  reason: string,
  revokedBy: string,
  global: boolean = false
): TokenRevocation {
  const revocation: TokenRevocation = {
    tokenId,
    revokedAt: Date.now(),
    reason,
    revokedBy,
    global,
  };

  tokenRevocations.set(tokenId, revocation);

  logger.warn("Token revoked", { tokenId, reason, revokedBy, global });

  securityLogger.logSuspiciousActivity(
    {
      req: {
        header: () => undefined,
        method: "SYSTEM",
        path: `/token/${tokenId}/revoke`,
      },
      res: {},
    } as never,
    "token_revoked",
    `Token ${tokenId} revoked: ${reason}`
  );

  return revocation;
}

/**
 * Check if a token is revoked.
 *
 * @param tokenId - Token ID to check
 * @returns Revocation record or undefined
 */
export function isTokenRevoked(tokenId: string): TokenRevocation | undefined {
  return tokenRevocations.get(tokenId);
}

/**
 * Unrevoke a token.
 *
 * @param tokenId - Token ID to unrevoke
 * @returns true if token was revoked
 */
export function unrevokeToken(tokenId: string): boolean {
  const revoked = tokenRevocations.delete(tokenId);
  if (revoked) {
    logger.info("Token unrevoked", { tokenId });
  }
  return revoked;
}

/**
 * Flag a token as suspected compromise.
 *
 * @param tokenId - Token ID to flag
 * @returns true if newly flagged
 */
export function flagSuspectedCompromise(tokenId: string): boolean {
  const newlyFlagged = suspectedCompromises.add(tokenId);
  if (newlyFlagged) {
    logger.warn("Token flagged as suspected compromise", { tokenId });
    securityLogger.logSuspiciousActivity(
      {
        req: {
          header: () => undefined,
          method: "SYSTEM",
          path: `/token/${tokenId}/flag-compromise`,
        },
        res: {},
      } as never,
      "suspected_compromise",
      `Token ${tokenId} flagged as suspected compromise`
    );
  }
  return newlyFlagged;
}

/**
 * Unflag a token as suspected compromise.
 *
 * @param tokenId - Token ID to unflag
 * @returns true if token was flagged
 */
export function unflagSuspectedCompromise(tokenId: string): boolean {
  const wasFlagged = suspectedCompromises.delete(tokenId);
  if (wasFlagged) {
    logger.info("Token unflagged as suspected compromise", { tokenId });
  }
  return wasFlagged;
}

/**
 * Clear old token usage records.
 *
 * @param olderThanDays - Remove records older than this many days
 * @returns Number of records cleared
 */
export function clearOldTokenUsage(olderThanDays: number = 30): number {
  const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
  let cleared = 0;

  for (const [tokenId, records] of tokenUsageRecords.entries()) {
    const filtered = records.filter((r) => r.usedAt > cutoff);
    const removed = records.length - filtered.length;
    cleared += removed;

    if (filtered.length === 0) {
      tokenUsageRecords.delete(tokenId);
    } else {
      tokenUsageRecords.set(tokenId, filtered);
    }
  }

  if (cleared > 0) {
    logger.info("Old token usage records cleared", { cleared });
  }

  return cleared;
}

/**
 * Get statistics on token tracking.
 */
export function getTokenTrackingStats(): {
  totalTrackedTokens: number;
  totalUsageRecords: number;
  revokedTokens: number;
  suspectedCompromises: number;
} {
  let totalUsageRecords = 0;

  for (const records of tokenUsageRecords.values()) {
    totalUsageRecords += records.length;
  }

  return {
    totalTrackedTokens: tokenUsageRecords.size,
    totalUsageRecords,
    revokedTokens: tokenRevocations.size,
    suspectedCompromises: suspectedCompromises.size,
  };
}
