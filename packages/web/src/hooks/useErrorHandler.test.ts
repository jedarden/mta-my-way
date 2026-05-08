/**
 * Unit tests for useErrorHandler hook
 *
 * Tests error handling with user-friendly messages and retry logic.
 */

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiErrorType, EnhancedApiError } from "../lib/apiEnhanced";
import { useErrorHandler } from "./useErrorHandler";

describe("useErrorHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("initial state", () => {
    it("returns initial state with no errors", () => {
      const { result } = renderHook(() => useErrorHandler());

      expect(result.current.hasError).toBe(false);
      expect(result.current.errorMessage).toBe("");
      expect(result.current.errorType).toBeNull();
      expect(result.current.canRetry).toBe(true);
      expect(result.current.isRetrying).toBe(false);
      expect(result.current.retryCount).toBe(0);
    });
  });

  describe("handleError", () => {
    it("handles EnhancedApiError correctly", () => {
      const { result } = renderHook(() => useErrorHandler());
      const error = new EnhancedApiError({
        type: ApiErrorType.NETWORK,
        message: "Network request failed",
        retryable: true,
      });

      act(() => {
        result.current.handleError(error);
      });

      expect(result.current.hasError).toBe(true);
      expect(result.current.errorMessage).toBe(
        "Network error. Please check your connection and try again."
      );
      expect(result.current.errorType).toBe(ApiErrorType.NETWORK);
      expect(result.current.canRetry).toBe(true);
    });

    it("handles generic Error correctly", () => {
      const { result } = renderHook(() => useErrorHandler());
      const error = new Error("Something went wrong");

      act(() => {
        result.current.handleError(error);
      });

      expect(result.current.hasError).toBe(true);
      expect(result.current.errorMessage).toBe("Something went wrong");
      expect(result.current.errorType).toBe(ApiErrorType.UNKNOWN);
      expect(result.current.canRetry).toBe(true);
    });

    it("handles unknown error types", () => {
      const { result } = renderHook(() => useErrorHandler());

      act(() => {
        result.current.handleError("string error");
      });

      expect(result.current.hasError).toBe(true);
      expect(result.current.errorMessage).toBe("Something went wrong. Please try again.");
      expect(result.current.errorType).toBe(ApiErrorType.UNKNOWN);
    });

    it("sets canRetry to false after max retries", async () => {
      const { result } = renderHook(() => useErrorHandler());
      const error = new EnhancedApiError({
        type: ApiErrorType.TIMEOUT,
        message: "Request timed out",
        retryable: true,
      });

      // Handle the error
      act(() => {
        result.current.handleError(error);
      });

      // Simulate 3 retries
      const retryFn = vi.fn().mockRejectedValue(error);

      for (let i = 0; i < 3; i++) {
        await act(async () => {
          await result.current.retry(retryFn);
        });
      }

      // After max retries, should not allow retry
      expect(result.current.canRetry).toBe(false);
      expect(result.current.retryCount).toBe(3);
    });

    it("uses error message from EnhancedApiError when available", () => {
      const { result } = renderHook(() => useErrorHandler());
      const error = new EnhancedApiError({
        type: ApiErrorType.SERVER,
        message: "Custom server error message",
        retryable: true,
      });

      act(() => {
        result.current.handleError(error);
      });

      expect(result.current.errorMessage).toBe("Server error. Please try again later.");
    });
  });

  describe("clearError", () => {
    it("clears error state", () => {
      const { result } = renderHook(() => useErrorHandler());
      const error = new EnhancedApiError({
        type: ApiErrorType.NETWORK,
        message: "Network error",
        retryable: true,
      });

      act(() => {
        result.current.handleError(error);
      });

      expect(result.current.hasError).toBe(true);

      act(() => {
        result.current.clearError();
      });

      expect(result.current.hasError).toBe(false);
      expect(result.current.errorMessage).toBe("");
      expect(result.current.errorType).toBeNull();
      expect(result.current.isRetrying).toBe(false);
    });

    it("preserves retryCount after clearing error", () => {
      const { result } = renderHook(() => useErrorHandler());
      const error = new EnhancedApiError({
        type: ApiErrorType.NETWORK,
        message: "Network error",
        retryable: true,
      });

      act(() => {
        result.current.handleError(error);
      });

      const initialRetryCount = result.current.retryCount;

      act(() => {
        result.current.clearError();
      });

      expect(result.current.retryCount).toBe(initialRetryCount);
    });
  });

  describe("retry", () => {
    it("executes retry function and clears error on success", async () => {
      const { result } = renderHook(() => useErrorHandler());
      const error = new EnhancedApiError({
        type: ApiErrorType.NETWORK,
        message: "Network error",
        retryable: true,
      });
      const retryFn = vi.fn().mockResolvedValue(undefined);

      act(() => {
        result.current.handleError(error);
      });

      expect(result.current.hasError).toBe(true);

      await act(async () => {
        await result.current.retry(retryFn);
      });

      expect(retryFn).toHaveBeenCalledTimes(1);
      expect(result.current.hasError).toBe(false);
      expect(result.current.isRetrying).toBe(false);
    });

    it("sets isRetrying during retry", async () => {
      const { result } = renderHook(() => useErrorHandler());
      const error = new EnhancedApiError({
        type: ApiErrorType.NETWORK,
        message: "Network error",
        retryable: true,
      });
      let resolveRetry: ((value: unknown) => void) | undefined;
      const retryFn = vi.fn(
        () =>
          new Promise((resolve) => {
            resolveRetry = resolve;
          })
      );

      act(() => {
        result.current.handleError(error);
      });

      act(() => {
        void result.current.retry(retryFn);
      });

      expect(result.current.isRetrying).toBe(true);

      await act(async () => {
        resolveRetry?.(undefined);
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(result.current.isRetrying).toBe(false);
    });

    it("handles retry failure and updates error state", async () => {
      const { result } = renderHook(() => useErrorHandler());
      const error = new EnhancedApiError({
        type: ApiErrorType.NETWORK,
        message: "Network error",
        retryable: true,
      });
      const retryFn = vi.fn().mockRejectedValue(
        new EnhancedApiError({
          type: ApiErrorType.TIMEOUT,
          message: "Request timed out",
          retryable: true,
        })
      );

      act(() => {
        result.current.handleError(error);
      });

      await act(async () => {
        await result.current.retry(retryFn);
      });

      expect(retryFn).toHaveBeenCalledTimes(1);
      expect(result.current.hasError).toBe(true);
      expect(result.current.errorType).toBe(ApiErrorType.TIMEOUT);
      expect(result.current.isRetrying).toBe(false);
    });

    it("increments retryCount on retry", async () => {
      const { result } = renderHook(() => useErrorHandler());
      const error = new EnhancedApiError({
        type: ApiErrorType.NETWORK,
        message: "Network error",
        retryable: true,
      });
      const retryFn = vi.fn().mockResolvedValue(undefined);

      act(() => {
        result.current.handleError(error);
      });

      const initialRetryCount = result.current.retryCount;

      await act(async () => {
        await result.current.retry(retryFn);
      });

      expect(result.current.retryCount).toBe(initialRetryCount + 1);
    });

    it("does not retry when canRetry is false", async () => {
      const { result } = renderHook(() => useErrorHandler());
      const error = new EnhancedApiError({
        type: ApiErrorType.NETWORK,
        message: "Network error",
        retryable: false,
      });
      const retryFn = vi.fn().mockResolvedValue(undefined);

      act(() => {
        result.current.handleError(error);
      });

      expect(result.current.canRetry).toBe(false);

      await act(async () => {
        await result.current.retry(retryFn);
      });

      expect(retryFn).not.toHaveBeenCalled();
    });
  });

  describe("error messages", () => {
    it("returns correct message for NETWORK error type", () => {
      const { result } = renderHook(() => useErrorHandler());
      const error = new EnhancedApiError({
        type: ApiErrorType.NETWORK,
        message: "",
        retryable: true,
      });

      act(() => {
        result.current.handleError(error);
      });

      expect(result.current.errorMessage).toBe(
        "Network error. Please check your connection and try again."
      );
    });

    it("returns correct message for TIMEOUT error type", () => {
      const { result } = renderHook(() => useErrorHandler());
      const error = new EnhancedApiError({
        type: ApiErrorType.TIMEOUT,
        message: "",
        retryable: true,
      });

      act(() => {
        result.current.handleError(error);
      });

      expect(result.current.errorMessage).toBe("Request timed out. Please try again.");
    });

    it("returns correct message for SERVER error type", () => {
      const { result } = renderHook(() => useErrorHandler());
      const error = new EnhancedApiError({
        type: ApiErrorType.SERVER,
        message: "",
        retryable: true,
      });

      act(() => {
        result.current.handleError(error);
      });

      expect(result.current.errorMessage).toBe("Server error. Please try again later.");
    });

    it("returns correct message for OFFLINE error type", () => {
      const { result } = renderHook(() => useErrorHandler());
      const error = new EnhancedApiError({
        type: ApiErrorType.OFFLINE,
        message: "",
        retryable: true,
      });

      act(() => {
        result.current.handleError(error);
      });

      expect(result.current.errorMessage).toBe(
        "You're offline. Please check your internet connection."
      );
    });

    it("returns correct message for UNAUTHORIZED error type", () => {
      const { result } = renderHook(() => useErrorHandler());
      const error = new EnhancedApiError({
        type: ApiErrorType.UNAUTHORIZED,
        message: "",
        retryable: true,
      });

      act(() => {
        result.current.handleError(error);
      });

      expect(result.current.errorMessage).toBe("You're not authorized to access this resource.");
    });
  });
});
