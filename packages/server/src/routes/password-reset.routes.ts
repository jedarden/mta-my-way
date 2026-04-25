/**
 * Password Reset API Routes
 *
 * Provides REST API endpoints for password reset functionality.
 *
 * Endpoints:
 * - GET  /api/auth/password/policy      - Get password policy requirements
 * - POST /api/auth/password/reset       - Request password reset
 * - POST /api/auth/password/reset/confirm - Confirm password reset
 * - POST /api/auth/password/change      - Change password (authenticated)
 */

import {
  passwordChangeSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
} from "@mta-my-way/shared";
import type { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  type Permission,
  auditLogAccess,
  getRbacAuthContext,
  requirePermission,
  requireResourceAccess,
} from "../middleware/index.js";
import { authRateLimit, requireCaptcha } from "../middleware/index.js";
import {
  consumePasswordResetToken,
  generatePasswordResetToken,
  getDeviceInfo,
  getPasswordPolicyDescription,
  hashPassword,
  invalidateAllSessionsForKey,
  invalidateResetTokensForKey,
  storePasswordInHistory,
  validatePassword,
  validatePasswordResetToken,
  verifyPasswordHash,
} from "../middleware/password-management.js";
import { securityLogger } from "../middleware/security-logging.js";
import { logger } from "../observability/logger.js";
import {
  configureEmailProvider,
  sendPasswordResetEmail,
  sendPasswordResetNotificationEmail,
} from "../services/password-reset.service.js";

// Types for route context
type AuthContext = {
  keyId: string;
  role?: string;
  scope?: string;
  sessionId?: string;
};

// ============================================================================
// In-Memory User Storage (Replace with database in production)
// ============================================================================

/**
 * Simple in-memory user storage.
 * In production, this would be a database table with:
 * - userId (primary key)
 * - email (unique)
 * - passwordHash
 * - passwordSalt
 * - createdAt
 * - updatedAt
 */
export interface UserRecord {
  userId: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  createdAt: number;
  updatedAt: number;
}

const users = new Map<string, UserRecord>();

/**
 * Find user by email.
 */
export function findUserByEmail(email: string): UserRecord | undefined {
  return Array.from(users.values()).find((u) => u.email.toLowerCase() === email.toLowerCase());
}

/**
 * Find user by user ID.
 */
export function getUserById(userId: string): UserRecord | undefined {
  return users.get(userId);
}

/**
 * Create or update a user record.
 */
export function upsertUser(user: UserRecord): void {
  users.set(user.userId, user);
}

/**
 * Delete a user by ID.
 * Used for test cleanup.
 */
export function deleteUser(userId: string): boolean {
  return users.delete(userId);
}

/**
 * Get all users (for testing).
 */
export function getAllUsers(): ReadonlyMap<string, UserRecord> {
  return users;
}

/**
 * Clear all users (for testing).
 */
