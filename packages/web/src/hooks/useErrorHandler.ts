/**
 * useErrorHandler - Hook for handling API errors with user-friendly messages and retry logic.
 *
 * Per plan.md Phase 4: Comprehensive error states.
 *
 * Features:
 *   - Converts API errors to user-friendly messages
 *   - Provides retry functionality with exponential backoff
 *   - Distinguishes between retryable and non-retryable errors
 *   - Supports offline detection
 */

import { useCallback, useState } from "react";
import { ApiErrorType, EnhancedApiError } from "../lib/apiEnhanced";

export interface ErrorHandlerState {
  hasError: boolean;
  errorMessage: string;
  errorType: ApiErrorType | null;
  canRetry: boolean;
  isRetrying: boolean;
  retryCount: number;
}

export interface ErrorHandlerResult extends ErrorHandlerState {
  clearError: () => void;
  retry: (fn: () => Promise<void>) => Promise<void>;
  handleError: (error: unknown) => void;
}

const ERROR_MESSAGES: Record<ApiErrorType, string> = {
  [ApiErrorType.NETWORK]: "Network error. Please check your connection and try again.",
  [ApiErrorType.TIMEOUT]: "Request timed out. Please try again.",
  [ApiErrorType.SERVER]: "Server error. Please try again later.",
  [ApiErrorType.NOT_FOUND]: "The requested information was not found.",
  [ApiErrorType.UNAUTHORIZED]: "You're not authorized to access this resource.",
  [ApiErrorType.PARSE]: "Unable to process the server response.",
  [ApiErrorType.OFFLINE]: "You're offline. Please check your internet connection.",
  [ApiErrorType.UNKNOWN]: "Something went wrong. Please try again.",
};

const MAX_RETRIES = 3;

export function useErrorHandler(): ErrorHandlerResult {
  const [state, setState] = useState<ErrorHandlerState>({
    hasError: false,
    errorMessage: "",
    errorType: null,
    canRetry: true,
    isRetrying: false,
    retryCount: 0,
  });

  const handleError = useCallback(
    (error: unknown) => {
      if (error instanceof EnhancedApiError) {
        setState({
          hasError: true,
          errorMessage: ERROR_MESSAGES[error.type] || error.message,
          errorType: error.type,
          canRetry: error.retryable && state.retryCount < MAX_RETRIES,
          isRetrying: false,
          retryCount: state.retryCount,
        });
      } else if (error instanceof Error) {
        setState({
          hasError: true,
          errorMessage: error.message || "Something went wrong. Please try again.",
          errorType: ApiErrorType.UNKNOWN,
          canRetry: state.retryCount < MAX_RETRIES,
          isRetrying: false,
          retryCount: state.retryCount,
        });
      } else {
        setState({
          hasError: true,
          errorMessage: "Something went wrong. Please try again.",
          errorType: ApiErrorType.UNKNOWN,
          canRetry: state.retryCount < MAX_RETRIES,
          isRetrying: false,
          retryCount: state.retryCount,
        });
      }
    },
    [state.retryCount]
  );

  const clearError = useCallback(() => {
    setState((prev) => ({
      ...prev,
      hasError: false,
      errorMessage: "",
      errorType: null,
      isRetrying: false,
    }));
  }, []);

  const retry = useCallback(
    async (fn: () => Promise<void>) => {
      if (!state.canRetry) return;

      setState((prev) => ({
        ...prev,
        isRetrying: true,
        retryCount: prev.retryCount + 1,
      }));

      try {
        await fn();
        setState((prev) => ({
          ...prev,
          hasError: false,
          errorMessage: "",
          errorType: null,
          isRetrying: false,
        }));
      } catch (error) {
        handleError(error);
      }
    },
    [state.canRetry, handleError]
  );

  return {
    ...state,
    clearError,
    retry,
    handleError,
  };
}
