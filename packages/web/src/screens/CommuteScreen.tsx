/**
 * CommuteScreen - Full commute planner with saved commutes and analysis.
 *
 * When navigated to /commute (tab), shows:
 *   - List of saved commutes with inline analysis (CommuteCards)
 *   - "Plan a commute" button to add new
 *   - Trip journal placeholder (Phase 5)
 *
 * When navigated to /commute/:commuteId, shows:
 *   - Alert banners for lines on the commute
 *   - Full analysis with TransferDetail (RECOMMENDED/DIRECT/ALSO POSSIBLE)
 *   - RouteComparison side-by-side view
 *   - Back navigation
 */

import type { Commute } from "@mta-my-way/shared";
import { useCallback, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertBanner } from "../components/alerts";
import { DataState } from "../components/common/DataState";
import { EmptyCommutes } from "../components/common/EmptyState";
import { CommuteCardSkeleton } from "../components/common/Skeleton";
import { CommuteCard } from "../components/commute/CommuteCard";
import { CommuteEditor } from "../components/commute/CommuteEditor";
import { RouteComparison } from "../components/commute/RouteComparison";
import { TransferDetail } from "../components/commute/TransferDetail";
import { WalkComparison } from "../components/commute/WalkComparison";
import Screen from "../components/layout/Screen";
import { useAlertsForStation } from "../hooks/useAlerts";
import { useCommute } from "../hooks/useCommute";
import { useWalkComparison } from "../hooks/useWalkComparison";
import { useFavoritesStore } from "../stores";

const MAX_COMMUTES = 10;

export default function CommuteScreen() {
  const params = useParams<{ commuteId?: string }>();

  // If a specific commute ID is provided, show its detail view
  if (params.commuteId) {
    return <CommuteDetailView commuteId={params.commuteId} />;
  }

  return <CommuteList />;
}

// ─── Commute List View ──────────────────────────────────────────────────

function CommuteList() {
  const navigate = useNavigate();
  const commutes = useFavoritesStore((s) => s.commutes);
  const addCommute = useFavoritesStore((s) => s.addCommute);
  const updateCommute = useFavoritesStore((s) => s.updateCommute);
  const removeCommute = useFavoritesStore((s) => s.removeCommute);

  const [editingCommute, setEditingCommute] = useState<Commute | null>(null);
  const [showNewEditor, setShowNewEditor] = useState(false);

  const handleSaveNew = useCallback(
    (data: Omit<Commute, "id">) => {
      if (commutes.length >= MAX_COMMUTES) return;
      addCommute(data);
      setShowNewEditor(false);
    },
    [commutes.length, addCommute]
  );

  const handleSaveEdit = useCallback(
    (data: Omit<Commute, "id">) => {
      if (editingCommute) {
        updateCommute(editingCommute.id, data);
        setEditingCommute(null);
      }
    },
    [editingCommute, updateCommute]
  );

  const handleDelete = useCallback(() => {
    if (editingCommute) {
      removeCommute(editingCommute.id);
      setEditingCommute(null);
    }
  }, [editingCommute, removeCommute]);

  return (
    <Screen>
      <div className="px-4 pt-2 pb-4">
        {/* Saved commutes */}
        <section aria-labelledby="commutes-heading">
          <div className="flex items-center justify-between mb-3">
            <h2
              id="commutes-heading"
              className="text-lg font-semibold text-text-primary dark:text-dark-text-primary"
            >
              Saved Commutes
            </h2>
            {commutes.length > 0 && commutes.length < MAX_COMMUTES && (
              <button
                type="button"
                onClick={() => setShowNewEditor(true)}
                className="text-13 text-mta-primary font-medium min-h-touch flex items-center px-2"
                aria-label="Add new commute"
              >
                + Add
              </button>
            )}
          </div>

          {commutes.length > 0 ? (
            <div className="space-y-3">
              {commutes.map((commute) => (
                <div key={commute.id} className="relative group">
                  <CommuteCard commute={commute} />
                  {/* Edit button overlay */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingCommute(commute);
                    }}
                    className="absolute top-3 right-3 p-2 min-h-touch min-w-touch flex items-center justify-center text-text-secondary dark:text-dark-text-secondary hover:text-text-primary dark:hover:text-dark-text-primary rounded-lg opacity-60 group-hover:opacity-100 transition-opacity"
                    aria-label={`Edit ${commute.name} commute`}
                  >
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <circle cx="12" cy="12" r="1" />
                      <circle cx="19" cy="12" r="1" />
                      <circle cx="5" cy="12" r="1" />
                    </svg>
                  </button>
                </div>
              ))}
              {commutes.length >= MAX_COMMUTES && (
                <p className="text-13 text-text-secondary dark:text-dark-text-secondary text-center py-1">
                  Maximum {MAX_COMMUTES} commutes reached
                </p>
              )}
            </div>
          ) : (
            <EmptyCommutes onAdd={() => setShowNewEditor(true)} />
          )}
        </section>

        {/* Trip journal link */}
        <section className="mt-6" aria-labelledby="journal-heading">
          <h2
            id="journal-heading"
            className="text-lg font-semibold mb-4 text-text-primary dark:text-dark-text-primary"
          >
            Trip Journal
          </h2>
          <button
            type="button"
            onClick={() => void navigate("/journal")}
            className="w-full bg-surface dark:bg-dark-surface rounded-lg p-4 text-left flex items-center justify-between min-h-touch hover:bg-surface/80 dark:hover:bg-dark-surface/80 transition-colors"
            aria-label="View trip journal"
          >
            <div>
              <p className="font-medium text-text-primary dark:text-dark-text-primary">
                View Trip History
              </p>
              <p className="text-13 text-text-secondary dark:text-dark-text-secondary">
                Your commute patterns and stats
              </p>
            </div>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-text-secondary dark:text-dark-text-secondary"
              aria-hidden="true"
            >
              <polyline points="9,18 15,12 9,6" />
            </svg>
          </button>
        </section>

        {/* CommuteEditor modals */}
        {editingCommute && (
          <CommuteEditor
            commute={editingCommute}
            onSave={handleSaveEdit}
            onDelete={handleDelete}
            onClose={() => setEditingCommute(null)}
          />
        )}
        {showNewEditor && (
          <CommuteEditor onSave={handleSaveNew} onClose={() => setShowNewEditor(false)} />
        )}
      </div>
    </Screen>
  );
}

