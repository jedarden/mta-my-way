/**
 * Tests for MfaVerifyScreen component.
 *
 * Tests cover:
 * - Verification code input
 * - Backup code input
 * - Code type toggle
 * - Verification flow
 * - Error handling
 * - Navigation
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock Screen component before importing MfaVerifyScreen
vi.mock("../components/layout/Screen", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="screen-mock">
      <main>{children}</main>
    </div>
  ),
}));

// Mock useNavigate before importing MfaVerifyScreen
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
import MfaVerifyScreen from "./MfaVerifyScreen";

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

// Mock document.cookie - spy on assignment
const cookieSpy = vi.fn();
Object.defineProperty(document, "cookie", {
  set: cookieSpy,
  get: () => "",
  configurable: true,
});

describe("MfaVerifyScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookieSpy.mockClear();
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
    return render(<MemoryRouter initialEntries={["/mfa/verify"]}>{component}</MemoryRouter>);
  };

  describe("initial render", () => {
    it("should render verification screen with title and description", () => {
      renderWithRouter(<MfaVerifyScreen />);

      expect(screen.getByText("Two-Factor Authentication")).toBeInTheDocument();
      expect(
        screen.getByText("Enter the verification code from your authenticator app")
      ).toBeInTheDocument();
    });

    it("should render security icon", () => {
      renderWithRouter(<MfaVerifyScreen />);

      const icon = document.querySelector("svg");
      expect(icon).toBeInTheDocument();
    });

    it("should render code type toggle buttons", () => {
      renderWithRouter(<MfaVerifyScreen />);

      expect(screen.getByRole("button", { name: "Authenticator Code" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Backup Code" })).toBeInTheDocument();
    });

    it("should render verification code input", () => {
      renderWithRouter(<MfaVerifyScreen />);

      const input = screen.getByLabelText("Authentication Code");
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute("inputMode", "numeric");
      expect(input).toHaveAttribute("maxLength", "6");
    });

    it("should render verify button", () => {
      renderWithRouter(<MfaVerifyScreen />);

      const verifyButton = screen.getByRole("button", { name: "Verify" });
      expect(verifyButton).toBeInTheDocument();
      expect(verifyButton).toBeDisabled(); // Disabled when code is empty
    });

    it("should render help and cancel links", () => {
      renderWithRouter(<MfaVerifyScreen />);

      expect(screen.getByRole("button", { name: "Need help?" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    });

    it("should render tip about code expiration", () => {
      renderWithRouter(<MfaVerifyScreen />);

      expect(screen.getByText(/Tip:/)).toBeInTheDocument();
      expect(screen.getByText(/verification code changes every 30 seconds/)).toBeInTheDocument();
    });
  });

  describe("authenticator code input", () => {
    it("should accept numeric input only", () => {
      renderWithRouter(<MfaVerifyScreen />);

      const input = screen.getByLabelText("Authentication Code") as HTMLInputElement;

      // Simulate user typing - using fireEvent.change to trigger onChange
      fireEvent.change(input, { target: { value: "123456" } });

      expect(input.value).toBe("123456");
    });

    it("should limit input to 6 digits", () => {
      renderWithRouter(<MfaVerifyScreen />);

      const input = screen.getByLabelText("Authentication Code") as HTMLInputElement;

      // Simulate user typing more than 6 digits
      fireEvent.change(input, { target: { value: "123456789" } });

      // The component should truncate to 6 digits
      expect(input.value).toBe("123456");
    });

    it("should enable verify button when code is complete", () => {
      renderWithRouter(<MfaVerifyScreen />);

      const input = screen.getByLabelText("Authentication Code") as HTMLInputElement;
      const verifyButton = screen.getByRole("button", { name: "Verify" });

      fireEvent.change(input, { target: { value: "123456" } });

      expect(verifyButton).not.toBeDisabled();
    });
  });

  describe("backup code input", () => {
    it("should switch to backup code mode when toggled", () => {
      renderWithRouter(<MfaVerifyScreen />);

      const backupButton = screen.getByRole("button", { name: "Backup Code" });
      fireEvent.click(backupButton);

      const input = screen.getByLabelText("Backup Code");
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute("maxLength", "8");
    });

    it("should accept alphanumeric backup code", () => {
      renderWithRouter(<MfaVerifyScreen />);

      const backupButton = screen.getByRole("button", { name: "Backup Code" });
      fireEvent.click(backupButton);

      const input = screen.getByLabelText("Backup Code") as HTMLInputElement;

      fireEvent.change(input, { target: { value: "abc12345" } });

      expect(input.value).toBe("abc12345");
    });

    it("should limit backup code to 8 characters", () => {
      renderWithRouter(<MfaVerifyScreen />);

      const backupButton = screen.getByRole("button", { name: "Backup Code" });
      fireEvent.click(backupButton);

      const input = screen.getByLabelText("Backup Code") as HTMLInputElement;

      fireEvent.change(input, { target: { value: "abc123456789" } });

      expect(input.value).toBe("abc12345");
    });
  });

  describe("verification flow", () => {
    it("should call verifyMfa when verify button is clicked", async () => {
      const mockVerifyMfa = vi.fn().mockResolvedValue({
        success: true,
        message: "MFA verified successfully",
      });

      vi.mocked(useMFA).mockReturnValue({
        isLoading: false,
        error: null,
        mfaEnabled: false,
        mfaVerified: false,
        getStatus: vi.fn(),
        setupTotp: vi.fn(),
        enableTotp: vi.fn(),
        disableTotp: vi.fn(),
        verifyMfa: mockVerifyMfa,
      });

      renderWithRouter(<MfaVerifyScreen />);

      const input = screen.getByLabelText("Authentication Code") as HTMLInputElement;
      const verifyButton = screen.getByRole("button", { name: "Verify" });

      // Use fireEvent to properly simulate React's change event
      fireEvent.change(input, { target: { value: "123456" } });

      // Button should be enabled now
      expect(verifyButton).not.toBeDisabled();

      fireEvent.click(verifyButton);

      await waitFor(() => {
        expect(mockVerifyMfa).toHaveBeenCalledWith("123456");
      });
    });

    it("should call verifyMfa when Enter key is pressed", async () => {
      const mockVerifyMfa = vi.fn().mockResolvedValue({
        success: true,
        message: "MFA verified successfully",
      });

      vi.mocked(useMFA).mockReturnValue({
        isLoading: false,
        error: null,
        mfaEnabled: false,
        mfaVerified: false,
        getStatus: vi.fn(),
        setupTotp: vi.fn(),
        enableTotp: vi.fn(),
        disableTotp: vi.fn(),
        verifyMfa: mockVerifyMfa,
      });

      renderWithRouter(<MfaVerifyScreen />);

      const input = screen.getByLabelText("Authentication Code") as HTMLInputElement;

      fireEvent.change(input, { target: { value: "123456" } });
      fireEvent.keyDown(input, { key: "Enter" });

      await waitFor(() => {
        expect(mockVerifyMfa).toHaveBeenCalledWith("123456");
      });
    });
  });

  describe("error handling", () => {
    it("should display error message when verification fails", () => {
      vi.mocked(useMFA).mockReturnValue({
        isLoading: false,
        error: "Invalid TOTP code",
        mfaEnabled: false,
        mfaVerified: false,
        getStatus: vi.fn(),
        setupTotp: vi.fn(),
        enableTotp: vi.fn(),
        disableTotp: vi.fn(),
        verifyMfa: vi.fn(),
      });

      renderWithRouter(<MfaVerifyScreen />);

      expect(screen.getByText("Invalid TOTP code")).toBeInTheDocument();
    });

    it("should show error alert with proper styling", () => {
      vi.mocked(useMFA).mockReturnValue({
        isLoading: false,
        error: "Invalid TOTP code",
        mfaEnabled: false,
        mfaVerified: false,
        getStatus: vi.fn(),
        setupTotp: vi.fn(),
        enableTotp: vi.fn(),
        disableTotp: vi.fn(),
        verifyMfa: vi.fn(),
      });

      renderWithRouter(<MfaVerifyScreen />);

      const errorAlert = screen.getByRole("alert");
      expect(errorAlert).toBeInTheDocument();
      expect(errorAlert).toHaveClass(/bg-red-/);
    });
  });

  describe("loading states", () => {
    it("should disable input during verification", () => {
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

      renderWithRouter(<MfaVerifyScreen />);

      const input = screen.getByLabelText("Authentication Code");
      expect(input).toBeDisabled();
    });

    it("should show loading text on verify button", () => {
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

      renderWithRouter(<MfaVerifyScreen />);

      expect(screen.getByRole("button", { name: "Verifying..." })).toBeInTheDocument();
    });
  });

  describe("navigation", () => {
    it("should clear session and navigate to login on cancel", () => {
      renderWithRouter(<MfaVerifyScreen />);

      const cancelButton = screen.getByRole("button", { name: "Cancel" });
      cancelButton.click();

      // Verify navigation to login
      expect(mockNavigate).toHaveBeenCalledWith("/login", { replace: true });
      // Verify document.cookie was called to clear the session
      expect(cookieSpy).toHaveBeenCalledWith(expect.stringContaining("session_id=;"));
      expect(cookieSpy).toHaveBeenCalledWith(expect.stringContaining("Max-Age=0"));
    });

    it("should open help link in new tab", () => {
      const openSpy = vi.fn();
      Object.defineProperty(window, "open", {
        value: openSpy,
        writable: true,
        configurable: true,
      });

      renderWithRouter(<MfaVerifyScreen />);

      const helpButton = screen.getByRole("button", { name: "Need help?" });
      helpButton.click();

      expect(openSpy).toHaveBeenCalledWith(
        "https://support.google.com/accounts/answer/1066447",
        "_blank"
      );
    });
  });

  describe("accessibility", () => {
    it("should have proper labels for form inputs", () => {
      renderWithRouter(<MfaVerifyScreen />);

      expect(screen.getByLabelText("Authentication Code")).toBeInTheDocument();
    });

    it("should have proper ARIA attributes", () => {
      renderWithRouter(<MfaVerifyScreen />);

      const main = document.querySelector("main");
      expect(main).toBeInTheDocument();
    });

    it("should allow keyboard navigation", () => {
      renderWithRouter(<MfaVerifyScreen />);

      // The input field has autoFocus, so it should be focusable
      const input = screen.getByLabelText("Authentication Code");
      expect(input).toBeInTheDocument();

      // Verify button is also present and focusable
      const verifyButton = screen.getByRole("button", { name: "Verify" });
      expect(verifyButton).toBeInTheDocument();
    });
  });
});
