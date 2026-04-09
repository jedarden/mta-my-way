/**
 * User-friendly error messages for different failure scenarios.
 *
 * Provides clear, actionable error messages that:
 *   - Explain what went wrong in plain language
 *   - Suggest what the user can do next
 *   - Are context-specific to the operation that failed
 *
 * Per plan.md Phase 4: Comprehensive error states with user guidance.
 */

import type { ApiErrorType } from "./apiEnhanced";
import { ApiErrorType as ApiErrorTypeEnum } from "./apiEnhanced";

/**
 * Error categories for organizing message types
 */
export enum ErrorCategory {
  // Network/connectivity issues
  NETWORK = "network",
  OFFLINE = "offline",
  TIMEOUT = "timeout",

  // API/server issues
  SERVER = "server",
  NOT_FOUND = "not_found",
  UNAUTHORIZED = "unauthorized",

  // Feature-specific issues
  TRIP_TRACKING = "trip_tracking",
  EQUIPMENT = "equipment",
  ALERTS = "alerts",
  COMMUTE = "commute",
  STATION_DATA = "station_data",
  PUSH_NOTIFICATIONS = "push_notifications",
  GEOLOCATION = "geolocation",

  // General/parsing issues
  PARSE = "parse",
  UNKNOWN = "unknown",
}

/**
 * User-friendly error message with recovery suggestions
 */
export interface UserErrorMessage {
  /** Short title/headline for the error */
  title: string;
  /** Detailed explanation of what went wrong */
  message: string;
  /** Suggested action the user can take */
  suggestion?: string;
  /** Whether the error is retryable */
  retryable: boolean;
  /** Error category for grouping/analytics */
  category: ErrorCategory;
}

/**
 * Get a user-friendly error message based on error type and context
 */
export function getUserErrorMessage(
  errorType: ApiErrorType | ErrorCategory,
  context?: string
): UserErrorMessage {
  // Handle context-specific errors first
  if (context) {
    const contextMessage = getContextualErrorMessage(errorType, context);
    if (contextMessage) return contextMessage;
  }

  // Fall back to default error type messages
  return getDefaultErrorMessage(errorType);
}

/**
 * Get context-specific error messages
 */
function getContextualErrorMessage(
  errorType: ApiErrorType | ErrorCategory,
  context: string
): UserErrorMessage | null {
  const contextKey = context.toLowerCase();

  // Trip tracking errors
  if (contextKey.includes("trip") || errorType === ErrorCategory.TRIP_TRACKING) {
    if (errorType === ApiErrorTypeEnum.NOT_FOUND || errorType === ErrorCategory.NOT_FOUND) {
      return {
        title: "Train not found",
        message:
          "This train is no longer in the system. It may have completed its trip or the tracking ID has expired.",
        suggestion: "Search for your destination again to track a different train.",
        retryable: false,
        category: ErrorCategory.TRIP_TRACKING,
      };
    }
    return {
      title: "Unable to track train",
      message: "We couldn't fetch the current status of this train.",
      suggestion:
        "Check your connection and try again, or search for your destination to see other options.",
      retryable: true,
      category: ErrorCategory.TRIP_TRACKING,
    };
  }

  // Equipment/elevator errors
  if (contextKey.includes("equipment") || errorType === ErrorCategory.EQUIPMENT) {
    return {
      title: "Unable to check elevator status",
      message: "We couldn't fetch the current status of station equipment.",
      suggestion:
        "For immediate accessibility assistance, call MTA Accessibility at 511 or visit mta.info.",
      retryable: true,
      category: ErrorCategory.EQUIPMENT,
    };
  }

  // Alerts/service status errors
  if (contextKey.includes("alert") || errorType === ErrorCategory.ALERTS) {
    return {
      title: "Unable to load service alerts",
      message: "We couldn't fetch the latest service alerts.",
      suggestion:
        "Check @MTA on Twitter or visit mta.info for service updates. You can still see arrivals based on the schedule.",
      retryable: true,
      category: ErrorCategory.ALERTS,
    };
  }

  // Commute/routing errors
  if (contextKey.includes("commute") || errorType === ErrorCategory.COMMUTE) {
    if (errorType === ApiErrorTypeEnum.NOT_FOUND || errorType === ErrorCategory.NOT_FOUND) {
      return {
        title: "Route not found",
        message: "We couldn't find a route between these stations.",
        suggestion:
          "Make sure both stations are valid subway stations. Try searching for stations by name or line.",
        retryable: false,
        category: ErrorCategory.COMMUTE,
      };
    }
    return {
      title: "Unable to plan route",
      message: "We couldn't analyze this commute right now.",
      suggestion:
        "Check that your origin and destination stations are correct. You can still view arrivals for individual stations.",
      retryable: true,
      category: ErrorCategory.COMMUTE,
    };
  }

  // Station data errors
  if (contextKey.includes("station") || errorType === ErrorCategory.STATION_DATA) {
    return {
      title: "Unable to load station data",
      message: "We couldn't fetch information about this station.",
      suggestion:
        "Try searching for the station again. If the problem persists, your station may not be in our database.",
      retryable: true,
      category: ErrorCategory.STATION_DATA,
    };
  }

  // Push notification errors
  if (contextKey.includes("push") || errorType === ErrorCategory.PUSH_NOTIFICATIONS) {
    return {
      title: "Notification setup failed",
      message: "We couldn't set up push notifications for this device.",
      suggestion:
        "Make sure you've granted notification permission in your browser settings. Try again or use the app without notifications.",
      retryable: true,
      category: ErrorCategory.PUSH_NOTIFICATIONS,
    };
  }

  // Geolocation errors
  if (contextKey.includes("location") || errorType === ErrorCategory.GEOLOCATION) {
    return {
      title: "Unable to find your location",
      message: "We couldn't determine your current location.",
      suggestion:
        "Enable location services in your browser settings, or search for stations manually.",
      retryable: true,
      category: ErrorCategory.GEOLOCATION,
    };
  }

  return null;
}

