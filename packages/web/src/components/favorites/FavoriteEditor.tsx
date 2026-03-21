/**
 * FavoriteEditor - Bottom-sheet modal for configuring a favorite.
 *
 * Allows the user to:
 *   - Set a custom label (optional)
 *   - Toggle which lines to show (from the configured line set)
 *   - Set direction preference (N, S, or both)
 *   - Delete the favorite
 *
 * The editor fetches station data to show all available lines.
 * Falls back to favorite.lines if the station can't be loaded.
 */

import type { DirectionPreference, Favorite } from "@mta-my-way/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";
import { LineBullet } from "../arrivals/LineBullet";

interface FavoriteEditorProps {
  favorite: Favorite;
  onSave: (updates: Partial<Favorite>) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function FavoriteEditor({ favorite, onSave, onDelete, onClose }: FavoriteEditorProps) {
  const [label, setLabel] = useState(favorite.label ?? "");
  const [selectedLines, setSelectedLines] = useState<Set<string>>(new Set(favorite.lines));
  const [direction, setDirection] = useState<DirectionPreference>(favorite.direction);
  const [allLines, setAllLines] = useState<string[]>(favorite.lines);
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

  // Fetch full station data to show all available lines
  useEffect(() => {
    api.getStation(favorite.stationId).then(
      (station) => {
        setAllLines(station.lines);
        // Keep existing selected lines, plus new station lines stay unselected
        // (user explicitly chose the current set)
      },
      () => {
        // Fall back to favorite.lines on error
      }
    );
  }, [favorite.stationId]);

  const toggleLine = useCallback((line: string) => {
    setSelectedLines((prev) => {
      const next = new Set(prev);
      if (next.has(line)) {
        // Don't allow deselecting the last line
        if (next.size <= 1) return prev;
        next.delete(line);
      } else {
        next.add(line);
      }
      return next;
    });
  }, []);

  const handleSave = () => {
    const lines = Array.from(selectedLines);
    onSave({
      label: label.trim() || undefined,
      lines,
      direction,
    });
  };

  const directionOptions: { value: DirectionPreference; label: string }[] = [
    { value: "N", label: "Uptown / Bronx-bound" },
    { value: "S", label: "Downtown / Brooklyn-bound" },
    { value: "both", label: "Both directions" },
  ];

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} aria-hidden="true" />

      {/* Bottom sheet */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Edit ${favorite.stationName}`}
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
            {favorite.stationName}
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

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-5">
          {/* Label */}
          <div>
            <label
              htmlFor="fav-label"
              className="block text-13 font-medium text-text-secondary dark:text-dark-text-secondary mb-1.5"
            >
              Custom label (optional)
            </label>
            <input
              id="fav-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={favorite.stationName}
              maxLength={40}
              className="w-full px-3 py-3 bg-surface dark:bg-dark-surface rounded-lg text-text-primary dark:text-dark-text-primary placeholder:text-text-secondary dark:placeholder:text-dark-text-secondary min-h-touch focus:outline-none focus:ring-2 focus:ring-mta-primary"
            />
          </div>

          {/* Lines */}
          <div>
            <p className="text-13 font-medium text-text-secondary dark:text-dark-text-secondary mb-2">
              Show lines
            </p>
            <div className="flex flex-wrap gap-3">
              {allLines.map((line) => {
                const selected = selectedLines.has(line);
                return (
                  <button
                    key={line}
                    type="button"
                    onClick={() => toggleLine(line)}
                    className={["relative transition-all", !selected ? "opacity-40 scale-90" : ""]
                      .filter(Boolean)
                      .join(" ")}
                    aria-pressed={selected}
                    aria-label={`${selected ? "Hide" : "Show"} ${line} train`}
                  >
                    <LineBullet line={line} size="lg" />
                    {selected && (
                      <span
                        className="absolute -top-1 -right-1 w-4 h-4 bg-background dark:bg-dark-background rounded-full flex items-center justify-center"
                        aria-hidden="true"
                      >
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                          <path
                            d="M2 6l3 3 5-5"
                            stroke="#00933C"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="text-11 text-text-secondary dark:text-dark-text-secondary mt-1.5">
              At least one line must be selected
            </p>
          </div>

          {/* Direction */}
          <div>
            <p className="text-13 font-medium text-text-secondary dark:text-dark-text-secondary mb-2">
              Direction
            </p>
            <div className="space-y-2">
              {directionOptions.map((opt) => (
                <label
                  key={opt.value}
                  className={[
                    "flex items-center gap-3 px-3 py-3 rounded-lg cursor-pointer min-h-touch",
                    direction === opt.value
                      ? "bg-mta-primary/10 ring-1 ring-mta-primary"
                      : "bg-surface dark:bg-dark-surface",
                  ].join(" ")}
                >
                  <input
                    type="radio"
                    name="direction"
                    value={opt.value}
                    checked={direction === opt.value}
                    onChange={() => setDirection(opt.value)}
                    className="accent-mta-primary"
                  />
                  <span className="text-base text-text-primary dark:text-dark-text-primary">
                    {opt.label}
                  </span>
                </label>
              ))}
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
              Remove from favorites
            </button>
          )}
        </div>
      </div>
    </>
  );
}

export default FavoriteEditor;
