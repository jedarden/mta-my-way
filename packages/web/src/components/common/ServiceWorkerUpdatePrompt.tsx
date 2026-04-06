/**
 * ServiceWorkerUpdatePrompt - Prompts users when a new app version is available.
 *
 * Per plan.md Phase 4: Enhanced offline support and PWA features.
 *
 * Features:
 *   - Detects when a new service worker is waiting to activate
 *   - Shows an unobtrusive banner prompting user to update
 *   - One-tap update flow
 *   - Auto-update option for convenience
 */

import { useCallback, useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}

interface ServiceWorkerRegistration extends ServiceWorkerRegistration {
  waiting?: ServiceWorker;
}

/**
 * ServiceWorkerUpdatePrompt - Shows update banner when new version is available
 */
export function ServiceWorkerUpdatePrompt() {
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    // Check for waiting service worker (new version available)
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.ready.then((registration: ServiceWorkerRegistration) => {
        if (registration.waiting) {
          // New version is already waiting
          setWaitingWorker(registration.waiting);
          setShowUpdatePrompt(true);
        }

        // Listen for new waiting service workers
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener("statechange", () => {
              if (newWorker.state === "installed" && registration.waiting) {
                setWaitingWorker(registration.waiting);
                setShowUpdatePrompt(true);
              }
            });
          }
        });
      });
    }
  }, []);

  // Listen for the service worker controller change (app was refreshed)
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      const handleControllerChange = () => {
        // Page has been refreshed, reload to get new content
        window.location.reload();
      };

      navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

      return () => {
        navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
      };
    }
  }, []);

  const handleUpdate = useCallback(() => {
    if (waitingWorker) {
      // Tell the waiting service worker to skip waiting and become active
      waitingWorker.postMessage({ type: "SKIP_WAITING" });

      // The controllerchange event will trigger a reload
      setShowUpdatePrompt(false);
    }
  }, [waitingWorker]);

  const handleDismiss = useCallback(() => {
    setShowUpdatePrompt(false);
  }, []);

  if (!showUpdatePrompt) return null;

  return (
    <div
      className="fixed bottom-16 left-4 right-4 z-50 md:bottom-4 md:max-w-sm md:left-auto md:right-4"
      role="alert"
      aria-live="polite"
    >
      <div className="bg-mta-primary text-white rounded-lg shadow-lg p-4">
        <div className="flex items-start gap-3">
          <div className="shrink-0" aria-hidden="true">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 21h5v-5" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm mb-1">Update available</p>
            <p className="text-13 opacity-90 mb-3">
              A new version of MTA My Way is ready to install.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleUpdate}
                className="flex-1 px-3 py-2 bg-white text-mta-primary rounded font-medium text-13 min-h-touch hover:bg-opacity-90 transition-opacity"
              >
                Update now
              </button>
              <button
                type="button"
                onClick={handleDismiss}
                className="px-3 py-2 bg-white/10 text-white rounded font-medium text-13 min-h-touch hover:bg-white/20 transition-colors"
              >
                Later
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * PWAInstallPrompt - Shows install prompt for eligible users
 */
export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);

  useEffect(() => {
    const handleBeforeInstall = (e: BeforeInstallPromptEvent) => {
      // Prevent the mini-infobar from appearing
      e.preventDefault();
      // Stash the event for later use
      setDeferredPrompt(e);
      // Show our custom install prompt after a delay
      setTimeout(() => setShowInstallPrompt(true), 3000);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
    };
  }, []);

  const handleInstall = useCallback(() => {
    if (!deferredPrompt) return;

    // Show the install prompt
    void deferredPrompt.prompt();

    // Wait for user response
    void deferredPrompt.userChoice.then(({ outcome }) => {
      if (outcome === "accepted") {
        console.log("PWA installation accepted");
      }

      setDeferredPrompt(null);
      setShowInstallPrompt(false);
    });
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    setShowInstallPrompt(false);
    // Don't show again for this session
    setDeferredPrompt(null);
  }, []);

  if (!showInstallPrompt || !deferredPrompt) return null;

  return (
    <div
      className="fixed bottom-16 left-4 right-4 z-50 md:bottom-4 md:max-w-sm md:left-auto md:right-4"
      role="alert"
      aria-live="polite"
    >
      <div className="bg-surface dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg shadow-lg p-4">
        <div className="flex items-start gap-3">
          <div
            className="shrink-0 w-10 h-10 bg-mta-primary rounded-lg flex items-center justify-center"
            aria-hidden="true"
          >
            <span className="text-xl">🚇</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-text-primary dark:text-dark-text-primary text-sm mb-1">
              Install MTA My Way
            </p>
            <p className="text-13 text-text-secondary dark:text-dark-text-secondary mb-3">
              Add to home screen for the best experience
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleInstall}
                className="flex-1 px-3 py-2 bg-mta-primary text-white rounded font-medium text-13 min-h-touch hover:opacity-90 transition-opacity"
              >
                Install
              </button>
              <button
                type="button"
                onClick={handleDismiss}
                className="px-3 py-2 text-text-secondary dark:text-dark-text-secondary rounded font-medium text-13 min-h-touch hover:bg-background dark:hover:bg-dark-background transition-colors"
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ServiceWorkerUpdatePrompt;
