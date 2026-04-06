/**
 * CommuteEditor - Bottom-sheet modal for creating or editing a saved commute.
 *
 * Fields:
 *   - Name (e.g., "Work", "Home")
 *   - Origin station (via StationPicker)
 *   - Destination station (via StationPicker)
 *   - Preferred lines (multi-select from lines at origin)
 *   - Enable transfer suggestions toggle
 *
 * Saves via Zustand's favoritesStore. StationPicker overlays at z-[60]/z-[70].
 */

import type { Commute, StationRef } from "@mta-my-way/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStationIndex } from "../../hooks/useStationIndex";
import { LineBullet } from "../arrivals/LineBullet";
import { StationPicker } from "./StationPicker";

interface CommuteEditorProps {
  /** Existing commute to edit, or undefined to create a new one */
  commute?: Commute;
  onSave: (data: Omit<Commute, "id">) => void;
  onDelete?: () => void;
  onClose: () => void;
}

type PickerMode = "origin" | "destination" | null;

export function CommuteEditor({ commute, onSave, onDelete, onClose }: CommuteEditorProps) {
  const [name, setName] = useState(commute?.name ?? "");
  const [origin, setOrigin] = useState<StationRef | null>(commute?.origin ?? null);
  const [destination, setDestination] = useState<StationRef | null>(commute?.destination ?? null);
  const [preferredLines, setPreferredLines] = useState<Set<string>>(
    new Set(commute?.preferredLines ?? [])
  );
  const [enableTransfer, setEnableTransfer] = useState(commute?.enableTransferSuggestions ?? true);
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Focus management: save previous focus, focus dialog on open, restore on close
  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement;
    const dialog = dialogRef.current;
    if (dialog) {
      const firstFocusable = dialog.querySelector<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
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
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
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

  const { stations } = useStationIndex();

  // Lines available at the origin station
  const originLines = useMemo(() => {
    if (!origin) return [];
    const station = stations.find((s) => s.id === origin.stationId);
    return station?.lines ?? [];
  }, [origin, stations]);

  const toggleLine = useCallback((line: string) => {
    setPreferredLines((prev) => {
      const next = new Set(prev);
      if (next.has(line)) {
        next.delete(line);
      } else {
        next.add(line);
      }
      return next;
    });
  }, []);

  const handleSelectOrigin = useCallback((station: StationRef) => {
    setOrigin(station);
    // Clear preferred lines when origin changes — they may no longer be valid
    setPreferredLines(new Set());
  }, []);

  const handleSave = () => {
    if (!origin || !destination || !name.trim()) return;
    onSave({
      name: name.trim(),
      origin,
      destination,
      preferredLines: Array.from(preferredLines),
      enableTransferSuggestions: enableTransfer,
    });
  };

  const canSave = !!origin && !!destination && name.trim().length > 0;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} aria-hidden="true" />

      {/* Bottom sheet */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={commute ? "Edit commute" : "New commute"}
        onKeyDown={handleDialogKeyDown}
        className="fixed bottom-0 left-0 right-0 z-50 bg-background dark:bg-dark-background rounded-t-2xl shadow-lg max-h-[90dvh] flex flex-col pb-[env(safe-area-inset-bottom)]"
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-surface dark:bg-dark-surface" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 shrink-0">
          <h2 className="text-lg font-semibold text-text-primary dark:text-dark-text-primary">
            {commute ? "Edit Commute" : "New Commute"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 min-h-touch min-w-touch flex items-center justify-center text-text-secondary dark:text-dark-text-secondary hover:text-text-primary dark:hover:text-dark-text-primary rounded-lg"
            aria-label="Close"
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

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-5">
          {/* Name */}
          <div>
            <label
              htmlFor="commute-name"
              className="block text-13 font-medium text-text-secondary dark:text-dark-text-secondary mb-1.5"
            >
              Name
            </label>
            <input
              id="commute-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Work, Home, Gym..."
              maxLength={30}
              className="w-full px-3 py-3 bg-surface dark:bg-dark-surface rounded-lg text-text-primary dark:text-dark-text-primary placeholder:text-text-secondary dark:placeholder:text-dark-text-secondary min-h-touch focus:outline-none focus:ring-2 focus:ring-mta-primary"
            />
          </div>

          {/* Origin */}
          <div>
            <p className="text-13 font-medium text-text-secondary dark:text-dark-text-secondary mb-1.5">
              From
            </p>
            <button
              type="button"
              onClick={() => setPickerMode("origin")}
              className="w-full px-3 py-3 bg-surface dark:bg-dark-surface rounded-lg text-left min-h-touch focus:outline-none focus:ring-2 focus:ring-mta-primary flex items-center justify-between"
              aria-label={origin ? `Change origin: ${origin.stationName}` : "Pick origin station"}
            >
              <span
                className={
                  origin
                    ? "text-text-primary dark:text-dark-text-primary font-medium"
                    : "text-text-secondary dark:text-dark-text-secondary"
                }
              >
                {origin ? origin.stationName : "Pick a station..."}
              </span>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-text-secondary dark:text-dark-text-secondary shrink-0"
                aria-hidden="true"
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>

          {/* Destination */}
          <div>
            <p className="text-13 font-medium text-text-secondary dark:text-dark-text-secondary mb-1.5">
              To
            </p>
            <button
              type="button"
              onClick={() => setPickerMode("destination")}
              className="w-full px-3 py-3 bg-surface dark:bg-dark-surface rounded-lg text-left min-h-touch focus:outline-none focus:ring-2 focus:ring-mta-primary flex items-center justify-between"
              aria-label={
                destination
                  ? `Change destination: ${destination.stationName}`
                  : "Pick destination station"
              }
            >
              <span
                className={
                  destination
                    ? "text-text-primary dark:text-dark-text-primary font-medium"
                    : "text-text-secondary dark:text-dark-text-secondary"
                }
              >
                {destination ? destination.stationName : "Pick a station..."}
              </span>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-text-secondary dark:text-dark-text-secondary shrink-0"
                aria-hidden="true"
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>

          {/* Preferred lines — shown after origin is set */}
          {originLines.length > 0 && (
            <div>
              <p className="text-13 font-medium text-text-secondary dark:text-dark-text-secondary mb-2">
                Preferred lines{" "}
                <span className="font-normal text-text-secondary dark:text-dark-text-secondary">
                  (optional)
                </span>
              </p>
              <div
                role="group"
                aria-describedby="preferred-lines-help"
                className="flex flex-wrap gap-3"
              >
                {originLines.map((line) => {
                  const selected = preferredLines.has(line);
                  return (
                    <button
                      key={line}
                      type="button"
                      onClick={() => toggleLine(line)}
                      className={["relative transition-all", !selected ? "opacity-40 scale-90" : ""]
                        .filter(Boolean)
                        .join(" ")}
                      aria-pressed={selected}
                      aria-label={`${selected ? "Remove" : "Add"} ${line} train preference`}
                    >
                      <LineBullet line={line} size="lg" />
                    </button>
                  );
                })}
              </div>
              <p
                id="preferred-lines-help"
                className="text-11 text-text-secondary dark:text-dark-text-secondary mt-1.5"
              >
                Leave empty to consider all available lines
              </p>
            </div>
          )}

          {/* Transfer suggestions toggle */}
          <label className="flex items-center gap-3 px-3 py-3 bg-surface dark:bg-dark-surface rounded-lg cursor-pointer min-h-touch">
            <div className="flex-1">
              <p className="text-base text-text-primary dark:text-dark-text-primary font-medium">
                Transfer suggestions
              </p>
              <p className="text-13 text-text-secondary dark:text-dark-text-secondary">
                Show transfer routes that save time
              </p>
            </div>
            <input
              type="checkbox"
              checked={enableTransfer}
              onChange={(e) => setEnableTransfer(e.target.checked)}
              className="accent-mta-primary w-5 h-5 shrink-0"
              aria-label="Enable transfer suggestions"
            />
          </label>
        </div>

        {/* Actions */}
        <div className="px-4 pt-2 pb-4 shrink-0 space-y-2 border-t border-surface dark:border-dark-surface">
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="w-full py-3 bg-mta-primary text-white rounded-lg font-semibold text-base min-h-touch disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            {commute ? "Save changes" : "Add commute"}
          </button>

          {onDelete &&
            (confirmDelete ? (
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
                  onClick={onDelete}
                  className="flex-1 py-3 bg-severe text-white rounded-lg font-medium min-h-touch"
                >
                  Remove
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="w-full py-3 text-severe font-medium text-base min-h-touch"
              >
                Remove commute
              </button>
            ))}
        </div>
      </div>

      {/* Station picker — layered above the editor */}
      {pickerMode && (
        <StationPicker
          title={pickerMode === "origin" ? "Pick origin station" : "Pick destination station"}
          onSelect={pickerMode === "origin" ? handleSelectOrigin : setDestination}
          onClose={() => setPickerMode(null)}
        />
      )}
    </>
  );
}

export default CommuteEditor;
