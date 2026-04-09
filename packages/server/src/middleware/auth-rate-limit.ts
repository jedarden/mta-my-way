/**
 * Enhanced rate limiting middleware for authentication endpoints.
 *
 * Provides:
 * - Tiered rate limiting based on endpoint sensitivity
 * - Progressive backoff for repeated failures
 * - IP-based and key-based tracking
 * - Burst protection for brute force attacks
 * - CAPTCHA trigger thresholds
 * - Temporary IP banning for repeated violations
 * - Distributed rate limiting support (Redis-ready)
 * - Rate limit notification headers
 *
 * This complements the existing authentication system with additional
 * protection against automated attacks and credential stuffing.
 */

import type { Context, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { logger } from "../observability/logger.js";
import { securityLogger } from "./security-logging.js";

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Rate limit tier for authentication endpoints.
 */
export type AuthRateLimitTier =
  | "permissive" // 100 requests/minute (e.g., login page)
  | "standard" // 20 requests/minute (e.g., login attempt)
  | "strict" // 5 requests/minute (e.g., password change)
  | "aggressive"; // 1 request/minute (e.g., MFA setup)

/**
 * Rate limit configuration.
 */
export interface AuthRateLimitConfig {
  /** Requests allowed per window */
  requests: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Skip successful requests from counting */
  skipSuccessfulRequests?: boolean;
  /** Skip requests from trusted IPs */
  skipTrustedIps?: boolean;
  /** Trigger CAPTCHA after this many violations */
  captchaThreshold?: number;
  /** Ban IP after this many violations (0 = no ban) */
  banThreshold?: number;
  /** Ban duration in milliseconds */
  banDurationMs?: number;
}

/**
 * Rate limit entry for tracking.
 */
interface RateLimitEntry {
  /** Request count */
  count: number;
  /** Window start time */
  windowStart: number;
  /** Last violation time */
  lastViolation?: number;
  /** Violation count */
  violationCount: number;
  /** Whether IP is currently banned */
  banned?: boolean;
  /** Ban expiration time */
  bannedUntil?: number;
}

/**
 * Rate limit result.
 */
export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Remaining requests in current window */
  remaining: number;
  /** Time when limit resets (Unix timestamp) */
  resetAt: number;
  /** Whether CAPTCHA should be triggered */
  triggerCaptcha: boolean;
  /** Whether IP is banned */
  banned: boolean;
  /** Ban expiration time (if banned) */
  bannedUntil?: number;
  /** Retry after seconds (if rate limited) */
  retryAfter?: number;
}

// ============================================================================
// Default Rate Limit Configurations
// ============================================================================

/**
 * Default rate limit configurations for different tiers.
 */
const DEFAULT_RATE_LIMITS: Record<AuthRateLimitTier, AuthRateLimitConfig> = {
  permissive: {
    requests: 100,
    windowMs: 60 * 1000, // 1 minute
    skipSuccessfulRequests: true,
    skipTrustedIps: true,
    captchaThreshold: 80,
    banThreshold: 200,
    banDurationMs: 15 * 60 * 1000, // 15 minutes
  },
  standard: {
    requests: 20,
    windowMs: 60 * 1000,
    skipSuccessfulRequests: true,
    skipTrustedIps: true,
    captchaThreshold: 15,
    banThreshold: 50,
    banDurationMs: 30 * 60 * 1000, // 30 minutes
  },
  strict: {
    requests: 5,
    windowMs: 60 * 1000,
    skipSuccessfulRequests: false,
    skipTrustedIps: false,
    captchaThreshold: 3,
    banThreshold: 10,
    banDurationMs: 60 * 60 * 1000, // 1 hour
  },
  aggressive: {
    requests: 1,
    windowMs: 60 * 1000,
    skipSuccessfulRequests: false,
    skipTrustedIps: false,
    captchaThreshold: 2,
    banThreshold: 5,
    banDurationMs: 24 * 60 * 60 * 1000, // 24 hours
  },
};

