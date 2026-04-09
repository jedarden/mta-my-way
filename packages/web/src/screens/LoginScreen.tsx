/**
 * LoginScreen - OAuth-based authentication screen.
 *
 * Provides a clean, accessible login interface with OAuth provider options.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Screen from "../components/layout/Screen";
import { useOAuth } from "../hooks/useOAuth";

export default function LoginScreen() {
  const { isLoading, error, isAuthenticated, initiateOAuth } = useOAuth();
  const navigate = useNavigate();

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      void navigate("/", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleOAuthLogin = (providerId: string): void => {
    void initiateOAuth(providerId);
  };

  return (
    <Screen>
      <div className="max-w-md mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-text-primary dark:text-dark-text-primary mb-2">
            Welcome to MTA My Way
          </h1>
          <p className="text-text-secondary dark:text-dark-text-secondary">
            Sign in to save your commutes and track trips
          </p>
        </div>

        {/* OAuth Provider Buttons */}
        <div className="space-y-3">
          <OAuthLoginButtons
            onLogin={(providerId) => {
              void handleOAuthLogin(providerId);
            }}
            isLoading={isLoading}
          />
        </div>

        {/* Error Message */}
        {error && (
          <div
            role="alert"
            className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg"
          >
            <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}

        {/* Info Section */}
        <div className="mt-8 p-4 bg-background-secondary dark:bg-dark-background-secondary rounded-lg">
          <h2 className="text-sm font-medium text-text-primary dark:text-dark-text-primary mb-2">
            Why sign in?
          </h2>
          <ul className="text-xs text-text-secondary dark:text-dark-text-secondary space-y-1">
            <li>• Save your favorite commutes for quick access</li>
            <li>• Track your trip history and statistics</li>
            <li>• Sync settings across devices</li>
            <li>• Get personalized service alerts</li>
          </ul>
        </div>

        {/* Privacy Note */}
        <p className="mt-6 text-xs text-center text-text-secondary dark:text-dark-text-secondary">
          By signing in, you agree to our Terms of Service and Privacy Policy. We use secure OAuth
          authentication and never store your password.
        </p>
      </div>
    </Screen>
  );
}

interface OAuthLoginButtonsProps {
  onLogin: (providerId: string) => void;
  isLoading: boolean;
}

function OAuthLoginButtons({ onLogin, isLoading }: OAuthLoginButtonsProps) {
  const [providers, setProviders] = useState<Array<{ providerId: string; displayName: string }>>(
    []
  );

  useEffect(() => {
    // Fetch available providers
    fetch(`${window.location.origin}/api/auth/oauth/providers`)
      .then((res) => res.json())
      .then((data) => {
        if (data.providers) {
          setProviders(data.providers);
        }
      })
      .catch((err) => {
        console.error("Failed to fetch OAuth providers:", err);
        // Set default providers if fetch fails
        setProviders([
          { providerId: "google", displayName: "Google" },
          { providerId: "github", displayName: "GitHub" },
        ]);
      });
  }, []);

  if (providers.length === 0) {
    return (
      <div className="text-center text-text-secondary dark:text-dark-text-secondary">
        No authentication providers available.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {providers.map((provider) => (
        <OAuthButton
          key={provider.providerId}
          providerId={provider.providerId}
          displayName={provider.displayName}
          onClick={() => onLogin(provider.providerId)}
          disabled={isLoading}
        />
      ))}
    </div>
  );
}

interface OAuthButtonProps {
  providerId: string;
  displayName: string;
  onClick: () => void;
  disabled: boolean;
}

function OAuthButton({ providerId, displayName, onClick, disabled }: OAuthButtonProps) {
  const getProviderIcon = (id: string): string => {
    switch (id) {
      case "google":
        return "G";
      case "github":
        return "⌘";
      default:
        return displayName.charAt(0);
    }
  };

  const getProviderColor = (id: string): string => {
    switch (id) {
      case "google":
        return "bg-white hover:bg-gray-50 text-gray-900 border-gray-300";
      case "github":
        return "bg-gray-900 hover:bg-gray-800 text-white border-gray-700";
      default:
        return "bg-mta-primary hover:bg-mta-primary/90 text-white border-mta-primary/20";
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "w-full flex items-center justify-center gap-3 px-4 py-3 rounded-lg border font-medium transition-colors",
        "focus:outline-none focus:ring-2 focus:ring-mta-primary focus:ring-offset-2",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        getProviderColor(providerId),
      ].join(" ")}
      aria-label={`Sign in with ${displayName}`}
    >
      <span className="text-lg" aria-hidden="true">
        {getProviderIcon(providerId)}
      </span>
      <span>Continue with {displayName}</span>
      {disabled && (
        <span className="ml-2" aria-hidden="true">
          <svg
            className="animate-spin h-4 w-4"
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
        </span>
      )}
    </button>
  );
}
