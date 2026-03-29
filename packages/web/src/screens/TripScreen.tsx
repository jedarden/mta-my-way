/**
 * TripScreen - Full-screen trip progress view with ETA hero number.
 *
 * Shows:
 * - Line badge + destination as header
 * - ETA countdown as hero number
 * - Vertical timeline (TripTracker component)
 * - Anomaly detection banner when trip is longer than usual
 * - "Stop tracking" button (prominent)
 * - Share button to generate a shareable URL
 */

import { formatMinutesAway } from "@mta-my-way/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { LineBullet } from "../components/arrivals/LineBullet";
import { DataState } from "../components/common/DataState";
import { TripTracker } from "../components/trip/TripTracker";
import { useTripJournal } from "../hooks/useTripJournal";
import { useTripTracker } from "../hooks/useTripTracker";
import type { DataStatus } from "../hooks/useArrivals";

export default function TripScreen() {
  const { tripId } = useParams<{ tripId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // URL params for journaling
  const originStationId = searchParams.get("origin");
  const destinationStationId = searchParams.get("dest");

  const { trip, stops, minutesToDestination, isActive, isLoading, error, isExpired, stop: stopTracking } =
    useTripTracker(tripId ?? null);

  // Derive origin/destination names from trip data
  const firstStop = stops[0];
  const lastStop = stops[stops.length - 1];
  const originStationName = firstStop?.stationName ?? "Unknown";
  const destinationStationName = lastStop?.stationName ?? "Unknown";
  const line = trip?.routeId ?? "";

  // Trip journaling with anomaly detection
  const { matchedCommuteId, detectAnomaly, wasLogged } = useTripJournal({
    originStationId,
    originStationName,
    destinationStationId,
    destinationStationName,
    line,
    stops,
    isExpired,
    isActive,
  });

  // Track if trip was logged when it expired (for UI feedback)
  const [loggedOnExpire, setLoggedOnExpire] = useState(false);
  useEffect(() => {
    if (isExpired && wasLogged && matchedCommuteId) {
      setLoggedOnExpire(true);
    }
  }, [isExpired, wasLogged, matchedCommuteId]);

  // Anomaly detection for current duration
  const [anomaly, setAnomaly] = useState<ReturnType<typeof detectAnomaly>>(null);
  useEffect(() => {
    if (minutesToDestination && minutesToDestination > 0) {
      setAnomaly(detectAnomaly(minutesToDestination));
    }
  }, [minutesToDestination, detectAnomaly]);

  // Ticking ETA countdown
  const [etaDisplay, setEtaDisplay] = useState<string | null>(null);
  const etaIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => {
    if (etaIntervalRef.current) clearInterval(etaIntervalRef.current);

    if (!trip) {
      setEtaDisplay(null);
      return;
    }

    const lastStop = trip.stops[trip.stops.length - 1];
    const etaSeconds = lastStop?.arrivalTime;

    if (!etaSeconds) {
      setEtaDisplay(null);
      return;
    }

    const updateEta = () => {
      const now = Math.floor(Date.now() / 1000);
      const remaining = etaSeconds - now;
      if (remaining <= 0) {
        setEtaDisplay("Arriving");
        if (etaIntervalRef.current) clearInterval(etaIntervalRef.current);
      } else {
        const mins = Math.round(remaining / 60);
        setEtaDisplay(formatMinutesAway(mins));
      }
    };

    updateEta();
    etaIntervalRef.current = setInterval(updateEta, 5000); // Update every 5s
    return () => {
      if (etaIntervalRef.current) clearInterval(etaIntervalRef.current);
    };
  }, [trip]);

  // Derive DataStatus for DataState wrapper
  const dataStatus: DataStatus = isExpired
    ? "error"
    : isLoading && !trip
      ? "loading"
      : error
        ? "error"
        : trip
          ? "success"
          : "loading";

  const handleStopTracking = useCallback(() => {
    stopTracking();
    navigate(-1);
  }, [stopTracking, navigate]);

  const handleShare = useCallback(async () => {
    if (!tripId) return;
    const params = new URLSearchParams();
    if (originStationId) params.set("origin", originStationId);
    if (destinationStationId) params.set("dest", destinationStationId);
    const url = `${window.location.origin}/trip/${encodeURIComponent(tripId)}${params.toString() ? `?${params.toString()}` : ""}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: `Live trip on ${trip?.routeId ?? ""} line`,
          text: `Track my trip to ${trip?.destination ?? destinationStationId ?? "destination"}`,
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
      }
    } catch {
      // User cancelled share or clipboard failed — silent
    }
  }, [tripId, trip, originStationId, destinationStationId]);

  const destination = trip?.destination ?? destinationStationId ?? "Unknown";

  return (
    <div className="flex flex-col h-full bg-background dark:bg-dark-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background dark:bg-dark-background border-b border-surface dark:border-dark-surface px-4 py-3 pt-[env(safe-area-inset-top)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={handleStopTracking}
              className="shrink-0 min-h-touch min-w-touch flex items-center justify-center text-mta-primary"
              aria-label="Go back"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="15,18 9,12 15,6" />
              </svg>
            </button>
            <h1 className="text-lg font-bold text-text-primary dark:text-dark-text-primary truncate">
              Live Trip
            </h1>
          </div>

          {trip && (
            <button
              type="button"
              onClick={handleShare}
              className="shrink-0 min-h-touch min-w-touch flex items-center justify-center text-mta-primary"
              aria-label="Share trip progress"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-20">
        {/* ETA hero section */}
        <section className="px-4 pt-6 pb-4 text-center">
          {line && <LineBullet line={line} size="lg" />}
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mt-2 truncate px-4">
            To {destination}
          </p>

          {etaDisplay && !isExpired ? (
            <div className="mt-3">
              <span className="text-5xl font-extrabold text-text-primary dark:text-dark-text-primary tabular-nums">
                {etaDisplay}
              </span>
              <p className="text-13 text-text-secondary dark:text-dark-text-secondary mt-1">
                {trip?.isAssigned ? "" : "Scheduled "}
                {trip?.trainId ? `Train ${trip.trainId}` : ""}
              </p>
            </div>
          ) : null}

          {isExpired && (
            <div className="mt-3">
              <span className="text-3xl font-extrabold text-text-secondary dark:text-dark-text-secondary">
                Ended
              </span>
              {loggedOnExpire && (
                <p className="text-13 text-mta-primary mt-1">
                  ✓ Trip logged to your commute journal
                </p>
              )}
            </div>
          )}
        </section>

        {/* Anomaly detection banner */}
        {anomaly?.isAnomaly && !isExpired && (
          <section className="px-4 mb-4">
            <div
              className="flex items-center gap-3 p-3 rounded-lg bg-warning/10 border border-warning/20"
              role="alert"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-warning shrink-0"
                aria-hidden="true"
              >
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-warning">
                  {anomaly.deviationMinutes > 0
                    ? `${anomaly.deviationMinutes} min longer than usual`
                    : "Unusually long trip"}
                </p>
                <p className="text-13 text-text-secondary dark:text-dark-text-secondary">
                  Your average: ~{anomaly.baselineMinutes} min
                </p>
              </div>
            </div>
          </section>
        )}

        {/* Trip timeline */}
        <section className="px-4">
          <DataState
            status={dataStatus}
            data={stops}
            error={isExpired ? "This trip is no longer active" : error}
            skeleton={<TripTimelineSkeleton />}
          >
            {(stopsData) => (
              <TripTracker
                stops={stopsData}
                line={line}
                destination={destination}
                minutesToDestination={minutesToDestination}
                isExpired={isExpired}
              />
            )}
          </DataState>
        </section>

        {/* Stop tracking button */}
        {isActive && !isExpired && (
          <div className="px-4 mt-6">
            <button
              type="button"
              onClick={handleStopTracking}
              className="w-full py-3 rounded-lg bg-severe/10 text-severe font-semibold text-base min-h-touch transition-colors active:bg-severe/20"
              aria-label="Stop tracking this trip"
            >
              Stop Tracking
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

function TripTimelineSkeleton() {
  return (
    <div className="space-y-0" aria-busy="true" aria-label="Loading trip progress">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center h-12 gap-3">
          <div className="w-3 h-3 rounded-full skeleton shrink-0" />
          <div className="flex-1 h-4 rounded skeleton" />
        </div>
      ))}
    </div>
  );
}