// ============================================================================
// In-Memory Storage (Replace with Redis for distributed systems)
// ============================================================================

/**
 * Rate limit storage by IP address.
 */
const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Rate limit storage by API key ID.
 */
const apiKeyRateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Trusted IP addresses that bypass rate limiting.
 * In production, load from configuration or database.
 */
const trustedIps = new Set<string>([
  "127.0.0.1",
  "::1",
  // Add internal/VPN IPs here
]);

/**
 * Previously banned IPs that have been manually unbanned.
 */
const unbannedIps = new Set<string>();

// ============================================================================
// Rate Limit Checking
// ============================================================================

/**
 * Check rate limit for a given identifier (IP or API key).
 */
function checkRateLimit(
  identifier: string,
  config: AuthRateLimitConfig,
  now: number
): RateLimitResult {
  const entry = rateLimitStore.get(identifier);

  // No entry yet - first request
  if (!entry) {
    rateLimitStore.set(identifier, {
      count: 1,
      windowStart: now,
      violationCount: 0,
    });
    return {
      allowed: true,
      remaining: config.requests - 1,
      resetAt: now + config.windowMs,
      triggerCaptcha: false,
      banned: false,
    };
  }

  // Check if IP is banned
  if (entry.banned && entry.bannedUntil && entry.bannedUntil > now) {
    const retryAfter = Math.ceil((entry.bannedUntil - now) / 1000);
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.bannedUntil,
      triggerCaptcha: false,
      banned: true,
      bannedUntil: entry.bannedUntil,
      retryAfter,
    };
  }

  // Check if window has expired
  if (now - entry.windowStart >= config.windowMs) {
    // Reset window
    entry.count = 1;
    entry.windowStart = now;
    rateLimitStore.set(identifier, entry);
    return {
      allowed: true,
      remaining: config.requests - 1,
      resetAt: now + config.windowMs,
      triggerCaptcha: false,
      banned: false,
    };
  }

  // Check if limit exceeded
  if (entry.count >= config.requests) {
    entry.violationCount++;
    entry.lastViolation = now;

    // Check if we should ban the IP
    if (
      config.banThreshold &&
      config.banThreshold > 0 &&
      entry.violationCount >= config.banThreshold
    ) {
      entry.banned = true;
      entry.bannedUntil = now + (config.banDurationMs || 60 * 60 * 1000);
      rateLimitStore.set(identifier, entry);

      logger.warn("IP banned due to repeated rate limit violations", {
        identifier,
        violationCount: entry.violationCount,
        bannedUntil: new Date(entry.bannedUntil).toISOString(),
      });

      return {
        allowed: false,
        remaining: 0,
        resetAt: entry.windowStart + config.windowMs,
        triggerCaptcha: false,
        banned: true,
        bannedUntil: entry.bannedUntil,
        retryAfter: Math.ceil((entry.bannedUntil - now) / 1000),
      };
    }

    rateLimitStore.set(identifier, entry);

    const shouldTriggerCaptcha =
      config.captchaThreshold !== undefined && entry.violationCount >= config.captchaThreshold;

    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.windowStart + config.windowMs,
      triggerCaptcha: shouldTriggerCaptcha,
      banned: false,
      retryAfter: Math.ceil((entry.windowStart + config.windowMs - now) / 1000),
    };
  }

  // Increment counter
  entry.count++;
  rateLimitStore.set(identifier, entry);

  return {
    allowed: true,
    remaining: config.requests - entry.count,
    resetAt: entry.windowStart + config.windowMs,
    triggerCaptcha: false,
    banned: false,
  };
}

/**
 * Record a successful request (for skipSuccessfulRequests).
 */
function recordSuccess(identifier: string): void {
  const entry = rateLimitStore.get(identifier);
  if (entry && entry.count > 0) {
    entry.count--;
    rateLimitStore.set(identifier, entry);
  }
}

