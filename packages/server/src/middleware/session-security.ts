/**
 * Enhanced session security utilities.
 *
 * Provides advanced security features for session management including:
 * - IP address validation and subnet matching
 * - User agent analysis and fingerprinting
 * - Geolocation-based security checks
 * - Impossible travel detection
 * - Session risk scoring
 * - Device trust management
 *
 * These utilities complement the core authentication system with
 * additional security layers for detecting and preventing session hijacking.
 */

import { logger } from "../observability/logger.js";
import type { AuthSession } from "./authentication.js";
import { securityLogger } from "./security-logging.js";

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * IP address type.
 */
export type IpType = "ipv4" | "ipv6" | "unknown";

/**
 * IP address information.
 */
export interface IpInfo {
  /** The IP address */
  ip: string;
  /** IP type (IPv4 or IPv6) */
  type: IpType;
  /** IPv4 octets (for IPv4 addresses) */
  octets?: number[];
  /** IPv6 hextets (for IPv6 addresses) */
  hextets?: string[];
  /** Whether this is a private/local IP */
  isPrivate: boolean;
  /** Whether this is a loopback IP */
  isLoopback: boolean;
}

/**
 * IP subnet definition.
 */
export interface IpSubnet {
  /** IP address */
  ip: string;
  /** CIDR prefix length (e.g., 24 for /24) */
  prefixLength: number;
}

/**
 * User agent analysis result.
 */
export interface UserAgentInfo {
  /** Full user agent string */
  raw: string;
  /** Browser family */
  browser?: string;
  /** Browser version (if detectable) */
  browserVersion?: string;
  /** OS family */
  os?: string;
  /** OS version (if detectable) */
  osVersion?: string;
  /** Device type */
  deviceType: "mobile" | "tablet" | "desktop" | "bot" | "unknown";
  /** Device hardware info (if available) */
  hardware?: string;
}

/**
 * Geolocation data (simplified).
 */
export interface GeolocationData {
  /** Country code (ISO 3166-1 alpha-2) */
  country?: string;
  /** City name */
  city?: string;
  /** Latitude */
  latitude?: number;
  /** Longitude */
  longitude?: number;
  /** Approximate timezone */
  timezone?: string;
}

/**
 * Security event for risk scoring.
 */
export interface SecurityEvent {
  /** Event type */
  type: string;
  /** Event timestamp */
  timestamp: number;
  /** Risk score contribution */
  score: number;
  /** Event details */
  details?: Record<string, unknown>;
}

/**
 * Session risk assessment.
 */
export interface SessionRiskAssessment {
  /** Overall risk score (0-100) */
  riskScore: number;
  /** Risk level */
  riskLevel: "low" | "medium" | "high" | "critical";
  /** Risk factors identified */
  riskFactors: string[];
  /** Recommended action */
  recommendedAction: "allow" | "monitor" | "challenge" | "block";
  /** Security events that contributed to the score */
  events: SecurityEvent[];
}

/**
 * Device trust level.
 */
export type DeviceTrustLevel = "unknown" | "untrusted" | "trusted" | "highly_trusted";

/**
 * Device trust information.
 */
export interface DeviceTrustInfo {
  /** Device ID */
  deviceId: string;
  /** Trust level */
  trustLevel: DeviceTrustLevel;
  /** First seen timestamp */
  firstSeenAt: number;
  /** Last seen timestamp */
  lastSeenAt: number;
  /** Number of successful authentications */
  successfulAuths: number;
  /** Last risk assessment */
  lastRiskAssessment?: SessionRiskAssessment;
}

// ============================================================================
// IP Address Utilities
// ============================================================================

/**
 * Parse an IP address into its components.
 */
export function parseIpAddress(ip: string): IpInfo {
  if (ip.includes(".")) {
    // IPv4
    const octets = ip.split(".").map((n) => parseInt(n, 10));

    return {
      ip,
      type: "ipv4",
      octets,
      isPrivate: isPrivateIpv4(octets),
      isLoopback: octets[0] === 127,
    };
  }

  if (ip.includes(":")) {
    // IPv6
    const hextets = ip.split(":");

    return {
      ip,
      type: "ipv6",
      hextets,
      isPrivate: ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80"),
      isLoopback: ip === "::1",
    };
  }

  return {
    ip,
    type: "unknown",
    isPrivate: false,
    isLoopback: false,
  };
}

