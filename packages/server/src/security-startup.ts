/**
 * Security startup validation.
 *
 * Validates critical security settings at startup to ensure the server
 * is not deployed with insecure configuration.
 *
 * This module performs fail-fast checks before the HTTP server starts,
 * preventing deployment with known security misconfigurations.
 */

import { logger } from "./observability/logger.js";

/**
 * Security validation result.
 */
interface ValidationResult {
  /** Whether validation passed */
  passed: boolean;
  /** Security warnings (non-fatal) */
  warnings: string[];
  /** Security errors (fatal) */
  errors: string[];
}

/**
 * Validate security configuration at startup.
 *
 * Checks:
 * - ALLOWED_HOSTS is set in production (prevents host header injection)
 * - PASSWORD_PEPPER is set (optional but recommended)
 * - VAPID keys are configured (required for push notifications)
 *
 * In development mode, only warnings are issued. In production mode,
 * critical misconfigurations will cause startup to fail.
 */
export function validateSecurityConfiguration(): ValidationResult {
  const result: ValidationResult = {
    passed: true,
    warnings: [],
    errors: [],
  };

  const isProduction = process.env["NODE_ENV"] === "production";
  const isTest = process.env["TEST_MODE"] === "true";

  // Skip validation in test mode
  if (isTest) {
    logger.debug("Security validation skipped in test mode");
    return result;
  }

  // -------------------------------------------------------------------------
  // ALLOWED_HOSTS validation
  // -------------------------------------------------------------------------
  const allowedHosts = process.env["ALLOWED_HOSTS"];
  if (!allowedHosts || allowedHosts.trim() === "") {
    const message =
      "ALLOWED_HOSTS is not set. This allows any hostname, which may expose the application to host header injection attacks.";

    if (isProduction) {
      result.errors.push(message);
      result.passed = false;
    } else {
      result.warnings.push(message + " (OK for development)");
    }
  }

  // -------------------------------------------------------------------------
  // PASSWORD_PEPPER validation
  // -------------------------------------------------------------------------
  const passwordPepper = process.env["PASSWORD_PEPPER"];
  if (!passwordPepper || passwordPepper.trim() === "" || passwordPepper.length < 32) {
    const message =
      "PASSWORD_PEPPER is not set or too short (should be at least 32 bytes / 64 hex chars). This reduces password security by removing a layer of defense.";

    result.warnings.push(message);
  }

  // -------------------------------------------------------------------------
  // VAPID keys validation
  // -------------------------------------------------------------------------
  const vapidPublicKey = process.env["VAPID_PUBLIC_KEY"];
  const vapidPrivateKey = process.env["VAPID_PRIVATE_KEY"];

  if (!vapidPublicKey || vapidPublicKey.trim() === "") {
    const message = "VAPID_PUBLIC_KEY is not set. Push notifications will not work.";
    result.warnings.push(message);
  }

  if (!vapidPrivateKey || vapidPrivateKey.trim() === "") {
    const message = "VAPID_PRIVATE_KEY is not set. Push notifications will not work.";
    result.warnings.push(message);
  }

  // Log warnings
  if (result.warnings.length > 0) {
    logger.warn("Security configuration warnings", {
      warnings: result.warnings,
    });
  }

  // Log errors and fail in production
  if (result.errors.length > 0) {
    logger.error("Security configuration errors", {
      errors: result.errors,
      fatal: true,
    });
  }

  return result;
}

/**
 * Validate security configuration and throw if critical issues are found.
 *
 * Use this at startup to fail-fast on security misconfigurations.
 *
 * @throws Error if critical security issues are found in production
 */
export function validateSecurityOrThrow(): void {
  const result = validateSecurityConfiguration();

  if (!result.passed) {
    throw new Error(
      `Security validation failed:\n${result.errors.map((e) => `  - ${e}`).join("\n")}`
    );
  }
}
