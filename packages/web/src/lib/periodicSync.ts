/**
 * Periodic Background Sync — refresh favorite arrivals in the background.
 *
 * Per plan.md Phase 4: Use the Periodic Background Sync API (where supported)
 * to refresh favorite arrivals every few minutes even when the app is not open.
 *
 * The service worker cannot access localStorage, so this module writes the
 * current favorites station IDs to IndexedDB where the SW can read them during
 * a 'periodicsync' event. Gracefully degrades when the API is unsupported.
 */

import { useEffect } from "react";
import { useFavoritesStore } from "../stores/favoritesStore";

export const PERIODIC_SYNC_TAG = "mta-arrivals-refresh";

/** 5 minutes — browser may fire less frequently based on usage patterns */
const PERIODIC_SYNC_MIN_INTERVAL_MS = 5 * 60 * 1000;

const SYNC_CONFIG_DB_NAME = "mta-periodic-sync";
const SYNC_CONFIG_DB_VERSION = 1;
const SYNC_CONFIG_STORE = "sync-config";

/**
 * Check if the Periodic Background Sync API is available.
 */
export function isPeriodicSyncSupported(): boolean {
  return "serviceWorker" in navigator && "periodicSync" in ServiceWorkerRegistration.prototype;
}

function openSyncConfigDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SYNC_CONFIG_DB_NAME, SYNC_CONFIG_DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(SYNC_CONFIG_STORE)) {
        db.createObjectStore(SYNC_CONFIG_STORE, { keyPath: "id" });
      }
    };
  });
}

/**
 * Write favorite station IDs to IndexedDB so the service worker can read them
 * during a periodicsync event (SW cannot access localStorage directly).
 */
export async function writeFavoritesToSyncConfig(stationIds: string[]): Promise<void> {
  const db = await openSyncConfigDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([SYNC_CONFIG_STORE], "readwrite");
    const store = tx.objectStore(SYNC_CONFIG_STORE);
    const req = store.put({ id: "favorites", stationIds });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Register the Periodic Background Sync tag with the service worker.
 * Requires the app to be installed as a PWA or the user to have granted
 * notification permission. Silently no-ops if unsupported or denied.
 */
export async function registerPeriodicSync(): Promise<void> {
  if (!isPeriodicSyncSupported()) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    const periodicSync = (
      registration as unknown as {
        periodicSync: PeriodicSyncManager;
      }
    ).periodicSync;

    const tags = await periodicSync.getTags();
    if (!tags.includes(PERIODIC_SYNC_TAG)) {
      await periodicSync.register(PERIODIC_SYNC_TAG, {
        minInterval: PERIODIC_SYNC_MIN_INTERVAL_MS,
      });
    }
  } catch {
    // Denied if app is not installed or permission not granted — expected on most browsers
  }
}

/**
 * React hook: keeps the IDB sync config in sync with the favorites store and
 * registers the periodic sync tag once on mount.
 *
 * Call this once near the top of the component tree (e.g., in App).
 */
export function usePeriodicSync(): void {
  const favorites = useFavoritesStore((state) => state.favorites);

  useEffect(() => {
    const stationIds = [...new Set(favorites.map((f) => f.stationId))];
    void writeFavoritesToSyncConfig(stationIds).catch(() => {
      // IDB write failures are non-fatal — SW will skip refresh for this cycle
    });
  }, [favorites]);

  useEffect(() => {
    void registerPeriodicSync();
  }, []);
}