/**
 * Check if IPv4 address is private.
 */
function isPrivateIpv4(octets: number[]): boolean {
  const [first, second] = octets;

  // 10.0.0.0/8
  if (first === 10) return true;

  // 172.16.0.0/12
  if (first === 172 && second >= 16 && second <= 31) return true;

  // 192.168.0.0/16
  if (first === 192 && second === 168) return true;

  // 169.254.0.0/16 (link-local)
  if (first === 169 && second === 254) return true;

  return false;
}

/**
 * Check if two IP addresses are in the same subnet.
 *
 * For IPv4, checks the specified number of leading octets.
 * For IPv6, checks the specified number of leading hextets.
 */
export function areIpsInSameSubnet(ip1: string, ip2: string, prefixLength = 24): boolean {
  const info1 = parseIpAddress(ip1);
  const info2 = parseIpAddress(ip2);

  if (info1.type !== info2.type || info1.type === "unknown") {
    return false;
  }

  if (info1.type === "ipv4" && info1.octets && info2.octets) {
    // For IPv4, prefixLength / 8 gives number of octets to compare
    const octetsToCompare = Math.floor(prefixLength / 8);

    for (let i = 0; i < octetsToCompare && i < 4; i++) {
      if (info1.octets[i] !== info2.octets[i]) {
        return false;
      }
    }

    // Check remaining bits
    const remainingBits = prefixLength % 8;
    if (remainingBits > 0 && octetsToCompare < 4) {
      const mask = 256 - Math.pow(2, 8 - remainingBits);
      if ((info1.octets[octetsToCompare]! & mask) !== (info2.octets[octetsToCompare]! & mask)) {
        return false;
      }
    }

    return true;
  }

  if (info1.type === "ipv6" && info1.hextets && info2.hextets) {
    // For IPv6, prefixLength / 16 gives number of hextets to compare
    const hextetsToCompare = Math.floor(prefixLength / 16);

    for (let i = 0; i < hextetsToCompare && i < 8; i++) {
      if (info1.hextets[i] !== info2.hextets[i]) {
        return false;
      }
    }

    return true;
  }

  return false;
}

/**
 * Calculate the distance between two IP addresses.
 *
 * Returns a normalized "distance" value (0-100) based on how different the IPs are.
 * Useful for detecting proxy/VPN changes vs. location changes.
 */
export function calculateIpDistance(ip1: string, ip2: string): number {
  const info1 = parseIpAddress(ip1);
  const info2 = parseIpAddress(ip2);

  if (info1.type !== info2.type || info1.type === "unknown") {
    return 100; // Maximum distance for different IP types
  }

  if (info1.type === "ipv4" && info1.octets && info2.octets) {
    // Calculate difference for each octet
    let totalDiff = 0;
    for (let i = 0; i < 4; i++) {
      totalDiff += Math.abs(info1.octets[i]! - info2.octets[i]!);
    }

    // Normalize to 0-100
    return Math.min(100, Math.floor(totalDiff / 2.55));
  }

  return 50; // Middle distance for IPv6 (simplified)
}

/**
 * Get a simplified IP class for grouping.
 *
 * Returns "A", "B", "C" class for IPv4, useful for coarse-grained comparison.
 */
export function getIpClass(ip: string): string {
  const info = parseIpAddress(ip);

  if (info.type === "ipv4" && info.octets) {
    const [first] = info.octets;

    if (first < 128) return "A";
    if (first < 192) return "B";
    return "C";
  }

  return "unknown";
}

// ============================================================================
// User Agent Analysis
// ============================================================================

/**
 * Analyze a user agent string.
 */
