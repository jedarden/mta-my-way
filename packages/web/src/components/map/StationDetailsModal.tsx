/**
 * StationDetailsModal - Modal showing details for a selected station on the map.
 *
 * Displays:
 * - Station name and borough
 * - Lines serving this station
 * - Transfer options
 * - ADA accessibility status
 * - Link to full station screen
 */

import type { Station } from "@mta-my-way/shared";
import { useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { FocusTrap } from "../common/FocusTrap";

interface StationDetailsModalProps {
  /** The station to display details for */
  station: Station;
  /** Called when the modal should close */
  onClose: () => void;
}

export function StationDetailsModal({ station, onClose }: StationDetailsModalProps) {
  const modalContentRef = useRef<HTMLDivElement>(null);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="station-details-title"
    >
      <FocusTrap active={true} onEscape={onClose}>
        <div
          ref={modalContentRef}
          className="bg-surface dark:bg-dark-surface w-full sm:max-w-md sm:rounded-t-xl sm:rounded-b-xl rounded-t-xl max-h-[80vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="sticky top-0 bg-surface dark:bg-dark-surface px-4 py-3 border-b border-border dark:border-dark-border flex items-center justify-between">
            <h2
              id="station-details-title"
              className="text-lg font-semibold text-text-primary dark:text-dark-text-primary"
            >
              {station.name}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="min-h-touch min-w-touch flex items-center justify-center text-text-secondary dark:text-dark-text-secondary hover:text-text-primary dark:hover:text-dark-text-primary"
              aria-label="Close"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <line x1={18} y1={6} x2={6} y2={18} />
                <line x1={6} y1={6} x2={18} y2={18} />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="p-4 space-y-4">
            {/* Borough and accessibility */}
            <div className="flex items-center gap-3 text-sm">
              <span className="px-2 py-1 bg-surface-hover dark:bg-dark-surface-hover rounded text-text-secondary dark:text-dark-text-secondary capitalize">
                {station.borough.replace("statenisland", "Staten Island")}
              </span>
              {station.ada && (
                <span className="flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <circle cx={12} cy={12} r={10} />
                    <path d="M12 6v6M12 16h.01" />
                  </svg>
                  ADA Accessible
                </span>
              )}
            </div>

            {/* Lines */}
            <div>
              <h3 className="text-sm font-medium text-text-secondary dark:text-dark-text-secondary mb-2">
                Lines
              </h3>
              <div className="flex flex-wrap gap-2">
                {station.lines.map((line) => (
                  <LineBullet key={line} line={line} />
                ))}
              </div>
            </div>

            {/* Transfers */}
            {station.transfers.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-text-secondary dark:text-dark-text-secondary mb-2">
                  Transfers
                </h3>
                <ul className="space-y-2">
                  {station.transfers.map((transfer) => (
                    <li key={transfer.toStationId} className="text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-text-primary dark:text-dark-text-primary">
                          To: {transfer.toLines.join(", ")}
                        </span>
                        <span className="text-text-tertiary dark:text-dark-text-tertiary text-xs">
                          {Math.floor(transfer.walkingSeconds / 60)} min walk
                          {!transfer.accessible && " (not ADA)"}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Coordinates (for debug) */}
            <div className="pt-2 border-t border-border dark:border-dark-border">
              <p className="text-xs text-text-tertiary dark:text-dark-text-tertiary font-mono">
                {station.lat.toFixed(4)}, {station.lon.toFixed(4)}
              </p>
            </div>

            {/* View full station link */}
            <Link
              to={`/station/${station.id}`}
              onClick={onClose}
              className="block w-full py-3 mt-4 bg-mta-primary text-white text-center font-medium rounded-lg hover:bg-mta-primary-dark transition-colors"
            >
              View Full Station Details
            </Link>
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}

// ─── LineBullet Component ─────────────────────────────────────────────────

interface LineBulletProps {
  line: string;
}

function LineBullet({ line }: LineBulletProps) {
  const getLineColor = (lineId: string): string => {
    const colors: Record<string, string> = {
      "1": "#ee352e",
      "2": "#ee352e",
      "3": "#ee352e",
      "4": "#00933c",
      "5": "#00933c",
      "6": "#00933c",
      "7": "#b933ad",
      A: "#0039a6",
      C: "#0039a6",
      E: "#0039a6",
      B: "#ff6319",
      D: "#ff6319",
      F: "#ff6319",
      M: "#ff6319",
      G: "#6cbe45",
      J: "#996633",
      Z: "#996633",
      L: "#a7a9ac",
      N: "#fccc0a",
      Q: "#fccc0a",
      R: "#fccc0a",
      W: "#fccc0a",
      S: "#808183",
      SIR: "#808183",
    };
    return colors[lineId.toUpperCase()] || "#808183";
  };

  const color = getLineColor(line);

  return (
    <span
      className="inline-flex items-center justify-center w-8 h-8 rounded-full text-white font-bold text-sm"
      style={{ backgroundColor: color }}
    >
      {line}
    </span>
  );
}
