/**
 * Tests for OAuth 2.0 service.
 *
 * Tests cover:
 * - Provider registration and management
 * - PKCE flow (code verifier/challenge generation)
 * - Authorization URL generation
 * - Token exchange
 * - User profile fetching and normalization
 * - Session creation from OAuth
 * - State management and cleanup
 * - Default provider initialization
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type OAuthUserProfile,
  cleanupExpiredStates,
  createAuthorizationUrl,
  createOAuthSession,
  getActiveOAuthProviders,
  getOAuthProvider,
  handleOAuthCallback,
  initializeDefaultProviders,
  registerOAuthProvider,
  unregisterOAuthProvider,
} from "./oauth-service.js";

describe("OAuth Service", () => {
  const mockProvider = {
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
  };

  beforeEach(() => {
    // Clear any registered providers before each test
    unregisterOAuthProvider("test_provider");
    unregisterOAuthProvider("google");
    unregisterOAuthProvider("github");
  });

  describe("provider registration", () => {
    it("should register an OAuth provider", () => {
      registerOAuthProvider(mockProvider);

      const provider = getOAuthProvider("test_provider");
      expect(provider).toBeDefined();
      expect(provider?.providerId).toBe("test_provider");
      expect(provider?.displayName).toBe("Test Provider");
    });

    it("should return active providers only", () => {
      registerOAuthProvider(mockProvider);

      const inactiveProvider = {
        ...mockProvider,
        providerId: "inactive_provider",
        active: false,
      };
      registerOAuthProvider(inactiveProvider);

      const activeProviders = getActiveOAuthProviders();
      expect(activeProviders.length).toBe(1);
      expect(activeProviders[0]?.providerId).toBe("test_provider");
    });

    it("should unregister a provider", () => {
      registerOAuthProvider(mockProvider);
      expect(getOAuthProvider("test_provider")).toBeDefined();

      const result = unregisterOAuthProvider("test_provider");
      expect(result).toBe(true);

      expect(getOAuthProvider("test_provider")).toBeUndefined();
    });

    it("should return false when unregistering non-existent provider", () => {
      const result = unregisterOAuthProvider("non_existent");
      expect(result).toBe(false);
    });
  });

  describe("PKCE flow", () => {
    it("should generate authorization URL with PKCE parameters", async () => {
      registerOAuthProvider(mockProvider);

      const result = await createAuthorizationUrl("test_provider", "https://myapp.com/dashboard");

      expect("error" in result).toBe(false);
      if ("url" in result) {
        expect(result.url).toContain("https://example.com/oauth/authorize");
        expect(result.url).toContain("client_id=test_client_id");
        expect(result.url).toContain("response_type=code");
        expect(result.url).toContain("scope=openid");
        expect(result.url).toContain("code_challenge=");
        expect(result.url).toContain("code_challenge_method=S256");
        expect(result.url).toContain("state=");
        expect(result.stateId).toBeTruthy();
      }
    });

    it("should return error for non-existent provider", async () => {
      const result = await createAuthorizationUrl("non_existent");

      expect("error" in result).toBe(true);
      if ("error" in result) {
        expect(result.error).toBe("Provider not found");
      }
    });

    it("should return error for inactive provider", async () => {
      const inactiveProvider = { ...mockProvider, active: false };
      registerOAuthProvider(inactiveProvider);

      const result = await createAuthorizationUrl("test_provider");

      expect("error" in result).toBe(true);
      if ("error" in result) {
        expect(result.error).toBe("Provider is not active");
      }
    });
  });

  describe("OAuth callback handling", () => {
    it("should handle successful OAuth callback", async () => {
      registerOAuthProvider(mockProvider);

      // First, create an authorization to get a valid state
      const authResult = await createAuthorizationUrl("test_provider");
      expect("error" in authResult).toBe(false);

      const stateId = "url" in authResult ? authResult.stateId : "";

      // Mock fetch for token exchange
      global.fetch = vi
        .fn()
        .mockImplementationOnce(() =>
          Promise.resolve({
            ok: true,
            json: async () => ({
              access_token: "test_access_token",
              token_type: "Bearer",
              expires_in: 3600,
            }),
          } as Response)
        )
        .mockImplementationOnce(() =>
          Promise.resolve({
            ok: true,
            json: async () => ({
              sub: "user123",
              email: "test@example.com",
              name: "Test User",
              picture: "https://example.com/avatar.jpg",
            }),
          } as Response)
        );

      const createSessionFn = vi.fn().mockResolvedValue({
        sessionId: "test_session_id",
        csrfToken: "test_csrf_token",
      });

      const result = await handleOAuthCallback(
        stateId,
        "mock_authorization_code",
        "127.0.0.1",
        "test-agent",
        createSessionFn
      );

      expect(result.success).toBe(true);
      expect(result.profile).toBeDefined();
      expect(result.profile?.providerId).toBe("test_provider");
      expect(result.sessionId).toBe("test_session_id");

      expect(createSessionFn).toHaveBeenCalledWith(
        "test_provider_user123",
        "127.0.0.1",
        "test-agent",
        expect.objectContaining({
          oauthProvider: "test_provider",
          oauthUserId: "user123",
        })
      );
    });

    it("should handle OAuth callback with provider error", async () => {
      registerOAuthProvider(mockProvider);

      const authResult = await createAuthorizationUrl("test_provider");
      expect("error" in authResult).toBe(false);
      const stateId = "url" in authResult ? authResult.stateId : "";

      // Mock fetch to return error
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        text: async () => "invalid_client",
      } as Response);

      const result = await handleOAuthCallback(stateId, "invalid_code", "127.0.0.1", "test-agent");

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should handle callback with invalid state", async () => {
      registerOAuthProvider(mockProvider);

      const result = await handleOAuthCallback("invalid_state_id", "mock_code", "127.0.0.1");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid or expired state");
    });
  });

  describe("session creation", () => {
    it("should create session from OAuth profile", async () => {
      const profile: OAuthUserProfile = {
        providerId: "test_provider",
        providerUserId: "user123",
        email: "test@example.com",
        name: "Test User",
      };

      const createSessionFn = vi.fn().mockResolvedValue({
        sessionId: "new_session_id",
        csrfToken: "new_csrf_token",
      });

      const result = await createOAuthSession(profile, "127.0.0.1", "test-agent", createSessionFn);

      expect("error" in result).toBe(false);
      if ("sessionId" in result) {
        expect(result.sessionId).toBe("new_session_id");
        expect(createSessionFn).toHaveBeenCalledWith(
          "test_provider_user123",
          "127.0.0.1",
          "test-agent",
          expect.objectContaining({
            oauthProvider: "test_provider",
            oauthUserId: "user123",
          })
        );
      }
    });

    it("should fallback to mock session when no createSessionFn provided", async () => {
      const profile: OAuthUserProfile = {
        providerId: "test_provider",
        providerUserId: "user123",
        email: "test@example.com",
      };

      const result = await createOAuthSession(profile, "127.0.0.1", "test-agent");

      expect("error" in result).toBe(false);
      if ("sessionId" in result) {
        expect(result.sessionId).toContain("oauth_test_provider_user123_");
        expect(result.csrfToken).toBeTruthy();
      }
    });
  });

  describe("state management", () => {
    it("should clean up expired states", () => {
      registerOAuthProvider(mockProvider);

      // Create multiple authorization URLs (creates states)
      const promises = Array.from({ length: 5 }, () => createAuthorizationUrl("test_provider"));

      Promise.all(promises).then(() => {
        const cleanedCount = cleanupExpiredStates();
        // No states should be expired yet (they have 10 minute TTL)
        expect(cleanedCount).toBe(0);
      });
    });
  });

  describe("default provider initialization", () => {
    it("should log warning when no OAuth providers configured", () => {
      // Ensure no env vars are set
      delete process.env.GOOGLE_OAUTH_CLIENT_ID;
      delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
      delete process.env.GITHUB_OAUTH_CLIENT_ID;
      delete process.env.GITHUB_OAUTH_CLIENT_SECRET;

      // The function should complete without throwing
      expect(() => initializeDefaultProviders()).not.toThrow();
    });
  });

  describe("error handling", () => {
    it("should handle network errors during token exchange", async () => {
      registerOAuthProvider(mockProvider);

      const authResult = await createAuthorizationUrl("test_provider");
      expect("error" in authResult).toBe(false);
      const stateId = "url" in authResult ? authResult.stateId : "";

      // Mock fetch to throw network error
      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

      const result = await handleOAuthCallback(stateId, "mock_code", "127.0.0.1", "test-agent");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Network error");
    });

    it("should handle malformed user info response", async () => {
      registerOAuthProvider(mockProvider);

      const authResult = await createAuthorizationUrl("test_provider");
      expect("error" in authResult).toBe(false);
      const stateId = "url" in authResult ? authResult.stateId : "";

      // Mock successful token exchange but failed user info fetch
      global.fetch = vi
        .fn()
        .mockImplementationOnce(() =>
          Promise.resolve({
            ok: true,
            json: async () => ({
              access_token: "test_access_token",
              token_type: "Bearer",
            }),
          } as Response)
        )
        .mockImplementationOnce(() =>
          Promise.resolve({
            ok: false,
            text: async () => "Not found",
          } as Response)
        );

      const result = await handleOAuthCallback(stateId, "mock_code", "127.0.0.1", "test-agent");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Failed to fetch user profile");
    });
  });
});