export function analyzeUserAgent(userAgent: string): UserAgentInfo {
  const ua = userAgent.toLowerCase();
  const info: UserAgentInfo = {
    raw: userAgent,
    deviceType: "unknown",
  };

  // Detect browser
  if (ua.includes("edg/") || ua.includes("edge/")) {
    info.browser = "edge";
  } else if (ua.includes("opr/") || ua.includes("opera/")) {
    info.browser = "opera";
  } else if (ua.includes("brave/")) {
    info.browser = "brave";
  } else if (ua.includes("chrome/") && !ua.includes("edg")) {
    info.browser = "chrome";
  } else if (ua.includes("safari/") && !ua.includes("chrome")) {
    info.browser = "safari";
  } else if (ua.includes("firefox/")) {
    info.browser = "firefox";
  } else if (ua.includes("trident/") || ua.includes("msie")) {
    info.browser = "ie";
  }

  // Detect OS
  if (ua.includes("windows")) {
    info.os = "windows";
    if (ua.includes("windows nt 10.0")) info.osVersion = "10";
    else if (ua.includes("windows nt 6.3")) info.osVersion = "8.1";
    else if (ua.includes("windows nt 6.1")) info.osVersion = "7";
  } else if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod")) {
    info.os = "ios";
  } else if (ua.includes("android")) {
    info.os = "android";
  } else if (ua.includes("mac os x") || ua.includes("macos")) {
    info.os = "macos";
  } else if (ua.includes("linux")) {
    info.os = "linux";
  }

  // Detect device type
  if (/bot|crawl|spider|slurp|curl|wget/i.test(userAgent)) {
    info.deviceType = "bot";
  } else if (/tablet|ipad|playbook|silk/i.test(ua)) {
    info.deviceType = "tablet";
  } else if (/mobile|android|iphone|ipod|blackberry|iemobile|opera mini/i.test(ua)) {
    info.deviceType = "mobile";
  } else if (info.os) {
    info.deviceType = "desktop";
  }

  // Detect hardware
  if (ua.includes("arm")) {
    info.hardware = "arm";
  } else if (ua.includes("x86_64") || ua.includes("x64") || ua.includes("wow64")) {
    info.hardware = "x64";
  } else if (ua.includes("i686") || ua.includes("x86")) {
    info.hardware = "x86";
  }

  return info;
}

/**
 * Calculate similarity between two user agent strings.
 *
 * Returns 0-100 similarity score.
 */
export function calculateUserAgentSimilarity(ua1: string, ua2: string): number {
  const info1 = analyzeUserAgent(ua1);
  const info2 = analyzeUserAgent(ua2);

  let similarity = 0;
  let factors = 0;

  // Browser match
  if (info1.browser === info2.browser) {
    similarity += 30;
  }
  factors++;

  // OS match
  if (info1.os === info2.os) {
    similarity += 30;
  }
  factors++;

  // Device type match
  if (info1.deviceType === info2.deviceType) {
    similarity += 20;
  }
  factors++;

  // Hardware match
  if (info1.hardware === info2.hardware) {
    similarity += 20;
  }
  factors++;

  return Math.min(100, similarity);
}

/**
 * Detect if user agent change is legitimate.
 *
 * Returns true if the change is likely a browser update or minor version change.
 */
export function isLegitimateUserAgentChange(oldUa: string, newUa: string): boolean {
  const oldInfo = analyzeUserAgent(oldUa);
  const newInfo = analyzeUserAgent(newUa);

  // Same browser and OS is likely a version update
  if (oldInfo.browser === newInfo.browser && oldInfo.os === newInfo.os) {
    return true;
  }

  // Same device type with different browser could be user trying new browser
  if (oldInfo.deviceType === newInfo.deviceType && oldInfo.os === newInfo.os) {
    return true;
  }

  return false;
}

// ============================================================================
// Session Risk Assessment
// ============================================================================

/**
 * Security event tracking for session risk scoring.
 */
const sessionSecurityEvents = new Map<string, SecurityEvent[]>();

/**
 * Assess session security risk.
 *
 * Analyzes a session and current request to calculate a risk score.
 */
