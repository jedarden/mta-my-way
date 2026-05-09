/**
 * Enhanced Concurrent Session Management
 *
 * Provides advanced session management features including:
 * - Concurrent session limits per user
 * - Session priority management
 * - Automatic session cleanup
 * - Session conflict resolution
 * - Device-specific session tracking
 * - Geographic session tracking
 *
 * Security Best Practices:
 * - Limits concurrent sessions to prevent session hijacking
 * - Tracks session metadata for security monitoring
 * - Implements automatic cleanup of expired sessions
 * - Provides session conflict resolution strategies
 */

import { logger } from "../observability/logger.js";
import type { AuthSession } from "./authentication.js";
import { securityLogger } from "./security-logging.js";

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Session priority levels for conflict resolution.
 */
export type SessionPriority = "low" | "normal" | "high" | "critical";

/**
 * Session conflict resolution strategy.
 */
export type ConflictResolution =
  | "deny_new" // Deny new session when limit reached (default)
  | "terminate_oldest" // Terminate oldest session
  | "terminate_lowest_priority" // Terminate lowest priority session
  | "terminate_idle" // Terminate idle sessions first
  | "allow_all"; // Allow all sessions (no limit)

/**
 * Device information for session tracking.
 */
export interface SessionDeviceInfo {
  /** Device ID */
  deviceId: string;
  /** Device type */
  deviceType: "mobile" | "tablet" | "desktop" | "unknown";
  /** OS family */
  osFamily?: string;
  /** Browser family */
  browserFamily?: string;
  /** Whether this is a trusted device */
  trusted: boolean;
}

/**
 * Geographic information for session tracking.
 */
export interface SessionGeoInfo {
  /** Country code (ISO 3166-1 alpha-2) */
  country?: string;
  /** City name */
  city?: string;
  /** Approximate location */
  location?: string;
  /** Timezone */
  timezone?: string;
}

/**
 * Enhanced session data with metadata.
 */
export interface EnhancedSession extends AuthSession {
  /** Session priority */
  priority: SessionPriority;
  /** Device information */
  deviceInfo?: SessionDeviceInfo;
  /** Geographic information */
  geoInfo?: SessionGeoInfo;
  /** Session conflict group */
  conflictGroup?: string;
  /** Whether session is pinned (cannot be terminated automatically) */
  pinned: boolean;
  /** Last activity timestamp */
  lastActivityAt: number;
  /** Idle time in milliseconds */
  idleTime: number;
}

/**
 * Concurrent session configuration.
 */
export interface ConcurrentSessionConfig {
  /** Maximum concurrent sessions per user (default: 5) */
  maxConcurrentSessions?: number;
  /** Maximum concurrent sessions per device (default: 2) */
  maxSessionsPerDevice?: number;
  /** Conflict resolution strategy */
  conflictResolution?: ConflictResolution;
  /** Session timeout in milliseconds (default: 30 minutes) */
  sessionTimeout?: number;
  /** Maximum idle time before termination (default: 1 hour) */
  maxIdleTime?: number;
  /** Whether to track device information */
  trackDeviceInfo?: boolean;
  /** Whether to track geographic information */
  trackGeoInfo?: boolean;
  /** Whether to enable session pinning */
  enablePinning?: boolean;
}

/**
 * Session conflict result.
 */
