/**
 * Mock for virtual:pwa-register module.
 * This module is provided by vite-plugin-pwa during build but not available in tests.
 */

/** Options serviceWorkerRegistration.ts passes to registerSW(). */
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
  /** Options captured from the most recent call */
  _mockOptions: RegisterSWOptions | undefined;
  mockReset(): void;
  triggerOnRegistered(registration?: ServiceWorkerRegistration): void;
  triggerOnRegisterError(error: unknown): void;
  triggerOnNeedRefresh(): void;
  triggerOnOfflineReady(): void;
}

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
