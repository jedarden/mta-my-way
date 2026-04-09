/**
 * useDebounce - Debounce a value with optional leading/trailing edge control.
 *
 * Per plan.md Phase 4: Performance optimization.
 *
 * Features:
 *   - Configurable delay
 *   - Leading edge execution (execute immediately on first call)
 *   - Trailing edge execution (execute after delay period)
 *   - Cleanup on unmount
 *   - TypeScript type safety
 *
 * Usage:
 *   const debouncedSearch = useDebounce(searchTerm, 300);
 *   // debouncedSearch will update 300ms after searchTerm stops changing
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useOnlineStatus } from "./useOnlineStatus";

interface UseDebounceOptions {
  /** Execute on the leading edge of the timeout (default: false) */
  leading?: boolean;
  /** Execute on the trailing edge of the timeout (default: true) */
  trailing?: boolean;
  /** Maximum time the value is allowed to be delayed before execution */
  maxWait?: number;
}

/**
 * Debounce a value with configurable options
 *
 * @param value - The value to debounce
 * @param delay - Delay in milliseconds (default: 300ms)
 * @param options - Configuration options for debounce behavior
 * @returns The debounced value
 */
export function useDebounce<T>(value: T, delay: number = 300, options: UseDebounceOptions = {}): T {
  const { leading = false, trailing = true, maxWait } = options;
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let maxTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let hasLeadingExecuted = false;

    const scheduleDebounce = () => {
      // Leading edge execution (immediate on first change)
      if (leading && !hasLeadingExecuted) {
        setDebouncedValue(value);
        hasLeadingExecuted = true;
      }

      // Clear any existing timeouts
      if (timeoutId) clearTimeout(timeoutId);
      if (maxTimeoutId) clearTimeout(maxTimeoutId);

      // Trailing edge execution (after delay)
      if (trailing) {
        timeoutId = setTimeout(() => {
          setDebouncedValue(value);
          hasLeadingExecuted = false;
        }, delay);

        // Max wait timeout (if specified)
        if (maxWait && maxWait > delay) {
          maxTimeoutId = setTimeout(() => {
            if (timeoutId) clearTimeout(timeoutId);
            setDebouncedValue(value);
            hasLeadingExecuted = false;
          }, maxWait);
        }
      } else {
        // No trailing, just reset leading flag after delay
        timeoutId = setTimeout(() => {
          hasLeadingExecuted = false;
        }, delay);
      }
    };

    scheduleDebounce();

    // Cleanup on unmount or value change
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (maxTimeoutId) clearTimeout(maxTimeoutId);
    };
  }, [value, delay, leading, trailing, maxWait]);

  return debouncedValue;
}

/**
 * useDebouncedCallback - Debounce a function callback.
 *
 * Useful for debouncing event handlers directly without managing state.
 *
 * Usage:
 *   const debouncedHandleChange = useDebouncedCallback(
 *     (value) => console.log(value),
 *     300
 *   );
 */
export function useDebouncedCallback<T extends (...args: unknown[]) => void>(
  callback: T,
  delay: number = 300,
  options: UseDebounceOptions = {}
): T {
  return useEffectDebouncedCallback(callback, delay, options) as T;
}

/**
 * Internal implementation of debounced callback using useEffect
 */
function useEffectDebouncedCallback<T extends (...args: unknown[]) => void>(
  callback: T,
  delay: number,
  options: UseDebounceOptions
): (...args: Parameters<T>) => void {
  const { leading = false, trailing = true, maxWait } = options;
  const [argsQueue, setArgsQueue] = useState<Parameters<T> | null>(null);

  // Create the debounced callback
  useEffect(() => {
    if (argsQueue === null) return;

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let maxTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let hasLeadingExecuted = false;

    const scheduleExecution = () => {
      // Leading edge execution
      if (leading && !hasLeadingExecuted) {
        callback(...argsQueue);
        hasLeadingExecuted = true;
      }

      // Clear any existing timeouts
      if (timeoutId) clearTimeout(timeoutId);
      if (maxTimeoutId) clearTimeout(maxTimeoutId);

      // Trailing edge execution
      if (trailing) {
        timeoutId = setTimeout(() => {
          callback(...argsQueue);
          hasLeadingExecuted = false;
        }, delay);

        // Max wait timeout
        if (maxWait && maxWait > delay) {
          maxTimeoutId = setTimeout(() => {
            if (timeoutId) clearTimeout(timeoutId);
            callback(...argsQueue);
            hasLeadingExecuted = false;
          }, maxWait);
        }
      } else {
        // No trailing, just reset leading flag
        timeoutId = setTimeout(() => {
          hasLeadingExecuted = false;
        }, delay);
      }
    };

    scheduleExecution();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (maxTimeoutId) clearTimeout(maxTimeoutId);
    };
  }, [argsQueue, callback, delay, leading, trailing, maxWait]);

  // Return a function that queues the arguments
  return (...args: Parameters<T>) => {
    setArgsQueue(args);
  };
}

/**
 * useThrottle - Throttle a value to update at most once per delay period.
 *
 * Unlike debounce, throttle guarantees execution at regular intervals.
 *
 * Usage:
 *   const throttledScroll = useThrottle(scrollPosition, 100);
 *   // throttledScroll updates at most once every 100ms
 */
export function useThrottle<T>(value: T, delay: number = 100): T {
  const [throttledValue, setThrottledValue] = useState<T>(value);
  const lastExecutedRef = useRef<number>(0);
  const lastValueRef = useRef<T>(value);

  useLayoutEffect(() => {
    const now = Date.now();
    const timeSinceLastExecution = now - lastExecutedRef.current;
    const hasValueChanged = lastValueRef.current !== value;

    // Update the ref to track the current value
    lastValueRef.current = value;

    if (hasValueChanged && (!lastExecutedRef.current || timeSinceLastExecution >= delay)) {
      // First value change or enough time has passed, update immediately
      lastExecutedRef.current = now;
      setThrottledValue(value);
    } else if (hasValueChanged) {
      // Not enough time, schedule update for remaining time
      const timeoutId = setTimeout(() => {
        lastExecutedRef.current = Date.now();
        setThrottledValue(value);
      }, delay - timeSinceLastExecution);

      return () => clearTimeout(timeoutId);
    }
  }, [value, delay]);

  return throttledValue;
}

/**
 * useRefetch - Debounced refetch with automatic retry on connectivity change.
 *
 * Perfect for API calls that should retry when the user comes back online.
 *
 * Usage:
 *   const { refetch, isRefetching } = useRefetch(fetchArrivals, 5000);
 */
export function useRefetch<T extends (...args: unknown[]) => Promise<unknown>>(
  refetchFn: T,
  debounceDelay: number = 1000
): {
  refetch: (...args: Parameters<T>) => Promise<unknown>;
  isRefetching: boolean;
  cancelRefetch: () => void;
} {
  const [isRefetching, setIsRefetching] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isOnline = useOnlineStatus();

  const refetch = async (...args: Parameters<T>): Promise<unknown> => {
    // Cancel any pending refetch
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    setIsRefetching(true);

    try {
      const result = await refetchFn(...args);
      setIsRefetching(false);
      return result;
    } catch (error) {
      // If offline, schedule retry for when connectivity returns
      if (!isOnline) {
        timeoutRef.current = setTimeout(() => {
          void refetch(...args);
        }, debounceDelay);
      } else {
        setIsRefetching(false);
      }
      throw error;
    }
  };

  const cancelRefetch = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsRefetching(false);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return { refetch, isRefetching, cancelRefetch };
}
