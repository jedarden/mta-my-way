/**
 * Mock for virtual:pwa-register module.
 * This module is provided by vite-plugin-pwa during build but not available in tests.
 */

export function registerSW(_options?: {
  immediate?: boolean;
  onRegistered?: (registration: ServiceWorkerRegistration) => void;
  onRegisterError?: (error: unknown) => void;
}) {
  return {
    update: () => Promise.resolve(),
  };
}
