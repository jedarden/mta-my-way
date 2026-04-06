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
 *   - Enhanced with user-friendly error messages
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
 * Get a user-friendly error message for a component
 */
function getComponentErrorMessage(componentName?: string): { title: string; message: string } {
  if (!componentName) {
    return {
      title: "Component error",
      message: "This component failed to load.",
    };
  }

  const compLower = componentName.toLowerCase();

  // Component-specific error messages
  if (compLower.includes("arrival")) {
    return {
      title: "Unable to show arrivals",
      message: "Arrivals information couldn't be loaded.",
    };
  }
  if (compLower.includes("alert")) {
    return {
      title: "Unable to show alerts",
      message: "Service alerts couldn't be loaded.",
    };
  }
  if (compLower.includes("map")) {
    return {
      title: "Unable to show map",
      message: "The map couldn't be displayed.",
    };
  }
  if (compLower.includes("favorite") || compLower.includes("commute")) {
    return {
      title: "Unable to load favorites",
      message: "Your favorites couldn't be loaded.",
    };
  }
  if (compLower.includes("line") || compLower.includes("diagram")) {
    return {
      title: "Unable to show line diagram",
      message: "The line diagram couldn't be displayed.",
    };
  }

  // Default message
  return {
    title: "Component unavailable",
    message: `The ${componentName} component failed to load.`,
  };
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

      // Default minimal error UI with user-friendly message
      const { title, message } = getComponentErrorMessage(this.props.componentName);

      return (
        <div className="rounded-lg bg-warning/10 p-4 text-center" role="alert" aria-live="polite">
          <p className="text-sm font-medium text-text-primary dark:text-dark-text-primary mb-1">
            {title}
          </p>
          <p className="text-13 text-text-secondary dark:text-dark-text-secondary">{message}</p>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ComponentErrorBoundary;
