import type { UserPreferences } from "@mta-my-way/shared";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "../stores/authStore";
import { useFavoritesStore } from "../stores/favoritesStore";
import { useSettingsStore } from "../stores/settingsStore";
import { usePreferencesSyncStore } from "../stores/syncStore";
import { mergeServerPreferences, usePreferencesSync } from "./usePreferencesSync";

function preferences(overrides: Partial<UserPreferences> = {}): UserPreferences {
  return {
    favorites: [],
    commutes: [],
    settings: {
      theme: "system",
      showUnassignedTrips: false,
      refreshInterval: 30,
      alertSeverityFilter: "delays",
      hapticFeedback: true,
      accessibleMode: false,
      quietHours: { enabled: false, startHour: 22, endHour: 7 },
    },
    pushSubscription: null,
    schemaVersion: 1,
    tapHistory: [],
    onboardingComplete: true,
    ...overrides,
  };
}

describe("usePreferencesSync", () => {
  beforeEach(() => {
    localStorage.clear();
    useFavoritesStore.setState({
      favorites: [],
      commutes: [],
      tapHistory: [],
      onboardingComplete: false,
    });
    useSettingsStore.setState({
      theme: "system",
      showUnassignedTrips: false,
      refreshInterval: 30,
      alertSeverityFilter: "delays",
      hapticFeedback: true,
      accessibleMode: false,
      quietHours: { enabled: false, startHour: 22, endHour: 7 },
    });
    useAuthStore.setState({
      authenticated: false,
      profile: null,
      loading: true,
    });
    usePreferencesSyncStore.setState({
      status: "not-signed-in",
      lastSyncedAt: null,
      error: null,
      hasPendingChanges: false,
      manualSyncRequest: 0,
      remoteLoadRequest: 0,
      readyVersion: 0,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps local-only items while letting server items win by id", () => {
    const server = preferences({
      favorites: [
        {
          id: "shared",
          stationId: "127",
          stationName: "Server station",
          lines: ["1"],
          direction: "both",
          sortOrder: 0,
        },
      ],
      settings: { ...preferences().settings, theme: "dark" },
    });
    const local = preferences({
      favorites: [
        {
          id: "shared",
          stationId: "127",
          stationName: "Local copy",
          lines: ["2"],
          direction: "N",
          sortOrder: 0,
        },
        {
          id: "local-only",
          stationId: "635",
          stationName: "Local station",
          lines: ["A"],
          direction: "S",
          sortOrder: 1,
        },
      ],
      settings: { ...preferences().settings, theme: "light" },
    });

    const merged = mergeServerPreferences(server, local);

    expect(merged.favorites).toMatchObject([
      { id: "shared", stationName: "Server station", lines: ["1"] },
      { id: "local-only", stationName: "Local station" },
    ]);
    expect(merged.settings.theme).toBe("dark");
  });

  it("loads server preferences after sign-in and syncs a subsequent favorite change", async () => {
    const server = preferences({
      favorites: [
        {
          id: "server-favorite",
          stationId: "127",
          stationName: "Times Sq-42 St",
          lines: ["1", "2", "3"],
          direction: "both",
          sortOrder: 0,
        },
      ],
    });
    const writes: UserPreferences[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "/api/auth/session") {
          return new Response(
            JSON.stringify({
              authenticated: true,
              profile: { userId: "oauth:google:test-rider", provider: "google" },
            })
          );
        }
        if (url === "/api/preferences" && init?.method === "PUT") {
          writes.push(JSON.parse(String(init.body)) as UserPreferences);
          return new Response(JSON.stringify(server));
        }
        return new Response(JSON.stringify(server));
      })
    );

    renderHook(() => usePreferencesSync());

    await waitFor(() => {
      expect(useFavoritesStore.getState().favorites).toMatchObject([
        { id: "server-favorite", stationName: "Times Sq-42 St" },
      ]);
    });

    act(() => {
      useFavoritesStore.getState().addFavorite({
        stationId: "635",
        stationName: "14 St",
        lines: ["A"],
        direction: "both",
      });
    });

    await waitFor(
      () => {
        expect(writes).toHaveLength(1);
      },
      { timeout: 2_000 }
    );
    expect(writes[0]?.favorites).toEqual(
      expect.arrayContaining([expect.objectContaining({ stationName: "14 St" })])
    );
  });

  it("queues a preference update when the server cannot be reached", async () => {
    const server = preferences();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "/api/auth/session") {
          return new Response(
            JSON.stringify({
              authenticated: true,
              profile: { userId: "oauth:github:test-rider", provider: "github" },
            })
          );
        }
        if (url === "/api/preferences" && init?.method === "PUT") {
          return new Response("temporarily unavailable", { status: 503 });
        }
        return new Response(JSON.stringify(server));
      })
    );

    renderHook(() => usePreferencesSync());
    await waitFor(() => expect(usePreferencesSyncStore.getState().status).toBe("synced"));

    act(() => {
      useFavoritesStore.getState().addFavorite({
        stationId: "635",
        stationName: "14 St",
        lines: ["A"],
        direction: "both",
      });
    });

    await waitFor(
      () => {
        expect(localStorage.getItem("mta-pending-preferences-sync")).not.toBeNull();
        expect(usePreferencesSyncStore.getState()).toMatchObject({
          status: "error",
          hasPendingChanges: true,
        });
      },
      { timeout: 2_000 }
    );
  });
});
