import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Keep this test at the routing boundary: each destination identifies itself,
// while the screen's own tests exercise its data and controls.
vi.mock("./components/common", () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
  ScreenErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
  OfflineBanner: () => null,
  LiveRegion: () => null,
  SyncErrorToast: () => null,
  useRouteChangeAnnouncer: () => undefined,
}));
vi.mock("./components/common/ServiceWorkerUpdatePrompt", () => ({
  ServiceWorkerUpdatePrompt: () => null,
  PWAInstallPrompt: () => null,
}));
vi.mock("./hooks/useJournalSync", () => ({ useJournalSync: () => undefined }));
vi.mock("./hooks/usePreferencesSync", () => ({ usePreferencesSync: () => undefined }));
vi.mock("./lib/periodicSync", () => ({ usePeriodicSync: () => undefined }));

vi.mock("./screens/HomeScreen", () => ({ default: () => <div>Home destination</div> }));
vi.mock("./screens/SearchScreen", () => ({ default: () => <div>Search destination</div> }));
vi.mock("./screens/CommuteScreen", () => ({ default: () => <div>Commute destination</div> }));
vi.mock("./screens/AlertsScreen", () => ({ default: () => <div>Alerts destination</div> }));
vi.mock("./screens/StationScreen", () => ({ default: () => <div>Station destination</div> }));
vi.mock("./screens/TripScreen", () => ({ default: () => <div>Trip destination</div> }));
vi.mock("./screens/MapScreen", () => ({ default: () => <div>Map destination</div> }));
vi.mock("./screens/SettingsScreen", () => ({ default: () => <div>Settings destination</div> }));
vi.mock("./screens/HealthScreen", () => ({ default: () => <div>Health destination</div> }));
vi.mock("./screens/LineDiagramScreen", () => ({
  default: () => <div>Line Diagram destination</div>,
}));
vi.mock("./screens/JournalScreen", () => ({ default: () => <div>Journal destination</div> }));
vi.mock("./screens/StatsScreen", () => ({ default: () => <div>Stats destination</div> }));
vi.mock("./screens/PasswordResetRequestScreen", () => ({
  default: () => <div>Password Reset destination</div>,
}));
vi.mock("./screens/PasswordResetConfirmScreen", () => ({
  default: () => <div>Password Reset Confirm destination</div>,
}));

import App from "./App";

describe("App routes", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
  });

  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it.each([
    ["/", "Home"],
    ["/search", "Search"],
    ["/commute", "Commute"],
    ["/commute/work", "Commute"],
    ["/alerts", "Alerts"],
    ["/map", "Map"],
    ["/health", "Health"],
    ["/station/101", "Station"],
    ["/line/A", "Line Diagram"],
    ["/trip/123", "Trip"],
    ["/journal", "Journal"],
    ["/stats", "Stats"],
    ["/settings", "Settings"],
    ["/reset-password", "Password Reset"],
    ["/reset-password/confirm", "Password Reset Confirm"],
  ])("renders %s through its screen boundary", async (path, screenName) => {
    window.history.replaceState(null, "", path);
    render(<App />);

    expect(await screen.findByText(`${screenName} destination`)).toBeInTheDocument();
  });

  it("returns unknown routes to the home screen", async () => {
    window.history.replaceState(null, "", "/unknown");
    render(<App />);

    expect(await screen.findByText("Home destination")).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe("/"));
  });
});