export interface SessionConflictResult {
  /** Whether the new session is allowed */
  allowed: boolean;
  /** Terminated session IDs (if any) */
  terminatedSessions: string[];
  /** Reason for denial (if denied) */
  reason?: string;
  /** Warning messages */
  warnings: string[];
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: Required<Omit<ConcurrentSessionConfig, "conflictResolution">> & {
  conflictResolution: ConflictResolution;
} = {
  maxConcurrentSessions: 5,
  maxSessionsPerDevice: 2,
  conflictResolution: "terminate_oldest",
  sessionTimeout: 30 * 60 * 1000, // 30 minutes
  maxIdleTime: 60 * 60 * 1000, // 1 hour
  trackDeviceInfo: true,
  trackGeoInfo: false,
  enablePinning: true,
};

// ============================================================================
// Session Storage
// ============================================================================

/**
 * User session registry.
 * Maps keyId to array of sessions.
 */
const userSessionRegistry = new Map<string, EnhancedSession[]>();

/**
 * Device session registry.
 * Maps deviceId to array of session IDs.
 */
const deviceSessionRegistry = new Map<string, string[]>();

/**
 * Cleanup interval reference.
 */
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Cleanup interval in milliseconds (5 minutes).
 */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

// ============================================================================
// Session Management Functions
// ============================================================================

/**
 * Start the automatic session cleanup interval.
 */
export function startSessionCleanup(config: ConcurrentSessionConfig = {}): void {
  if (cleanupInterval) {
    return; // Already running
  }

  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  cleanupInterval = setInterval(() => {
    cleanupExpiredSessions(mergedConfig);
  }, CLEANUP_INTERVAL_MS);

  logger.info("Session cleanup interval started", {
    intervalMs: CLEANUP_INTERVAL_MS,
  });
}

/**
 * Stop the automatic session cleanup interval.
 */
export function stopSessionCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    logger.info("Session cleanup interval stopped");
  }
}

/**
 * Clean up expired and idle sessions.
 */
export function cleanupExpiredSessions(config: ConcurrentSessionConfig = {}): {
  cleaned: number;
  remaining: number;
} {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const now = Date.now();
  let cleaned = 0;

  for (const [keyId, sessions] of userSessionRegistry.entries()) {
    const activeSessions = sessions.filter((session) => {
      // Skip pinned sessions
      if (session.pinned) {
        return true;
      }

      // Check session timeout
      if (now > session.expiresAt) {
        logger.info("Session expired", { sessionId: session.sessionId, keyId });
        removeFromDeviceRegistry(session);
        cleaned++;
        return false;
      }

      // Check idle time
      const idleTime = now - session.lastActivityAt;
      if (idleTime > mergedConfig.maxIdleTime) {
        logger.info("Session terminated due to inactivity", {
          sessionId: session.sessionId,
          keyId,
          idleTime,
        });
        removeFromDeviceRegistry(session);
        cleaned++;
        return false;
      }

      return true;
    });

    if (activeSessions.length === 0) {
      userSessionRegistry.delete(keyId);
    } else {
      userSessionRegistry.set(keyId, activeSessions);
    }
  }

  const remaining = Array.from(userSessionRegistry.values()).reduce(
    (sum, sessions) => sum + sessions.length,
    0
  );

  if (cleaned > 0) {
    logger.info("Session cleanup completed", { cleaned, remaining });
  }

  return { cleaned, remaining };
}

/**
 * Remove session from device registry.
 */
function removeFromDeviceRegistry(session: EnhancedSession): void {
  if (session.deviceInfo?.deviceId) {
    const deviceSessions = deviceSessionRegistry.get(session.deviceInfo.deviceId);
    if (deviceSessions) {
      const index = deviceSessions.indexOf(session.sessionId);
      if (index > -1) {
        deviceSessions.splice(index, 1);
      }
      if (deviceSessions.length === 0) {
        deviceSessionRegistry.delete(session.deviceInfo.deviceId);
      } else {
        deviceSessionRegistry.set(session.deviceInfo.deviceId, deviceSessions);
      }
    }
  }
}

/**
 * Get all active sessions for a user.
 */
export function getUserSessions(keyId: string): EnhancedSession[] {
  return userSessionRegistry.get(keyId) || [];
}

/**
 * Get session count for a user.
 */
export function getUserSessionCount(keyId: string): number {
  return getUserSessions(keyId).length;
}

/**
 * Get session count for a device.
 */
export function getDeviceSessionCount(deviceId: string): number {
  const sessions = deviceSessionRegistry.get(deviceId);
  return sessions ? sessions.length : 0;
}

