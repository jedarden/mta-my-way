/**
 * EquipmentBanner - Detailed banner showing elevator/escalator outages on StationScreen.
 *
 * Displays a list of broken equipment with descriptions, outage duration,
 * and estimated return to service. ADA-inaccessible stations get a more prominent warning.
 */

import type { EquipmentStatus } from "@mta-my-way/shared";
import { encodeForAria, sanitizeUserInput } from "../../lib/outputEncoding";

interface EquipmentBannerProps {
  equipment: EquipmentStatus[];
  stationName: string;
}

export function EquipmentBanner({ equipment, stationName }: EquipmentBannerProps) {
  if (equipment.length === 0) return null;

  const elevators = equipment.filter((e) => e.type === "elevator");
  const escalators = equipment.filter((e) => e.type === "escalator");
  const hasAdaImpact = equipment.some((e) => e.ada);

  return (
    <div
      className={[
        "rounded-lg p-4",
        hasAdaImpact
          ? "bg-red-50 border border-red-200 dark:bg-red-950/30 dark:border-red-800/50"
          : "bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800/50",
      ].join(" ")}
      role="alert"
      aria-label={`Equipment outages at ${encodeForAria(stationName)}`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        {hasAdaImpact ? (
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-red-600 dark:text-red-400"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        ) : (
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-amber-600 dark:text-amber-400"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        )}
        <h3
          className={[
            "font-semibold text-sm",
            hasAdaImpact ? "text-red-800 dark:text-red-300" : "text-amber-800 dark:text-amber-300",
          ].join(" ")}
        >
          {hasAdaImpact ? "ADA Access Disrupted" : "Equipment Outages"}
        </h3>
      </div>

      {/* ADA warning */}
      {hasAdaImpact && (
        <p className="text-13 text-red-700 dark:text-red-400 mb-3">
          This station is not currently ADA accessible due to elevator outages.
        </p>
      )}

      {/* Equipment list */}
      <ul className="space-y-2">
        {elevators.map((e, i) => (
          <EquipmentItem key={`elev-${i}`} equipment={e} />
        ))}
        {escalators.map((e, i) => (
          <EquipmentItem key={`esc-${i}`} equipment={e} />
        ))}
      </ul>
    </div>
  );
}

function EquipmentItem({ equipment }: { equipment: EquipmentStatus }) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-0.5 shrink-0" aria-hidden="true">
        {equipment.type === "elevator" ? (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M12 7v10" />
            <path d="M8 13l4 4 4-4" />
          </svg>
        ) : (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 18l6-6 4 4 6-8" />
            <path d="M4 18h16" />
          </svg>
        )}
      </span>
      <div className="min-w-0">
        <p className="text-13 text-text-primary dark:text-dark-text-primary">
          {sanitizeUserInput(equipment.description)}
          {equipment.ada && (
            <span className="ml-1.5 text-11 font-medium text-red-600 dark:text-red-400">ADA</span>
          )}
        </p>
        {equipment.estimatedReturn && (
          <p className="text-12 text-text-secondary dark:text-dark-text-secondary">
            Est. return: {equipment.estimatedReturn}
          </p>
        )}
      </div>
    </li>
  );
}

export default EquipmentBanner;
