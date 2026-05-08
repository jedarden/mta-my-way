/**
 * Tests for EmptyState components
 *
 * Tests empty state components including:
 * - EmptyFavorites
 * - EmptyCommutes
 * - EmptyArrivals
 * - EmptyAlerts
 * - EmptySearchResults
 * - EmptyJournal
 * - GenericEmptyState
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import {
  EmptyAlerts,
  EmptyArrivals,
  EmptyCommutes,
  EmptyFavorites,
  EmptyJournal,
  EmptySearchResults,
  GenericEmptyState,
} from "./EmptyState";

describe("EmptyState", () => {
  describe("EmptyFavorites", () => {
    it("renders empty favorites message", () => {
      render(
        <MemoryRouter>
          <EmptyFavorites />
        </MemoryRouter>
      );

      expect(screen.getByText("No favorites yet")).toBeInTheDocument();
      expect(screen.getByText("Search for a station to add it here")).toBeInTheDocument();
    });

    it("renders link to search page", () => {
      render(
        <MemoryRouter>
          <EmptyFavorites />
        </MemoryRouter>
      );

      const link = screen.getByRole("link", { name: /add your first station/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute("href", "/search");
    });

    it("applies custom className", () => {
      const { container } = render(
        <MemoryRouter>
          <EmptyFavorites className="custom-class" />
        </MemoryRouter>
      );

      expect(container.firstChild).toHaveClass("custom-class");
    });

    it("has proper accessibility attributes", () => {
      render(
        <MemoryRouter>
          <EmptyFavorites />
        </MemoryRouter>
      );

      expect(screen.getByRole("status")).toBeInTheDocument();
    });
  });

  describe("EmptyCommutes", () => {
    it("renders empty commutes message", () => {
      const onAdd = vi.fn();
      render(<EmptyCommutes onAdd={onAdd} />);

      expect(screen.getByText("No commutes configured")).toBeInTheDocument();
      expect(
        screen.getByText("Add a commute to see transfer analysis and route comparisons")
      ).toBeInTheDocument();
    });

    it("calls onAdd when button is clicked", async () => {
      const user = userEvent.setup();
      const onAdd = vi.fn();
      render(<EmptyCommutes onAdd={onAdd} />);

      const button = screen.getByRole("button", { name: /plan a commute/i });
      await user.click(button);

      expect(onAdd).toHaveBeenCalledTimes(1);
    });

    it("applies custom className", () => {
      const { container } = render(<EmptyCommutes onAdd={vi.fn()} className="custom-class" />);

      expect(container.firstChild).toHaveClass("custom-class");
    });

    it("has proper accessibility attributes", () => {
      render(<EmptyCommutes onAdd={vi.fn()} />);

      expect(screen.getByRole("status")).toBeInTheDocument();
    });
  });

  describe("EmptyArrivals", () => {
    it("renders default empty arrivals message", () => {
      render(<EmptyArrivals />);

      expect(screen.getByText("No upcoming arrivals")).toBeInTheDocument();
      expect(screen.getByText("Trains may not be running at this hour")).toBeInTheDocument();
    });

    it("renders custom message and subtext", () => {
      render(<EmptyArrivals message="Custom message" subtext="Custom subtext" />);

      expect(screen.getByText("Custom message")).toBeInTheDocument();
      expect(screen.getByText("Custom subtext")).toBeInTheDocument();
    });

    it("applies custom className", () => {
      const { container } = render(<EmptyArrivals className="custom-class" />);

      expect(container.firstChild).toHaveClass("custom-class");
    });

    it("has proper accessibility attributes", () => {
      render(<EmptyArrivals />);

      expect(screen.getByRole("status")).toBeInTheDocument();
    });
  });

  describe("EmptyAlerts", () => {
    it("renders default empty alerts message", () => {
      render(<EmptyAlerts />);

      expect(screen.getByText("No active alerts")).toBeInTheDocument();
    });

    it("renders custom message and subtext", () => {
      render(<EmptyAlerts message="No service disruptions" subtext="All lines running normally" />);

      expect(screen.getByText("No service disruptions")).toBeInTheDocument();
      expect(screen.getByText("All lines running normally")).toBeInTheDocument();
    });

    it("renders without subtext when not provided", () => {
      render(<EmptyAlerts message="No alerts" />);

      expect(screen.getByText("No alerts")).toBeInTheDocument();
    });

    it("applies custom className", () => {
      const { container } = render(<EmptyAlerts className="custom-class" />);

      expect(container.firstChild).toHaveClass("custom-class");
    });

    it("has proper accessibility attributes", () => {
      render(<EmptyAlerts />);

      expect(screen.getByRole("status")).toBeInTheDocument();
    });
  });

  describe("EmptySearchResults", () => {
    it("renders empty search results with query", () => {
      render(<EmptySearchResults query="Times Square" />);

      expect(screen.getByText("No stations found")).toBeInTheDocument();
      expect(screen.getByText(/No results for "Times Square"/)).toBeInTheDocument();
    });

    it("suggests trying different search term", () => {
      render(<EmptySearchResults query="XYZ" />);

      expect(screen.getByText(/Try a different search term/i)).toBeInTheDocument();
    });

    it("applies custom className", () => {
      const { container } = render(<EmptySearchResults query="test" className="custom-class" />);

      expect(container.firstChild).toHaveClass("custom-class");
    });

    it("has proper accessibility attributes", () => {
      render(<EmptySearchResults query="test" />);

      expect(screen.getByRole("status")).toBeInTheDocument();
    });
  });

  describe("EmptyJournal", () => {
    it("renders empty journal message", () => {
      render(<EmptyJournal />);

      expect(screen.getByText("Your trip history will appear here")).toBeInTheDocument();
    });

    it("applies custom className", () => {
      const { container } = render(<EmptyJournal className="custom-class" />);

      expect(container.firstChild).toHaveClass("custom-class");
    });

    it("has proper accessibility attributes", () => {
      render(<EmptyJournal />);

      expect(screen.getByRole("status")).toBeInTheDocument();
    });
  });

  describe("GenericEmptyState", () => {
    it("renders with title and message", () => {
      render(
        <MemoryRouter>
          <GenericEmptyState title="No Data" message="Add some data to get started" />
        </MemoryRouter>
      );

      expect(screen.getByText("No Data")).toBeInTheDocument();
      expect(screen.getByText("Add some data to get started")).toBeInTheDocument();
    });

    it("renders with action button", () => {
      const onAction = vi.fn();
      render(
        <MemoryRouter>
          <GenericEmptyState
            title="No items"
            message="Create your first item"
            actionLabel="Create Item"
            onAction={onAction}
          />
        </MemoryRouter>
      );

      const button = screen.getByRole("button", { name: /create item/i });
      expect(button).toBeInTheDocument();
    });

    it("calls onAction when button is clicked", async () => {
      const user = userEvent.setup();
      const onAction = vi.fn();
      render(
        <MemoryRouter>
          <GenericEmptyState title="No items" actionLabel="Create Item" onAction={onAction} />
        </MemoryRouter>
      );

      const button = screen.getByRole("button", { name: /create item/i });
      await user.click(button);

      expect(onAction).toHaveBeenCalledTimes(1);
    });

    it("does not render button without actionLabel and onAction", () => {
      render(
        <MemoryRouter>
          <GenericEmptyState title="No Data" />
        </MemoryRouter>
      );

      const button = screen.queryByRole("button");
      expect(button).not.toBeInTheDocument();
    });

    it("applies custom className", () => {
      const { container } = render(
        <MemoryRouter>
          <GenericEmptyState title="Test" className="custom-class" />
        </MemoryRouter>
      );

      expect(container.firstChild).toHaveClass("custom-class");
    });

    it("has proper accessibility attributes", () => {
      render(
        <MemoryRouter>
          <GenericEmptyState title="Test" />
        </MemoryRouter>
      );

      expect(screen.getByRole("status")).toBeInTheDocument();
    });
  });
});
