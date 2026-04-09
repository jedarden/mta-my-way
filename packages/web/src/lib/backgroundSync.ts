/**
 * Background Sync - Queue actions when offline, sync when connectivity returns.
 *
 * Per plan.md Phase 4: Background Sync API for offline resilience.
 *
 * Features:
 *   - Queue API requests when offline
 *   - Automatic retry when connectivity returns
 *   - IndexedDB persistence for queued requests
 *   - Service Worker integration for background processing
 *   - Graceful degradation when Background Sync API is not supported
 */

import { useEffect, useState } from "react";

interface QueuedRequest {
  id: string;
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: string;
  timestamp: number;
  retryCount: number;
  maxRetries: number;
}

const DB_NAME = "mta-background-sync";
const DB_VERSION = 1;
const STORE_NAME = "queued-requests";

/**
 * BackgroundSyncManager - Manages offline request queue and background sync
 */
export class BackgroundSyncManager {
  db: IDBDatabase | null = null;
  syncRegistration: SyncRegistration | null = null;
  isSupported: boolean;

  constructor() {
    // Check if Background Sync API is supported
    this.isSupported =
      "serviceWorker" in navigator && "sync" in ServiceWorkerRegistration.prototype;
  }

  /**
   * Initialize the IndexedDB database for storing queued requests
   */
  async init(): Promise<void> {
    if (!this.db) {
      this.db = await this.openDB();
    }

    // Register sync event with service worker if supported
    if (this.isSupported) {
      await this.registerSync();
    }
  }

  /**
   * Open IndexedDB database for queued requests
   */
  openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("timestamp", "timestamp", { unique: false });
        }
      };
    });
  }

  /**
   * Register background sync with service worker
   */
  async registerSync(): Promise<void> {
    if (!("serviceWorker" in navigator)) return;

    try {
      const registration = await navigator.serviceWorker.ready;
      this.syncRegistration = await registration.sync.register("mta-sync-tag");
    } catch (error) {
      console.warn("Background Sync registration failed:", error);
    }
  }

  /**
   * Queue a request for later retry when offline
   */
  async queueRequest(
    url: string,
    options: RequestInit = {},
    maxRetries: number = 3
  ): Promise<string> {
    if (!this.db) {
      await this.init();
    }

    const request: QueuedRequest = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      url,
      method: options.method || "GET",
      headers: options.headers as Record<string, string>,
      body: options.body as string,
      timestamp: Date.now(),
      retryCount: 0,
      maxRetries,
    };

    await this.storeRequest(request);

    // Trigger background sync if supported
    if (this.isSupported && this.syncRegistration) {
      try {
        const registration = await navigator.serviceWorker.ready;
        await registration.sync.register("mta-sync-tag");
      } catch (error) {
        console.warn("Failed to trigger background sync:", error);
      }
    }

    return request.id;
  }

  /**
   * Store a request in IndexedDB
   */
  async storeRequest(request: QueuedRequest): Promise<void> {
    if (!this.db) {
      throw new Error("Database not initialized");
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const addRequest = store.add(request);

      addRequest.onsuccess = () => resolve();
      addRequest.onerror = () => reject(addRequest.error);
    });
  }

  /**
   * Get all queued requests from IndexedDB
   */
  async getQueuedRequests(): Promise<QueuedRequest[]> {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const getAllRequest = store.getAll();

      getAllRequest.onsuccess = () => resolve(getAllRequest.result as QueuedRequest[]);
      getAllRequest.onerror = () => reject(getAllRequest.error);
    });
  }

  /**
   * Delete a queued request after successful retry
   */
  async deleteRequest(id: string): Promise<void> {
    if (!this.db) {
      throw new Error("Database not initialized");
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const deleteRequest = store.delete(id);

      deleteRequest.onsuccess = () => resolve();
      deleteRequest.onerror = () => reject(deleteRequest.error);
    });
  }

  /**
   * Process queued requests (called when connectivity returns)
   */
  async processQueue(): Promise<void> {
    const requests = await this.getQueuedRequests();

    for (const request of requests) {
      try {
        await this.retryRequest(request);
        await this.deleteRequest(request.id);
      } catch {
        // Increment retry count and update in DB
        request.retryCount++;
        if (request.retryCount >= request.maxRetries) {
          // Max retries reached, remove from queue
          await this.deleteRequest(request.id);
        } else {
          await this.storeRequest(request);
        }
      }
    }
  }

  /**
   * Retry a single queued request
   */
  async retryRequest(request: QueuedRequest): Promise<Response> {
    const options: RequestInit = {
      method: request.method,
      headers: request.headers,
    };

    if (request.body) {
      options.body = request.body;
    }

    const response = await fetch(request.url, options);

    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`);
    }

    return response;
  }

  /**
   * Clear all queued requests (useful for testing or user-initiated clear)
   */
  async clearQueue(): Promise<void> {
    if (!this.db) {
      throw new Error("Database not initialized");
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const clearRequest = store.clear();

      clearRequest.onsuccess = () => resolve();
      clearRequest.onerror = () => reject(clearRequest.error);
    });
  }

  /**
   * Get queue size for UI display
   */
  async getQueueSize(): Promise<number> {
    const requests = await this.getQueuedRequests();
    return requests.length;
  }

  /**
   * Check if Background Sync is supported in this browser
   */
  isSyncSupported(): boolean {
    return this.isSupported;
  }
}

// Singleton instance
let backgroundSyncManager: BackgroundSyncManager | null = null;

/**
 * Get or create the BackgroundSyncManager singleton
 */
export function getBackgroundSyncManager(): BackgroundSyncManager {
  if (!backgroundSyncManager) {
    backgroundSyncManager = new BackgroundSyncManager();
  }
  return backgroundSyncManager;
}

/**
 * Hook for using Background Sync in React components
 */
export function useBackgroundSync() {
  const [manager] = useState(() => getBackgroundSyncManager());
  const [queueSize, setQueueSize] = useState<number>(0);
  const [isSupported, setIsSupported] = useState<boolean>(false);

  useEffect(() => {
    const initManager = async () => {
      await manager.init();
      setIsSupported(manager.isSyncSupported());
      setQueueSize(await manager.getQueueSize());
    };

    void initManager();

    // Update queue size periodically
    const interval = setInterval(() => {
      void (async () => {
        setQueueSize(await manager.getQueueSize());
      })();
    }, 5000);

    return () => clearInterval(interval);
  }, [manager]);

  return {
    manager,
    queueSize,
    isSupported,
    processQueue: () => manager.processQueue(),
    clearQueue: () => manager.clearQueue(),
  };
}
