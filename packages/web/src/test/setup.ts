/**
 * Vitest setup file for testing utilities and matchers
 */

import * as matchers from "@testing-library/jest-dom/matchers";
import { cleanup } from "@testing-library/react";
import { afterEach, expect, vi } from "vitest";

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers);

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Create a shared mock for registerSW that tests can import and spy on
export const mockRegisterSW = vi.fn(() => ({
  update: vi.fn(),
}));

// Mock virtual:pwa-register module with the shared mock
// This must be hoisted to be applied before imports
vi.mock("virtual:pwa-register", () => ({
  registerSW: mockRegisterSW,
}));

// Also mock the serviceWorkerRegistration module that uses virtual:pwa-register
// This prevents the module resolution error
vi.mock("../lib/serviceWorkerRegistration", () => ({
  registerServiceWorker: vi.fn(),
  checkForUpdate: vi.fn(),
  addUpdateListener: vi.fn(),
}));

// Mock Cache Storage API for prefetch tests
const cacheStore = new Map<string, Map<string, { response: Response; timestamp: number }>>();

class MockCache {
  private cacheName: string;

  constructor(cacheName: string) {
    this.cacheName = cacheName;
    if (!cacheStore.has(cacheName)) {
      cacheStore.set(cacheName, new Map());
    }
  }

  async put(request: RequestInfo, response: Response): Promise<void> {
    const url = typeof request === "string" ? request : request.url;
    const cache = cacheStore.get(this.cacheName)!;
    cache.set(url, { response: response.clone(), timestamp: Date.now() });
  }

  async match(request: RequestInfo): Promise<Response | undefined> {
    const url = typeof request === "string" ? request : request.url;
    const cache = cacheStore.get(this.cacheName);
    return cache?.get(url)?.response.clone();
  }

  async delete(request: RequestInfo): Promise<boolean> {
    const url = typeof request === "string" ? request : request.url;
    const cache = cacheStore.get(this.cacheName);
    return cache?.delete(url) ?? false;
  }

  async keys(): Promise<Request[]> {
    const cache = cacheStore.get(this.cacheName);
    return Array.from(cache?.keys() || []).map((url) => new Request(url));
  }
}

class MockCacheStorage {
  private caches = new Map<string, MockCache>();

  async open(cacheName: string): Promise<Cache> {
    if (!this.caches.has(cacheName)) {
      this.caches.set(cacheName, new MockCache(cacheName));
    }
    return this.caches.get(cacheName) as unknown as Cache;
  }

  async delete(cacheName: string): Promise<boolean> {
    return this.caches.delete(cacheName);
  }

  async has(cacheName: string): Promise<boolean> {
    return this.caches.has(cacheName);
  }

  async keys(): Promise<string[]> {
    return Array.from(this.caches.keys());
  }
}

global.caches = new MockCacheStorage() as unknown as CacheStorage;
