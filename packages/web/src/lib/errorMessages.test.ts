/**
 * Tests for errorMessages utilities
 *
 * Tests user-friendly error message generation including:
 * - Error type mapping to messages
 * - Context-specific error messages
 * - Message formatting
 */

import { describe, expect, it } from "vitest";
import { ApiErrorType } from "./apiEnhanced";
import {
  ErrorCategory,
  formatErrorMessage,
  getDefaultErrorMessage,
  getShortErrorMessage,
  getUserErrorMessage,
} from "./errorMessages";

describe("getUserErrorMessage", () => {
  describe("without context", () => {
    it("returns offline message for OFFLINE error", () => {
      const result = getUserErrorMessage(ApiErrorType.OFFLINE);
      expect(result.title).toBe("You're offline");
      expect(result.category).toBe(ErrorCategory.OFFLINE);
      expect(result.retryable).toBe(true);
      expect(result.suggestion).toBeDefined();
    });

    it("returns timeout message for TIMEOUT error", () => {
      const result = getUserErrorMessage(ApiErrorType.TIMEOUT);
      expect(result.title).toBe("Request timed out");
      expect(result.category).toBe(ErrorCategory.TIMEOUT);
      expect(result.retryable).toBe(true);
    });

    it("returns network message for NETWORK error", () => {
      const result = getUserErrorMessage(ApiErrorType.NETWORK);
      expect(result.title).toBe("Connection error");
      expect(result.category).toBe(ErrorCategory.NETWORK);
      expect(result.retryable).toBe(true);
    });

    it("returns server message for SERVER error", () => {
      const result = getUserErrorMessage(ApiErrorType.SERVER);
      expect(result.title).toBe("Server error");
      expect(result.category).toBe(ErrorCategory.SERVER);
      expect(result.retryable).toBe(true);
    });

    it("returns not found message for NOT_FOUND error", () => {
      const result = getUserErrorMessage(ApiErrorType.NOT_FOUND);
      expect(result.title).toBe("Not found");
      expect(result.category).toBe(ErrorCategory.NOT_FOUND);
      expect(result.retryable).toBe(false);
    });

    it("returns unauthorized message for UNAUTHORIZED error", () => {
      const result = getUserErrorMessage(ApiErrorType.UNAUTHORIZED);
      expect(result.title).toBe("Access denied");
      expect(result.category).toBe(ErrorCategory.UNAUTHORIZED);
      expect(result.retryable).toBe(false);
    });

    it("returns parse message for PARSE error", () => {
      const result = getUserErrorMessage(ApiErrorType.PARSE);
      expect(result.title).toBe("Data error");
      expect(result.category).toBe(ErrorCategory.PARSE);
      expect(result.retryable).toBe(true);
    });

    it("returns unknown message for UNKNOWN error", () => {
      const result = getUserErrorMessage(ApiErrorType.UNKNOWN);
      expect(result.title).toBe("Something went wrong");
      expect(result.category).toBe(ErrorCategory.UNKNOWN);
      expect(result.retryable).toBe(true);
    });
  });

  describe("with context", () => {
    it("returns trip-specific message for trip context", () => {
      const result = getUserErrorMessage(ApiErrorType.NOT_FOUND, "trip");

      expect(result.title).toBe("Train not found");
      expect(result.category).toBe(ErrorCategory.TRIP_TRACKING);
      expect(result.retryable).toBe(false);
      expect(result.suggestion).toContain("Search for your destination");
    });

    it("returns equipment-specific message for equipment context", () => {
      const result = getUserErrorMessage(ApiErrorType.NETWORK, "equipment");

      expect(result.title).toBe("Unable to check elevator status");
      expect(result.category).toBe(ErrorCategory.EQUIPMENT);
      expect(result.suggestion).toContain("MTA Accessibility");
    });

    it("returns alert-specific message for alerts context", () => {
      const result = getUserErrorMessage(ApiErrorType.SERVER, "alerts");

      expect(result.title).toBe("Unable to load service alerts");
      expect(result.category).toBe(ErrorCategory.ALERTS);
      expect(result.suggestion).toContain("@MTA");
    });

    it("returns commute-specific message for commute context", () => {
      const result = getUserErrorMessage(ApiErrorType.NOT_FOUND, "commute");

      expect(result.title).toBe("Route not found");
      expect(result.category).toBe(ErrorCategory.COMMUTE);
      expect(result.suggestion).toContain("valid subway stations");
    });

    it("returns station-specific message for station context", () => {
      const result = getUserErrorMessage(ApiErrorType.TIMEOUT, "station");

      expect(result.title).toBe("Unable to load station data");
      expect(result.category).toBe(ErrorCategory.STATION_DATA);
      expect(result.suggestion).toContain("searching for the station");
    });

    it("returns push notification message for push context", () => {
      const result = getUserErrorMessage(ApiErrorType.NETWORK, "push");

      expect(result.title).toBe("Notification setup failed");
      expect(result.category).toBe(ErrorCategory.PUSH_NOTIFICATIONS);
      expect(result.suggestion).toContain("notification permission");
    });

    it("returns geolocation message for location context", () => {
      const result = getUserErrorMessage(ApiErrorType.UNKNOWN, "location");

      expect(result.title).toBe("Unable to find your location");
      expect(result.category).toBe(ErrorCategory.GEOLOCATION);
      expect(result.suggestion).toContain("location services");
    });

    it("is case-insensitive for context matching", () => {
      const result1 = getUserErrorMessage(ApiErrorType.NOT_FOUND, "Trip");
      const result2 = getUserErrorMessage(ApiErrorType.NOT_FOUND, "TRIP");
      const result3 = getUserErrorMessage(ApiErrorType.NOT_FOUND, "trip");

      expect(result1.title).toBe(result2.title);
      expect(result2.title).toBe(result3.title);
    });
  });
});

