/**
 * Confidence scoring utilities
 * Based on MTA division and train assignment status
 */

import type { ConfidenceLevel } from "../types/arrivals.js";
import type { Division } from "../types/stations.js";
import { isADivision, isBDivision } from "../constants/lines.js";

/**
 * Calculate confidence level based on division and assignment status
 *
 * A Division (numbered lines): ATS tracking, continuous position updates, reliable predictions
 * B Division (lettered lines): Bluetooth beacons, station-entry/exit only, 80-95% accuracy
 * L line: CBTC tracking, best accuracy of all (treated as A Division equivalent)
 *
 * @param lineId - The line ID (e.g., "1", "A", "F")
 * @param isAssigned - Whether a train is physically assigned to the trip
 * @returns Confidence level: "high", "medium", or "low"
 */
export function calculateConfidence(
  lineId: string,
  isAssigned: boolean
): ConfidenceLevel {
  const isADiv = isADivision(lineId);
  const isLLine = lineId === "L"; // L has CBTC, best accuracy

  if (isADiv || isLLine) {
    // A Division + L line: ATS/CBTC tracking
    return isAssigned ? "high" : "medium";
  }

  if (isBDivision(lineId)) {
    // B Division: Bluetooth tracking, lower accuracy
    return isAssigned ? "medium" : "low";
  }

  // Unknown line, default to low confidence
  return "low";
}

/**
 * Calculate confidence with reroute consideration
 * Rerouted trains always have lower confidence regardless of division
 */
export function calculateConfidenceWithReroute(
  lineId: string,
  isAssigned: boolean,
  isRerouted: boolean
): ConfidenceLevel {
  if (isRerouted) {
    return "low";
  }
  return calculateConfidence(lineId, isAssigned);
}

/**
 * Get a human-readable description of confidence level
 */
export function getConfidenceDescription(
  confidence: ConfidenceLevel,
  lineId?: string
): string {
  const lineInfo = lineId ? ` for the ${lineId} train` : "";

  switch (confidence) {
    case "high":
      return `High confidence${lineInfo}: ATS/CBTC tracking with reliable predictions`;
    case "medium":
      return `Medium confidence${lineInfo}: Predictions may vary by 1-2 minutes`;
    case "low":
      return `Low confidence${lineInfo}: Prediction uncertain, may be delayed or cancelled`;
  }
}

/**
 * Get the buffer time to add for transfer calculations based on confidence
 * Lower confidence = more buffer time needed
 */
export function getTransferBufferMinutes(confidence: ConfidenceLevel): number {
  switch (confidence) {
    case "high":
      return 0; // No buffer needed for ATS/CBTC tracked trains
    case "medium":
      return 2; // 2-minute buffer for medium confidence
    case "low":
      return 5; // 5-minute buffer for low confidence
  }
}

/**
 * Check if confidence level is acceptable for display
 * User can configure to hide low-confidence arrivals
 */
export function isConfidenceAcceptable(
  confidence: ConfidenceLevel,
  minimumAcceptable: ConfidenceLevel
): boolean {
  const levels: ConfidenceLevel[] = ["high", "medium", "low"];
  return levels.indexOf(confidence) <= levels.indexOf(minimumAcceptable);
}

/**
 * Get CSS class for confidence visualization
 */
export function getConfidenceStyleClass(confidence: ConfidenceLevel): string {
  switch (confidence) {
    case "high":
      return "confidence-high"; // Solid line indicator
    case "medium":
      return "confidence-medium"; // Dashed line indicator
    case "low":
      return "confidence-low"; // Dotted line indicator
  }
}

/**
 * Calculate the overall confidence for a multi-leg journey
 * Takes the lowest confidence of any leg
 */
export function calculateJourneyConfidence(
  legConfidences: ConfidenceLevel[]
): ConfidenceLevel {
  if (legConfidences.length === 0) {
    return "low";
  }

  const levels: ConfidenceLevel[] = ["high", "medium", "low"];
  let worstIndex = 0;

  for (const confidence of legConfidences) {
    const index = levels.indexOf(confidence);
    if (index > worstIndex) {
      worstIndex = index;
    }
  }

  return levels[worstIndex] ?? "low";
}

/**
 * Get division from line ID
 */
export function getDivision(lineId: string): Division | undefined {
  if (isADivision(lineId)) {
    return "A";
  }
  if (isBDivision(lineId)) {
    return "B";
  }
  return undefined;
}
