/**
 * Tests for OnboardingFlow — the first-run setup flow.
 *
 * Phase 1 verdict coverage gap (mtamyway-90fed08c / mtamyway-fef94e93,
 * VERDICT 2026-09-03): step advance, the branch paths, skip, and the
 * completion callback that flips the favorites store's onboardingComplete.
 *
 * There is no Back control anywhere in the flow — steps only move forward
 * and branch (deny location -> search fallback, outside NYC -> search
 * fallback, clear a chosen destination). Those branches are what the
 * "step branches" group covers.
 *
 * The GPS variant of step 3 (nearby stations) used to be untestable:
 * `nearbyStations` was recomputed as a fresh array on every render while the
 * pre-select effect listed it as a dependency and set state from it, so
 * entering "nearby" re-rendered unbounded (measured: 875+ effect passes in
 * 250 ms, worker OOM at 4 GB). Memoizing the list settled the effect deps and
 * the "nearby stations step" group below covers that path — including a
 * render count that pins the loop shut. The step's real nearby math runs here
 * (findNearbyStations is not mocked), so the fixtures are geographically
 * honest: everything inside the 2 km radius is placed within it.
 *
 * The favorites store is the REAL one (only the other stores are kept out of
 * the module graph) so the completion assertions observe the actual
 * onboardingComplete flip and the real records, not a mock's bookkeeping.
 * The flow creates REAL favorites — that contract is asserted here rather
 * than stubbed away.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Profiler } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Station, StationComplex } from "../../lib/api";
import { useFavoritesStore } from "../../stores/favoritesStore";
import OnboardingFlow from "./OnboardingFlow";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mutable hook state. OnboardingFlow reacts to location/push/station-index
// changes through effects, so a test mutates these and rerenders — the same
// shape as the browser resolving a permission or the index arriving.
const { geoState, pushState, stationIndexState, mockRequestLocation, mockSubscribe } = vi.hoisted(
  () => ({
    geoState: {
      coordinates: null as { lat: number; lon: number } | null,
      permission: "prompt",
      loading: false,
      error: null as string | null,
    },
    pushState: {
      isSupported: true,
      permission: "default" as NotificationPermission,
    },
    stationIndexState: {
      stations: [] as Station[],
      complexes: [] as StationComplex[],
      loading: true,
    },
    mockRequestLocation: vi.fn(),
    mockSubscribe: vi.fn(),
  })
);

vi.mock("../../hooks/useGeolocation", () => ({
  useGeolocation: () => ({
    ...geoState,
    requestLocation: mockRequestLocation,
    clearError: vi.fn(),
  }),
}));

vi.mock("../../hooks/usePushNotifications", () => ({
  usePushNotifications: () => ({
    isSupported: pushState.isSupported,
    permission: pushState.permission,
    subscribe: mockSubscribe,
  }),
}));

vi.mock("../../hooks/useStationIndex", () => ({
  useStationIndex: () => stationIndexState,
}));

// StationSearch debounces its onChange by 200ms. Replacing it with a plain
// controlled input keeps the search-fallback and commute steps drivable
// without fake timers; the debouncing itself is StationSearch's own concern.
vi.mock("../search/StationSearch", () => ({
  StationSearch: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (value: string) => void;
    autoFocus?: boolean;
  }) => (
    <input aria-label="Search stations" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

// The component pulls the favorites store from the barrel; re-exporting the
// real store here keeps the other stores (and their module graphs) out of
// this test without stubbing the behavior under test.
vi.mock("../../stores", async () => {
  const { useFavoritesStore: realStore } = await import("../../stores/favoritesStore");
  return { useFavoritesStore: realStore };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Albany — resolved GPS position outside the NYC area. */
const NON_NYC_COORDS = { lat: 42.65, lon: -73.75 };

/** Times Sq — resolved GPS position on top of station 127, inside NYC. */
const NYC_COORDS = { lat: 40.758, lon: -73.9855 };

const makeStation = (overrides: Partial<Station> = {}): Station => ({
  id: "127",
  name: "Times Sq - 42 St",
  lines: ["1", "2", "3", "7"],
  borough: "manhattan",
  lat: 40.758,
  lon: -73.9855,
  northStopId: "127N",
  southStopId: "127S",
  transfers: [],
  ada: false,
  ...overrides,
});

