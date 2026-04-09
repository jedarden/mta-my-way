/**
 * CAPTCHA integration framework for suspicious authentication attempts.
 *
 * Provides:
 * - Support for multiple CAPTCHA providers (Cloudflare Turnstile, reCAPTCHA, hCaptcha)
 * - Adaptive CAPTCHA triggering based on risk assessment
 * - Invisible CAPTCHA mode for seamless user experience
 * - CAPTCHA verification middleware
 * - Score-based thresholding
 * - Fallback handling for CAPTCHA failures
 * - Rate limiting for CAPTCHA verification attempts
 *
 * This framework integrates with the rate limiting system to provide
 * an additional layer of protection against automated attacks.
 */

import type { Context, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { logger } from "../observability/logger.js";
import { securityLogger } from "./security-logging.js";

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Supported CAPTCHA providers.
 */
export type CaptchaProvider = "turnstile" | "recaptcha" | "hcaptcha" | "custom";

/**
 * CAPTCHA configuration.
 */
export interface CaptchaConfig {
  /** CAPTCHA provider */
  provider: CaptchaProvider;
  /** Site key (public) - used by frontend */
  siteKey: string;
  /** Secret key (private) - used for verification */
  secretKey: string;
  /** Minimum score threshold (0.0 - 1.0) for score-based providers */
  minScore?: number;
  /** Whether to use invisible CAPTCHA mode */
  invisible?: boolean;
  /** Verification endpoint URL (for custom providers) */
  verifyUrl?: string;
  /** Timeout for verification requests (ms) */
  timeout?: number;
}

/**
 * CAPTCHA verification result.
 */
export interface CaptchaVerificationResult {
  /** Whether verification succeeded */
  success: boolean;
  /** Verification score (for score-based providers) */
  score?: number;
  /** Challenge timestamp */
  challengeTs?: string;
  /** Hostname where challenge was solved */
  hostname?: string;
  /** Error message if verification failed */
  error?: string;
  /** Whether this was a fallback verification */
  fallback?: boolean;
}

/**
 * CAPTCHA challenge data for frontend.
 */
export interface CaptchaChallenge {
  /** Site key for rendering the CAPTCHA widget */
  siteKey: string;
  /** CAPTCHA provider */
  provider: CaptchaProvider;
  /** Whether to use invisible mode */
  invisible: boolean;
  /** Minimum required score */
  minScore?: number;
  /** Widget theme (light/dark) */
  theme?: "light" | "dark" | "auto";
  /** Widget language */
  language?: string;
}

/**
 * CAPTCHA trigger conditions.
 */
export interface CaptchaTriggerConditions {
  /** Minimum risk score to trigger CAPTCHA */
  minRiskScore?: number;
  /** Trigger after N failed auth attempts */
  failedAttemptsThreshold?: number;
  /** Trigger for new devices (first N sessions) */
  newDeviceSessionThreshold?: number;
  /** Trigger for IP changes */
  triggerOnIpChange?: boolean;
  /** Trigger for suspicious user agents */
  triggerOnSuspiciousUserAgent?: boolean;
  /** Always trigger CAPTCHA for this route */
  alwaysRequire?: boolean;
}

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default CAPTCHA trigger conditions.
 */
const DEFAULT_TRIGGER_CONDITIONS: Required<CaptchaTriggerConditions> = {
  minRiskScore: 50,
  failedAttemptsThreshold: 3,
  newDeviceSessionThreshold: 3,
  triggerOnIpChange: true,
  triggerOnSuspiciousUserAgent: true,
  alwaysRequire: false,
};

// ============================================================================
// In-Memory Storage (Replace with Redis for distributed systems)
// ============================================================================

/**
 * Failed CAPTCHA attempt tracking.
 */
const failedCaptchaAttempts = new Map<string, { count: number; resetAt: number }>();

/**
 * CAPTCHA configuration storage.
 */
const captchaConfigs = new Map<string, CaptchaConfig>();

/**
 * Default CAPTCHA configuration.
 */
let defaultCaptchaConfig: CaptchaConfig | null = null;

// ============================================================================
// CAPTCHA Verification
// ============================================================================

/**
 * Verify a CAPTCHA response token.
 *
 * @param token - The CAPTCHA response token from the frontend
 * @param config - CAPTCHA configuration to use
 * @param clientIp - Client IP address for validation
 */
export async function verifyCaptcha(
  token: string,
  config: CaptchaConfig,
  clientIp: string
): Promise<CaptchaVerificationResult> {
  if (!token || token.trim().length === 0) {
    return {
      success: false,
      error: "CAPTCHA token is required",
    };
  }

  try {
    let result: CaptchaVerificationResult;

    switch (config.provider) {
      case "turnstile":
        result = await verifyTurnstile(token, config, clientIp);
        break;
      case "recaptcha":
        result = await verifyRecaptcha(token, config, clientIp);
        break;
      case "hcaptcha":
        result = await verifyHcaptcha(token, config, clientIp);
        break;
      case "custom":
        result = await verifyCustomProvider(token, config, clientIp);
        break;
      default:
        return {
          success: false,
          error: "Unsupported CAPTCHA provider",
        };
    }

    if (result.success) {
      // Reset failed attempts on success
      failedCaptchaAttempts.delete(clientIp);
      logger.info("CAPTCHA verified successfully", {
        provider: config.provider,
        clientIp,
        score: result.score,
      });
    } else {
      // Track failed attempts
      trackFailedCaptchaAttempt(clientIp);
      securityLogger.logSuspiciousActivity(
        {} as Context,
        "captcha_verification_failed",
        result.error || "Unknown error"
      );
    }

    return result;
  } catch (error) {
    logger.error("CAPTCHA verification error", error as Error, { provider: config.provider });
    return {
      success: false,
      error: "CAPTCHA verification failed",
    };
  }
}

/**
 * Verify Cloudflare Turnstile CAPTCHA.
 */
async function verifyTurnstile(
  token: string,
  config: CaptchaConfig,
  clientIp: string
): Promise<CaptchaVerificationResult> {
  const verifyUrl = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

  const response = await fetch(verifyUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      secret: config.secretKey,
      response: token,
      remoteip: clientIp,
    }),
    signal: AbortSignal.timeout(config.timeout || 10000),
  });

  const data = await response.json();

  if (!data.success) {
    return {
      success: false,
      error: data["error-codes"]?.join(", ") || "Turnstile verification failed",
    };
  }

  // Check score if available and threshold is set
  if (config.minScore !== undefined && data.score !== undefined) {
    if (data.score < config.minScore) {
      return {
        success: false,
        error: `Score ${data.score} below threshold ${config.minScore}`,
        score: data.score,
      };
    }
  }

  return {
    success: true,
    score: data.score,
    challengeTs: data.challenge_ts,
    hostname: data.hostname,
  };
}

