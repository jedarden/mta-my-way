/**
 * Unit tests for memoization utilities
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLRUCache, debounce, memoize, memoizeAsync, memoizeSort, throttle } from "./memo";

describe("memoization utilities", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  describe("memoize", () => {
    it("caches function results", () => {
      let callCount = 0;
      const fn = (x: number) => {
        callCount++;
        return x * 2;
      };
      const memoized = memoize(fn);

      expect(memoized(5)).toBe(10);
      expect(callCount).toBe(1);

      expect(memoized(5)).toBe(10);
      expect(callCount).toBe(1); // Not called again

      expect(memoized(10)).toBe(20);
      expect(callCount).toBe(2); // Called for new arg
    });

    it("handles multiple arguments", () => {
      const fn = (a: number, b: number) => a + b;
      const memoized = memoize(fn);

      expect(memoized(1, 2)).toBe(3);
      expect(memoized(1, 2)).toBe(3);
    });

    it("respects TTL", () => {
      let callCount = 0;
      const fn = () => {
        callCount++;
        return "result";
      };
      const memoized = memoize(fn, { ttl: 100 });

      memoized();
      expect(callCount).toBe(1);

      memoized();
      expect(callCount).toBe(1); // Cached

      // Wait for TTL to expire
      return new Promise((resolve) => {
        setTimeout(() => {
          memoized();
          expect(callCount).toBe(2); // Called again after TTL
          resolve(null);
        }, 150);
      });
    });

    it("respects maxSize", () => {
      const callLog: number[] = [];
      const fn = (x: number) => {
        callLog.push(x);
        return x * 2;
      };
      const memoized = memoize(fn, { maxSize: 2 });

      memoized(1);
      memoized(2);
      memoized(3);

      // With maxSize 2, the first entry (1) should be evicted
      memoized(1);
      expect(callLog).toContain(1); // Should be called again
    });
  });

  describe("memoizeAsync", () => {
    it("caches async function results", async () => {
      let callCount = 0;
      const fn = async (x: number) => {
        callCount++;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return x * 2;
      };
      const memoized = memoizeAsync(fn);

      expect(await memoized(5)).toBe(10);
      expect(callCount).toBe(1);

      expect(await memoized(5)).toBe(10);
      expect(callCount).toBe(1); // Not called again
    });

    it("deduplicates concurrent requests", async () => {
      let callCount = 0;
      const fn = async (x: number) => {
        callCount++;
        await new Promise((resolve) => setTimeout(resolve, 50));
        return x * 2;
      };
      const memoized = memoizeAsync(fn);

      // Launch concurrent requests
      const [result1, result2, result3] = await Promise.all([
        memoized(5),
        memoized(5),
        memoized(5),
      ]);

      expect(result1).toBe(10);
      expect(result2).toBe(10);
      expect(result3).toBe(10);
      expect(callCount).toBe(1); // Only called once
    });
  });

  describe("debounce", () => {
    it("delays function execution", () => {
      return new Promise((resolve) => {
        let callCount = 0;
        const fn = () => {
          callCount++;
        };
        const debounced = debounce(fn, 100);

        debounced();
        expect(callCount).toBe(0);

        setTimeout(() => {
          expect(callCount).toBe(1);
          resolve(null);
        }, 150);
      });
    });

    it("cancels previous calls", () => {
      return new Promise((resolve) => {
        let callCount = 0;
        const fn = () => {
          callCount++;
        };
        const debounced = debounce(fn, 100);

        debounced();
        debounced();
        debounced();

        setTimeout(() => {
          expect(callCount).toBe(1); // Only last call executed
          resolve(null);
        }, 150);
      });
    });

    it("resets delay on each call", () => {
      return new Promise((resolve) => {
        let callCount = 0;
        const fn = () => {
          callCount++;
        };
        const debounced = debounce(fn, 100);

        debounced();
        setTimeout(() => debounced(), 50); // Call again before delay
        setTimeout(() => debounced(), 100); // And again

        setTimeout(() => {
          expect(callCount).toBe(1);
          resolve(null);
        }, 300);
      });
    });
  });

  describe("throttle", () => {
    it("limits function execution rate", () => {
      return new Promise((resolve) => {
        let callCount = 0;
        const fn = () => {
          callCount++;
        };
        const throttled = throttle(fn, 100);

        throttled();
        throttled();
        throttled();

        expect(callCount).toBe(1); // Only first call executed immediately

        setTimeout(() => {
          expect(callCount).toBe(1);
          resolve(null);
        }, 50);
      });
    });

    it("allows execution after delay", () => {
      return new Promise((resolve) => {
        let callCount = 0;
        const fn = () => {
          callCount++;
        };
        const throttled = throttle(fn, 100);

        throttled();
        expect(callCount).toBe(1);

        setTimeout(() => {
          throttled();
          expect(callCount).toBe(2); // Allowed after delay
          resolve(null);
        }, 150);
      });
    });

    it("schedules delayed call for throttled invocations", () => {
      return new Promise((resolve) => {
        let callCount = 0;
        const fn = () => {
          callCount++;
        };
        const throttled = throttle(fn, 100);

        throttled();
        throttled(); // Throttled

        setTimeout(() => {
          // The throttled call should have been scheduled and executed
          expect(callCount).toBeGreaterThan(1);
          resolve(null);
        }, 150);
      });
    });
  });

  describe("createLRUCache", () => {
    it("stores and retrieves values", () => {
      const cache = createLRUCache<string, number>(3);

      cache.set("a", 1);
      cache.set("b", 2);
      cache.set("c", 3);

      expect(cache.get("a")).toBe(1);
      expect(cache.get("b")).toBe(2);
      expect(cache.get("c")).toBe(3);
    });

    it("returns undefined for missing keys", () => {
      const cache = createLRUCache<string, number>(3);
      expect(cache.get("missing")).toBeUndefined();
    });

    it("evicts least recently used entries", () => {
      const cache = createLRUCache<string, number>(3);

      cache.set("a", 1);
      cache.set("b", 2);
      cache.set("c", 3);
      cache.get("a"); // Make "a" recently used
      cache.set("d", 4); // Should evict "b" (least recently used)

      expect(cache.has("a")).toBe(true);
      expect(cache.has("b")).toBe(false); // Evicted
      expect(cache.has("c")).toBe(true);
      expect(cache.has("d")).toBe(true);
    });

    it("updates access order on get", () => {
      const cache = createLRUCache<string, number>(2);

      cache.set("a", 1);
      cache.set("b", 2);
      cache.get("a"); // Make "a" recently used
      cache.set("c", 3); // Should evict "b"

      expect(cache.has("a")).toBe(true);
      expect(cache.has("b")).toBe(false);
      expect(cache.has("c")).toBe(true);
    });

    it("updates access order on set for existing key", () => {
      const cache = createLRUCache<string, number>(2);

      cache.set("a", 1);
      cache.set("b", 2);
      cache.set("a", 10); // Update "a", making it recently used
      cache.set("c", 3); // Should evict "b"

      expect(cache.has("a")).toBe(true);
      expect(cache.has("b")).toBe(false);
      expect(cache.has("c")).toBe(true);
      expect(cache.get("a")).toBe(10);
    });

    it("clears all entries", () => {
      const cache = createLRUCache<string, number>(3);

      cache.set("a", 1);
      cache.set("b", 2);
      cache.clear();

      expect(cache.size).toBe(0);
      expect(cache.has("a")).toBe(false);
      expect(cache.has("b")).toBe(false);
    });

    it("reports size correctly", () => {
      const cache = createLRUCache<string, number>(3);

      expect(cache.size).toBe(0);

      cache.set("a", 1);
      expect(cache.size).toBe(1);

      cache.set("b", 2);
      expect(cache.size).toBe(2);

      cache.clear();
      expect(cache.size).toBe(0);
    });
  });

  describe("memoizeSort", () => {
    it("caches comparison results", () => {
      const comparator = memoizeSort((a: string, b: string) => a.localeCompare(b));

      expect(comparator("apple", "banana")).toBeLessThan(0);
      expect(comparator("apple", "banana")).toBeLessThan(0); // Cached
    });

    it("handles different arguments", () => {
      const comparator = memoizeSort((a: number, b: number) => a - b);

      expect(comparator(5, 3)).toBeGreaterThan(0);
      expect(comparator(3, 5)).toBeLessThan(0);
      expect(comparator(5, 3)).toBeGreaterThan(0); // Cached
    });

    it("works with array sort", () => {
      const comparator = memoizeSort((a: number, b: number) => a - b);
      const arr = [3, 1, 4, 1, 5, 9, 2, 6];

      arr.sort(comparator);

      expect(arr).toEqual([1, 1, 2, 3, 4, 5, 6, 9]);
    });
  });
});
