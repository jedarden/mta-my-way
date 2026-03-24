/**
 * EquipmentBadge - Compact badge showing elevator/escalator outages.
 *
 * Used on FavoriteCard to quickly indicate equipment issues:
 * - Red badge with elevator icon when elevators are broken
 * - Yellow badge with escalator icon when only escalators are broken
 */

interface EquipmentBadgeProps {
  brokenElevators: number;
  brokenEscalators: number;
}

export function EquipmentBadge({ brokenElevators, brokenEscalators }: EquipmentBadgeProps) {
  if (brokenElevators === 0 && brokenEscalators === 0) return null;

  const isElevator = brokenElevators > 0;

  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-11 font-medium",
        isElevator
          ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
          : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
      ].join(" ")}
      aria-label={
        isElevator
          ? `${brokenElevators} elevator${brokenElevators > 1 ? "s" : ""} out of service`
          : `${brokenEscalators} escalator${brokenEscalators > 1 ? "s" : ""} out of service`
      }
      role="status"
    >
      {/* Elevator icon */}
      {isElevator ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M12 7v10" />
          <path d="M8 13l4 4 4-4" />
        </svg>
      ) : (
        /* Escalator icon */
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 18l6-6 4 4 6-8" />
          <path d="M4 18h16" />
        </svg>
      )}
      {brokenElevators > 0
        ? `${brokenElevators} elevator${brokenElevators > 1 ? "s" : ""} out`
        : `${brokenEscalators} escalator${brokenEscalators > 1 ? "s" : ""} out`}
    </span>
  );
}

export default EquipmentBadge;
