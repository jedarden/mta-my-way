/**
 * ShuttleInfo - Display shuttle bus replacement information.
 *
 * Shows when service is suspended and replacement shuttle buses are available.
 * Displays stop locations, frequency, and verification date.
 */

import type { ShuttleBusInfo } from "@mta-my-way/shared";
import { sanitizeUserInput } from "../../lib/outputEncoding";

interface ShuttleInfoProps {
  shuttleInfo: ShuttleBusInfo;
  /** Use compact mode for inline display */
  compact?: boolean;
}

/** Bus icon */
function BusIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M3 10h18" />
      <circle cx="7" cy="18" r="1.5" fill="currentColor" />
      <circle cx="17" cy="18" r="1.5" fill="currentColor" />
      <path d="M7 6V4" />
      <path d="M17 6V4" />
    </svg>
  );
}

/** Location pin icon */
function LocationIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
    </svg>
  );
}

export function ShuttleInfo({ shuttleInfo, compact = false }: ShuttleInfoProps) {
  if (compact) {
    return <CompactShuttleInfo shuttleInfo={shuttleInfo} />;
  }

  return (
    <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <BusIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        <span className="text-sm font-semibold text-blue-800 dark:text-blue-200">
          Shuttle Bus Available
        </span>
      </div>

      {/* Route description */}
      <p className="text-13 text-blue-700 dark:text-blue-300 mb-3">
        Replacement shuttle buses are running while service is suspended.
      </p>

      {/* Stops list */}
      <div className="space-y-1.5">
        {shuttleInfo.stops.map((stop, index) => (
          <div key={stop.nearStationId} className="flex items-start gap-2">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-200 dark:bg-blue-800 flex items-center justify-center text-11 font-bold text-blue-700 dark:text-blue-300">
              {index + 1}
            </span>
            <div className="min-w-0">
              <p className="text-13 text-text-primary dark:text-dark-text-primary">
                {sanitizeUserInput(stop.description)}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Footer: frequency and verification */}
      <div className="mt-3 pt-2 border-t border-blue-200 dark:border-blue-800 flex items-center justify-between text-11">
        <span className="text-blue-600 dark:text-blue-400">
          <span className="font-medium">Frequency:</span> every {shuttleInfo.frequencyMinutes} min
        </span>
        <span className="text-blue-500 dark:text-blue-500">
          Verified {shuttleInfo.lastVerified}
        </span>
      </div>
    </div>
  );
}

/** Compact inline version for banners */
function CompactShuttleInfo({ shuttleInfo }: { shuttleInfo: ShuttleBusInfo }) {
  return (
    <div className="flex items-center gap-1.5 text-11 text-blue-600 dark:text-blue-400">
      <BusIcon className="w-3.5 h-3.5" />
      <span>Shuttle bus every {shuttleInfo.frequencyMinutes} min</span>
      <LocationIcon className="w-3 h-3 ml-1" />
      <span>{shuttleInfo.stops.length} stops</span>
    </div>
  );
}

export default ShuttleInfo;
