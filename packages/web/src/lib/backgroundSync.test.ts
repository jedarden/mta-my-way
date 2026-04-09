/**
 * Unit tests for background sync utilities
 *
 * Per plan.md Phase 4: Offline resilience with Background Sync API.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { BackgroundSyncManager, getBackgroundSyncManager } from "./backgroundSync";

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

const mockRequest = {
  result: mockDB,
  onsuccess: null as ((event: Event) => void) | null,
  onerror: null as ((event: Event) => void) | null,
  onupgradeneeded: null as ((event: IDBVersionChangeEvent) => void) | null,
};

// Mock indexedDB.open
vi.stubGlobal("indexedDB", {
  open: vi.fn(() => mockRequest),
});

// Mock Service Worker API
const mockSyncRegistration = { sync: "mta-sync-tag" };

vi.stubGlobal("navigator", {
  serviceWorker: {
    ready: Promise.resolve({
      sync: {
        register: vi.fn().mockResolvedValue(mockSyncRegistration),
      },
    }),
  },
});

describe("BackgroundSyncManager", () => {
  let manager: BackgroundSyncManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new BackgroundSyncManager();

    // Setup default mock behavior
    mockDB.transaction.mockReturnValue(mockTransaction);
    mockObjectStore.add.mockImplementation((_data) => {
      const request = {
        onsuccess: null as ((event: Event) => void) | null,
        onerror: null as ((event: Event) => void) | null,
      };
      // Simulate async success
      setTimeout(() => {
        if (request.onsuccess) {
          request.onsuccess({} as Event);
        }
      }, 0);
      return request;
    });
    mockObjectStore.getAll.mockImplementation(() => {
      const request = {
        onsuccess: null as ((event: Event) => void) | null,
        onerror: null as ((event: Event) => void) | null,
      };
      setTimeout(() => {
        if (request.onsuccess) {
          request.onsuccess({ target: { result: [] } } as unknown as Event);
        }
      }, 0);
      return request;
    });
    mockObjectStore.delete.mockImplementation(() => {
      const request = {
        onsuccess: null as ((event: Event) => void) | null,
        onerror: null as ((event: Event) => void) | null,
      };
      setTimeout(() => {
        if (request.onsuccess) {
          request.onsuccess({} as Event);
        }
      }, 0);
      return request;
    });
    mockObjectStore.clear.mockImplementation(() => {
      const request = {
        onsuccess: null as ((event: Event) => void) | null,
        onerror: null as ((event: Event) => void) | null,
      };
      setTimeout(() => {
        if (request.onsuccess) {
          request.onsuccess({} as Event);
        }
      }, 0);
      return request;
    });
  });

  describe("constructor", () => {
    it("detects Background Sync API support", () => {
      const m = new BackgroundSyncManager();
      expect(m.isSyncSupported()).toBe(true);
    });

    it("handles missing Service Worker support", () => {
      vi.stubGlobal("navigator", { serviceWorker: undefined });
      const m = new BackgroundSyncManager();
      expect(m.isSyncSupported()).toBe(false);
    });
  });

  describe("init", () => {
    it("opens IndexedDB database", async () => {
      mockRequest.onsuccess = vi.fn();
      mockRequest.onerror = null;

      await manager.init();

      expect(indexedDB.open).toHaveBeenCalledWith("mta-background-sync", 1);
    });

    it("handles database open error", async () => {
      const error = new Error("DB open failed");
      mockRequest.onerror = vi.fn();
      mockRequest.onsuccess = null;

      // Trigger error callback
      setTimeout(() => {
        if (mockRequest.onerror) {
          mockRequest.onerror({ target: { error } } as unknown as Event);
        }
      }, 0);

      await expect(manager.init()).rejects.toThrow();
    });

    it("registers background sync when supported", async () => {
      mockRequest.onsuccess = vi.fn();
      mockRequest.onerror = null;

      await manager.init();

      const registration = await navigator.serviceWorker.ready;
      expect(registration.sync.register).toHaveBeenCalledWith("mta-sync-tag");
    });
  });

  describe("queueRequest", () => {
    beforeEach(async () => {
      mockRequest.onsuccess = vi.fn();
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
      mockRequest.onsuccess = vi.fn();
      await manager.init();
    });

    it("retrieves all queued requests", async () => {
      const mockRequests = [
        { id: "1", url: "/api/test1", method: "GET", timestamp: Date.now(), retryCount: 0, maxRetries: 3 },
        { id: "2", url: "/api/test2", method: "POST", timestamp: Date.now(), retryCount: 1, maxRetries: 3 },
      ];

      mockObjectStore.getAll.mockImplementation(() => {
        const request = {
          onsuccess: null as ((event: Event) => void) | null,
          onerror: null as ((event: Event) => void) | null,
        };
        setTimeout(() => {
          if (request.onsuccess) {
            request.onsuccess({ target: { result: mockRequests } } as unknown as Event);
          }
        }, 0);
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
      mockRequest.onsuccess = vi.fn();
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
      mockRequest.onsuccess = vi.fn();
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
      mockRequest.onsuccess = vi.fn();
      await manager.init();
    });

    it("returns number of queued requests", async () => {
      const mockRequests = [
        { id: "1", url: "/api/test1", method: "GET", timestamp: Date.now(), retryCount: 0, maxRetries: 3 },
        { id: "2", url: "/api/test2", method: "POST", timestamp: Date.now(), retryCount: 1, maxRetries: 3 },
      ];

      mockObjectStore.getAll.mockImplementation(() => {
        const request = {
          onsuccess: null as ((event: Event) => void) | null,
          onerror: null as ((event: Event) => void) | null,
        };
        setTimeout(() => {
          if (request.onsuccess) {
            request.onsuccess({ target: { result: mockRequests } } as unknown as Event);
          }
        }, 0);
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
      mockRequest.onsuccess = vi.fn();
      await manager.init();
    });

    it("processes and deletes successful requests", async () => {
      const mockRequests = [
        { id: "1", url: "/api/test1", method: "GET", timestamp: Date.now(), retryCount: 0, maxRetries: 3 },
      ];

      mockObjectStore.getAll.mockImplementation(() => {
        const request = {
          onsuccess: null as ((event: Event) => void) | null,
          onerror: null as ((event: Event) => void) | null,
        };
        setTimeout(() => {
          if (request.onsuccess) {
            request.onsuccess({ target: { result: mockRequests } } as unknown as Event);
          }
        }, 0);
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
        const request = {
          onsuccess: null as ((event: Event) => void) | null,
          onerror: null as ((event: Event) => void) | null,
        };
        setTimeout(() => {
          if (request.onsuccess) {
            request.onsuccess({ target: { result: mockRequests } } as unknown as Event);
          }
        }, 0);
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
        const request = {
          onsuccess: null as ((event: Event) => void) | null,
          onerror: null as ((event: Event) => void) | null,
        };
        setTimeout(() => {
          if (request.onsuccess) {
            request.onsuccess({ target: { result: mockRequests } } as unknown as Event);
          }
        }, 0);
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
