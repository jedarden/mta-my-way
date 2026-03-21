/**
 * usePushNotifications — manage Web Push subscription lifecycle.
 *
 * IMPORTANT: Push permission is NEVER requested automatically.
 * The user must call subscribe() explicitly (from the Settings screen).
 *
 * iOS Safari requires iOS 16.4+ and the app installed as a PWA (Add to Home Screen).
 * The isOldIOS flag lets the UI show an informative message on older devices.
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

      // 2. Get VAPID public key from the server
      const vapidRes = await fetch("/api/push/vapid-public-key");
      if (!vapidRes.ok) {
        throw new Error("Push notifications are not configured on the server");
      }
      const { publicKey } = (await vapidRes.json()) as { publicKey: string };

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
          keys: {
            p256dh: subJson.keys.p256dh,
            auth: subJson.keys.auth,
          },
        },
        favorites: favoriteTuples,
        quietHours: quietHours ?? { enabled: false, startHour: 0, endHour: 5 },
      };

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new Error("Failed to register subscription with server");
      }

      setIsSubscribed(true);
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
        // Remove from backend first
        await fetch("/api/push/unsubscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: pushSub.endpoint }),
        });

        // Then unsubscribe in the browser
        await pushSub.unsubscribe();
      }

      setIsSubscribed(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disable push notifications");
    } finally {
      setIsLoading(false);
    }
  }, [isSupported]);

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
