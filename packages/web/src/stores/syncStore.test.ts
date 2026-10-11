import { beforeEach, describe, expect, it } from "vitest";
import { usePreferencesSyncStore } from "./syncStore";

function resetStore() {
  usePreferencesSyncStore.setState({
    status: "not-signed-in",
    lastSyncedAt: null,
    error: null,
    hasPendingChanges: false,
    manualSyncRequest: 0,
    remoteLoadRequest: 0,
    readyVersion: 0,
  });
}

describe("usePreferencesSyncStore", () => {
  beforeEach(() => {
    resetStore();
  });

  it("starts in the not-signed-in state", () => {
    const state = usePreferencesSyncStore.getState();
    expect(state.status).toBe("not-signed-in");
    expect(state.lastSyncedAt).toBeNull();
    expect(state.error).toBeNull();
    expect(state.hasPendingChanges).toBe(false);
  });

  it("setSyncing moves to syncing and clears any prior error", () => {
    usePreferencesSyncStore.setState({ error: "boom" });
    usePreferencesSyncStore.getState().setSyncing();

    const state = usePreferencesSyncStore.getState();
    expect(state.status).toBe("syncing");
    expect(state.error).toBeNull();
  });

  it("setSynced records the sync timestamp, clears errors and pending changes", () => {
    usePreferencesSyncStore.setState({ error: "boom", hasPendingChanges: true });
    usePreferencesSyncStore.getState().setSynced(12345);

    const state = usePreferencesSyncStore.getState();
    expect(state.status).toBe("synced");
    expect(state.lastSyncedAt).toBe(12345);
    expect(state.error).toBeNull();
    expect(state.hasPendingChanges).toBe(false);
  });

  it("setSynced defaults the timestamp to now", () => {
    const before = Date.now();
    usePreferencesSyncStore.getState().setSynced();
    const after = Date.now();

    const { lastSyncedAt } = usePreferencesSyncStore.getState();
    expect(lastSyncedAt).not.toBeNull();
    expect(lastSyncedAt as number).toBeGreaterThanOrEqual(before);
    expect(lastSyncedAt as number).toBeLessThanOrEqual(after);
  });

  it("setError records the message and whether changes are still pending", () => {
    usePreferencesSyncStore.getState().setError("sync failed", true);

    const state = usePreferencesSyncStore.getState();
    expect(state.status).toBe("error");
    expect(state.error).toBe("sync failed");
    expect(state.hasPendingChanges).toBe(true);
  });

  it("setError defaults hasPendingChanges to false", () => {
    usePreferencesSyncStore.getState().setError("sync failed");

    expect(usePreferencesSyncStore.getState().hasPendingChanges).toBe(false);
  });

  it("setNotSignedIn clears sync state entirely", () => {
    usePreferencesSyncStore.setState({
      status: "error",
      lastSyncedAt: 999,
      error: "boom",
      hasPendingChanges: true,
    });

    usePreferencesSyncStore.getState().setNotSignedIn();

    const state = usePreferencesSyncStore.getState();
    expect(state.status).toBe("not-signed-in");
    expect(state.lastSyncedAt).toBeNull();
    expect(state.error).toBeNull();
    expect(state.hasPendingChanges).toBe(false);
  });

  it("markReady increments readyVersion each call", () => {
    expect(usePreferencesSyncStore.getState().readyVersion).toBe(0);
    usePreferencesSyncStore.getState().markReady();
    usePreferencesSyncStore.getState().markReady();

    expect(usePreferencesSyncStore.getState().readyVersion).toBe(2);
  });

  it("setPending flags pending changes and resolves an in-progress sync to synced", () => {
    usePreferencesSyncStore.setState({ status: "syncing" });
    usePreferencesSyncStore.getState().setPending();

    const state = usePreferencesSyncStore.getState();
    expect(state.status).toBe("synced");
    expect(state.hasPendingChanges).toBe(true);
  });

  it("setPending leaves a non-syncing status untouched", () => {
    usePreferencesSyncStore.setState({ status: "error" });
    usePreferencesSyncStore.getState().setPending();

    expect(usePreferencesSyncStore.getState().status).toBe("error");
    expect(usePreferencesSyncStore.getState().hasPendingChanges).toBe(true);
  });

  it("requestSync and requestRemoteLoad increment their own counters independently", () => {
    usePreferencesSyncStore.getState().requestSync();
    usePreferencesSyncStore.getState().requestSync();
    usePreferencesSyncStore.getState().requestRemoteLoad();

    const state = usePreferencesSyncStore.getState();
    expect(state.manualSyncRequest).toBe(2);
    expect(state.remoteLoadRequest).toBe(1);
  });

  it("clearError resolves an error status back to synced and drops the message", () => {
    usePreferencesSyncStore.setState({ status: "error", error: "boom" });
    usePreferencesSyncStore.getState().clearError();

    const state = usePreferencesSyncStore.getState();
    expect(state.status).toBe("synced");
    expect(state.error).toBeNull();
  });

  it("clearError only drops the message when status is not error", () => {
    usePreferencesSyncStore.setState({ status: "not-signed-in", error: "boom" });
    usePreferencesSyncStore.getState().clearError();

    const state = usePreferencesSyncStore.getState();
    expect(state.status).toBe("not-signed-in");
    expect(state.error).toBeNull();
  });
});
