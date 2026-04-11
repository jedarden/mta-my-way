/**
 * LineStatusTile - A single line's health indicator for the dashboard grid.
 *
 * Shows the line bullet with a status ring color, and a one-line summary
 * for affected lines.
 */

import type { LineHealthStatus } from "@mta-my-way/shared";
import { getLineColor, getLineMetadata, getLineTextColor } from "@mta-my-way/shared";
import { encodeForAria } from "../../lib/outputEncoding";

const STATUS_STYLES: Record<
  LineHealthStatus["status"],
  { ring: string; bg: string; label: string }
> = {
  normal: {
    ring: "ring-2 ring-green-400/50 dark:ring-green-500/50",
    bg: "bg-surface dark:bg-dark-surface",
    label: "Normal",
  },
  minor_delays: {
    ring: "ring-2 ring-yellow-400 dark:ring-yellow-500",
    bg: "bg-yellow-50 dark:bg-yellow-950/30",
    label: "Minor Delays",
  },
  significant_delays: {
    ring: "ring-2 ring-orange-400 dark:ring-orange-500",
    bg: "bg-orange-50 dark:bg-orange-950/30",
    label: "Significant Delays",
  },
  suspended: {
    ring: "ring-2 ring-red-500 dark:ring-red-400",
    bg: "bg-red-50 dark:bg-red-950/30",
    label: "Suspended",
  },
};

interface LineStatusTileProps {
  line: LineHealthStatus;
  onClick?: () => void;
}

export function LineStatusTile({ line, onClick }: LineStatusTileProps) {
  const meta = getLineMetadata(line.lineId);
  const style = STATUS_STYLES[line.status];
  const displayId = meta?.shortName ?? line.lineId;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        flex flex-col items-center gap-1.5 p-3 rounded-xl transition-colors
        ${style.bg} ${style.ring}
        hover:brightness-95 active:scale-[0.97]
        min-h-touch w-full
      `}
      aria-label={`${displayId} train: ${style.label}${line.summary ? `. ${encodeForAria(line.summary)}` : ""}`}
    >
      {/* Line bullet */}
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm"
        style={{
          backgroundColor: getLineColor(line.lineId),
          color: getLineTextColor(line.lineId),
        }}
      >
        {displayId}
      </div>

      {/* Status label */}
      <span className="text-11 font-medium text-text-secondary dark:text-dark-text-secondary leading-tight text-center">
        {line.status === "normal" ? (
          <span className="text-green-600 dark:text-green-400">Normal</span>
        ) : line.status === "minor_delays" ? (
          <span className="text-yellow-600 dark:text-yellow-400">Minor</span>
        ) : line.status === "significant_delays" ? (
          <span className="text-orange-600 dark:text-orange-400">Delays</span>
        ) : (
          <span className="text-red-600 dark:text-red-400">Down</span>
        )}
      </span>
    </button>
  );
}

export default LineStatusTile;
