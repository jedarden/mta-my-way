/**
 * MFA (Multi-Factor Authentication) hook for MTA My Way.
 *
 * Provides functions for MFA setup, verification, and management.
 */

import { useCallback, useState } from "react";

interface MfaStatusResponse {
  enabled: boolean;
  verified: boolean;
}

interface MfaSetupResponse {
  secret: string;
  backupCodes: string[];
  qrCodeUrl: string;
  message: string;
}

interface MfaEnableResponse {
  success: boolean;
  message: string;
  remainingBackupCodes?: number;
}

interface MfaVerifyResponse {
  success: boolean;
  message: string;
}

interface MfaDisableResponse {
  success: boolean;
  message: string;
}

const API_BASE = window.location.origin;

/**
 * Hook for MFA operations.
 */
export function useMFA() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaVerified, setMfaVerified] = useState(false);

  /**
   * Get MFA status for the current session.
   */
  const getStatus = useCallback(async (): Promise<MfaStatusResponse | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/auth/mfa/status`);
      if (!response.ok) {
        throw new Error("Failed to fetch MFA status");
      }

      const data = (await response.json()) as MfaStatusResponse;
      setMfaEnabled(data.enabled);
      setMfaVerified(data.verified);
      setIsLoading(false);
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      setIsLoading(false);
      return null;
    }
  }, []);

  /**
   * Initiate TOTP setup - returns secret and QR code URL.
   */
  const setupTotp = useCallback(async (): Promise<MfaSetupResponse | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/auth/mfa/setup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string };
        throw new Error(errorData.error || "Failed to initiate MFA setup");
      }

      const data = (await response.json()) as MfaSetupResponse;
      setIsLoading(false);
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      setIsLoading(false);
      return null;
    }
  }, []);

  /**
   * Enable TOTP after initial verification.
   */
  const enableTotp = useCallback(async (code: string): Promise<MfaEnableResponse | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/auth/mfa/enable`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code }),
      });

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string };
        throw new Error(errorData.error || "Failed to enable MFA");
      }

      const data = (await response.json()) as MfaEnableResponse;
      setMfaEnabled(true);
      setIsLoading(false);
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      setIsLoading(false);
      return null;
    }
  }, []);

  /**
   * Disable TOTP for the current user.
   */
  const disableTotp = useCallback(async (): Promise<MfaDisableResponse | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/auth/mfa/disable`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string };
        throw new Error(errorData.error || "Failed to disable MFA");
      }

      const data = (await response.json()) as MfaDisableResponse;
      setMfaEnabled(false);
      setMfaVerified(false);
      setIsLoading(false);
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      setIsLoading(false);
      return null;
    }
  }, []);

  /**
   * Verify MFA for a session.
   */
  const verifyMfa = useCallback(async (code: string): Promise<MfaVerifyResponse | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/auth/mfa/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code }),
      });

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string };
        throw new Error(errorData.error || "Failed to verify MFA");
      }

      const data = (await response.json()) as MfaVerifyResponse;
      setMfaVerified(true);
      setIsLoading(false);
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      setIsLoading(false);
      return null;
    }
  }, []);

  return {
    isLoading,
    error,
    mfaEnabled,
    mfaVerified,
    getStatus,
    setupTotp,
    enableTotp,
    disableTotp,
    verifyMfa,
  };
}