/**
 * Register a new session with concurrent session management.
 */
export function registerSession(
  session: AuthSession,
  options: {
    priority?: SessionPriority;
    deviceInfo?: SessionDeviceInfo;
    geoInfo?: SessionGeoInfo;
    pinned?: boolean;
    conflictGroup?: string;
  } = {},
  config: ConcurrentSessionConfig = {}
): SessionConflictResult {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const keyId = session.keyId;
  const warnings: string[] = [];
  const terminatedSessions: string[] = [];

  // Get existing sessions
  const existingSessions = getUserSessions(keyId);

  // Check device limit
  if (options.deviceInfo?.deviceId && mergedConfig.maxSessionsPerDevice > 0) {
    const deviceCount = getDeviceSessionCount(options.deviceInfo.deviceId);
    if (deviceCount >= mergedConfig.maxSessionsPerDevice) {
      warnings.push(`Maximum sessions per device reached (${mergedConfig.maxSessionsPerDevice})`);

      // Device limit reached - need to resolve conflict
      const deviceSessions = existingSessions.filter(
        (s) => s.deviceInfo?.deviceId === options.deviceInfo?.deviceId
      );

      // Terminate oldest session for this device
      if (deviceSessions.length > 0) {
        deviceSessions.sort((a, b) => a.createdAt - b.createdAt);
        const oldest = deviceSessions[0];
        if (oldest && !oldest.pinned) {
          terminateSession(oldest.sessionId);
          terminatedSessions.push(oldest.sessionId);
          warnings.push(`Terminated oldest session for device due to limit`);
        }
      }
    }
  }

  // Check concurrent session limit
  if (existingSessions.length >= mergedConfig.maxConcurrentSessions) {
    const result = resolveSessionConflict(
      keyId,
      session,
      existingSessions,
      mergedConfig.conflictResolution,
      mergedConfig
    );

    if (!result.allowed) {
      return result;
    }

    terminatedSessions.push(...result.terminatedSessions);
    warnings.push(...result.warnings);
  }

  // Create enhanced session
  const enhancedSession: EnhancedSession = {
    ...session,
    priority: options.priority || "normal",
    deviceInfo: options.deviceInfo,
    geoInfo: options.geoInfo,
    conflictGroup: options.conflictGroup,
    pinned: options.pinned || false,
    lastActivityAt: Date.now(),
    idleTime: 0,
  };

  // Register session
  existingSessions.push(enhancedSession);
  userSessionRegistry.set(keyId, existingSessions);

  // Register with device
  if (options.deviceInfo?.deviceId) {
    const deviceSessions = deviceSessionRegistry.get(options.deviceInfo.deviceId) || [];
    deviceSessions.push(session.sessionId);
    deviceSessionRegistry.set(options.deviceInfo.deviceId, deviceSessions);
  }

  logger.info("Session registered", {
    sessionId: session.sessionId,
    keyId,
    priority: enhancedSession.priority,
    deviceInfo: options.deviceInfo,
    totalSessions: existingSessions.length,
  });

  return {
    allowed: true,
    terminatedSessions,
    warnings,
  };
}

/**
 * Resolve session conflict based on strategy.
 */
