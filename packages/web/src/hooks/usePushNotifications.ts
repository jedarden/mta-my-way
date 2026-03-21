/**
 * usePushNotifications — manage Web Push subscription lifecycle.
 *
 * IMPORTANT: Push permission is NEVER requested automatically.
 * The user must call subscribe() explicitly (from the Settings screen).
 *
 * iOS Safari requires iOS 16.4+ and the app installed as a PWA (Add to Home Screen).
 * The isOldIOS flag lets the UI show an informative message on older devices.
 *
 * Offline / Background Sync
 * ─────────────────────────
 * When subscribe() or unsubscribe() fails because the device is offline, the
 * pending operation is queued in localStorage under PENDING_OP_KEY. Two
 * complementary retry paths then flush the queue:
 *
 *   1. window "online" event — fires in the same tab when connectivity returns.
 *   2. Service-worker "sync" event (tag: "push-subscription-sync") — the SW
 *      sends a postMessage that this hook handles. This covers the case where
 *      the browser wakes the SW to process a BackgroundSync registration even
 *      if the tab was backgrounded.
 */

import type { PushFavoriteTuple, PushSubscribeRequest } from "@mta-my-way/shared";
import { useCallback, useEffect, useState } from "react";
import { useFavoritesStore } from "../stores/favoritesStore";
import { useSettingsStore } from "../stores/settingsStore";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PushNotificationsState {
  /** Whether the browser supports Web Push at all */
  isSupported: boolean;
  /** Whether the device is iOS older than 16.4 (Web Push not supported) */
  isOldIOS: boolean;
  /** Current Notification permission state */
  permission: NotificationPermission;
  /** Whether the user currently has an active push subscription */
  isSubscribed: boolean;
  /** True while subscribe/unsubscribe is in progress */
  isLoading: boolean;
  /** Last error message, if any */
  error: string | null;
  /** Subscribe: request permission, create subscription, register with backend */
  subscribe: () => Promise<void>;
  /** Unsubscribe: remove subscription from backend and browser */
  unsubscribe: () => Promise<void>;
}

type PendingOp =
  | { type: "subscribe"; body: PushSubscribeRequest }
  | { type: "unsubscribe"; endpoint: string };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PENDING_OP_KEY = "mta-pending-push-op";
const VAPID_CACHE_KEY = "mta-vapid-public-key";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a URL-safe base64 string to a Uint8Array backed by a plain ArrayBuffer.
 *  The explicit ArrayBuffer backing is required by PushSubscriptionOptionsInit.applicationServerKey. */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i++) {
    view[i] = rawData.charCodeAt(i);
  }
  return view;
}

/** Detect iOS Safari older than 16.4 (no Web Push support) */
function detectOldIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (!/iPad|iPhone|iPod/.test(ua)) return false;

  const match = ua.match(/OS (\d+)_(\d+)/);
  if (!match) return true; // Assume old if we can't detect version

  const major = parseInt(match[1]!, 10);
  const minor = parseInt(match[2]!, 10);
  return major < 16 || (major === 16 && minor < 4);
}

