/**
 * Tests for MfaSettingsScreen component.
 *
 * Tests cover:
 * - MFA status display
 * - Enable/disable MFA
 * - Info sections
 * - Confirmation dialog
 * - Navigation
 */

import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock Screen component before importing MfaSettingsScreen
vi.mock("../components/layout/Screen", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="screen-mock">
      <main>{children}</main>
    </div>
  ),
}));

// Mock useNavigate before importing MfaSettingsScreen
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import { MemoryRouter } from "react-router-dom";
import { useMFA } from "../hooks/useMFA";
import MfaSettingsScreen from "./MfaSettingsScreen";

// Mock useMFA hook
vi.mock("../hooks/useMFA", () => ({
  useMFA: vi.fn(() => ({
    isLoading: false,
    error: null,
    mfaEnabled: false,
    mfaVerified: false,
    getStatus: vi.fn(),
    setupTotp: vi.fn(),
    enableTotp: vi.fn(),
    disableTotp: vi.fn(),
    verifyMfa: vi.fn(),
  })),
}));

// Mock window.location
Object.defineProperty(window, "location", {
  value: { origin: "https://myapp.com" },
  writable: true,
  configurable: true,
});

describe("MfaSettingsScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to default mock values
    vi.mocked(useMFA).mockReturnValue({
      isLoading: false,
      error: null,
      mfaEnabled: false,
      mfaVerified: false,
      getStatus: vi.fn(),
      setupTotp: vi.fn(),
      enableTotp: vi.fn(),
      disableTotp: vi.fn(),
      verifyMfa: vi.fn(),
    });
  });

  afterEach(() => {
    mockNavigate.mockReset();
  });

  const renderWithRouter = (component: React.ReactElement) => {
    return render(<MemoryRouter initialEntries={["/settings/mfa"]}>{component}</MemoryRouter>);
  };

  describe("initial render", () => {
    it("should render settings screen with title and description", () => {
      renderWithRouter(<MfaSettingsScreen />);

      expect(screen.getByText("Two-Factor Authentication")).toBeInTheDocument();
      expect(
        screen.getByText("Add an extra layer of security to your account")
      ).toBeInTheDocument();
    });

    it("should render back button to settings", () => {
      renderWithRouter(<MfaSettingsScreen />);

      expect(screen.getByText("← Back to Settings")).toBeInTheDocument();
    });

    it("should render what is 2FA section", () => {
      renderWithRouter(<MfaSettingsScreen />);

      expect(screen.getByText("What is two-factor authentication?")).toBeInTheDocument();
    });

    it("should render enable button when MFA is disabled", async () => {
      const { useMFA } = await import("../hooks/useMFA");
      const mockGetStatus = vi.fn().mockResolvedValue({
        enabled: false,
        verified: false,
      });

      vi.mocked(useMFA).mockReturnValue({
        isLoading: false,
        error: null,
        mfaEnabled: false,
        mfaVerified: false,
        getStatus: mockGetStatus,
        setupTotp: vi.fn(),
        enableTotp: vi.fn(),
        disableTotp: vi.fn(),
        verifyMfa: vi.fn(),
      });

      renderWithRouter(<MfaSettingsScreen />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Enable" })).toBeInTheDocument();
      });
    });
  });

  describe("MFA disabled state", () => {
    it("should show disabled status card", async () => {
      const mockGetStatus = vi.fn().mockResolvedValue({
        enabled: false,
        verified: false,
      });

      vi.mocked(useMFA).mockReturnValue({
        isLoading: false,
        error: null,
        mfaEnabled: false,
        mfaVerified: false,
        getStatus: mockGetStatus,
        setupTotp: vi.fn(),
        enableTotp: vi.fn(),
        disableTotp: vi.fn(),
        verifyMfa: vi.fn(),
      });

      renderWithRouter(<MfaSettingsScreen />);

      await waitFor(() => {
        expect(screen.getByText("MFA is Disabled")).toBeInTheDocument();
      });
    });

    it("should show warning about account security", async () => {
      const mockGetStatus = vi.fn().mockResolvedValue({
        enabled: false,
        verified: false,
      });

      vi.mocked(useMFA).mockReturnValue({
        isLoading: false,
        error: null,
        mfaEnabled: false,
        mfaVerified: false,
        getStatus: mockGetStatus,
        setupTotp: vi.fn(),
        enableTotp: vi.fn(),
        disableTotp: vi.fn(),
        verifyMfa: vi.fn(),
      });

      renderWithRouter(<MfaSettingsScreen />);

      await waitFor(() => {
        expect(screen.getByText(/Protect your account/)).toBeInTheDocument();
      });
    });
  });

  describe("MFA enabled state", () => {
    it("should show enabled status card", async () => {
      const mockGetStatus = vi.fn().mockResolvedValue({
        enabled: true,
        verified: true,
      });

      vi.mocked(useMFA).mockReturnValue({
        isLoading: false,
        error: null,
        mfaEnabled: true,
        mfaVerified: true,
        getStatus: mockGetStatus,
        setupTotp: vi.fn(),
        enableTotp: vi.fn(),
        disableTotp: vi.fn(),
        verifyMfa: vi.fn(),
      });

      renderWithRouter(<MfaSettingsScreen />);

      await waitFor(() => {
        expect(screen.getByText("MFA is Enabled")).toBeInTheDocument();
      });
    });

    it("should show disable button when MFA is enabled", async () => {
      const mockGetStatus = vi.fn().mockResolvedValue({
        enabled: true,
        verified: true,
      });

      vi.mocked(useMFA).mockReturnValue({
        isLoading: false,
        error: null,
        mfaEnabled: true,
        mfaVerified: true,
        getStatus: mockGetStatus,
        setupTotp: vi.fn(),
        enableTotp: vi.fn(),
        disableTotp: vi.fn(),
        verifyMfa: vi.fn(),
      });

      renderWithRouter(<MfaSettingsScreen />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Disable" })).toBeInTheDocument();
      });
    });

    it("should show success message when MFA is enabled", async () => {
      const mockGetStatus = vi.fn().mockResolvedValue({
        enabled: true,
        verified: true,
      });

      vi.mocked(useMFA).mockReturnValue({
        isLoading: false,
        error: null,
        mfaEnabled: true,
        mfaVerified: true,
        getStatus: mockGetStatus,
        setupTotp: vi.fn(),
        enableTotp: vi.fn(),
        disableTotp: vi.fn(),
        verifyMfa: vi.fn(),
      });

      renderWithRouter(<MfaSettingsScreen />);

      await waitFor(() => {
        expect(screen.getByText(/Your account is secure/)).toBeInTheDocument();
      });
    });
  });

  describe("enable MFA flow", () => {
    it("should navigate to setup when enable button is clicked", async () => {
      const mockGetStatus = vi.fn().mockResolvedValue({
        enabled: false,
        verified: false,
      });

      vi.mocked(useMFA).mockReturnValue({
        isLoading: false,
        error: null,
        mfaEnabled: false,
        mfaVerified: false,
        getStatus: mockGetStatus,
        setupTotp: vi.fn(),
        enableTotp: vi.fn(),
        disableTotp: vi.fn(),
        verifyMfa: vi.fn(),
      });

      renderWithRouter(<MfaSettingsScreen />);

      await waitFor(async () => {
        const enableButton = screen.getByRole("button", { name: "Enable" });
        enableButton.click();
      });
    });
  });

  describe("disable MFA flow", () => {
    it("should show confirmation dialog when disable is clicked", async () => {
      const mockGetStatus = vi.fn().mockResolvedValue({
        enabled: true,
        verified: true,
      });

      vi.mocked(useMFA).mockReturnValue({
        isLoading: false,
        error: null,
        mfaEnabled: true,
        mfaVerified: true,
        getStatus: mockGetStatus,
        setupTotp: vi.fn(),
        enableTotp: vi.fn(),
        disableTotp: vi.fn(),
        verifyMfa: vi.fn(),
      });

      renderWithRouter(<MfaSettingsScreen />);

      await waitFor(async () => {
        const disableButton = screen.getByRole("button", { name: "Disable" });
        disableButton.click();
      });

      await waitFor(() => {
        expect(screen.getByText("Disable Two-Factor Authentication?")).toBeInTheDocument();
      });
    });

    it("should show warning in confirmation dialog", async () => {
      const mockGetStatus = vi.fn().mockResolvedValue({
        enabled: true,
        verified: true,
      });

      vi.mocked(useMFA).mockReturnValue({
        isLoading: false,
        error: null,
        mfaEnabled: true,
        mfaVerified: true,
        getStatus: mockGetStatus,
        setupTotp: vi.fn(),
        enableTotp: vi.fn(),
        disableTotp: vi.fn(),
        verifyMfa: vi.fn(),
      });

      renderWithRouter(<MfaSettingsScreen />);

      await waitFor(async () => {
        const disableButton = screen.getByRole("button", { name: "Disable" });
        disableButton.click();
      });

      await waitFor(() => {
        expect(screen.getByText(/Warning:/)).toBeInTheDocument();
        expect(screen.getByText(/If you disable 2FA/)).toBeInTheDocument();
      });
    });

    it("should call disableTotp when confirmed", async () => {
      const mockGetStatus = vi.fn().mockResolvedValue({
        enabled: true,
        verified: true,
      });
      const mockDisableTotp = vi.fn().mockResolvedValue({
        success: true,
        message: "MFA disabled successfully",
      });

      vi.mocked(useMFA).mockReturnValue({
        isLoading: false,
        error: null,
        mfaEnabled: true,
        mfaVerified: true,
        getStatus: mockGetStatus,
        setupTotp: vi.fn(),
        enableTotp: vi.fn(),
        disableTotp: mockDisableTotp,
        verifyMfa: vi.fn(),
      });

      renderWithRouter(<MfaSettingsScreen />);

      await waitFor(async () => {
        const disableButton = screen.getByRole("button", { name: "Disable" });
        disableButton.click();
      });

      await waitFor(() => {
        const confirmButton = screen.getByRole("button", { name: "Disable 2FA" });
        confirmButton.click();
      });

      await waitFor(() => {
        expect(mockDisableTotp).toHaveBeenCalled();
      });
    });

    it("should close dialog when cancel is clicked", async () => {
      const mockGetStatus = vi.fn().mockResolvedValue({
        enabled: true,
        verified: true,
      });

      vi.mocked(useMFA).mockReturnValue({
        isLoading: false,
        error: null,
        mfaEnabled: true,
        mfaVerified: true,
        getStatus: mockGetStatus,
        setupTotp: vi.fn(),
        enableTotp: vi.fn(),
        disableTotp: vi.fn(),
        verifyMfa: vi.fn(),
      });

      renderWithRouter(<MfaSettingsScreen />);

      await waitFor(async () => {
        const disableButton = screen.getByRole("button", { name: "Disable" });
        disableButton.click();
      });

      await waitFor(() => {
        const cancelButton = screen.getByRole("button", { name: "Cancel" });
        cancelButton.click();
      });

      await waitFor(() => {
        expect(screen.queryByText("Disable Two-Factor Authentication?")).not.toBeInTheDocument();
      });
    });
  });

  describe("error handling", () => {
    it("should display error message when operation fails", async () => {
      const mockGetStatus = vi.fn().mockResolvedValue({
        enabled: false,
        verified: false,
      });

      vi.mocked(useMFA).mockReturnValue({
        isLoading: false,
        error: "Failed to fetch MFA status",
        mfaEnabled: false,
        mfaVerified: false,
        getStatus: mockGetStatus,
        setupTotp: vi.fn(),
        enableTotp: vi.fn(),
        disableTotp: vi.fn(),
        verifyMfa: vi.fn(),
      });

      renderWithRouter(<MfaSettingsScreen />);

      expect(screen.getByText("Failed to fetch MFA status")).toBeInTheDocument();
    });
  });

  describe("loading states", () => {
    it("should disable buttons during loading", () => {
      vi.mocked(useMFA).mockReturnValue({
        isLoading: true,
        error: null,
        mfaEnabled: false,
        mfaVerified: false,
        getStatus: vi.fn(),
        setupTotp: vi.fn(),
        enableTotp: vi.fn(),
        disableTotp: vi.fn(),
        verifyMfa: vi.fn(),
      });

      renderWithRouter(<MfaSettingsScreen />);

      // Initial state before status loads
      expect(screen.getByText("Two-Factor Authentication")).toBeInTheDocument();
    });
  });

  describe("accessibility", () => {
    it("should have proper ARIA attributes on modal", async () => {
      const mockGetStatus = vi.fn().mockResolvedValue({
        enabled: true,
        verified: true,
      });

      vi.mocked(useMFA).mockReturnValue({
        isLoading: false,
        error: null,
        mfaEnabled: true,
        mfaVerified: true,
        getStatus: mockGetStatus,
        setupTotp: vi.fn(),
        enableTotp: vi.fn(),
        disableTotp: vi.fn(),
        verifyMfa: vi.fn(),
      });

      renderWithRouter(<MfaSettingsScreen />);

      await waitFor(async () => {
        const disableButton = screen.getByRole("button", { name: "Disable" });
        disableButton.click();
      });

      await waitFor(() => {
        const dialog = screen.getByRole("dialog");
        expect(dialog).toBeInTheDocument();
        expect(dialog).toHaveAttribute("aria-modal", "true");
      });
    });
  });
});