export async function assessSessionRisk(
  session: AuthSession,
  currentIp: string,
  currentUserAgent?: string,
  options: {
    /** Time window for event history (ms) */
    eventHistoryWindow?: number;
    /** Whether to include geolocation checks */
    includeGeolocation?: boolean;
    /** Known geolocation data (optional) */
    knownGeo?: (ip: string) => Promise<GeolocationData | null>;
  } = {}
): Promise<SessionRiskAssessment> {
  const {
    eventHistoryWindow = 24 * 60 * 60 * 1000, // 24 hours
    includeGeolocation = false,
    knownGeo,
  } = options;

  const riskFactors: string[] = [];
  const events: SecurityEvent[] = [];
  let riskScore = 0;

  const now = Date.now();

  // Get recent security events for this session
  const recentEvents = (sessionSecurityEvents.get(session.sessionId) || []).filter(
    (e) => now - e.timestamp < eventHistoryWindow
  );

  // Check IP change
  if (session.clientIp !== currentIp) {
    const ipInfo = parseIpAddress(currentIp);
    const oldIpInfo = parseIpAddress(session.clientIp);

    if (ipInfo.type !== oldIpInfo.type) {
      riskScore += 40;
      riskFactors.push("IP address type changed (IPv4 ↔ IPv6)");
      events.push({
        type: "ip_type_change",
        timestamp: now,
        score: 40,
        details: { oldIp: session.clientIp, newIp: currentIp },
      });
    } else if (!areIpsInSameSubnet(session.clientIp, currentIp, 24)) {
      riskScore += 30;
      riskFactors.push("IP address changed to different subnet");
      events.push({
        type: "ip_subnet_change",
        timestamp: now,
        score: 30,
        details: { oldIp: session.clientIp, newIp: currentIp },
      });
    } else {
      riskScore += 10;
      riskFactors.push("IP address changed within same subnet");
      events.push({
        type: "ip_change_same_subnet",
        timestamp: now,
        score: 10,
        details: { oldIp: session.clientIp, newIp: currentIp },
      });
    }
  }

  // Check User-Agent change
  if (currentUserAgent && session.userAgent && session.userAgent !== currentUserAgent) {
    const similarity = calculateUserAgentSimilarity(session.userAgent, currentUserAgent);

    if (similarity < 50) {
      riskScore += 30;
      riskFactors.push("User-Agent changed significantly");
      events.push({
        type: "ua_change_major",
        timestamp: now,
        score: 30,
        details: { oldUa: session.userAgent, newUa: currentUserAgent, similarity },
      });
    } else if (!isLegitimateUserAgentChange(session.userAgent, currentUserAgent)) {
      riskScore += 15;
      riskFactors.push("User-Agent changed (possibly suspicious)");
      events.push({
        type: "ua_change_minor",
        timestamp: now,
        score: 15,
        details: { oldUa: session.userAgent, newUa: currentUserAgent },
      });
    }
  }

  // Check session age (very new sessions are higher risk)
  const sessionAge = now - session.createdAt;
  if (sessionAge < 5 * 60 * 1000) {
    // Less than 5 minutes old
    riskScore += 5;
    riskFactors.push("Very new session");
  }

  // Check idle time (long idle may indicate hijacking)
  const idleTime = now - session.lastActivityAt;
  if (idleTime > 60 * 60 * 1000) {
    // More than 1 hour idle
    riskScore += 10;
    riskFactors.push("Long idle time before activity");
  }

  // Include recent security events
  for (const event of recentEvents) {
    riskScore += event.score;
    events.push(event);
  }

  // Cap risk score at 100
  riskScore = Math.min(100, riskScore);

  // Determine risk level
  let riskLevel: "low" | "medium" | "high" | "critical";
  let recommendedAction: "allow" | "monitor" | "challenge" | "block";

  if (riskScore < 20) {
    riskLevel = "low";
    recommendedAction = "allow";
  } else if (riskScore < 50) {
    riskLevel = "medium";
    recommendedAction = "monitor";
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
    events,
  };
}

/**
 * Record a security event for a session.
 */
