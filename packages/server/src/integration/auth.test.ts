/**
 * Integration tests for OAuth and MFA authentication endpoints.
 *
 * Tests cover:
 * - OAuth provider listing
 * - OAuth authorization flow initiation
 * - MFA setup and verification
 * - Session management (refresh, revoke)
 * - Authentication context retrieval
 */

import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import {
  type ApiKey,
  type ApiKeyScope,
  createSession,
  disableTotp,
  enableTotp,
  registerApiKey,
  setupTotp,
} from "../middleware/authentication.js";
import { cleanupExpiredStates, registerOAuthProvider } from "../oauth/index.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

let tempDir: string;

// Create temporary directory for static files
beforeEach(() => {
  tempDir = join(tmpdir(), `mta-test-${Date.now()}`);
  mkdirSync(tempDir, { recursive: true });
});

// Cleanup temporary directory after all tests
afterAll(() => {
  if (tempDir) {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
});

const TEST_STATIONS = {
  "101": {
    id: "101",
    name: "South Ferry",
    location: { lat: 40.702, lon: -74.013 },
    lines: ["1"],
    northStopId: "101N",
    southStopId: "101S",
    transfers: [],
    ada: true,
    borough: "manhattan",
  },
  "725": {
    id: "725",
    name: "Times Sq-42 St",
    location: { lat: 40.758, lon: -73.985 },
    lines: ["1", "2", "3", "7", "N", "Q", "R", "W", "S"],
    northStopId: "725N",
    southStopId: "725S",
    transfers: [],
    ada: true,
    borough: "manhattan",
    complex: "725-726",
  },
};

const TEST_ROUTES = {
  "1": {
    id: "1",
    shortName: "1",
    longName: "Broadway-7th Ave Local",
    color: "#EE352E",
    textColor: "#FFFFFF",
    feedId: "gtfs",
    division: "A",
    stops: ["101", "725"],
    isExpress: false,
  },
};

const TEST_COMPLEXES = {
  "725-726": {
    complexId: "725-726",
    name: "Times Sq-42 St / Port Authority",
    stations: ["725"],
    allLines: ["1", "2", "3", "7"],
    allStopIds: ["725N", "725S"],
  },
};

const TEST_TRANSFERS: Record<string, never[]> = {};

// ---------------------------------------------------------------------------
// Test helper functions
// ---------------------------------------------------------------------------

async function createTestApiKey(keyId: string, scope: ApiKeyScope = "read"): Promise<void> {
  const { hashApiKey } = await import("../middleware/authentication.js");
  const result = await hashApiKey("test_secret");

  const apiKey: ApiKey = {
    keyId,
    keyHash: result.hash,
    keySalt: result.salt,
    scope,
    owner: "test_user",
    rateLimitTier: 100,
    active: true,
    createdAt: Date.now(),
    expiresAt: 0,
    failedAttempts: 0,
  };

  await registerApiKey(apiKey);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("OAuth and MFA Authentication Integration", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    // Create fresh app for each test
    app = createApp(TEST_STATIONS, TEST_ROUTES, TEST_COMPLEXES, TEST_TRANSFERS, tempDir);

    // Clean up OAuth states
    cleanupExpiredStates();

    // Clean up TOTP configs
    disableTotp("test_key_123");
    disableTotp("admin_key_789");
  });

  describe("OAuth 2.0 endpoints", () => {
    beforeEach(() => {
      // Register a test OAuth provider
      registerOAuthProvider({
        providerId: "test_provider",
        displayName: "Test Provider",
        authorizationEndpoint: "https://example.com/oauth/authorize",
        tokenEndpoint: "https://example.com/oauth/token",
        userInfoEndpoint: "https://example.com/oauth/userinfo",
        clientId: "test_client_id",
        clientSecret: "test_client_secret",
        scope: ["openid", "profile", "email"],
        redirectUri: "https://myapp.com/oauth/callback",
        active: true,
      });
    });

    it("should list available OAuth providers", async () => {
      const res = await app.request("/api/auth/oauth/providers");

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.providers).toBeInstanceOf(Array);
      expect(json.providers.length).toBeGreaterThan(0);
      expect(json.providers[0]).toHaveProperty("providerId");
      expect(json.providers[0]).toHaveProperty("displayName");
      expect(json.providers[0]).not.toHaveProperty("clientSecret");
    });

    it("should initiate OAuth authorization flow", async () => {
      const res = await app.request(
        "/api/auth/oauth/authorize/test_provider?redirect_url=https://example.com/dashboard"
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toHaveProperty("authorizationUrl");
      expect(json).toHaveProperty("stateId");
      expect(json.authorizationUrl).toContain("https://example.com/oauth/authorize");
      expect(json.authorizationUrl).toContain("client_id=test_client_id");
      expect(json.authorizationUrl).toContain("response_type=code");
      expect(json.authorizationUrl).toContain("code_challenge=");
      expect(json.authorizationUrl).toContain("code_challenge_method=S256");
    });

    it("should return error for non-existent provider", async () => {
      const res = await app.request("/api/auth/oauth/authorize/non_existent");

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json).toHaveProperty("error");
    });

    it("should handle OAuth callback with error from provider", async () => {
      const res = await app.request(
        "/api/auth/oauth/callback/test_provider?error=access_denied&error_description=User%20denied%20access"
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe("access_denied");
      expect(json.errorDescription).toBe("User denied access");
    });

    it("should require state and code parameters in callback", async () => {
      const res = await app.request("/api/auth/oauth/callback/test_provider");

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("Missing required parameters");
    });

    it("should reject invalid state in callback", async () => {
      const res = await app.request(
        "/api/auth/oauth/callback/test_provider?state=invalid_state&code=test_code"
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe("Invalid or expired state");
    });
  });

  describe("MFA endpoints", () => {
    beforeEach(async () => {
      // Create test API keys
      await createTestApiKey("test_key_123", "read");
      await createTestApiKey("admin_key_789", "admin");
    });

    it("should return MFA status for authenticated user", async () => {
      const res = await app.request("/api/auth/mfa/status", {
        headers: {
          Authorization: "Bearer test_key_123:test_secret",
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toHaveProperty("enabled");
      expect(json).toHaveProperty("verified");
      expect(typeof json.enabled).toBe("boolean");
      expect(typeof json.verified).toBe("boolean");
    });

    it("should require authentication for MFA status", async () => {
      const res = await app.request("/api/auth/mfa/status");

      expect(res.status).toBe(401);
    });

    it("should initiate TOTP setup for admin users", async () => {
      const res = await app.request("/api/auth/mfa/setup", {
        method: "POST",
        headers: {
          Authorization: "Bearer admin_key_789:test_secret",
          "Content-Type": "application/json",
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toHaveProperty("secret");
      expect(json).toHaveProperty("backupCodes");
      expect(json).toHaveProperty("qrCodeUrl");
      expect(Array.isArray(json.backupCodes)).toBe(true);
      expect(json.backupCodes.length).toBe(10);
      expect(json.qrCodeUrl).toContain("otpauth://totp");
    });

    it("should reject TOTP setup for non-admin users", async () => {
      const res = await app.request("/api/auth/mfa/setup", {
        method: "POST",
        headers: {
          Authorization: "Bearer test_key_123:test_secret",
          "Content-Type": "application/json",
        },
      });

      expect(res.status).toBe(403);
    });

    it("should enable TOTP after verification", async () => {
      // First, setup TOTP
      const setupData = setupTotp("admin_key_789");
      const backupCode = setupData.backupCodes[0]!;

      const res = await app.request("/api/auth/mfa/enable", {
        method: "POST",
        headers: {
          Authorization: "Bearer admin_key_789:test_secret",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code: backupCode }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.message).toBe("MFA enabled successfully");
    });

    it("should reject invalid TOTP code during enable", async () => {
      setupTotp("admin_key_789");
      enableTotp("admin_key_789");

      const res = await app.request("/api/auth/mfa/enable", {
        method: "POST",
        headers: {
          Authorization: "Bearer admin_key_789:test_secret",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code: "000000" }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Invalid TOTP code");
    });

    it("should disable TOTP for admin users", async () => {
      // Setup and enable TOTP first
      setupTotp("admin_key_789");
      enableTotp("admin_key_789");

      const res = await app.request("/api/auth/mfa/disable", {
        method: "POST",
        headers: {
          Authorization: "Bearer admin_key_789:test_secret",
          "Content-Type": "application/json",
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.message).toBe("MFA disabled successfully");
    });

    it("should verify MFA code for a session", async () => {
      // Create a session
      const { sessionId } = await createSession("admin_key_789", "127.0.0.1", "test-agent");

      // Setup TOTP and get a backup code
      const setupData = setupTotp("admin_key_789");
      enableTotp("admin_key_789");
      const backupCode = setupData.backupCodes[0]!;

      const res = await app.request("/api/auth/mfa/verify", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionId}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code: backupCode }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.message).toBe("MFA verified successfully");
    });
  });

  describe("Session management endpoints", () => {
    beforeEach(async () => {
      await createTestApiKey("test_key_123", "read");
      await createTestApiKey("admin_key_789", "admin");
    });

    it("should return session info for authenticated user", async () => {
      const res = await app.request("/api/auth/session", {
        headers: {
          Authorization: "Bearer test_key_123:test_secret",
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.authenticated).toBe(true);
      expect(json.keyId).toBe("test_key_123");
      expect(json.scope).toBe("read");
      expect(json.authMethod).toBe("api_key");
    });

    it("should return unauthenticated for no credentials", async () => {
      const res = await app.request("/api/auth/session");

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.authenticated).toBe(false);
    });

    it("should refresh session with valid refresh token", async () => {
      // Create a session with refresh token
      const { refreshToken } = await createSession(
        "test_key_123",
        "127.0.0.1",
        "test-agent",
        undefined,
        { createRefreshToken: true }
      );

      expect(refreshToken).toBeTruthy();

      const res = await app.request("/api/auth/session/refresh", {
        method: "POST",
        headers: {
          Authorization: "Bearer test_key_123:test_secret",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refreshToken }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json).toHaveProperty("sessionId");
      expect(json).toHaveProperty("newRefreshToken");
    });

    it("should reject session refresh with invalid token", async () => {
      const res = await app.request("/api/auth/session/refresh", {
        method: "POST",
        headers: {
          Authorization: "Bearer test_key_123:test_secret",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refreshToken: "invalid_token" }),
      });

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe("Invalid or expired refresh token");
    });

    it("should revoke current session", async () => {
      // Create a session
      const { sessionId } = await createSession("test_key_123", "127.0.0.1", "test-agent");

      const res = await app.request("/api/auth/session/revoke", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionId}`,
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.message).toBe("Session revoked successfully");

      // Verify session cookie is cleared
      const setCookie = res.headers.get("Set-Cookie");
      expect(setCookie).toContain("Max-Age=0");
    });

    it("should return error when revoking non-existent session", async () => {
      const res = await app.request("/api/auth/session/revoke", {
        method: "POST",
        headers: {
          Authorization: "Bearer test_key_123:test_secret",
        },
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("No active session");
    });
  });

  describe("Authentication context", () => {
    it("should attach auth context for API key authentication", async () => {
      await createTestApiKey("test_key_123", "read");

      const res = await app.request("/api/auth/session", {
        headers: {
          Authorization: "Bearer test_key_123:test_secret",
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.authenticated).toBe(true);
      expect(json.keyId).toBe("test_key_123");
      expect(json.scope).toBe("read");
      expect(json.authMethod).toBe("api_key");
    });

    it("should not attach auth context for invalid credentials", async () => {
      await createTestApiKey("test_key_123", "read");

      const res = await app.request("/api/auth/session", {
        headers: {
          Authorization: "Bearer test_key_123:wrong_secret",
        },
      });

      expect(res.status).toBe(401);
    });

    it("should handle session-based authentication", async () => {
      await createTestApiKey("test_key_123", "read");
      const { sessionId } = await createSession("test_key_123", "127.0.0.1", "test-agent");

      const res = await app.request("/api/auth/session", {
        headers: {
          Authorization: `Bearer ${sessionId}`,
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.authenticated).toBe(true);
      expect(json.keyId).toBe("test_key_123");
      expect(json.authMethod).toBe("session");
    });
  });
});
