/**
 * Typed fixtures for the shared domain objects and store states.
 *
 * Every builder returns a complete instance of the real exported type, so a
 * fixture that drifts from the product interface is a type error here instead
 * of a silently-passing test. Pass overrides to change only what a given test
 * cares about; everything else keeps a valid default.
 */

import type {
  Commute,
  Favorite,
  FavoriteTapEvent,
  InterpolatedTrainPosition,
  LineDiagramData,
  LineHealthStatus,
  StationAlert,
} from "@mta-my-way/shared";
import { vi } from "vitest";
import type { FeedHealthInfo } from "../lib/api";
import type { FavoritesState } from "../stores/favoritesStore";
import type { SettingsState } from "../stores/settingsStore";

/** A favorited station, complete with its display ordering. */
export const makeFavorite = (overrides: Partial<Favorite> = {}): Favorite => ({
  id: "fav-1",
  stationId: "725",
  stationName: "Times Sq-42 St",
  lines: ["1", "2", "3"],
  direction: "both",
  sortOrder: 0,
  ...overrides,
});

/** A saved commute route between two stations. */
export const makeCommute = (overrides: Partial<Commute> = {}): Commute => ({
  id: "commute-1",
  name: "Work",
  origin: { stationId: "725", stationName: "Times Sq-42 St" },
  destination: { stationId: "101", stationName: "South Ferry" },
  preferredLines: ["1"],
  enableTransferSuggestions: false,
  ...overrides,
});

/** A service alert scoped to a station. */
export const makeStationAlert = (overrides: Partial<StationAlert> = {}): StationAlert => ({
  id: "alert-1",
  severity: "warning",
  source: "official",
  headline: "Delays on 1 train",
  description: "Trains are running with delays in both directions.",
  affectedLines: ["1"],
  activePeriod: { start: Math.floor(Date.now() / 1000) - 3600 },
  cause: "Signal problems",
  effect: "DELAY",
  ...overrides,
});

/** Line-level health status, stamped with its last update time. */
export const makeLineHealth = (overrides: Partial<LineHealthStatus> = {}): LineHealthStatus => ({
  lineId: "1",
  status: "normal",
  updatedAt: Math.floor(Date.now() / 1000),
  ...overrides,
});

/** A recorded tap on a favorite, used for context-aware sorting. */
export const makeTapEvent = (overrides: Partial<FavoriteTapEvent> = {}): FavoriteTapEvent => ({
  favoriteId: "fav-1",
  dayOfWeek: 1,
  hour: 8,
  ...overrides,
});

/** A train position interpolated for display on a line diagram. */
export const makeTrainPosition = (
  overrides: Partial<InterpolatedTrainPosition> = {}
): InterpolatedTrainPosition => ({
  tripId: "trip-1",
  routeId: "1",
  direction: "N",
  lastStopId: "101",
  nextStopId: "102",
  progress: 0.5,
  destination: "South Ferry",
  isAssigned: true,
  isRerouted: false,
  isExpress: false,
  ...overrides,
});

/** A line diagram: ordered stops plus the trains currently on them. */
export const makeLineDiagram = (overrides: Partial<LineDiagramData> = {}): LineDiagramData => ({
  routeId: "1",
  routeColor: "#EE352E",
  stops: [
    { stopId: "101", stopName: "South Ferry", isTerminal: true, isTransferStation: false },
    { stopId: "102", stopName: "Rector St", isTerminal: false, isTransferStation: false },
  ],
  trains: [],
  computedAt: Math.floor(Date.now() / 1000),
  ...overrides,
});

/** A single feed's health entry from /api/health. */
export const makeFeedHealth = (overrides: Partial<FeedHealthInfo> = {}): FeedHealthInfo => ({
  id: "feed-1",
  name: "123 Line Feed",
  status: "ok",
  lastSuccessAt: "2025-01-01T11:59:50.000Z",
  lastPollAt: "2025-01-01T11:59:50.000Z",
  consecutiveFailures: 0,
  entityCount: 0,
  lastError: null,
  avgLatencyMs: 100,
  errorCount24h: 0,
  ...overrides,
});

/** Complete favorites-store state: data plus every action the real store declares. */
export const makeFavoritesState = (overrides: Partial<FavoritesState> = {}): FavoritesState => ({
  favorites: [],
  commutes: [],
  tapHistory: [],
  onboardingComplete: false,
  addFavorite: vi.fn(),
  updateFavorite: vi.fn(),
  removeFavorite: vi.fn(),
  reorderFavorites: vi.fn(),
  togglePin: vi.fn(),
  addCommute: vi.fn(),
  updateCommute: vi.fn(),
  removeCommute: vi.fn(),
  toggleCommutePin: vi.fn(),
  recordTap: vi.fn(),
  completeOnboarding: vi.fn(),
  replaceFromSync: vi.fn(),
  clearLocalData: vi.fn(),
  ...overrides,
});

/** Complete settings-store state, matching the store's DEFAULT_SETTINGS. */
export const makeSettingsState = (overrides: Partial<SettingsState> = {}): SettingsState => ({
  theme: "system",
  showUnassignedTrips: false,
  refreshInterval: 30,
  alertSeverityFilter: "delays",
  hapticFeedback: true,
  accessibleMode: false,
  quietHours: { enabled: false, startHour: 22, endHour: 7 },
  setTheme: vi.fn(),
  setShowUnassignedTrips: vi.fn(),
  setRefreshInterval: vi.fn(),
  setAlertSeverityFilter: vi.fn(),
  setHapticFeedback: vi.fn(),
  setAccessibleMode: vi.fn(),
  setQuietHours: vi.fn(),
  replaceFromSync: vi.fn(),
  clearLocalData: vi.fn(),
  ...overrides,
});
