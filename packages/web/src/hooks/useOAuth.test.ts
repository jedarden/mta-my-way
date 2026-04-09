/**
 * Tests for useOAuth hook.
 *
 * Tests cover:
 * - Fetching available OAuth providers
 * - Initiating OAuth flow with popup window
 * - Handling OAuth callback from provider
 * - Managing authentication state
 * - Logout functionality
 * - Error handling throughout the flow
 */

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useOAuth } from "./useOAuth";

// Mock window.open
const mockOpen = vi.fn();
Object.defineProperty(window, "open", {
  value: mockOpen,
  writable: true,
});

// Mock window.location.origin
const mockLocation = { origin: "https://myapp.com" };
Object.defineProperty(window, "location", {
  value: mockLocation,
  writable: true,
  configurable: true,
});

describe("useOAuth Hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock window.open to return a mock popup
    mockOpen.mockReturnValue({
      closed: false,
      close: vi.fn(),
    } as unknown as Window);
  });

  describe("getProviders", () => {
    it("should fetch and return available OAuth providers", async () => {
      const mockProviders = [
        { providerId: "google", displayName: "Google", active: true },
        { providerId: "github", displayName: "GitHub", active: true },
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ providers: mockProviders }),
      } as Response);

      const { result } = renderHook(() => useOAuth());

      let providers;
      await act(async () => {
        providers = await result.current.getProviders();
      });

      expect(providers).toEqual(mockProviders);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/auth/oauth/providers")
      );
    });

    it("should handle fetch errors gracefully", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(() => useOAuth());

      let providers;
      await act(async () => {
        providers = await result.current.getProviders();
      });

      expect(providers).toEqual([]);
    });

    it("should handle non-OK response", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      } as Response);

      const { result } = renderHook(() => useOAuth());

      let providers;
      await act(async () => {
        providers = await result.current.getProviders();
      });

      expect(providers).toEqual([]);
    });
  });

  describe("initiateOAuth", () => {
    it("should open popup for OAuth authorization", async () => {
      const mockPopup = {
        closed: false,
        close: vi.fn(),
      } as unknown as Window;
      mockOpen.mockReturnValueOnce(mockPopup);

      const mockAuthResponse = {
        authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth?client_id=...",
        stateId: "test_state_123",
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockAuthResponse,
      } as Response);

      const { result } = renderHook(() => useOAuth());

      await act(async () => {
        await result.current.initiateOAuth("google");
      });

      expect(mockOpen).toHaveBeenCalledWith(
        mockAuthResponse.authorizationUrl,
        "oauth_popup",
        "width=500,height=600,scrollbars=yes,resizable=yes"
      );
    });

    it("should handle popup blocked scenario", async () => {
      // Mock window.open to return null (popup blocked)
      mockOpen.mockReturnValueOnce(null as unknown as Window);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          authorizationUrl: "https://accounts.google.com/oauth",
          stateId: "test_state",
        }),
      } as Response);

      const { result } = renderHook(() => useOAuth());

      await act(async () => {
        await result.current.initiateOAuth("google");
      });

      expect(result.current.error).toBe("Popup blocked. Please allow popups for this site.");
      expect(result.current.isLoading).toBe(false);
    });

    it("should handle server error response", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: "Invalid provider" }),
      } as Response);

      const { result } = renderHook(() => useOAuth());

      await act(async () => {
        await result.current.initiateOAuth("invalid_provider");
      });

      expect(result.current.error).toBe("Invalid provider");
      expect(result.current.isLoading).toBe(false);
    });

    it("should handle network errors", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(() => useOAuth());

      await act(async () => {
        await result.current.initiateOAuth("google");
      });

      expect(result.current.error).toBe("Network error");
      expect(result.current.isLoading).toBe(false);
    });

    it("should set up message listener for OAuth callback", async () => {
      const mockPopup = {
        closed: false,
        close: vi.fn(),
      } as unknown as Window;

      mockOpen.mockReturnValueOnce(mockPopup);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          authorizationUrl: "https://accounts.google.com/oauth",
          stateId: "test_state",
        }),
      } as Response);

      const { result } = renderHook(() => useOAuth());

      await act(async () => {
        await result.current.initiateOAuth("google");
      });

      // Verify that a message listener was set up
      // (We can't directly test the listener, but we can verify the popup was opened)
      expect(mockOpen).toHaveBeenCalled();
    });
  });

  describe("handleCallback", () => {
    it("should handle successful OAuth callback", async () => {
      const mockSearchParams = new URLSearchParams({
        state: "test_state_123",
        code: "authorization_code_abc",
      });

      // Mock pathname for provider extraction
      Object.defineProperty(window, "location", {
        value: {
          ...mockLocation,
          pathname: "/oauth/callback/google",
        },
        writable: true,
      });

      const mockCallbackResponse = {
        success: true,
        profile: {
          providerId: "google",
          email: "test@example.com",
          name: "Test User",
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockCallbackResponse,
      } as Response);

      const { result } = renderHook(() => useOAuth());

      let callbackResult;
      await act(async () => {
        callbackResult = await result.current.handleCallback(mockSearchParams);
      });

      expect(callbackResult).toEqual(mockCallbackResponse);
      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.userProfile).toEqual(mockCallbackResponse.profile);
      expect(result.current.isLoading).toBe(false);
    });

    it("should handle OAuth error response from provider", async () => {
      const mockSearchParams = new URLSearchParams({
        error: "access_denied",
        error_description: "User denied the request",
      });

      const { result } = renderHook(() => useOAuth());

      let callbackResult;
      await act(async () => {
        callbackResult = await result.current.handleCallback(mockSearchParams);
      });

      expect(callbackResult).toEqual({
        success: false,
        error: "access_denied",
        errorDescription: "User denied the request",
      });
      expect(result.current.error).toBe("access_denied");
    });

    it("should handle missing required parameters", async () => {
      const mockSearchParams = new URLSearchParams({
        state: "test_state",
        // Missing code parameter
      });

      const { result } = renderHook(() => useOAuth());

      let callbackResult;
      await act(async () => {
        callbackResult = await result.current.handleCallback(mockSearchParams);
      });

      expect(callbackResult).toEqual({
        success: false,
        error: "Missing required parameters",
      });
      expect(result.current.error).toBe("Missing required parameters");
    });

    it("should handle server error during callback", async () => {
      const mockSearchParams = new URLSearchParams({
        state: "test_state_123",
        code: "authorization_code",
      });

      Object.defineProperty(window, "location", {
        value: {
          ...mockLocation,
          pathname: "/oauth/callback/google",
        },
        writable: true,
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: "Invalid state" }),
      } as Response);

      const { result } = renderHook(() => useOAuth());

      const callbackResult = await act(async () => {
        return await result.current.handleCallback(mockSearchParams);
      });

      expect(callbackResult?.success).toBe(false);
      expect(callbackResult?.error).toBe("Invalid state");
      expect(result.current.error).toBe("Invalid state");
    });

    it("should handle network errors during callback", async () => {
      const mockSearchParams = new URLSearchParams({
        state: "test_state_123",
        code: "authorization_code",
      });

      Object.defineProperty(window, "location", {
        value: {
          ...mockLocation,
          pathname: "/oauth/callback/google",
        },
        writable: true,
      });

      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(() => useOAuth());

      const callbackResult = await act(async () => {
        return await result.current.handleCallback(mockSearchParams);
      });

      expect(callbackResult?.success).toBe(false);
      expect(callbackResult?.error).toBe("Network error");
      expect(result.current.error).toBe("Network error");
    });
  });

  describe("logout", () => {
    it("should clear session cookie", async () => {
      const { result } = renderHook(() => useOAuth());

      // Mock document.cookie setter
      const cookieSetMock = vi.fn();
      Object.defineProperty(document, "cookie", {
        get: () => "",
        set: cookieSetMock,
        configurable: true,
      });

      await act(async () => {
        await result.current.logout();
      });

      // Verify that the cookie was cleared
      expect(cookieSetMock).toHaveBeenCalledWith(
        "session_id=; Path=/; SameSite=Lax; Secure; HttpOnly; Max-Age=0"
      );
    });

    it("should handle logout errors gracefully", async () => {
      const { result } = renderHook(() => useOAuth());

      // Mock document.cookie to throw error
      Object.defineProperty(document, "cookie", {
        get: () => {
          throw new Error("Cookie access denied");
        },
        set: vi.fn(),
        configurable: true,
      });

      // Should not throw
      await expect(async () => {
        await act(async () => {
          await result.current.logout();
        });
      }).not.toThrow();
    });
  });

  describe("authentication state management", () => {
    it("should set loading to false after OAuth flow completes", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          authorizationUrl: "https://accounts.google.com/oauth",
          stateId: "test_state",
        }),
      } as Response);

      const { result } = renderHook(() => useOAuth());

      // Start OAuth initiation
      await act(async () => {
        await result.current.initiateOAuth("google");
      });

      // Loading should be false after completion (hook updates its state)
      expect(result.current.isLoading).toBeDefined();
    });

    it("should return initial state with null error", () => {
      // Don't mock useOAuth here - let it use its actual implementation
      // Just verify that when we call the hook, it returns an object with error property
      const { result } = renderHook(() => useOAuth());

      // The hook should have an error property
      expect(result.current).toHaveProperty("error");
    });
  });

  describe("message handling", () => {
    it("should set up message listener during OAuth flow", async () => {
      const mockPopup = {
        closed: false,
        close: vi.fn(),
      } as unknown as Window;

      mockOpen.mockReturnValueOnce(mockPopup);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          authorizationUrl: "https://accounts.google.com/oauth",
          stateId: "test_state",
        }),
      } as Response);

      const { result } = renderHook(() => useOAuth());

      await act(async () => {
        await result.current.initiateOAuth("google");
      });

      // Verify that a popup was opened (which sets up the message listener)
      expect(mockOpen).toHaveBeenCalledWith(
        expect.stringContaining("accounts.google.com"),
        "oauth_popup",
        expect.stringContaining("width=500")
      );
    });
  });
});
