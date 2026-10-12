/**
 * Tests for SettingsScreen component.
 *
 * Covers the authentication/settings critical paths:
 * - Sync section renders for loading, signed-in, and signed-out auth states
 * - Profile name/email/fallback display and last-synced formatting
 * - Sign out success and failure (account error alert)
 * - Delete local data confirmation flow (confirm, cancel, sign-out failure)
 * - Appearance/Data/Accessibility controls write through to the settings store
 * - Push notification section variants (old iOS, unsupported, denied, active)
 * - Push toggle dispatch and quiet hours controls
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthProfile } from "../hooks/useAuth";
import { clearLocalPreferences } from "../hooks/usePreferencesSync";
import type { PushNotificationsState } from "../hooks/usePushNotifications";
import { usePushNotifications } from "../hooks/usePushNotifications";
import { useAuthStore } from "../stores/authStore";
import { useSettingsStore } from "../stores/settingsStore";
import { usePreferencesSyncStore } from "../stores/syncStore";
import SettingsScreen from "./SettingsScreen";

vi.mock("../hooks/usePushNotifications", () => ({
  usePushNotifications: vi.fn(),
}));

// Keep the real module (its hook is not mounted here) but intercept the one
// function SettingsScreen calls directly, so local data is never wiped.
vi.mock("../hooks/usePreferencesSync", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../hooks/usePreferencesSync")>()),
  clearLocalPreferences: vi.fn(),
}));

const makePushState = (
  overrides: Partial<PushNotificationsState> = {}
): PushNotificationsState => ({
  isSupported: true,
  isOldIOS: false,
  permission: "granted",
  isSubscribed: false,
  isLoading: false,
  error: null,
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  ...overrides,
});

function signInAs(overrides: Partial<AuthProfile> = {}): void {
  useAuthStore.setState({
    authenticated: true,
    loading: false,
    profile: { userId: "u1", email: "rider@example.com", name: "Test Rider", ...overrides },
  });
}

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={["/settings"]}>
      <SettingsScreen />
    </MemoryRouter>
  );
}

describe("SettingsScreen", () => {
  beforeEach(() => {
    vi.mocked(usePushNotifications).mockReturnValue(makePushState());
    useAuthStore.setState({
      authenticated: false,
      profile: null,
      loading: false,
      signOut: vi.fn().mockResolvedValue(true),
    });
    useSettingsStore.setState({
      theme: "system",
      showUnassignedTrips: false,
      refreshInterval: 30,
      accessibleMode: false,
      quietHours: { enabled: false, startHour: 22, endHour: 7 },
    });
    usePreferencesSyncStore.setState({
      status: "synced",
      lastSyncedAt: null,
      hasPendingChanges: false,
      manualSyncRequest: 0,
    });
  });

  describe("sync section auth states", () => {
    it("shows the checking message while auth is loading", () => {
      useAuthStore.setState({ loading: true });

      renderScreen();

      expect(screen.getByText("Checking sync status…")).toBeInTheDocument();
      expect(screen.queryByText("Not signed in")).not.toBeInTheDocument();
    });

    it("shows the signed-out view with OAuth links", () => {
      renderScreen();

      expect(screen.getByText("Not signed in")).toBeInTheDocument();
      expect(screen.getByText("Local only")).toBeInTheDocument();
      expect(
        screen.getByText("Sign in to sync your favorites, commutes, and settings across devices.")
      ).toBeInTheDocument();

      const google = screen.getByRole("link", { name: "Continue with Google" });
      expect(google).toHaveAttribute("href", "/auth/google");
      const github = screen.getByRole("link", { name: "Continue with GitHub" });
      expect(github).toHaveAttribute("href", "/auth/github");

      expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
    });

    it("shows the profile name, signed-in badge, and sync actions", () => {
      signInAs({ name: "Test Rider" });

      renderScreen();

      expect(screen.getByText("Test Rider")).toBeInTheDocument();
      expect(screen.getByLabelText("Signed in and syncing")).toHaveTextContent("Signed in");
      expect(screen.getByText("Sync is active")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Sync now" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
    });

    it("falls back to the profile email when no name is set", () => {
      signInAs({ name: undefined });

      renderScreen();

      expect(screen.getByText("rider@example.com")).toBeInTheDocument();
      expect(screen.queryByText("Test Rider")).not.toBeInTheDocument();
    });

    it("falls back to plain 'Signed in' when the profile has neither name nor email", () => {
      signInAs({ name: undefined, email: undefined });

      renderScreen();

      // One fallback <p> plus the badge span.
      expect(screen.getAllByText("Signed in").length).toBe(2);
    });

    it("shows the syncing status and disables Sync now while syncing", () => {
      signInAs();
      usePreferencesSyncStore.setState({ status: "syncing" });

      renderScreen();

      expect(screen.getByText("Syncing your preferences…")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Sync now" })).toBeDisabled();
    });

    it("shows the pending-changes status", () => {
      signInAs();
      usePreferencesSyncStore.setState({ hasPendingChanges: true });

      renderScreen();

      expect(screen.getByText("Changes are waiting to sync")).toBeInTheDocument();
    });

    it("shows 'Not yet synced' before the first successful sync", () => {
      signInAs();
      usePreferencesSyncStore.setState({ lastSyncedAt: null });

      renderScreen();

      expect(screen.getByText("Not yet synced")).toBeInTheDocument();
    });

    it("renders the last-synced timestamp on the <time> element", () => {
      signInAs();
      const syncedAt = Date.UTC(2026, 0, 15, 10, 30);
      usePreferencesSyncStore.setState({ lastSyncedAt: syncedAt });

      const { container } = renderScreen();

      const time = container.querySelector("time");
      expect(time).not.toBeNull();
      expect(time).toHaveAttribute("dateTime", new Date(syncedAt).toISOString());
      expect(time).not.toHaveTextContent("Not yet synced");
    });

    it("requests a manual sync through the sync store", () => {
      signInAs();

      renderScreen();
      fireEvent.click(screen.getByRole("button", { name: "Sync now" }));

      expect(usePreferencesSyncStore.getState().manualSyncRequest).toBe(1);
    });
  });

  describe("sign out", () => {
    it("signs out and switches to the signed-out view on success", async () => {
      signInAs({ name: "Test Rider" });
      const signOut = vi.fn().mockImplementation(async () => {
        useAuthStore.setState({ authenticated: false, profile: null });
        return true;
      });
      useAuthStore.setState({ signOut });

      renderScreen();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
      });

      expect(signOut).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Not signed in")).toBeInTheDocument();
      expect(
        screen.queryByText("We couldn't sign you out right now. Please try again.")
      ).not.toBeInTheDocument();
    });

    it("shows an account error when the store fails to sign out", async () => {
      signInAs({ name: "Test Rider" });
      useAuthStore.setState({ signOut: vi.fn().mockResolvedValue(false) });

      renderScreen();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
      });

      expect(
        screen.getByText("We couldn't sign you out right now. Please try again.")
      ).toBeInTheDocument();
    });
  });

  describe("delete local data", () => {
    it("reveals the confirmation dialog", () => {
      signInAs();

      renderScreen();
      fireEvent.click(
        screen.getByRole("button", { name: "Stop syncing and delete local data" })
      );

      const dialog = screen.getByRole("alertdialog");
      expect(dialog).toBeInTheDocument();
      expect(
        screen.getByText(
          "Delete favorites, commutes, and settings from this device? Your synced copy will remain in your account."
        )
      ).toBeInTheDocument();
    });

    it("hides the dialog on cancel", () => {
      signInAs();

      renderScreen();
      fireEvent.click(
        screen.getByRole("button", { name: "Stop syncing and delete local data" })
      );
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });

    it("clears local preferences and closes the dialog on confirm", async () => {
      signInAs();

      renderScreen();
      fireEvent.click(
        screen.getByRole("button", { name: "Stop syncing and delete local data" })
      );
      await act(async () => {
        fireEvent.click(
          screen.getByRole("button", { name: "Delete local data and sign out" })
        );
      });

      expect(vi.mocked(clearLocalPreferences)).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
      expect(
        screen.queryByText(
          "We couldn't sign you out, so your local data was left unchanged."
        )
      ).not.toBeInTheDocument();
    });

    it("keeps local data and reports the error when sign out fails", async () => {
      signInAs();
      useAuthStore.setState({ signOut: vi.fn().mockResolvedValue(false) });

      renderScreen();
      fireEvent.click(
        screen.getByRole("button", { name: "Stop syncing and delete local data" })
      );
      await act(async () => {
        fireEvent.click(
          screen.getByRole("button", { name: "Delete local data and sign out" })
        );
      });

      expect(vi.mocked(clearLocalPreferences)).not.toHaveBeenCalled();
      expect(
        screen.getByText(
          "We couldn't sign you out, so your local data was left unchanged."
        )
      ).toBeInTheDocument();
    });
  });

  describe("appearance, data, and accessibility controls", () => {
    it("reflects the stored theme and updates it on change", () => {
      useSettingsStore.setState({ theme: "light" });

      renderScreen();
      const select = screen.getByLabelText("Select theme");
      expect(select).toHaveValue("light");

      fireEvent.change(select, { target: { value: "dark" } });

      expect(useSettingsStore.getState().theme).toBe("dark");
    });

    it("toggles unassigned trips through the store", () => {
      renderScreen();
      const checkbox = screen.getByLabelText("Toggle showing unassigned trips");
      expect(checkbox).not.toBeChecked();

      fireEvent.click(checkbox);

      expect(useSettingsStore.getState().showUnassignedTrips).toBe(true);
    });

    it("updates the refresh interval through the store", () => {
      renderScreen();
      const select = screen.getByLabelText("Set refresh interval");
      expect(select).toHaveValue("30");

      fireEvent.change(select, { target: { value: "60" } });

      expect(useSettingsStore.getState().refreshInterval).toBe(60);
    });

    it("toggles accessible mode and swaps the switch label", () => {
      renderScreen();
      const toggle = screen.getByRole("switch", { name: "Enable accessible mode" });
      expect(toggle).toHaveAttribute("aria-checked", "false");

      fireEvent.click(toggle);

      expect(useSettingsStore.getState().accessibleMode).toBe(true);
      expect(
        screen.getByRole("switch", { name: "Disable accessible mode" })
      ).toHaveAttribute("aria-checked", "true");
    });

    it("always renders the About section", () => {
      renderScreen();

      expect(screen.getByText("About")).toBeInTheDocument();
      expect(screen.getByText("MTA My Way v0.0.1")).toBeInTheDocument();
    });
  });

  describe("push notifications section", () => {
    it("explains the iOS 16.4 requirement on old iOS", () => {
      vi.mocked(usePushNotifications).mockReturnValue(
        makePushState({ isOldIOS: true })
      );

      renderScreen();

      expect(
        screen.getByText(
          "Push notifications require iOS 16.4 or later with the app added to your Home Screen."
        )
      ).toBeInTheDocument();
    });

    it("reports unsupported browsers", () => {
      vi.mocked(usePushNotifications).mockReturnValue(
        makePushState({ isSupported: false })
      );

      renderScreen();

      expect(
        screen.getByText("Push notifications are not supported in this browser.")
      ).toBeInTheDocument();
    });

    it("reports blocked permissions", () => {
      vi.mocked(usePushNotifications).mockReturnValue(
        makePushState({ permission: "denied" })
      );

      renderScreen();

      expect(
        screen.getByText(
          "Notifications are blocked. Enable them in your browser or OS settings."
        )
      ).toBeInTheDocument();
    });

    it("renders the off toggle and hides quiet hours when not subscribed", () => {
      renderScreen();

      const toggle = screen.getByRole("switch", { name: "Enable push notifications" });
      expect(toggle).toHaveAttribute("aria-checked", "false");
      expect(
        screen.getByText("Get notified about service alerts on your favorite lines")
      ).toBeInTheDocument();
      expect(screen.queryByText("Quiet hours")).not.toBeInTheDocument();
    });

    it("renders the on toggle and quiet hours section when subscribed", () => {
      vi.mocked(usePushNotifications).mockReturnValue(
        makePushState({ isSubscribed: true })
      );

      renderScreen();

      const toggle = screen.getByRole("switch", { name: "Disable push notifications" });
      expect(toggle).toHaveAttribute("aria-checked", "true");
      expect(
        screen.getByText("Alert notifications are active for your favorite lines")
      ).toBeInTheDocument();
      expect(screen.getByText("Quiet hours")).toBeInTheDocument();
    });

    it("subscribes when the toggle is switched on", () => {
      const subscribe = vi.fn();
      vi.mocked(usePushNotifications).mockReturnValue(makePushState({ subscribe }));

      renderScreen();
      fireEvent.click(screen.getByRole("switch", { name: "Enable push notifications" }));

      expect(subscribe).toHaveBeenCalledTimes(1);
    });

    it("unsubscribes when the toggle is switched off", () => {
      const unsubscribe = vi.fn();
      vi.mocked(usePushNotifications).mockReturnValue(
        makePushState({ isSubscribed: true, unsubscribe })
      );

      renderScreen();
      fireEvent.click(screen.getByRole("switch", { name: "Disable push notifications" }));

      expect(unsubscribe).toHaveBeenCalledTimes(1);
    });

    it("disables the push toggle while loading", () => {
      vi.mocked(usePushNotifications).mockReturnValue(makePushState({ isLoading: true }));

      renderScreen();

      expect(
        screen.getByRole("switch", { name: "Enable push notifications" })
      ).toBeDisabled();
    });

    it("surfaces push errors as an alert", () => {
      vi.mocked(usePushNotifications).mockReturnValue(
        makePushState({ error: "Push registration failed" })
      );

      renderScreen();

      expect(screen.getByText("Push registration failed")).toBeInTheDocument();
    });
  });

  describe("quiet hours (subscribed)", () => {
    it("enables quiet hours and updates the window through the store", () => {
      vi.mocked(usePushNotifications).mockReturnValue(
        makePushState({ isSubscribed: true })
      );

      renderScreen();

      const enable = screen.getByRole("switch", { name: "Enable quiet hours" });
      expect(enable).toHaveAttribute("aria-checked", "false");
      expect(screen.queryByLabelText("Quiet hours start time")).not.toBeInTheDocument();

      fireEvent.click(enable);

      expect(useSettingsStore.getState().quietHours.enabled).toBe(true);
      expect(
        screen.getByRole("switch", { name: "Disable quiet hours" })
      ).toHaveAttribute("aria-checked", "true");

      const start = screen.getByLabelText("Quiet hours start time");
      const end = screen.getByLabelText("Quiet hours end time");
      expect(start).toHaveValue("22");
      expect(end).toHaveValue("7");

      fireEvent.change(start, { target: { value: "6" } });
      fireEvent.change(end, { target: { value: "23" } });

      const quietHours = useSettingsStore.getState().quietHours;
      expect(quietHours.startHour).toBe(6);
      expect(quietHours.endHour).toBe(23);
    });
  });
});
