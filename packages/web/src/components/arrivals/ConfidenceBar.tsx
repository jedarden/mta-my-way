/**
 * ConfidenceBar - Visual indicator for arrival prediction confidence
 *
 * Shows a horizontal bar with different border styles:
 * - solid = high confidence (A Division + assigned)
 * - dashed = medium confidence (A Division unassigned or B Division assigned)
 * - dotted = low confidence (B Division + unassigned)
 *
 * When used with a lineId, shows a tooltip explaining the confidence level
 * and the A vs B Division tracking difference.
 */

import { useState, useRef, useEffect } from "react";
import type { ConfidenceLevel } from "@mta-my-way/shared";
import { isADivision, isBDivision } from "@mta-my-way/shared";

interface ConfidenceBarProps {
  /** Confidence level from the arrival data */
  confidence: ConfidenceLevel;
  /** Optional additional CSS classes */
  className?: string;
  /** Line ID for tooltip context (e.g., "F", "2") */
  lineId?: string;
}

const confidenceStyles: Record<ConfidenceLevel, string> = {
  high: "border-solid border-text-primary dark:border-dark-text-primary",
  medium: "border-dashed border-text-secondary dark:border-dark-text-secondary",
  low: "border-dotted border-text-secondary dark:border-dark-text-secondary opacity-60",
};

const confidenceDescriptions: Record<ConfidenceLevel, string> = {
  high: "High confidence — ATS/CBTC tracking with reliable predictions",
  medium: "Medium confidence — predictions may vary by 1-2 minutes",
  low: "Low confidence — prediction uncertain, may be delayed or cancelled",
};

function getDivisionInfo(lineId: string): string {
  if (isADivision(lineId)) {
    return "A Division (numbered lines) use ATS tracking for continuous, reliable position data.";
  }
  if (isBDivision(lineId)) {
    return "B Division (lettered lines) use Bluetooth beacons with 80-95% accuracy.";
  }
  return "";
}

export function ConfidenceBar({ confidence, className = "", lineId }: ConfidenceBarProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  // Close tooltip on outside click
  useEffect(() => {
    if (!showTooltip) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        tooltipRef.current &&
        !tooltipRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setShowTooltip(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showTooltip]);

  // Close tooltip after 4 seconds
  useEffect(() => {
    if (!showTooltip) return;
    const timer = setTimeout(() => setShowTooltip(false), 4000);
    return () => clearTimeout(timer);
  }, [showTooltip]);

  const hasTooltip = !!lineId;

  return (
    <div className="relative inline-flex">
      <div
        ref={triggerRef}
        className={`
          w-8 h-1 border-b-2 cursor-default
          ${confidenceStyles[confidence]}
          ${className}
          ${hasTooltip ? "cursor-help" : ""}
        `}
        role="img"
        aria-label={`${confidence} confidence prediction${lineId ? ` for ${lineId} train` : ""}`}
        title={lineId ? confidenceDescriptions[confidence] : `${confidence} confidence`}
        onClick={hasTooltip ? () => setShowTooltip(!showTooltip) : undefined}
        onKeyDown={(e) => {
          if (hasTooltip && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            setShowTooltip(!showTooltip);
          }
        }}
        tabIndex={hasTooltip ? 0 : undefined}
      />

      {/* Tooltip */}
      {showTooltip && hasTooltip && (
        <div
          ref={tooltipRef}
          role="tooltip"
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 px-3 py-2 bg-text-primary dark:bg-dark-text-primary text-white dark:text-dark-background text-11 rounded-lg shadow-lg z-50"
        >
          <p className="font-semibold mb-1">{confidenceDescriptions[confidence]}</p>
          {lineId && (
            <p className="opacity-80">
              {lineId} train: {getDivisionInfo(lineId)}
            </p>
          )}
          {/* Arrow */}
          <div
            className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-text-primary dark:border-t-dark-text-primary"
            aria-hidden="true"
          />
        </div>
      )}
    </div>
  );
}

export default ConfidenceBar;
