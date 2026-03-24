/**
 * useSystemHealth - Aggregate alerts into per-line health status.
 *
 * Derives a LineHealthStatus for every subway line by scanning all alerts
 * and picking the worst severity per line. No new API calls — purely
 * frontend aggregation of existing /api/alerts data.
 */

import type { LineHealthStatus, LineStatus, StationAlert } from "@mta-my-way/shared";
import { getAllLineIds } from "@mta-my-way/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";

/** Map alert severity + effect to line status tier */
function severityToLineStatus(severity: StationAlert["severity"], effect: string): LineStatus {
  if (effect === "NO_SERVICE" || effect === "REDUCED_SERVICE") return "suspended";
  if (severity === "severe") return "suspended";
  if (severity === "warning") return "significant_delays";
  return "minor_delays";
}

/** Pick the worst status from two candidates */
function worstStatus(a: LineStatus, b: LineStatus): LineStatus {
  const rank: Record<LineStatus, number> = {
    normal: 0,
    minor_delays: 1,
    significant_delays: 2,
    suspended: 3,
  };
  return rank[a] >= rank[b] ? a : b;
}

/** Aggregate all alerts into per-line health status */
function computeLineHealth(alerts: StationAlert[]): {
  lines: LineHealthStatus[];
  healthPercentage: number;
} {
  const now = Date.now();
  const allIds = getAllLineIds();

  // Build per-line worst status from alerts
  const lineMap = new Map<string, { status: LineStatus; summary: string }>();

  for (const alert of alerts) {
    for (const lineId of alert.affectedLines) {
      const lineStatus = severityToLineStatus(alert.severity, alert.effect);
      const existing = lineMap.get(lineId);
      if (!existing || worstStatus(existing.status, lineStatus) !== existing.status) {
        lineMap.set(lineId, {
          status: lineStatus,
          summary: alert.headline,
        });
      }
    }
  }

  const lines: LineHealthStatus[] = allIds.map((lineId) => {
    const entry = lineMap.get(lineId);
    return {
      lineId,
      status: entry?.status ?? "normal",
      summary: entry?.summary,
      updatedAt: now,
    };
  });

  const normalCount = lines.filter((l) => l.status === "normal").length;
  const healthPercentage = Math.round((normalCount / lines.length) * 100);

  return { lines, healthPercentage };
}

export interface SystemHealthState {
  lines: LineHealthStatus[];
  healthPercentage: number;
  status: "idle" | "loading" | "success" | "error";
  error: string | null;
  updatedAt: number | null;
  refresh: () => void;
}

export function useSystemHealth(): SystemHealthState {
  const [alerts, setAlerts] = useState<StationAlert[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const fetchGenRef = useRef(0);

  const fetchAlerts = useCallback(async () => {
    const gen = ++fetchGenRef.current;
    setStatus((prev) => (prev === "idle" ? "loading" : prev));

    try {
      const response = await api.getAlerts();
      if (gen !== fetchGenRef.current) return;
      setAlerts(response.alerts ?? []);
      setStatus("success");
      setError(null);
      setUpdatedAt(Date.now());
    } catch (err) {
      if (gen !== fetchGenRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load alerts");
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void fetchAlerts();
    const interval = setInterval(() => void fetchAlerts(), 60_000);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  const health = useMemo(() => computeLineHealth(alerts), [alerts]);

  return {
    ...health,
    status,
    error,
    updatedAt,
    refresh: () => void fetchAlerts(),
  };
}
