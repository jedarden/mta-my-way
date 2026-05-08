/**
 * Unit tests for useGeolocation hook
 *
 * Tests geolocation permission handling and coordinate fetching.
 */

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useGeolocation } from "./useGeolocation";

// Mock navigator.geolocation
const mockGeolocation = {
  getCurrentPosition: vi.fn(),
  watchPosition: vi.fn(),
  clearWatch: vi.fn(),
};

// Mock navigator.permissions
const mockPermissions = {
  query: vi.fn(),
};

Object.defineProperty(navigator, "geolocation", {
  writable: true,
  value: mockGeolocation,
});

Object.defineProperty(navigator, "permissions", {
  writable: true,
  value: mockPermissions,
});

describe("useGeolocation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to default state
    mockGeolocation.getCurrentPosition.mockReset();
    mockPermissions.query.mockReset();
    // Set default mock to return a valid status object
    mockPermissions.query.mockResolvedValue({
      state: "prompt",
      addEventListener: vi.fn(),
    });
  });

  describe("initial state", () => {
    it("returns initial state with prompt permission", () => {
      mockPermissions.query.mockResolvedValue({
        state: "prompt",
        addEventListener: vi.fn(),
      });

      const { result } = renderHook(() => useGeolocation());

      expect(result.current.permission).toBe("prompt");
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.coordinates).toBeNull();
    });

    it("sets permission to unavailable when geolocation is not supported", () => {
      // Temporarily remove geolocation support
      const originalGeolocation = navigator.geolocation;
      Object.defineProperty(navigator, "geolocation", {
        writable: true,
        value: undefined,
      });

      const { result } = renderHook(() => useGeolocation());

      expect(result.current.permission).toBe("unavailable");

      // Restore geolocation
      Object.defineProperty(navigator, "geolocation", {
        writable: true,
        value: originalGeolocation,
      });
    });
  });

  describe("permission state", () => {
    it("detects granted permission on mount", async () => {
      const mockStatus = {
        state: "granted",
        addEventListener: vi.fn(),
      };
      mockPermissions.query.mockResolvedValue(mockStatus);

      const { result } = renderHook(() => useGeolocation());

      // Wait for permission check
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(result.current.permission).toBe("granted");
    });

    it("detects denied permission on mount", async () => {
      const mockStatus = {
        state: "denied",
        addEventListener: vi.fn(),
      };
      mockPermissions.query.mockResolvedValue(mockStatus);

      const { result } = renderHook(() => useGeolocation());

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(result.current.permission).toBe("denied");
    });

    it("listens for permission changes", async () => {
      let permissionChangeListener: ((event: Event) => void) | undefined;
      const mockStatus = {
        state: "prompt",
        addEventListener: vi.fn((_event: string, callback: () => void) => {
          permissionChangeListener = callback;
        }),
      };
      mockPermissions.query.mockResolvedValue(mockStatus);

      renderHook(() => useGeolocation());

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(mockStatus.addEventListener).toHaveBeenCalledWith("change", expect.any(Function));
    });
  });

  describe("requestLocation", () => {
    it("requests location and sets coordinates on success", async () => {
      const mockPosition = {
        coords: {
          latitude: 40.7128,
          longitude: -74.006,
          accuracy: 100,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      };

      let successCallback: ((position: GeolocationPosition) => void) | null = null;
      mockGeolocation.getCurrentPosition.mockImplementation((success, _error, _options) => {
        successCallback = success;
        return Promise.resolve();
      });

      const { result } = renderHook(() => useGeolocation());

      // Wait for initial permission check
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      await act(async () => {
        result.current.requestLocation();
        // Trigger the success callback after state updates
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (successCallback) {
          successCallback(mockPosition);
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(mockGeolocation.getCurrentPosition).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(Function),
        expect.objectContaining({
          enableHighAccuracy: false,
          timeout: 10_000,
          maximumAge: 60_000,
        })
      );

      expect(result.current.loading).toBe(false);
      expect(result.current.permission).toBe("granted");
      expect(result.current.coordinates).toEqual({
        lat: 40.7128,
        lon: -74.006,
      });
      expect(result.current.error).toBeNull();
    });

    it("handles PERMISSION_DENIED error", async () => {
      const mockError = {
        code: 1, // PERMISSION_DENIED
        message: "User denied permission",
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      };

      let errorCallback: ((error: GeolocationPositionError) => void) | null = null;
      mockGeolocation.getCurrentPosition.mockImplementation((_success, error, _options) => {
        errorCallback = error;
        return Promise.resolve();
      });

      const { result } = renderHook(() => useGeolocation());

      // Wait for initial permission check
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      await act(async () => {
        result.current.requestLocation();
        // Trigger the error callback after state updates
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (errorCallback) {
          errorCallback(mockError as GeolocationPositionError);
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(result.current.loading).toBe(false);
      expect(result.current.permission).toBe("denied");
      expect(result.current.error).toBe(
        "Location permission denied. You can search for stations manually."
      );
      expect(result.current.coordinates).toBeNull();
    });

    it("handles POSITION_UNAVAILABLE error", async () => {
      const mockError = {
        code: 2, // POSITION_UNAVAILABLE
        message: "Position unavailable",
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      };

      let errorCallback: ((error: GeolocationPositionError) => void) | null = null;
      mockGeolocation.getCurrentPosition.mockImplementation((_success, error, _options) => {
        errorCallback = error;
        return Promise.resolve();
      });

      const { result } = renderHook(() => useGeolocation());

      // Wait for initial permission check
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      await act(async () => {
        result.current.requestLocation();
        // Trigger the error callback after state updates
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (errorCallback) {
          errorCallback(mockError as GeolocationPositionError);
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(result.current.loading).toBe(false);
      expect(result.current.permission).toBe("prompt");
      expect(result.current.error).toBe(
        "Location unavailable. Please search for stations manually."
      );
    });

    it("handles TIMEOUT error", async () => {
      const mockError = {
        code: 3, // TIMEOUT
        message: "Request timed out",
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      };

      let errorCallback: ((error: GeolocationPositionError) => void) | null = null;
      mockGeolocation.getCurrentPosition.mockImplementation((_success, error, _options) => {
        errorCallback = error;
        return Promise.resolve();
      });

      const { result } = renderHook(() => useGeolocation());

      // Wait for initial permission check
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      await act(async () => {
        result.current.requestLocation();
        // Trigger the error callback after state updates
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (errorCallback) {
          errorCallback(mockError as GeolocationPositionError);
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(result.current.loading).toBe(false);
      expect(result.current.permission).toBe("prompt");
      expect(result.current.error).toBe(
        "Location request timed out. Please try again or search manually."
      );
    });

    it("handles unknown error codes", async () => {
      const mockError = {
        code: 0, // Unknown
        message: "Unknown error",
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      };

      let errorCallback: ((error: GeolocationPositionError) => void) | null = null;
      mockGeolocation.getCurrentPosition.mockImplementation((_success, error, _options) => {
        errorCallback = error;
        return Promise.resolve();
      });

      const { result } = renderHook(() => useGeolocation());

      // Wait for initial permission check
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      await act(async () => {
        result.current.requestLocation();
        // Trigger the error callback after state updates
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (errorCallback) {
          errorCallback(mockError as GeolocationPositionError);
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(result.current.error).toBe("Could not determine your location.");
    });

    it("sets unavailable error when geolocation is not supported", () => {
      const originalGeolocation = navigator.geolocation;
      Object.defineProperty(navigator, "geolocation", {
        writable: true,
        value: undefined,
      });

      const { result } = renderHook(() => useGeolocation());

      act(() => {
        result.current.requestLocation();
      });

      expect(result.current.permission).toBe("unavailable");
      expect(result.current.error).toBe("Geolocation is not supported by your browser");

      // Restore geolocation
      Object.defineProperty(navigator, "geolocation", {
        writable: true,
        value: originalGeolocation,
      });
    });
  });

  describe("clearError", () => {
    it("clears error state", async () => {
      const mockError = {
        code: 1,
        message: "Permission denied",
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      };

      let errorCallback: ((error: GeolocationPositionError) => void) | null = null;
      mockGeolocation.getCurrentPosition.mockImplementation((_success, error, _options) => {
        errorCallback = error;
        return Promise.resolve();
      });

      const { result } = renderHook(() => useGeolocation());

      // Wait for initial permission check
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      await act(async () => {
        result.current.requestLocation();
        // Trigger the error callback after state updates
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (errorCallback) {
          errorCallback(mockError as GeolocationPositionError);
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(result.current.error).not.toBeNull();

      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
    });

    it("preserves other state when clearing error", async () => {
      const mockError = {
        code: 1,
        message: "Permission denied",
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      };

      let errorCallback: ((error: GeolocationPositionError) => void) | null = null;
      mockGeolocation.getCurrentPosition.mockImplementation((_success, error, _options) => {
        errorCallback = error;
        return Promise.resolve();
      });

      const { result } = renderHook(() => useGeolocation());

      // Wait for initial permission check
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      await act(async () => {
        result.current.requestLocation();
        // Trigger the error callback after state updates
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (errorCallback) {
          errorCallback(mockError as GeolocationPositionError);
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      const permissionBefore = result.current.permission;

      act(() => {
        result.current.clearError();
      });

      expect(result.current.permission).toBe(permissionBefore);
    });
  });

  describe("geolocation options", () => {
    it("uses correct options when requesting location", async () => {
      const mockPosition = {
        coords: {
          latitude: 40.7128,
          longitude: -74.006,
          accuracy: 100,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      };

      let successCallback: ((position: GeolocationPosition) => void) | null = null;
      mockGeolocation.getCurrentPosition.mockImplementation((success, _error, options) => {
        successCallback = success;
        expect(options).toEqual({
          enableHighAccuracy: false,
          timeout: 10_000,
          maximumAge: 60_000,
        });
        return Promise.resolve();
      });

      const { result } = renderHook(() => useGeolocation());

      // Wait for initial permission check
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      await act(async () => {
        result.current.requestLocation();
        // Trigger the success callback after state updates
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (successCallback) {
          successCallback(mockPosition);
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(mockGeolocation.getCurrentPosition).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(Function),
        expect.objectContaining({
          enableHighAccuracy: false,
          timeout: 10_000,
          maximumAge: 60_000,
        })
      );
    });
  });
});
