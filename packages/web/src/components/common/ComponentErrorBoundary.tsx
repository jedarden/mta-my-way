/**
 * ComponentErrorBoundary - Lightweight error boundary for individual components.
 *
 * Per plan.md Phase 4: Comprehensive error states.
 *
 * Features:
 *   - Isolates errors to specific components
 *   - Shows minimal inline error UI
 *   - Prevents cascading failures
 *   - Logs errors for debugging
 */

import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  componentName?: string;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
}

/**
 * ComponentErrorBoundary - Isolates errors to specific components
 */
export class ComponentErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(
      `ComponentErrorBoundary caught an error in ${this.props.componentName || "component"}:`,
      error,
      errorInfo
    );
    this.props.onError?.(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default minimal error UI
      return (
        <div className="rounded-lg bg-warning/10 p-4 text-center" role="alert" aria-live="polite">
          <p className="text-13 text-text-primary dark:text-dark-text-primary">
            {this.props.componentName
              ? `The ${this.props.componentName} component failed to load.`
              : "This component failed to load."}
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ComponentErrorBoundary;
