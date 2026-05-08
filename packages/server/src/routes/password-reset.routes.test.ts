/**
 * Tests for password reset routes.
 *
 * Tests the password reset API endpoints:
 * - GET /api/auth/password/policy - Get password policy
 * - POST /api/auth/password/reset - Request password reset
 * - POST /api/auth/password/reset/confirm - Confirm password reset
 * - POST /api/auth/password/change - Change password (authenticated)
 */

import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as authentication from "../middleware/authentication.js";
import * as middleware from "../middleware/index.js";
import * as passwordManagement from "../middleware/password-management.js";
import * as securityLogging from "../middleware/security-logging.js";
import * as logger from "../observability/logger.js";
import * as passwordResetService from "../services/password-reset.service.js";
import {
  type UserRecord,
  changePasswordHandler,
  clearAllUsers,
  confirmPasswordResetHandler,
  deleteUser,
  findUserByEmail,
  getPasswordPolicyHandler,
  getUserById,
  requestPasswordResetHandler,
  upsertUser,
} from "./password-reset.routes.js";

// Mock all dependencies
vi.mock("../middleware/authentication.js");
vi.mock("../middleware/password-management.js");
vi.mock("../services/password-reset.service.js");
vi.mock("../middleware/security-logging.js");
vi.mock("../observability/logger.js");

// Mock getRbacAuthContext for the change password handler
// We need to mock the index module since password-reset.routes imports from it
vi.mock("../middleware/index.js", async () => {
  const actual = await vi.importActual("../middleware/index.js");
  return {
    ...actual,
    getRbacAuthContext: vi.fn(),
  };
});

