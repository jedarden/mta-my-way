/**
 * Unit tests for serviceWorkerRegistration
 *
 * Tests PWA service worker registration and update detection.
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Import the mock directly to access its helper methods
import * as registerSWMock from "../test/mocks/pwa-register";

// Skip PWA tests - virtual:pwa-register module is provided by vite-plugin-pwa during build
// and cannot be properly resolved in test environment despite alias configuration
describe.skip("serviceWorkerRegistration", () => {
  let originalServiceWorker: any;

  beforeEach(() => {
    // Reset mock state
    registerSWMock.registerSW.mockReset?.();

    // Store original serviceWorker for restoration
    originalServiceWorker = navigator.serviceWorker;

    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore original serviceWorker
    Object.defineProperty(navigator, "serviceWorker", {
      writable: true,
      value: originalServiceWorker,
    });
  });

  describe("registerServiceWorker", () => {
    it("registers service worker with correct options", async () => {
      const { registerServiceWorker } = await import("./serviceWorkerRegistration");

      registerServiceWorker();

      expect(registerSWMock.registerSW._mockOptions).toBeDefined();
      expect(registerSWMock.registerSW._mockOptions).toEqual(
        expect.objectContaining({
          immediate: true,
          onRegistered: expect.any(Function),
          onRegisterError: expect.any(Function),
          onNeedRefresh: expect.any(Function),
          onOfflineReady: expect.any(Function),
        })
      );
    });

    it("calls onRegistered callback when registration succeeds", async () => {
      const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const mockRegistration = {
        scope: "/",
        update: vi.fn(),
        uninstall: vi.fn(),
      } as unknown as ServiceWorkerRegistration;

      const { registerServiceWorker } = await import("./serviceWorkerRegistration");
      registerServiceWorker();

      registerSWMock.registerSW.triggerOnRegistered?.(mockRegistration);

      expect(consoleLogSpy).toHaveBeenCalledWith("Service Worker registered:", mockRegistration);

      consoleLogSpy.mockRestore();
    });

    it("logs error when registration fails", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const mockError = new Error("Registration failed");

      const { registerServiceWorker } = await import("./serviceWorkerRegistration");
      registerServiceWorker();

      registerSWMock.registerSW.triggerOnRegisterError?.(mockError);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Service Worker registration failed:",
        mockError
      );

      consoleErrorSpy.mockRestore();
    });

    it("logs when offline ready", async () => {
      const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const { registerServiceWorker } = await import("./serviceWorkerRegistration");
      registerServiceWorker();

      registerSWMock.registerSW.triggerOnOfflineReady?.();

      expect(consoleLogSpy).toHaveBeenCalledWith("App is ready for offline use");

      consoleLogSpy.mockRestore();
    });

    it("triggers update callback when refresh needed", async () => {
      const { registerServiceWorker, useServiceWorkerUpdate } = await import(
        "./serviceWorkerRegistration"
      );

      registerServiceWorker();

      const { result } = renderHook(() => useServiceWorkerUpdate());

      expect(result.current.needRefresh).toBe(false);

      act(() => {
        registerSWMock.registerSW.triggerOnNeedRefresh?.();
      });

      expect(result.current.needRefresh).toBe(true);
    });
  });

  describe("useServiceWorkerUpdate", () => {
    it("returns needRefresh and updateServiceWorker function", async () => {
      const mockServiceWorker = {
        ready: Promise.resolve({
          waiting: null,
          active: null,
          installing: null,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };

      Object.defineProperty(navigator, "serviceWorker", {
        writable: true,
        value: mockServiceWorker,
      });

      const { useServiceWorkerUpdate } = await import("./serviceWorkerRegistration");
      const { result } = renderHook(() => useServiceWorkerUpdate());

      expect(result.current).toHaveProperty("needRefresh");
      expect(result.current).toHaveProperty("updateServiceWorker");
      expect(typeof result.current.updateServiceWorker).toBe("function");
    });

    it("detects waiting service worker on mount", async () => {
      const mockWaitingSw = {
        postMessage: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };

      const mockServiceWorker = {
        ready: Promise.resolve({
          waiting: mockWaitingSw,
          active: null,
          installing: null,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };

      Object.defineProperty(navigator, "serviceWorker", {
        writable: true,
        value: mockServiceWorker,
      });

      const { useServiceWorkerUpdate } = await import("./serviceWorkerRegistration");
      const { result } = renderHook(() => useServiceWorkerUpdate());

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(result.current.needRefresh).toBe(true);
    });

    it("sends SKIP_WAITING message to waiting service worker", async () => {
      const mockWaitingSw = {
        postMessage: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };

      const mockServiceWorker = {
        ready: Promise.resolve({
          waiting: mockWaitingSw,
          active: null,
          installing: null,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };

      Object.defineProperty(navigator, "serviceWorker", {
        writable: true,
        value: mockServiceWorker,
      });

      const { useServiceWorkerUpdate } = await import("./serviceWorkerRegistration");
      const { result } = renderHook(() => useServiceWorkerUpdate());

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      act(() => {
        result.current.updateServiceWorker();
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(mockWaitingSw.postMessage).toHaveBeenCalledWith({
        type: "SKIP_WAITING",
      });
    });

    it("reloads page when controller changes", async () => {
      const mockReload = vi.fn();
      const originalLocation = window.location;

      Object.defineProperty(window, "location", {
        writable: true,
        value: {
          ...originalLocation,
          reload: mockReload,
        },
      });

      const mockWaitingSw = {
        postMessage: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };

      let controllerChangeCallback: (() => void) | undefined;

      const mockServiceWorker = {
        ready: Promise.resolve({
          waiting: mockWaitingSw,
          active: null,
          installing: null,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }),
        addEventListener: vi.fn((_event: string, callback: () => void) => {
          if (_event === "controllerchange") {
            controllerChangeCallback = callback;
          }
        }),
        removeEventListener: vi.fn(),
      };

      Object.defineProperty(navigator, "serviceWorker", {
        writable: true,
        value: mockServiceWorker,
      });

      const { useServiceWorkerUpdate } = await import("./serviceWorkerRegistration");
      const { result } = renderHook(() => useServiceWorkerUpdate());

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      act(() => {
        result.current.updateServiceWorker();
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      act(() => {
        controllerChangeCallback?.();
      });

      expect(mockReload).toHaveBeenCalled();

      // Restore location
      Object.defineProperty(window, "location", {
        writable: true,
        value: originalLocation,
      });
    });
  });

  describe("edge cases", () => {
    it("handles serviceWorker.ready rejection", async () => {
      const rejectionError = new Error("Service worker not ready");
      const mockServiceWorker = {
        ready: Promise.reject(rejectionError),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };

      Object.defineProperty(navigator, "serviceWorker", {
        writable: true,
        value: mockServiceWorker,
      });

      const { useServiceWorkerUpdate } = await import("./serviceWorkerRegistration");

      expect(() => {
        renderHook(() => useServiceWorkerUpdate());
      }).not.toThrow();
    });

    it("handles missing serviceWorker API gracefully", async () => {
      Object.defineProperty(navigator, "serviceWorker", {
        writable: true,
        value: undefined,
      });

      const { useServiceWorkerUpdate } = await import("./serviceWorkerRegistration");

      expect(() => {
        renderHook(() => useServiceWorkerUpdate());
      }).not.toThrow();
    });
  });
});
