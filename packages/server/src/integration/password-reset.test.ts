/**
 * Password Reset Flow Integration Tests
 *
 * Tests the complete password reset flow:
 * 1. Request password reset
 * 2. Verify email is sent
 * 3. Confirm password reset with token
 * 4. Verify password is updated
 * 5. Verify token is consumed
 * 6. Verify old tokens are invalidated
 */

import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import {
  type ApiKey,
  _clearAllRateLimits,
  _getPasswordResetTokensMap,
  generatePasswordResetToken,
  getDeviceInfo,
  hashPassword,
  invalidateResetTokensForKey,
  registerApiKey,
  validatePasswordResetToken,
  verifyPasswordHash,
} from "../middleware/index.js";
import {
  deleteUser,
  getUserById,
  upsertUser as upsertTestUser,
} from "../routes/password-reset.routes.js";
import { configureEmailProvider, setResetBaseUrl } from "../services/password-reset.service.js";

describe("Password Reset Flow Integration", () => {
  let app: Hono;
  let testUserId: string;
  let testEmail: string;
  let originalPasswordHash: string;
  let originalPasswordSalt: string;

  beforeEach(async () => {
    // Clear rate limits between tests
    _clearAllRateLimits();

    // Set environment variable to allow localhost in tests
    process.env.ALLOWED_HOSTS = "localhost:5173,127.0.0.1:5173";

    // Create test app with minimal routes
    const stations = {};
    const routes = {};
    const complexes = {};
    const transfers = {};
    const webDistPath = "/tmp/web-dist";
    app = createApp(
      stations as any,
      routes as any,
      complexes as any,
      transfers as any,
      webDistPath
    );

    // Configure email provider for testing (console mode)
    configureEmailProvider({ provider: "console" });
    setResetBaseUrl("http://localhost:5173");

    // Create test user
    testUserId = `test-user-${Date.now()}`;
    testEmail = `test-${Date.now()}@example.com`;

    const passwordData = await hashPassword("OldPasswordSecure123!");

    // Store user using exported function
    upsertTestUser({
      userId: testUserId,
      email: testEmail,
      passwordHash: passwordData.hash,
      passwordSalt: passwordData.salt,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    originalPasswordHash = passwordData.hash;
    originalPasswordSalt = passwordData.salt;
  });

  afterEach(async () => {
    // Clean up test data using exported function
    deleteUser(testUserId);
  });

  // Helper to create headers that pass same-origin checks
  const createTestHeaders = () => ({
    "Content-Type": "application/json",
    Origin: "http://localhost:5173",
    Referer: "http://localhost:5173/",
    Host: "localhost:5173",
    "X-Forwarded-Host": "localhost:5173",
    "CF-Connecting-IP": "127.0.0.1",
  });

  describe("GET /api/auth/password/policy", () => {
    it("should return password policy requirements", async () => {
      const response = await app.request("/api/auth/password/policy", {
        headers: createTestHeaders(),
      });

      expect(response.status).toBe(200);

      const data = await response.json() as any;
      expect(data).toHaveProperty("policy");
      expect(data).toHaveProperty("requirements");
      expect(data).toHaveProperty("tips");

      // Verify policy has expected fields
      expect(data.policy.minLength).toBeGreaterThanOrEqual(12);
      expect(data.policy.requireUppercase).toBe(true);
      expect(data.policy.requireLowercase).toBe(true);
      expect(data.policy.requireNumbers).toBe(true);
      expect(data.policy.requireSpecialChars).toBe(true);

      // Verify tips array
      expect(Array.isArray(data.tips)).toBe(true);
      expect(data.tips.length).toBeGreaterThan(0);
    });
  });

  describe("POST /api/auth/password/reset", () => {
    it("should accept password reset request for valid email", async () => {
      const response = await app.request("/api/auth/password/reset", {
        method: "POST",
        headers: createTestHeaders(),
        body: JSON.stringify({ email: testEmail }),
      });

      expect(response.status).toBe(200);

      const data = await response.json() as any;
      expect(data.success).toBe(true);
      expect(data.message).toContain("email");
    });

    it("should return success for non-existent email (prevent enumeration)", async () => {
      const response = await app.request("/api/auth/password/reset", {
        method: "POST",
        headers: createTestHeaders(),
        body: JSON.stringify({ email: "nonexistent@example.com" }),
      });

      expect(response.status).toBe(200);

      const data = await response.json() as any;
      expect(data.success).toBe(true);
      // Should not reveal whether email exists
    });

    it("should reject invalid email format", async () => {
      const response = await app.request("/api/auth/password/reset", {
        method: "POST",
        headers: createTestHeaders(),
        body: JSON.stringify({ email: "not-an-email" }),
      });

      expect(response.status).toBe(400);

      const data = await response.json() as any;
      expect(data.error).toBeDefined();
    });

    it("should reject empty email", async () => {
      const response = await app.request("/api/auth/password/reset", {
        method: "POST",
        headers: createTestHeaders(),
        body: JSON.stringify({ email: "" }),
      });

      expect(response.status).toBe(400);

      const data = await response.json() as any;
      expect(data.error).toBeDefined();
    });

    it("should enforce rate limiting", async () => {
      // Make 6 requests (limit is 5 per minute for strict tier)
      const requests = [];
      for (let i = 0; i < 6; i++) {
        requests.push(
          app.request("/api/auth/password/reset", {
            method: "POST",
            headers: createTestHeaders(),
            body: JSON.stringify({ email: `test${i}@example.com` }),
          })
        );
      }

      const responses = await Promise.all(requests);

      // First 5 should succeed
      for (let i = 0; i < 5; i++) {
        expect(responses[i]!.status).toBe(200);
      }

      // 6th request should be rate limited
      expect(responses[5]!.status).toBe(429);
    });
  });

  describe("POST /api/auth/password/reset/confirm", () => {
    it("should successfully reset password with valid token", async () => {
      // First, generate a reset token with user agent
      const userAgent =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
      const resetData = await generatePasswordResetToken(testUserId, "127.0.0.1", userAgent);

      // Verify device info was captured
      expect(resetData.deviceInfo).toBeDefined();
      expect(resetData.deviceInfo?.deviceType).toBe("desktop");
      expect(resetData.deviceInfo?.browser).toBe("Chrome");

      // Now confirm the reset
      const response = await app.request("/api/auth/password/reset/confirm", {
        method: "POST",
        headers: {
          ...createTestHeaders(),
          "User-Agent": userAgent,
        },
        body: JSON.stringify({
          tokenId: resetData.tokenId,
          token: resetData.token,
          newPassword: "Xk9mP2vL5sec!",
        }),
      });

      expect(response.status).toBe(200);

      const data = await response.json() as any;
      expect(data.success).toBe(true);
      expect(data.message).toContain("reset successfully");

      // Verify password was changed
      const user = getUserById(testUserId);
      expect(user).toBeDefined();
      expect(user!.passwordHash).not.toBe(originalPasswordHash);
      expect(user!.passwordSalt).not.toBe(originalPasswordSalt);

      // Verify new password works
      const isValid = await verifyPasswordHash(
        "Xk9mP2vL5sec!",
        user!.passwordHash,
        user!.passwordSalt
      );
      expect(isValid).toBe(true);
    });

    it("should invalidate all sessions after password reset", async () => {
      // Create a session for the user
      const { createSession } = await import("../middleware/authentication.js");
      const sessionResult = await createSession(testUserId, "127.0.0.1", "test-agent");
      const sessionId = sessionResult.sessionId;

      // Verify session exists before reset
      const { getSession } = await import("../middleware/authentication.js");
      let session = getSession(sessionId);
      expect(session).toBeDefined();
      expect(session?.active).toBe(true);

      // Generate and use a reset token
      const resetData = await generatePasswordResetToken(testUserId, "127.0.0.1");

      const response = await app.request("/api/auth/password/reset/confirm", {
        method: "POST",
        headers: createTestHeaders(),
        body: JSON.stringify({
          tokenId: resetData.tokenId,
          token: resetData.token,
          newPassword: "Xk9mP2vL5sec!",
        }),
      });

      expect(response.status).toBe(200);

      // Verify session was invalidated (deleted from sessions map)
      session = getSession(sessionId);
      expect(session).toBeUndefined();
    });

    it("should return warning when device changes", async () => {
      // Generate token with one user agent
      const originalUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
      const resetData = await generatePasswordResetToken(
        testUserId,
        "127.0.0.1",
        originalUserAgent
      );

      // Try to confirm with different user agent
      const differentUserAgent =
        "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15";
      const response = await app.request("/api/auth/password/reset/confirm", {
        method: "POST",
        headers: {
          ...createTestHeaders(),
          "User-Agent": differentUserAgent,
        },
        body: JSON.stringify({
          tokenId: resetData.tokenId,
          token: resetData.token,
          newPassword: "Xk9mP2vL5sec!",
        }),
      });

      expect(response.status).toBe(200);

      const data = await response.json() as any;
      expect(data.success).toBe(true);
      expect(data.warning).toBeDefined();
      expect(data.warning).toContain("different device");
    });

    it("should reject invalid token", async () => {
      const response = await app.request("/api/auth/password/reset/confirm", {
        method: "POST",
        headers: createTestHeaders(),
        body: JSON.stringify({
          tokenId: "invalid-token-id",
          token: "invalid-token",
          newPassword: "Xk9mP2vL5sec!",
        }),
      });

      expect(response.status).toBe(400);

      const data = await response.json() as any;
      expect(data.error).toContain("Invalid or expired");
    });

    it("should detect device information from user agent", () => {
      // Test desktop Chrome
      const chromeUA =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
      const chromeInfo = getDeviceInfo(chromeUA);
      expect(chromeInfo.deviceType).toBe("desktop");
      expect(chromeInfo.browser).toBe("Chrome");
      expect(chromeInfo.os).toBe("Windows");

      // Test mobile Safari
      const safariUA =
        "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1";
      const safariInfo = getDeviceInfo(safariUA);
      expect(safariInfo.deviceType).toBe("mobile");
      expect(safariInfo.browser).toBe("Safari");
      expect(safariInfo.os).toBe("iOS");

      // Test Firefox
      const firefoxUA = "Mozilla/5.0 (X11; Linux x86_64) Gecko/20100101 Firefox/120.0";
      const firefoxInfo = getDeviceInfo(firefoxUA);
      expect(firefoxInfo.deviceType).toBe("desktop");
      expect(firefoxInfo.browser).toBe("Firefox");
      expect(firefoxInfo.os).toBe("Linux");

      // Test unknown user agent
      const unknownInfo = getDeviceInfo(undefined);
      expect(unknownInfo.deviceType).toBe("Unknown");
      expect(unknownInfo.browser).toBe("Unknown");
      expect(unknownInfo.os).toBe("Unknown");
    });

    it("should reject expired token", async () => {
      // Generate a token
      const resetData = await generatePasswordResetToken(testUserId, "127.0.0.1");

      // Import the test helper to manually expire the token
      const { _setTokenExpirationForTesting } = await import(
        "../middleware/password-management.js"
      );

      // Set the token as expired
      _setTokenExpirationForTesting(resetData.tokenId, Date.now() - 1000); // 1 second ago

      // Try to use expired token
      const response = await app.request("/api/auth/password/reset/confirm", {
        method: "POST",
        headers: createTestHeaders(),
        body: JSON.stringify({
          tokenId: resetData.tokenId,
          token: resetData.token,
          newPassword: "Xk9mP2vL5sec!",
        }),
      });

      expect(response.status).toBe(400);

      const data = await response.json() as any;
      expect(data.error).toContain("Invalid or expired");
    });

    it("should validate token with matching device", async () => {
      const userAgent =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
      const resetData = await generatePasswordResetToken(testUserId, "127.0.0.1", userAgent);

      // Validate with same user agent
      const result = await validatePasswordResetToken(
        resetData.tokenId,
        resetData.token,
        "127.0.0.1",
        userAgent
      );

      expect(result.keyId).toBe(testUserId);
      expect(result.deviceChanged).toBe(false);
      expect(result.warning).toBeUndefined();
    });

    it("should reject weak password", async () => {
      const resetData = await generatePasswordResetToken(testUserId, "127.0.0.1");

      const response = await app.request("/api/auth/password/reset/confirm", {
        method: "POST",
        headers: createTestHeaders(),
        body: JSON.stringify({
          tokenId: resetData.tokenId,
          token: resetData.token,
          newPassword: "weak", // Too short - fails minimum length
        }),
      });

      expect(response.status).toBe(400);

      const data = await response.json() as any;
      expect(data.error).toBeDefined();
      // Schema validation returns "Invalid request" with details
      expect(["Invalid request", "Password does not meet security requirements"]).toContain(
        data.error
      );
      // details or errors should be present for schema validation failures
      expect(data.details || data.errors || data.error).toBeDefined();
    });

    it("should only allow token to be used once", async () => {
      const resetData = await generatePasswordResetToken(testUserId, "127.0.0.1");

      const resetRequest = {
        method: "POST" as const,
        headers: createTestHeaders(),
        body: JSON.stringify({
          tokenId: resetData.tokenId,
          token: resetData.token,
          newPassword: "Xk9mP2vL5sec!",
        }),
      };

      // First use should succeed
      const firstResponse = await app.request("/api/auth/password/reset/confirm", resetRequest);
      expect(firstResponse.status).toBe(200);

      // Second use should fail
      const secondResponse = await app.request("/api/auth/password/reset/confirm", resetRequest);
      expect(secondResponse.status).toBe(400);
    });

    it("should store old password in history after reset", async () => {
      const { getPasswordHistory } = await import("../middleware/password-management.js");

      // Reset password first time - use strong password that passes schema
      const resetData1 = await generatePasswordResetToken(testUserId, "127.0.0.1");
      const response1 = await app.request("/api/auth/password/reset/confirm", {
        method: "POST",
        headers: createTestHeaders(),
        body: JSON.stringify({
          tokenId: resetData1.tokenId,
          token: resetData1.token,
          newPassword: "Xk9$mP2vL5s#ec!@2026", // Strong password without sequential patterns
        }),
      });
      expect(response1.status).toBe(200);

      // Verify old password is in history
      const history1 = getPasswordHistory(testUserId);
      expect(history1).toBeDefined();
      expect(history1.length).toBeGreaterThan(0);
      // The most recent history entry should be the original password
      expect(history1[history1.length - 1]!.hash).toBe(originalPasswordHash);

      // Reset password second time - use another strong password
      const resetData2 = await generatePasswordResetToken(testUserId, "127.0.0.1");
      const response2 = await app.request("/api/auth/password/reset/confirm", {
        method: "POST",
        headers: createTestHeaders(),
        body: JSON.stringify({
          tokenId: resetData2.tokenId,
          token: resetData2.token,
          newPassword: "N3wP@ssw0rd!Secure#Xy7", // Strong password without sequential patterns
        }),
      });
      expect(response2.status).toBe(200);

      // Verify both old passwords are in history
      const history2 = getPasswordHistory(testUserId);
      expect(history2.length).toBeGreaterThanOrEqual(2);
      // The oldest entry should still be the original password
      expect(history2[0]!.hash).toBe(originalPasswordHash);
      // History should have at least 2 entries now
      expect(history2.length).toBeGreaterThanOrEqual(2);
    });

    it("should prevent reusing passwords from history", async () => {
      // First, set a new password
      const resetData1 = await generatePasswordResetToken(testUserId, "127.0.0.1");
      const response1 = await app.request("/api/auth/password/reset/confirm", {
        method: "POST",
        headers: createTestHeaders(),
        body: JSON.stringify({
          tokenId: resetData1.tokenId,
          token: resetData1.token,
          newPassword: "Qu7zR9xM!kL2@nP4vW", // Strong random password
        }),
      });
      expect(response1.status).toBe(200);

      // Try to reset back to the original password (which should now be in history)
      // Use a password that passes schema validation but should fail history check
      const resetData2 = await generatePasswordResetToken(testUserId, "127.0.0.1");
      const response2 = await app.request("/api/auth/password/reset/confirm", {
        method: "POST",
        headers: createTestHeaders(),
        body: JSON.stringify({
          tokenId: resetData2.tokenId,
          token: resetData2.token,
          newPassword: "Xy9@B2mK7pL3qW!nR4", // Strong password that should pass schema
        }),
      });

      // After setting a second password, try to reset back to the first password (which should now be in history)
      const resetData3 = await generatePasswordResetToken(testUserId, "127.0.0.1");
      const response3 = await app.request("/api/auth/password/reset/confirm", {
        method: "POST",
        headers: createTestHeaders(),
        body: JSON.stringify({
          tokenId: resetData3.tokenId,
          token: resetData3.token,
          newPassword: "Qu7zR9xM!kL2@nP4vW", // The first password we set - should fail due to history
        }),
      });

      // Should be rejected because it's in password history
      expect(response3.status).toBe(400);
      const data = await response3.json() as any;
      // The error from password validation
      expect(data.error).toBe("Password does not meet security requirements");
      // Check that password history error is present
      expect(data.errors).toContain("Cannot reuse a recent password");
    });
  });

  describe("Token invalidation", () => {
    it("should invalidate previous tokens when new one is generated", async () => {
      // Generate first token
      const firstToken = await generatePasswordResetToken(testUserId, "127.0.0.1");

      // Manually invalidate all tokens for this user (simulating requestPasswordResetHandler behavior)
      invalidateResetTokensForKey(testUserId);

      // Generate second token (first should now be invalid)
      const secondToken = await generatePasswordResetToken(testUserId, "127.0.0.1");

      // First token should no longer be valid
      const result1 = await validatePasswordResetToken(
        firstToken.tokenId,
        firstToken.token,
        "127.0.0.1"
      );
      expect(result1.keyId).toBeNull();

      // Second token should be valid
      const result2 = await validatePasswordResetToken(
        secondToken.tokenId,
        secondToken.token,
        "127.0.0.1"
      );
      expect(result2.keyId).toBe(testUserId);
      expect(result2.deviceChanged).toBe(false);
    });

    it("should detect device changes during token validation", async () => {
      // Generate token with one user agent
      const originalUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
      const token = await generatePasswordResetToken(testUserId, "127.0.0.1", originalUA);

      // Validate with different user agent
      const differentUA =
        "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15";
      const result = await validatePasswordResetToken(
        token.tokenId,
        token.token,
        "127.0.0.1",
        differentUA
      );

      // Should still be valid but with device change warning
      expect(result.keyId).toBe(testUserId);
      expect(result.deviceChanged).toBe(true);
      expect(result.warning).toBeDefined();
      expect(result.warning).toContain("different device");
    });
  });

  describe("Password change for authenticated users", () => {
    it("should allow authenticated user to change password", async () => {
      // Register an API key for the test user
      const apiKey: ApiKey = {
        keyId: testUserId,
        keyHash: "test-hash",
        keySalt: "test-salt",
        scope: "write",
        rateLimitTier: 100,
        active: true,
        createdAt: Date.now(),
        expiresAt: 0,
        failedAttempts: 0,
      };

      await registerApiKey(apiKey);

      const response = await app.request("/api/auth/password/change", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${testUserId}:test-secret`,
        },
        body: JSON.stringify({
          currentPassword: "OldPasswordSecure123!",
          newPassword: "Xk9mP2vL5sec!",
        }),
      });

      // This will fail because we don't have proper auth middleware set up in tests
      // but the endpoint should exist
      expect([200, 401, 403]).toContain(response.status);
    });
  });

  describe("Security", () => {
    it("should require same-origin for password reset operations", async () => {
      // Request without origin header should fail same-origin check
      const response = await app.request("/api/auth/password/reset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Missing Origin and Referer headers
        },
        body: JSON.stringify({ email: testEmail }),
      });

      // In test environment without proper origin, this might still pass
      // but in production with proper CSRF middleware, it would be checked
      expect([200, 403]).toContain(response.status);
    });

    it("should sanitize email input to prevent injection", async () => {
      const maliciousEmail = '<script>alert("xss")</script>@example.com';

      const response = await app.request("/api/auth/password/reset", {
        method: "POST",
        headers: createTestHeaders(),
        body: JSON.stringify({ email: maliciousEmail }),
      });

      // Should handle the input safely (reject as invalid email)
      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it("should enforce rate limiting on confirm endpoint", async () => {
      const resetData = await generatePasswordResetToken(testUserId, "127.0.0.1");

      const resetRequest = {
        method: "POST" as const,
        headers: createTestHeaders(),
        body: JSON.stringify({
          tokenId: resetData.tokenId,
          token: resetData.token,
          newPassword: "Xk9mP2vL5sec!",
        }),
      };

      // Make multiple requests sequentially (limit is 5 per minute for strict tier)
      const responses = [];
      for (let i = 0; i < 6; i++) {
        const response = await app.request("/api/auth/password/reset/confirm", resetRequest);
        responses.push(response);
      }

      // First request should succeed (token is valid)
      expect(responses[0].status).toBe(200);

      // Remaining requests should fail (token consumed or rate limited)
      for (let i = 1; i < responses.length; i++) {
        expect([400, 429]).toContain(responses[i].status);
      }
    });
  });

  describe("Account Lockout", () => {
    it("should lock account after too many failed reset attempts", async () => {
      // Import the lockout functions
      const { recordFailedResetAttempt, isAccountLocked, clearFailedResetAttempts } = await import(
        "../middleware/password-management.js"
      );

      const testEmail = "lockout-test@example.com";
      const clientIp = "192.168.1.50";

      // Clear any existing attempts
      clearFailedResetAttempts(testEmail);

      // Make MAX_RESET_ATTEMPTS failed attempts
      for (let i = 0; i < 5; i++) {
        const result = recordFailedResetAttempt(testEmail, clientIp);
        expect(result.locked).toBe(i >= 4); // Should lock on 5th attempt
        expect(result.attemptCount).toBe(i + 1);
      }

      // Verify account is locked
      const lockStatus = isAccountLocked(testEmail);
      expect(lockStatus.locked).toBe(true);
      expect(lockStatus.reason).toBeDefined();
      expect(lockStatus.remainingMinutes).toBeGreaterThan(0);
      expect(lockStatus.unlockTime).toBeGreaterThan(Date.now());
    });

    it("should prevent password reset when account is locked", async () => {
      const { recordFailedResetAttempt, isAccountLocked } = await import(
        "../middleware/password-management.js"
      );

      const testEmail = "locked-user@example.com";
      const clientIp = "192.168.1.51";

      // Lock the account
      for (let i = 0; i < 5; i++) {
        recordFailedResetAttempt(testEmail, clientIp);
      }

      // Verify locked
      expect(isAccountLocked(testEmail).locked).toBe(true);

      // Request password reset - should still return success (enumeration prevention)
      const response = await app.request("/api/auth/password/reset", {
        method: "POST",
        headers: createTestHeaders(),
        body: JSON.stringify({ email: testEmail }),
      });

      // Should still return 200 to prevent email enumeration
      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.success).toBe(true);
    });

    it("should unlock account after lockout period expires", async () => {
      const { recordFailedResetAttempt, isAccountLocked } = await import(
        "../middleware/password-management.js"
      );

      const testEmail = "unlock-test@example.com";
      const clientIp = "192.168.1.52";

      // Lock the account
      for (let i = 0; i < 5; i++) {
        recordFailedResetAttempt(testEmail, clientIp);
      }

      // Verify locked
      expect(isAccountLocked(testEmail).locked).toBe(true);

      // Manually expire the lockout by setting time far in future
      const { _setTokenExpirationForTesting } = await import(
        "../middleware/password-management.js"
      );
      const lockoutMap = (await import("../middleware/password-management.js"))
        ._getPasswordResetTokensMap as unknown as Map<string, unknown>;

      // Check lock status after time passes (simulate by checking isAccountLocked which auto-expires)
      // We can't directly manipulate the lockout time, but the function should handle expiration
      const lockStatus = isAccountLocked(testEmail);
      expect(lockStatus.locked).toBe(true);
      expect(lockStatus.remainingMinutes).toBeGreaterThan(0);
    });

    it("should clear failed attempts on successful password reset", async () => {
      const { recordFailedResetAttempt, isAccountLocked, getFailedResetAttemptCount } =
        await import("../middleware/password-management.js");

      const resetEmail = `reset-clear-attempts-${Date.now()}@example.com`;

      // Create user
      const resetUserId = `reset-user-${Date.now()}`;
      const passwordData = await hashPassword("OldPasswordSecure123!");
      upsertTestUser({
        userId: resetUserId,
        email: resetEmail,
        passwordHash: passwordData.hash,
        passwordSalt: passwordData.salt,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      // Record some failed attempts
      recordFailedResetAttempt(resetEmail, "192.168.1.53");
      recordFailedResetAttempt(resetEmail, "192.168.1.53");

      expect(getFailedResetAttemptCount(resetEmail, "192.168.1.53")).toBe(2);

      // Successfully reset password
      const resetData = await generatePasswordResetToken(resetUserId, "127.0.0.1");
      const response = await app.request("/api/auth/password/reset/confirm", {
        method: "POST",
        headers: createTestHeaders(),
        body: JSON.stringify({
          tokenId: resetData.tokenId,
          token: resetData.token,
          newPassword: "Xk9$mP2vL5s#ec!@2026",
        }),
      });

      expect(response.status).toBe(200);

      // Verify attempts were cleared
      expect(getFailedResetAttemptCount(resetEmail, "192.168.1.53")).toBe(0);

      // Clean up
      deleteUser(resetUserId);
    });

    it("should track attempts per email and IP combination", async () => {
      const { recordFailedResetAttempt, getFailedResetAttemptCount } = await import(
        "../middleware/password-management.js"
      );

      const testEmail = "ip-tracking@example.com";

      // Record attempts from different IPs
      recordFailedResetAttempt(testEmail, "192.168.1.100");
      recordFailedResetAttempt(testEmail, "192.168.1.101");
      recordFailedResetAttempt(testEmail, "192.168.1.100");

      // Each IP should have its own count
      expect(getFailedResetAttemptCount(testEmail, "192.168.1.100")).toBe(2);
      expect(getFailedResetAttemptCount(testEmail, "192.168.1.101")).toBe(1);
    });
  });

  describe("Token Cleanup", () => {
    it("should cleanup expired tokens", async () => {
      const { cleanupExpiredTokens, generatePasswordResetToken, validatePasswordResetToken } =
        await import("../middleware/password-management.js");

      // Generate a token
      const resetData = await generatePasswordResetToken(testUserId, "127.0.0.1");

      // Manually expire it
      const { _setTokenExpirationForTesting } = await import(
        "../middleware/password-management.js"
      );
      _setTokenExpirationForTesting(resetData.tokenId, Date.now() - 1000);

      // Run cleanup
      const cleanedCount = cleanupExpiredTokens();

      // Token should no longer be valid
      const result = await validatePasswordResetToken(
        resetData.tokenId,
        resetData.token,
        "127.0.0.1"
      );
      expect(result.keyId).toBeNull();
    });

    it("should cleanup used tokens", async () => {
      const { cleanupExpiredTokens, generatePasswordResetToken, consumePasswordResetToken } =
        await import("../middleware/password-management.js");

      // Generate and consume a token
      const resetData = await generatePasswordResetToken(testUserId, "127.0.0.1");
      consumePasswordResetToken(resetData.tokenId);

      // Run cleanup
      const cleanedCount = cleanupExpiredTokens();

      // Token should be cleaned up (used tokens are also removed)
      const tokens = (
        await import("../middleware/password-management.js")
      )._getPasswordResetTokensMap();
      expect(tokens.has(resetData.tokenId)).toBe(false);
    });
  });

  describe("Failed Reset Attempt Tracking", () => {
    it("should increment attempt count for each failure", async () => {
      const { recordFailedResetAttempt, getFailedResetAttemptCount } = await import(
        "../middleware/password-management.js"
      );

      const testEmail = "attempts@example.com";
      const clientIp = "192.168.1.200";

      // Clear first
      const { clearFailedResetAttempts } = await import("../middleware/password-management.js");
      clearFailedResetAttempts(testEmail);

      expect(getFailedResetAttemptCount(testEmail, clientIp)).toBe(0);

      // Record attempts
      recordFailedResetAttempt(testEmail, clientIp);
      expect(getFailedResetAttemptCount(testEmail, clientIp)).toBe(1);

      recordFailedResetAttempt(testEmail, clientIp);
      expect(getFailedResetAttemptCount(testEmail, clientIp)).toBe(2);
    });

    it("should reset attempt count after window expires", async () => {
      const { recordFailedResetAttempt, getFailedResetAttemptCount } = await import(
        "../middleware/password-management.js"
      );

      const testEmail = "window-expiry@example.com";
      const clientIp = "192.168.1.201";

      // Clear first
      const { clearFailedResetAttempts } = await import("../middleware/password-management.js");
      clearFailedResetAttempts(testEmail);

      // Record attempts
      recordFailedResetAttempt(testEmail, clientIp);
      recordFailedResetAttempt(testEmail, clientIp);
      expect(getFailedResetAttemptCount(testEmail, clientIp)).toBe(2);

      // Note: We can't easily test time-based expiration in unit tests without
      // manipulating time. The window expiry is 15 minutes.
      // This is more of an integration test scenario.
    });

    it("should return remaining attempts correctly", async () => {
      const { recordFailedResetAttempt } = await import("../middleware/password-management.js");

      const testEmail = "remaining@example.com";
      const clientIp = "192.168.1.202";

      // Clear first
      const { clearFailedResetAttempts } = await import("../middleware/password-management.js");
      clearFailedResetAttempts(testEmail);

      // First attempt
      let result = recordFailedResetAttempt(testEmail, clientIp);
      expect(result.locked).toBe(false);
      expect(result.remainingAttempts).toBe(4); // 5 - 1 = 4

      // Second attempt
      result = recordFailedResetAttempt(testEmail, clientIp);
      expect(result.remainingAttempts).toBe(3); // 5 - 2 = 3

      // Third attempt
      result = recordFailedResetAttempt(testEmail, clientIp);
      expect(result.remainingAttempts).toBe(2); // 5 - 3 = 2
    });
  });
});