describe("getDefaultErrorMessage", () => {
  it("returns appropriate message for each ErrorCategory", () => {
    const offlineMsg = getDefaultErrorMessage(ErrorCategory.OFFLINE);
    expect(offlineMsg.title).toBe("You're offline");

    const serverMsg = getDefaultErrorMessage(ErrorCategory.SERVER);
    expect(serverMsg.title).toBe("Server error");

    const notFoundMsg = getDefaultErrorMessage(ErrorCategory.NOT_FOUND);
    expect(notFoundMsg.title).toBe("Not found");
  });
});

describe("formatErrorMessage", () => {
  it("combines message and suggestion when both exist", () => {
    const error = {
      title: "Test Error",
      message: "Something went wrong.",
      suggestion: "Please try again.",
      retryable: true,
      category: ErrorCategory.UNKNOWN,
    };

    const formatted = formatErrorMessage(error);
    expect(formatted).toBe("Something went wrong. Please try again.");
  });

  it("returns just message when no suggestion", () => {
    const error = {
      title: "Test Error",
      message: "Something went wrong.",
      retryable: false,
      category: ErrorCategory.UNKNOWN,
    };

    const formatted = formatErrorMessage(error);
    expect(formatted).toBe("Something went wrong.");
  });
});

describe("getShortErrorMessage", () => {
  it("returns the title as short message", () => {
    const error = {
      title: "Connection Error",
      message: "Long detailed message about connection issues.",
      suggestion: "Check your internet connection.",
      retryable: true,
      category: ErrorCategory.NETWORK,
    };

    const short = getShortErrorMessage(error);
    expect(short).toBe("Connection Error");
  });
});

describe("Error messages have all required fields", () => {
  const errorTypes = Object.values(ApiErrorType);

  it.each(errorTypes)("'%s' error has all required fields", (errorType) => {
    const message = getUserErrorMessage(errorType);

    expect(message).toHaveProperty("title");
    expect(message).toHaveProperty("message");
    expect(message).toHaveProperty("retryable");
    expect(message).toHaveProperty("category");

    expect(typeof message.title).toBe("string");
    expect(typeof message.message).toBe("string");
    expect(typeof message.retryable).toBe("boolean");
    expect(typeof message.category).toBe("string");

    // Title and message should not be empty
    expect(message.title.length).toBeGreaterThan(0);
    expect(message.message.length).toBeGreaterThan(0);
  });
});

describe("Retryable errors", () => {
  it("marks network errors as retryable", () => {
    const message = getUserErrorMessage(ApiErrorType.NETWORK);
    expect(message.retryable).toBe(true);
  });

  it("marks timeout errors as retryable", () => {
    const message = getUserErrorMessage(ApiErrorType.TIMEOUT);
    expect(message.retryable).toBe(true);
  });

  it("marks server errors as retryable", () => {
    const message = getUserErrorMessage(ApiErrorType.SERVER);
    expect(message.retryable).toBe(true);
  });

  it("marks not found errors as not retryable", () => {
    const message = getUserErrorMessage(ApiErrorType.NOT_FOUND);
    expect(message.retryable).toBe(false);
  });

  it("marks unauthorized errors as not retryable", () => {
    const message = getUserErrorMessage(ApiErrorType.UNAUTHORIZED);
    expect(message.retryable).toBe(false);
  });
});
