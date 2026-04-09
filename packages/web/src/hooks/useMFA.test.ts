/**
 * Tests for useMFA hook.
 *
 * Tests cover:
 * - Fetching MFA status
 * - Initiating TOTP setup
 * - Enabling TOTP with verification code
 * - Disabling TOTP
 * - Verifying MFA code
 * - Error handling throughout
 */

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMFA } from "./useMFA";

// Mock window.location.origin
const mockLocation = { origin: "https://myapp.com" };
Object.defineProperty(window, "location", {
  value: mockLocation,
  writable: true,
  configurable: true,
});

describe("useMFA Hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getStatus", () => {
    it("should fetch and return MFA status", async () => {
      const mockStatus = {
        enabled: true,
        verified: true,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockStatus,
      } as Response);

      const { result } = renderHook(() => useMFA());

      let status;
      await act(async () => {
        status = await result.current.getStatus();
      });

      expect(status).toEqual(mockStatus);
      expect(result.current.mfaEnabled).toBe(true);
      expect(result.current.mfaVerified).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("/api/auth/mfa/status"));
    });

    it("should handle fetch errors gracefully", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(() => useMFA());

      let status;
      await act(async () => {
        status = await result.current.getStatus();
      });

      expect(status).toBeNull();
      expect(result.current.error).toBe("Network error");
      expect(result.current.isLoading).toBe(false);
    });

    it("should handle non-OK response", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
      } as Response);

      const { result } = renderHook(() => useMFA());

      let status;
      await act(async () => {
        status = await result.current.getStatus();
      });

      expect(status).toBeNull();
      expect(result.current.error).toBe("Failed to fetch MFA status");
    });
  });

  describe("setupTotp", () => {
    it("should initiate TOTP setup and return QR code data", async () => {
      const mockSetupData = {
        secret: "JBSWY3DPEHPK3PXP",
        backupCodes: ["abc12345", "def67890"],
        qrCodeUrl:
          "otpauth://totp/MTA%20My%20Way:test@example.com?secret=JBSWY3DPEHPK3PXP&issuer=MTA%20My%20Way",
        message: "Scan the QR code with your authenticator app",
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockSetupData,
      } as Response);

      const { result } = renderHook(() => useMFA());

      let setupData;
      await act(async () => {
        setupData = await result.current.setupTotp();
      });

      expect(setupData).toEqual(mockSetupData);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/auth/mfa/setup"),
        expect.objectContaining({
          method: "POST",
        })
      );
    });

    it("should handle setup errors", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ error: "Unauthorized" }),
      } as Response);

      const { result } = renderHook(() => useMFA());

      let setupData;
      await act(async () => {
        setupData = await result.current.setupTotp();
      });

      expect(setupData).toBeNull();
      expect(result.current.error).toBe("Unauthorized");
    });

    it("should handle network errors during setup", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(() => useMFA());

      let setupData;
      await act(async () => {
        setupData = await result.current.setupTotp();
      });

      expect(setupData).toBeNull();
      expect(result.current.error).toBe("Network error");
    });
  });

  describe("enableTotp", () => {
    it("should enable TOTP with valid verification code", async () => {
      const mockEnableResponse = {
        success: true,
        message: "MFA enabled successfully",
        remainingBackupCodes: 9,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockEnableResponse,
      } as Response);

      const { result } = renderHook(() => useMFA());

      let enableResponse;
      await act(async () => {
        enableResponse = await result.current.enableTotp("123456");
      });

      expect(enableResponse).toEqual(mockEnableResponse);
      expect(result.current.mfaEnabled).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/auth/mfa/enable"),
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("123456"),
        })
      );
    });

    it("should handle invalid verification code", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: "Invalid TOTP code" }),
      } as Response);

      const { result } = renderHook(() => useMFA());

      let enableResponse;
      await act(async () => {
        enableResponse = await result.current.enableTotp("000000");
      });

      expect(enableResponse).toBeNull();
      expect(result.current.error).toBe("Invalid TOTP code");
    });

    it("should handle network errors during enable", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(() => useMFA());

      let enableResponse;
      await act(async () => {
        enableResponse = await result.current.enableTotp("123456");
      });

      expect(enableResponse).toBeNull();
      expect(result.current.error).toBe("Network error");
    });
  });

  describe("disableTotp", () => {
    it("should disable TOTP for authenticated user", async () => {
      const mockDisableResponse = {
        success: true,
        message: "MFA disabled successfully",
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockDisableResponse,
      } as Response);

      const { result } = renderHook(() => useMFA());

      let disableResponse;
      await act(async () => {
        disableResponse = await result.current.disableTotp();
      });

      expect(disableResponse).toEqual(mockDisableResponse);
      expect(result.current.mfaEnabled).toBe(false);
      expect(result.current.mfaVerified).toBe(false);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/auth/mfa/disable"),
        expect.objectContaining({
          method: "POST",
        })
      );
    });

    it("should handle disable errors", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: "MFA not configured" }),
      } as Response);

      const { result } = renderHook(() => useMFA());

      let disableResponse;
      await act(async () => {
        disableResponse = await result.current.disableTotp();
      });

      expect(disableResponse).toBeNull();
      expect(result.current.error).toBe("MFA not configured");
    });
  });

  describe("verifyMfa", () => {
    it("should verify MFA code for session", async () => {
      const mockVerifyResponse = {
        success: true,
        message: "MFA verified successfully",
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockVerifyResponse,
      } as Response);

      const { result } = renderHook(() => useMFA());

      let verifyResponse;
      await act(async () => {
        verifyResponse = await result.current.verifyMfa("123456");
      });

      expect(verifyResponse).toEqual(mockVerifyResponse);
      expect(result.current.mfaVerified).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/auth/mfa/verify"),
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("123456"),
        })
      );
    });

    it("should handle invalid verification code", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: "Invalid TOTP code" }),
      } as Response);

      const { result } = renderHook(() => useMFA());

      let verifyResponse;
      await act(async () => {
        verifyResponse = await result.current.verifyMfa("000000");
      });

      expect(verifyResponse).toBeNull();
      expect(result.current.error).toBe("Invalid TOTP code");
    });

    it("should handle network errors during verification", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(() => useMFA());

      let verifyResponse;
      await act(async () => {
        verifyResponse = await result.current.verifyMfa("123456");
      });

      expect(verifyResponse).toBeNull();
      expect(result.current.error).toBe("Network error");
    });
  });

  describe("state management", () => {
    it("should set loading to false after operations complete", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ enabled: false, verified: false }),
      } as Response);

      const { result } = renderHook(() => useMFA());

      await act(async () => {
        await result.current.getStatus();
      });

      expect(result.current.isLoading).toBe(false);
    });

    it("should return initial state with null error", () => {
      const { result } = renderHook(() => useMFA());

      expect(result.current).toHaveProperty("error");
      expect(result.current.error).toBeNull();
    });

    it("should track MFA enabled state", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ enabled: true, verified: true }),
      } as Response);

      const { result } = renderHook(() => useMFA());

      await act(async () => {
        await result.current.getStatus();
      });

      expect(result.current.mfaEnabled).toBe(true);
    });

    it("should track MFA verified state", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ enabled: true, verified: true }),
      } as Response);

      const { result } = renderHook(() => useMFA());

      await act(async () => {
        await result.current.getStatus();
      });

      expect(result.current.mfaVerified).toBe(true);
    });
  });

  describe("error handling", () => {
    it("should clear previous error on new operation", async () => {
      // First call fails
      global.fetch = vi.fn().mockRejectedValueOnce(new Error("First error"));

      const { result } = renderHook(() => useMFA());

      await act(async () => {
        await result.current.getStatus();
      });

      expect(result.current.error).toBe("First error");

      // Second call succeeds
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ enabled: false, verified: false }),
      } as Response);

      await act(async () => {
        await result.current.getStatus();
      });

      expect(result.current.error).toBeNull();
    });
  });
});
