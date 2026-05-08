/**
 * Mock for virtual:pwa-register module.
 * This module is provided by vite-plugin-pwa during build but not available in tests.
 */

export function registerSW(options?: {
  immediate?: boolean;
  onRegistered?: (registration: ServiceWorkerRegistration | undefined) => void;
  onRegisterError?: (error: unknown) => void;
  onNeedRefresh?: () => void;
  onOfflineReady?: () => void;
}) {
  // Store callbacks for test access
  (registerSW as any)._mockOptions = options;

  return () => {
    // Unregister function
  };
}

// Expose methods for tests to trigger callbacks
(registerSW as any).triggerOnRegistered = (registration?: ServiceWorkerRegistration) => {
  const options = (registerSW as any)._mockOptions;
  options?.onRegistered?.(registration);
};

(registerSW as any).triggerOnRegisterError = (error: unknown) => {
  const options = (registerSW as any)._mockOptions;
  options?.onRegisterError?.(error);
};

(registerSW as any).triggerOnNeedRefresh = () => {
  const options = (registerSW as any)._mockOptions;
  options?.onNeedRefresh?.();
};

(registerSW as any).triggerOnOfflineReady = () => {
  const options = (registerSW as any)._mockOptions;
  options?.onOfflineReady?.();
};

// Reset mock state
(registerSW as any).mockReset = () => {
  (registerSW as any)._mockOptions = undefined;
};
