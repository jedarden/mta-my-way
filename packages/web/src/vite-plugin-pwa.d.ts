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
