/**
 * Tests for the HomeScreen onboarding -> dashboard transition.
 *
 * Regression coverage for the rules-of-hooks violation where HomeScreen
 * returned early for onboarding and only then called its hooks. Crossing
 * that boundary mid-mount made React throw "Rendered more hooks than during
 * the previous render", crashing the home screen on the exact transition
 * every first-run user takes.
 *
 * These tests drive the real favorites store (completeOnboarding()) so the
 * re-render is caused by an actual store update, exactly as it is in
 * production, rather than by a forced rerender.
 */

import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFavoritesStore } from "../stores/favoritesStore";
import HomeScreen from "./HomeScreen";

const MockOnboardingFlow = () => <div data-testid="onboarding-flow">Onboarding Flow</div>;

// HomeScreen lazy-loads OnboardingFlow. React.lazy reads `.default` off the
// resolved module, so the mock must export the component itself — a factory
// returning a promise of a module leaves the Suspense fallback up forever.
vi.mock("../components/onboarding/OnboardingFlow", () => ({
  __esModule: true,
  default: MockOnboardingFlow,
}));

// useGeofence needs a station index, geolocation permission and an online
// signal. Both useContextAware() and usePrefetch() consume it, so a single
// stub keeps the test hermetic without touching the stores under test.
vi.mock("../hooks/useGeofence", () => ({
  useGeofence: () => ({ isWatching: false, lastEvent: null, gpsFailureCount: 0 }),
}));

const renderHome = () => render(<MemoryRouter>{<HomeScreen />}</MemoryRouter>);

/** Reset the real store to a fresh first-run user. */
const resetStore = () => {
  useFavoritesStore.setState({
    favorites: [],
    commutes: [],
    tapHistory: [],
    onboardingComplete: false,
  });
};

describe("HomeScreen onboarding transition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  afterEach(() => {
    resetStore();
  });

  it("mounts the dashboard when onboarding completes after mount", async () => {
    renderHome();

    // First-run user sees the onboarding flow.
    await waitFor(() => {
      expect(screen.getByTestId("onboarding-flow")).toBeInTheDocument();
    });
    expect(screen.queryByText("Your Stations")).not.toBeInTheDocument();

    // Completing onboarding flips the store and re-renders in place.
    act(() => {
      useFavoritesStore.getState().completeOnboarding();
    });

    expect(screen.getByText("Your Stations")).toBeInTheDocument();
    expect(screen.queryByTestId("onboarding-flow")).not.toBeInTheDocument();
  });

  it("keeps the store flag set across the transition", () => {
    renderHome();

    act(() => {
      useFavoritesStore.getState().completeOnboarding();
    });

    expect(useFavoritesStore.getState().onboardingComplete).toBe(true);
    expect(screen.getByText("Your Stations")).toBeInTheDocument();
  });
});