function resolveSessionConflict(
  keyId: string,
  newSession: AuthSession,
  existingSessions: EnhancedSession[],
  strategy: ConflictResolution,
  config: Required<Omit<ConcurrentSessionConfig, "conflictResolution">>
): SessionConflictResult {
  const terminatedSessions: string[] = [];
  const warnings: string[] = [];

  switch (strategy) {
    case "deny_new":
      return {
        allowed: false,
        terminatedSessions,
        reason: `Maximum concurrent sessions (${config.maxConcurrentSessions}) reached`,
        warnings,
      };

    case "terminate_oldest": {
      // Find oldest non-pinned session
      const oldest = existingSessions
        .filter((s) => !s.pinned)
        .sort((a, b) => a.createdAt - b.createdAt)[0];

      if (oldest) {
        return terminateSessionAndContinue(
          keyId,
          oldest.sessionId,
          newSession,
          existingSessions,
          "Oldest session terminated"
        );
      }

      // All sessions are pinned
      return {
        allowed: false,
        terminatedSessions,
        reason: "All existing sessions are pinned",
        warnings,
      };
    }

    case "terminate_lowest_priority": {
      // Find lowest priority non-pinned session
      const priorityOrder: Record<SessionPriority, number> = {
        low: 1,
        normal: 2,
        high: 3,
        critical: 4,
      };

      const lowestPriority = existingSessions
        .filter((s) => !s.pinned)
        .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])[0];

      if (lowestPriority) {
        return terminateSessionAndContinue(
          keyId,
          lowestPriority.sessionId,
          newSession,
          existingSessions,
          "Lowest priority session terminated"
        );
      }

      // All sessions are pinned or same priority
      return {
        allowed: false,
        terminatedSessions,
        reason: "Cannot terminate higher priority sessions",
        warnings,
      };
    }

    case "terminate_idle": {
      // Find most idle non-pinned session
      const mostIdle = existingSessions
        .filter((s) => !s.pinned)
        .sort((a, b) => b.idleTime - a.idleTime)[0];

      if (mostIdle && mostIdle.idleTime > 60000) {
        // Only terminate if idle for more than 1 minute
        return terminateSessionAndContinue(
          keyId,
          mostIdle.sessionId,
          newSession,
          existingSessions,
          "Idle session terminated"
        );
      }

      // Fall back to oldest if no idle sessions
      return resolveSessionConflict(
        keyId,
        newSession,
        existingSessions,
        "terminate_oldest",
        config
      );
    }

    case "allow_all":
      warnings.push(
        `Session limit exceeded (${existingSessions.length}/${config.maxConcurrentSessions})`
      );
      return { allowed: true, terminatedSessions, warnings };

    default:
      return {
        allowed: false,
        terminatedSessions,
        reason: "Invalid conflict resolution strategy",
        warnings,
      };
  }
}

/**
 * Terminate a session and continue with new session registration.
 */
function terminateSessionAndContinue(
  keyId: string,
  sessionIdToTerminate: string,
  newSession: AuthSession,
  existingSessions: EnhancedSession[],
  reason: string
): SessionConflictResult {
  // Remove the session
  const updatedSessions = existingSessions.filter((s) => s.sessionId !== sessionIdToTerminate);
  userSessionRegistry.set(keyId, updatedSessions);

  // Remove from device registry
  const sessionToTerminate = existingSessions.find((s) => s.sessionId === sessionIdToTerminate);
  if (sessionToTerminate) {
    removeFromDeviceRegistry(sessionToTerminate);
  }

  logger.warn("Session terminated due to conflict", {
    sessionId: sessionIdToTerminate,
    keyId,
    reason,
  });

  securityLogger.logSuspiciousActivity(
    { req: { header: () => undefined }, res: {} } as never,
    "session_conflict",
    `Session ${sessionIdToTerminate} terminated: ${reason}`
  );

  return {
    allowed: true,
    terminatedSessions: [sessionIdToTerminate],
    warnings: [reason],
  };
}

/**
 * Update session activity (called on each request).
 */
export function updateSessionActivity(sessionId: string): boolean {
  const now = Date.now();

  for (const [keyId, sessions] of userSessionRegistry.entries()) {
    const session = sessions.find((s) => s.sessionId === sessionId);
    if (session) {
      // Calculate idle time before updating
      session.idleTime = now - session.lastActivityAt;
      session.lastActivityAt = now;

      // Update in registry
      const index = sessions.indexOf(session);
      sessions[index] = session;
      userSessionRegistry.set(keyId, sessions);

      return true;
    }
  }

  return false;
}

/**
 * Terminate a specific session.
 */
