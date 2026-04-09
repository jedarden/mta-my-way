/**
 * ServiceWorkerUpdatePrompt - Prompts users when a new app version is available.
 *
 * Integrates with vite-plugin-pwa to detect when a new service worker is available
 * and prompts the user to update.
 */

import { useCallback, useEffect, useState } from "react";
import { useServiceWorkerUpdate } from "../../lib/serviceWorkerRegistration";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}

/**
 * ServiceWorkerUpdatePrompt - Shows update banner when new version is available
 */
export function ServiceWorkerUpdatePrompt() {
  const { needRefresh, updateServiceWorker } = useServiceWorkerUpdate();
  const [dismissed, setDismissed] = useState(false);

  const handleUpdate = useCallback(() => {
    updateServiceWorker();
  }, [updateServiceWorker]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  if (!needRefresh || dismissed) return null;

  return (
    <div
      className="fixed bottom-16 left-4 right-4 z-50 md:bottom-4 md:max-w-sm md:left-auto md:right-4 animate-slide-up"
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

  const handleBeforeInstall = useCallback((e: BeforeInstallPromptEvent) => {
    // Prevent the mini-infobar from appearing
    e.preventDefault();
    // Stash the event for later use
    setDeferredPrompt(e);
    // Show our custom install prompt after a delay
    setTimeout(() => setShowInstallPrompt(true), 3000);
  }, []);

  useEffect(() => {
    window.addEventListener("beforeinstallprompt", handleBeforeInstall);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
    };
  }, [handleBeforeInstall]);

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
      className="fixed bottom-16 left-4 right-4 z-50 md:bottom-4 md:max-w-sm md:left-auto md:right-4 animate-slide-up"
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
