/**
 * TransitMap - Interactive map showing subway lines, stations, and real-time train positions.
 *
 * Features:
 * - SVG-based map with pan and zoom support
 * - Station markers with tap to view details
 * - Real-time train positions with animations
 * - Line colors and transfer indicators
 * - Accessible keyboard navigation
 */

import type { InterpolatedTrainPosition, LineDiagramData, Station } from "@mta-my-way/shared";
import { useCallback, useRef, useState } from "react";

interface TransitMapProps {
  /** All stations to display on the map */
  stations: Station[];
  /** Map of route IDs to their diagram data */
  lineData: Map<string, LineDiagramData>;
  /** Called when a station is tapped */
  onStationTap?: (station: Station) => void;
  /** Called when a train is tapped */
  onTrainTap?: (train: InterpolatedTrainPosition & { routeId: string }) => void;
  /** Optional additional class name */
  className?: string;
}

// Map bounds (NYC area)
const NYC_BOUNDS = {
  minLat: 40.5,
  maxLat: 40.9,
  minLon: -74.05,
  maxLon: -73.85,
};

// SVG viewport size
const SVG_WIDTH = 800;
const SVG_HEIGHT = 600;

// Zoom limits
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.2;

export function TransitMap({
  stations,
  lineData,
  onStationTap,
  onTrainTap,
  className = "",
}: TransitMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Viewport state
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Convert lat/lon to SVG coordinates
  const latLonToSvg = useCallback((lat: number, lon: number): { x: number; y: number } => {
    const x = ((lon - NYC_BOUNDS.minLon) / (NYC_BOUNDS.maxLon - NYC_BOUNDS.minLon)) * SVG_WIDTH;
    const y =
      SVG_HEIGHT -
      ((lat - NYC_BOUNDS.minLat) / (NYC_BOUNDS.maxLat - NYC_BOUNDS.minLat)) * SVG_HEIGHT;
    return { x, y };
  }, []);

  // Handle pan start
  const handlePanStart = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return; // Only primary button
      setIsDragging(true);
      setDragStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
      svgRef.current?.setPointerCapture(e.pointerId);
    },
    [transform]
  );

  // Handle pan move
  const handlePanMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return;
      setTransform({
        ...transform,
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    },
    [isDragging, dragStart, transform]
  );

  // Handle pan end
  const handlePanEnd = useCallback((e: React.PointerEvent) => {
    setIsDragging(false);
    svgRef.current?.releasePointerCapture(e.pointerId);
  }, []);

  // Handle zoom with wheel
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      const newScale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, transform.scale + delta));
      setTransform({ ...transform, scale: newScale });
    },
    [transform]
  );

  // Handle zoom buttons
  const handleZoomIn = useCallback(() => {
    setTransform((prev) => ({
      ...prev,
      scale: Math.min(MAX_ZOOM, prev.scale + ZOOM_STEP),
    }));
  }, []);

  const handleZoomOut = useCallback(() => {
    setTransform((prev) => ({
      ...prev,
      scale: Math.max(MIN_ZOOM, prev.scale - ZOOM_STEP),
    }));
  }, []);

  const handleReset = useCallback(() => {
    setTransform({ x: 0, y: 0, scale: 1 });
  }, []);

  // Generate SVG path for a line's stations
  const generateLinePath = useCallback(
    (stops: LineDiagramData["stops"]): string | null => {
      if (stops.length < 2) return null;

      const pathData = stops
        .map((stop) => {
          const station = stations.find((s) => s.id === stop.stopId);
          if (!station) return null;
          const coords = latLonToSvg(station.lat, station.lon);
          return `${coords.x},${coords.y}`;
        })
        .filter((p): p is string => p !== null);

      if (pathData.length < 2) return null;
      return `M ${pathData.join(" L ")}`;
    },
    [stations, latLonToSvg]
  );

  return (
    <div ref={containerRef} className={`relative w-full h-full overflow-hidden ${className}`}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        className="w-full h-full bg-background dark:bg-dark-background touch-none"
        onPointerDown={handlePanStart}
        onPointerMove={handlePanMove}
        onPointerUp={handlePanEnd}
        onWheel={handleWheel}
        role="img"
        aria-label="Interactive transit map showing subway lines and stations"
      >
        <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}>
          {/* Draw lines */}
          {Array.from(lineData.values()).map((line) => (
            <g key={line.routeId}>
              {generateLinePath(line.stops) && (
                <path
                  d={generateLinePath(line.stops)!}
                  stroke={line.routeColor}
                  strokeWidth={3}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={0.7}
                  aria-label={`${line.routeId} line`}
                />
              )}
            </g>
          ))}

          {/* Draw stations */}
          {stations.map((station) => {
            const coords = latLonToSvg(station.lat, station.lon);
            return (
              <StationMarker
                key={station.id}
                station={station}
                x={coords.x}
                y={coords.y}
                onTap={onStationTap}
              />
            );
          })}

          {/* Draw trains */}
          {Array.from(lineData.entries()).flatMap(([routeId, line]) =>
            line.trains.map((train) => {
              const lastStation = stations.find((s) => s.id === train.lastStopId);
              const nextStation = stations.find((s) => s.id === train.nextStopId);

              if (!lastStation || !nextStation) return null;

              const lastCoords = latLonToSvg(lastStation.lat, lastStation.lon);
              const nextCoords = latLonToSvg(nextStation.lat, nextStation.lon);

              const x = lastCoords.x + (nextCoords.x - lastCoords.x) * train.progress;
              const y = lastCoords.y + (nextCoords.y - lastCoords.y) * train.progress;

              return (
                <TrainMarker
                  key={train.tripId}
                  train={train}
                  routeId={routeId}
                  routeColor={line.routeColor}
                  x={x}
                  y={y}
                  onTap={onTrainTap}
                />
              );
            })
          )}
        </g>
      </svg>

      {/* Zoom controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-2">
        <button
          type="button"
          onClick={handleZoomIn}
          className="w-10 h-10 bg-surface dark:bg-dark-surface rounded-lg shadow-lg flex items-center justify-center text-text-primary dark:text-dark-text-primary hover:bg-surface-hover dark:hover:bg-dark-surface-hover transition-colors"
          aria-label="Zoom in"
          tabIndex={0}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <line x1={12} y1={5} x2={12} y2={19} />
            <line x1={5} y1={12} x2={19} y2={12} />
          </svg>
        </button>
        <button
          type="button"
          onClick={handleZoomOut}
          className="w-10 h-10 bg-surface dark:bg-dark-surface rounded-lg shadow-lg flex items-center justify-center text-text-primary dark:text-dark-text-primary hover:bg-surface-hover dark:hover:bg-dark-surface-hover transition-colors"
          aria-label="Zoom out"
          tabIndex={0}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <line x1={5} y1={12} x2={19} y2={12} />
          </svg>
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="w-10 h-10 bg-surface dark:bg-dark-surface rounded-lg shadow-lg flex items-center justify-center text-text-primary dark:text-dark-text-primary hover:bg-surface-hover dark:hover:bg-dark-surface-hover transition-colors"
          aria-label="Reset view"
          tabIndex={0}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
          </svg>
        </button>
      </div>

      {/* Instructions hint */}
      {transform.scale === 1 && transform.x === 0 && transform.y === 0 && (
        <div className="absolute top-4 left-4 bg-surface/90 dark:bg-dark-surface/90 backdrop-blur-sm px-3 py-2 rounded-lg text-xs text-text-secondary dark:text-dark-text-secondary shadow-lg">
          <p>Drag to pan • Scroll to zoom • Tap stations for details</p>
        </div>
      )}
    </div>
  );
}

