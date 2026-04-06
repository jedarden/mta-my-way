/**
 * TripTracker - Vertical timeline showing stop-by-stop trip progress.
 *
 * Each stop is rendered with a status indicator:
 *   - passed: filled circle, muted text
 *   - current: pulsing blue circle, bold text
 *   - next: outlined circle with ETA
 *   - upcoming: dimmed circle
 *   - destination: flag icon, bold text
 */

import type { TripStopProgress } from "../../hooks/useTripTracker";
import { useEffect, useRef } from "react";

interface TripTrackerProps {
  stops: TripStopProgress[];
  line: string;
  destination: string;
  minutesToDestination: number | null;
  isExpired: boolean;
}

export function TripTracker({
  stops,
  line: _line,
  destination: _destination,
  minutesToDestination: _minutesToDestination,
  isExpired,
}: TripTrackerProps) {
  // Live region ref for controlled announcements
  const liveRegionRef = useRef<HTMLDivElement>(null);

  // Track previous state to detect meaningful changes for announcements
  const previousStateRef = useRef<{
    currentStopId: string | null;
    nextStopId: string | null;
    isExpired: boolean;
  } | null>(null);

  // Generate accessible description of trip status
  const getTripStatusDescription = () => {
    const currentStop = stops.find((s) => s.status === "current");
    const nextStop = stops.find((s) => s.status === "next");
    const destinationStop = stops.find((s) => s.status === "destination");

    if (isExpired) {
      return "Trip ended. This train has completed its run.";
    }

    if (currentStop) {
      const remainingStops = stops.filter((s, i) => i >= stops.indexOf(currentStop)).length;
      return `Currently at ${currentStop.stationName}. ${remainingStops} ${remainingStops === 1 ? "stop" : "stops"} remaining.`;
    }

    if (nextStop) {
      const eta = nextStop.minutesAway;
      const etaText = eta === 0 ? "now" : `${eta} ${eta === 1 ? "minute" : "minutes"}`;
      return `Approaching ${nextStop.stationName} in ${etaText}.`;
    }

    if (destinationStop) {
      const eta = destinationStop.minutesAway;
      const etaText = eta === 0 ? "arriving" : `${eta} ${eta === 1 ? "minute" : "minutes"}`;
      return `Arriving at ${destinationStop.stationName} in ${etaText}.`;
    }

    return "Trip progress tracking.";
  };

  // Announce trip status changes to screen readers
  useEffect(() => {
    const currentStop = stops.find((s) => s.status === "current");
    const nextStop = stops.find((s) => s.status === "next");

    const currentState = {
      currentStopId: currentStop?.stopId ?? null,
      nextStopId: nextStop?.stopId ?? null,
      isExpired,
    };

    const previousState = previousStateRef.current;

    // Only announce if there's a meaningful state change
    const shouldAnnounce =
      !previousState ||
      currentState.currentStopId !== previousState.currentStopId ||
      currentState.nextStopId !== previousState.nextStopId ||
      currentState.isExpired !== previousState.isExpired;

    if (shouldAnnounce && liveRegionRef.current) {
      const message = getTripStatusDescription();
      // Clear and set content to ensure screen readers detect the change
      liveRegionRef.current.textContent = "";
      void liveRegionRef.current.offsetHeight; // Force reflow
      liveRegionRef.current.textContent = message;

      previousStateRef.current = currentState;
    }
  }, [stops, isExpired]);

  return (
    <div className="flex flex-col gap-0" role="region" aria-label="Trip progress">
      {/* Screen reader announcement of trip status - only updates on meaningful changes */}
      <div ref={liveRegionRef} className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {getTripStatusDescription()}
      </div>

      {stops.map((stop, index) => (
        <StopRow
          key={stop.stopId}
          stop={stop}
          isLast={index === stops.length - 1}
          isFirst={index === 0}
        />
      ))}

      {/* Expired notice */}
      {isExpired && (
        <div className="mt-4 px-4 py-3 rounded-lg bg-warning/10 text-center" role="alert">
          <p className="text-sm font-medium text-text-primary dark:text-dark-text-primary">
            Trip ended
          </p>
          <p className="text-13 text-text-secondary dark:text-dark-text-secondary">
            This train has completed its run
          </p>
        </div>
      )}
    </div>
  );
}

