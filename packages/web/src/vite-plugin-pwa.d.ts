/**
 * Periodic Background Sync API types (not yet in lib.dom.d.ts).
 * https://wicg.github.io/periodic-background-sync/
 */
interface PeriodicSyncManager {
  register(tag: string, options?: { minInterval?: number }): Promise<void>;
  getTags(): Promise<string[]>;
  unregister(tag: string): Promise<void>;
}

interface PeriodicSyncEvent extends ExtendableEvent {
  readonly tag: string;
}

declare module "virtual:pwa-register" {
  export interface RegisterSWOptions {
    immediate?: boolean;
    onRegistered?(registration: ServiceWorkerRegistration | undefined): void;
    onRegisterError?(error: unknown): void;
    onNeedRefresh?: () => void;
    onOfflineReady?: () => void;
    onRegistered?(registration: ServiceWorkerRegistration | undefined): void;
  }

  export function registerSW(options: RegisterSWOptions): () => void;
}
