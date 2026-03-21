/**
 * OMNY fare tracking types (Phase 6)
 * Entirely client-side, auto-logged from trip tracking
 */

/**
 * A single ride log entry
 */
export interface RideLogEntry {
  /** ISO date string */
  date: string;
  /** POSIX timestamp of tap/entry */
  time: number;
  /** Station where the ride began */
  stationId: string;
  /** How this ride was detected */
  source: "tracked" | "inferred";
}

/**
 * Fare tracking state for OMNY cap calculation
 */
export interface FareTracking {
  /** Rides taken this week (Monday-Sunday) */
  weeklyRides: number;
  /** ISO date of the current week's Monday */
  weekStartDate: string;
  /** Rides taken this month */
  monthlyRides: number;
  /** ISO date of the current month's 1st */
  monthStartDate: string;
  /** Log of rides (last 90 days) */
  rideLog: RideLogEntry[];
  /** Current fare per ride in dollars (default: $2.90, user-configurable) */
  currentFare: number;
  /** Price of 30-day unlimited pass for comparison (default: $132) */
  unlimitedPassPrice: number;
}

/**
 * Fare cap status for display
 */
export interface FareCapStatus {
  /** Rides taken this week toward the cap */
  ridesThisWeek: number;
  /** Rides needed to reach the cap (12 rides = free) */
  ridesUntilFree: number;
  /** Whether the user has reached the cap this week */
  capReached: boolean;
  /** Amount spent this week */
  weeklySpend: number;
  /** Amount that would have been spent with unlimited pass */
  breakEvenSpend: number;
  /** Whether unlimited pass would have been cheaper this month */
  unlimitedWouldBeCheaper: boolean;
  /** Monthly spend so far */
  monthlySpend: number;
  /** Savings or loss vs unlimited pass this month */
  savingsVsUnlimited: number;
}

/**
 * Annual fare summary for "Your Subway Year" (Phase 6)
 */
export interface AnnualFareSummary {
  /** Total rides in the year */
  totalRides: number;
  /** Total spent on fares */
  totalSpend: number;
  /** Rides after reaching fare cap (free rides) */
  freeRides: number;
  /** Value of free rides */
  freeRideValue: number;
  /** Comparison vs 12 monthly unlimited passes */
  vsUnlimitedPass: number;
}
