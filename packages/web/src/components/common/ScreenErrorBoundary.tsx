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
 */

import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";
import { useNavigate } from "react-router-dom";
import { ApiErrorDisplay } from "./ApiErrorDisplay";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  screenName?: string;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
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

  return (
    <div className="flex items-center justify-center min-h-screen bg-background dark:bg-dark-background p-4">
      <div className="max-w-md w-full">
        <ApiErrorDisplay
          error={
            error?.message ||
            `The ${screenName || "screen"} encountered an error. Please try again.`
          }
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
