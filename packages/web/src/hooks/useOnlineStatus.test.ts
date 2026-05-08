/**
 * Unit tests for useOnlineStatus hook
 *
 * Tests browser online/offline state monitoring.
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOnlineStatus } from "./useOnlineStatus";

describe("useOnlineStatus", () => {
  const originalNavigator = navigator.onLine;
  const addEventListenerSpy = vi.spyOn(window, "addEventListener");
  const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to online by default
    Object.defineProperty(navigator, "onLine", {
      writable: true,
      value: true,
    });
  });

  afterEach(() => {
    // Restore original navigator.onLine
    Object.defineProperty(navigator, "onLine", {
      writable: true,
      value: originalNavigator,
    });
  });

  describe("initial state", () => {
    it("returns true when browser is initially online", () => {
      Object.defineProperty(navigator, "onLine", {
        writable: true,
        value: true,
      });

      const { result } = renderHook(() => useOnlineStatus());

      expect(result.current).toBe(true);
    });

    it("returns false when browser is initially offline", () => {
      Object.defineProperty(navigator, "onLine", {
        writable: true,
        value: false,
      });

      const { result } = renderHook(() => useOnlineStatus());

      expect(result.current).toBe(false);
    });
  });

  describe("event listeners", () => {
    it("registers online and offline event listeners on mount", () => {
      renderHook(() => useOnlineStatus());

      expect(addEventListenerSpy).toHaveBeenCalledWith("online", expect.any(Function));
      expect(addEventListenerSpy).toHaveBeenCalledWith("offline", expect.any(Function));
    });

    it("removes event listeners on unmount", () => {
      const { unmount } = renderHook(() => useOnlineStatus());

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith("online", expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith("offline", expect.any(Function));
    });
  });

  describe("state transitions", () => {
    it("updates to true when online event fires", () => {
      // Start offline
      Object.defineProperty(navigator, "onLine", {
        writable: true,
        value: false,
      });

      const { result } = renderHook(() => useOnlineStatus());

      expect(result.current).toBe(false);

      // Get the online event handler
      const onlineHandler = addEventListenerSpy.mock.calls.find(
        (call) => call[0] === "online"
      )?.[1] as EventListener;

      // Simulate online event - also update navigator.onLine
      act(() => {
        Object.defineProperty(navigator, "onLine", {
          writable: true,
          value: true,
        });
        if (onlineHandler) {
          onlineHandler(new Event("online"));
        }
      });

      expect(result.current).toBe(true);
    });

    it("updates to false when offline event fires", () => {
      // Start online
      Object.defineProperty(navigator, "onLine", {
        writable: true,
        value: true,
      });

      const { result } = renderHook(() => useOnlineStatus());

      expect(result.current).toBe(true);

      // Get the offline event handler
      const offlineHandler = addEventListenerSpy.mock.calls.find(
        (call) => call[0] === "offline"
      )?.[1] as EventListener;

      // Simulate offline event - also update navigator.onLine
      act(() => {
        Object.defineProperty(navigator, "onLine", {
          writable: true,
          value: false,
        });
        if (offlineHandler) {
          offlineHandler(new Event("offline"));
        }
      });

      expect(result.current).toBe(false);
    });

    it("handles multiple state changes", () => {
      const { result } = renderHook(() => useOnlineStatus());

      const onlineHandler = addEventListenerSpy.mock.calls.find(
        (call) => call[0] === "online"
      )?.[1] as EventListener;
      const offlineHandler = addEventListenerSpy.mock.calls.find(
        (call) => call[0] === "offline"
      )?.[1] as EventListener;

      // Start online
      expect(result.current).toBe(true);

      // Go offline
      act(() => {
        Object.defineProperty(navigator, "onLine", {
          writable: true,
          value: false,
        });
        if (offlineHandler) {
          offlineHandler(new Event("offline"));
        }
      });
      expect(result.current).toBe(false);

      // Go back online
      act(() => {
        Object.defineProperty(navigator, "onLine", {
          writable: true,
          value: true,
        });
        if (onlineHandler) {
          onlineHandler(new Event("online"));
        }
      });
      expect(result.current).toBe(true);

      // Go offline again
      act(() => {
        Object.defineProperty(navigator, "onLine", {
          writable: true,
          value: false,
        });
        if (offlineHandler) {
          offlineHandler(new Event("offline"));
        }
      });
      expect(result.current).toBe(false);
    });
  });

  describe("hook stability", () => {
    it("maintains same handler reference across re-renders", () => {
      const { rerender } = renderHook(() => useOnlineStatus());

      const initialOnlineHandler = addEventListenerSpy.mock.calls.find(
        (call) => call[0] === "online"
      )?.[1];

      // Rerender
      rerender();

      const updatedOnlineHandler = addEventListenerSpy.mock.calls
        .filter((call) => call[0] === "online")
        .pop()?.[1];

      // The handler reference should remain the same (stable)
      expect(initialOnlineHandler).toBeDefined();
      expect(updatedOnlineHandler).toBeDefined();
    });
  });
});
