/**
 * OAuthCallbackScreen - Handles OAuth callback from provider.
 *
 * This screen receives the OAuth callback, processes it with the server,
 * and communicates the result back to the parent window via postMessage.
 */

import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useOAuth } from "../hooks/useOAuth";

export default function OAuthCallbackScreen() {
  const [searchParams] = useSearchParams();
  const { handleCallback } = useOAuth();

  useEffect(() => {
    const processCallback = async (): Promise<void> => {
      const result = await handleCallback(searchParams);

      // Communicate result to parent window
      if (window.opener) {
        window.opener.postMessage(
          {
            type: "oauth_callback",
            success: result.success,
            profile: result.profile,
            error: result.error,
            errorDescription: result.errorDescription,
          },
          window.location.origin
        );
      }

      // Close the popup after a short delay
      setTimeout(() => {
        window.close();
      }, 500);
    };

    void processCallback();
  }, [searchParams, handleCallback]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-background dark:bg-dark-background">
      <div className="text-center">
        <div className="mb-4">
          <svg
            className="animate-spin h-8 w-8 text-mta-primary mx-auto"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        </div>
        <p className="text-text-secondary dark:text-dark-text-secondary">
          Completing sign in...
        </p>
      </div>
    </div>
  );
}
