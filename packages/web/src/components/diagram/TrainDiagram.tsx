/**
 * TrainDiagram - SVG schematic showing live train positions.
 *
 * A linear station-to-station representation (horizontal) with:
 * - Station nodes as circles (terminals larger, transfer stations marked)
 * - Train dots interpolated between stations using progress values
 * - User's next train highlighted with pulsing animation
 * - Tap a dot to see trip details (destination, assigned, delay)
 * - Accessible: screen reader announces train count and spacing
 */

import type { InterpolatedTrainPosition, LineDiagramData } from "@mta-my-way/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { getTrainOverallProgress } from "../../hooks/usePositions";
import { encodeForAria } from "../../lib/outputEncoding";

interface TrainDiagramProps {
  /** Line diagram data from the API */
  data: LineDiagramData;
  /** Trip ID of the user's next train to highlight (optional) */
  userNextTrainTripId?: string;
  /** Called when a train dot is tapped */
  onTrainTap?: (train: InterpolatedTrainPosition) => void;
  /** Optional additional class name */
  className?: string;
}

// Layout constants
const SVG_WIDTH = 600;
const SVG_HEIGHT = 120;
const PADDING_LEFT = 40;
const PADDING_RIGHT = 40;
const LINE_Y = 50;
const STATION_RADIUS = 6;
const TERMINAL_RADIUS = 9;
const TRAIN_RADIUS = 8;

/** Minimum distance between stations in SVG coordinates */
const MIN_STATION_SPACING = 30;

export function TrainDiagram({
  data,
  userNextTrainTripId,
  onTrainTap,
  className = "",
}: TrainDiagramProps) {
  const { routeId, routeColor, stops, trains } = data;
  const svgRef = useRef<SVGSVGElement>(null);

  // Calculate available width for stations
  const availableWidth = SVG_WIDTH - PADDING_LEFT - PADDING_RIGHT;

  // Calculate actual spacing based on number of stops
  const totalSpacing = stops.length > 1 ? availableWidth / (stops.length - 1) : availableWidth;
  const spacing = Math.max(totalSpacing, MIN_STATION_SPACING);

  // Effective width after applying minimum spacing
  const effectiveWidth = spacing * (stops.length - 1);
  const offsetX = PADDING_LEFT + (availableWidth - effectiveWidth) / 2;

  // Map stop index to x position
  const getStopX = (index: number): number => offsetX + index * spacing;

  // Get x position for a train based on its interpolation
  const getTrainX = (train: InterpolatedTrainPosition): number => {
    const lastStopIndex = stops.findIndex((s) => s.stopId === train.lastStopId);
    const nextStopIndex = stops.findIndex((s) => s.stopId === train.nextStopId);

    if (lastStopIndex === -1 || nextStopIndex === -1) {
      // Fallback to first stop
      return getStopX(0);
    }

    const lastX = getStopX(lastStopIndex);
    const nextX = getStopX(nextStopIndex);

    return lastX + (nextX - lastX) * train.progress;
  };

  // Group trains by direction for north/south offset
  const northboundTrains = trains.filter((t) => t.direction === "N");
  const southboundTrains = trains.filter((t) => t.direction === "S");

  // Calculate spacing summary for accessibility
  const spacingSummary = getSpacingSummary(trains, stops);

  // Count trains for accessibility
  const trainCount = trains.length;
  const reducedMotion = useReducedMotion();

  return (
    <figure
      className={className}
      role="img"
      aria-label={getAriaLabel(routeId, trainCount, spacingSummary)}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        className="w-full h-auto"
        role="presentation"
        aria-hidden="true"
      >
        {/* Main line */}
        <line
          x1={getStopX(0)}
          y1={LINE_Y}
          x2={getStopX(stops.length - 1)}
          y2={LINE_Y}
          stroke={routeColor}
          strokeWidth={4}
          strokeLinecap="round"
        />

        {/* Station nodes */}
        {stops.map((stop, index) => (
          <g key={stop.stopId}>
            {/* Transfer indicator (ring around station) */}
            {stop.isTransferStation && (
              <circle
                cx={getStopX(index)}
                cy={LINE_Y}
                r={STATION_RADIUS + 4}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                className="text-border dark:text-dark-border"
              />
            )}
            {/* Station circle */}
            <circle
              cx={getStopX(index)}
              cy={LINE_Y}
              r={stop.isTerminal ? TERMINAL_RADIUS : STATION_RADIUS}
              fill={stop.isTerminal ? routeColor : "white"}
              stroke={routeColor}
              strokeWidth={2}
              className={stop.isTerminal ? "" : "dark:fill-dark-background"}
            />
            {/* Station name (only terminals and transfer stations, rotated) */}
            {(stop.isTerminal || stop.isTransferStation) && (
              <text
                x={getStopX(index)}
                y={LINE_Y + 20}
                textAnchor="middle"
                className="fill-text-secondary dark:fill-dark-text-secondary"
                fontSize="10"
                fontFamily="system-ui, sans-serif"
              >
                {truncateStationName(stop.stopName)}
              </text>
            )}
          </g>
        ))}

        {/* Train dots - northbound (above line) */}
        {northboundTrains.map((train) => (
          <TrainDot
            key={train.tripId}
            train={train}
            x={getTrainX(train)}
            y={LINE_Y - 16}
            routeColor={routeColor}
            isUserNextTrain={train.tripId === userNextTrainTripId}
            reducedMotion={reducedMotion}
            onTap={onTrainTap}
          />
        ))}

        {/* Train dots - southbound (below line) */}
        {southboundTrains.map((train) => (
          <TrainDot
            key={train.tripId}
            train={train}
            x={getTrainX(train)}
            y={LINE_Y + 16}
            routeColor={routeColor}
            isUserNextTrain={train.tripId === userNextTrainTripId}
            reducedMotion={reducedMotion}
            onTap={onTrainTap}
          />
        ))}

        {/* Direction indicators */}
        <text
          x={getStopX(0) - 15}
          y={LINE_Y - 12}
          textAnchor="middle"
          fontSize="9"
          className="fill-text-secondary dark:fill-dark-text-secondary"
        >
          N
        </text>
        <text
          x={getStopX(0) - 15}
          y={LINE_Y + 16}
          textAnchor="middle"
          fontSize="9"
          className="fill-text-secondary dark:fill-dark-text-secondary"
        >
          S
        </text>
      </svg>

      {/* Screen reader announcement */}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {getAriaLabel(routeId, trainCount, spacingSummary)}
      </span>
    </figure>
  );
}

