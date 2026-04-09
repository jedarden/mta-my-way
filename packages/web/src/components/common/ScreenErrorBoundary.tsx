/**
 * ScreenErrorBoundary - Granular error boundary for individual screens.
 *
 * Per plan.md Phase 4: Comprehensive error states.
 *
 * Features:
 *   - Isolates errors to specific screens
 *   - Allows navigation away from failed screens
 *   - Provides screen-specific error recovery
 *   - Logs errors for debugging
 *   - Enhanced with user-friendly error messages
 */

import type { ErrorInfo } from "react";
import { Component } from "react";
import { useNavigate } from "react-router-dom";
import { ApiErrorDisplay } from "./ApiErrorDisplay";

interface State {
  hasError: boolean;
  error: Error | null;
}

interface Props {
  children: React.ReactNode;
  screenName?: string;
  fallback?: React.ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

/**
 * ScreenErrorBoundary - Isolates errors to specific screens
 */
export class ScreenErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(
      `ScreenErrorBoundary caught an error in ${this.props.screenName || "unknown screen"}:`,
      error,
      errorInfo
    );
    this.props.onError?.(error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <ScreenErrorFallback
          error={this.state.error}
          screenName={this.props.screenName}
          onReset={this.handleReset}
        />
      );
    }

    return this.props.children;
  }
}

/**
 * ScreenErrorFallback - Error display for screen-level failures
 */
interface ScreenErrorFallbackProps {
  error: Error | null;
  screenName?: string;
  onReset: () => void;
}

function ScreenErrorFallback({ error, screenName, onReset }: ScreenErrorFallbackProps) {
  const navigate = useNavigate();

  const handleGoHome = () => {
    void navigate("/");
  };

  const handleRetry = () => {
    onReset();
  };

  // Get user-friendly error message based on screen context
  const getScreenErrorMessage = (): { title: string; message: string } => {
    if (!screenName) {
      return {
        title: "Something went wrong",
        message: "This screen encountered an unexpected error.",
      };
    }

    const screenLower = screenName.toLowerCase();

    // Screen-specific error messages
    if (screenLower.includes("station") || screenLower.includes("arrival")) {
      return {
        title: "Unable to load station data",
        message: "We couldn't fetch the latest information for this station.",
      };
    }
    if (screenLower.includes("trip") || screenLower.includes("tracking")) {
      return {
        title: "Unable to track trip",
        message: "We couldn't fetch the current status of this train.",
      };
    }
    if (screenLower.includes("commute")) {
      return {
        title: "Unable to load commute",
        message: "We couldn't analyze your commute right now.",
      };
    }
    if (screenLower.includes("alert") || screenLower.includes("health")) {
      return {
        title: "Unable to load service alerts",
        message: "We couldn't fetch the latest service updates.",
      };
    }
    if (screenLower.includes("map")) {
      return {
        title: "Unable to load map",
        message: "We couldn't load the subway map.",
      };
    }
    if (screenLower.includes("journal") || screenLower.includes("stats")) {
      return {
        title: "Unable to load your data",
        message: "We couldn't load your trip history and statistics.",
      };
    }
    if (screenLower.includes("setting")) {
      return {
        title: "Unable to load settings",
        message: "We couldn't load your settings.",
      };
    }

    // Default message
    return {
      title: "Something went wrong",
      message: `The ${screenName} screen encountered an error.`,
    };
  };

  const { message } = getScreenErrorMessage();
  const displayMessage = error?.message ? `${message} ${error.message}` : message;

  return (
    <div className="flex items-center justify-center min-h-screen bg-background dark:bg-dark-background p-4">
      <div className="max-w-md w-full">
        <ApiErrorDisplay
          error={displayMessage}
          canRetry={true}
          isRetrying={false}
          onRetry={handleRetry}
          onDismiss={handleGoHome}
        />

        {import.meta.env.DEV && error && (
          <details className="mt-4 text-left">
            <summary className="cursor-pointer text-13 text-text-secondary dark:text-dark-text-secondary mb-2">
              Technical details
            </summary>
            <pre className="text-11 bg-background dark:bg-dark-background p-2 rounded overflow-auto max-h-32 text-red-600 dark:text-red-400">
              {error.stack || error.message}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}

export default ScreenErrorBoundary;
