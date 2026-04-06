/**
 * TripRecordEditor - Modal for editing a trip record.
 *
 * Allows the user to:
 *   - Set scheduled duration (for delay calculation)
 *   - Add or edit notes about the trip
 *   - Delete the trip record
 */

import type { TripRecord } from "@mta-my-way/shared";
import { useCallback, useEffect, useRef, useState } from "react";

interface TripRecordEditorProps {
  trip: TripRecord;
  commuteId: string;
  onSave: (commuteId: string, recordId: string, updates: Partial<TripRecord>) => void;
  onDelete: (commuteId: string, recordId: string) => void;
  onClose: () => void;
}

export function TripRecordEditor({
  trip,
  commuteId,
  onSave,
  onDelete,
  onClose,
}: TripRecordEditorProps) {
  const [scheduledDuration, setScheduledDuration] = useState(
    trip.scheduledDurationMinutes?.toString() ?? ""
  );
  const [notes, setNotes] = useState(trip.notes ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Focus management: save previous focus, focus dialog on open, restore on close
  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement;
    const dialog = dialogRef.current;
    if (dialog) {
      const firstFocusable = dialog.querySelector<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      firstFocusable?.focus();
    }
    return () => {
      previousFocusRef.current?.focus();
    };
  }, []);

  // Focus trap: keep Tab/Shift+Tab inside the dialog; Escape closes
  const handleDialogKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [onClose]
  );

  const handleSave = () => {
    const updates: Partial<TripRecord> = {
      notes: notes.trim() || undefined,
    };

    if (scheduledDuration.trim()) {
      const duration = Number.parseFloat(scheduledDuration);
      if (!Number.isNaN(duration) && duration > 0) {
        updates.scheduledDurationMinutes = duration;
      }
    } else {
      updates.scheduledDurationMinutes = undefined;
    }

    onSave(commuteId, trip.id, updates);
  };

  const handleDelete = () => {
    onDelete(commuteId, trip.id);
  };

  // Calculate delay if scheduled duration is set
  const delayMinutes = trip.scheduledDurationMinutes
    ? Math.round((trip.actualDurationMinutes - trip.scheduledDurationMinutes) * 10) / 10
    : null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} aria-hidden="true" />

      {/* Bottom sheet */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Edit trip from ${trip.origin.stationName} to ${trip.destination.stationName}`}
        onKeyDown={handleDialogKeyDown}
        className="fixed bottom-0 left-0 right-0 z-50 bg-background dark:bg-dark-background rounded-t-2xl shadow-lg max-h-[85dvh] flex flex-col pb-[env(safe-area-inset-bottom)]"
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-surface dark:bg-dark-surface" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 shrink-0">
          <h2 className="text-lg font-semibold text-text-primary dark:text-dark-text-primary truncate">
            Edit Trip
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 min-h-touch min-w-touch flex items-center justify-center text-text-secondary dark:text-dark-text-secondary"
            aria-label="Close editor"
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
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Trip summary */}
        <div className="px-4 pb-3 border-b border-surface dark:border-dark-surface">
          <p className="text-sm text-text-primary dark:text-dark-text-primary">
            {trip.origin.stationName} → {trip.destination.stationName}
          </p>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-13 text-text-secondary dark:text-dark-text-secondary">
              {trip.actualDurationMinutes} min actual
            </span>
            {delayMinutes !== null && (
              <span
                className={`text-13 font-medium ${
                  delayMinutes > 5
                    ? "text-severe"
                    : delayMinutes > 2
                      ? "text-warning"
                      : delayMinutes < -2
                        ? "text-mta-primary"
                        : "text-text-secondary dark:text-dark-text-secondary"
                }`}
              >
                {delayMinutes > 0 ? "+" : ""}
                {delayMinutes} min
              </span>
            )}
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-5">
          {/* Scheduled duration */}
          <div>
            <label
              htmlFor="scheduled-duration"
              className="block text-13 font-medium text-text-secondary dark:text-dark-text-secondary mb-1.5"
            >
              Scheduled duration (minutes)
            </label>
            <input
              id="scheduled-duration"
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              value={scheduledDuration}
              onChange={(e) => setScheduledDuration(e.target.value)}
              placeholder="e.g., 25"
              aria-describedby="scheduled-duration-help"
              className="w-full px-3 py-3 bg-surface dark:bg-dark-surface rounded-lg text-text-primary dark:text-dark-text-primary placeholder:text-text-secondary dark:placeholder:text-dark-text-secondary min-h-touch focus:outline-none focus:ring-2 focus:ring-mta-primary"
            />
            <p id="scheduled-duration-help" className="text-11 text-text-secondary dark:text-dark-text-secondary mt-1.5">
              Set this to compare actual vs. scheduled time
            </p>
          </div>

          {/* Notes */}
          <div>
            <label
              htmlFor="trip-notes"
              className="block text-13 font-medium text-text-secondary dark:text-dark-text-secondary mb-1.5"
            >
              Notes (optional)
            </label>
            <textarea
              id="trip-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., Crowded train, signal delay at 14th St..."
              rows={4}
              maxLength={500}
              aria-describedby="trip-notes-help trip-notes-counter"
              className="w-full px-3 py-3 bg-surface dark:bg-dark-surface rounded-lg text-text-primary dark:text-dark-text-primary placeholder:text-text-secondary dark:placeholder:text-dark-text-secondary focus:outline-none focus:ring-2 focus:ring-mta-primary resize-none"
            />
            <div className="flex justify-between items-center mt-1.5">
              <p id="trip-notes-help" className="text-11 text-text-secondary dark:text-dark-text-secondary">
                Add any notes about this trip
              </p>
              <span id="trip-notes-counter" className="text-11 text-text-secondary dark:text-dark-text-secondary">
                {notes.length}/500
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="px-4 pt-2 pb-4 shrink-0 space-y-2 border-t border-surface dark:border-dark-surface">
          <button
            type="button"
            onClick={handleSave}
            className="w-full py-3 bg-mta-primary text-white rounded-lg font-semibold text-base min-h-touch"
          >
            Save
          </button>

          {confirmDelete ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="flex-1 py-3 bg-surface dark:bg-dark-surface text-text-primary dark:text-dark-text-primary rounded-lg font-medium min-h-touch"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="flex-1 py-3 bg-severe text-white rounded-lg font-medium min-h-touch"
              >
                Delete
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="w-full py-3 text-severe font-medium text-base min-h-touch"
            >
              Delete trip
            </button>
          )}
        </div>
      </div>
    </>
  );
}

export default TripRecordEditor;
