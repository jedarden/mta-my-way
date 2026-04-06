/**
 * Retry utility with exponential backoff
 *
 * Provides automatic retry mechanism for async operations that may fail transiently.
 * Configurable retry attempts and exponential backoff delay.
 */

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxAttempts?: number;
  /** Initial delay in milliseconds before first retry (default: 1000) */
  initialDelayMs?: number;
  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier?: number;
  /** Maximum delay between retries in milliseconds (default: 30000) */
  maxDelayMs?: number;
  /** Whether to add jitter to delay to prevent thundering herd (default: true) */
  jitter?: boolean;
  /** Predicate function to determine if error is retryable (default: retries all errors) */
  isRetryable?: (error: unknown) => boolean;
  /** Callback invoked before each retry attempt */
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
}

export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: unknown;
  attempts: number;
}

/**
 * Default HTTP status codes that should be retried
 */
const RETRYABLE_STATUS_CODES = new Set([
  408, // Request Timeout
  429, // Too Many Requests
  500, // Internal Server Error
  502, // Bad Gateway
  503, // Service Unavailable
  504, // Gateway Timeout
]);

/**
 * Default predicate for determining if an error is retryable
 *
 * Retries all errors by default, except for client errors (4xx) that are not
 * specifically retryable (like 408 Request Timeout or 429 Too Many Requests).
 */
function isDefaultRetryable(error: unknown): boolean {
  // HTTP errors with status codes
  if (error instanceof Error && "status" in error && typeof error.status === "number") {
    // Don't retry client errors (4xx) except for specific retryable ones
    // Most 4xx errors indicate user input problems that won't be fixed by retrying
    if (error.status >= 400 && error.status < 500) {
      return RETRYABLE_STATUS_CODES.has(error.status);
    }
    // Retry all 5xx server errors
    return true;
  }

  // Retry all other errors (network errors, unknown errors, etc.)
  return true;
}

/**
 * Calculate delay with exponential backoff and optional jitter
 */
function calculateDelay(
  attempt: number,
  initialDelayMs: number,
  backoffMultiplier: number,
  maxDelayMs: number,
  useJitter: boolean
): number {
  const exponentialDelay = initialDelayMs * Math.pow(backoffMultiplier, attempt - 1);
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);

  if (!useJitter) {
    return cappedDelay;
  }

  // Add +/- 25% jitter to prevent thundering herd
  const jitterFactor = 0.75 + Math.random() * 0.5; // 0.75 to 1.25
  return Math.floor(cappedDelay * jitterFactor);
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry an async operation with exponential backoff
 *
 * @example
 * ```ts
 * const result = await retryWithBackoff(
 *   () => fetch('https://api.example.com/data'),
 *   { maxAttempts: 5, initialDelayMs: 1000 }
 * );
 *
 * if (result.success) {
 *   console.log('Data:', result.data);
 * } else {
 *   console.error('Failed after', result.attempts, 'attempts');
 * }
 * ```
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const {
    maxAttempts = 3,
    initialDelayMs = 1000,
    backoffMultiplier = 2,
    maxDelayMs = 30000,
    jitter = true,
    isRetryable = isDefaultRetryable,
    onRetry,
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const data = await operation();
      return {
        success: true,
        data,
        attempts: attempt,
      };
    } catch (error) {
      lastError = error;

      // Don't retry if this is the last attempt or error is not retryable
      if (attempt === maxAttempts || !isRetryable(error)) {
        return {
          success: false,
          error,
          attempts: attempt,
        };
      }

      // Calculate delay and wait before next retry
      const delay = calculateDelay(attempt, initialDelayMs, backoffMultiplier, maxDelayMs, jitter);

      onRetry?.(attempt, error, delay);
      await sleep(delay);
    }
  }

  // Should never reach here, but TypeScript needs this
  return {
    success: false,
    error: lastError,
    attempts: maxAttempts,
  };
}

/**
 * Retry wrapper that throws on final failure (simpler API when you just want retries)
 *
 * @throws The last error encountered after all retry attempts are exhausted
 *
 * @example
 * ```ts
 * try {
 *   const data = await retry(() => fetch('https://api.example.com/data'), {
 *     maxAttempts: 3
 *   });
 * } catch (error) {
 *   console.error('Failed after retries:', error);
 * }
 * ```
 */
export async function retry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const result = await retryWithBackoff(operation, options);

  if (!result.success) {
    throw result.error;
  }

  // TypeScript doesn't narrow result.data correctly even though we check success above
  return result.data!;
}

/**
 * Create a retryable version of a fetch function with default options
 *
 * @example
 * ```ts
 * const fetchWithRetry = createRetryFetch({ maxAttempts: 5 });
 *
 * const response = await fetchWithRetry('https://api.example.com/data', {
 *   headers: { 'Authorization': 'Bearer token' }
 * });
 * ```
 */
export function createRetryFetch(defaultOptions: RetryOptions = {}) {
  return async function fetchWithRetry(url: string, init?: RequestInit): Promise<Response> {
    return retry(() => fetch(url, init), defaultOptions);
  };
}