/**
 * Verify Google reCAPTCHA CAPTCHA.
 */
async function verifyRecaptcha(
  token: string,
  config: CaptchaConfig,
  clientIp: string
): Promise<CaptchaVerificationResult> {
  const verifyUrl = "https://www.google.com/recaptcha/api/siteverify";

  const response = await fetch(verifyUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      secret: config.secretKey,
      response: token,
      remoteip: clientIp,
    }),
    signal: AbortSignal.timeout(config.timeout || 10000),
  });

  const data = await response.json();

  if (!data.success) {
    return {
      success: false,
      error: data["error-codes"]?.join(", ") || "reCAPTCHA verification failed",
    };
  }

  // Check score for v3
  if (config.minScore !== undefined && data.score !== undefined) {
    if (data.score < config.minScore) {
      return {
        success: false,
        error: `Score ${data.score} below threshold ${config.minScore}`,
        score: data.score,
      };
    }
  }

  return {
    success: true,
    score: data.score,
    challengeTs: data.challenge_ts,
    hostname: data.hostname,
  };
}

/**
 * Verify hCaptcha CAPTCHA.
 */
async function verifyHcaptcha(
  token: string,
  config: CaptchaConfig,
  clientIp: string
): Promise<CaptchaVerificationResult> {
  const verifyUrl = "https://hcaptcha.com/siteverify";

  const response = await fetch(verifyUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      secret: config.secretKey,
      response: token,
      remoteip: clientIp,
    }),
    signal: AbortSignal.timeout(config.timeout || 10000),
  });

  const data = await response.json();

  if (!data.success) {
    return {
      success: false,
      error: data["error-codes"]?.join(", ") || "hCaptcha verification failed",
    };
  }

  // Check score if available
  if (config.minScore !== undefined && data.score !== undefined) {
    if (data.score < config.minScore) {
      return {
        success: false,
        error: `Score ${data.score} below threshold ${config.minScore}`,
        score: data.score,
      };
    }
  }

  return {
    success: true,
    score: data.score,
    challengeTs: data.challenge_ts,
    hostname: data.hostname,
  };
}

/**
 * Verify custom CAPTCHA provider.
 */