describe("Password Reset Routes", () => {
  let app: Hono;
  let testUser: UserRecord;

  beforeEach(() => {
    vi.clearAllMocks();
    clearAllUsers();

    // Create a test user
    testUser = {
      userId: "user123",
      email: "test@example.com",
      passwordHash: "old_hash",
      passwordSalt: "old_salt",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    upsertUser(testUser);

    // Setup app
    app = new Hono();

    // Mock logger
    vi.mocked(logger.logger).info = vi.fn();
    vi.mocked(logger.logger).error = vi.fn();
    vi.mocked(logger.logger).warn = vi.fn();

    // Mock authentication functions
    vi.mocked(authentication.getPasswordPolicyDescription).mockReturnValue({
      minLength: 12,
      maxLength: 128,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: true,
      allowSpaces: true,
      expirationDays: 0,
      historyCount: 12,
      forbiddenPasswords: [],
    });

    vi.mocked(authentication.hashPassword).mockResolvedValue({
      hash: "new_hash",
      salt: "new_salt",
    });

    vi.mocked(authentication.verifyPasswordHash).mockResolvedValue(true);

    vi.mocked(authentication.generatePasswordResetToken).mockResolvedValue({
      tokenId: "token123",
      token: "abc123",
      expiresAt: Date.now() + 3600000,
      deviceInfo: { deviceType: "desktop", browser: "chrome", os: "windows" },
    });

    vi.mocked(authentication.invalidateAllSessionsForKey).mockReturnValue(5);

    // Mock password management functions
    vi.mocked(passwordManagement.validatePassword).mockResolvedValue({
      valid: true,
      strength: 80,
      errors: [],
    });

    vi.mocked(passwordManagement.validatePasswordResetToken).mockResolvedValue({
      keyId: "user123",
      deviceChanged: false,
    });

    vi.mocked(passwordManagement.consumePasswordResetToken).mockReturnValue(true);

    vi.mocked(passwordManagement.invalidateResetTokensForKey).mockReturnValue(1);

    vi.mocked(passwordManagement.storePasswordInHistory).mockReturnValue(undefined);

    vi.mocked(passwordManagement.getDeviceInfo).mockReturnValue({
      deviceType: "desktop",
      browser: "chrome",
      os: "windows",
    });

    // Mock password reset service
    vi.mocked(passwordResetService.sendPasswordResetEmail).mockResolvedValue({
      success: true,
      messageId: "msg123",
      provider: "console",
    });

    vi.mocked(passwordResetService.sendPasswordResetNotificationEmail).mockResolvedValue({
      success: true,
      messageId: "msg456",
      provider: "console",
    });

    // Mock security logging
    vi.mocked(securityLogging.securityLogger).logAuthFailure = vi.fn();
    vi.mocked(securityLogging.securityLogger).logSuspiciousActivity = vi.fn();
  });

  describe("GET /api/auth/password/policy", () => {
    it("should return password policy", async () => {
      app.get("/api/auth/password/policy", getPasswordPolicyHandler);

      const res = await app.request("/api/auth/password/policy");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty("policy");
      expect(body).toHaveProperty("requirements");
      expect(body).toHaveProperty("tips");
      expect(body.requirements).toEqual({
        minLength: 12,
        maxLength: 128,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: true,
        allowSpaces: true,
        expirationDays: 0,
        historyCount: 12,
      });
      expect(Array.isArray(body.tips)).toBe(true);
    });
  });

  describe("POST /api/auth/password/reset", () => {
    beforeEach(() => {
      app.post("/api/auth/password/reset", requestPasswordResetHandler);
    });

    it("should send reset email for existing user", async () => {
      const res = await app.request("/api/auth/password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@example.com" }),
      });

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.message).toContain("password reset link has been sent");

      expect(passwordResetService.sendPasswordResetEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "test@example.com",
        })
      );
    });

    it("should return success for non-existing user (email enumeration prevention)", async () => {
      const res = await app.request("/api/auth/password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "nonexistent@example.com" }),
      });

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);

      // Should NOT send email for non-existent user
      expect(passwordResetService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it("should validate email format", async () => {
      const res = await app.request("/api/auth/password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "invalid-email" }),
      });

      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toBe("Invalid request");
      // The Zod schema returns details, but it may be empty for simple validation failures
      // The important part is that the error message is correct
    });

    it("should handle missing email", async () => {
      const res = await app.request("/api/auth/password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toBe("Invalid request");
    });

    it("should extract client IP from CF-Connecting-IP header", async () => {
      const res = await app.request("/api/auth/password/reset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "CF-Connecting-IP": "192.168.1.100",
        },
        body: JSON.stringify({ email: "test@example.com" }),
      });

      expect(res.status).toBe(200);
      expect(passwordResetService.sendPasswordResetEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          clientIp: "192.168.1.100",
        })
      );
    });

    it("should handle email sending failure gracefully", async () => {
      vi.mocked(passwordResetService.sendPasswordResetEmail).mockResolvedValue({
        success: false,
        error: "SMTP error",
        provider: "console",
      });

      const res = await app.request("/api/auth/password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@example.com" }),
      });

      // Still return success to prevent email enumeration
      expect(res.status).toBe(200);

      expect(logger.logger.error).toHaveBeenCalled();
    });
  });

  describe("POST /api/auth/password/reset/confirm", () => {
    beforeEach(() => {
      app.post("/api/auth/password/reset/confirm", confirmPasswordResetHandler);
    });

    it("should reset password with valid token", async () => {
      const newPassword = "SecureK9rdMxP@7wQk";

      const res = await app.request("/api/auth/password/reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenId: "token123",
          token: "abc123",
          newPassword,
        }),
      });

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.message).toContain("reset successfully");

      // Verify password was updated
      const updatedUser = getUserById("user123");
      expect(updatedUser?.passwordHash).toBe("new_hash");
      expect(updatedUser?.passwordSalt).toBe("new_salt");

      // Verify token was consumed
      expect(passwordManagement.consumePasswordResetToken).toHaveBeenCalledWith("token123");

      // Verify sessions were invalidated
      expect(authentication.invalidateAllSessionsForKey).toHaveBeenCalledWith("user123");

      // Verify notification email was sent
      expect(passwordResetService.sendPasswordResetNotificationEmail).toHaveBeenCalled();
    });

    it("should reject invalid token", async () => {
      vi.mocked(passwordManagement.validatePasswordResetToken).mockResolvedValue({
        keyId: undefined,
        deviceChanged: false,
      });

      const res = await app.request("/api/auth/password/reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenId: "invalid",
          token: "invalid",
          newPassword: "SecureK9rdMxP@7wQk",
        }),
      });

      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toContain("Invalid or expired reset token");

      expect(securityLogging.securityLogger.logSuspiciousActivity).toHaveBeenCalledWith(
        expect.any(Object),
        "invalid_password_reset_token"
      );
    });

    it("should validate password against policy", async () => {
      vi.mocked(passwordManagement.validatePassword).mockResolvedValue({
        valid: false,
        strength: 20,
        errors: ["Password is too short", "Missing special characters"],
      });

      const res = await app.request("/api/auth/password/reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenId: "token123",
          token: "abc123",
          newPassword: "SecureK9rdMxP@7wQk", // Strong password that passes Zod validation
        }),
      });

      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toContain("does not meet security requirements");
      expect(body.errors).toBeDefined();
    });

    it("should return 404 for non-existent user after token validation", async () => {
      vi.mocked(passwordManagement.validatePasswordResetToken).mockResolvedValue({
        keyId: "nonexistent",
        deviceChanged: false,
      });
      // Mock validatePassword to pass for the non-existent user
      vi.mocked(passwordManagement.validatePassword).mockResolvedValue({
        valid: true,
        strength: 80,
        errors: [],
      });

      const res = await app.request("/api/auth/password/reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenId: "token123",
          token: "abc123",
          newPassword: "SecureK9rdMxP@7wQk",
        }),
      });

      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error).toContain("User not found");
    });

    it("should include warning when device changed", async () => {
      vi.mocked(passwordManagement.validatePasswordResetToken).mockResolvedValue({
        keyId: "user123",
        deviceChanged: true,
        warning: "Password reset requested from a new device",
      });
      // Ensure validatePassword passes for this test
      vi.mocked(passwordManagement.validatePassword).mockResolvedValue({
        valid: true,
        strength: 80,
        errors: [],
      });

      const res = await app.request("/api/auth/password/reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenId: "token123",
          token: "abc123",
          newPassword: "SecureK9rdMxP@7wQk",
        }),
      });

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.warning).toBeDefined();
      expect(body.warning).toContain("new device");
    });
  });

  describe("POST /api/auth/password/change", () => {
    beforeEach(() => {
      // Mock RBAC auth context - use mockImplementation to handle the context parameter
      vi.mocked(middleware.getRbacAuthContext).mockImplementation((c) => ({
        keyId: "user123",
        role: "user",
        scope: "write",
      }));

      app.post("/api/auth/password/change", changePasswordHandler);
    });

    it("should change password with valid current password", async () => {
      const res = await app.request("/api/auth/password/change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: "OldSecureK9rdMxP@7w",
          newPassword: "SecureK9rdMxP@7wQk",
        }),
      });

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.message).toContain("changed successfully");

      // Verify password was updated
      const updatedUser = getUserById("user123");
      expect(updatedUser?.passwordHash).toBe("new_hash");
    });

    it("should reject incorrect current password", async () => {
      vi.mocked(passwordManagement.verifyPasswordHash).mockResolvedValue(false);

      const res = await app.request("/api/auth/password/change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: "wrongPassword",
          newPassword: "SecureK9rdMxP@7wQk",
        }),
      });

      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toContain("Current password is incorrect");

      expect(securityLogging.securityLogger.logAuthFailure).toHaveBeenCalledWith(
        expect.any(Object),
        "invalid_current_password"
      );
    });

    it("should validate new password against policy", async () => {
      vi.mocked(passwordManagement.validatePassword).mockResolvedValue({
        valid: false,
        strength: 20,
        errors: ["Password is too short"],
      });

      const res = await app.request("/api/auth/password/change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: "OldSecureK9rdMxP@7w",
          newPassword: "SecureK9rdMxP@7wQk", // Strong password that passes Zod validation
        }),
      });

      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toContain("does not meet security requirements");
    });

    it("should require authentication", async () => {
      vi.mocked(middleware.getRbacAuthContext).mockImplementation((c) => null);

      const res = await app.request("/api/auth/password/change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: "OldSecureK9rdMxP@7w",
          newPassword: "SecureK9rdMxP@7wQk",
        }),
      });

      expect(res.status).toBe(401);

      const body = await res.json();
      expect(body.error).toContain("Authentication required");
    });

    it("should return 404 for non-existent user", async () => {
      vi.mocked(middleware.getRbacAuthContext).mockImplementation((c) => ({
        keyId: "nonexistent",
        role: "user",
        scope: "write",
      }));

      const res = await app.request("/api/auth/password/change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: "OldSecureK9rdMxP@7w",
          newPassword: "SecureK9rdMxP@7wQk",
        }),
      });

      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error).toContain("User not found");
    });
  });

  describe("user management helpers", () => {
    it("should find user by email (case-insensitive)", () => {
      // Clear existing users first
      clearAllUsers();

      upsertUser({
        userId: "user1",
        email: "Test@Example.com",
        passwordHash: "hash",
        passwordSalt: "salt",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const found = findUserByEmail("test@example.com");
      expect(found).toBeDefined();
      expect(found?.userId).toBe("user1");
    });

    it("should get user by ID", () => {
      const user = getUserById("user123");
      expect(user).toBeDefined();
      expect(user?.email).toBe("test@example.com");
    });

    it("should upsert user", () => {
      const newUser: UserRecord = {
        userId: "user456",
        email: "new@example.com",
        passwordHash: "hash",
        passwordSalt: "salt",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      upsertUser(newUser);

      const found = getUserById("user456");
      expect(found).toEqual(newUser);
    });

    it("should delete user", () => {
      const deleted = deleteUser("user123");
      expect(deleted).toBe(true);

      const found = getUserById("user123");
      expect(found).toBeUndefined();
    });

    it("should return false when deleting non-existent user", () => {
      const deleted = deleteUser("nonexistent");
      expect(deleted).toBe(false);
    });

    it("should clear all users", () => {
      upsertUser({
        userId: "user1",
        email: "user1@example.com",
        passwordHash: "hash",
        passwordSalt: "salt",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      clearAllUsers();

      const found = getUserById("user1");
      expect(found).toBeUndefined();
    });
  });
});
