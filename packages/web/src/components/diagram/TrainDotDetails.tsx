/**
 * TrainDotDetails - Tooltip/Modal showing trip details when train dot is tapped.
 *
 * Shows:
 * - Direction and destination
 * - Assigned status
 * - Delay (if any)
 * - Link to full trip tracker
 */

import type { InterpolatedTrainPosition } from "@mta-my-way/shared";
import { useCallback, useEffect, useRef } from "react";
import { LineBullet } from "../arrivals/LineBullet";

interface TrainDotDetailsProps {
  /** The train to show details for */
  train: InterpolatedTrainPosition;
  /** Route/line ID */
  routeId: string;
  /** Called to close the details panel */
  onClose: () => void;
  /** Called to navigate to full trip tracker */
  onTrackTrip?: (tripId: string) => void;
}

export function TrainDotDetails({ train, routeId, onClose, onTrackTrip }: TrainDotDetailsProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Focus trap and initial focus
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  // Handle click outside to close
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  // Format delay for display
  const delayText = getDelayText(train.delay);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 backdrop-blur-sm"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="train-details-title"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="w-full max-w-md bg-background dark:bg-dark-background rounded-t-2xl shadow-xl p-4 pb-8 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <LineBullet line={routeId} size="md" />
            <h2 id="train-details-title" className="text-lg font-semibold text-text-primary dark:text-dark-text-primary">
              {train.direction === "N" ? "Northbound" : "Southbound"} Train
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-touch min-w-touch flex items-center justify-center text-text-secondary dark:text-dark-text-secondary"
            aria-label="Close"
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
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Trip details */}
        <div className="space-y-3">
          {/* Destination */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary dark:text-dark-text-secondary">Destination</span>
            <span className="text-sm font-medium text-text-primary dark:text-dark-text-primary">
              {train.destination}
            </span>
          </div>

          {/* Assignment status */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary dark:text-dark-text-secondary">Status</span>
            <span
              className={`text-sm font-medium ${
                train.isAssigned
                  ? "text-success dark:text-dark-success"
                  : "text-warning dark:text-dark-warning"
              }`}
            >
              {train.isAssigned ? "Assigned" : "Unassigned"}
            </span>
          </div>

          {/* Delay */}
          {delayText && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary dark:text-dark-text-secondary">Delay</span>
              <span
                className={`text-sm font-medium ${
                  train.delay && train.delay > 300
                    ? "text-severe dark:text-dark-severe"
                    : "text-warning dark:text-dark-warning"
                }`}
              >
                {delayText}
              </span>
            </div>
          )}
        </div>

        {/* Track trip button */}
        {onTrackTrip && (
          <button
            type="button"
            onClick={() => {
              onTrackTrip(train.tripId);
              onClose();
            }}
            className="w-full mt-6 py-3 px-4 bg-mta-primary text-white rounded-lg font-medium flex items-center justify-center gap-2 min-h-touch"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12,6 12,12 16,14" />
            </svg>
            Track this train
          </button>
        )}

        {/* Trip ID (small, for reference) */}
        <p className="mt-4 text-center text-11 text-text-tertiary dark:text-dark-text-tertiary">
          Trip ID: {train.tripId}
        </p>
      </div>
    </div>
  );
}

/** Format delay seconds into human-readable text */
function getDelayText(delay?: number): string | null {
  if (delay === undefined || delay === null || delay <= 0) {
    return null;
  }

  const minutes = Math.floor(delay / 60);
  const seconds = delay % 60;

  if (minutes === 0) {
    return `${seconds}s delay`;
  }

  if (seconds < 30) {
    return `${minutes}m delay`;
  }

  return `${minutes + 1}m delay`;
}

export default TrainDotDetails;