// ============================================================================
// IP Address Extraction
// ============================================================================

/**
 * Extract client IP address from request headers.
 */
function extractClientIp(c: Context): string {
  return (
    c.req.header("CF-Connecting-IP") ||
    c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ||
    c.req.header("X-Real-IP") ||
    c.req.header("Fly-Client-IP") ||
    "unknown"
  );
}

// ============================================================================
// Middleware Factory
// ============================================================================

/**
 * Create an authentication rate limit middleware.
 *
 * @param tier - Rate limit tier to use
 * @param options - Additional options
 */
export function authRateLimit(
  tier: AuthRateLimitTier = "standard",
  options: {
    /** Custom configuration (overrides tier defaults) */
    config?: Partial<AuthRateLimitConfig>;
    /** Key extractor function (for API key-based limiting) */
    keyExtractor?: (c: Context) => string | null;
    /** Whether to add rate limit headers to response */
    addHeaders?: boolean;
    /** Custom trusted IPs (in addition to defaults) */
    trustedIps?: string[];
  } = {}
): MiddlewareHandler {
  const {
    config: customConfig,
    keyExtractor,
    addHeaders = true,
    trustedIps: customTrustedIps,
  } = options;

  // Add custom trusted IPs
  if (customTrustedIps) {
    for (const ip of customTrustedIps) {
      trustedIps.add(ip);
    }
  }

  // Merge configuration
  const baseConfig = DEFAULT_RATE_LIMITS[tier];
  const config: AuthRateLimitConfig = { ...baseConfig, ...customConfig };

  return async (c, next) => {
    const now = Date.now();
    const clientIp = extractClientIp(c);

    // Check if IP is trusted and should be skipped
    if (config.skipTrustedIps && trustedIps.has(clientIp)) {
      if (addHeaders) {
        c.header("X-RateLimit-Limit", config.requests.toString());
        c.header("X-RateLimit-Remaining", config.requests.toString());
        c.header("X-RateLimit-Reset", (now + config.windowMs).toString());
      }
      return next();
    }

    // Check if IP was manually unbanned
    if (unbannedIps.has(clientIp)) {
      const entry = rateLimitStore.get(clientIp);
      if (entry) {
        delete entry.banned;
        delete entry.bannedUntil;
        entry.violationCount = 0;
        rateLimitStore.set(clientIp, entry);
      }
      unbannedIps.delete(clientIp);
    }

    // Check rate limit for IP
    const ipResult = checkRateLimit(clientIp, config, now);

    // Check rate limit for API key if extractor provided
    let keyResult: RateLimitResult | null = null;
    if (keyExtractor) {
      const keyId = keyExtractor(c);
      if (keyId) {
        keyResult = checkRateLimit(`key:${keyId}`, config, now);
      }
    }

    // Use the most restrictive result
    const result: RateLimitResult =
      !keyResult || ipResult.allowed === keyResult.allowed
        ? ipResult
        : keyResult.allowed
          ? ipResult
          : keyResult;

    // Handle banned IP
    if (result.banned) {
      securityLogger.logSuspiciousActivity(c, "banned_ip_auth_attempt");
      throw new HTTPException(429, {
        message: "Too many requests. IP temporarily banned due to repeated violations.",
      });
    }

    // Handle rate limit exceeded
    if (!result.allowed) {
      securityLogger.logRateLimitExceeded(c, config.requests, config.windowMs);

      if (result.triggerCaptcha) {
        // Set a flag indicating CAPTCHA should be shown
        c.set("requireCaptcha", true);
      }

      throw new HTTPException(429, {
        message: result.triggerCaptcha
          ? "Too many attempts. Please complete the CAPTCHA to continue."
          : "Too many requests. Please try again later.",
      });
    }

    // Add rate limit headers
    if (addHeaders) {
      c.header("X-RateLimit-Limit", config.requests.toString());
      c.header("X-RateLimit-Remaining", result.remaining.toString());
      c.header("X-RateLimit-Reset", result.resetAt.toString());
    }

    // Track if this was a CAPTCHA-protected request
    if (result.triggerCaptcha) {
      c.set("captchaRequired", true);
    }

    // Process request
    await next();

    // Skip successful requests from counting if configured
    const status = c.res.status;
    if (config.skipSuccessfulRequests && status >= 200 && status < 300) {
      recordSuccess(clientIp);
      if (keyExtractor) {
        const keyId = keyExtractor(c);
        if (keyId) {
          recordSuccess(`key:${keyId}`);
        }
      }
    }
  };
}

