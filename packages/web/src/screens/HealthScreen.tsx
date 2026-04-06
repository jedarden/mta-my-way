/**
 * HealthScreen - System-wide health dashboard.
 *
 * Shows all subway lines with status: normal / minor delays / significant delays / suspended.
 * Aggregates status from official alerts and predictive delays.
 * No new API calls — purely frontend aggregation of existing /api/alerts data.
 */

import { formatTimeAgo } from "@mta-my-way/shared";
import { getLineMetadata, getLinesByColorFamily } from "@mta-my-way/shared";
import type { LineHealthStatus } from "@mta-my-way/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DataHealth, HealthSummary, LineStatusTile } from "../components/health";
import Screen from "../components/layout/Screen";
import { useSystemHealth } from "../hooks/useSystemHealth";
import type { FeedHealthInfo } from "../lib/api";
import { api } from "../lib/api";

/** Lines to group together in the grid (shuttles + special) */
const HIDDEN_LINES = new Set(["GS"]); // GS is a duplicate of S

export default function HealthScreen() {
  const { lines, healthPercentage, status, updatedAt, refresh } = useSystemHealth();
  const totalLines = lines.length;
  const navigate = useNavigate();

  // Feed health data from /api/health
  const [feeds, setFeeds] = useState<FeedHealthInfo[]>([]);
  const fetchHealth = useCallback(async () => {
    try {
      const res = await api.getHealth();
      setFeeds(res.feeds);
    } catch {
      // Silently fail — line status grid is the primary content
    }
  }, []);

  useEffect(() => {
    void fetchHealth();
    const interval = setInterval(() => void fetchHealth(), 30_000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  // Group lines by color family for visual grouping
  const grouped = useMemo(() => {
    const families = getLinesByColorFamily();
    const groups: { color: string; lines: LineHealthStatus[] }[] = [];

    for (const [color, lineIds] of Object.entries(families)) {
      const visible = lineIds.filter((id) => !HIDDEN_LINES.has(id));
      if (visible.length === 0) continue;

      const lineStatuses = visible
        .map((id) => lines.find((l) => l.lineId === id))
        .filter((l): l is LineHealthStatus => !!l);

      if (lineStatuses.length > 0) {
        groups.push({ color, lines: lineStatuses });
      }
    }

    return groups;
  }, [lines]);

  return (
    <Screen>
      <div className="px-4 pt-2 pb-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-text-primary dark:text-dark-text-primary">
            System Health
          </h1>
          {updatedAt && (
            <button
              type="button"
              onClick={refresh}
              className="text-12 text-text-tertiary dark:text-dark-text-tertiary hover:text-text-secondary dark:hover:text-dark-text-secondary"
            >
              Updated {formatTimeAgo(Math.floor((Date.now() - updatedAt) / 1000))}
            </button>
          )}
        </div>

        {/* Overall health */}
        {status === "success" && (
          <HealthSummary percentage={healthPercentage} totalLines={totalLines} />
        )}

        {/* Loading skeleton */}
        {status === "loading" && (
          <div className="grid grid-cols-4 gap-2 mb-6">
            {Array.from({ length: 20 }).map((_, i) => (
              <div key={i} className="skeleton h-20 rounded-xl" />
            ))}
          </div>
        )}

        {/* Error state */}
        {status === "error" && (
          <div className="text-center py-8">
            <p className="text-text-secondary dark:text-dark-text-secondary mb-2">
              Unable to load system health
            </p>
            <button
              type="button"
              onClick={refresh}
              className="px-4 py-2 rounded-lg bg-mta-primary text-white text-14 font-medium"
            >
              Retry
            </button>
          </div>
        )}

        {/* Line grid grouped by color family */}
        {status === "success" && (
          <div className="mt-6 space-y-4">
            {grouped.map((group) => (
              <section key={group.color}>
                <div className="grid grid-cols-4 gap-2">
                  {group.lines.map((line) => (
                    <LineStatusTile
                      key={line.lineId}
                      line={line}
                      onClick={() => void navigate(`/line/${line.lineId}`)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {/* Affected lines detail */}
        {status === "success" && (
          <section className="mt-6">
            <h2 className="text-lg font-semibold mb-3 text-text-primary dark:text-dark-text-primary">
              Active Issues
            </h2>
            <AffectedLinesList lines={lines} />
          </section>
        )}

        {/* Data Health: per-feed freshness */}
        {feeds.length > 0 && <DataHealth feeds={feeds} />}
      </div>
    </Screen>
  );
}

/** List of lines with issues, showing summary */
function AffectedLinesList({ lines }: { lines: LineHealthStatus[] }) {
  const affected = useMemo(
    () =>
      lines
        .filter((l) => l.status !== "normal")
        .sort((a, b) => {
          const rank: Record<string, number> = {
            suspended: 3,
            significant_delays: 2,
            minor_delays: 1,
          };
          return (rank[b.status] ?? 0) - (rank[a.status] ?? 1);
        }),
    [lines]
  );

  if (affected.length === 0) {
    return (
      <p className="text-14 text-text-secondary dark:text-dark-text-secondary py-4">
        All lines running normally
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {affected.map((line) => {
        const meta = getLineMetadata(line.lineId);
        const displayId = meta?.shortName ?? line.lineId;

        const statusColor =
          line.status === "minor_delays"
            ? "bg-yellow-400 dark:bg-yellow-500"
            : line.status === "significant_delays"
              ? "bg-orange-400 dark:bg-orange-500"
              : "bg-red-500 dark:bg-red-400";

        const statusLabel =
          line.status === "minor_delays"
            ? "Minor Delays"
            : line.status === "significant_delays"
              ? "Significant Delays"
              : "Suspended";

        return (
          <li
            key={line.lineId}
            className="flex items-start gap-3 p-3 rounded-lg bg-surface dark:bg-dark-surface"
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 mt-0.5"
              style={{
                backgroundColor: meta?.color ?? "#808183",
                color: meta?.textColor ?? "#FFFFFF",
              }}
            >
              {displayId}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span
                  className={`inline-block w-2 h-2 rounded-full ${statusColor}`}
                  aria-hidden="true"
                />
                <span className="text-13 font-medium text-text-primary dark:text-dark-text-primary">
                  {meta?.longName ?? line.lineId}
                </span>
              </div>
              <p className="text-12 text-text-tertiary dark:text-dark-text-tertiary">
                {statusLabel}
              </p>
              {line.summary && (
                <p className="text-13 text-text-secondary dark:text-dark-text-secondary mt-1 leading-snug">
                  {line.summary}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