export function clearAllUsers(): void {
  users.clear();
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * Get password policy requirements.
 *
 * Returns the current password policy including length requirements,
 * complexity requirements, and other security settings.
 */
export const getPasswordPolicyHandler: MiddlewareHandler = async (c) => {
  const policy = getPasswordPolicyDescription();

  return c.json({
    policy,
    requirements: {
      minLength: policy.minLength,
      maxLength: policy.maxLength,
      requireUppercase: policy.requireUppercase,
      requireLowercase: policy.requireLowercase,
      requireNumbers: policy.requireNumbers,
      requireSpecialChars: policy.requireSpecialChars,
      allowSpaces: policy.allowSpaces,
      expirationDays: policy.expirationDays,
      historyCount: policy.historyCount,
    },
    tips: [
      "Use at least 12 characters",
      "Include uppercase and lowercase letters",
      "Add numbers and special characters",
      "Avoid common words or patterns",
      "Don't reuse recent passwords",
    ],
  });
};

/**
 * Request password reset.
 *
 * Initiates the password reset flow by:
 * 1. Validating the email address
 * 2. Rate limiting (strict tier: 5 requests/minute)
 * 3. Checking if user exists (but not revealing this)
 * 4. Generating a secure reset token with device fingerprinting
 * 5. Sending email with reset link
 * 6. Invalidating any existing reset tokens
 */
export const requestPasswordResetHandler: MiddlewareHandler = async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const validationResult = passwordResetRequestSchema.safeParse(body);

    if (!validationResult.success) {
      return c.json(
        {
          error: "Invalid request",
          details: validationResult.error.errors,
        },
        400
      );
    }

    const { email } = validationResult.data;

    // Get client IP and user agent for rate limiting and security logging
    const clientIp =
      c.req.header("CF-Connecting-IP") ||
      c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ||
      c.req.header("X-Real-IP") ||
      "unknown";
    const userAgent = c.req.header("User-Agent");

    // Check if user exists
    const user = findUserByEmail(email);

    // Always return success to prevent email enumeration
    // Only send email if user exists
    if (user) {
      // Invalidate any existing reset tokens for this user
      invalidateResetTokensForKey(user.userId);

      // Generate new reset token with device fingerprinting
      const resetData = await generatePasswordResetToken(user.userId, clientIp, userAgent);

      // Send password reset email
      const emailResult = await sendPasswordResetEmail({
        email,
        tokenId: resetData.tokenId,
        token: resetData.token,
        expiresAt: resetData.expiresAt,
        clientIp,
      });

      if (emailResult.success) {
        logger.info("Password reset email sent", {
          userId: user.userId,
          email,
          clientIp,
          deviceInfo: resetData.deviceInfo,
          messageId: emailResult.messageId,
        });
      } else {
        logger.error("Failed to send password reset email", {
          userId: user.userId,
          email,
          error: emailResult.error,
        });
      }
    }

    // Always return success (prevent email enumeration)
    return c.json({
      success: true,
      message: "If an account exists with this email, a password reset link has been sent.",
    });
  } catch (error) {
    logger.error("Password reset request failed", error as Error);

    return c.json(
      {
        error: "Failed to process password reset request",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
};

/**
 * Confirm password reset.
 *
 * Completes the password reset flow by:
 * 1. Validating the reset token with device verification
 * 2. Validating the new password against policy
 * 3. Updating the user's password
 * 4. Consuming the reset token (single-use)
 * 5. Invalidating all other reset tokens
 * 6. Invalidating all existing sessions (force re-login)
 * 7. Sending security notification email
 */
export const confirmPasswordResetHandler: MiddlewareHandler = async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const validationResult = passwordResetConfirmSchema.safeParse(body);

    if (!validationResult.success) {
      return c.json(
        {
          error: "Invalid request",
          details: validationResult.error.errors,
        },
        400
      );
    }

    const { tokenId, token, newPassword } = validationResult.data;

    const clientIp =
      c.req.header("CF-Connecting-IP") ||
      c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ||
      c.req.header("X-Real-IP") ||
      "unknown";
    const userAgent = c.req.header("User-Agent");

    // Validate the reset token with device verification
    const validationResult_ = await validatePasswordResetToken(tokenId, token, clientIp, userAgent);

    if (!validationResult_.keyId) {
      securityLogger.logSuspiciousActivity(c, "invalid_password_reset_token");
      return c.json(
        {
          error: "Invalid or expired reset token",
          message: "The reset link is invalid or has expired. Please request a new password reset.",
        },
        400
      );
    }

    const keyId = validationResult_.keyId;

    // Get the user
    const user = getUserById(keyId);

    if (!user) {
      return c.json(
        {
          error: "User not found",
          message: "The account associated with this reset link no longer exists.",
        },
        404
      );
    }

    // Validate the new password against policy
    const passwordValidation = await validatePassword(newPassword, {}, keyId);

    if (!passwordValidation.valid) {
      return c.json(
        {
          error: "Password does not meet security requirements",
          errors: passwordValidation.errors,
        },
        400
      );
    }

    // Store old password in history before changing
    storePasswordInHistory(keyId, user.passwordHash, user.passwordSalt);

    // Hash the new password
    const passwordHash = await hashPassword(newPassword);

    // Update user password
    user.passwordHash = passwordHash.hash;
    user.passwordSalt = passwordHash.salt;
    user.updatedAt = Date.now();
    upsertUser(user);

    // Consume the reset token (single-use)
    consumePasswordResetToken(tokenId);

    // Invalidate all other reset tokens for this user
    invalidateResetTokensForKey(keyId);

    // Invalidate all existing sessions for this user (force re-login)
    const sessionsInvalidated = invalidateAllSessionsForKey(keyId);

    // Send security notification email
    const deviceInfo = getDeviceInfo(userAgent);
    const notificationResult = await sendPasswordResetNotificationEmail({
      email: user.email,
      clientIp,
      deviceInfo,
    });

    logger.info("Password reset completed", {
      userId: keyId,
      email: user.email,
      clientIp,
      deviceInfo,
      sessionsInvalidated,
      notificationSent: notificationResult.success,
    });

    const responsePayload: {
      success: boolean;
      message: string;
      warning?: string;
    } = {
      success: true,
      message: "Password has been reset successfully. Please log in with your new password.",
    };

    // Add warning if device changed
    if (validationResult_.deviceChanged && validationResult_.warning) {
      responsePayload.warning = validationResult_.warning;
    }

    return c.json(responsePayload);
  } catch (error) {
    logger.error("Password reset confirmation failed", error as Error);

    return c.json(
      {
        error: "Failed to reset password",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
};

/**
 * Change password for authenticated user.
 *
 * Allows authenticated users to change their password by:
 * 1. Verifying their current password
 * 2. Validating the new password against policy
 * 3. Updating the password
 * 4. Logging the change for audit
 */
export const changePasswordHandler: MiddlewareHandler = async (c) => {
  try {
    const auth = getRbacAuthContext(c);

    if (!auth) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const body = await c.req.json().catch(() => ({}));
    const validationResult = passwordChangeSchema.safeParse(body);

    if (!validationResult.success) {
      return c.json(
        {
          error: "Invalid request",
          details: validationResult.error.errors,
        },
        400
      );
    }

    const { currentPassword, newPassword } = validationResult.data;

    // Get the user
    const user = getUserById(auth.keyId);

    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    // Verify current password
    const currentPasswordValid = await verifyPasswordHash(
      currentPassword,
      user.passwordHash,
      user.passwordSalt
    );

    if (!currentPasswordValid) {
      securityLogger.logAuthFailure(c, "invalid_current_password");
      return c.json(
        {
          error: "Current password is incorrect",
          message: "The current password you provided is incorrect. Please try again.",
        },
        400
      );
    }

    // Validate the new password against policy
    const passwordValidation = await validatePassword(newPassword, {}, auth.keyId);

    if (!passwordValidation.valid) {
      return c.json(
        {
          error: "Password does not meet security requirements",
          errors: passwordValidation.errors,
        },
        400
      );
    }

    // Hash the new password
    const passwordHashData = await hashPassword(newPassword);

    // Update user password
    user.passwordHash = passwordHashData.hash;
    user.passwordSalt = passwordHashData.salt;
    user.updatedAt = Date.now();
    upsertUser(user);

    logger.info("Password changed", { userId: auth.keyId });

    return c.json({
      success: true,
      message: "Password has been changed successfully.",
    });
  } catch (error) {
    logger.error("Password change failed", error as Error);

    return c.json(
      {
        error: "Failed to change password",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
};

// ============================================================================
// Route Builder
// ============================================================================

/**
 * Build password reset routes with all middleware.
 */
export function buildPasswordResetRoutes() {
  const handlers = {
    getPasswordPolicy: getPasswordPolicyHandler,
    requestPasswordReset: [
      // Apply strict rate limiting (5 requests per minute)
      authRateLimit("strict", { addHeaders: true }),
      // Require CAPTCHA after rate limit violations
      requireCaptcha({ alwaysRequired: false }),
      auditLogAccess("password", "reset_request"),
      requestPasswordResetHandler,
    ],
    confirmPasswordReset: [
      // Apply strict rate limiting
      authRateLimit("strict", { addHeaders: true }),
      // Require CAPTCHA after rate limit violations
      requireCaptcha({ alwaysRequired: false }),
      auditLogAccess("password", "reset_confirm"),
      confirmPasswordResetHandler,
    ],
    changePassword: [
      requireResourceAccess("password", "update"),
      auditLogAccess("password", "change"),
      changePasswordHandler,
    ],
  };

  return handlers;
}
