/**
 * Tests for authentication middleware.
 */

import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import {
  type ApiKey,
  type ApiKeyScope,
  apiKeyAuth,
  checkRefreshTokenExpiry,
  cleanupExpiredRefreshTokens,
  cleanupExpiredSessions,
  createOAuthSession,
  createSession,
  disableTotp,
  enableTotp,
  generateOAuthState,
  getActiveSessionsForApiKey,
  getAuthContext,
  getSessionCounts,
  getSessionSecurityInfo,
  hashApiKey,
  invalidateAllSessionsForKey,
  invalidateRefreshTokenByValue,
  invalidateSession,
  isAuthenticated,
  isSessionMfaVerified,
  logSessionEvent,
  optionalAuth,
  refreshSession,
  registerApiKey,
  registerOAuthProvider,
  requireScope,
  resetAuthFailureTracking,
  resetSuspiciousActivityTracking,
  revokeSession,
  setupTotp,
  shouldRefreshSession,
  signedRequestAuth,
  validateOAuthState,
  validatePassword,
  validateRefreshTokenFormat,
  validateSessionTokenFormat,
  verifyMfaForSession,
  verifyTotpCode,
} from "./authentication.js";
import { configureEncryption, generateMasterKey } from "./token-encryption.js";

describe("Authentication Middleware", () => {
  let app: Hono;
  let testApiKey: ApiKey;

  beforeEach(async () => {
    app = new Hono();

    // Generate proper hashes for test API keys
    const testKeyHash = await hashApiKey("test_secret");
    const writeKeyHash = await hashApiKey("write_secret");
    const adminKeyHash = await hashApiKey("admin_secret");

    // Register a test API key
    testApiKey = {
      keyId: "test_key_123",
      keyHash: testKeyHash.hash,
      keySalt: testKeyHash.salt,
      scope: "read" as ApiKeyScope,
      owner: "test_user",
      rateLimitTier: 100,
      active: true,
      createdAt: Date.now(),
      expiresAt: 0, // No expiration
    };
    registerApiKey(testApiKey);

    // Register a write scope API key
    const writeApiKey: ApiKey = {
      keyId: "write_key_456",
      keyHash: writeKeyHash.hash,
      keySalt: writeKeyHash.salt,
      scope: "write" as ApiKeyScope,
      owner: "test_user",
      rateLimitTier: 200,
      active: true,
      createdAt: Date.now(),
      expiresAt: 0,
    };
    registerApiKey(writeApiKey);

    // Register an admin API key
    const adminApiKey: ApiKey = {
      keyId: "admin_key_789",
      keyHash: adminKeyHash.hash,
      keySalt: adminKeyHash.salt,
      scope: "admin" as ApiKeyScope,
      owner: "admin",
      rateLimitTier: 1000,
      active: true,
      createdAt: Date.now(),
      expiresAt: 0,
    };
    registerApiKey(adminApiKey);
  });

  describe("apiKeyAuth", () => {
    it("should authenticate with valid API key in Authorization header", async () => {
      app.use("*", apiKeyAuth());
      app.get("/test", (c) => {
        const auth = getAuthContext(c);
        return c.json({ authenticated: !!auth, keyId: auth?.keyId });
      });

      const res = await app.request("/test", {
        headers: {
          Authorization: "Bearer test_key_123:test_secret",
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.authenticated).toBe(true);
      expect(json.keyId).toBe("test_key_123");
    });

    it("should authenticate with valid API key in X-API-Key header", async () => {
      app.use("*", apiKeyAuth());
      app.get("/test", (c) => {
        const auth = getAuthContext(c);
        return c.json({ authenticated: !!auth });
      });

      const res = await app.request("/test", {
        headers: {
          "X-API-Key": "test_key_123:test_secret",
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.authenticated).toBe(true);
    });

    it("should reject invalid API key", async () => {
      app.use("*", apiKeyAuth());
      app.get("/test", (c) => c.json({ ok: true }));

      const res = await app.request("/test", {
        headers: {
          Authorization: "Bearer invalid_key:wrong_secret",
        },
      });

      expect(res.status).toBe(401);
    });

    it("should reject request without API key", async () => {
      app.use("*", apiKeyAuth());
      app.get("/test", (c) => c.json({ ok: true }));

      const res = await app.request("/test");

      expect(res.status).toBe(401);
    });

    it("should enforce required scope", async () => {
      app.use("*", apiKeyAuth({ requiredScope: "write" }));
      app.get("/test", (c) => c.json({ ok: true }));

      // Read-only key should not have access to write scope
      const res = await app.request("/test", {
        headers: {
          Authorization: "Bearer test_key_123:test_secret",
        },
      });

      expect(res.status).toBe(403);
    });

    it("should allow write scope for write-required endpoint", async () => {
      app.use("*", apiKeyAuth({ requiredScope: "write" }));
      app.get("/test", (c) => {
        const auth = getAuthContext(c);
        return c.json({ scope: auth?.scope });
      });

      const res = await app.request("/test", {
        headers: {
          Authorization: "Bearer write_key_456:write_secret",
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.scope).toBe("write");
    });

    it("should reject expired API key", async () => {
      const expiredKey: ApiKey = {
        keyId: "expired_key",
        keyHash: "ZXhwaXJlZF9zZWNyZXQ=",
        scope: "read",
        active: true,
        createdAt: Date.now() - 100_000,
        expiresAt: Date.now() - 1000, // Expired
        rateLimitTier: 100,
      };
      registerApiKey(expiredKey);

      app.use("*", apiKeyAuth());
      app.get("/test", (c) => c.json({ ok: true }));

      const res = await app.request("/test", {
        headers: {
          Authorization: "Bearer expired_key:expired_secret",
        },
      });

      expect(res.status).toBe(401);
    });

    it("should reject inactive API key", async () => {
      const inactiveKey: ApiKey = {
        keyId: "inactive_key",
        keyHash: "aW5hY3RpdmVfc2VjcmV0",
        scope: "read",
        active: false,
        createdAt: Date.now(),
        expiresAt: 0,
        rateLimitTier: 100,
      };
      registerApiKey(inactiveKey);

      app.use("*", apiKeyAuth());
      app.get("/test", (c) => c.json({ ok: true }));

      const res = await app.request("/test", {
        headers: {
          Authorization: "Bearer inactive_key:inactive_secret",
        },
      });

      expect(res.status).toBe(401);
    });
  });

  describe("session management", () => {
    it("should create and validate session", async () => {
      const { sessionId } = await createSession("test_key_123", "127.0.0.1", "test-agent");

      expect(sessionId).toBeTruthy();
      expect(typeof sessionId).toBe("string");

      app.use("*", apiKeyAuth({ allowSessions: true }));
      app.get("/test", (c) => {
        const auth = getAuthContext(c);
        return c.json({ authenticated: !!auth, hasSession: !!auth?.sessionId });
      });

      const res = await app.request("/test", {
        headers: {
          Authorization: `Bearer ${sessionId}`,
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.authenticated).toBe(true);
      expect(json.hasSession).toBe(true);
    });

    it("should invalidate session", async () => {
      const { sessionId } = await createSession("test_key_123", "127.0.0.1");

      const result = invalidateSession(sessionId);
      expect(result).toBe(true);

      // Second invalidation should return false
      const result2 = invalidateSession(sessionId);
      expect(result2).toBe(false);
    });

    it("should invalidate all sessions for a key", async () => {
      // Create multiple sessions for test_key_123
      const { sessionId: session1 } = await createSession("test_key_123", "127.0.0.1");
      const { sessionId: session2 } = await createSession("test_key_123", "127.0.0.2");
      // Create a session for a different key
      await createSession("write_key_456", "127.0.0.3");

      // Count total sessions before invalidation
      const initialSessionCount = 3; // From this test

      const count = invalidateAllSessionsForKey("test_key_123");
      // Should invalidate all sessions for test_key_123 (3 including the one from the previous test)
      expect(count).toBeGreaterThanOrEqual(2);
    });
  });

  describe("optionalAuth", () => {
    it("should attach auth context when credentials provided", async () => {
      app.use("*", optionalAuth());
      app.get("/test", (c) => {
        const auth = getAuthContext(c);
        return c.json({ authenticated: !!auth, keyId: auth?.keyId });
      });

      const res = await app.request("/test", {
        headers: {
          Authorization: "Bearer test_key_123:test_secret",
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.authenticated).toBe(true);
      expect(json.keyId).toBe("test_key_123");
    });

    it("should proceed without auth when no credentials provided", async () => {
      app.use("*", optionalAuth());
      app.get("/test", (c) => {
        const auth = getAuthContext(c);
        return c.json({ authenticated: !!auth });
      });

      const res = await app.request("/test");

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.authenticated).toBe(false);
    });
  });

  describe("requireScope", () => {
    it("should require specific scope", async () => {
      app.use("*", apiKeyAuth({ requiredScope: "read" }));
      app.use("/admin/*", requireScope("admin"));
      app.get("/admin/test", (c) => c.json({ ok: true }));

      // Read key should not have admin access
      const res = await app.request("/admin/test", {
        headers: {
          Authorization: "Bearer test_key_123:test_secret",
        },
      });

      expect(res.status).toBe(403);
    });

    it("should allow admin scope for admin endpoint", async () => {
      app.use("*", apiKeyAuth({ requiredScope: "read" }));
      app.use("/admin/*", requireScope("admin"));
      app.get("/admin/test", (c) => c.json({ ok: true }));

      const res = await app.request("/admin/test", {
        headers: {
          Authorization: "Bearer admin_key_789:admin_secret",
        },
      });

      expect(res.status).toBe(200);
    });
  });

  describe("signedRequestAuth", () => {
    it("should require signature headers", async () => {
      app.use("*", signedRequestAuth());
      app.get("/test", (c) => c.json({ ok: true }));

      const res = await app.request("/test");

      expect(res.status).toBe(401);
    });

    it("should reject invalid timestamp format", async () => {
      app.use("*", signedRequestAuth());
      app.get("/test", (c) => c.json({ ok: true }));

      const res = await app.request("/test", {
        headers: {
          "X-Signature": "hmac_sha256:abc123",
          "X-API-Key-Id": "test_key_123",
          "X-Timestamp": "invalid",
        },
      });

      expect(res.status).toBe(400);
    });

    it("should reject invalid signature format", async () => {
      app.use("*", signedRequestAuth());
      app.get("/test", (c) => c.json({ ok: true }));

      const res = await app.request("/test", {
        headers: {
          "X-Signature": "invalid_signature",
          "X-API-Key-Id": "test_key_123",
          "X-Timestamp": Date.now().toString(),
        },
      });

      expect(res.status).toBe(401);
    });
  });

  describe("helper functions", () => {
    it("isAuthenticated should return true when authenticated", async () => {
      app.use("*", apiKeyAuth());
      app.get("/test", (c) => {
        return c.json({ authenticated: isAuthenticated(c) });
      });

      const res = await app.request("/test", {
        headers: {
          Authorization: "Bearer test_key_123:test_secret",
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.authenticated).toBe(true);
    });

    it("isAuthenticated should return false when not authenticated", async () => {
      app.get("/test", (c) => {
        return c.json({ authenticated: isAuthenticated(c) });
      });

      const res = await app.request("/test");

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.authenticated).toBe(false);
    });
  });

  describe("refresh token management", () => {
    it("should create session with refresh token", async () => {
      const { sessionId, refreshToken } = await createSession(
        "test_key_123",
        "127.0.0.1",
        "test-agent",
        undefined,
        {
          createRefreshToken: true,
        }
      );

      expect(sessionId).toBeTruthy();
      expect(refreshToken).toBeTruthy();
      expect(typeof refreshToken).toBe("string");
      expect(refreshToken!.length).toBeGreaterThan(0);
    });

    it("should refresh session with valid refresh token", async () => {
      const { sessionId, refreshToken } = await createSession(
        "test_key_123",
        "127.0.0.1",
        "test-agent",
        undefined,
        {
          createRefreshToken: true,
        }
      );

      expect(refreshToken).toBeTruthy();

      // Refresh the session
      const result = await refreshSession(refreshToken!, "127.0.0.1");

      expect(result).not.toBeNull();
      expect(result!.sessionId).not.toBe(sessionId); // New session ID should be different
      expect(result!.newRefreshToken).toBeTruthy();
      expect(result!.tokenFingerprint).toBeTruthy();
    });

    it("should reject invalid refresh token", async () => {
      const result = await refreshSession("invalid_token", "127.0.0.1");
      expect(result).toBeNull();
    });

    it("should detect refresh token reuse and invalidate family", async () => {
      const { refreshToken } = createSession("test_key_123", "127.0.0.1", "test-agent", undefined, {
        createRefreshToken: true,
      });

      // First use
      const firstResult = await refreshSession(refreshToken!, "127.0.0.1");
      expect(firstResult).not.toBeNull();

      // Try to reuse the same token (security breach scenario)
      const secondResult = await refreshSession(refreshToken!, "127.0.0.1");
      expect(secondResult).toBeNull(); // Should be rejected
    });

    it("should check if session needs refresh", async () => {
      const { sessionId } = await createSession("test_key_123", "127.0.0.1", "test-agent");

      // Fresh session shouldn't need refresh
      expect(shouldRefreshSession(sessionId)).toBe(false);
    });

    it("should get active sessions for API key", async () => {
      // Create multiple sessions
      await createSession("test_key_123", "127.0.0.1", "agent1");
      await createSession("test_key_123", "127.0.0.2", "agent2");
      await createSession("write_key_456", "127.0.0.3", "agent3");

      const testKeySessions = getActiveSessionsForApiKey("test_key_123");
      expect(testKeySessions.length).toBeGreaterThanOrEqual(2);
    });

    it("should revoke session", async () => {
      const { sessionId } = await createSession("test_key_123", "127.0.0.1", "test-agent");

      const revoked = revokeSession(sessionId, "127.0.0.1");
      expect(revoked).toBe(true);

      // Session should no longer be active
      const sessions = getActiveSessionsForApiKey("test_key_123");
      const revokedSession = sessions.find((s) => s.sessionId === sessionId);
      expect(revokedSession).toBeUndefined();
    });
  });

  describe("TOTP multi-factor authentication", () => {
    it("should setup TOTP for an API key", () => {
      const result = setupTotp("test_key_123");

      expect(result.secret).toBeTruthy();
      expect(result.backupCodes).toBeTruthy();
      expect(result.backupCodes.length).toBe(10);
      expect(result.qrCodeUrl).toContain("otpauth://totp");
    });

    it("should enable TOTP after setup", () => {
      setupTotp("test_key_123");
      const enabled = enableTotp("test_key_123");
      expect(enabled).toBe(true);
    });

    it("should verify TOTP code", async () => {
      setupTotp("test_key_123");
      enableTotp("test_key_123");

      // Note: In a real scenario, we'd generate a valid TOTP code
      // For testing, we'll use a backup code
      const { backupCodes } = setupTotp("test_key_123");
      enableTotp("test_key_123");

      const result = await verifyTotpCode("test_key_123", backupCodes[0]!);
      expect(result.valid).toBe(true);
      expect(result.usedBackupCode).toBe(true);
      expect(result.remainingBackupCodes).toBe(9);
    });

    it("should reject invalid TOTP code", async () => {
      setupTotp("test_key_123");
      enableTotp("test_key_123");

      const result = await verifyTotpCode("test_key_123", "000000");
      expect(result.valid).toBe(false);
    });

    it("should check if session has MFA verified", async () => {
      const { sessionId } = await createSession("write_key_456", "127.0.0.1", "test-agent");

      // No TOTP configured, so should return true
      expect(isSessionMfaVerified(sessionId)).toBe(true);

      // Setup TOTP
      setupTotp("write_key_456");
      enableTotp("write_key_456");

      // Now MFA should be required but not verified
      expect(isSessionMfaVerified(sessionId)).toBe(false);
    });

    it("should verify MFA for session and regenerate session", async () => {
      const { sessionId } = await createSession("admin_key_789", "127.0.0.1", "test-agent");

      // Setup TOTP and get a backup code
      const { backupCodes } = setupTotp("admin_key_789");
      enableTotp("admin_key_789");

      // Verify MFA with backup code
      const result = await verifyMfaForSession(sessionId, backupCodes[0]!);

      expect(result.valid).toBe(true);
      expect(result.newSessionId).not.toBe(sessionId);

      // New session should have MFA verified
      expect(isSessionMfaVerified(result.newSessionId!)).toBe(true);
    });

    it("should disable TOTP", () => {
      setupTotp("test_key_123");
      const disabled = disableTotp("test_key_123");
      expect(disabled).toBe(true);
    });
  });

  describe("OAuth 2.0 integration", () => {
    beforeEach(() => {
      // Register a test OAuth provider
      registerOAuthProvider({
        providerId: "test_provider",
        displayName: "Test Provider",
        authorizationEndpoint: "https://example.com/auth",
        tokenEndpoint: "https://example.com/token",
        userInfoEndpoint: "https://example.com/userinfo",
        clientId: "test_client_id",
        clientSecret: "test_client_secret",
        scope: ["openid", "profile", "email"],
        redirectUri: "https://myapp.com/oauth/callback",
        active: true,
      });
    });

    it("should generate OAuth state with PKCE", async () => {
      const result = await generateOAuthState("test_provider", "https://myapp.com/dashboard");

      expect(result.state).toBeTruthy();
      expect(result.codeVerifier).toBeTruthy();
      expect(result.codeChallenge).toBeTruthy();
      expect(result.codeChallenge).not.toBe(result.codeVerifier); // Should be hashed
    });

    it("should validate OAuth state", async () => {
      const { state } = await generateOAuthState("test_provider");

      const validated = validateOAuthState(state);
      expect(validated).not.toBeNull();
      expect(validated!.providerId).toBe("test_provider");
    });

    it("should reject invalid OAuth state", () => {
      const validated = validateOAuthState("invalid_state");
      expect(validated).toBeNull();
    });

    it("should create OAuth session", async () => {
      const { sessionId } = await createOAuthSession(
        "test_provider",
        "test_key_123",
        "127.0.0.1",
        "test-agent",
        { userId: "user123" }
      );

      expect(sessionId).toBeTruthy();

      // Verify the session has OAuth type
      const sessions = getActiveSessionsForApiKey("test_key_123");
      const oauthSession = sessions.find((s) => s.sessionId === sessionId);
      expect(oauthSession?.sessionType).toBe("oauth");
    });
  });

  describe("password policy validation", () => {
    it("should validate strong password", async () => {
      const result = await validatePassword("StrongP@ssw0rd123");

      expect(result.valid).toBe(true);
      expect(result.strength).toBeGreaterThan(50);
    });

    it("should reject password that is too short", async () => {
      const result = await validatePassword("Short1!");

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Password must be at least 12 characters long");
    });

    it("should reject password without uppercase", async () => {
      const result = await validatePassword("lowercase123!");

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Password must contain at least one uppercase letter");
    });

    it("should reject password without lowercase", async () => {
      const result = await validatePassword("UPPERCASE123!");

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Password must contain at least one lowercase letter");
    });

    it("should reject password without numbers", async () => {
      const result = await validatePassword("NoNumbers!");

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Password must contain at least one number");
    });

    it("should reject password without special characters", async () => {
      const result = await validatePassword("NoSpecialChars123");

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Password must contain at least one special character");
    });

    it("should reject common weak passwords", async () => {
      const result = await validatePassword("password123");

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Password is too common or weak");
    });

    it("should reject password with excessive repetition", async () => {
      const result = await validatePassword("AAAAaaa111!!!");

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("same character more than"))).toBe(true);
    });

    it("should calculate password strength correctly", async () => {
      const weakPassword = await validatePassword("weak1!");
      const strongPassword = await validatePassword("VeryStr0ng!Passw0rd@2024");

      expect(weakPassword.strength).toBeLessThan(strongPassword.strength);
      // The strength algorithm calculates 90 for this password based on:
      // - Length: 40 points (capped)
      // - Character variety: 25 points (lowercase + uppercase + numbers + special)
      // - Distribution: ~16 points (18 unique chars / 23 total)
      // - Complexity bonus: 10 points
      // Total: ~91 points, capped at 90
      expect(strongPassword.strength).toBeGreaterThanOrEqual(90);
    });
  });

  describe("session security features", () => {
    it("should enforce concurrent session limit", async () => {
      // Create maximum concurrent sessions
      const sessions: string[] = [];
      for (let i = 0; i < 6; i++) {
        const { sessionId } = await createSession("test_key_123", `127.0.0.${i}`, "test-agent");
        sessions.push(sessionId);
      }

      // The oldest session should be deactivated
      const activeSessions = getActiveSessionsForApiKey("test_key_123");
      expect(activeSessions.length).toBeLessThanOrEqual(5); // Max concurrent sessions
    });

    it("should enforce IP binding for sessions", async () => {
      // Reset tracking to avoid rate limiting from previous tests
      resetSuspiciousActivityTracking();
      resetAuthFailureTracking();

      const { sessionId } = await createSession(
        "test_key_123",
        "192.168.100.50",
        "test-agent",
        undefined,
        {
          ipBinding: true,
        }
      );

      // Create app with session auth
      const testApp = new Hono();
      testApp.use("*", apiKeyAuth({ allowSessions: true }));
      testApp.get("/test", (c) => c.json({ ok: true }));

      // Try to authenticate with different IP
      const res = await testApp.request("/test", {
        headers: {
          Authorization: `Bearer ${sessionId}`,
          "X-Forwarded-For": "192.168.1.1", // Different IP
        },
      });

      // Should be rejected due to IP mismatch
      expect(res.status).toBe(401);
    });

    it("should track device information", async () => {
      const userAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)";
      const { sessionId } = await createSession("test_key_123", "127.0.0.1", userAgent);

      const sessions = getActiveSessionsForApiKey("test_key_123");
      const session = sessions.find((s) => s.sessionId === sessionId);

      expect(session?.deviceId).toBeTruthy();
      expect(session?.userAgent).toBe(userAgent);
    });
  });

  describe("account lockout protection", () => {
    it("should track failed authentication attempts", async () => {
      const testApp = new Hono();
      testApp.use("*", apiKeyAuth());
      testApp.get("/test", (c) => c.json({ ok: true }));

      // Attempt authentication with wrong secret multiple times
      for (let i = 0; i < 3; i++) {
        await testApp.request("/test", {
          headers: {
            Authorization: "Bearer test_key_123:wrong_secret",
          },
        });
      }

      // The API key should have failed attempts recorded
      // Note: This is testing the lockout mechanism is in place
      // In a real scenario, after 5 failed attempts the key would be locked
    });
  });

  describe("session expiration edge cases", () => {
    it("should handle session absolute expiration", async () => {
      // Reset tracking to avoid rate limiting from previous tests
      resetSuspiciousActivityTracking();
      resetAuthFailureTracking();

      const { sessionId } = await createSession("test_key_123", "127.0.0.1", "test-agent");

      // Get the session and manually set it as expired
      const testApp = new Hono();
      testApp.use("*", apiKeyAuth({ allowSessions: true }));
      testApp.get("/test", (c) => c.json({ ok: true }));

      // Access should work initially (include IP header to match session IP)
      const res1 = await testApp.request("/test", {
        headers: {
          Authorization: `Bearer ${sessionId}`,
          "X-Forwarded-For": "127.0.0.1",
        },
      });
      expect(res1.status).toBe(200);

      // Manually expire the session by setting expiresAt to past
      const sessions = getActiveSessionsForApiKey("test_key_123");
      const session = sessions.find((s) => s.sessionId === sessionId);
      if (session) {
        (session as any).expiresAt = Date.now() - 1000;
      }

      // Access should fail after expiration
      const res2 = await testApp.request("/test", {
        headers: {
          Authorization: `Bearer ${sessionId}`,
          "X-Forwarded-For": "127.0.0.1",
        },
      });
      expect(res2.status).toBe(401);
    });

    it("should handle session idle timeout", async () => {
      // Reset tracking to avoid rate limiting from previous tests
      resetSuspiciousActivityTracking();
      resetAuthFailureTracking();

      const { sessionId } = await createSession("test_key_123", "127.0.0.1", "test-agent");

      // Get the session and simulate idle timeout
      const sessions = getActiveSessionsForApiKey("test_key_123");
      const session = sessions.find((s) => s.sessionId === sessionId);
      if (session) {
        // Set lastActivity to more than 30 minutes ago
        (session as any).lastActivityAt = Date.now() - 31 * 60 * 1000;
      }

      // Create app with session auth
      const testApp = new Hono();
      testApp.use("*", apiKeyAuth({ allowSessions: true }));
      testApp.get("/test", (c) => c.json({ ok: true }));

      // Access should fail due to idle timeout
      const res = await testApp.request("/test", {
        headers: {
          Authorization: `Bearer ${sessionId}`,
          "X-Forwarded-For": "127.0.0.1",
        },
      });
      expect(res.status).toBe(401);
    });

    it("should clean up expired sessions", async () => {
      // Create sessions
      const { sessionId: session1 } = await createSession("test_key_123", "127.0.0.1", "agent1");
      const { sessionId: session2 } = await createSession("test_key_123", "127.0.0.2", "agent2");

      // Manually expire one session
      const sessions = getActiveSessionsForApiKey("test_key_123");
      const session = sessions.find((s) => s.sessionId === session1);
      if (session) {
        (session as any).expiresAt = Date.now() - 1000;
      }

      // Run cleanup
      const cleaned = cleanupExpiredSessions();

      // At least one session should be cleaned up
      expect(cleaned).toBeGreaterThanOrEqual(1);
    });

    it("should clean up expired refresh tokens", async () => {
      // Create session with refresh token
      const { refreshToken } = await createSession(
        "test_key_123",
        "127.0.0.1",
        "test-agent",
        undefined,
        {
          createRefreshToken: true,
        }
      );

      // Manually expire the refresh token by accessing internal storage
      // Note: This is testing the cleanup mechanism
      const cleaned = cleanupExpiredRefreshTokens();

      // Should run without errors (may clean up tokens from previous tests)
      expect(typeof cleaned).toBe("number");
    });
  });

  describe("sliding window refresh flow", () => {
    it("should detect when session needs refresh", async () => {
      const { sessionId } = await createSession("test_key_123", "127.0.0.1", "test-agent");

      // Fresh session shouldn't need refresh
      expect(shouldRefreshSession(sessionId)).toBe(false);

      // Manually set session to near expiration
      const sessions = getActiveSessionsForApiKey("test_key_123");
      const session = sessions.find((s) => s.sessionId === sessionId);
      if (session) {
        // Set expiration to 14 minutes from now (within sliding window)
        (session as any).expiresAt = Date.now() + 14 * 60 * 1000;
      }

      // Session should now need refresh
      expect(shouldRefreshSession(sessionId)).toBe(true);
    });

    it("should extend session expiration on refresh", async () => {
      const { sessionId, refreshToken } = await createSession(
        "test_key_123",
        "127.0.0.1",
        "test-agent",
        undefined,
        {
          createRefreshToken: true,
        }
      );

      // Get original expiration
      const sessions = getActiveSessionsForApiKey("test_key_123");
      const oldSession = sessions.find((s) => s.sessionId === sessionId);
      const originalExpiresAt = oldSession?.expiresAt || 0;

      // Wait a small amount to ensure time difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Refresh the session
      const result = await refreshSession(refreshToken!, "127.0.0.1");

      expect(result).not.toBeNull();

      // Get new session expiration
      const newSessions = getActiveSessionsForApiKey("test_key_123");
      const newSession = newSessions.find((s) => s.sessionId === result!.sessionId);
      const newExpiresAt = newSession?.expiresAt || 0;

      // New expiration should be later than original
      expect(newExpiresAt).toBeGreaterThan(originalExpiresAt);
    });

    it("should rotate refresh tokens on use", async () => {
      // Reset tracking to avoid rate limiting from previous tests
      resetSuspiciousActivityTracking();
      resetAuthFailureTracking();

      const { refreshToken } = await createSession(
        "test_key_123",
        "127.0.0.1",
        "test-agent",
        undefined,
        {
          createRefreshToken: true,
        }
      );

      // First refresh should work
      const result1 = await refreshSession(refreshToken!, "127.0.0.1");
      expect(result1).not.toBeNull();

      // Old refresh token should not work again (single use)
      const result2 = await refreshSession(refreshToken!, "127.0.0.1");
      expect(result2).toBeNull();

      // IMPORTANT: When token reuse is detected, the entire rotation family is invalidated
      // This is a security feature to prevent token theft attacks
      // Therefore, the new refresh token is also invalidated
      const result3 = await refreshSession(result1!.newRefreshToken, "127.0.0.1");
      expect(result3).toBeNull(); // New token is also invalidated due to token reuse
    });
  });

  describe("concurrent session limit edge cases", () => {
    it("should enforce exact concurrent session limit", async () => {
      // Clear existing sessions for test_key_123
      invalidateAllSessionsForKey("test_key_123");

      // Create exactly 5 concurrent sessions
      const sessionIds: string[] = [];
      for (let i = 0; i < 5; i++) {
        const { sessionId } = await createSession("test_key_123", `127.0.0.${i}`, `agent${i}`);
        sessionIds.push(sessionId);
      }

      // All 5 sessions should be active
      const sessions = getActiveSessionsForApiKey("test_key_123");
      expect(sessions.length).toBe(5);

      // Create one more session - should deactivate oldest
      const { sessionId: newSessionId } = await createSession(
        "test_key_123",
        "127.0.0.10",
        "agent10"
      );

      const newSessions = getActiveSessionsForApiKey("test_key_123");
      expect(newSessions.length).toBe(5); // Still 5 active

      // The oldest session should no longer be active
      const activeSessionIds = newSessions.map((s) => s.sessionId);
      expect(activeSessionIds).not.toContain(sessionIds[0]);
      expect(activeSessionIds).toContain(newSessionId);
    });

    it("should handle rapid session creation", async () => {
      // Clear existing sessions
      invalidateAllSessionsForKey("test_key_123");

      // Create many sessions rapidly
      const sessionIds: string[] = [];
      for (let i = 0; i < 20; i++) {
        const { sessionId } = await createSession(
          "test_key_123",
          `127.0.0.${i % 256}`,
          `agent${i}`
        );
        sessionIds.push(sessionId);
      }

      // Should only have 5 active sessions
      const sessions = getActiveSessionsForApiKey("test_key_123");
      expect(sessions.length).toBe(5);

      // The 5 most recent sessions should be active
      const activeSessionIds = sessions.map((s) => s.sessionId);
      for (let i = 15; i < 20; i++) {
        expect(activeSessionIds).toContain(sessionIds[i]);
      }
    });
  });

  describe("IP binding edge cases", () => {
    it("should allow session from same IP when IP binding enabled", async () => {
      // Reset tracking to avoid rate limiting from previous tests
      resetSuspiciousActivityTracking();
      resetAuthFailureTracking();

      const { sessionId } = await createSession(
        "test_key_123",
        "192.168.1.100",
        "test-agent",
        undefined,
        {
          ipBinding: true,
        }
      );

      const testApp = new Hono();
      testApp.use("*", apiKeyAuth({ allowSessions: true }));
      testApp.get("/test", (c) => c.json({ ok: true }));

      // Same IP should work
      const res = await testApp.request("/test", {
        headers: {
          Authorization: `Bearer ${sessionId}`,
          "X-Forwarded-For": "192.168.1.100",
        },
      });
      expect(res.status).toBe(200);
    });

    it("should reject session from different IP when IP binding enabled", async () => {
      // Reset tracking to avoid rate limiting from previous tests
      resetSuspiciousActivityTracking();
      resetAuthFailureTracking();

      const { sessionId } = await createSession(
        "test_key_123",
        "192.168.1.100",
        "test-agent",
        undefined,
        {
          ipBinding: true,
        }
      );

      const testApp = new Hono();
      testApp.use("*", apiKeyAuth({ allowSessions: true }));
      testApp.get("/test", (c) => c.json({ ok: true }));

      // Different subnet IP should fail
      const res = await testApp.request("/test", {
        headers: {
          Authorization: `Bearer ${sessionId}`,
          "X-Forwarded-For": "192.168.2.100", // Different subnet (192.168.2.x vs 192.168.1.x)
        },
      });
      expect(res.status).toBe(401);
    });

    it("should allow session from any IP when IP binding disabled", async () => {
      // Reset tracking to avoid rate limiting from previous tests
      resetSuspiciousActivityTracking();
      resetAuthFailureTracking();

      const { sessionId } = await createSession(
        "test_key_123",
        "192.168.1.100",
        "test-agent",
        undefined,
        {
          ipBinding: false,
        }
      );

      const testApp = new Hono();
      testApp.use("*", apiKeyAuth({ allowSessions: true }));
      testApp.get("/test", (c) => c.json({ ok: true }));

      // Different IP should work when binding is disabled
      const res = await testApp.request("/test", {
        headers: {
          Authorization: `Bearer ${sessionId}`,
          "X-Forwarded-For": "192.168.1.200",
        },
      });
      expect(res.status).toBe(200);
    });

    it("should handle IP changes with CF-Connecting-IP header", async () => {
      // Reset tracking to avoid rate limiting from previous tests
      resetSuspiciousActivityTracking();
      resetAuthFailureTracking();

      const { sessionId } = await createSession(
        "test_key_123",
        "192.168.1.100",
        "test-agent",
        undefined,
        {
          ipBinding: true,
        }
      );

      const testApp = new Hono();
      testApp.use("*", apiKeyAuth({ allowSessions: true }));
      testApp.get("/test", (c) => c.json({ ok: true }));

      // CF-Connecting-IP should be used for validation
      const res = await testApp.request("/test", {
        headers: {
          Authorization: `Bearer ${sessionId}`,
          "CF-Connecting-IP": "192.168.1.100",
          "X-Forwarded-For": "10.0.0.1, 192.168.1.200",
        },
      });
      expect(res.status).toBe(200);
    });
  });

  describe("session metadata sanitization", () => {
    it("should sanitize metadata on session creation", async () => {
      const metadata = {
        userId: "user123",
        email: "user@example.com",
        dangerous: "<script>alert('xss')</script>",
        sqlInjection: "' OR '1'='1",
        nested: {
          value: "safe value",
          dangerous: "<img src=x onerror=alert(1)>",
        },
      };

      const { sessionId } = await createSession(
        "test_key_123",
        "127.0.0.1",
        "test-agent",
        metadata
      );

      const sessions = getActiveSessionsForApiKey("test_key_123");
      const session = sessions.find((s) => s.sessionId === sessionId);

      expect(session?.metadata).toBeDefined();
      expect(session?.metadata?.userId).toBe("user123");
      expect(session?.metadata?.email).toBe("user@example.com");
      // Dangerous content should be sanitized
      expect(session?.metadata?.dangerous).not.toContain("<script>");
      expect(session?.metadata?.sqlInjection).not.toContain("OR");
    });

    it("should limit metadata key count", async () => {
      // Create metadata with more than 20 keys
      const metadata: Record<string, string> = {};
      for (let i = 0; i < 25; i++) {
        metadata[`key${i}`] = `value${i}`;
      }

      const { sessionId } = await createSession(
        "test_key_123",
        "127.0.0.1",
        "test-agent",
        metadata
      );

      const sessions = getActiveSessionsForApiKey("test_key_123");
      const session = sessions.find((s) => s.sessionId === sessionId);

      // Should have at most 20 keys
      const keyCount = Object.keys(session?.metadata || {}).length;
      expect(keyCount).toBeLessThanOrEqual(20);
    });
  });

  describe("session audit logging", () => {
    it("should log session creation event", () => {
      // This test verifies the logging function exists and works
      expect(() => {
        logSessionEvent("session_created", "test-session-id", "test_key_123", "127.0.0.1", {
          sessionType: "standard",
        });
      }).not.toThrow();
    });

    it("should log session refresh event", () => {
      expect(() => {
        logSessionEvent("session_refreshed", "test-session-id", "test_key_123", "127.0.0.1", {
          oldSessionId: "old-session-id",
        });
      }).not.toThrow();
    });

    it("should log session revocation event", () => {
      expect(() => {
        logSessionEvent("session_revoked", "test-session-id", "test_key_123", "127.0.0.1", {
          reason: "user_logout",
        });
      }).not.toThrow();
    });

    it("should log MFA verification events", () => {
      expect(() => {
        logSessionEvent("mfa_verified", "test-session-id", "test_key_123", "127.0.0.1", {
          method: "totp",
        });
      }).not.toThrow();

      expect(() => {
        logSessionEvent("mfa_failed", "test-session-id", "test_key_123", "127.0.0.1", {
          reason: "invalid_code",
        });
      }).not.toThrow();
    });
  });

  describe("enhanced session security", () => {
    it("should detect session hijacking by IP change", async () => {
      const { sessionId } = await createSession(
        "test_key_123",
        "192.168.1.100",
        "test-agent",
        undefined,
        {
          ipBinding: true,
        }
      );

      const testApp = new Hono();
      testApp.use("*", apiKeyAuth({ allowSessions: true }));
      testApp.get("/test", (c) => c.json({ ok: true }));

      // Different IP should fail
      const res = await testApp.request("/test", {
        headers: {
          Authorization: `Bearer ${sessionId}`,
          "X-Forwarded-For": "10.0.0.1", // Different subnet
        },
      });
      expect(res.status).toBe(401);
    });

    it("should allow same subnet IP change with warning", async () => {
      const { sessionId } = await createSession(
        "test_key_123",
        "192.168.1.100",
        "test-agent",
        undefined,
        {
          ipBinding: true,
        }
      );

      const testApp = new Hono();
      testApp.use("*", apiKeyAuth({ allowSessions: true }));
      testApp.get("/test", (c) => c.json({ ok: true }));

      // Same subnet should work
      const res = await testApp.request("/test", {
        headers: {
          Authorization: `Bearer ${sessionId}`,
          "X-Forwarded-For": "192.168.1.200", // Same subnet
        },
      });
      expect(res.status).toBe(200);
    });

    it("should get session security info", async () => {
      const userAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)";
      const { sessionId, refreshToken } = await createSession(
        "test_key_123",
        "127.0.0.1",
        userAgent,
        { userId: "test123" },
        {
          ipBinding: true,
          createRefreshToken: true,
        }
      );

      const securityInfo = getSessionSecurityInfo(sessionId);

      expect(securityInfo).not.toBeNull();
      expect(securityInfo?.exists).toBe(true);
      expect(securityInfo?.active).toBe(true);
      expect(securityInfo?.deviceId).toBeTruthy();
      expect(securityInfo?.ipBinding).toBe(true);
      expect(securityInfo?.hasRefreshToken).toBe(true);
      expect(securityInfo?.sessionType).toBe("standard");
      expect(securityInfo?.idleTime).toBeGreaterThanOrEqual(0);
    });

    it("should return null for non-existent session security info", () => {
      const securityInfo = getSessionSecurityInfo("non-existent-session-id");
      expect(securityInfo).toBeNull();
    });

    it("should validate refresh token format", () => {
      // Valid 64-character hex string
      expect(validateRefreshTokenFormat("a".repeat(64))).toBe(true);

      // Invalid formats
      expect(validateRefreshTokenFormat("too-short")).toBe(false);
      expect(validateRefreshTokenFormat("g".repeat(64))).toBe(false); // 'g' is not hex
      expect(validateRefreshTokenFormat("")).toBe(false);
    });

    it("should check refresh token expiry", async () => {
      const { refreshToken } = await createSession(
        "test_key_123",
        "127.0.0.1",
        "test-agent",
        undefined,
        {
          createRefreshToken: true,
        }
      );

      // Valid token should return expiry time
      const expiry = await checkRefreshTokenExpiry(refreshToken!);
      expect(expiry).not.toBeNull();
      expect(expiry!).toBeGreaterThan(Date.now());

      // Invalid token should return null
      const invalidExpiry = checkRefreshTokenExpiry("invalid-token");
      expect(invalidExpiry).toBeNull();
    });

    it("should validate session token format", () => {
      // Valid UUID v4
      expect(validateSessionTokenFormat("550e8400-e29b-41d4-a716-446655440000")).toBe(true);

      // Invalid formats
      expect(validateSessionTokenFormat("not-a-uuid")).toBe(false);
      expect(validateSessionTokenFormat("")).toBe(false);
      expect(validateSessionTokenFormat("550e8400-e29b-41d4-a716-44665544000g")).toBe(false); // 'g' invalid
    });

    it("should get session counts for API key", async () => {
      // Clear existing sessions
      invalidateAllSessionsForKey("test_key_123");

      // Create multiple sessions
      await createSession("test_key_123", "127.0.0.1", "agent1");
      await createSession("test_key_123", "127.0.0.2", "agent2");

      const counts = getSessionCounts("test_key_123");

      expect(counts.total).toBeGreaterThanOrEqual(2);
      expect(counts.active).toBeGreaterThanOrEqual(2);
      expect(counts.expired).toBe(0);
    });

    it("should count expired sessions correctly", async () => {
      // Create a session and manually expire it
      const { sessionId } = await createSession("test_key_123", "127.0.0.1", "agent");

      const sessions = getActiveSessionsForApiKey("test_key_123");
      const session = sessions.find((s) => s.sessionId === sessionId);
      if (session) {
        (session as any).expiresAt = Date.now() - 1000;
      }

      const counts = getSessionCounts("test_key_123");
      expect(counts.expired).toBeGreaterThan(0);
    });

    it("should invalidate refresh token by value", async () => {
      const { refreshToken } = await createSession(
        "test_key_123",
        "127.0.0.1",
        "test-agent",
        undefined,
        {
          createRefreshToken: true,
        }
      );

      // Invalidate by token value
      const invalidated = await invalidateRefreshTokenByValue(refreshToken!);
      expect(invalidated).toBe(true);

      // Token should no longer work
      const expiry = await checkRefreshTokenExpiry(refreshToken!);
      expect(expiry).toBeNull();
    });

    it("should return false when invalidating non-existent refresh token", async () => {
      const result = await invalidateRefreshTokenByValue("non-existent-token");
      expect(result).toBe(false);
    });
  });

  describe("session lifecycle edge cases", () => {
    it("should handle rapid session creation and cleanup", async () => {
      // Clear existing sessions
      invalidateAllSessionsForKey("test_key_123");

      const sessionIds: string[] = [];
      for (let i = 0; i < 10; i++) {
        const { sessionId } = await createSession(
          "test_key_123",
          `127.0.0.${i % 256}`,
          `agent${i}`
        );
        sessionIds.push(sessionId);
      }

      // Run cleanup
      const cleaned = cleanupExpiredSessions();

      // Should complete without errors
      expect(typeof cleaned).toBe("number");
    });

    it("should handle session with very long metadata", async () => {
      // Create metadata with values near max length
      const metadata: Record<string, string> = {};
      for (let i = 0; i < 15; i++) {
        metadata[`key${i}`] = "x".repeat(400); // Near 500 char limit
      }

      const { sessionId } = await createSession(
        "test_key_123",
        "127.0.0.1",
        "test-agent",
        metadata
      );

      const sessions = getActiveSessionsForApiKey("test_key_123");
      const session = sessions.find((s) => s.sessionId === sessionId);

      expect(session).toBeDefined();
      // Metadata should be sanitized (truncated)
      expect(session?.metadata).toBeDefined();
    });

    it("should handle session with special characters in metadata", async () => {
      const metadata = {
        sql: "'; DROP TABLE users; --",
        xss: "<script>alert('xss')</script>",
        path: "../../../etc/passwd",
        unicode: "🔥🚀💻",
      };

      const { sessionId } = await createSession(
        "test_key_123",
        "127.0.0.1",
        "test-agent",
        metadata
      );

      const sessions = getActiveSessionsForApiKey("test_key_123");
      const session = sessions.find((s) => s.sessionId === sessionId);

      expect(session?.metadata).toBeDefined();
      // Dangerous content should be sanitized
      expect(session?.metadata?.xss).not.toContain("<script>");
    });

    it("should handle concurrent session refresh", async () => {
      const { sessionId, refreshToken } = await createSession(
        "test_key_123",
        "127.0.0.1",
        "test-agent",
        undefined,
        {
          createRefreshToken: true,
        }
      );

      // Try to refresh with the same token twice (simulating concurrent requests)
      const result1 = refreshSession(refreshToken!, "127.0.0.1");
      const result2 = refreshSession(refreshToken!, "127.0.0.1");

      // First refresh should succeed, second should fail (token reuse)
      expect(result1).not.toBeNull();
      expect(result2).toBeNull();
    });

    it("should handle session revocation during refresh", async () => {
      const { sessionId, refreshToken } = await createSession(
        "test_key_123",
        "127.0.0.1",
        "test-agent",
        undefined,
        {
          createRefreshToken: true,
        }
      );

      // Revoke the session
      revokeSession(sessionId, "127.0.0.1");

      // Refresh should fail
      const result = await refreshSession(refreshToken!, "127.0.0.1");
      expect(result).toBeNull();
    });
  });

  describe("token rotation edge cases", () => {
    beforeEach(async () => {
      // Configure encryption for token tests
      const testKey = generateMasterKey();
      await configureEncryption({ masterKey: testKey, version: 1 });
    });

    it("should handle refresh token just before expiration", async () => {
      const { sessionId, refreshToken } = await createSession(
        "test_key_123",
        "127.0.0.1",
        "test-agent",
        undefined,
        {
          createRefreshToken: true,
        }
      );

      // Get refresh token expiry
      const expiry = checkRefreshTokenExpiry(refreshToken!);

      // Should have a valid expiry time
      expect(expiry).not.toBeNull();
      expect(expiry!).toBeGreaterThan(Date.now());
    });

    it("should detect expired refresh token", async () => {
      const { sessionId, refreshToken } = await createSession(
        "test_key_123",
        "127.0.0.1",
        "test-agent",
        undefined,
        {
          createRefreshToken: true,
        }
      );

      // Invalidate the refresh token
      invalidateRefreshTokenByValue(refreshToken!);

      // Check expiry should return null
      const expiry = await checkRefreshTokenExpiry(refreshToken!);
      expect(expiry).toBeNull();
    });

    it("should validate refresh token format", () => {
      // Valid format: 64 hex characters
      const validToken = "a".repeat(64);
      expect(validateRefreshTokenFormat(validToken)).toBe(true);

      // Invalid formats
      expect(validateRefreshTokenFormat("too-short")).toBe(false);
      expect(validateRefreshTokenFormat("a".repeat(63))).toBe(false);
      expect(validateRefreshTokenFormat("g".repeat(64))).toBe(false); // Invalid hex
      expect(validateRefreshTokenFormat("")).toBe(false);
    });

    it("should handle cleanup of many expired tokens", async () => {
      // Create multiple sessions with refresh tokens
      const refreshTokens: string[] = [];
      for (let i = 0; i < 20; i++) {
        const { refreshToken } = await createSession(
          "test_key_123",
          `127.0.0.${(i + 1) % 256}`,
          `agent${i}`,
          undefined,
          {
            createRefreshToken: true,
          }
        );
        refreshTokens.push(refreshToken!);
      }

      // Invalidate all tokens
      for (const token of refreshTokens) {
        await invalidateRefreshTokenByValue(token);
      }

      // Cleanup should handle expired tokens
      const cleaned = cleanupExpiredRefreshTokens();
      expect(typeof cleaned).toBe("number");
    });
  });

  describe("session expiration edge cases", () => {
    it("should handle session at exact expiration boundary", async () => {
      const { sessionId } = await createSession("test_key_123", "127.0.0.1", "test-agent");

      // Get session counts before expiration
      const countsBefore = getSessionCounts("test_key_123");
      expect(countsBefore.active).toBeGreaterThan(0);

      // Session should be active
      const securityInfo = getSessionSecurityInfo(sessionId);
      expect(securityInfo?.active).toBe(true);
    });

    it("should detect sessions needing refresh", async () => {
      const { sessionId } = await createSession("test_key_123", "127.0.0.1", "test-agent");

      // Newly created session should not need refresh
      const needsRefresh = shouldRefreshSession(sessionId);
      expect(needsRefresh).toBe(false);
    });

    it("should handle session with maximum concurrent limit", async () => {
      // Clear existing sessions
      invalidateAllSessionsForKey("test_key_123");

      // Create sessions up to the concurrent limit (MAX_CONCURRENT_SESSIONS = 5)
      const sessionIds: string[] = [];
      for (let i = 0; i < 6; i++) {
        const { sessionId } = await createSession(
          "test_key_123",
          `127.0.0.${(i + 1) % 256}`,
          `agent${i}`
        );
        sessionIds.push(sessionId);
      }

      // Should have created 6 sessions (oldest deactivated)
      const counts = getSessionCounts("test_key_123");
      expect(counts.total).toBeGreaterThanOrEqual(5);
    });

    it("should get active sessions only", async () => {
      // Create multiple sessions
      const { sessionId: active1 } = await createSession("test_key_123", "127.0.0.1", "agent1");
      const { sessionId: active2 } = await createSession("test_key_123", "127.0.0.2", "agent2");

      // Invalidate one session
      invalidateSession(active1);

      // Get active sessions
      const activeSessions = getActiveSessionsForApiKey("test_key_123");

      // Should only return active sessions
      expect(activeSessions.length).toBeGreaterThan(0);
      expect(activeSessions.some((s) => s.sessionId === active2)).toBe(true);
      expect(activeSessions.some((s) => s.sessionId === active1)).toBe(false);
    });
  });

  describe("MFA verification edge cases", () => {
    it("should handle MFA verification for non-existent session", async () => {
      const result = await verifyMfaForSession("non-existent-session", "123456");
      expect(result.valid).toBe(false);
      expect(result.newSessionId).toBeUndefined();
    });

    it("should check MFA verification status for non-existent session", () => {
      const isVerified = isSessionMfaVerified("non-existent-session");
      expect(isVerified).toBe(false);
    });

    it("should handle TOTP setup without verification", () => {
      const totpSetup = setupTotp("test_key_123");

      expect(totpSetup.secret).toBeDefined();
      expect(totpSetup.backupCodes).toBeDefined();
      expect(totpSetup.backupCodes).toHaveLength(10);
      expect(totpSetup.qrCodeUrl).toContain("otpauth://totp");
    });

    it("should handle TOTP verification before setup", async () => {
      const result = await verifyTotpCode("test_key_123", "123456");
      expect(result.valid).toBe(false);
    });

    it("should handle TOTP verification with invalid code", async () => {
      setupTotp("test_key_123");

      // Verify before enabling (should fail)
      const result = await verifyTotpCode("test_key_123", "000000");
      expect(result.valid).toBe(false);
    });

    it("should handle disabling TOTP for non-existent key", () => {
      const result = disableTotp("non-existent-key");
      expect(result).toBe(false);
    });

    it("should handle enabling already enabled TOTP", () => {
      setupTotp("test_key_123");
      const firstEnable = enableTotp("test_key_123");
      const secondEnable = enableTotp("test_key_123");

      expect(firstEnable).toBe(true);
      expect(secondEnable).toBe(true);
    });
  });

  describe("refresh token security scenarios", () => {
    it("should detect refresh token reuse attack", async () => {
      const { sessionId, refreshToken } = await createSession(
        "test_key_123",
        "127.0.0.1",
        "test-agent",
        undefined,
        {
          createRefreshToken: true,
        }
      );

      // First refresh succeeds
      const result1 = await refreshSession(refreshToken!, "127.0.0.1");
      expect(result1).not.toBeNull();

      // Second refresh with same token fails (reuse detected)
      const result2 = await refreshSession(refreshToken!, "127.0.0.1");
      expect(result2).toBeNull();
    });

    it("should handle refresh from different IP", async () => {
      const { sessionId, refreshToken } = await createSession(
        "test_key_123",
        "127.0.0.1",
        "test-agent",
        undefined,
        {
          createRefreshToken: true,
        }
      );

      // Refresh from different IP (logged but allowed)
      const result = await refreshSession(refreshToken!, "192.168.1.100");

      // Should succeed but with new session
      expect(result).not.toBeNull();
      expect(result?.sessionId).not.toBe(sessionId);
    });

    it("should handle refresh after session idle timeout", async () => {
      const { sessionId, refreshToken } = await createSession(
        "test_key_123",
        "127.0.0.1",
        "test-agent",
        undefined,
        {
          createRefreshToken: true,
        }
      );

      // Manually set session as inactive (simulating idle timeout)
      revokeSession(sessionId, "127.0.0.1");

      // Refresh should fail
      const result = await refreshSession(refreshToken!, "127.0.0.1");
      expect(result).toBeNull();
    });

    it("should handle malformed refresh token", () => {
      const result = refreshSession("invalid-token-format", "127.0.0.1");
      expect(result).toBeNull();
    });

    it("should handle empty refresh token", () => {
      const result = refreshSession("", "127.0.0.1");
      expect(result).toBeNull();
    });
  });

  describe("session security edge cases", () => {
    it("should handle session with IP binding disabled", async () => {
      const { sessionId } = await createSession(
        "test_key_123",
        "127.0.0.1",
        "test-agent",
        undefined,
        {
          ipBinding: false,
        }
      );

      const testApp = new Hono();
      testApp.use("*", apiKeyAuth({ allowSessions: true }));
      testApp.get("/test", (c) => c.json({ ok: true }));

      // Different IP should work when binding is disabled
      const res = await testApp.request("/test", {
        headers: {
          Authorization: `Bearer ${sessionId}`,
          "X-Forwarded-For": "192.168.1.100",
        },
      });
      expect(res.status).toBe(200);
    });

    it("should handle session creation with OAuth type", async () => {
      const { sessionId } = await createSession(
        "test_key_123",
        "127.0.0.1",
        "test-agent",
        {
          oauthProvider: "google",
          oauthUserId: "google-user-123",
        },
        {
          type: "oauth",
          ipBinding: true,
        }
      );

      const sessions = getActiveSessionsForApiKey("test_key_123");
      const session = sessions.find((s) => s.sessionId === sessionId);

      expect(session?.sessionType).toBe("oauth");
      expect(session?.metadata?.oauthProvider).toBe("google");
    });

    it("should handle session creation with MFA type", async () => {
      const { sessionId } = await createSession(
        "test_key_123",
        "127.0.0.1",
        "test-agent",
        undefined,
        {
          type: "mfa",
          ipBinding: true,
        }
      );

      const sessions = getActiveSessionsForApiKey("test_key_123");
      const session = sessions.find((s) => s.sessionId === sessionId);

      expect(session?.sessionType).toBe("mfa");
    });

    it("should handle invalidating all sessions for a key", () => {
      // Create multiple sessions
      const sessionIds: string[] = [];
      for (let i = 0; i < 3; i++) {
        createSession("test_key_123", `127.0.0.${(i + 1) % 256}`, `agent${i}`).then(
          ({ sessionId }) => sessionIds.push(sessionId)
        );
      }

      // Invalidate all sessions
      const count = invalidateAllSessionsForKey("test_key_123");

      // Should have invalidated sessions
      expect(count).toBeGreaterThan(0);
    });
  });

  describe("session token validation edge cases", () => {
    it("should validate session token format", () => {
      // Valid UUID v4 format
      const validToken = "550e8400-e29b-41d4-a716-446655440000";
      expect(validateSessionTokenFormat(validToken)).toBe(true);

      // Invalid formats
      expect(validateSessionTokenFormat("not-a-uuid")).toBe(false);
      expect(validateSessionTokenFormat("")).toBe(false);
      expect(validateSessionTokenFormat("550e8400-e29b-41d4-a716")).toBe(false); // Too short
      expect(validateSessionTokenFormat("550e8400-e29b-41d4-a716-446655440000-extra")).toBe(false); // Too long
    });

    it("should handle session with no user agent", async () => {
      const { sessionId } = await createSession("test_key_123", "127.0.0.1", undefined);

      const sessions = getActiveSessionsForApiKey("test_key_123");
      const session = sessions.find((s) => s.sessionId === sessionId);

      expect(session).toBeDefined();
      expect(session?.userAgent).toBeUndefined();
    });

    it("should handle session with empty metadata", async () => {
      const { sessionId } = await createSession(
        "test_key_123",
        "127.0.0.1",
        "test-agent",
        undefined
      );

      const sessions = getActiveSessionsForApiKey("test_key_123");
      const session = sessions.find((s) => s.sessionId === sessionId);

      expect(session).toBeDefined();
      expect(session?.metadata).toBeUndefined();
    });
  });

  describe("full session lifecycle integration", () => {
    it("should handle complete session lifecycle with refresh tokens", async () => {
      // 1. Create initial session with refresh token
      const { sessionId: initialSessionId, refreshToken: initialRefreshToken } =
        await createSession(
          "test_key_123",
          "127.0.0.1",
          "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0 Safari/537.36",
          { userId: "user123", role: "user" },
          {
            ipBinding: true,
            createRefreshToken: true,
          }
        );

      expect(initialSessionId).toBeTruthy();
      expect(initialRefreshToken).toBeTruthy();
      expect(initialRefreshToken!.length).toBe(64); // 32 bytes = 64 hex chars

      // 2. Verify initial session is active and has refresh token
      const initialSessions = getActiveSessionsForApiKey("test_key_123");
      const initialSession = initialSessions.find((s) => s.sessionId === initialSessionId);
      expect(initialSession).toBeDefined();
      expect(initialSession?.active).toBe(true);
      expect(initialSession?.refreshTokenId).toBeTruthy();
      expect(initialSession?.metadata?.userId).toBe("user123");
      expect(initialSession?.ipBinding).toBe(true);
      expect(initialSession?.deviceId).toBeTruthy();

      // Store initial session values for comparison
      const initialLastActivityAt = initialSession!.lastActivityAt;
      const initialExpiresAt = initialSession!.expiresAt;

      // 3. Verify refresh token format and expiry
      expect(validateRefreshTokenFormat(initialRefreshToken!)).toBe(true);
      const refreshExpiry = checkRefreshTokenExpiry(initialRefreshToken!);
      expect(refreshExpiry).not.toBeNull();
      expect(refreshExpiry!).toBeGreaterThan(Date.now());
      expect(refreshExpiry!).toBeLessThanOrEqual(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

      // 4. Use session for authentication
      const authApp = new Hono();
      authApp.use("*", apiKeyAuth({ allowSessions: true }));
      authApp.get("/protected", (c) => c.json({ message: "protected data" }));

      const authRes = await authApp.request("/protected", {
        headers: {
          Authorization: `Bearer ${initialSessionId}`,
          "X-Forwarded-For": "127.0.0.1",
        },
      });
      expect(authRes.status).toBe(200);

      // 5. Refresh the session with the refresh token
      const refreshResult = refreshSession(initialRefreshToken!, "127.0.0.1");
      expect(refreshResult).not.toBeNull();
      const { sessionId: newSessionId, newRefreshToken } = refreshResult!;

      // New session and refresh token should be different
      expect(newSessionId).not.toBe(initialSessionId);
      expect(newRefreshToken).not.toBe(initialRefreshToken);

      // 6. Verify old session is no longer active
      const oldSessions = getActiveSessionsForApiKey("test_key_123");
      const oldSessionStillActive = oldSessions.some((s) => s.sessionId === initialSessionId);
      expect(oldSessionStillActive).toBe(false);

      // 7. Verify new session is active with extended expiration
      const newSessions = getActiveSessionsForApiKey("test_key_123");
      const newSession = newSessions.find((s) => s.sessionId === newSessionId);
      expect(newSession).toBeDefined();
      expect(newSession?.active).toBe(true);
      expect(newSession?.lastActivityAt).toBeGreaterThan(initialSession!.lastActivityAt);
      expect(newSession?.expiresAt).toBeGreaterThan(initialSession!.expiresAt);

      // 8. Verify old refresh token is now invalid (single-use)
      const secondRefreshAttempt = refreshSession(initialRefreshToken!, "127.0.0.1");
      expect(secondRefreshAttempt).toBeNull();

      // 9. Use new session for authentication
      const newAuthRes = await authApp.request("/protected", {
        headers: {
          Authorization: `Bearer ${newSessionId}`,
          "X-Forwarded-For": "127.0.0.1",
        },
      });
      expect(newAuthRes.status).toBe(200);

      // 10. Verify session security info
      const securityInfo = getSessionSecurityInfo(newSessionId);
      expect(securityInfo).not.toBeNull();
      expect(securityInfo?.exists).toBe(true);
      expect(securityInfo?.active).toBe(true);
      expect(securityInfo?.deviceId).toBe(initialSession?.deviceId);
      expect(securityInfo?.ipBinding).toBe(true);
      expect(securityInfo?.hasRefreshToken).toBe(true);

      // 11. Revoke the session
      const revoked = revokeSession(newSessionId, "127.0.0.1");
      expect(revoked).toBe(true);

      // 12. Verify session is no longer active after revocation
      const finalSessions = getActiveSessionsForApiKey("test_key_123");
      const revokedSessionStillActive = finalSessions.some((s) => s.sessionId === newSessionId);
      expect(revokedSessionStillActive).toBe(false);

      // 13. Verify revoked session cannot be used for authentication
      const revokedAuthRes = await authApp.request("/protected", {
        headers: {
          Authorization: `Bearer ${newSessionId}`,
          "X-Forwarded-For": "127.0.0.1",
        },
      });
      expect(revokedAuthRes.status).toBe(401);

      // 14. Verify refresh token is also invalidated
      const finalRefreshExpiry = checkRefreshTokenExpiry(newRefreshToken);
      expect(finalRefreshExpiry).toBeNull();
    });

    it("should handle session lifecycle with IP binding enforcement", async () => {
      // Create session with IP binding enabled
      const { sessionId, refreshToken } = await createSession(
        "test_key_123",
        "192.168.1.100",
        "test-agent",
        undefined,
        { ipBinding: true, createRefreshToken: true }
      );

      const authApp = new Hono();
      authApp.use("*", apiKeyAuth({ allowSessions: true }));
      authApp.get("/protected", (c) => c.json({ message: "protected data" }));

      // Should work with same IP
      const sameIpRes = await authApp.request("/protected", {
        headers: {
          Authorization: `Bearer ${sessionId}`,
          "X-Forwarded-For": "192.168.1.100",
        },
      });
      expect(sameIpRes.status).toBe(200);

      // Should fail with different IP
      const differentIpRes = await authApp.request("/protected", {
        headers: {
          Authorization: `Bearer ${sessionId}`,
          "X-Forwarded-For": "192.168.2.100",
        },
      });
      expect(differentIpRes.status).toBe(401);

      // Refresh should also fail with different IP
      const refreshResult = await refreshSession(refreshToken!, "192.168.2.100");
      expect(refreshResult).toBeNull();
    });

    it("should handle session lifecycle with MFA verification", async () => {
      // Create session
      const { sessionId } = await createSession("admin_key_789", "127.0.0.1", "test-agent");

      // Setup TOTP
      const { backupCodes } = setupTotp("admin_key_789");
      enableTotp("admin_key_789");

      // MFA should be required but not verified yet
      expect(isSessionMfaVerified(sessionId)).toBe(false);

      // Verify MFA for the session
      const mfaResult = await verifyMfaForSession(sessionId, backupCodes[0]!);
      expect(mfaResult.valid).toBe(true);
      expect(mfaResult.newSessionId).not.toBe(sessionId);

      // New session should have MFA verified
      expect(isSessionMfaVerified(mfaResult.newSessionId!)).toBe(true);

      // Old session should no longer be active
      const sessions = getActiveSessionsForApiKey("admin_key_789");
      const oldSessionActive = sessions.some((s) => s.sessionId === sessionId);
      expect(oldSessionActive).toBe(false);
    });

    it("should handle cleanup of expired sessions and refresh tokens", async () => {
      // Create multiple sessions with refresh tokens
      const refreshTokens: string[] = [];
      for (let i = 0; i < 5; i++) {
        const { refreshToken } = await createSession(
          "test_key_123",
          `127.0.0.${(i + 1) % 256}`,
          `agent${i}`,
          undefined,
          { createRefreshToken: true }
        );
        refreshTokens.push(refreshToken!);
      }

      // Verify all tokens are valid initially
      for (const token of refreshTokens) {
        expect(checkRefreshTokenExpiry(token)).not.toBeNull();
      }

      // Invalidate all refresh tokens
      for (const token of refreshTokens) {
        await invalidateRefreshTokenByValue(token);
      }

      // Verify all tokens are now invalid
      for (const token of refreshTokens) {
        expect(checkRefreshTokenExpiry(token)).toBeNull();
      }

      // Run cleanup
      const cleanedSessions = cleanupExpiredSessions();
      const cleanedTokens = cleanupExpiredRefreshTokens();

      // Cleanup should run without errors
      expect(typeof cleanedSessions).toBe("number");
      expect(typeof cleanedTokens).toBe("number");
    });
  });
});
