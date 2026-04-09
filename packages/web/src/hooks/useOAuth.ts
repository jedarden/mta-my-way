/**
 * OAuth authentication hook for MTA My Way.
 *
 * Provides functions for initiating OAuth flow and handling callbacks.
 */

import { useCallback, useState } from "react";

interface OAuthProvider {
  providerId: string;
  displayName: string;
  active: boolean;
}

interface OAuthProvidersResponse {
  providers: OAuthProvider[];
}

interface OAuthAuthorizeResponse {
  authorizationUrl: string;
  stateId: string;
}

interface OAuthCallbackResult {
  success: boolean;
  profile?: {
    providerId: string;
    email?: string;
    name?: string;
    picture?: string;
  };
  error?: string;
  errorDescription?: string;
}

const API_BASE = window.location.origin;

/**
 * Hook for OAuth authentication.
 */
export function useOAuth() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userProfile, setUserProfile] = useState<OAuthCallbackResult["profile"] | null>(null);

  /**
   * Fetch available OAuth providers.
   */
  const getProviders = useCallback(async (): Promise<OAuthProvider[]> => {
    try {
      const response = await fetch(`${API_BASE}/api/auth/oauth/providers`);
      if (!response.ok) {
        throw new Error("Failed to fetch OAuth providers");
      }
      const data = (await response.json()) as OAuthProvidersResponse;
      return data.providers;
    } catch (err) {
      console.error("Error fetching OAuth providers:", err);
      return [];
    }
  }, []);

  /**
   * Initiate OAuth authorization flow.
   * Opens a popup window for the user to authenticate.
   */
  const initiateOAuth = useCallback(
    async (providerId: string): Promise<void> => {
      setIsLoading(true);
      setError(null);

      try {
        // Get authorization URL from server
        const response = await fetch(
          `${API_BASE}/api/auth/oauth/authorize/${providerId}`
        );
        if (!response.ok) {
          const errorData = (await response.json()) as { error?: string };
          throw new Error(errorData.error || "Failed to initiate OAuth flow");
        }

        const data = (await response.json()) as OAuthAuthorizeResponse;

        // Open popup window for OAuth
        const popup = window.open(
          data.authorizationUrl,
          "oauth_popup",
          "width=500,height=600,scrollbars=yes,resizable=yes"
        );

        if (!popup) {
          throw new Error("Popup blocked. Please allow popups for this site.");
        }

        // Listen for popup close
        const checkPopup = setInterval(() => {
          if (popup.closed) {
            clearInterval(checkPopup);
            setIsLoading(false);
          }
        }, 500);

        // Listen for OAuth callback message
        const messageHandler = (event: MessageEvent): void => {
          // Verify origin
          if (event.origin !== window.location.origin) {
            return;
          }

          if (event.data.type === "oauth_callback") {
            clearInterval(checkPopup);
            popup.close();

            if (event.data.success) {
              setIsAuthenticated(true);
              setUserProfile(event.data.profile);
            } else {
              setError(event.data.error || "Authentication failed");
            }

            setIsLoading(false);
            window.removeEventListener("message", messageHandler);
          }
        };

        window.addEventListener("message", messageHandler);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        setError(errorMessage);
        setIsLoading(false);
      }
    },
    []
  );

  /**
   * Handle OAuth callback (called by popup redirect page).
   * This should only be used on the callback page.
   */
  const handleCallback = useCallback(async (
    searchParams: URLSearchParams
  ): Promise<OAuthCallbackResult> => {
    setIsLoading(true);
    setError(null);

    try {
      const state = searchParams.get("state");
      const code = searchParams.get("code");
      const error = searchParams.get("error");
      const errorDescription = searchParams.get("error_description");

      if (error) {
        setError(error || "OAuth authorization failed");
        return {
          success: false,
          error: error || "OAuth authorization failed",
          errorDescription: errorDescription || undefined,
        };
      }

      if (!state || !code) {
        throw new Error("Missing required parameters");
      }

      // Extract provider ID from the callback URL path
      const providerId = window.location.pathname.split("/").pop();
      if (!providerId) {
        throw new Error("Provider ID not found in URL");
      }

      const response = await fetch(
        `${API_BASE}/api/auth/oauth/callback/${providerId}?state=${encodeURIComponent(state)}&code=${encodeURIComponent(code)}`
      );

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string };
        throw new Error(errorData.error || "OAuth callback failed");
      }

      const result = (await response.json()) as OAuthCallbackResult;

      if (result.success) {
        setIsAuthenticated(true);
        setUserProfile(result.profile);
      } else {
        setError(result.error || "Authentication failed");
      }

      setIsLoading(false);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      setIsLoading(false);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }, []);

  /**
   * Logout user.
   */
  const logout = useCallback(async (): Promise<void> => {
    try {
      // Clear session cookie by setting it to expire
      document.cookie =
        "session_id=; Path=/; SameSite=Lax; Secure; HttpOnly; Max-Age=0";

      setIsAuthenticated(false);
      setUserProfile(null);
      setError(null);
    } catch (err) {
      console.error("Error during logout:", err);
    }
  }, []);

  return {
    isLoading,
    error,
    isAuthenticated,
    userProfile,
    getProviders,
    initiateOAuth,
    handleCallback,
    logout,
  };
}