// ─── TrainDot Component ─────────────────────────────────────────────────────

interface TrainDotProps {
  train: InterpolatedTrainPosition;
  x: number;
  y: number;
  routeColor: string;
  isUserNextTrain: boolean;
  reducedMotion: boolean;
  onTap?: (train: InterpolatedTrainPosition) => void;
}

function TrainDot({
  train,
  x,
  y,
  routeColor,
  isUserNextTrain,
  reducedMotion,
  onTap,
}: TrainDotProps) {
  const [isPressed, setIsPressed] = useState(false);

  // Handle tap/click
  const handleClick = useCallback(() => {
    onTap?.(train);
  }, [train, onTap]);

  // Handle keyboard interaction
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onTap?.(train);
      }
    },
    [train, onTap]
  );

  // Assigned vs unassigned styling
  const fillColor = train.isAssigned ? routeColor : `${routeColor}80`; // 50% opacity if unassigned
  const strokeColor = train.isAssigned ? routeColor : routeColor;

  return (
    <g
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onMouseDown={() => setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      onMouseLeave={() => setIsPressed(false)}
      aria-label={`${train.direction === "N" ? "Northbound" : "Southbound"} train to ${encodeForAria(train.destination)}${train.isAssigned ? "" : " (unassigned)"}${train.delay && train.delay > 0 ? ` delayed ${train.delay} seconds` : ""}`}
      className="cursor-pointer focus:outline-none"
    >
      {/* Pulsing ring for user's next train */}
      {isUserNextTrain && !reducedMotion && (
        <circle
          cx={x}
          cy={y}
          r={TRAIN_RADIUS + 4}
          fill="none"
          stroke={routeColor}
          strokeWidth={2}
          opacity={0.5}
        >
          <animate
            attributeName="r"
            values={`${TRAIN_RADIUS + 4};${TRAIN_RADIUS + 10};${TRAIN_RADIUS + 4}`}
            dur="1.5s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values="0.6;0.1;0.6"
            dur="1.5s"
            repeatCount="indefinite"
          />
        </circle>
      )}

      {/* Train dot */}
      <circle
        cx={x}
        cy={y}
        r={isPressed ? TRAIN_RADIUS - 2 : TRAIN_RADIUS}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={2}
        className="transition-all duration-100"
      />

      {/* Direction arrow inside dot */}
      <path
        d={train.direction === "N" ? "M0,3 L3,-2 L-3,-2 Z" : "M0,-3 L3,2 L-3,2 Z"}
        transform={`translate(${x}, ${y})`}
        fill="white"
        className="pointer-events-none"
      />
    </g>
  );
}

// ─── Helper Functions ───────────────────────────────────────────────────────

/** Check for prefers-reduced-motion */
function useReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  return reducedMotion;
}

/** Truncate station name for display */
function truncateStationName(name: string, maxLength = 12): string {
  if (name.length <= maxLength) return name;
  return name.slice(0, maxLength - 1) + "…";
}

/** Calculate spacing summary for accessibility */
function getSpacingSummary(
  trains: InterpolatedTrainPosition[],
  stops: LineDiagramData["stops"]
): string {
  if (trains.length === 0) return "no trains";

  // Calculate overall progress for each train
  const progressValues = trains
    .map((t) => getTrainOverallProgress(t, stops))
    .filter((v): v is number => v !== undefined)
    .sort((a, b) => a - b);

  if (progressValues.length < 2) return "single train";

  // Calculate gaps between consecutive trains
  const gaps: number[] = [];
  for (let i = 1; i < progressValues.length; i++) {
    const prev = progressValues[i - 1];
    const curr = progressValues[i];
    if (prev !== undefined && curr !== undefined) {
      gaps.push(curr - prev);
    }
  }

  if (gaps.length === 0) return "single train";

  // Calculate average and max gap
  const avgGap = gaps.reduce((sum, g) => sum + g, 0) / gaps.length;
  const maxGap = Math.max(...gaps);

  // Count bunched trains (gaps less than 10% of line length)
  const bunchedTrains = gaps.filter((g) => g < 0.1).length;

  if (bunchedTrains > 0) {
    return "trains bunched together";
  }

  // Check for gaps (some gaps much larger than average)
  if (maxGap > avgGap * 2) {
    return "large gap in service";
  }

  // Check for even spacing
  const gapVariance = gaps.reduce((sum, g) => sum + Math.pow(g - avgGap, 2), 0) / gaps.length;
  if (gapVariance < 0.01) {
    return "evenly spaced";
  }

  return "normal spacing";
}

/** Generate accessible label */
function getAriaLabel(routeId: string, trainCount: number, spacingSummary: string): string {
  if (trainCount === 0) {
    return `${routeId} line: no trains currently tracking`;
  }
  return `${routeId} line: ${trainCount} train${trainCount === 1 ? "" : "s"}, ${spacingSummary}`;
}

export default TrainDiagram;
