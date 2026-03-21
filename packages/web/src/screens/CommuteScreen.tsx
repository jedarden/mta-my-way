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
import { CommuteCard } from "../components/commute/CommuteCard";
import { CommuteEditor } from "../components/commute/CommuteEditor";
import { RouteComparison } from "../components/commute/RouteComparison";
import { TransferDetail } from "../components/commute/TransferDetail";
import { AlertBanner } from "../components/alerts";
import Screen from "../components/layout/Screen";
import { useCommute } from "../hooks/useCommute";
import { useAlertsForStation } from "../hooks/useAlerts";
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
            <EmptyCommutesState onAdd={() => setShowNewEditor(true)} />
          )}
        </section>

        {/* Trip journal placeholder (Phase 5) */}
        <section className="mt-6" aria-labelledby="journal-heading">
          <h2
            id="journal-heading"
            className="text-lg font-semibold mb-4 text-text-primary dark:text-dark-text-primary"
          >
            Trip Journal
          </h2>
          <div className="bg-surface dark:bg-dark-surface rounded-lg p-6 text-center">
            <p className="text-text-secondary dark:text-dark-text-secondary">
              Your trip history will appear here
            </p>
          </div>
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
          <CommuteEditor
            onSave={handleSaveNew}
            onClose={() => setShowNewEditor(false)}
          />
        )}
      </div>
    </Screen>
  );
}

// ─── Commute Detail View ────────────────────────────────────────────────

function CommuteDetailView({ commuteId }: { commuteId: string }) {
  const navigate = useNavigate();
  const commute = useFavoritesStore((s) =>
    s.commutes.find((c) => c.id === commuteId)
  );

  const { data, status, refresh } = useCommute({
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

  const isLoading = status === "loading" && !data;

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
          <p className="text-text-secondary dark:text-dark-text-secondary">
            Commute not found
          </p>
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
              >
                {line}
              </span>
            ))}
          </div>
        </div>

        {/* Alert banner */}
        {commuteAlerts.length > 0 && (
          <div className="mb-4">
            <AlertBanner
              alerts={commuteAlerts}
              title="Service Alerts"
              maxVisible={2}
            />
          </div>
        )}

        {/* Analysis */}
        {isLoading ? (
          <DetailSkeleton />
        ) : data ? (
          <div className="space-y-4">
            {/* Route comparison (if both types exist) */}
            {data.directRoutes.length > 0 && data.transferRoutes.length > 0 && (
              <RouteComparison analysis={data} />
            )}

            {/* Full detail breakdown */}
            <TransferDetail analysis={data} />
          </div>
        ) : status === "error" ? (
          <div className="bg-surface dark:bg-dark-surface rounded-lg p-6 text-center">
            <p className="text-text-secondary dark:text-dark-text-secondary mb-3">
              Couldn't load commute analysis
            </p>
            <button
              type="button"
              onClick={refresh}
              className="inline-flex items-center justify-center px-5 py-3 bg-mta-primary text-white rounded-lg font-medium min-h-touch"
            >
              Retry
            </button>
          </div>
        ) : null}
      </div>
    </Screen>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────

function EmptyCommutesState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="bg-surface dark:bg-dark-surface rounded-lg p-6 text-center">
      <p className="text-text-secondary dark:text-dark-text-secondary mb-1 text-base">
        No commutes configured
      </p>
      <p className="text-13 text-text-secondary dark:text-dark-text-secondary mb-4">
        Add a commute to see transfer analysis and route comparisons
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex items-center justify-center px-4 py-3 bg-mta-primary text-white rounded-lg font-medium min-h-touch hover:opacity-90 transition-opacity"
      >
        Plan a commute
      </button>
    </div>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────

function DetailSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading commute analysis">
      <div className="h-20 rounded-lg animate-pulse bg-surface dark:bg-dark-surface" />
      <div className="h-40 rounded-lg animate-pulse bg-surface dark:bg-dark-surface" />
      <div className="h-16 rounded-lg animate-pulse bg-surface dark:bg-dark-surface" />
    </div>
  );
}
