/**
 * ErrorBoundary - Catches React errors and provides a fallback UI.
 *
 * Per plan.md Phase 4: Comprehensive error states.
 *
 * Features:
 *   - Catches JavaScript errors anywhere in the child component tree
 *   - Displays a user-friendly error message with retry option
 *   - Logs error details for debugging
 *   - Preserves as much UI as possible (doesn't crash the entire app)
 */

import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary class component - React requires class components for error boundaries
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log the error to console for debugging
    console.error("ErrorBoundary caught an error:", error, errorInfo);

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return <ErrorFallback error={this.state.error} onReset={this.handleReset} />;
    }

    return this.props.children;
  }
}

/**
 * ErrorFallback - Default error display component
 */
interface ErrorFallbackProps {
  error: Error | null;
  onReset: () => void;
}

function ErrorFallback({ error, onReset }: ErrorFallbackProps) {
  return (
    <div
      className="flex items-center justify-center min-h-screen bg-background dark:bg-dark-background p-4"
      role="alert"
      aria-live="assertive"
    >
      <div className="max-w-md w-full bg-surface dark:bg-dark-surface rounded-lg shadow-lg p-6 text-center">
        {/* Error icon */}
        <div className="flex justify-center mb-4" aria-hidden="true">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-mta-red"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>

        {/* Error message */}
        <h1 className="text-xl font-semibold text-text-primary dark:text-dark-text-primary mb-2">
          Something went wrong
        </h1>
        <p className="text-text-secondary dark:text-dark-text-secondary mb-6">
          We encountered an unexpected error. Please try again.
        </p>

        {/* Error details (in development) */}
        {import.meta.env.DEV && error && (
          <details className="mb-4 text-left">
            <summary className="cursor-pointer text-13 text-text-secondary dark:text-dark-text-secondary mb-2">
              Error details
            </summary>
            <pre className="text-11 bg-background dark:bg-dark-background p-2 rounded overflow-auto max-h-32 text-red-600 dark:text-red-400">
              {error.stack || error.message}
            </pre>
          </details>
        )}

        {/* Action buttons */}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onReset}
            className="w-full px-4 py-3 bg-mta-primary text-white rounded-lg font-medium min-h-touch hover:opacity-90 transition-opacity"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => (window.location.href = "/")}
            className="w-full px-4 py-3 bg-surface dark:bg-dark-surface text-text-primary dark:text-dark-text-primary border border-border dark:border-dark-border rounded-lg font-medium min-h-touch hover:bg-background dark:hover:bg-dark-background transition-colors"
          >
            Go to home
          </button>
        </div>
      </div>
    </div>
  );
}

export default ErrorBoundary;
