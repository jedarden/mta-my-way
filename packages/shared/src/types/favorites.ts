/**
 * User preferences, favorites, and commute configuration
 * Persisted to localStorage and synced to backend for push notifications
 */

/** Direction preference for a favorite station */
export type DirectionPreference = "N" | "S" | "both";

/**
 * Reference to a station (used in commutes and trip records)
 */
export interface StationRef {
  /** Parent station ID */
  stationId: string;
  /** Station display name */
  stationName: string;
}

/**
 * A favorited station with configuration
 */
export interface Favorite {
  /** Unique identifier (UUID) */
  id: string;
  /** Parent station ID, e.g., "725" */
  stationId: string;
  /** Station display name, e.g., "Times Sq-42 St" */
  stationName: string;
  /** Subset of lines at this station to display, e.g., ["1", "2", "3"] */
  lines: string[];
  /** Direction filter: N, S, or both */
  direction: DirectionPreference;
  /** Display ordering (lower = higher in list) */
  sortOrder: number;
  /** Optional user label, e.g., "Morning commute" */
  label?: string;
  /** Whether this favorite is pinned to top (Phase 5 context-aware sorting) */
  pinned?: boolean;
}

/**
 * A saved commute route
 */
export interface Commute {
  /** Unique identifier (UUID) */
  id: string;
  /** Display name, e.g., "Work", "Home" */
  name: string;
  /** Origin station */
  origin: StationRef;
  /** Destination station */
  destination: StationRef;
  /** Lines the user prefers for this commute */
  preferredLines: string[];
  /** Whether to show transfer suggestions */
  enableTransferSuggestions: boolean;
}

/**
 * User settings
 */
export interface Settings {
  /** Theme preference */
  theme: "light" | "dark" | "system";
  /** Show unassigned/low-confidence trips (default: false) */
  showUnassignedTrips: boolean;
  /** Refresh interval in seconds (default: 30, min: 15) */
  refreshInterval: number;
  /** Alert severity filter */
  alertSeverityFilter: "all" | "delays" | "major";
  /** Vibrate on pull-to-refresh */
  hapticFeedback: boolean;
  /** Accessible mode: avoid stations with broken elevators (Phase 6) */
  accessibleMode: boolean;
  /** Quiet hours: no push notifications during this period */
  quietHours?: {
    enabled: boolean;
    startHour: number; // 0-23
    endHour: number; // 0-23
  };
}

/**
 * Complete user preferences stored in localStorage
 */
export interface UserPreferences {
  /** Saved favorite stations */
  favorites: Favorite[];
  /** Saved commute routes */
  commutes: Commute[];
  /** User settings */
  settings: Settings;
  /** Web Push subscription JSON (for backend) */
  pushSubscription: Record<string, unknown> | null;
  /** Schema version for migration */
  schemaVersion: number;
  /** Tap history for context-aware sorting (Phase 5) */
  tapHistory: FavoriteTapEvent[];
  /** Whether onboarding has been completed */
  onboardingComplete: boolean;
}

/**
 * A single tap event on a favorite (Phase 5: time-aware context switching)
 */
export interface FavoriteTapEvent {
  /** ID of the favorite that was tapped */
  favoriteId: string;
  /** Day of week (0 = Sunday, 6 = Saturday) */
  dayOfWeek: number;
  /** Hour of day (0-23) */
  hour: number;
}
