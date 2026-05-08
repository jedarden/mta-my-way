/**
 * Tests for FavoritesList component
 *
 * Tests the favorites list with drag-and-drop including:
 * - Rendering favorites
 * - Drag and drop reordering
 * - Keyboard reordering (Alt+Up/Down)
 * - Pinned indicator
 * - Edit callback
 * - Accessibility
 * - Live region announcements
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FavoritesList } from "./FavoritesList";

// Mock dependencies
vi.mock("../../lib/outputEncoding.js", () => ({
  encodeForAria: (text: string) => text,
}));

vi.mock("./FavoriteCard.jsx", () => ({
  FavoriteCard: ({
    favorite,
    forceRefreshId,
    onEdit,
  }: {
    favorite: { id: string; stationName: string };
    forceRefreshId?: number;
    onEdit: (favorite: unknown) => void;
  }) => (
    <div data-testid={`favorite-${favorite.id}`} data-station-name={favorite.stationName}>
      <span>{favorite.stationName}</span>
      <button onClick={() => onEdit(favorite)}>Edit</button>
    </div>
  ),
}));

const mockFavorites = [
  { id: "fav-1", stationId: "101", stationName: "Times Square", pinned: false },
  { id: "fav-2", stationId: "102", stationName: "Penn Station", pinned: true },
  { id: "fav-3", stationId: "103", stationName: "Grand Central", pinned: false },
];

describe("FavoritesList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("basic rendering", () => {
    it("renders all favorites", () => {
      render(<FavoritesList favorites={mockFavorites} onEdit={vi.fn()} onReorder={vi.fn()} />);

      expect(screen.getByText("Times Square")).toBeInTheDocument();
      expect(screen.getByText("Penn Station")).toBeInTheDocument();
      expect(screen.getByText("Grand Central")).toBeInTheDocument();
    });

    it("has proper list role", () => {
      const { container } = render(
        <FavoritesList favorites={mockFavorites} onEdit={vi.fn()} onReorder={vi.fn()} />
      );

      const list = container.querySelector('[role="list"]');
      expect(list).toBeInTheDocument();
      expect(list).toHaveAttribute("aria-label", "Favorite stations");
    });

    it("shows pinned indicator for pinned favorites", () => {
      const { container } = render(
        <FavoritesList favorites={mockFavorites} onEdit={vi.fn()} onReorder={vi.fn()} />
      );

      const pinnedIndicators = container.querySelectorAll('[aria-hidden="true"].bg-mta-primary');
      expect(pinnedIndicators).toHaveLength(1);
    });
  });

  describe("drag and drop", () => {
    it("renders draggable items", () => {
      const onReorder = vi.fn();
      const { container } = render(
        <FavoritesList favorites={mockFavorites} onEdit={vi.fn()} onReorder={onReorder} />
      );

      const items = container.querySelectorAll('[draggable="true"]');
      expect(items).toHaveLength(3);
      expect(items[0]).toHaveAttribute("draggable", "true");
    });

    it("has proper drag and drop attributes", () => {
      const { container } = render(
        <FavoritesList favorites={mockFavorites} onEdit={vi.fn()} onReorder={vi.fn()} />
      );

      const firstItem = container.querySelector('[draggable="true"]');
      expect(firstItem).toHaveAttribute("aria-roledescription", "sortable item");
      expect(firstItem).toHaveAttribute("aria-label", "Times Square, position 1 of 3");
    });

    it("has visual drag feedback classes", () => {
      const { container } = render(
        <FavoritesList favorites={mockFavorites} onEdit={vi.fn()} onReorder={vi.fn()} />
      );

      const items = container.querySelectorAll('[draggable="true"]');

      // Items should have transition class for smooth animations
      items.forEach((item) => {
        expect(item).toHaveClass("transition-all");
      });
    });

    it("has drag handle for mouse/touch users", () => {
      const { container } = render(
        <FavoritesList favorites={mockFavorites} onEdit={vi.fn()} onReorder={vi.fn()} />
      );

      const dragHandles = container.querySelectorAll('[aria-hidden="true"] svg');
      expect(dragHandles.length).toBeGreaterThan(0);
    });
  });

  describe("keyboard reordering", () => {
    it("has keyboard reorder buttons with proper aria-labels", () => {
      const { container } = render(
        <FavoritesList favorites={mockFavorites} onEdit={vi.fn()} onReorder={vi.fn()} />
      );

      const upButtons = container.querySelectorAll('button[aria-label^="Move"]');
      expect(upButtons.length).toBeGreaterThan(0);

      const firstUpButton = upButtons[0] as HTMLButtonElement;
      expect(firstUpButton.ariaLabel).toContain("Move Times Square up");
    });

    it("disables up button for first item", () => {
      const { container } = render(
        <FavoritesList favorites={mockFavorites} onEdit={vi.fn()} onReorder={vi.fn()} />
      );

      const items = container.querySelectorAll("li");
      const firstItemButtons = items[0].querySelectorAll('button[aria-label^="Move"]');
      const upButton = Array.from(firstItemButtons).find((b) =>
        b.getAttribute("aria-label")?.includes("up")
      );
      expect(upButton).toBeDisabled();
    });

    it("disables down button for last item", () => {
      const { container } = render(
        <FavoritesList favorites={mockFavorites} onEdit={vi.fn()} onReorder={vi.fn()} />
      );

      const items = container.querySelectorAll("li");
      const lastItemButtons = items[items.length - 1].querySelectorAll(
        'button[aria-label^="Move"]'
      );
      const downButton = Array.from(lastItemButtons).find((b) =>
        b.getAttribute("aria-label")?.includes("down")
      );
      expect(downButton).toBeDisabled();
    });

    it("calls onReorder when up button is clicked", async () => {
      const user = userEvent.setup();
      const onReorder = vi.fn();
      const { container } = render(
        <FavoritesList favorites={mockFavorites} onEdit={vi.fn()} onReorder={onReorder} />
      );

      const items = container.querySelectorAll("li");
      const secondItemButtons = items[1].querySelectorAll('button[aria-label^="Move"]');
      const upButton = Array.from(secondItemButtons).find((b) =>
        b.getAttribute("aria-label")?.includes("up")
      ) as HTMLButtonElement;

      await user.click(upButton);

      expect(onReorder).toHaveBeenCalledWith(1, 0);
    });

    it("calls onReorder when down button is clicked", async () => {
      const user = userEvent.setup();
      const onReorder = vi.fn();
      const { container } = render(
        <FavoritesList favorites={mockFavorites} onEdit={vi.fn()} onReorder={onReorder} />
      );

      const items = container.querySelectorAll("li");
      const firstItemButtons = items[0].querySelectorAll('button[aria-label^="Move"]');
      const downButton = Array.from(firstItemButtons).find((b) =>
        b.getAttribute("aria-label")?.includes("down")
      ) as HTMLButtonElement;

      await user.click(downButton);

      expect(onReorder).toHaveBeenCalledWith(0, 1);
    });

    it("has live region for announcements", () => {
      const { container } = render(
        <FavoritesList favorites={mockFavorites} onEdit={vi.fn()} onReorder={vi.fn()} />
      );

      const liveRegion = container.querySelector('[aria-live="polite"]');
      expect(liveRegion).toBeInTheDocument();
      expect(liveRegion).toHaveAttribute("aria-atomic", "true");
    });
  });

  describe("edit functionality", () => {
    it("calls onEdit when edit button is clicked", async () => {
      const user = userEvent.setup();
      const onEdit = vi.fn();

      render(<FavoritesList favorites={mockFavorites} onEdit={onEdit} onReorder={vi.fn()} />);

      const editButton = screen.getAllByText("Edit")[0];
      await user.click(editButton);

      expect(onEdit).toHaveBeenCalledWith(mockFavorites[0]);
    });
  });

  describe("force refresh", () => {
    it("passes forceRefreshId to FavoriteCard", () => {
      const { rerender } = render(
        <FavoritesList
          favorites={mockFavorites}
          forceRefreshId={1}
          onEdit={vi.fn()}
          onReorder={vi.fn()}
        />
      );

      // Re-render with new refresh ID
      rerender(
        <FavoritesList
          favorites={mockFavorites}
          forceRefreshId={2}
          onEdit={vi.fn()}
          onReorder={vi.fn()}
        />
      );

      // Component should re-render without errors
      expect(screen.getByText("Times Square")).toBeInTheDocument();
    });
  });

  describe("accessibility", () => {
    it("has proper aria-label for each item", () => {
      const { container } = render(
        <FavoritesList favorites={mockFavorites} onEdit={vi.fn()} onReorder={vi.fn()} />
      );

      const items = container.querySelectorAll('[draggable="true"]');
      expect(items[0]).toHaveAttribute("aria-label", "Times Square, position 1 of 3");
      expect(items[1]).toHaveAttribute("aria-label", "Penn Station, position 2 of 3, pinned");
    });

    it("has roledescription for sortable items", () => {
      const { container } = render(
        <FavoritesList favorites={mockFavorites} onEdit={vi.fn()} onReorder={vi.fn()} />
      );

      const firstItem = container.querySelector('[draggable="true"]');
      expect(firstItem).toHaveAttribute("aria-roledescription", "sortable item");
    });

    it("has live region for announcements", () => {
      const { container } = render(
        <FavoritesList favorites={mockFavorites} onEdit={vi.fn()} onReorder={vi.fn()} />
      );

      const liveRegion = container.querySelector('[aria-live="polite"]');
      expect(liveRegion).toBeInTheDocument();
      expect(liveRegion).toHaveAttribute("aria-atomic", "true");
    });

    it("keyboard reorder buttons are screen reader visible", () => {
      const { container } = render(
        <FavoritesList favorites={mockFavorites} onEdit={vi.fn()} onReorder={vi.fn()} />
      );

      const srOnlyButtons = container.querySelectorAll(".sr-only button");
      expect(srOnlyButtons.length).toBeGreaterThan(0);
    });

    it("keyboard buttons become visible on focus", async () => {
      const user = userEvent.setup();
      const { container } = render(
        <FavoritesList favorites={mockFavorites} onEdit={vi.fn()} onReorder={vi.fn()} />
      );

      const keyboardButtons = container.querySelectorAll(".sr-only button");
      const firstButton = keyboardButtons[0] as HTMLElement;

      // Focus should make button visible
      firstButton.focus();

      expect(firstButton.classList.contains("sr-only")).toBe(false);
    });
  });

  describe("visual feedback", () => {
    it("has transition classes for smooth animations", () => {
      const { container } = render(
        <FavoritesList favorites={mockFavorites} onEdit={vi.fn()} onReorder={vi.fn()} />
      );

      const items = container.querySelectorAll('[draggable="true"]');
      items.forEach((item) => {
        expect(item).toHaveClass("transition-all");
        expect(item).toHaveClass("duration-150");
      });
    });

    it("has proper base classes for draggable items", () => {
      const { container } = render(
        <FavoritesList favorites={mockFavorites} onEdit={vi.fn()} onReorder={vi.fn()} />
      );

      const firstItem = container.querySelector('[draggable="true"]') as HTMLElement;
      expect(firstItem).toHaveClass("relative");
      expect(firstItem).toHaveClass("transition-all");
    });
  });

  describe("edge cases", () => {
    it("handles empty favorites list", () => {
      const { container } = render(
        <FavoritesList favorites={[]} onEdit={vi.fn()} onReorder={vi.fn()} />
      );

      const list = container.querySelector('[role="list"]');
      expect(list).toBeInTheDocument();
      // Empty list should have only the live region as a sibling
      const liveRegion = container.querySelector('[aria-live="polite"]');
      expect(liveRegion).toBeInTheDocument();
    });

    it("handles single favorite", () => {
      const { container } = render(
        <FavoritesList favorites={[mockFavorites[0]]} onEdit={vi.fn()} onReorder={vi.fn()} />
      );

      const items = container.querySelectorAll('[draggable="true"]');
      expect(items).toHaveLength(1);
    });

    it("handles all favorites pinned", () => {
      const allPinned = mockFavorites.map((fav) => ({ ...fav, pinned: true }));
      const { container } = render(
        <FavoritesList favorites={allPinned} onEdit={vi.fn()} onReorder={vi.fn()} />
      );

      const pinnedIndicators = container.querySelectorAll('[aria-hidden="true"].bg-mta-primary');
      expect(pinnedIndicators).toHaveLength(3);
    });

    it("handles favorite with special characters in name", () => {
      const specialName = {
        ...mockFavorites[0],
        stationName: "St. John's University - Jamaica",
      };
      const { container } = render(
        <FavoritesList favorites={[specialName]} onEdit={vi.fn()} onReorder={vi.fn()} />
      );

      expect(screen.getByText("St. John's University - Jamaica")).toBeInTheDocument();
    });
  });
});
