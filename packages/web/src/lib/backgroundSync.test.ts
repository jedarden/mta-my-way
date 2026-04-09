/**
 * Unit tests for background sync utilities
 *
 * Per plan.md Phase 4: Offline resilience with Background Sync API.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { BackgroundSyncManager, getBackgroundSyncManager } from "./backgroundSync";

// Mock ServiceWorkerRegistration globally
class MockServiceWorkerRegistration implements Partial<ServiceWorkerRegistration> {
  sync?: {
    register: (tag: string) => Promise<SyncRegistration>;
  };
}

// Mock IndexedDB
const mockDB = {
  transaction: vi.fn(),
  close: vi.fn(),
};

const mockObjectStore = {
  add: vi.fn(),
  getAll: vi.fn(),
  delete: vi.fn(),
  clear: vi.fn(),
};

const mockTransaction = {
  objectStore: vi.fn(() => mockObjectStore),
};

// Create a mock request that triggers callbacks when set
const createMockRequest = () => {
  let onsuccessCallback: ((event: Event) => void) | null = null;
  let onerrorCallback: ((event: Event) => void) | null = null;

  const request = {
    get onsuccess() {
      return onsuccessCallback;
    },
    set onsuccess(fn: ((event: Event) => void) | null) {
      onsuccessCallback = fn;
      // Trigger immediately when set
      if (fn) {
        queueMicrotask(() => {
          fn({ target: { result: mockDB } } as unknown as Event);
        });
      }
    },
    get onerror() {
      return onerrorCallback;
    },
    set onerror(fn: ((event: Event) => void) | null) {
      onerrorCallback = fn;
    },
    result: mockDB,
  };

  return request;
};

// Mock indexedDB.open
vi.stubGlobal("indexedDB", {
  open: vi.fn(() => createMockRequest()),
});

// Mock Service Worker API
const mockSyncRegistration = { sync: "mta-sync-tag" };

const mockServiceWorker = {
  ready: Promise.resolve({
    sync: {
      register: vi.fn().mockResolvedValue(mockSyncRegistration),
    },
  }),
};

vi.stubGlobal("navigator", {
  serviceWorker: mockServiceWorker,
});

vi.stubGlobal("ServiceWorkerRegistration", MockServiceWorkerRegistration);

describe("BackgroundSyncManager", () => {
  let manager: BackgroundSyncManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new BackgroundSyncManager();

    // Setup default mock behavior
    mockDB.transaction.mockReturnValue(mockTransaction);

    // Create mock requests for object store operations
    const createObjectStoreRequest = (result: unknown = null) => {
      let onsuccessCallback: ((event: Event) => void) | null = null;
      const request = {
        result,
        get onsuccess() {
          return onsuccessCallback;
        },
        set onsuccess(fn: ((event: Event) => void) | null) {
          onsuccessCallback = fn;
          if (fn) {
            queueMicrotask(() => {
              fn({ target: { result } } as unknown as Event);
            });
          }
        },
        get onerror() {
          return null;
        },
        set onerror(_fn: ((event: Event) => void) | null) {
          // Ignore error callbacks in tests
        },
      };
      return request;
    };

    mockObjectStore.add.mockImplementation(() => createObjectStoreRequest());
    mockObjectStore.getAll.mockImplementation(() => createObjectStoreRequest([]));
    mockObjectStore.delete.mockImplementation(() => createObjectStoreRequest());
    mockObjectStore.clear.mockImplementation(() => createObjectStoreRequest());
  });

  describe("constructor", () => {
    it.skip("detects Background Sync API support", () => {
      // Ensure mocks are set up
      expect(navigator.serviceWorker).toBeDefined();
      const m = new BackgroundSyncManager();
      expect(m.isSyncSupported()).toBe(true);
    });

    it.skip("handles missing Service Worker support", () => {
      // Temporarily remove service worker mock
      const originalServiceWorker = (globalThis as { navigator?: { serviceWorker?: unknown } }).navigator?.serviceWorker;
      vi.stubGlobal("navigator", { serviceWorker: undefined });

      const m = new BackgroundSyncManager();
      expect(m.isSyncSupported()).toBe(false);

      // Restore service worker mock
      if (originalServiceWorker) {
        vi.stubGlobal("navigator", { serviceWorker: originalServiceWorker });
      } else {
        vi.stubGlobal("navigator", mockServiceWorker);
      }
    });
  });

  describe("init", () => {
    it("opens IndexedDB database", async () => {
      await manager.init();

      expect(indexedDB.open).toHaveBeenCalledWith("mta-background-sync", 1);
    });

    it.skip("registers background sync when supported", async () => {
      await manager.init();

      const registration = await navigator.serviceWorker.ready;
      expect(registration.sync.register).toHaveBeenCalledWith("mta-sync-tag");
    });
  });

  describe("queueRequest", () => {
    beforeEach(async () => {
      await manager.init();
    });

    it("stores request in IndexedDB", async () => {
      await manager.queueRequest("/api/test", { method: "POST" });

      expect(mockDB.transaction).toHaveBeenCalledWith(["queued-requests"], "readwrite");
      expect(mockObjectStore.add).toHaveBeenCalled();
    });

    it("generates unique request ID", async () => {
      const id1 = await manager.queueRequest("/api/test1");
      const id2 = await manager.queueRequest("/api/test2");

      // IDs should be different (based on timestamp + random)
      expect(id1).not.toBe(id2);
    });

    it("stores request with correct structure", async () => {
      await manager.queueRequest("/api/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"data":"test"}',
      });

      const addCall = mockObjectStore.add.mock.calls[0];
      const requestData = addCall[0];

      expect(requestData).toMatchObject({
        url: "/api/test",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"data":"test"}',
        retryCount: 0,
        maxRetries: 3,
      });
      expect(requestData.id).toBeDefined();
      expect(requestData.timestamp).toBeDefined();
    });

    it("respects custom maxRetries", async () => {
      await manager.queueRequest("/api/test", {}, 5);

      const addCall = mockObjectStore.add.mock.calls[0];
      const requestData = addCall[0];

      expect(requestData.maxRetries).toBe(5);
    });
  });

  describe("getQueuedRequests", () => {
    beforeEach(async () => {
      await manager.init();
    });

    it("retrieves all queued requests", async () => {
      const mockRequests = [
        { id: "1", url: "/api/test1", method: "GET", timestamp: Date.now(), retryCount: 0, maxRetries: 3 },
        { id: "2", url: "/api/test2", method: "POST", timestamp: Date.now(), retryCount: 1, maxRetries: 3 },
      ];

      mockObjectStore.getAll.mockImplementation(() => {
        let onsuccessCallback: ((event: Event) => void) | null = null;
        const request = {
          result: mockRequests,
          get onsuccess() {
            return onsuccessCallback;
          },
          set onsuccess(fn: ((event: Event) => void) | null) {
            onsuccessCallback = fn;
            if (fn) {
              queueMicrotask(() => {
                fn({ target: { result: mockRequests } } as unknown as Event);
              });
            }
          },
          get onerror() {
            return null;
          },
          set onerror(_fn: ((event: Event) => void) | null) {},
        };
        return request;
      });

      const requests = await manager.getQueuedRequests();

      expect(requests).toEqual(mockRequests);
    });

    it("returns empty array when no requests", async () => {
      const requests = await manager.getQueuedRequests();

      expect(requests).toEqual([]);
    });
  });

  describe("deleteRequest", () => {
    beforeEach(async () => {
      await manager.init();
    });

    it("deletes request by ID", async () => {
      await manager.deleteRequest("test-id");

      expect(mockDB.transaction).toHaveBeenCalledWith(["queued-requests"], "readwrite");
      expect(mockObjectStore.delete).toHaveBeenCalledWith("test-id");
    });
  });

  describe("clearQueue", () => {
    beforeEach(async () => {
      await manager.init();
    });

    it("clears all queued requests", async () => {
      await manager.clearQueue();

      expect(mockDB.transaction).toHaveBeenCalledWith(["queued-requests"], "readwrite");
      expect(mockObjectStore.clear).toHaveBeenCalled();
    });
  });

  describe("getQueueSize", () => {
    beforeEach(async () => {
      await manager.init();
    });

    it("returns number of queued requests", async () => {
      const mockRequests = [
        { id: "1", url: "/api/test1", method: "GET", timestamp: Date.now(), retryCount: 0, maxRetries: 3 },
        { id: "2", url: "/api/test2", method: "POST", timestamp: Date.now(), retryCount: 1, maxRetries: 3 },
      ];

      mockObjectStore.getAll.mockImplementation(() => {
        let onsuccessCallback: ((event: Event) => void) | null = null;
        const request = {
          result: mockRequests,
          get onsuccess() {
            return onsuccessCallback;
          },
          set onsuccess(fn: ((event: Event) => void) | null) {
            onsuccessCallback = fn;
            if (fn) {
              queueMicrotask(() => {
                fn({ target: { result: mockRequests } } as unknown as Event);
              });
            }
          },
          get onerror() {
            return null;
          },
          set onerror(_fn: ((event: Event) => void) | null) {},
        };
        return request;
      });

      const size = await manager.getQueueSize();

      expect(size).toBe(2);
    });

    it("returns 0 for empty queue", async () => {
      const size = await manager.getQueueSize();

      expect(size).toBe(0);
    });
  });

  describe("processQueue", () => {
    beforeEach(async () => {
      await manager.init();
    });

    it("processes and deletes successful requests", async () => {
      const mockRequests = [
        { id: "1", url: "/api/test1", method: "GET", timestamp: Date.now(), retryCount: 0, maxRetries: 3 },
      ];

      mockObjectStore.getAll.mockImplementation(() => {
        let onsuccessCallback: ((event: Event) => void) | null = null;
        const request = {
          result: mockRequests,
          get onsuccess() {
            return onsuccessCallback;
          },
          set onsuccess(fn: ((event: Event) => void) | null) {
            onsuccessCallback = fn;
            if (fn) {
              queueMicrotask(() => {
                fn({ target: { result: mockRequests } } as unknown as Event);
              });
            }
          },
          get onerror() {
            return null;
          },
          set onerror(_fn: ((event: Event) => void) | null) {},
        };
        return request;
      });

      // Mock successful fetch
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      } as Response);

      await manager.processQueue();

      expect(mockObjectStore.delete).toHaveBeenCalledWith("1");
    });

    it("increments retry count on failure", async () => {
      const mockRequests = [
        { id: "1", url: "/api/test1", method: "GET", timestamp: Date.now(), retryCount: 0, maxRetries: 3 },
      ];

      mockObjectStore.getAll.mockImplementation(() => {
        let onsuccessCallback: ((event: Event) => void) | null = null;
        const request = {
          result: mockRequests,
          get onsuccess() {
            return onsuccessCallback;
          },
          set onsuccess(fn: ((event: Event) => void) | null) {
            onsuccessCallback = fn;
            if (fn) {
              queueMicrotask(() => {
                fn({ target: { result: mockRequests } } as unknown as Event);
              });
            }
          },
          get onerror() {
            return null;
          },
          set onerror(_fn: ((event: Event) => void) | null) {},
        };
        return request;
      });

      // Mock failed fetch
      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

      await manager.processQueue();

      // Should update the request with incremented retry count
      expect(mockObjectStore.add).toHaveBeenCalled();
      const updatedRequest = mockObjectStore.add.mock.calls[0][0];
      expect(updatedRequest.retryCount).toBe(1);
    });

    it("removes requests exceeding max retries", async () => {
      const mockRequests = [
        { id: "1", url: "/api/test1", method: "GET", timestamp: Date.now(), retryCount: 3, maxRetries: 3 },
      ];

      mockObjectStore.getAll.mockImplementation(() => {
        let onsuccessCallback: ((event: Event) => void) | null = null;
        const request = {
          result: mockRequests,
          get onsuccess() {
            return onsuccessCallback;
          },
          set onsuccess(fn: ((event: Event) => void) | null) {
            onsuccessCallback = fn;
            if (fn) {
              queueMicrotask(() => {
                fn({ target: { result: mockRequests } } as unknown as Event);
              });
            }
          },
          get onerror() {
            return null;
          },
          set onerror(_fn: ((event: Event) => void) | null) {},
        };
        return request;
      });

      // Mock failed fetch
      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

      await manager.processQueue();

      // Should delete the request (max retries exceeded)
      expect(mockObjectStore.delete).toHaveBeenCalledWith("1");
    });
  });

  describe("getBackgroundSyncManager", () => {
    it("returns singleton instance", () => {
      const m1 = getBackgroundSyncManager();
      const m2 = getBackgroundSyncManager();

      expect(m1).toBe(m2);
    });
  });
});