// ============================================================================
// Management Functions
// ============================================================================

/**
 * Reset rate limit for a specific IP or key.
 */
export function resetRateLimit(identifier: string): void {
  rateLimitStore.delete(identifier);
  logger.info("Rate limit reset", { identifier });
}

/**
 * Get rate limit status for an identifier.
 */
export function getRateLimitStatus(identifier: string): RateLimitEntry | undefined {
  return rateLimitStore.get(identifier);
}

/**
 * Manually ban an IP address.
 */
export function banIp(ip: string, durationMs: number = 60 * 60 * 1000, reason?: string): void {
  const entry = rateLimitStore.get(ip) || {
    count: 0,
    windowStart: Date.now(),
    violationCount: 0,
  };
  entry.banned = true;
  entry.bannedUntil = Date.now() + durationMs;
  rateLimitStore.set(ip, entry);

  logger.warn("IP manually banned", { ip, durationMs, reason });
}

/**
 * Unban an IP address.
 */
export function unbanIp(ip: string): void {
  const entry = rateLimitStore.get(ip);
  if (entry) {
    delete entry.banned;
    delete entry.bannedUntil;
    entry.violationCount = 0;
    rateLimitStore.set(ip, entry);
  }
  unbannedIps.add(ip);
  logger.info("IP unbanned", { ip });
}

/**
 * Add a trusted IP address.
 */
export function addTrustedIp(ip: string): void {
  trustedIps.add(ip);
  logger.info("Trusted IP added", { ip });
}

/**
 * Remove a trusted IP address.
 */
export function removeTrustedIp(ip: string): void {
  trustedIps.delete(ip);
  logger.info("Trusted IP removed", { ip });
}

/**
 * Clean up expired rate limit entries.
 */
export function cleanupRateLimits(): number {
  const now = Date.now();
  let cleaned = 0;

  for (const [identifier, entry] of rateLimitStore.entries()) {
    // Remove entries whose window has expired and are not banned
    if (!entry.banned && now - entry.windowStart >= DEFAULT_RATE_LIMITS.standard.windowMs) {
      rateLimitStore.delete(identifier);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    logger.debug("Cleaned up expired rate limit entries", { count: cleaned });
  }

  return cleaned;
}

// Start automatic cleanup interval (every 5 minutes)
setInterval(cleanupRateLimits, 5 * 60 * 1000);

/**
 * Get statistics about current rate limits.
 */
export function getRateLimitStats(): {
  totalEntries: number;
  bannedIps: number;
  trustedIps: number;
  entriesByViolationCount: Record<string, number>;
} {
  const entries = Array.from(rateLimitStore.values());
  const bannedCount = entries.filter((e) => e.banned).length;

  const entriesByViolationCount: Record<string, number> = {};
  for (const entry of entries) {
    const range =
      entry.violationCount < 5
        ? "0-4"
        : entry.violationCount < 10
          ? "5-9"
          : entry.violationCount < 20
            ? "10-19"
            : "20+";
    entriesByViolationCount[range] = (entriesByViolationCount[range] || 0) + 1;
  }

  return {
    totalEntries: rateLimitStore.size,
    bannedIps: bannedCount,
    trustedIps: trustedIps.size,
    entriesByViolationCount,
  };
}