export function recordSecurityEvent(sessionId: string, event: SecurityEvent): void {
  const events = sessionSecurityEvents.get(sessionId) || [];
  events.push(event);

  // Keep only last 100 events per session
  if (events.length > 100) {
    events.shift();
  }

  sessionSecurityEvents.set(sessionId, events);

  logger.debug("Security event recorded", {
    sessionId,
    eventType: event.type,
    score: event.score,
  });
}

/**
 * Clear security events for a session.
 */
export function clearSecurityEvents(sessionId: string): void {
  sessionSecurityEvents.delete(sessionId);
}

// ============================================================================
// Device Trust Management
// ============================================================================

/**
 * Device trust storage.
 */
const deviceTrustStorage = new Map<string, DeviceTrustInfo>();

/**
 * Get or create device trust info.
 */
export function getOrCreateDeviceTrust(
  deviceId: string,
  initialRiskAssessment?: SessionRiskAssessment
): DeviceTrustInfo {
  const existing = deviceTrustStorage.get(deviceId);

  if (existing) {
    return existing;
  }

  const trustInfo: DeviceTrustInfo = {
    deviceId,
    trustLevel: "unknown",
    firstSeenAt: Date.now(),
    lastSeenAt: Date.now(),
    successfulAuths: 0,
    lastRiskAssessment: initialRiskAssessment,
  };

  deviceTrustStorage.set(deviceId, trustInfo);

  logger.info("New device trust record created", { deviceId });

  return trustInfo;
}

/**
 * Update device trust based on successful authentication.
 */
export function updateDeviceTrust(deviceId: string, riskAssessment?: SessionRiskAssessment): void {
  const trustInfo = getOrCreateDeviceTrust(deviceId, riskAssessment);

  // Ensure lastSeenAt is always at least 1ms after firstSeenAt
  const now = Date.now();
  trustInfo.lastSeenAt = Math.max(now, trustInfo.firstSeenAt + 1);
  trustInfo.successfulAuths++;
  trustInfo.lastRiskAssessment = riskAssessment;

  // Auto-promote trust based on successful auths
  if (trustInfo.successfulAuths >= 10 && trustInfo.trustLevel !== "highly_trusted") {
    trustInfo.trustLevel = "highly_trusted";
    logger.info("Device promoted to highly trusted", { deviceId });
  } else if (trustInfo.successfulAuths >= 5 && trustInfo.trustLevel === "unknown") {
    trustInfo.trustLevel = "trusted";
    logger.info("Device promoted to trusted", { deviceId });
  } else if (riskAssessment && riskAssessment.riskLevel === "high") {
    trustInfo.trustLevel = "untrusted";
    logger.warn("Device marked as untrusted due to high risk", { deviceId });
  }

  deviceTrustStorage.set(deviceId, trustInfo);
}

/**
 * Check if a device is trusted.
 */
export function isDeviceTrusted(deviceId: string): boolean {
  const trustInfo = deviceTrustStorage.get(deviceId);
  return trustInfo?.trustLevel === "trusted" || trustInfo?.trustLevel === "highly_trusted";
}

/**
 * Get device trust level.
 */
export function getDeviceTrustLevel(deviceId: string): DeviceTrustLevel {
  return deviceTrustStorage.get(deviceId)?.trustLevel || "unknown";
}

/**
 * Manually set device trust level.
 */
export function setDeviceTrustLevel(deviceId: string, trustLevel: DeviceTrustLevel): void {
  const trustInfo = getOrCreateDeviceTrust(deviceId);
  trustInfo.trustLevel = trustLevel;
  deviceTrustStorage.set(deviceId, trustInfo);

  logger.info("Device trust level manually set", { deviceId, trustLevel });
}

/**
 * Remove device trust record.
 */
export function removeDeviceTrust(deviceId: string): void {
  deviceTrustStorage.delete(deviceId);
  logger.info("Device trust record removed", { deviceId });
}

// ============================================================================
// Impossible Travel Detection
// ============================================================================

/**
 * Maximum plausible travel speed (km/h).
 * Commercial jets fly at ~900 km/h, so anything faster is suspicious.
 */
const MAX_PLAUSIBLE_SPEED_KMH = 900;