// ─── Commute Detail View ────────────────────────────────────────────────

function CommuteDetailView({ commuteId }: { commuteId: string }) {
  const navigate = useNavigate();
  const commute = useFavoritesStore((s) => s.commutes.find((c) => c.id === commuteId));

  const { data, status, error, updatedAt, refresh } = useCommute({
    originId: commute?.origin.stationId ?? null,
    destinationId: commute?.destination.stationId ?? null,
    preferredLines: commute?.preferredLines,
    commuteId,
  });

  // Get alerts for the commute's preferred lines
  const commuteLines = commute?.preferredLines ?? [];
  const { alerts: commuteAlerts } = useAlertsForStation(
    commute?.origin.stationId ?? null,
    commuteLines
  );

  // Walking comparison for short trips
  const walkComparison = useWalkComparison({
    originId: commute?.origin.stationId ?? null,
    destinationId: commute?.destination.stationId ?? null,
    analysis: data,
  });

  if (!commute) {
    return (
      <Screen>
        <div className="px-4 pt-4">
          <button
            type="button"
            onClick={() => void navigate("/commute")}
            className="flex items-center gap-1 text-mta-primary text-13 font-medium min-h-touch px-1 mb-4"
            aria-label="Back to commutes list"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
            Back to commutes
          </button>
          <p className="text-text-secondary dark:text-dark-text-secondary">Commute not found</p>
        </div>
      </Screen>
    );
  }

  return (
    <Screen>
      <div className="px-4 pt-2 pb-4">
        {/* Back navigation */}
        <button
          type="button"
          onClick={() => void navigate("/commute")}
          className="flex items-center gap-1 text-mta-primary text-13 font-medium min-h-touch px-1 mb-3"
          aria-label="Back to commutes list"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          Back
        </button>

        {/* Header */}
        <div className="mb-4">
          <h2 className="text-xl font-bold text-text-primary dark:text-dark-text-primary">
            {commute.name}
          </h2>
          <p className="text-13 text-text-secondary dark:text-dark-text-secondary">
            {commute.origin.stationName} → {commute.destination.stationName}
          </p>
          <div className="flex flex-wrap gap-1 mt-2">
            {commute.preferredLines.map((line) => (
              <span
                key={line}
                className="text-11 text-text-secondary dark:text-dark-text-secondary bg-surface dark:bg-dark-surface px-2 py-0.5 rounded-full"
                aria-label={`${line} train`}
              >
                {line}
              </span>
            ))}
          </div>
        </div>

        {/* Alert banner */}
        {commuteAlerts.length > 0 && (
          <div className="mb-4">
            <AlertBanner alerts={commuteAlerts} title="Service Alerts" maxVisible={2} />
          </div>
        )}

        {/* Analysis */}
        <DataState
          status={status}
          data={data}
          error={error ?? "Couldn't load commute analysis"}
          skeleton={<CommuteCardSkeleton count={2} />}
          staleTimestamp={updatedAt}
          onRetry={refresh}
        >
          {(commuteData) => (
            <div className="space-y-4">
              {/* Walking comparison for short trips */}
              <WalkComparison comparison={walkComparison} />

              {/* Route comparison (if both types exist) */}
              {commuteData.directRoutes.length > 0 && commuteData.transferRoutes.length > 0 && (
                <RouteComparison analysis={commuteData} />
              )}

              {/* Full detail breakdown */}
              <TransferDetail analysis={commuteData} />
            </div>
          )}
        </DataState>
      </div>
    </Screen>
  );
}
