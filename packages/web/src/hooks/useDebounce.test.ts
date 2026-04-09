/**
 * Unit tests for useDebounce hook
 *
 * Per plan.md Phase 4: Performance optimization.
 */

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDebounce, useDebouncedCallback, useRefetch, useThrottle } from "./useDebounce";

describe("useDebounce", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  describe("useDebounce", () => {
    it("returns initial value immediately", () => {
      const { result } = renderHook(() => useDebounce("test", 300));
      expect(result.current).toBe("test");
    });

    it("debounces value updates", async () => {
      const { result, rerender } = renderHook(({ value, delay }) => useDebounce(value, delay), {
        initialProps: { value: "initial", delay: 300 },
      });

      expect(result.current).toBe("initial");

      // Update value
      rerender({ value: "updated", delay: 300 });

      // Value should still be initial
      expect(result.current).toBe("initial");

      // Wait for delay
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 350));
      });

      // Now value should be updated
      expect(result.current).toBe("updated");
    });

    it("resets delay on each value change", async () => {
      const { result, rerender } = renderHook(({ value, delay }) => useDebounce(value, delay), {
        initialProps: { value: "initial", delay: 300 },
      });

      // First update
      rerender({ value: "update1", delay: 300 });

      // Wait 200ms (less than delay)
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
      });

      expect(result.current).toBe("initial");

      // Second update before delay completes
      rerender({ value: "update2", delay: 300 });

      // Wait another 200ms
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
      });

      // Should still be initial because delay was reset
      expect(result.current).toBe("initial");

      // Wait for full delay after last update
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      expect(result.current).toBe("update2");
    });

    it("supports leading edge execution", async () => {
      const { result, rerender } = renderHook(
        ({ value, delay, options }) => useDebounce(value, delay, options),
        {
          initialProps: {
            value: "initial",
            delay: 300,
            options: { leading: true, trailing: false },
          },
        }
      );

      expect(result.current).toBe("initial");

      // Update with leading edge - should update immediately
      rerender({ value: "updated", delay: 300, options: { leading: true, trailing: false } });

      expect(result.current).toBe("updated");
    });

    it("supports maxWait option", async () => {
      const { result, rerender } = renderHook(
        ({ value, delay, options }) => useDebounce(value, delay, options),
        {
          initialProps: {
            value: "initial",
            delay: 500,
            options: { maxWait: 300 },
          },
        }
      );

      // Update repeatedly to prevent normal debounce from completing
      for (let i = 0; i < 5; i++) {
        await act(async () => {
          rerender({ value: `update${i}`, delay: 500, options: { maxWait: 300 } });
          await new Promise((resolve) => setTimeout(resolve, 100));
        });
      }

      // Should update after maxWait even though debounce delay hasn't passed
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      expect(result.current).toBeTruthy();
    });
  });

  describe("useThrottle", () => {
    it("returns initial value immediately", () => {
      const { result } = renderHook(() => useThrottle("test", 100));
      expect(result.current).toBe("test");
    });

    it("throttles value updates", async () => {
      const { result, rerender } = renderHook(({ value, delay }) => useThrottle(value, delay), {
        initialProps: { value: "initial", delay: 100 },
      });

      expect(result.current).toBe("initial");

      // First update - should go through immediately
      await act(async () => {
        rerender({ value: "update1", delay: 100 });
      });
      expect(result.current).toBe("update1");

      // Immediate second update - should be throttled
      await act(async () => {
        rerender({ value: "update2", delay: 100 });
      });
      expect(result.current).toBe("update1"); // Still update1

      // Wait for throttle period
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      // Now should be updated
      expect(result.current).toBe("update2");
    });

    it("allows updates after delay period", async () => {
      const { result, rerender } = renderHook(({ value, delay }) => useThrottle(value, delay), {
        initialProps: { value: "initial", delay: 100 },
      });

      await act(async () => {
        rerender({ value: "update1", delay: 100 });
      });
      expect(result.current).toBe("update1");

      // Wait for throttle period
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      // Should now allow new update
      await act(async () => {
        rerender({ value: "update2", delay: 100 });
      });
      expect(result.current).toBe("update2");
    });
  });

  describe("useDebouncedCallback", () => {
    it("delays callback execution", async () => {
      const callback = vi.fn();
      const { result } = renderHook(() => useDebouncedCallback(callback, 300));

      act(() => {
        result.current("arg1", "arg2");
      });

      expect(callback).not.toHaveBeenCalled();

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 350));
      });

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith("arg1", "arg2");
    });

    it("cancels previous calls", async () => {
      const callback = vi.fn();
      const { result } = renderHook(() => useDebouncedCallback(callback, 300));

      act(() => {
        result.current("call1");
      });
      act(() => {
        result.current("call2");
      });
      act(() => {
        result.current("call3");
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 350));
      });

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith("call3");
    });

    it("supports leading edge execution", async () => {
      const callback = vi.fn();
      const { result } = renderHook(() =>
        useDebouncedCallback(callback, 300, { leading: true, trailing: false })
      );

      act(() => {
        result.current("arg");
      });

      // Should execute immediately with leading edge
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith("arg");
    });
  });

  describe("useRefetch", () => {
    it("executes refetch function", async () => {
      const refetchFn = vi.fn().mockResolvedValue("success");
      const { result } = renderHook(() => useRefetch(refetchFn, 1000));

      await act(async () => {
        await result.current.refetch("arg");
      });

      expect(refetchFn).toHaveBeenCalledWith("arg");
      expect(result.current.isRefetching).toBe(false);
    });

    it("sets isRefetching state correctly", async () => {
      let resolveRefetch: ((value: unknown) => void) | undefined;
      const refetchFn = vi.fn(
        () =>
          new Promise((resolve) => {
            resolveRefetch = resolve;
          })
      );
      const { result } = renderHook(() => useRefetch(refetchFn, 1000));

      act(() => {
        void result.current.refetch();
      });

      expect(result.current.isRefetching).toBe(true);

      await act(async () => {
        resolveRefetch?.("success");
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(result.current.isRefetching).toBe(false);
    });

    it("cancels pending refetch", async () => {
      const refetchFn = vi.fn().mockResolvedValue("success");
      const { result } = renderHook(() => useRefetch(refetchFn, 1000));

      act(() => {
        void result.current.refetch();
      });

      act(() => {
        result.current.cancelRefetch();
      });

      expect(result.current.isRefetching).toBe(false);
    });
  });
});