// ─── StationMarker Component ─────────────────────────────────────────────

interface StationMarkerProps {
  station: Station;
  x: number;
  y: number;
  onTap?: (station: Station) => void;
}

function StationMarker({ station, x, y, onTap }: StationMarkerProps) {
  const handleClick = useCallback(() => {
    onTap?.(station);
  }, [station, onTap]);

  const isTransfer = station.lines.length > 1;
  const radius = isTransfer ? 8 : 5;

  return (
    <g
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
      className="cursor-pointer focus:outline-none"
      aria-label={`${station.name}${isTransfer ? ` (transfer station)` : ""}`}
    >
      {/* Transfer indicator ring */}
      {isTransfer && (
        <circle
          cx={x}
          cy={y}
          r={radius + 3}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className="text-border dark:text-dark-border opacity-50"
        />
      )}
      {/* Main station marker */}
      <circle
        cx={x}
        cy={y}
        r={radius}
        fill={station.ada ? "#22c55e" : "white"}
        stroke="#374151"
        strokeWidth={2}
        className="dark:stroke-dark-text-primary transition-transform hover:scale-125"
      />
      {/* Station name on hover */}
      <title>{station.name}</title>
    </g>
  );
}

// ─── TrainMarker Component ───────────────────────────────────────────────

interface TrainMarkerProps {
  train: InterpolatedTrainPosition;
  routeId: string;
  routeColor: string;
  x: number;
  y: number;
  onTap?: (train: InterpolatedTrainPosition & { routeId: string }) => void;
}

function TrainMarker({ train, routeId, routeColor, x, y, onTap }: TrainMarkerProps) {
  const [isPulsing] = useState(Math.random() > 0.5);

  const handleClick = useCallback(() => {
    onTap?.({ ...train, routeId });
  }, [train, routeId, onTap]);

  return (
    <g
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
      className="cursor-pointer focus:outline-none"
      aria-label={`${train.direction === "N" ? "Northbound" : "Southbound"} ${routeId} train to ${train.destination}`}
    >
      {/* Pulsing ring for visibility */}
      <circle cx={x} cy={y} r={8} fill="none" stroke={routeColor} strokeWidth={2} opacity={0.4}>
        <animate
          attributeName="r"
          values="8;12;8"
          dur={isPulsing ? "2s" : "1.5s"}
          repeatCount="indefinite"
          begin={isPulsing ? "0s" : "1s"}
        />
        <animate
          attributeName="opacity"
          values="0.4;0.1;0.4"
          dur={isPulsing ? "2s" : "1.5s"}
          repeatCount="indefinite"
          begin={isPulsing ? "0s" : "1s"}
        />
      </circle>
      {/* Train dot */}
      <circle
        cx={x}
        cy={y}
        r={5}
        fill={train.isAssigned ? routeColor : `${routeColor}80`}
        stroke="white"
        strokeWidth={2}
      />
      {/* Direction indicator */}
      <text
        x={x}
        y={y + 3}
        textAnchor="middle"
        fontSize={7}
        fontWeight="bold"
        fill="white"
        className="pointer-events-none"
      >
        {train.direction}
      </text>
    </g>
  );
}

export default TransitMap;