/**
 * Get default error messages by type (no context)
 */
function getDefaultErrorMessage(errorType: ApiErrorType | ErrorCategory): UserErrorMessage {
  switch (errorType) {
    case ApiErrorTypeEnum.OFFLINE:
    case ErrorCategory.OFFLINE:
      return {
        title: "You're offline",
        message: "No internet connection detected. Some features may be limited.",
        suggestion: "Connect to WiFi or cellular data to get live arrivals and alerts.",
        retryable: true,
        category: ErrorCategory.OFFLINE,
      };

    case ApiErrorTypeEnum.TIMEOUT:
    case ErrorCategory.TIMEOUT:
      return {
        title: "Request timed out",
        message: "The server took too long to respond.",
        suggestion:
          "Check your connection speed and try again. If the problem continues, the MTA data feed may be slow.",
        retryable: true,
        category: ErrorCategory.TIMEOUT,
      };

    case ApiErrorTypeEnum.NETWORK:
    case ErrorCategory.NETWORK:
      return {
        title: "Connection error",
        message: "We couldn't reach the server. This might be a temporary network issue.",
        suggestion: "Check your internet connection and try again.",
        retryable: true,
        category: ErrorCategory.NETWORK,
      };

    case ApiErrorTypeEnum.SERVER:
    case ErrorCategory.SERVER:
      return {
        title: "Server error",
        message: "Something went wrong on our end.",
        suggestion: "We're working to fix this. Please try again in a moment.",
        retryable: true,
        category: ErrorCategory.SERVER,
      };

    case ApiErrorTypeEnum.NOT_FOUND:
    case ErrorCategory.NOT_FOUND:
      return {
        title: "Not found",
        message: "The requested information wasn't found.",
        suggestion: "The resource may have been moved or deleted. Try searching again.",
        retryable: false,
        category: ErrorCategory.NOT_FOUND,
      };

    case ApiErrorTypeEnum.UNAUTHORIZED:
    case ErrorCategory.UNAUTHORIZED:
      return {
        title: "Access denied",
        message: "You don't have permission to access this resource.",
        suggestion: "If this is an error, try refreshing the page or logging in again.",
        retryable: false,
        category: ErrorCategory.UNAUTHORIZED,
      };

    case ApiErrorTypeEnum.PARSE:
    case ErrorCategory.PARSE:
      return {
        title: "Data error",
        message: "We received some data we couldn't understand.",
        suggestion:
          "This is usually a temporary issue. Try refreshing or checking back in a moment.",
        retryable: true,
        category: ErrorCategory.PARSE,
      };

    case ApiErrorTypeEnum.UNKNOWN:
    case ErrorCategory.UNKNOWN:
    default:
      return {
        title: "Something went wrong",
        message: "An unexpected error occurred.",
        suggestion: "Try refreshing the page. If the problem continues, please check back later.",
        retryable: true,
        category: ErrorCategory.UNKNOWN,
      };
  }
}

/**
 * Format error message for display in UI
 * Returns a concise message combining title and suggestion
 */
export function formatErrorMessage(error: UserErrorMessage): string {
  if (error.suggestion) {
    return `${error.message} ${error.suggestion}`;
  }
  return error.message;
}

/**
 * Get a short error message (for compact displays)
 */
export function getShortErrorMessage(error: UserErrorMessage): string {
  return error.title;
}
