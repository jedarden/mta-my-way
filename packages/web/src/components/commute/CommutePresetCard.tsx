/**
 * CommutePresetCard - A preset card for quick commute access with action buttons.
 *
 * Shows:
 *   - Commute name and route (origin → destination)
 *   - Quick action buttons: "View Arrivals" and "Start Trip"
 *   - Pin indicator for pinned presets
 *   - Edit button
 *
 * Quick actions:
 *   - View Arrivals: Navigates to the origin station's arrivals screen
 *   - Start Trip: Opens the commute detail view for trip planning
 *
 * Used on HomeScreen and CommuteScreen for fast access to common routes.
 * Keyboard accessible: Tab to focus card, Enter/Space to view arrivals.
 */

import type { Commute } from "@mta-my-way/shared";
import { useCallback } from "react";
import type { KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { LineBullet } from "../arrivals/LineBullet";

interface CommutePresetCardProps {
  commute: Commute;
  onEdit?: (commute: Commute) => void;
}

export function CommutePresetCard({ commute, onEdit }: CommutePresetCardProps) {
  const navigate = useNavigate();

  const handleViewArrivals = useCallback(() => {
    void navigate(`/station/${commute.origin.stationId}`);
  }, [navigate, commute]);

  const handleStartTrip = useCallback(() => {
    void navigate(`/commute/${commute.id}`);
  }, [navigate, commute]);

  const handleEdit = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onEdit?.(commute);
    },
    [onEdit, commute]
  );

  // Keyboard handler for card navigation - default to View Arrivals
  const handleCardKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleViewArrivals();
      }
    },
    [handleViewArrivals]
  );

  return (
    <article
      className="bg-surface dark:bg-dark-surface rounded-lg p-4 shadow-sm"
      tabIndex={0}
      role="button"
      aria-label={`${commute.name}: ${commute.origin.stationName} to ${commute.destination.stationName}. Press Enter to view arrivals.`}
      onKeyDown={handleCardKeyDown}
    >
      {/* Header with name and edit */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {commute.isPinned && (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="text-mta-primary shrink-0"
                aria-label="Pinned commute"
              >
                <path d="M16 12V4H17V2H7V4H8V12L6 14V16H11.2V22H12.8V16H18V14L16 12Z" />
              </svg>
            )}
            <h3 className="font-semibold text-base text-text-primary dark:text-dark-text-primary truncate">
              {commute.name}
            </h3>
          </div>
          <p className="text-13 text-text-secondary dark:text-dark-text-secondary truncate mt-0.5">
            {commute.origin.stationName} → {commute.destination.stationName}
          </p>
        </div>
        {onEdit && (
          <button
            type="button"
            onClick={handleEdit}
            onKeyDown={(e) => {
              // Prevent card keyboard navigation when edit button is focused
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation();
              }
            }}
            className="p-2 min-h-touch min-w-touch flex items-center justify-center text-text-secondary dark:text-dark-text-secondary hover:text-text-primary dark:hover:text-dark-text-primary rounded-lg shrink-0"
            aria-label={`Edit ${commute.name} commute`}
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
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="1" />
              <circle cx="19" cy="12" r="1" />
              <circle cx="5" cy="12" r="1" />
            </svg>
          </button>
        )}
      </div>

      {/* Preferred lines badges */}
      {commute.preferredLines.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {commute.preferredLines.map((line) => (
            <span
              key={line}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-background dark:bg-dark-background"
            >
              <LineBullet line={line} size="sm" />
            </span>
          ))}
        </div>
      )}

      {/* Quick action buttons */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleViewArrivals}
          className="flex-1 px-3 py-2.5 bg-background dark:bg-dark-background rounded-lg text-13 font-medium text-text-primary dark:text-dark-text-primary hover:bg-surface/80 dark:hover:bg-dark-surface/80 transition-colors min-h-touch flex items-center justify-center gap-2"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          Arrivals
        </button>
        <button
          type="button"
          onClick={handleStartTrip}
          className="flex-1 px-3 py-2.5 bg-mta-primary rounded-lg text-13 font-semibold text-white hover:opacity-90 transition-opacity min-h-touch flex items-center justify-center gap-2"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          Start Trip
        </button>
      </div>
    </article>
  );
}

export default CommutePresetCard;