export function terminateSession(sessionId: string): boolean {
  for (const [keyId, sessions] of userSessionRegistry.entries()) {
    const index = sessions.findIndex((s) => s.sessionId === sessionId);
    if (index > -1) {
      const session = sessions[index];
      sessions.splice(index, 1);

      if (sessions.length === 0) {
        userSessionRegistry.delete(keyId);
      } else {
        userSessionRegistry.set(keyId, sessions);
      }

      removeFromDeviceRegistry(session);

      logger.info("Session terminated", { sessionId, keyId });
      return true;
    }
  }

  return false;
}

/**
 * Terminate all sessions for a user.
 */
export function terminateAllUserSessions(keyId: string): number {
  const sessions = userSessionRegistry.get(keyId);
  if (!sessions) {
    return 0;
  }

  // Remove from device registries
  for (const session of sessions) {
    removeFromDeviceRegistry(session);
  }

  userSessionRegistry.delete(keyId);

  logger.info("All user sessions terminated", { keyId, count: sessions.length });
  return sessions.length;
}

/**
 * Terminate all sessions except the specified one.
 */
export function terminateAllOtherSessions(keyId: string, keepSessionId: string): number {
  const sessions = userSessionRegistry.get(keyId);
  if (!sessions) {
    return 0;
  }

  const toTerminate = sessions.filter((s) => s.sessionId !== keepSessionId);
  const kept = sessions.find((s) => s.sessionId === keepSessionId);

  if (kept) {
    userSessionRegistry.set(keyId, [kept]);
  } else {
    userSessionRegistry.delete(keyId);
  }

  // Remove from device registries
  for (const session of toTerminate) {
    removeFromDeviceRegistry(session);
  }

  logger.info("Other sessions terminated", {
    keyId,
    keptSession: keepSessionId,
    terminated: toTerminate.length,
  });

  return toTerminate.length;
}

/**
 * Pin a session (prevent automatic termination).
 */
export function pinSession(sessionId: string): boolean {
  for (const [keyId, sessions] of userSessionRegistry.entries()) {
    const session = sessions.find((s) => s.sessionId === sessionId);
    if (session) {
      session.pinned = true;
      logger.info("Session pinned", { sessionId, keyId });
      return true;
    }
  }

  return false;
}

/**
 * Unpin a session.
 */
export function unpinSession(sessionId: string): boolean {
  for (const [keyId, sessions] of userSessionRegistry.entries()) {
    const session = sessions.find((s) => s.sessionId === sessionId);
    if (session) {
      session.pinned = false;
      logger.info("Session unpinned", { sessionId, keyId });
      return true;
    }
  }

  return false;
}

/**
 * Get session statistics.
 */
export function getSessionStats(): {
  totalUsers: number;
  totalSessions: number;
  totalDevices: number;
  sessionsByPriority: Record<SessionPriority, number>;
  pinnedSessions: number;
  averageIdleTime: number;
} {
  let totalSessions = 0;
  let totalIdleTime = 0;
  const sessionsByPriority: Record<SessionPriority, number> = {
    low: 0,
    normal: 0,
    high: 0,
    critical: 0,
  };
  let pinnedSessions = 0;

  for (const sessions of userSessionRegistry.values()) {
    for (const session of sessions) {
      totalSessions++;
      totalIdleTime += session.idleTime;
      sessionsByPriority[session.priority]++;
      if (session.pinned) {
        pinnedSessions++;
      }
    }
  }

  return {
    totalUsers: userSessionRegistry.size,
    totalSessions,
    totalDevices: deviceSessionRegistry.size,
    sessionsByPriority,
    pinnedSessions,
    averageIdleTime: totalSessions > 0 ? totalIdleTime / totalSessions : 0,
  };
}

/**
 * Clear all session data (useful for testing).
 */
export function clearAllSessions(): void {
  userSessionRegistry.clear();
  deviceSessionRegistry.clear();
  logger.info("All session data cleared");
}
