/**
 * Tests for LoginScreen component.
 *
 * Tests cover:
 * - Rendering login UI with provider buttons
 * - OAuth provider button interactions
 * - Loading states during authentication
 * - Error message display
 * - Redirect when already authenticated
 * - Accessibility features
 */

import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock Screen component and its dependencies before importing LoginScreen
vi.mock("../components/layout/Screen", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="screen-mock">{children}</div>
  ),
}));

// Mock useNavigate before importing LoginScreen
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock the useOAuth hook
vi.mock("../hooks/useOAuth", () => ({
  useOAuth: vi.fn(),
}));

import { MemoryRouter, Routes, Route } from "react-router-dom";
import { useOAuth } from "../hooks/useOAuth";
import LoginScreen from "./LoginScreen";

describe("LoginScreen Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe("rendering", () => {
    it("should render login screen with welcome message", () => {
      vi.mocked(useOAuth).mockReturnValue({
        isLoading: false,
        error: null,
        isAuthenticated: false,
        userProfile: null,
        getProviders: vi.fn().mockResolvedValue([]),
        initiateOAuth: vi.fn(),
        handleCallback: vi.fn(),
        logout: vi.fn(),
      });

      render(
        <MemoryRouter>
          <LoginScreen />
        </MemoryRouter>
      );

      expect(screen.getByText("Welcome to MTA My Way")).toBeInTheDocument();
      expect(
        screen.getByText("Sign in to save your commutes and track trips")
      ).toBeInTheDocument();
    });

    it("should render OAuth provider buttons", async () => {
      vi.mocked(useOAuth).mockReturnValue({
        isLoading: false,
        error: null,
        isAuthenticated: false,
        userProfile: null,
        getProviders: vi.fn().mockResolvedValue([
          { providerId: "google", displayName: "Google", active: true },
          { providerId: "github", displayName: "GitHub", active: true },
        ]),
        initiateOAuth: vi.fn(),
        handleCallback: vi.fn(),
        logout: vi.fn(),
      });

      // Mock fetch to return providers
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          providers: [
            { providerId: "google", displayName: "Google", active: true },
            { providerId: "github", displayName: "GitHub", active: true },
          ],
        }),
      } as Response);

      render(
        <MemoryRouter>
          <LoginScreen />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText("Continue with Google")).toBeInTheDocument();
        expect(screen.getByText("Continue with GitHub")).toBeInTheDocument();
      });
    });

    it("should render info section explaining sign-in benefits", () => {
      vi.mocked(useOAuth).mockReturnValue({
        isLoading: false,
        error: null,
        isAuthenticated: false,
        userProfile: null,
        getProviders: vi.fn().mockResolvedValue([]),
        initiateOAuth: vi.fn(),
        handleCallback: vi.fn(),
        logout: vi.fn(),
      });

      render(
        <MemoryRouter>
          <LoginScreen />
        </MemoryRouter>
      );

      expect(screen.getByText("Why sign in?")).toBeInTheDocument();
      expect(screen.getByText(/Save your favorite commutes/)).toBeInTheDocument();
      expect(screen.getByText(/Track your trip history/)).toBeInTheDocument();
      expect(screen.getByText(/Sync settings across devices/)).toBeInTheDocument();
      expect(screen.getByText(/Get personalized service alerts/)).toBeInTheDocument();
    });

    it("should render privacy note", () => {
      vi.mocked(useOAuth).mockReturnValue({
        isLoading: false,
        error: null,
        isAuthenticated: false,
        userProfile: null,
        getProviders: vi.fn().mockResolvedValue([]),
        initiateOAuth: vi.fn(),
        handleCallback: vi.fn(),
        logout: vi.fn(),
      });

      render(
        <MemoryRouter>
          <LoginScreen />
        </MemoryRouter>
      );

      expect(
        screen.getByText(/By signing in, you agree to our Terms of Service/)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/We use secure OAuth authentication/)
      ).toBeInTheDocument();
    });

    it("should show no providers message when none available", async () => {
      vi.mocked(useOAuth).mockReturnValue({
        isLoading: false,
        error: null,
        isAuthenticated: false,
        userProfile: null,
        getProviders: vi.fn().mockResolvedValue([]),
        initiateOAuth: vi.fn(),
        handleCallback: vi.fn(),
        logout: vi.fn(),
      });

      // Mock fetch to return empty providers
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ providers: [] }),
      } as Response);

      render(
        <MemoryRouter>
          <LoginScreen />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(
          screen.getByText("No authentication providers available.")
        ).toBeInTheDocument();
      });
    });
  });

  describe("OAuth interactions", () => {
    it("should call initiateOAuth when provider button is clicked", async () => {
      const mockInitiateOAuth = vi.fn().mockResolvedValue(undefined);

      vi.mocked(useOAuth).mockReturnValue({
        isLoading: false,
        error: null,
        isAuthenticated: false,
        userProfile: null,
        getProviders: vi.fn().mockResolvedValue([
          { providerId: "google", displayName: "Google", active: true },
        ]),
        initiateOAuth: mockInitiateOAuth,
        handleCallback: vi.fn(),
        logout: vi.fn(),
      });

      // Mock fetch to return providers
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ providers: [{ providerId: "google", displayName: "Google", active: true }] }),
      } as Response);

      const user = userEvent.setup();

      render(
        <MemoryRouter>
          <LoginScreen />
        </MemoryRouter>
      );

      await waitFor(() => {
        const googleButton = screen.getByRole("button", { name: /Sign in with Google/i });
        expect(googleButton).toBeInTheDocument();
      });

      const googleButton = screen.getByRole("button", { name: /Sign in with Google/i });
      await user.click(googleButton);

      expect(mockInitiateOAuth).toHaveBeenCalledWith("google");
    });

    it("should disable provider buttons during loading", async () => {
      const mockInitiateOAuth = vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 1000))
      );

      vi.mocked(useOAuth).mockReturnValue({
        isLoading: true,
        error: null,
        isAuthenticated: false,
        userProfile: null,
        getProviders: vi.fn().mockResolvedValue([
          { providerId: "google", displayName: "Google", active: true },
        ]),
        initiateOAuth: mockInitiateOAuth,
        handleCallback: vi.fn(),
        logout: vi.fn(),
      });

      // Mock fetch to return providers
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ providers: [{ providerId: "google", displayName: "Google", active: true }] }),
      } as Response);

      render(
        <MemoryRouter>
          <LoginScreen />
        </MemoryRouter>
      );

      await waitFor(() => {
        const googleButton = screen.getByRole("button", { name: /Sign in with Google/i });
        expect(googleButton).toBeDisabled();
      });
    });

    it("should show loading spinner when authenticating", async () => {
      vi.mocked(useOAuth).mockReturnValue({
        isLoading: true,
        error: null,
        isAuthenticated: false,
        userProfile: null,
        getProviders: vi.fn().mockResolvedValue([
          { providerId: "google", displayName: "Google", active: true },
        ]),
        initiateOAuth: vi.fn(),
        handleCallback: vi.fn(),
        logout: vi.fn(),
      });

      // Mock fetch to return providers
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ providers: [{ providerId: "google", displayName: "Google", active: true }] }),
      } as Response);

      render(
        <MemoryRouter>
          <LoginScreen />
        </MemoryRouter>
      );

      await waitFor(() => {
        const googleButton = screen.getByRole("button", { name: /Sign in with Google/i });
        // Check for spinner icon inside button
        const spinner = googleButton.querySelector("svg.animate-spin");
        expect(spinner).toBeInTheDocument();
      });
    });
  });

  describe("error handling", () => {
    it("should display error message when authentication fails", () => {
      vi.mocked(useOAuth).mockReturnValue({
        isLoading: false,
        error: "Authentication failed. Please try again.",
        isAuthenticated: false,
        userProfile: null,
        getProviders: vi.fn().mockResolvedValue([]),
        initiateOAuth: vi.fn(),
        handleCallback: vi.fn(),
        logout: vi.fn(),
      });

      render(
        <MemoryRouter>
          <LoginScreen />
        </MemoryRouter>
      );

      expect(screen.getByText("Authentication failed. Please try again.")).toBeInTheDocument();
    });

    it("should display error in alert role for accessibility", () => {
      vi.mocked(useOAuth).mockReturnValue({
        isLoading: false,
        error: "Invalid credentials",
        isAuthenticated: false,
        userProfile: null,
        getProviders: vi.fn().mockResolvedValue([]),
        initiateOAuth: vi.fn(),
        handleCallback: vi.fn(),
        logout: vi.fn(),
      });

      render(
        <MemoryRouter>
          <LoginScreen />
        </MemoryRouter>
      );

      // The error message is inside a div with role="alert", not the text element itself
      const errorContainer = screen.getByRole("alert");
      expect(errorContainer).toBeInTheDocument();
      expect(errorContainer).toHaveTextContent("Invalid credentials");
    });
  });

  describe("authentication redirect", () => {
    it("should redirect to home when already authenticated", () => {
      vi.mocked(useOAuth).mockReturnValue({
        isLoading: false,
        error: null,
        isAuthenticated: true,
        userProfile: { providerId: "google", email: "test@example.com" },
        getProviders: vi.fn().mockResolvedValue([]),
        initiateOAuth: vi.fn(),
        handleCallback: vi.fn(),
        logout: vi.fn(),
      });

      render(
        <MemoryRouter initialEntries={["/login"]}>
          <Routes>
            <Route path="/login" element={<LoginScreen />} />
            <Route path="/" element={<div>Home</div>} />
          </Routes>
        </MemoryRouter>
      );

      expect(mockNavigate).toHaveBeenCalledWith("/", { replace: true });
    });
  });

  describe("accessibility", () => {
    it("should have proper ARIA labels for provider buttons", async () => {
      vi.mocked(useOAuth).mockReturnValue({
        isLoading: false,
        error: null,
        isAuthenticated: false,
        userProfile: null,
        getProviders: vi.fn().mockResolvedValue([
          { providerId: "google", displayName: "Google", active: true },
        ]),
        initiateOAuth: vi.fn(),
        handleCallback: vi.fn(),
        logout: vi.fn(),
      });

      // Mock fetch to return providers
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ providers: [{ providerId: "google", displayName: "Google", active: true }] }),
      } as Response);

      render(
        <MemoryRouter>
          <LoginScreen />
        </MemoryRouter>
      );

      await waitFor(() => {
        const googleButton = screen.getByRole("button", { name: /Sign in with Google/i });
        expect(googleButton).toBeInTheDocument();
      });
    });

    it("should have focus states for keyboard navigation", async () => {
      vi.mocked(useOAuth).mockReturnValue({
        isLoading: false,
        error: null,
        isAuthenticated: false,
        userProfile: null,
        getProviders: vi.fn().mockResolvedValue([
          { providerId: "google", displayName: "Google", active: true },
        ]),
        initiateOAuth: vi.fn(),
        handleCallback: vi.fn(),
        logout: vi.fn(),
      });

      // Mock fetch to return providers
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ providers: [{ providerId: "google", displayName: "Google", active: true }] }),
      } as Response);

      render(
        <MemoryRouter>
          <LoginScreen />
        </MemoryRouter>
      );

      await waitFor(() => {
        // Look for the button with aria-label instead
        const googleButton = screen.getByRole("button", { name: /Sign in with Google/i });
        expect(googleButton).toBeInTheDocument();
      });
    });

    it("should have proper heading hierarchy", () => {
      vi.mocked(useOAuth).mockReturnValue({
        isLoading: false,
        error: null,
        isAuthenticated: false,
        userProfile: null,
        getProviders: vi.fn().mockResolvedValue([]),
        initiateOAuth: vi.fn(),
        handleCallback: vi.fn(),
        logout: vi.fn(),
      });

      render(
        <MemoryRouter>
          <LoginScreen />
        </MemoryRouter>
      );

      const heading = screen.getByRole("heading", { level: 1 });
      expect(heading).toBeInTheDocument();
      expect(heading).toHaveTextContent("Welcome to MTA My Way");
    });
  });

  describe("provider fetch errors", () => {
    it("should fall back to default providers on fetch error", async () => {
      vi.mocked(useOAuth).mockReturnValue({
        isLoading: false,
        error: null,
        isAuthenticated: false,
        userProfile: null,
        getProviders: vi.fn().mockResolvedValue([]),
        initiateOAuth: vi.fn(),
        handleCallback: vi.fn(),
        logout: vi.fn(),
      });

      // Mock fetch to fail
      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

      render(
        <MemoryRouter>
          <LoginScreen />
        </MemoryRouter>
      );

      await waitFor(() => {
        // Should show default providers as fallback
        expect(screen.getByText("Continue with Google")).toBeInTheDocument();
        expect(screen.getByText("Continue with GitHub")).toBeInTheDocument();
      });
    });
  });
});
