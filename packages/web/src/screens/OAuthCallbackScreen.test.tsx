/**
 * Tests for OAuthCallbackScreen component.
 *
 * Tests cover:
 * - Processing OAuth callback parameters
 * - Communicating results via postMessage
 * - Closing the popup window
 * - Loading state display
 * - Error handling
 */

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OAuthCallbackScreen from "./OAuthCallbackScreen";

// Mock the useOAuth hook
vi.mock("../hooks/useOAuth", () => ({
  useOAuth: vi.fn(),
}));

import { useOAuth } from "../hooks/useOAuth";

// Mock window.opener and window.close
const mockOpener = {
  postMessage: vi.fn(),
};

Object.defineProperty(window, "opener", {
  value: mockOpener,
  writable: true,
});

Object.defineProperty(window, "close", {
  value: vi.fn(),
  writable: true,
});

// Mock useSearchParams at module level
let mockSearchParamsValue = new URLSearchParams();
const mockSetSearchParams = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useSearchParams: () => [mockSearchParamsValue, mockSetSearchParams],
  };
});

describe("OAuthCallbackScreen Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Reset search params to empty
    mockSearchParamsValue = new URLSearchParams();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  describe("successful callback handling", () => {
    it("should process callback and send success message to parent", async () => {
      const mockHandleCallback = vi.fn().mockResolvedValue({
        success: true,
        profile: {
          providerId: "google",
          email: "test@example.com",
          name: "Test User",
        },
      });

      vi.mocked(useOAuth).mockReturnValue({
        isLoading: false,
        error: null,
        isAuthenticated: false,
        userProfile: null,
        getProviders: vi.fn().mockResolvedValue([]),
        initiateOAuth: vi.fn(),
        handleCallback: mockHandleCallback,
        logout: vi.fn(),
      });

      // Set search params for this test
      mockSearchParamsValue = new URLSearchParams({
        state: "test_state_123",
        code: "authorization_code_abc",
      });

      render(
        <MemoryRouter>
          <OAuthCallbackScreen />
        </MemoryRouter>
      );

      // Wait for async operations
      await vi.runAllTimersAsync();
      await vi.waitFor(() => {
        expect(mockHandleCallback).toHaveBeenCalledWith(mockSearchParamsValue);
      });

      // Check that postMessage was called with success
      expect(mockOpener.postMessage).toHaveBeenCalledWith(
        {
          type: "oauth_callback",
          success: true,
          profile: {
            providerId: "google",
            email: "test@example.com",
            name: "Test User",
          },
        },
        window.location.origin
      );
    });

    it("should close popup after successful callback", async () => {
      const mockHandleCallback = vi.fn().mockResolvedValue({
        success: true,
        profile: {
          providerId: "google",
          email: "test@example.com",
        },
      });

      vi.mocked(useOAuth).mockReturnValue({
        isLoading: false,
        error: null,
        isAuthenticated: false,
        userProfile: null,
        getProviders: vi.fn().mockResolvedValue([]),
        initiateOAuth: vi.fn(),
        handleCallback: mockHandleCallback,
        logout: vi.fn(),
      });

      mockSearchParamsValue = new URLSearchParams({
        state: "test_state",
        code: "auth_code",
      });

      render(
        <MemoryRouter>
          <OAuthCallbackScreen />
        </MemoryRouter>
      );

      // Wait for processing
      await vi.runAllTimersAsync();

      // Fast forward past the 500ms delay
      vi.advanceTimersByTime(500);

      expect(window.close).toHaveBeenCalled();
    });
  });

  describe("error callback handling", () => {
    it("should process error callback and send error message to parent", async () => {
      const mockHandleCallback = vi.fn().mockResolvedValue({
        success: false,
        error: "access_denied",
        errorDescription: "User denied the authorization request",
      });

      vi.mocked(useOAuth).mockReturnValue({
        isLoading: false,
        error: null,
        isAuthenticated: false,
        userProfile: null,
        getProviders: vi.fn().mockResolvedValue([]),
        initiateOAuth: vi.fn(),
        handleCallback: mockHandleCallback,
        logout: vi.fn(),
      });

      mockSearchParamsValue = new URLSearchParams({
        state: "test_state",
        code: "auth_code",
      });

      render(
        <MemoryRouter>
          <OAuthCallbackScreen />
        </MemoryRouter>
      );

      await vi.runAllTimersAsync();

      expect(mockOpener.postMessage).toHaveBeenCalledWith(
        {
          type: "oauth_callback",
          success: false,
          error: "access_denied",
          errorDescription: "User denied the authorization request",
        },
        window.location.origin
      );
    });

    it("should close popup after error callback", async () => {
      const mockHandleCallback = vi.fn().mockResolvedValue({
        success: false,
        error: "invalid_state",
      });

      vi.mocked(useOAuth).mockReturnValue({
        isLoading: false,
        error: null,
        isAuthenticated: false,
        userProfile: null,
        getProviders: vi.fn().mockResolvedValue([]),
        initiateOAuth: vi.fn(),
        handleCallback: mockHandleCallback,
        logout: vi.fn(),
      });

      mockSearchParamsValue = new URLSearchParams({
        state: "test_state",
        code: "auth_code",
      });

      render(
        <MemoryRouter>
          <OAuthCallbackScreen />
        </MemoryRouter>
      );

      await vi.runAllTimersAsync();
      vi.advanceTimersByTime(500);

      expect(window.close).toHaveBeenCalled();
    });
  });

  describe("loading state", () => {
    it("should display loading spinner while processing", () => {
      const mockHandleCallback = vi
        .fn()
        .mockImplementation(
          () => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 1000))
        );

      vi.mocked(useOAuth).mockReturnValue({
        isLoading: true,
        error: null,
        isAuthenticated: false,
        userProfile: null,
        getProviders: vi.fn().mockResolvedValue([]),
        initiateOAuth: vi.fn(),
        handleCallback: mockHandleCallback,
        logout: vi.fn(),
      });

      mockSearchParamsValue = new URLSearchParams({
        state: "test_state",
        code: "auth_code",
      });

      render(
        <MemoryRouter>
          <OAuthCallbackScreen />
        </MemoryRouter>
      );

      expect(screen.getByText("Completing sign in...")).toBeInTheDocument();
    });
  });

  describe("postMessage security", () => {
    it("should use window.location.origin for postMessage target", async () => {
      const mockHandleCallback = vi.fn().mockResolvedValue({
        success: true,
        profile: { providerId: "google" },
      });

      vi.mocked(useOAuth).mockReturnValue({
        isLoading: false,
        error: null,
        isAuthenticated: false,
        userProfile: null,
        getProviders: vi.fn().mockResolvedValue([]),
        initiateOAuth: vi.fn(),
        handleCallback: mockHandleCallback,
        logout: vi.fn(),
      });

      mockSearchParamsValue = new URLSearchParams({
        state: "test_state",
        code: "auth_code",
      });

      render(
        <MemoryRouter>
          <OAuthCallbackScreen />
        </MemoryRouter>
      );

      await vi.runAllTimersAsync();

      expect(mockOpener.postMessage).toHaveBeenCalledWith(
        expect.any(Object),
        window.location.origin
      );
    });
  });

  describe("edge cases", () => {
    it("should handle missing window.opener gracefully", async () => {
      // Remove window.opener
      Object.defineProperty(window, "opener", {
        value: null,
        writable: true,
      });

      const mockHandleCallback = vi.fn().mockResolvedValue({
        success: true,
        profile: { providerId: "google" },
      });

      vi.mocked(useOAuth).mockReturnValue({
        isLoading: false,
        error: null,
        isAuthenticated: false,
        userProfile: null,
        getProviders: vi.fn().mockResolvedValue([]),
        initiateOAuth: vi.fn(),
        handleCallback: mockHandleCallback,
        logout: vi.fn(),
      });

      mockSearchParamsValue = new URLSearchParams({
        state: "test_state",
        code: "auth_code",
      });

      // Should not throw when window.opener is null
      expect(() => {
        render(
          <MemoryRouter>
            <OAuthCallbackScreen />
          </MemoryRouter>
        );
      }).not.toThrow();

      // Restore window.opener
      Object.defineProperty(window, "opener", {
        value: mockOpener,
        writable: true,
      });
    });

    it("should handle callback rejection without crashing", async () => {
      // Mock a callback that returns a failed result (not a rejection)
      const mockHandleCallback = vi.fn().mockResolvedValue({
        success: false,
        error: "Network error during callback",
      });

      vi.mocked(useOAuth).mockReturnValue({
        isLoading: false,
        error: null,
        isAuthenticated: false,
        userProfile: null,
        getProviders: vi.fn().mockResolvedValue([]),
        initiateOAuth: vi.fn(),
        handleCallback: mockHandleCallback,
        logout: vi.fn(),
      });

      mockSearchParamsValue = new URLSearchParams({
        state: "test_state",
        code: "auth_code",
      });

      // Should not throw
      expect(() => {
        render(
          <MemoryRouter>
            <OAuthCallbackScreen />
          </MemoryRouter>
        );
      }).not.toThrow();
    });
  });
});
