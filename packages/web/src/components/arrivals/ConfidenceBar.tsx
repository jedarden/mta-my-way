/**
 * ConfidenceBar - Visual indicator for arrival prediction confidence
 *
 * Shows a horizontal bar with different border styles:
 * - solid = high confidence (A Division + assigned)
 * - dashed = medium confidence (A Division unassigned or B Division assigned)
 * - dotted = low confidence (B Division + unassigned)
 */

import type { ConfidenceLevel } from "@mta-my-way/shared";

interface ConfidenceBarProps {
  /** Confidence level from the arrival data */
  confidence: ConfidenceLevel;
  /** Optional additional CSS classes */
  className?: string;
}

const confidenceStyles: Record<ConfidenceLevel, string> = {
  high: "border-solid border-text-primary dark:border-dark-text-primary",
  medium: "border-dashed border-text-secondary dark:border-dark-text-secondary",
  low: "border-dotted border-text-secondary dark:border-dark-text-secondary opacity-60",
};

export function ConfidenceBar({ confidence, className = "" }: ConfidenceBarProps) {
  return (
    <div
      className={`
        w-8 h-1 border-b-2
        ${confidenceStyles[confidence]}
        ${className}
      `}
      role="img"
      aria-label={`${confidence} confidence prediction`}
      title={`${confidence} confidence`}
    />
  );
}

export default ConfidenceBar;
