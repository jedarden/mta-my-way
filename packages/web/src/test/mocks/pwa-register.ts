/**
 * Mock for virtual:pwa-register module.
 * This module is provided by vite-plugin-pwa during build but not available in tests.
 */

/** Callback options passed to `registerSW()` by the service worker wrapper. */
export interface RegisterSWOptions {
  immediate?: boolean;
  onRegistered?: (registration: ServiceWorkerRegistration | undefined) => void;
  onRegisterError?: (error: unknown) => void;
  onNeedRefresh?: () => void;
  onOfflineReady?: () => void;
}

/**
 * The mock object: the callable the product imports, plus the captured state
 * and trigger helpers tests use to drive its callbacks.
 */
export interface RegisterSWMock {
  (options?: RegisterSWOptions): () => void;
  /** Options captured from the most recent call. */
  _mockOptions: RegisterSWOptions | undefined;
  /** Clear captured options before another registration test. */
  mockReset(): void;
  /** Invoke the captured success callback with an optional registration. */
  triggerOnRegistered(registration?: ServiceWorkerRegistration): void;
  /** Invoke the captured registration-error callback. */
  triggerOnRegisterError(error: unknown): void;
  /** Invoke the captured update-available callback. */
  triggerOnNeedRefresh(): void;
  /** Invoke the captured offline-ready callback. */
  triggerOnOfflineReady(): void;
}

/**
 * Callable PWA registration mock used by the Vitest alias.
 * Captures callbacks and returns a no-op unregister function.
 */
export const registerSW: RegisterSWMock = Object.assign(
  (options?: RegisterSWOptions) => {
    // Store callbacks for test access
    registerSW._mockOptions = options;

    return () => {
      // Unregister function
    };
  },
  {
    _mockOptions: undefined,
    // Reset mock state
    mockReset() {
      registerSW._mockOptions = undefined;
    },
    // Expose methods for tests to trigger callbacks
    triggerOnRegistered(registration?: ServiceWorkerRegistration) {
      registerSW._mockOptions?.onRegistered?.(registration);
    },
    triggerOnRegisterError(error: unknown) {
      registerSW._mockOptions?.onRegisterError?.(error);
    },
    triggerOnNeedRefresh() {
      registerSW._mockOptions?.onNeedRefresh?.();
    },
    triggerOnOfflineReady() {
      registerSW._mockOptions?.onOfflineReady?.();
    },
  }
);