async function verifyCustomProvider(
  token: string,
  config: CaptchaConfig,
  clientIp: string
): Promise<CaptchaVerificationResult> {
  if (!config.verifyUrl) {
    return {
      success: false,
      error: "Custom provider verifyUrl not configured",
    };
  }

  const response = await fetch(config.verifyUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      token,
      clientIp,
      secret: config.secretKey,
    }),
    signal: AbortSignal.timeout(config.timeout || 10000),
  });

  if (!response.ok) {
    return {
      success: false,
      error: `Custom provider returned ${response.status}`,
    };
  }

  const data = await response.json();

  if (!data.success) {
    return {
      success: false,
      error: data.error || "Custom CAPTCHA verification failed",
    };
  }

  return {
    success: true,
    score: data.score,
    challengeTs: data.challenge_ts,
    hostname: data.hostname,
  };
}

/**
 * Track failed CAPTCHA attempts.
 */
function trackFailedCaptchaAttempt(clientIp: string): void {
  const now = Date.now();
  const existing = failedCaptchaAttempts.get(clientIp);

  if (!existing || now > existing.resetAt) {
    failedCaptchaAttempts.set(clientIp, {
      count: 1,
      resetAt: now + 60 * 60 * 1000, // 1 hour window
    });
  } else {
    existing.count++;
    failedCaptchaAttempts.set(clientIp, existing);
  }
}

/**
 * Check if client has exceeded failed CAPTCHA attempt threshold.
 */
export function hasExceededCaptchaAttempts(clientIp: string, threshold = 10): boolean {
  const attempts = failedCaptchaAttempts.get(clientIp);
  if (!attempts) return false;

  // Reset if window expired
  if (Date.now() > attempts.resetAt) {
    failedCaptchaAttempts.delete(clientIp);
    return false;
  }

  return attempts.count >= threshold;
}

// ============================================================================
// Middleware Factory
// ============================================================================

/**
 * Create CAPTCHA verification middleware.
 *
 * @param options - Middleware options
 */
export function requireCaptcha(options: {
  /** CAPTCHA configuration key (uses default if not provided) */
  configKey?: string;
  /** Custom CAPTCHA configuration */
  config?: CaptchaConfig;
  /** Whether CAPTCHA is always required */
  alwaysRequired?: boolean;
  /** Token extraction function (default: from body or query) */
  tokenExtractor?: (c: Context) => string | null;
  /** Skip verification if risk score is below threshold */
  skipBelowRiskScore?: number;
}): MiddlewareHandler {
  const {
    configKey,
    config: customConfig,
    alwaysRequired = false,
    tokenExtractor,
    skipBelowRiskScore,
  } = options;

  return async (c, next) => {
    // Check if CAPTCHA should be required
    const requireCaptchaFlag = c.get("requireCaptcha");
    const riskAssessment = c.get("sessionRiskAssessment") as { riskScore?: number } | undefined;

    // Skip if risk is below threshold
    if (skipBelowRiskScore && riskAssessment && riskAssessment.riskScore < skipBelowRiskScore) {
      return next();
    }

    // Skip if not required and no flag
    if (!alwaysRequired && !requireCaptchaFlag) {
      return next();
    }

    // Get CAPTCHA configuration
    const captchaConfig =
      customConfig || (configKey ? captchaConfigs.get(configKey) : defaultCaptchaConfig);

    if (!captchaConfig) {
      logger.warn("CAPTCHA required but not configured");
      // Allow to proceed if CAPTCHA not configured (don't block)
      return next();
    }

    // Extract token
    let token: string | null;
    if (tokenExtractor) {
      token = tokenExtractor(c);
    } else {
      // Try to get token from body or query
      const body = await c.req.json().catch(() => ({}));
      token = body.captchaToken || c.req.query("captcha_token") || null;
    }

    if (!token) {
      throw new HTTPException(400, {
        message: "CAPTCHA token is required",
      });
    }

    // Get client IP
    const clientIp =
      c.req.header("CF-Connecting-IP") ||
      c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ||
      c.req.header("X-Real-IP") ||
      "unknown";

    // Verify CAPTCHA
    const result = await verifyCaptcha(token, captchaConfig, clientIp);

    if (!result.success) {
      // Check if client should be temporarily blocked
      if (hasExceededCaptchaAttempts(clientIp)) {
        securityLogger.logSuspiciousActivity(c, "captcha_abuse_detected");
        throw new HTTPException(429, {
          message: "Too many failed CAPTCHA attempts. Please try again later.",
        });
      }

      throw new HTTPException(400, {
        message: result.error || "CAPTCHA verification failed",
      });
    }

    // Attach verification result to context
    c.set("captchaVerified", true);
    c.set("captchaScore", result.score);

    return next();
  };
}