interface StopRowProps {
  stop: TripStopProgress;
  isFirst: boolean;
  isLast: boolean;
}

function StopRow({ stop, isFirst, isLast }: StopRowProps) {
  return (
    <div className="flex items-stretch min-h-[3rem]">
      {/* Timeline track + dot */}
      <div className="flex flex-col items-center w-6 shrink-0">
        {/* Top connector line (hidden for first stop) */}
        {!isFirst && (
          <div
            className={`w-0.5 flex-1 ${
              stop.status === "passed" ? "bg-mta-primary" : "bg-border dark:bg-dark-border"
            }`}
          />
        )}

        {/* Dot */}
        <div className="flex items-center justify-center w-6 h-6 shrink-0">
          {stop.status === "passed" ? (
            <PassedDot />
          ) : stop.status === "current" ? (
            <CurrentDot />
          ) : stop.status === "next" ? (
            <NextDot />
          ) : stop.status === "destination" ? (
            <DestinationDot />
          ) : (
            <UpcomingDot />
          )}
        </div>

        {/* Bottom connector line (hidden for last stop) */}
        {!isLast && <div className="w-0.5 flex-1 bg-border dark:bg-dark-border" />}
      </div>

      {/* Stop content */}
      <div
        className={`flex-1 flex items-center justify-between py-2 px-3 min-w-0 ${
          stop.status === "passed" ? "opacity-50" : ""
        }`}
      >
        <div className="min-w-0">
          <p
            className={`text-sm truncate ${
              stop.status === "current" || stop.status === "destination"
                ? "font-semibold text-text-primary dark:text-dark-text-primary"
                : stop.status === "passed"
                  ? "text-text-secondary dark:text-dark-text-secondary"
                  : "text-text-primary dark:text-dark-text-primary"
            }`}
          >
            {stop.stationName}
          </p>
          {stop.status === "current" && (
            <p className="text-11 text-mta-primary font-medium">Train is here</p>
          )}
        </div>

        {/* Time display */}
        {stop.status === "next" && stop.minutesAway !== null && (
          <span className="text-lg font-extrabold text-mta-primary tabular-nums shrink-0 ml-2">
            {stop.minutesAway === 0 ? "now" : `${stop.minutesAway}m`}
          </span>
        )}
        {stop.status === "destination" && stop.minutesAway !== null && (
          <span className="text-lg font-extrabold text-text-primary dark:text-dark-text-primary tabular-nums shrink-0 ml-2">
            {stop.minutesAway === 0 ? "arriving" : `${stop.minutesAway}m`}
          </span>
        )}
        {stop.status === "upcoming" && stop.minutesAway !== null && (
          <span className="text-13 text-text-secondary dark:text-dark-text-secondary tabular-nums shrink-0 ml-2">
            {stop.minutesAway}m
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Status dots ────────────────────────────────────────────────────────

function PassedDot() {
  return <div className="w-3 h-3 rounded-full bg-mta-primary" aria-label="Passed" />;
}

function CurrentDot() {
  return (
    <div
      className="w-4 h-4 rounded-full bg-mta-primary ring-2 ring-mta-primary/30 animate-pulse"
      aria-label="Current position"
    />
  );
}

function NextDot() {
  return (
    <div
      className="w-3 h-3 rounded-full border-2 border-mta-primary bg-background dark:bg-dark-background"
      aria-label="Next stop"
    />
  );
}

function UpcomingDot() {
  return (
    <div className="w-2 h-2 rounded-full bg-border dark:bg-dark-border" aria-label="Upcoming" />
  );
}

function DestinationDot() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-mta-primary"
      aria-label="Destination"
    >
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  );
}
