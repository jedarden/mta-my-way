/**
 * FavoritesList - Ordered list of FavoriteCards with drag-to-reorder.
 *
 * Uses HTML5 drag-and-drop (works on desktop and Android Chrome).
 * Each card shows a drag handle on the left for touch/mouse users.
 * Keyboard users can reorder with Alt+Up/Down arrow keys.
 * Pinned favorites appear at the top with a visual indicator.
 */

import type { Favorite } from "@mta-my-way/shared";
import { useCallback, useRef, useState } from "react";
import { FavoriteCard } from "./FavoriteCard";

interface FavoritesListProps {
  favorites: Favorite[];
  forceRefreshId?: number;
  onEdit: (favorite: Favorite) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}

export function FavoritesList({
  favorites,
  forceRefreshId,
  onEdit,
  onReorder,
}: FavoritesListProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const liveRef = useRef<HTMLDivElement>(null);

  const announcePosition = useCallback((name: string, position: number, total: number) => {
    if (liveRef.current) {
      liveRef.current.textContent = `${name} moved to position ${position} of ${total}`;
    }
  }, []);

  function handleDragStart(index: number) {
    setDraggedIndex(index);
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  }

  function handleDrop(index: number) {
    if (draggedIndex !== null && draggedIndex !== index) {
      onReorder(draggedIndex, index);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  }

  function handleDragEnd() {
    setDraggedIndex(null);
    setDragOverIndex(null);
  }

  function handleItemKeyDown(e: React.KeyboardEvent, index: number) {
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      const direction = e.key === "ArrowUp" ? -1 : 1;
      const newIndex = index + direction;
      if (newIndex < 0 || newIndex >= favorites.length) return;

      const name = favorites[index]?.stationName ?? "";
      onReorder(index, newIndex);
      announcePosition(name, newIndex + 1, favorites.length);
    }
  }

  return (
    <>
      <ul className="space-y-3" aria-label="Favorite stations" role="list">
        {favorites.map((favorite, index) => {
          const isDragging = draggedIndex === index;
          const isDragTarget = dragOverIndex === index && draggedIndex !== index;
          const canMoveUp = index > 0;
          const canMoveDown = index < favorites.length - 1;

          return (
            <li
              key={favorite.id}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={() => handleDrop(index)}
              onDragEnd={handleDragEnd}
              onKeyDown={(e) => handleItemKeyDown(e, index)}
              aria-roledescription="sortable item"
              aria-label={`${favorite.stationName}, position ${index + 1} of ${favorites.length}${favorite.pinned ? ", pinned" : ""}`}
              className={[
                "relative transition-all duration-150",
                isDragging ? "opacity-40 scale-[0.98]" : "",
                isDragTarget ? "ring-2 ring-mta-primary rounded-lg translate-y-[-2px]" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {/* Pinned indicator */}
              {favorite.pinned && (
                <div
                  className="absolute -top-1 -right-1 z-10 w-3 h-3 bg-mta-primary rounded-full"
                  aria-hidden="true"
                />
              )}

              <div className="flex items-stretch gap-0">
                {/* Drag handle (mouse/touch) */}
                <div
                  className="flex items-center justify-center w-6 opacity-30 cursor-grab active:cursor-grabbing select-none touch-none"
                  aria-hidden="true"
                >
                  <svg
                    width="12"
                    height="20"
                    viewBox="0 0 12 20"
                    fill="currentColor"
                    className="text-text-secondary"
                  >
                    <circle cx="3" cy="4" r="1.5" />
                    <circle cx="9" cy="4" r="1.5" />
                    <circle cx="3" cy="10" r="1.5" />
                    <circle cx="9" cy="10" r="1.5" />
                    <circle cx="3" cy="16" r="1.5" />
                    <circle cx="9" cy="16" r="1.5" />
                  </svg>
                </div>

                {/* Keyboard reorder buttons (screen reader visible) */}
                <div className="flex flex-col justify-center gap-0.5 sr-only focus-within:not-sr-only focus-within:absolute focus-within:right-1 focus-within:top-1/2 focus-within:-translate-y-1/2 focus-within:opacity-100 focus-within:z-20">
                  <button
                    type="button"
                    aria-label={`Move ${favorite.stationName} up`}
                    disabled={!canMoveUp}
                    onClick={() => {
                      onReorder(index, index - 1);
                      announcePosition(favorite.stationName, index, favorites.length);
                    }}
                    className="p-1 rounded bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-600 disabled:opacity-30"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                      <path d="M6 2L10 8H2L6 2Z" fill="currentColor" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${favorite.stationName} down`}
                    disabled={!canMoveDown}
                    onClick={() => {
                      onReorder(index, index + 1);
                      announcePosition(favorite.stationName, index + 2, favorites.length);
                    }}
                    className="p-1 rounded bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-600 disabled:opacity-30"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                      <path d="M6 10L2 4H10L6 10Z" fill="currentColor" />
                    </svg>
                  </button>
                </div>

                <div className="flex-1 min-w-0">
                  <FavoriteCard
                    favorite={favorite}
                    forceRefreshId={forceRefreshId}
                    onEdit={onEdit}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Live region for reorder announcements */}
      <div ref={liveRef} className="sr-only" aria-live="polite" aria-atomic="true" />
    </>
  );
}

export default FavoritesList;
