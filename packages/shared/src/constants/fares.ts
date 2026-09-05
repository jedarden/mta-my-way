/**
 * MTA published fare configuration.
 *
 * Single source of truth for every fare amount the app displays. The OMNY fare
 * cap estimator (packages/web fareStore / FareTracker) reads from here — fare
 * amounts must not be hardcoded in components or stores.
 *
 * Current values took effect 2026-01-04 (the fare change adopted by the MTA
 * Board in 2025). Sources:
 *   - OMNY fares: https://omny.info/fares
 *   - MTA fares:  https://new.mta.info/fares
 *
 * This is configuration, not a live feed: when the MTA changes fares, update
 * the constants here.
 */

/**
 * Base subway / local bus fare per ride, in dollars.
 *
 * The full-fare amount OMNY charges per tap ($2.90 until 2026-01-04).
 */
export const MTA_BASE_FARE = 3.0;

/**
 * Base fare before the 2026-01-04 change.
 *
 * Exported so the fare store can tell "the rider never touched the fare"
 * (stored value equals the previous published default) from a deliberate
 * user override when rolling out the new default to persisted state.
 */
export const MTA_BASE_FARE_PREVIOUS = 2.9;

/**
 * OMNY weekly fare cap for full-fare customers, in dollars. Once this much has
 * been paid in a 7-day period, the rest of that period's rides are free.
 * Reduced-Fare customers are capped at half this amount (not modeled here).
 */
export const OMNY_WEEKLY_FARE_CAP = 35;

/**
 * Paid rides that reach the OMNY weekly cap — OMNY's published phrasing is
 * "pay for 12 rides in a 7-day period and any additional rides are free".
 *
 * Note OMNY actually caps on dollars paid (see OMNY_WEEKLY_FARE_CAP), so the
 * 12th ride is charged at the remaining balance rather than the full fare. The
 * estimator is ride-based, which is why its output is labelled an estimate.
 */
export const OMNY_WEEKLY_CAP_RIDES = 12;

/**
 * Price of the 30-day unlimited pass, in dollars, used for the
 * pay-per-ride vs. unlimited comparison. Unchanged by the 2026-01-04 change
 * and being phased out by the MTA in favor of the weekly fare cap.
 */
export const MTA_30DAY_UNLIMITED_PASS_PRICE = 132;