/**
 * Check for impossible travel between two locations.
 *
 * Compares the time between two events with the distance between
 * their locations to detect impossible travel scenarios.
 */
export async function detectImpossibleTravel(
  event1: { timestamp: number; ip: string; geo?: GeolocationData },
  event2: { timestamp: number; ip: string; geo?: GeolocationData },
  options: {
    /** Maximum plausible speed (km/h) */
    maxSpeedKmh?: number;
    /** Geolocation lookup function */
    geoLookup?: (ip: string) => Promise<GeolocationData | null>;
  } = {}
): Promise<{ impossible: boolean; speed?: number; distance?: number }> {
  const { maxSpeedKmh = MAX_PLAUSIBLE_SPEED_KMH, geoLookup } = options;

  // Ensure event1 is earlier
  const [earlier, later] =
    event1.timestamp < event2.timestamp ? [event1, event2] : [event2, event1];

  // Get geolocation data
  const geo1 = event1.geo || (geoLookup ? await geoLookup(event1.ip) : null);
  const geo2 = event2.geo || (geoLookup ? await geoLookup(event2.ip) : null);

  if (!geo1 || !geo2 || !geo1.latitude || !geo1.longitude || !geo2.latitude || !geo2.longitude) {
    // Can't determine without geolocation
    return { impossible: false };
  }

  // Calculate distance using Haversine formula
  const distance = calculateDistance(geo1.latitude, geo1.longitude, geo2.latitude, geo2.longitude);

  // Calculate time difference in hours
  const timeDiffHours = (later.timestamp - earlier.timestamp) / (1000 * 60 * 60);

  if (timeDiffHours <= 0) {
    // Events at the same time or reversed timestamps
    return { impossible: false };
  }

  // Calculate required speed
  const speed = distance / timeDiffHours;

  if (speed > maxSpeedKmh) {
    return { impossible: true, speed, distance };
  }

  return { impossible: false, speed, distance };
}

/**
 * Calculate distance between two coordinates using the Haversine formula.
 *
 * Returns distance in kilometers.
 */
export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Convert degrees to radians.
 */
function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

// ============================================================================
// Middleware Integration
// ============================================================================

/**
 * Session security middleware options.
 */
export interface SessionSecurityMiddlewareOptions {
  /** Whether to enforce IP binding */
  enforceIpBinding?: boolean;
  /** Whether to check user agent changes */
  checkUserAgent?: boolean;
  /** Risk threshold for blocking (0-100) */
  riskThreshold?: number;
  /** Whether to require re-authentication on high risk */
  reauthOnHighRisk?: boolean;
}

/**
 * Session security middleware.
 *
 * Enhances session validation with risk assessment and additional security checks.
 */
export function sessionSecurity(options: SessionSecurityMiddlewareOptions = {}) {
  const {
    enforceIpBinding = true,
    checkUserAgent = true,
    riskThreshold = 80,
    reauthOnHighRisk = true,
  } = options;

  return async (c: any, next: any) => {
    const session = c.get("session");
    if (!session) {
      return next();
    }

    const clientIp =
      c.req.header("CF-Connecting-IP") ||
      c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ||
      c.req.header("X-Real-IP") ||
      "unknown";

    const userAgent = c.req.header("User-Agent");

    // Assess session risk
    const riskAssessment = await assessSessionRisk(session, clientIp, userAgent);

    // Attach risk assessment to context
    c.set("sessionRiskAssessment", riskAssessment);

    // Take action based on risk level
    if (riskAssessment.recommendedAction === "block") {
      securityLogger.logSuspiciousActivity(
        c,
        "high_risk_session_blocked",
        `Session blocked due to high risk score: ${riskAssessment.riskScore}`
      );
      throw new Error("Session blocked due to suspicious activity");
    }

    if (riskAssessment.recommendedAction === "challenge" && reauthOnHighRisk) {
      // Require re-authentication for high-risk sessions
      securityLogger.logSuspiciousActivity(
        c,
        "high_risk_session_challenge",
        `Re-authentication required due to risk score: ${riskAssessment.riskScore}`
      );
      throw new Error("Re-authentication required");
    }

    return next();
  };
}
