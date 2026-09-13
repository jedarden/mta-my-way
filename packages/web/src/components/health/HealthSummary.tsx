/**
 * HealthSummary - Overall system health percentage with visual indicator.
 */

interface HealthSummaryProps {
  percentage: number;
  totalLines: number;
  updatedAt: number | null;
}

export function HealthSummary({ percentage, totalLines }: Omit<HealthSummaryProps, "updatedAt">) {
  // Status text sits on the light surface / dark background, so the light-mode
  // tokens are the -700/-800 step: the -600 greens/yellows/oranges measure
  // 2.9-3.6:1 on white, below the 4.5:1 WCAG 1.4.3 floor (axe color-contrast).
  // Yellow takes -800: -700's margin over tinted tile backgrounds is too thin.
  const color =
    percentage >= 90
      ? "text-green-700 dark:text-green-400"
      : percentage >= 70
        ? "text-yellow-800 dark:text-yellow-400"
        : percentage >= 50
          ? "text-orange-700 dark:text-orange-400"
          : "text-red-700 dark:text-red-400";

  // The progress arc's color goes on `stroke` — `bg-*` on an SVG circle paints
  // nothing (background-color does not render on SVG shapes), which is why the
  // arc never appeared and axe read the dead background as the glyph's backdrop.
  const strokeColor =
    percentage >= 90
      ? "stroke-green-500"
      : percentage >= 70
        ? "stroke-yellow-500"
        : percentage >= 50
          ? "stroke-orange-500"
          : "stroke-red-500";

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
            className="text-neutral-200 dark:text-neutral-800"
          />
          <circle
            cx="18"
            cy="18"
            r="15.9"
            fill="none"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={`${percentage}, 100`}
            stroke="currentColor"
            className={strokeColor}
          />
        </svg>
        <span
          className={`absolute inset-0 flex items-center justify-center text-sm font-bold ${color}`}
        >
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
