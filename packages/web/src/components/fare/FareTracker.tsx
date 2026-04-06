/**
 * FareTracker - OMNY fare cap progress indicator.
 *
 * Shows:
 *   - Weekly progress toward 12-ride cap ("X/12 rides — Y more until free")
 *   - Monthly comparison vs $132 unlimited pass
 *   - Nudge at 10-11 rides to take one more round trip for free rides
 *
 * Auto-populated from commute journal trips — no manual logging.
 */
import { useFareStore } from "../../stores";

/** OMNY fare cap: 12 rides per week = free */
const FARE_CAP_RIDES = 12;

export function FareTracker() {
  const weeklyRides = useFareStore((s) => s.tracking.weeklyRides);
  const monthlyRides = useFareStore((s) => s.tracking.monthlyRides);
  const currentFare = useFareStore((s) => s.tracking.currentFare);
  const unlimitedPassPrice = useFareStore((s) => s.tracking.unlimitedPassPrice);
  const getCapStatus = useFareStore((s) => s.getCapStatus);

  // Don't show tracker if user hasn't logged any rides yet
  if (weeklyRides === 0 && monthlyRides === 0) return null;

  const capStatus = getCapStatus();
  const progressPct = Math.min((capStatus.ridesThisWeek / FARE_CAP_RIDES) * 100, 100);
  const capReached = capStatus.capReached;

  // Nudge at 10-11 rides
  const showNudge = !capReached && capStatus.ridesThisWeek >= 10;

  // Monthly comparison
  const monthlyPayPerRide = monthlyRides * currentFare;
  const monthlyDiff = monthlyPayPerRide - unlimitedPassPrice;
  const unlimitedBetter = monthlyDiff > 0;

  return (
    <article className="bg-surface dark:bg-dark-surface rounded-lg overflow-hidden shadow-sm px-4 pt-4 pb-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-base text-text-primary dark:text-dark-text-primary">
          OMNY Fare Cap
        </h3>
        <span className="text-13 text-text-secondary dark:text-dark-text-secondary tabular-nums">
          ${currentFare.toFixed(2)}/ride
        </span>
      </div>

      {/* Progress bar */}
      <div className="mb-2">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-13 font-medium text-text-primary dark:text-dark-text-primary">
            {capReached ? (
              <>
                {capStatus.ridesThisWeek}/12 —{" "}
                <span className="text-green-600 dark:text-green-400">Free rides!</span>
              </>
            ) : (
              <>
                {capStatus.ridesThisWeek}/{FARE_CAP_RIDES} — {capStatus.ridesUntilFree} more until
                free
              </>
            )}
          </span>
          <span className="text-13 text-text-secondary dark:text-dark-text-secondary tabular-nums">
            ${capStatus.weeklySpend.toFixed(2)} this week
          </span>
        </div>
        <div
          className="h-2 rounded-full bg-background dark:bg-dark-background overflow-hidden"
          role="progressbar"
          aria-valuenow={capStatus.ridesThisWeek}
          aria-valuemin={0}
          aria-valuemax={FARE_CAP_RIDES}
          aria-label={`${capStatus.ridesThisWeek} of ${FARE_CAP_RIDES} rides toward fare cap`}
        >
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              capReached ? "bg-green-500" : progressPct >= 80 ? "bg-amber-400" : "bg-mta-primary"
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Nudge: take one more round trip for free rides */}
      {showNudge && (
        <div className="mt-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40">
          <p className="text-13 font-medium text-amber-800 dark:text-amber-300">
            Take {capStatus.ridesUntilFree === 1 ? "1 more ride" : "1 more round trip"} for free
            rides the rest of the week!
          </p>
        </div>
      )}

      {/* Monthly comparison */}
      {monthlyRides > 0 && (
        <div className="mt-3 pt-3 border-t border-background dark:border-dark-background">
          <div className="flex items-center justify-between">
            <span className="text-13 text-text-secondary dark:text-dark-text-secondary">
              This month ({monthlyRides} rides)
            </span>
            <span
              className={`text-13 font-semibold tabular-nums ${
                unlimitedBetter
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-green-600 dark:text-green-400"
              }`}
            >
              {unlimitedBetter
                ? `Unlimited saves $${Math.abs(capStatus.savingsVsUnlimited).toFixed(0)}`
                : `Pay-per-ride saves $${capStatus.savingsVsUnlimited.toFixed(0)}`}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm bg-mta-primary" aria-hidden="true" />
              <span className="text-11 text-text-secondary dark:text-dark-text-secondary">
                Pay-per-ride: ${monthlyPayPerRide.toFixed(0)}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm bg-amber-400" aria-hidden="true" />
              <span className="text-11 text-text-secondary dark:text-dark-text-secondary">
                Unlimited: ${unlimitedPassPrice}
              </span>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

export default FareTracker;