/**
 * Conditional CAPTCHA middleware based on risk assessment.
 *
 * This middleware only requires CAPTCHA when certain conditions are met,
 * such as high risk score, failed attempts, or suspicious indicators.
 */
export function conditionalCaptcha(options: {
  /** CAPTCHA configuration */
  captchaConfig: CaptchaConfig;
  /** Trigger conditions */
  triggers?: CaptchaTriggerConditions;
}): MiddlewareHandler {
  const { captchaConfig, triggers = {} } = options;
  const mergedTriggers = { ...DEFAULT_TRIGGER_CONDITIONS, ...triggers };

  return async (c, next) => {
    let shouldRequireCaptcha = false;

    // Always require if configured
    if (mergedTriggers.alwaysRequire) {
      shouldRequireCaptcha = true;
    }

    // Check risk score from rate limiting or session security
    const riskAssessment = c.get("sessionRiskAssessment") as { riskScore?: number } | undefined;
    if (
      mergedTriggers.minRiskScore &&
      riskAssessment &&
      riskAssessment.riskScore >= mergedTriggers.minRiskScore
    ) {
      shouldRequireCaptcha = true;
    }

    // Check if CAPTCHA was flagged by rate limiter
    const requireCaptchaFlag = c.get("requireCaptcha");
    if (requireCaptchaFlag) {
      shouldRequireCaptcha = true;
    }

    // Check for failed auth attempts (would be set by auth middleware)
    const failedAttempts = c.get("failedAuthAttempts") as number | undefined;
    if (
      mergedTriggers.failedAttemptsThreshold &&
      failedAttempts &&
      failedAttempts >= mergedTriggers.failedAttemptsThreshold
    ) {
      shouldRequireCaptcha = true;
    }

    // Check for new device (low session count for device)
    const deviceSessionCount = c.get("deviceSessionCount") as number | undefined;
    if (
      mergedTriggers.newDeviceSessionThreshold &&
      deviceSessionCount &&
      deviceSessionCount <= mergedTriggers.newDeviceSessionThreshold
    ) {
      shouldRequireCaptcha = true;
    }

    if (shouldRequireCaptcha) {
      c.set("requireCaptcha", true);

      // Verify CAPTCHA token
      return requireCaptcha({ config: captchaConfig })(c, next);
    }

    return next();
  };
}

// ============================================================================
// Configuration Management
// ============================================================================

/**
 * Set the default CAPTCHA configuration.
 */
export function setDefaultCaptchaConfig(config: CaptchaConfig): void {
  defaultCaptchaConfig = config;
  logger.info("Default CAPTCHA configuration set", { provider: config.provider });
}

/**
 * Register a named CAPTCHA configuration.
 */
export function registerCaptchaConfig(key: string, config: CaptchaConfig): void {
  captchaConfigs.set(key, config);
  logger.info("CAPTCHA configuration registered", { key, provider: config.provider });
}

/**
 * Get a CAPTCHA configuration by key.
 */
export function getCaptchaConfig(key: string): CaptchaConfig | undefined {
  return captchaConfigs.get(key);
}

/**
 * Get CAPTCHA challenge data for frontend.
 */
export function getCaptchaChallenge(configKey?: string): CaptchaChallenge | null {
  const config = configKey ? captchaConfigs.get(configKey) : defaultCaptchaConfig;

  if (!config) {
    return null;
  }

  return {
    siteKey: config.siteKey,
    provider: config.provider,
    invisible: config.invisible || false,
    minScore: config.minScore,
    theme: "auto",
    language: "en",
  };
}

// ============================================================================
// Statistics and Management
// ============================================================================

/**
 * Get CAPTCHA statistics.
 */
export function getCaptchaStats(): {
  totalConfigs: number;
  failedAttempts: number;
  uniqueIpsWithFailures: number;
} {
  return {
    totalConfigs: captchaConfigs.size + (defaultCaptchaConfig ? 1 : 0),
    failedAttempts: Array.from(failedCaptchaAttempts.values()).reduce(
      (sum, entry) => sum + entry.count,
      0
    ),
    uniqueIpsWithFailures: failedCaptchaAttempts.size,
  };
}

/**
 * Clear failed CAPTCHA attempts for an IP.
 */
export function clearFailedCaptchaAttempts(clientIp: string): void {
  failedCaptchaAttempts.delete(clientIp);
  logger.info("Failed CAPTCHA attempts cleared", { clientIp });
}

/**
 * Reset all CAPTCHA tracking data.
 */
export function resetCaptchaTracking(): void {
  failedCaptchaAttempts.clear();
  logger.info("All CAPTCHA tracking data reset");
}
