/**
 * Memoization utilities for performance optimization.
 *
 * Per plan.md Phase 4: Performance optimization.
 *
 * Features:
 *   - Cache function results based on arguments
 *   - Configurable cache size and TTL
 *   - Useful for expensive computations
 */

interface CacheEntry<T> {
  value: T;
  timestamp: number;
}

interface MemoizeOptions {
  /** Maximum number of cached results (default: 100) */
  maxSize?: number;
  /** Cache TTL in milliseconds (default: 5 minutes) */
  ttl?: number;
}

/**
 * memoize - Memoize a function with optional size and time limits
 *
 * Usage:
 *   const expensiveCalc = (x: number) => {
 *     // ... expensive computation
 *     return result;
 *   };
 *   const memoized = memoize(expensiveCalc, { maxSize: 50, ttl: 60000 });
 */
export function memoize<T extends (...args: unknown[]) => ReturnType<T>>(
  fn: T,
  options: MemoizeOptions = {}
): T {
  const { maxSize = 100, ttl = 5 * 60 * 1000 } = options;
  const cache = new Map<string, CacheEntry<ReturnType<T>>>();

  return ((...args: Parameters<T>) => {
    const key = JSON.stringify(args);
    const now = Date.now();

    // Check cache
    const entry = cache.get(key);
    if (entry && now - entry.timestamp < ttl) {
      return entry.value;
    }

    // Compute result
    const result = fn(...args);

    // Store in cache
    cache.set(key, { value: result, timestamp: now });

    // Prune cache if over size limit
    if (cache.size > maxSize) {
      // Delete oldest entries (FIFO)
      const entries = Array.from(cache.entries());
      entries.slice(0, entries.length - maxSize).forEach(([k]) => cache.delete(k));
    }

    return result;
  }) as T;
}

/**
 * memoizeAsync - Memoize an async function
 *
 * Usage:
 *   const fetchData = async (id: string) => {
 *     const response = await fetch(`/api/data/${id}`);
 *     return response.json();
 *   };
 *   const memoizedFetch = memoizeAsync(fetchData);
 */
export function memoizeAsync<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  options: MemoizeOptions = {}
): T {
  const { maxSize = 100, ttl = 5 * 60 * 1000 } = options;
  const cache = new Map<string, CacheEntry<Awaited<ReturnType<T>>>>();
  const pending = new Map<string, Promise<Awaited<ReturnType<T>>>>();

  return (async (...args: Parameters<T>) => {
    const key = JSON.stringify(args);
    const now = Date.now();

    // Check cache
    const entry = cache.get(key);
    if (entry && now - entry.timestamp < ttl) {
      return entry.value;
    }

    // Check if request is pending
    const pendingPromise = pending.get(key);
    if (pendingPromise) {
      return pendingPromise;
    }

    // Make request
    const promise = fn(...args).then((result) => {
      // Cache result
      cache.set(key, { value: result as Awaited<ReturnType<T>>, timestamp: now });
      pending.delete(key);

      // Prune cache if over size limit
      if (cache.size > maxSize) {
        const entries = Array.from(cache.entries());
        entries.slice(0, entries.length - maxSize).forEach(([k]) => cache.delete(k));
      }

      return result;
    }) as Promise<Awaited<ReturnType<T>>>;

    pending.set(key, promise);
    return promise;
  }) as T;
}

/**
 * debounce - Debounce a function call
 *
 * Usage:
 *   const debouncedSearch = debounce((query: string) => {
 *     // perform search
 *   }, 300);
 */
export function debounce<T extends (...args: unknown[]) => ReturnType<T>>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delay);
  };
}

/**
 * throttle - Throttle a function call
 *
 * Usage:
 *   const throttledScroll = throttle(() => {
 *     // handle scroll
 *   }, 100);
 */
export function throttle<T extends (...args: unknown[]) => ReturnType<T>>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    const now = Date.now();
    const timeSinceLastCall = now - lastCall;

    if (timeSinceLastCall >= delay) {
      fn(...args);
      lastCall = now;
    } else if (!timeoutId) {
      timeoutId = setTimeout(() => {
        fn(...args);
        lastCall = Date.now();
        timeoutId = null;
      }, delay - timeSinceLastCall);
    }
  };
}

/**
 * createLRUCache - Create an LRU (Least Recently Used) cache
 *
 * Usage:
 *   const cache = createLRUCache<string, number>(50);
 *   cache.set('key', 42);
 *   const value = cache.get('key'); // 42
 */
export function createLRUCache<K, V>(maxSize: number) {
  const cache = new Map<K, V>();

  return {
    get(key: K): V | undefined {
      const value = cache.get(key);
      if (value !== undefined) {
        // Remove and re-add to update order (most recently used)
        cache.delete(key);
        cache.set(key, value);
      }
      return value;
    },
    set(key: K, value: V): void {
      if (cache.has(key)) {
        // Update existing key - remove first to update position
        cache.delete(key);
      } else if (cache.size >= maxSize) {
        // Delete least recently used (first item)
        const firstKey = cache.keys().next().value;
        if (firstKey !== undefined) {
          cache.delete(firstKey);
        }
      }
      cache.set(key, value);
    },
    has(key: K): boolean {
      return cache.has(key);
    },
    clear(): void {
      cache.clear();
    },
    get size(): number {
      return cache.size;
    },
  };
}

/**
 * Memoize comparator for sorting - prevents re-sorting if data hasn't changed
 *
 * Usage:
 *   const memoizedSort = memoizeSort((a, b) => a.localeCompare(b));
 *   items.sort(memoizedSort);
 */
export function memoizeSort<T>(comparator: (a: T, b: T) => number): (a: T, b: T) => number {
  let lastA: T | null = null;
  let lastB: T | null = null;
  let lastResult = 0;

  return (a: T, b: T) => {
    if (lastA === a && lastB === b) {
      return lastResult;
    }
    lastResult = comparator(a, b);
    lastA = a;
    lastB = b;
    return lastResult;
  };
}

export default memoize;
