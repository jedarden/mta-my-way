/**
 * FavoritesList - Ordered list of FavoriteCards with drag-to-reorder.
 *
 * Uses HTML5 drag-and-drop (works on desktop and Android Chrome).
 * Each card shows a drag handle on the left for touch/mouse users.
 * Pinned favorites appear at the top with a visual indicator.
 */

import type { Favorite } from "@mta-my-way/shared";
import { useState } from "react";
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

  return (
    <ul className="space-y-3" aria-label="Favorite stations">
      {favorites.map((favorite, index) => {
        const isDragging = draggedIndex === index;
        const isDragTarget = dragOverIndex === index && draggedIndex !== index;

        return (
          <li
            key={favorite.id}
            draggable
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={() => handleDrop(index)}
            onDragEnd={handleDragEnd}
            className={[
              "relative transition-all duration-150",
              isDragging ? "opacity-40 scale-[0.98]" : "",
              isDragTarget ? "ring-2 ring-mta-primary rounded-lg translate-y-[-2px]" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-label={`${favorite.stationName}${favorite.pinned ? ", pinned" : ""}`}
          >
            {/* Pinned indicator */}
            {favorite.pinned && (
              <div
                className="absolute -top-1 -right-1 z-10 w-3 h-3 bg-mta-primary rounded-full"
                aria-label="Pinned"
              />
            )}

            {/* Drag handle overlay (visible on hover) */}
            <div className="flex items-stretch gap-0">
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
                  {/* Two vertical dots columns (grip icon) */}
                  <circle cx="3" cy="4" r="1.5" />
                  <circle cx="9" cy="4" r="1.5" />
                  <circle cx="3" cy="10" r="1.5" />
                  <circle cx="9" cy="10" r="1.5" />
                  <circle cx="3" cy="16" r="1.5" />
                  <circle cx="9" cy="16" r="1.5" />
                </svg>
              </div>

              <div className="flex-1 min-w-0">
                <FavoriteCard favorite={favorite} forceRefreshId={forceRefreshId} onEdit={onEdit} />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default FavoritesList;
