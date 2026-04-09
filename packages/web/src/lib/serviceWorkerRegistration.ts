/**
 * Service Worker Registration - Handles PWA service worker registration and updates.
 *
 * Integrates with vite-plugin-pwa to provide:
 * - Service worker registration
 * - Update detection and prompts
 * - Clean update flow
 */

import { registerSW } from "virtual:pwa-register";
import { useEffect, useState } from "react";

// Module-level state for update detection (accessible outside React)
let updateCallback: (() => void) | null = null;

/**
 * Register the service worker with PWA support.
 * Call this once in main.tsx.
 */
export function registerServiceWorker(): void {
  registerSW({
    immediate: true,
    onRegistered(registration: ServiceWorkerRegistration | undefined) {
      console.log("Service Worker registered:", registration);
    },
    onRegisterError(error: unknown) {
      console.error("Service Worker registration failed:", error);
    },
    onNeedRefresh() {
      // Notify listeners that an update is available
      if (updateCallback) {
        updateCallback();
      }
    },
    onOfflineReady() {
      console.log("App is ready for offline use");
    },
  });
}

/**
 * Hook to detect and handle service worker updates.
 * Returns whether an update is available and a function to trigger the update.
 */
export function useServiceWorkerUpdate(): {
  needRefresh: boolean;
  updateServiceWorker: () => void;
} {
  const [needRefresh, setNeedRefresh] = useState(false);

  useEffect(() => {
    // Register our callback for update notifications
    updateCallback = () => {
      setNeedRefresh(true);
    };

    // Check for waiting service worker on mount
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.ready.then((registration) => {
        if (registration.waiting) {
          setNeedRefresh(true);
        }
      });
    }

    return () => {
      updateCallback = null;
    };
  }, []);

  const updateServiceWorker = () => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.ready.then((registration) => {
        // Send SKIP_WAITING message to the waiting service worker
        if (registration.waiting) {
          registration.waiting.postMessage({ type: "SKIP_WAITING" });
        }

        // Listen for controller change and reload
        const handleControllerChange = () => {
          window.location.reload();
        };

        navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

        // Cleanup listener after reload (which never happens, but for completeness)
        return () => {
          navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
        };
      });
    }
  };

  return { needRefresh, updateServiceWorker };
}