/** True if the browser has the minimum APIs for Web Push */
function detectSupport(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

/** Persist the VAPID key to localStorage so subscribe() can work when offline */
function cacheVapidKey(key: string): void {
  try {
    localStorage.setItem(VAPID_CACHE_KEY, key);
  } catch {
    // Storage full or unavailable — ignore
  }
}

function getCachedVapidKey(): string | null {
  try {
    return localStorage.getItem(VAPID_CACHE_KEY);
  } catch {
    return null;
  }
}

function queuePendingOp(op: PendingOp): void {
  try {
    localStorage.setItem(PENDING_OP_KEY, JSON.stringify(op));
  } catch {
    // Storage unavailable — skip queuing
  }
}

function dequeuePendingOp(): PendingOp | null {
  try {
    const raw = localStorage.getItem(PENDING_OP_KEY);
    if (!raw) return null;
    localStorage.removeItem(PENDING_OP_KEY);
    return JSON.parse(raw) as PendingOp;
  } catch {
    return null;
  }
}

/** Register a Background Sync tag so the SW can retry when connectivity returns */
function registerBackgroundSync(): void {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.ready
    .then((reg) => {
      // BackgroundSync API is not available in all browsers
      const syncManager = (
        reg as ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } }
      ).sync;
      if (syncManager) {
        void syncManager.register("push-subscription-sync");
      }
    })
    .catch(() => {
      // SW not ready — that's fine, the online event will retry instead
    });
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePushNotifications(): PushNotificationsState {
  const [isSupported] = useState(detectSupport);
  const [isOldIOS] = useState(detectOldIOS);

  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const favorites = useFavoritesStore((s) => s.favorites);
  const quietHours = useSettingsStore((s) => s.quietHours);

  // Check existing subscription status on mount
  useEffect(() => {
    if (!isSupported) return;

    navigator.serviceWorker.ready
      .then(async (reg) => {
        const sub = await reg.pushManager.getSubscription();
        setIsSubscribed(!!sub);
      })
      .catch(() => {
        // SW not ready yet — that's fine
      });
  }, [isSupported]);

  // ---------------------------------------------------------------------------
  // Core subscribe / unsubscribe implementation
  // ---------------------------------------------------------------------------

  const subscribe = useCallback(async () => {
    if (!isSupported) return;
    setIsLoading(true);
    setError(null);

    try {
      // 1. Request notification permission (must be triggered by user gesture)
      const perm = await Notification.requestPermission();
      setPermission(perm);

      if (perm !== "granted") {
        setError("Notification permission denied. Please enable in browser settings.");
        return;
      }

      // 2. Get VAPID public key — try network first, fall back to cached value
      let publicKey: string;
      try {
        const vapidRes = await fetch("/api/push/vapid-public-key");
        if (!vapidRes.ok) throw new Error("Push notifications are not configured on the server");
        const json = (await vapidRes.json()) as { publicKey: string };
        publicKey = json.publicKey;
        cacheVapidKey(publicKey);
      } catch (fetchErr) {
        const cached = getCachedVapidKey();
        if (!cached) {
          if (!navigator.onLine) {
            setError("You're offline. Please try again when connected.");
          } else {
            throw fetchErr;
          }
          return;
        }
        publicKey = cached;
      }

      // 3. Subscribe to push via the browser's PushManager
      const reg = await navigator.serviceWorker.ready;
      const pushSub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      // 4. Build the PushFavoriteTuple list from the user's current favorites
      const favoriteTuples: PushFavoriteTuple[] = favorites.map((fav) => ({
        stationId: fav.stationId,
        lines: fav.lines,
        direction: fav.direction,
      }));

      // 5. Send subscription + favorites + quiet hours to the backend
      const subJson = pushSub.toJSON();
      if (!subJson.endpoint || !subJson.keys?.p256dh || !subJson.keys?.auth) {
        throw new Error("Invalid push subscription object from browser");
      }

      const body: PushSubscribeRequest = {
        subscription: {
          endpoint: subJson.endpoint,
          keys: { p256dh: subJson.keys.p256dh, auth: subJson.keys.auth },
        },
        favorites: favoriteTuples,
        quietHours: quietHours ?? { enabled: false, startHour: 0, endHour: 5 },
      };

      try {
        const res = await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error("Failed to register subscription with server");
        setIsSubscribed(true);
      } catch (regErr) {
        // Browser subscription succeeded but backend registration failed.
        // Queue the registration and retry when connectivity returns.
        if (!navigator.onLine) {
          queuePendingOp({ type: "subscribe", body });
          registerBackgroundSync();
          setIsSubscribed(true); // optimistic — browser sub is live
          setError("Offline — subscription queued and will sync when you reconnect.");
        } else {
          throw regErr;
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to enable push notifications");
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, favorites, quietHours]);

  const unsubscribe = useCallback(async () => {
    if (!isSupported) return;
    setIsLoading(true);
    setError(null);

    try {
      const reg = await navigator.serviceWorker.ready;
      const pushSub = await reg.pushManager.getSubscription();

      if (pushSub) {
        // Attempt to remove from backend first
        try {
          await fetch("/api/push/unsubscribe", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: pushSub.endpoint }),
          });
        } catch {
          // Queue the deletion if offline; unsubscribe from the browser regardless
          if (!navigator.onLine) {
            queuePendingOp({ type: "unsubscribe", endpoint: pushSub.endpoint });
            registerBackgroundSync();
          }
          // Don't rethrow — we still unsubscribe locally below
        }

        // Always unsubscribe from the browser (this is a local operation)
        await pushSub.unsubscribe();
      }

      setIsSubscribed(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disable push notifications");
    } finally {
      setIsLoading(false);
    }
  }, [isSupported]);

  // ---------------------------------------------------------------------------
  // Retry pending op when connectivity returns
  // ---------------------------------------------------------------------------

  const retryPendingOp = useCallback(async () => {
    const op = dequeuePendingOp();
    if (!op) return;

    if (op.type === "subscribe") {
      try {
        const res = await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(op.body),
        });
        if (!res.ok) {
          // Put it back; we'll retry next time
          queuePendingOp(op);
        }
      } catch {
        queuePendingOp(op);
      }
    } else if (op.type === "unsubscribe") {
      try {
        await fetch("/api/push/unsubscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: op.endpoint }),
        });
      } catch {
        queuePendingOp(op);
      }
    }
  }, []);

  // Retry via window "online" event (same-tab reconnect)
  useEffect(() => {
    const handle = () => void retryPendingOp();
    window.addEventListener("online", handle);
    return () => window.removeEventListener("online", handle);
  }, [retryPendingOp]);

  // Retry via SW postMessage (Background Sync wakes the SW which messages us)
  useEffect(() => {
    if (!isSupported) return;

    const handle = (event: MessageEvent) => {
      if ((event.data as { type?: string } | null)?.type === "RETRY_PUSH_SUBSCRIPTION") {
        void retryPendingOp();
      }
    };

    navigator.serviceWorker.addEventListener("message", handle);
    return () => navigator.serviceWorker.removeEventListener("message", handle);
  }, [isSupported, retryPendingOp]);

  return {
    isSupported,
    isOldIOS,
    permission,
    isSubscribed,
    isLoading,
    error,
    subscribe,
    unsubscribe,
  };
}
