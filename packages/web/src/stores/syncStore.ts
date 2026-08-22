import { create } from "zustand";

export type PreferencesSyncStatus = "not-signed-in" | "syncing" | "synced" | "error";

interface SyncStore {
  status: PreferencesSyncStatus;
  lastSyncedAt: number | null;
  error: string | null;
  hasPendingChanges: boolean;
  manualSyncRequest: number;
  remoteLoadRequest: number;
  readyVersion: number;
  setSyncing: () => void;
  setSynced: (timestamp?: number) => void;
  setError: (message: string, hasPendingChanges?: boolean) => void;
  setNotSignedIn: () => void;
  markReady: () => void;
  setPending: () => void;
  requestSync: () => void;
  requestRemoteLoad: () => void;
  clearError: () => void;
}

/** UI state for the optional cross-device preferences sync. */
export const usePreferencesSyncStore = create<SyncStore>((set) => ({
  status: "not-signed-in",
  lastSyncedAt: null,
  error: null,
  hasPendingChanges: false,
  manualSyncRequest: 0,
  remoteLoadRequest: 0,
  readyVersion: 0,

  setSyncing: () => set({ status: "syncing", error: null }),
  setSynced: (timestamp = Date.now()) =>
    set({ status: "synced", lastSyncedAt: timestamp, error: null, hasPendingChanges: false }),
  setError: (error, hasPendingChanges = false) =>
    set({ status: "error", error, hasPendingChanges }),
  setNotSignedIn: () =>
    set({
      status: "not-signed-in",
      lastSyncedAt: null,
      error: null,
      hasPendingChanges: false,
    }),
  markReady: () => set((state) => ({ readyVersion: state.readyVersion + 1 })),
  setPending: () =>
    set((state) => ({
      status: state.status === "syncing" ? "synced" : state.status,
      hasPendingChanges: true,
    })),
  requestSync: () => set((state) => ({ manualSyncRequest: state.manualSyncRequest + 1 })),
  requestRemoteLoad: () => set((state) => ({ remoteLoadRequest: state.remoteLoadRequest + 1 })),
  clearError: () =>
    set((state) => ({ error: null, status: state.status === "error" ? "synced" : state.status })),
}));