const TEST_STATIONS: Station[] = [
  makeStation(),
  makeStation({
    id: "128",
    name: "34 St - Herald Sq",
    lines: ["B", "D", "F", "M", "N", "Q", "R"],
    lat: 40.7484,
    lon: -73.9876,
    ada: true,
  }),
  makeStation({
    id: "130",
    name: "Grand Central",
    lines: ["4", "5", "6", "7"],
    lat: 40.7527,
    lon: -73.9772,
    ada: true,
  }),
];

/** ~17 km north of NYC_COORDS — past the 2 km nearby radius. */
const FAR_STATION = makeStation({
  id: "310",
  name: "Woodlawn",
  lines: ["4"],
  borough: "bronx",
  lat: 40.886,
  lon: -73.879,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** The real action, captured before any test can swap a spy over it. */
const realCompleteOnboarding = useFavoritesStore.getState().completeOnboarding;

const resetStore = () => {
  useFavoritesStore.setState({
    favorites: [],
    commutes: [],
    tapHistory: [],
    onboardingComplete: false,
    completeOnboarding: realCompleteOnboarding,
  });
};

const renderFlow = () => render(<OnboardingFlow />);

/** Rerender with the current hook state, the way a browser update would. */
const syncHooks = (rerender: (ui: React.ReactElement) => void) => {
  rerender(<OnboardingFlow />);
};

/** welcome -> location -> location resolves outside the NYC area -> search. */
const advanceToSearchFallback = async (rerender: (ui: React.ReactElement) => void) => {
  await userEvent.click(screen.getByRole("button", { name: "Get Started" }));
  geoState.coordinates = NON_NYC_COORDS;
  syncHooks(rerender);
  await screen.findByRole("heading", { name: "Add Your First Station" });
};

/** welcome -> location -> GPS resolves inside the NYC area -> nearby. */
const advanceToNearby = async (rerender: (ui: React.ReactElement) => void) => {
  await userEvent.click(screen.getByRole("button", { name: "Get Started" }));
  geoState.permission = "granted";
  geoState.coordinates = NYC_COORDS;
  syncHooks(rerender);
  await screen.findByRole("heading", { name: "Nearby Stations" });
};

/** search fallback -> commute, by picking the first station as a favorite. */
const advanceToCommute = async (rerender: (ui: React.ReactElement) => void) => {
  await advanceToSearchFallback(rerender);
  await userEvent.type(screen.getByLabelText("Search stations"), "herald");
  await userEvent.click(await screen.findByRole("button", { name: /34 St - Herald Sq/ }));
  await screen.findByRole("heading", { name: "Where do you commute to?" });
};

/** commute -> notifications. */
const advanceToNotifications = async (rerender: (ui: React.ReactElement) => void) => {
  await advanceToCommute(rerender);
  await userEvent.click(screen.getByRole("button", { name: "Skip for now" }));
  await screen.findByRole("heading", { name: "Stay Informed" });
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("OnboardingFlow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    resetStore();
    geoState.coordinates = null;
    geoState.permission = "prompt";
    geoState.loading = false;
    geoState.error = null;
    pushState.isSupported = true;
    pushState.permission = "default";
    stationIndexState.stations = TEST_STATIONS;
    stationIndexState.complexes = [];
    stationIndexState.loading = false;
  });

  describe("step advance", () => {
    it("starts on the welcome step", () => {
      renderFlow();

      expect(screen.getByRole("heading", { name: "Welcome to MTA My Way" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Get Started" })).toBeInTheDocument();
      expect(useFavoritesStore.getState().onboardingComplete).toBe(false);
    });

    it("announces step transitions to screen readers", async () => {
      const { container, rerender } = renderFlow();

      // The step label is announced through the assertive live region.
      const announcement = () =>
        container.querySelector('[aria-live="assertive"]')?.textContent ?? "";
      expect(announcement()).toBe("Welcome to MTA My Way");

      await userEvent.click(screen.getByRole("button", { name: "Get Started" }));
      expect(announcement()).toBe("Step 2 of 5: Find nearby stations");

      geoState.coordinates = NON_NYC_COORDS;
      syncHooks(rerender);
      await screen.findByRole("heading", { name: "Add Your First Station" });
      expect(announcement()).toBe("Step 2 of 5: Search for a station");
    });

    it("advances from welcome to the location step", async () => {
      renderFlow();

      await userEvent.click(screen.getByRole("button", { name: "Get Started" }));

      expect(screen.getByRole("heading", { name: "Find nearby stations" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Allow Location Access" })).toBeInTheDocument();
    });

    it("requests the browser location when allowed", async () => {
      renderFlow();

      await userEvent.click(screen.getByRole("button", { name: "Get Started" }));
      await userEvent.click(screen.getByRole("button", { name: "Allow Location Access" }));

      expect(mockRequestLocation).toHaveBeenCalledTimes(1);
    });

    it("falls back to search when the resolved location is outside the NYC area", async () => {
      const { rerender } = renderFlow();

      await advanceToSearchFallback(rerender);

      expect(screen.getByRole("heading", { name: "Add Your First Station" })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Nearby Stations" })).not.toBeInTheDocument();
    });

    it("falls back to search when location permission was denied", async () => {
      geoState.permission = "denied";
      renderFlow();

      await userEvent.click(screen.getByRole("button", { name: "Get Started" }));
      expect(screen.getByRole("button", { name: "Search for stations" })).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Search for stations" }));

      expect(screen.getByRole("heading", { name: "Add Your First Station" })).toBeInTheDocument();
      expect(screen.getByLabelText("Search stations")).toBeInTheDocument();
    });

    it("creates a REAL favorite from the search fallback and advances to the commute step", async () => {
      const { rerender } = renderFlow();

      await advanceToCommute(rerender);

      const { favorites } = useFavoritesStore.getState();
      expect(favorites).toHaveLength(1);
      expect(favorites[0]).toMatchObject({
        stationId: "128",
        stationName: "34 St - Herald Sq",
        direction: "both",
      });
      // No nearby step ran, so the origin falls back to the placeholder, and
      // the station picked in the fallback arrives as the pre-set destination.
      expect(screen.getByText("your station")).toBeInTheDocument();
      expect(screen.getByText("34 St - Herald Sq")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Add Commute" })).toBeEnabled();
    });

    it("clears the pre-set destination so another can be picked", async () => {
      const { rerender } = renderFlow();
      await advanceToCommute(rerender);

      await userEvent.click(screen.getByRole("button", { name: "Clear destination" }));

      expect(screen.getByLabelText("Search stations")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Add Commute" })).toBeDisabled();

      await userEvent.type(screen.getByLabelText("Search stations"), "grand");
      await userEvent.click(await screen.findByRole("button", { name: /Grand Central/ }));

      expect(screen.getByText("Grand Central")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Add Commute" })).toBeEnabled();
    });

    // Current behavior, kept honest in a test: on the search-fallback path no
    // commute can ever be saved, because handleAddCommute guards on
    // selectedStations.length > 0 and that state is only populated by the
    // nearby step — "Add Commute" just advances, dropping the destination.
    it("advances past a chosen destination without saving a commute on the search-fallback path", async () => {
      const { rerender } = renderFlow();
      await advanceToCommute(rerender);

      await userEvent.click(screen.getByRole("button", { name: "Add Commute" }));

      await screen.findByRole("heading", { name: "Stay Informed" });
      expect(useFavoritesStore.getState().commutes).toHaveLength(0);
      expect(useFavoritesStore.getState().favorites).toHaveLength(1);
    });

    it("skips commute setup and moves on without completing onboarding", async () => {
      const { rerender } = renderFlow();
      await advanceToCommute(rerender);

      await userEvent.click(screen.getByRole("button", { name: "Skip for now" }));

      await screen.findByRole("heading", { name: "Stay Informed" });
      expect(useFavoritesStore.getState().commutes).toHaveLength(0);
      expect(useFavoritesStore.getState().onboardingComplete).toBe(false);
    });
  });

  // The GPS path into step 3. Everything here depends on the nearby list being
  // stable across renders — that is what used to re-render the flow unbounded.
  describe("nearby stations step", () => {
    /** Selected station cards carry the highlighted treatment. */
    const isSelected = (name: string | RegExp) =>
      screen.getByRole("button", { name }).classList.contains("bg-mta-primary");

    it("auto-advances from the location step to nearby stations inside NYC", async () => {
      const { rerender } = renderFlow();

      await userEvent.click(screen.getByRole("button", { name: "Get Started" }));
      expect(screen.getByRole("heading", { name: "Find nearby stations" })).toBeInTheDocument();

      geoState.coordinates = NYC_COORDS;
      syncHooks(rerender);

      await screen.findByRole("heading", { name: "Nearby Stations" });
      expect(
        screen.queryByRole("heading", { name: "Find nearby stations" })
      ).not.toBeInTheDocument();
      // All three fixtures sit inside the 2 km radius from Times Sq.
      expect(screen.getByText(/We found 3 stations near you\./)).toBeInTheDocument();
    });

    it("does not re-render in a loop while the nearby step is mounted", async () => {
      let renders = 0;
      const { rerender } = render(
        <Profiler id="onboarding-flow" onRender={() => void (renders += 1)}>
          <OnboardingFlow />
        </Profiler>
      );

      await userEvent.click(screen.getByRole("button", { name: "Get Started" }));
      geoState.coordinates = NYC_COORDS;
      rerender(
        <Profiler id="onboarding-flow" onRender={() => void (renders += 1)}>
          <OnboardingFlow />
        </Profiler>
      );
      await screen.findByRole("heading", { name: "Nearby Stations" });

      // Let every effect triggered by entering the step flush before counting.
      await waitFor(() => expect(renders).toBeGreaterThan(0));
      const settled = renders;
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Pre-fix this climbed past 875 renders in 250 ms and OOM'd the worker
      // (reproduced here at a 512 MB heap); the fixed flow commits 7 renders.
      // Settling flat and low is the regression signal.
      expect(renders).toBe(settled);
      expect(renders).toBeLessThan(40);
    });

    it("pre-selects every nearby station", async () => {
      const { rerender } = renderFlow();
      await advanceToNearby(rerender);

      expect(isSelected(/Times Sq - 42 St/)).toBe(true);
      expect(isSelected(/Grand Central/)).toBe(true);
      expect(isSelected(/34 St - Herald Sq/)).toBe(true);
      expect(screen.getByRole("button", { name: /Continue \(3 selected\)/ })).toBeEnabled();
    });

    it("drops stations outside the 2 km radius", async () => {
      // Two in range plus one out: with only three fixtures the 3-station cap
      // can't be what limits the count, so the radius is the cut.
      stationIndexState.stations = [...TEST_STATIONS.filter((s) => s.id !== "130"), FAR_STATION];
      const { rerender } = renderFlow();
      await advanceToNearby(rerender);

      expect(screen.getByText(/We found 2 stations near you\./)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Woodlawn/ })).not.toBeInTheDocument();
    });

    it("keeps a toggled-off station deselected across re-renders", async () => {
      const { rerender } = renderFlow();
      await advanceToNearby(rerender);

      await userEvent.click(screen.getByRole("button", { name: /34 St - Herald Sq/ }));

      expect(isSelected(/34 St - Herald Sq/)).toBe(false);
      expect(isSelected(/Times Sq - 42 St/)).toBe(true);
      expect(screen.getByRole("button", { name: /Continue \(2 selected\)/ })).toBeInTheDocument();

      // A pre-select effect that re-fires on an unstable nearby list would
      // silently re-select everything here.
      syncHooks(rerender);
      expect(isSelected(/34 St - Herald Sq/)).toBe(false);
      expect(screen.getByRole("button", { name: /Continue \(2 selected\)/ })).toBeInTheDocument();
    });

    it("creates a REAL favorite per selected station on continue", async () => {
      const { rerender } = renderFlow();
      await advanceToNearby(rerender);

      await userEvent.click(screen.getByRole("button", { name: /Continue \(3 selected\)/ }));

      await screen.findByRole("heading", { name: "Where do you commute to?" });
      const { favorites } = useFavoritesStore.getState();
      expect(favorites.map((f) => f.stationId)).toEqual(["127", "130", "128"]);
      expect(favorites.every((f) => f.direction === "both")).toBe(true);
      // The closest station is the pre-set commute origin.
      expect(screen.getByText("Times Sq - 42 St")).toBeInTheDocument();
    });

    it("completes onboarding without favorites when skipped from nearby", async () => {
      const { rerender } = renderFlow();
      await advanceToNearby(rerender);

      await userEvent.click(screen.getByRole("button", { name: "Skip for now" }));

      expect(useFavoritesStore.getState().onboardingComplete).toBe(true);
      expect(useFavoritesStore.getState().favorites).toHaveLength(0);
    });
  });

  describe("skip", () => {
    it("completes onboarding when the tour is skipped from welcome", async () => {
      renderFlow();

      expect(useFavoritesStore.getState().onboardingComplete).toBe(false);
      await userEvent.click(screen.getByRole("button", { name: "Skip tour" }));

      expect(useFavoritesStore.getState().onboardingComplete).toBe(true);
    });

    it("completes onboarding when skipped from the location step", async () => {
      renderFlow();

      await userEvent.click(screen.getByRole("button", { name: "Get Started" }));
      await userEvent.click(screen.getByRole("button", { name: "Skip for now" }));

      expect(useFavoritesStore.getState().onboardingComplete).toBe(true);
      expect(useFavoritesStore.getState().favorites).toHaveLength(0);
    });

    it("completes onboarding when skipped from the search fallback", async () => {
      const { rerender } = renderFlow();

      await advanceToSearchFallback(rerender);
      await userEvent.click(screen.getByRole("button", { name: "Skip for now" }));

      expect(useFavoritesStore.getState().onboardingComplete).toBe(true);
      expect(useFavoritesStore.getState().favorites).toHaveLength(0);
    });
  });

  describe("completion callback", () => {
    it("subscribes to push, then flips onboardingComplete on enable", async () => {
      // Spy over the real action so the ordering and the flag flip are both
      // observable without giving up the actual store update.
      const completeOnboarding = vi.fn(useFavoritesStore.getState().completeOnboarding);
      useFavoritesStore.setState({ completeOnboarding });
      const { rerender } = renderFlow();

      await advanceToNotifications(rerender);
      await userEvent.click(screen.getByRole("button", { name: "Enable Notifications" }));

      await waitFor(() => {
        expect(useFavoritesStore.getState().onboardingComplete).toBe(true);
      });
      expect(mockSubscribe).toHaveBeenCalledTimes(1);
      expect(completeOnboarding).toHaveBeenCalledTimes(1);
      // Subscribe is awaited before the flow completes.
      expect(mockSubscribe.mock.invocationCallOrder[0]).toBeLessThan(
        completeOnboarding.mock.invocationCallOrder[0]!
      );
    });

    it("flips onboardingComplete when notifications are skipped", async () => {
      const { rerender } = renderFlow();

      await advanceToNotifications(rerender);
      expect(mockSubscribe).not.toHaveBeenCalled();

      await userEvent.click(screen.getByRole("button", { name: "Skip for now" }));

      expect(useFavoritesStore.getState().onboardingComplete).toBe(true);
      expect(mockSubscribe).not.toHaveBeenCalled();
    });

    it("still completes onboarding when push is unsupported", async () => {
      pushState.isSupported = false;
      const { rerender } = renderFlow();

      await advanceToNotifications(rerender);
      // Unsupported browsers swap the skip button for a Continue affordance.
      await userEvent.click(screen.getByRole("button", { name: "Continue" }));

      expect(useFavoritesStore.getState().onboardingComplete).toBe(true);
      expect(mockSubscribe).not.toHaveBeenCalled();
    });

    it("never completes onboarding partway through the flow", async () => {
      const { rerender } = renderFlow();
      await advanceToSearchFallback(rerender);

      expect(useFavoritesStore.getState().onboardingComplete).toBe(false);

      await userEvent.type(screen.getByLabelText("Search stations"), "herald");
      await userEvent.click(await screen.findByRole("button", { name: /34 St - Herald Sq/ }));
      expect(useFavoritesStore.getState().onboardingComplete).toBe(false);
    });
  });
});
