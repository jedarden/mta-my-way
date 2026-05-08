/**
 * Unit tests for useStaleness hook
 *
 * Tests data freshness tracking and staleness state computation.
 */

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StalenessLevel, useStaleness } from "./useStaleness";

describe("useStaleness", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  describe("initial state", () => {
    it("returns fresh state with null timestamp", () => {
      const { result } = renderHook(() => useStaleness(null));

      expect(result.current.level).toBe("fresh");
      expect(result.current.ageSeconds).toBe(0);
      expect(result.current.ageText).toBe("");
    });

    it("returns fresh state for very recent data", () => {
      const now = Date.now();
      const { result } = renderHook(() => useStaleness(now - 1000)); // 1 second ago

      expect(result.current.level).toBe("fresh");
      expect(result.current.ageSeconds).toBe(1);
      expect(result.current.ageText).toBe("1s ago");
    });
  });

  describe("staleness levels", () => {
    it("returns fresh for data less than 2 minutes old", () => {
      const now = Date.now();
      const { result } = renderHook(() => useStaleness(now - 60 * 1000)); // 1 minute ago

      expect(result.current.level).toBe("fresh");
      expect(result.current.ageSeconds).toBe(60);
      expect(result.current.ageText).toBe("1 min ago");
    });

    it("returns fading for data between 2-5 minutes old", () => {
      const now = Date.now();
      const { result } = renderHook(() => useStaleness(now - 3 * 60 * 1000)); // 3 minutes ago

      expect(result.current.level).toBe("fading");
      expect(result.current.ageSeconds).toBe(180);
      expect(result.current.ageText).toBe("3 min ago");
    });

    it("returns stale for data more than 5 minutes old", () => {
      const now = Date.now();
      const { result } = renderHook(() => useStaleness(now - 6 * 60 * 1000)); // 6 minutes ago

      expect(result.current.level).toBe("stale");
      expect(result.current.ageSeconds).toBe(360);
      expect(result.current.ageText).toBe("6 min ago");
    });

    it("returns stale for data exactly at 5 minute threshold", () => {
      const now = Date.now();
      const { result } = renderHook(() => useStaleness(now - 5 * 60 * 1000)); // 5 minutes ago

      expect(result.current.level).toBe("stale");
    });

    it("returns fading for data exactly at 2 minute threshold", () => {
      const now = Date.now();
      const { result } = renderHook(() => useStaleness(now - 2 * 60 * 1000)); // 2 minutes ago

      expect(result.current.level).toBe("fading");
    });
  });

  describe("age text formatting", () => {
    it("formats seconds correctly", () => {
      const now = Date.now();
      const { result } = renderHook(() => useStaleness(now - 30 * 1000)); // 30 seconds ago

      expect(result.current.ageText).toBe("30s ago");
    });

    it("formats minutes correctly", () => {
      const now = Date.now();
      const { result } = renderHook(() => useStaleness(now - 45 * 60 * 1000)); // 45 minutes ago

      expect(result.current.ageText).toBe("45 min ago");
    });

    it("formats hours correctly", () => {
      const now = Date.now();
      const { result } = renderHook(() => useStaleness(now - 2 * 60 * 60 * 1000)); // 2 hours ago

      expect(result.current.ageText).toBe("2h ago");
    });

    it("handles pluralization", () => {
      const now = Date.now();

      // Singular second
      const { result: result1 } = renderHook(() => useStaleness(now - 1 * 1000));
      expect(result1.current.ageText).toBe("1s ago");

      // Singular minute
      const { result: result2 } = renderHook(() => useStaleness(now - 60 * 1000));
      expect(result2.current.ageText).toBe("1 min ago");

      // Singular hour
      const { result: result3 } = renderHook(() => useStaleness(now - 60 * 60 * 1000));
      expect(result3.current.ageText).toBe("1h ago");
    });
  });

  describe("updates over time", () => {
    it("updates staleness state when timestamp changes", async () => {
      const now = Date.now();
      const { result, rerender } = renderHook(({ timestamp }) => useStaleness(timestamp), {
        initialProps: { timestamp: now },
      });

      expect(result.current.level).toBe("fresh");

      // Update to older timestamp
      rerender({ timestamp: now - 3 * 60 * 1000 });

      expect(result.current.level).toBe("fading");
    });

    it("does not update staleness for same timestamp", () => {
      const now = Date.now();
      const { result, rerender } = renderHook(({ timestamp }) => useStaleness(timestamp), {
        initialProps: { timestamp: now },
      });

      const initialLevel = result.current.level;
      const initialAgeText = result.current.ageText;

      // Rerender with same timestamp
      rerender({ timestamp: now });

      expect(result.current.level).toBe(initialLevel);
      expect(result.current.ageText).toBe(initialAgeText);
    });
  });

  describe("interval updates", () => {
    it("sets up interval to update age text", () => {
      vi.useFakeTimers();

      const now = Date.now();
      const { result } = renderHook(() => useStaleness(now - 30 * 1000)); // Start with 30s age

      const initialAgeText = result.current.ageText;
      expect(initialAgeText).toBe("30s ago");

      // Fast forward 10 seconds (interval tick) and wrap in act
      act(() => {
        vi.advanceTimersByTime(10 * 1000);
      });

      // Age text should update to 40s ago
      expect(result.current.ageText).toBe("40s ago");

      vi.useRealTimers();
    });

    it("clears interval on unmount", () => {
      vi.useFakeTimers();
      const clearIntervalSpy = vi.spyOn(global, "clearInterval");

      const { unmount } = renderHook(() => useStaleness(Date.now()));

      unmount();

      expect(clearIntervalSpy).toHaveBeenCalled();
    });
  });

  describe("edge cases", () => {
    it("handles very old data (hours)", () => {
      const now = Date.now();
      const { result } = renderHook(() => useStaleness(now - 24 * 60 * 60 * 1000)); // 24 hours ago

      expect(result.current.level).toBe("stale");
      expect(result.current.ageText).toBe("24h ago");
    });

    it("handles future timestamps (data from the future)", () => {
      const now = Date.now();
      const { result } = renderHook(() => useStaleness(now + 60 * 1000)); // 1 minute in future

      expect(result.current.level).toBe("fresh");
      expect(result.current.ageSeconds).toBeLessThan(1);
    });

    it("handles zero timestamp", () => {
      const { result } = renderHook(() => useStaleness(0));

      // Very old timestamp (1970), should be stale
      expect(result.current.level).toBe("stale");
    });
  });
});
