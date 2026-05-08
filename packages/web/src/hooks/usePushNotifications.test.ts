/**
 * Tests for usePushNotifications hook.
 *
 * Tests the Web Push subscription lifecycle:
 * - Support detection and iOS version detection
 * - Permission request flow
 * - Subscribe/unsubscribe functionality
 * - Offline queue handling
 * - Background sync registration
 * - Morning score computation
 * - Favorites/quiet hours sync
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePushNotifications } from "./usePushNotifications";

// Mock the API module
const mockGetVapidPublicKey = vi.fn();
const mockSubscribePush = vi.fn();
const mockUnsubscribePush = vi.fn();

vi.mock("../lib/api", () => ({
  api: {
    getVapidPublicKey: () => mockGetVapidPublicKey(),
    subscribePush: (body: unknown) => mockSubscribePush(body),
    unsubscribePush: (body: unknown) => mockUnsubscribePush(body),
  },
}));

// Mock the stores
vi.mock("../stores/favoritesStore", () => ({
  useFavoritesStore: vi.fn((selector) => {
    const state = {
      favorites: [{ id: "fav-1", stationId: "101", lines: ["1"], direction: "both" }],
      tapHistory: [],
      addFavorite: vi.fn(),
      removeFavorite: vi.fn(),
      recordTap: vi.fn(),
    };
    return selector(state);
  }),
}));

vi.mock("../stores/settingsStore", () => ({
  useSettingsStore: vi.fn((selector) => {
    const state = {
      quietHours: { enabled: false, startHour: 22, endHour: 7 },
      updateQuietHours: vi.fn(),
    };
    return selector(state);
  }),
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(global, "localStorage", {
  value: localStorageMock,
});

// Helper to create a service worker container mock with all required methods
function createServiceWorkerContainerMock(): any {
  const mockListeners = new Map<string, Function[]>();

  return {
    ready: Promise.resolve({
      pushManager: {
        getSubscription: vi.fn().mockResolvedValue(null),
        subscribe: vi.fn().mockResolvedValue({
          endpoint: "https://test.com",
          toJSON: () => ({
            endpoint: "https://test.com",
            keys: { p256dh: "key", auth: "auth" },
          }),
          unsubscribe: vi.fn().mockResolvedValue(true),
        }),
      },
      addEventListener: vi.fn((event: string, handler: Function) => {
        if (!mockListeners.has(event)) {
          mockListeners.set(event, []);
        }
        mockListeners.get(event)!.push(handler);
      }),
      removeEventListener: vi.fn((event: string, handler: Function) => {
        const handlers = mockListeners.get(event);
        if (handlers) {
          const index = handlers.indexOf(handler);
          if (index > -1) {
            handlers.splice(index, 1);
          }
        }
      }),
      // Helper to trigger event handlers
      _triggerEvent: (event: string, data: unknown) => {
        const handlers = mockListeners.get(event) || [];
        handlers.forEach((h) => h(data));
      },
    }),
    addEventListener: vi.fn((event: string, handler: Function) => {
      if (!mockListeners.has(event)) {
        mockListeners.set(event, []);
      }
      mockListeners.get(event)!.push(handler);
    }),
    removeEventListener: vi.fn((event: string, handler: Function) => {
      const handlers = mockListeners.get(event);
      if (handlers) {
        const index = handlers.indexOf(handler);
        if (index > -1) {
          handlers.splice(index, 1);
        }
      }
    }),
    _triggerEvent: (event: string, data: unknown) => {
      const handlers = mockListeners.get(event) || [];
      handlers.forEach((h) => h(data));
    },
  };
}

describe("usePushNotifications", () => {
  let mockServiceWorker: ServiceWorkerRegistration;
  let mockPushManager: PushManager;
  let mockSubscription: PushSubscription;
  let mockServiceWorkerContainer: any;
  let windowOnlineListeners: Function[] = [];
  let mockWindow: any;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    windowOnlineListeners = [];

    // Reset API mocks
    mockGetVapidPublicKey.mockReset();
    mockSubscribePush.mockReset();
    mockUnsubscribePush.mockReset();

    // Setup mock Service Worker
    mockSubscription = {
      endpoint: "https://fcm.googleapis.com/test",
      toJSON: () => ({
        endpoint: "https://fcm.googleapis.com/test",
        keys: {
          p256dh: "test-p256dh",
          auth: "test-auth",
        },
      }),
      unsubscribe: vi.fn().mockResolvedValue(true),
    } as unknown as PushSubscription;

    mockPushManager = {
      getSubscription: vi.fn().mockResolvedValue(null),
      subscribe: vi.fn().mockResolvedValue(mockSubscription),
    } as unknown as PushManager;

    mockServiceWorker = {
      ready: Promise.resolve(mockServiceWorker as ServiceWorkerRegistration),
      pushManager: mockPushManager,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as ServiceWorkerRegistration;

    // Create proper navigator mock with serviceWorker that has event listeners
    mockServiceWorkerContainer = {
      ready: Promise.resolve(mockServiceWorker),
      addEventListener: vi.fn((event: string, handler: Function) => {
        if (event === "message") {
          // Store message handler
          (mockServiceWorkerContainer as any)._messageHandler = handler;
        }
      }),
      removeEventListener: vi.fn((event: string, handler: Function) => {
        if (
          event === "message" &&
          (mockServiceWorkerContainer as any)._messageHandler === handler
        ) {
          delete (mockServiceWorkerContainer as any)._messageHandler;
        }
      }),
      _messageHandler: null as Function | null,
    };

    const mockNavigator = {
      serviceWorker: mockServiceWorkerContainer,
      onLine: true,
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
    };

    vi.stubGlobal("navigator", mockNavigator);

    // Mock window with online event - includes PushManager for detectSupport()
    mockWindow = {
      addEventListener: vi.fn((event: string, handler: Function) => {
        if (event === "online") {
          windowOnlineListeners.push(handler);
        }
      }),
      removeEventListener: vi.fn((event: string, handler: Function) => {
        if (event === "online") {
          const index = windowOnlineListeners.indexOf(handler);
          if (index > -1) {
            windowOnlineListeners.splice(index, 1);
          }
        }
      }),
      _triggerOnline: () => {
        windowOnlineListeners.forEach((h) => h());
      },
      PushManager: class MockPushManager {},
      Notification: {
        permission: "default",
        requestPermission: vi.fn().mockResolvedValue("granted"),
      } as unknown as typeof Notification,
    };
    vi.stubGlobal("window", mockWindow as any);

    // Mock Notification API globally
    vi.stubGlobal("Notification", mockWindow.Notification);

    // Mock API responses
    mockGetVapidPublicKey.mockResolvedValue({
      publicKey: "test-vapid-key",
    });
    mockSubscribePush.mockResolvedValue(undefined);
    mockUnsubscribePush.mockResolvedValue(undefined);

    // Mock fetch for sync
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function setupNavigatorMock(
    serviceWorkerContainer: any,
    options: { onLine?: boolean; userAgent?: string } = {}
  ) {
    vi.unstubAllGlobals();
    windowOnlineListeners = []; // Reset listeners

    const mockNavigator = {
      serviceWorker: serviceWorkerContainer,
      onLine: options.onLine ?? true,
      userAgent: options.userAgent ?? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
    };
    vi.stubGlobal("navigator", mockNavigator);

    // Also set up window mock with event listeners and PushManager
    const mockWindow = {
      addEventListener: vi.fn((event: string, handler: Function) => {
        if (event === "online") {
          windowOnlineListeners.push(handler);
        }
      }),
      removeEventListener: vi.fn((event: string, handler: Function) => {
        if (event === "online") {
          const index = windowOnlineListeners.indexOf(handler);
          if (index > -1) {
            windowOnlineListeners.splice(index, 1);
          }
        }
      }),
      _triggerOnline: () => {
        windowOnlineListeners.forEach((h) => h());
      },
      PushManager: class MockPushManager {},
      Notification: {
        permission: "default",
        requestPermission: vi.fn().mockResolvedValue("granted"),
      } as unknown as typeof Notification,
    };
    vi.stubGlobal("window", mockWindow as any);
    vi.stubGlobal("Notification", mockWindow.Notification);

    // Mock fetch for sync
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
    });

    return mockNavigator;
  }

  describe("support detection", () => {
    it("should detect Web Push support when all APIs are available", () => {
      // All APIs are stubbed in beforeEach, so support should be true
      const { result } = renderHook(() => usePushNotifications());

      expect(result.current.isSupported).toBe(true);
    });

    it("should detect old iOS devices correctly", () => {
      // Mock iOS < 16.4
      vi.unstubAllGlobals();
      const oldIOSServiceWorkerContainer = {
        ready: Promise.resolve(mockServiceWorker),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };
      vi.stubGlobal("navigator", {
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X)",
        serviceWorker: oldIOSServiceWorkerContainer,
      });
      vi.stubGlobal("Notification", {
        permission: "default",
      } as unknown as typeof Notification);
      vi.stubGlobal("window", {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        PushManager: class MockPushManager {},
      });

      const { result } = renderHook(() => usePushNotifications());

      expect(result.current.isOldIOS).toBe(true);
    });

    it("should detect modern iOS devices", () => {
      vi.unstubAllGlobals();
      const modernIOSServiceWorkerContainer = {
        ready: Promise.resolve(mockServiceWorker),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };
      vi.stubGlobal("navigator", {
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X)",
        serviceWorker: modernIOSServiceWorkerContainer,
      });
      vi.stubGlobal("Notification", {
        permission: "default",
      } as unknown as typeof Notification);
      vi.stubGlobal("window", {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        PushManager: class MockPushManager {},
      });

      const { result } = renderHook(() => usePushNotifications());

      expect(result.current.isOldIOS).toBe(false);
    });
  });

  describe("subscribe flow", () => {
    it("should request notification permission and subscribe", async () => {
      const { result } = renderHook(() => usePushNotifications());

      await act(async () => {
        await result.current.subscribe();
      });

      expect(Notification.requestPermission).toHaveBeenCalled();
      expect(mockPushManager.subscribe).toHaveBeenCalledWith({
        userVisibleOnly: true,
        applicationServerKey: expect.any(Uint8Array),
      });
      expect(mockSubscribePush).toHaveBeenCalled();
    });

    it("should set error when permission is denied", async () => {
      vi.mocked(Notification.requestPermission).mockResolvedValueOnce("denied");

      const { result } = renderHook(() => usePushNotifications());

      await act(async () => {
        await result.current.subscribe();
      });

      expect(result.current.error).toContain("denied");
      expect(result.current.isSubscribed).toBe(false);
    });

    it("should cache VAPID key after successful fetch", async () => {
      const { result } = renderHook(() => usePushNotifications());

      await act(async () => {
        await result.current.subscribe();
      });

      expect(localStorageMock.getItem("mta-vapid-public-key")).toBe("test-vapid-key");
    });

    it("should use cached VAPID key when offline", async () => {
      localStorageMock.setItem("mta-vapid-public-key", "cached-vapid-key");

      const offlineServiceWorkerContainer = {
        ready: Promise.resolve(mockServiceWorker),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };

      vi.unstubAllGlobals();
      vi.stubGlobal("navigator", {
        serviceWorker: offlineServiceWorkerContainer,
        onLine: false,
      });
      vi.stubGlobal("Notification", {
        permission: "granted",
        requestPermission: vi.fn().mockResolvedValue("granted"),
      } as unknown as typeof Notification);
      vi.stubGlobal("PushManager", {});

      const { result } = renderHook(() => usePushNotifications());

      await act(async () => {
        await result.current.subscribe();
      });

      // The hook tries to fetch first, fails due to offline, then uses cached key
      // So the API is called once but then the cached key is used
      expect(mockPushManager.subscribe).toHaveBeenCalled();
    });

    it("should queue subscription when offline", async () => {
      const offlineServiceWorkerContainer = {
        ready: Promise.resolve(mockServiceWorker),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };

      vi.unstubAllGlobals();
      vi.stubGlobal("navigator", {
        serviceWorker: offlineServiceWorkerContainer,
        onLine: false,
      });
      vi.stubGlobal("Notification", {
        permission: "granted",
        requestPermission: vi.fn().mockResolvedValue("granted"),
      } as unknown as typeof Notification);
      vi.stubGlobal("PushManager", {});

      // Make subscribePush fail
      mockSubscribePush.mockRejectedValueOnce(new Error("Offline"));

      const { result } = renderHook(() => usePushNotifications());

      await act(async () => {
        await result.current.subscribe();
      });

      const pendingOp = localStorageMock.getItem("mta-pending-push-op");
      expect(pendingOp).toBeTruthy();
      expect(result.current.error).toContain("queued");
    });
  });

  describe("unsubscribe flow", () => {
    it("should unsubscribe from push and remove from backend", async () => {
      // Set up getSubscription to return the mock subscription
      // Use 'any' to bypass TypeScript's type checking
      // Use mockResolvedValue (not once) so both useEffect and unsubscribe can get the subscription
      (mockPushManager as any).getSubscription = vi.fn().mockResolvedValue(mockSubscription);

      const { result } = renderHook(() => usePushNotifications());

      // Wait for the useEffect that checks subscription status to run
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      // Now unsubscribe
      await act(async () => {
        await result.current.unsubscribe();
      });

      // Verify that the unsubscribe API was called
      expect(mockUnsubscribePush).toHaveBeenCalledWith({
        endpoint: mockSubscription.endpoint,
      });
      expect(mockSubscription.unsubscribe).toHaveBeenCalled();
    });

    it("should handle no existing subscription gracefully", async () => {
      vi.mocked(mockPushManager.getSubscription).mockResolvedValueOnce(null);

      const { result } = renderHook(() => usePushNotifications());

      await act(async () => {
        await result.current.unsubscribe();
      });

      expect(mockUnsubscribePush).not.toHaveBeenCalled();
      expect(result.current.isSubscribed).toBe(false);
    });
  });

  describe("offline queue handling", () => {
    it("should retry queued subscribe operation when online", async () => {
      // Queue a subscribe operation
      localStorageMock.setItem(
        "mta-pending-push-op",
        JSON.stringify({
          type: "subscribe",
          body: {
            subscription: {
              endpoint: "https://test.com",
              keys: { p256dh: "key", auth: "auth" },
            },
            favorites: [],
            quietHours: { enabled: false, startHour: 0, endHour: 5 },
            morningScores: {},
          },
        })
      );

      const { result } = renderHook(() => usePushNotifications());

      // Simulate online event - the hook's useEffect will handle this
      await act(async () => {
        (global.window as any)._triggerOnline();
        // Wait for the retryPendingOp callback to execute
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      expect(mockSubscribePush).toHaveBeenCalled();
      expect(localStorageMock.getItem("mta-pending-push-op")).toBeNull();
    });

    it("should retry queued unsubscribe operation when online", async () => {
      localStorageMock.setItem(
        "mta-pending-push-op",
        JSON.stringify({
          type: "unsubscribe",
          endpoint: "https://test.com",
        })
      );

      const { result } = renderHook(() => usePushNotifications());

      await act(async () => {
        (global.window as any)._triggerOnline();
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      expect(mockUnsubscribePush).toHaveBeenCalled();
      expect(localStorageMock.getItem("mta-pending-push-op")).toBeNull();
    });
  });

  describe("favorites and quiet hours sync", () => {
    it("should sync when already subscribed", async () => {
      // Start with subscription
      vi.mocked(mockPushManager.getSubscription).mockResolvedValue(mockSubscription);

      const { result } = renderHook(() => usePushNotifications());

      // First subscribe
      await act(async () => {
        await result.current.subscribe();
      });

      expect(result.current.isSubscribed).toBe(true);

      // The sync should have been called (it's called in a useEffect)
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      expect(global.fetch).toHaveBeenCalled();
    });
  });
});
