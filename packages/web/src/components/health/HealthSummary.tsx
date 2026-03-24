/**
 * HealthSummary - Overall system health percentage with visual indicator.
 */

interface HealthSummaryProps {
  percentage: number;
  totalLines: number;
  updatedAt: number | null;
}

export function HealthSummary({ percentage, totalLines, updatedAt }: HealthSummaryProps) {
  const color =
    percentage >= 90
      ? "text-green-600 dark:text-green-400"
      : percentage >= 70
        ? "text-yellow-600 dark:text-yellow-400"
        : percentage >= 50
          ? "text-orange-600 dark:text-orange-400"
          : "text-red-600 dark:text-red-400";

  const bgColor =
    percentage >= 90
      ? "bg-green-500"
      : percentage >= 70
        ? "bg-yellow-500"
        : percentage >= 50
          ? "bg-orange-500"
          : "bg-red-500";

  const label =
    percentage >= 90
      ? "Good Service"
      : percentage >= 70
        ? "Minor Issues"
        : percentage >= 50
          ? "Significant Disruptions"
          : "Major Disruptions";

  return (
    <div className="flex items-center gap-4 p-4 rounded-xl bg-surface dark:bg-dark-surface">
      {/* Circular percentage indicator */}
      <div className="relative w-16 h-16 shrink-0">
        <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
          <circle
            cx="18"
            cy="18"
            r="15.9"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-border dark:text-dark-border"
          />
          <circle
            cx="18"
            cy="18"
            r="15.9"
            fill="none"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={`${percentage}, 100`}
            className={bgColor}
          />
        </svg>
        <span className={`absolute inset-0 flex items-center justify-center text-sm font-bold ${color}`}>
          {percentage}%
        </span>
      </div>

      <div className="flex-1 min-w-0">
        <p className={`text-base font-semibold ${color}`}>{label}</p>
        <p className="text-13 text-text-secondary dark:text-dark-text-secondary">
          {percentage} of {totalLines} lines running normally
        </p>
      </div>
    </div>
  );
}

export default HealthSummary;
