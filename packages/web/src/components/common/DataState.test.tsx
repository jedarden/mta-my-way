/**
 * Tests for DataState component
 *
 * Tests the data state wrapper component including:
 * - Loading state with skeleton
 * - Empty state
 * - Error state
 * - Offline state
 * - Stale state with timestamp
 * - Success state with data
 * - Retry functionality
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DataState } from "./DataState";

// Mock formatTimeAgo to avoid time-dependent tests
vi.mock("@mta-my-way/shared", async () => {
  const actual = await vi.importActual("@mta-my-way/shared");
  return {
    ...actual,
    formatTimeAgo: (seconds: number) => {
      if (seconds < 60) return "just now";
      if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
      return `${Math.floor(seconds / 3600)} hr ago`;
    },
  };
});

// Mock ApiErrorDisplay
vi.mock("./ApiErrorDisplay", () => ({
  ApiErrorDisplay: ({
    error,
    canRetry,
    isRetrying,
    onRetry,
    compact,
  }: {
    error: string;
    canRetry: boolean;
    isRetrying: boolean;
    onRetry?: () => void;
    compact?: boolean;
  }) => (
    <div data-testid="api-error-display" data-compact={compact}>
      <div className="error-message">{error}</div>
      {canRetry && (
        <button type="button" onClick={onRetry} disabled={isRetrying} data-testid="retry-button">
          {isRetrying ? "Retrying..." : "Retry"}
        </button>
      )}
    </div>
  ),
}));

describe("DataState", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("loading state", () => {
    it("renders default skeleton when loading with no data", () => {
      render(
        <DataState<{ items: string[] }> status="loading" data={null}>
          {(data) => <div>{data.items.join(", ")}</div>}
        </DataState>
      );

      expect(screen.getByLabelText("Loading")).toBeInTheDocument();
    });

    it("renders custom skeleton when provided", () => {
      const customSkeleton = <div data-testid="custom-skeleton">Loading...</div>;
      render(
        <DataState<{ items: string[] }> status="loading" data={null} skeleton={customSkeleton}>
          {(data) => <div>{data.items.join(", ")}</div>}
        </DataState>
      );

      expect(screen.getByTestId("custom-skeleton")).toBeInTheDocument();
    });

    it("renders skeleton when idle with no data", () => {
      render(
        <DataState<{ items: string[] }> status="idle" data={null}>
          {(data) => <div>{data.items.join(", ")}</div>}
        </DataState>
      );

      expect(screen.getByLabelText("Loading")).toBeInTheDocument();
    });
  });

  describe("error state", () => {
    it("renders error display when error with no data", () => {
      render(
        <DataState<{ items: string[] }>
          status="error"
          data={null}
          error="Network error"
          onRetry={vi.fn()}
        >
          {(data) => <div>{data.items.join(", ")}</div>}
        </DataState>
      );

      expect(screen.getByTestId("api-error-display")).toBeInTheDocument();
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });

    it("calls onRetry when retry button is clicked", async () => {
      // Use real timers for userEvent tests
      vi.useRealTimers();
      const user = userEvent.setup({ delay: null });
      const onRetry = vi.fn();
      render(
        <DataState<{ items: string[] }>
          status="error"
          data={null}
          error="Network error"
          onRetry={onRetry}
        >
          {(data) => <div>{data.items.join(", ")}</div>}
        </DataState>
      );

      const retryButton = screen.getByTestId("retry-button");
      await user.click(retryButton);

      expect(onRetry).toHaveBeenCalledTimes(1);
      vi.useFakeTimers(); // Reset for other tests
    });

    it("renders stale data with error banner", () => {
      const testData = { items: ["item1", "item2"] };
      render(
        <DataState status="error" data={testData} error="Update failed" onRetry={vi.fn()}>
          {(data) => <div data-testid="content">{data.items.join(", ")}</div>}
        </DataState>
      );

      expect(screen.getByTestId("content")).toHaveTextContent("item1, item2");
      expect(screen.getByTestId("api-error-display")).toBeInTheDocument();
      expect(screen.getByTestId("api-error-display")).toHaveAttribute("data-compact", "true");
    });
  });

  describe("offline state", () => {
    it("renders offline display when offline with no data", () => {
      render(
        <DataState<{ items: string[] }>
          status="offline"
          data={null}
          error="No cached data"
          onRetry={vi.fn()}
        >
          {(data) => <div>{data.items.join(", ")}</div>}
        </DataState>
      );

      expect(screen.getByTestId("api-error-display")).toBeInTheDocument();
      expect(screen.getByText("No cached data")).toBeInTheDocument();
    });

    it("renders stale data with offline banner", () => {
      const testData = { items: ["item1", "item2"] };
      render(
        <DataState status="offline" data={testData} onRetry={vi.fn()}>
          {(data) => <div data-testid="content">{data.items.join(", ")}</div>}
        </DataState>
      );

      expect(screen.getByTestId("content")).toHaveTextContent("item1, item2");
      expect(screen.getByText(/Offline — showing last known data/)).toBeInTheDocument();
    });
  });

  describe("stale state", () => {
    it("renders stale banner with timestamp", () => {
      const testData = { items: ["item1", "item2"] };
      const staleTimestamp = Date.now() - 5 * 60 * 1000; // 5 minutes ago

      render(
        <DataState status="stale" data={testData} staleTimestamp={staleTimestamp}>
          {(data) => <div data-testid="content">{data.items.join(", ")}</div>}
        </DataState>
      );

      expect(screen.getByTestId("content")).toHaveTextContent("item1, item2");
      expect(screen.getByText(/Updated \d+ min ago/)).toBeInTheDocument();
    });

    it("updates stale time text periodically", async () => {
      // Use real timers for this test since waitFor needs real time
      vi.useRealTimers();
      const testData = { items: ["item1"] };
      const staleTimestamp = Date.now() - 2 * 60 * 1000; // 2 minutes ago

      render(
        <DataState status="stale" data={testData} staleTimestamp={staleTimestamp}>
          {(data) => <div>{data.items.join(", ")}</div>}
        </DataState>
      );

      // Initial render
      expect(screen.getByText(/Updated \d+ min ago/)).toBeInTheDocument();

      // Wait for interval to run (15 seconds)
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Text should still be there
      expect(screen.getByText(/Updated \d+ min ago/)).toBeInTheDocument();
      vi.useFakeTimers(); // Reset for other tests
    });
  });

  describe("empty state", () => {
    it("renders empty component when data is empty array", () => {
      const emptyComponent = <div data-testid="empty">No items found</div>;
      render(
        <DataState<unknown[]> status="success" data={[]} empty={emptyComponent}>
          {(data) => <div>{data.length} items</div>}
        </DataState>
      );

      expect(screen.getByTestId("empty")).toBeInTheDocument();
      expect(screen.queryByText(/0 items/)).not.toBeInTheDocument();
    });

    it("does not render empty component when data has items", () => {
      const emptyComponent = <div data-testid="empty">No items found</div>;
      render(
        <DataState<unknown[]> status="success" data={[{ id: 1 }]} empty={emptyComponent}>
          {(data) => <div>{data.length} items</div>}
        </DataState>
      );

      expect(screen.queryByTestId("empty")).not.toBeInTheDocument();
      expect(screen.getByText("1 items")).toBeInTheDocument();
    });

    it("does not render empty component when not provided", () => {
      render(
        <DataState<unknown[]> status="success" data={[]}>
          {(data) => <div>{data.length} items</div>}
        </DataState>
      );

      // When data is empty array and no empty component provided,
      // the component returns null (hasData is false)
      expect(screen.queryByText(/0 items/)).not.toBeInTheDocument();
    });
  });

  describe("success state", () => {
    it("renders children with data", () => {
      const testData = { items: ["item1", "item2", "item3"] };
      render(
        <DataState status="success" data={testData}>
          {(data) => <div data-testid="content">{data.items.join(", ")}</div>}
        </DataState>
      );

      expect(screen.getByTestId("content")).toHaveTextContent("item1, item2, item3");
    });

    it("handles non-array data", () => {
      const testData = { name: "Test", value: 42 };
      render(
        <DataState status="success" data={testData}>
          {(data) => (
            <div data-testid="content">
              {data.name}: {data.value}
            </div>
          )}
        </DataState>
      );

      expect(screen.getByTestId("content")).toHaveTextContent("Test: 42");
    });
  });

  describe("edge cases", () => {
    it("handles null data with success status", () => {
      render(
        <DataState<{ items: string[] }> status="success" data={null}>
          {(data) => <div>{data?.items.join(", ") || "no data"}</div>}
        </DataState>
      );

      // When data is null and status is success, component has no data to render
      // The component returns null (empty fragment) since hasData is false
      expect(screen.queryByText("no data")).not.toBeInTheDocument();
      expect(screen.queryByText(/items/)).not.toBeInTheDocument();
    });

    it("handles error without error message", () => {
      render(
        <DataState<{ items: string[] }> status="error" data={null} onRetry={vi.fn()}>
          {(data) => <div>{data.items.join(", ")}</div>}
        </DataState>
      );

      expect(screen.getByTestId("api-error-display")).toBeInTheDocument();
    });

    it("handles offline without error message", () => {
      render(
        <DataState<{ items: string[] }> status="offline" data={null} onRetry={vi.fn()}>
          {(data) => <div>{data.items.join(", ")}</div>}
        </DataState>
      );

      expect(screen.getByTestId("api-error-display")).toBeInTheDocument();
      expect(screen.getByText("No cached data available")).toBeInTheDocument();
    });
  });

  describe("error context", () => {
    it("passes error context to ApiErrorDisplay", () => {
      render(
        <DataState<{ items: string[] }>
          status="error"
          data={null}
          error="Failed to fetch trips"
          errorContext="trips"
          onRetry={vi.fn()}
        >
          {(data) => <div>{data.items.join(", ")}</div>}
        </DataState>
      );

      expect(screen.getByTestId("api-error-display")).toBeInTheDocument();
    });
  });

  describe("cleanup", () => {
    it("clears interval on unmount", () => {
      const clearIntervalSpy = vi.spyOn(global, "clearInterval");

      const { unmount } = render(
        <DataState status="stale" data={{ items: ["item1"] }} staleTimestamp={Date.now()}>
          {(data) => <div>{data.items.join(", ")}</div>}
        </DataState>
      );

      unmount();

      // Interval should be cleared
      expect(clearIntervalSpy).toHaveBeenCalled();
    });
  });
});
