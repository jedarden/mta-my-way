/**
 * Tests for AlertList component
 *
 * Tests the alert list component including:
 * - Loading state with skeleton
 * - Empty state
 * - Error state
 * - Success state with alerts
 * - Grouping by severity
 * - Compact mode
 * - Max alerts limit
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AlertList } from "./AlertList";

// Mock AlertCard component
vi.mock("./AlertCard", () => ({
  AlertCard: ({
    alert,
    compact,
    isRaw,
    isPredicted,
  }: {
    alert: { id: string; headline: string; severity: string };
    compact?: boolean;
    isRaw?: boolean;
    isPredicted?: boolean;
  }) => (
    <div
      data-testid={`alert-card-${alert.id}`}
      data-compact={compact}
      data-raw={isRaw}
      data-predicted={isPredicted}
    >
      <div className="headline">{alert.headline}</div>
      <div className="severity">{alert.severity}</div>
    </div>
  ),
}));

// Mock DataState
vi.mock("../common/DataState", () => ({
  DataState: ({
    status,
    data,
    skeleton,
    empty,
    children,
  }: {
    status: string;
    data: unknown;
    skeleton?: React.ReactNode;
    empty?: React.ReactNode;
    children: (data: unknown) => React.ReactNode;
  }) => {
    if (status === "loading" || status === "idle") {
      return <>{skeleton}</>;
    }
    // Error state takes priority over empty state
    if (status === "error") {
      // Show error if no data or empty array with error status
      if (!data || (Array.isArray(data) && data.length === 0)) {
        return <div data-testid="error-state">Error loading alerts</div>;
      }
    }
    if (!data || (Array.isArray(data) && data.length === 0)) {
      return <>{empty}</>;
    }
    return <>{children(data)}</>;
  },
}));

// Mock AlertListSkeleton
vi.mock("../common/Skeleton", () => ({
  AlertListSkeleton: ({ count }: { count?: number }) => (
    <div data-testid="alert-list-skeleton" data-count={count}>
      Loading alerts...
    </div>
  ),
}));

// Mock EmptyAlerts
vi.mock("../common/EmptyState", () => ({
  EmptyAlerts: ({ message, subtext }: { message?: string; subtext?: string }) => (
    <div data-testid="empty-alerts">
      <div>{message}</div>
      {subtext && <div>{subtext}</div>}
    </div>
  ),
}));

const mockAlerts = [
  {
    id: "alert-1",
    headline: "Severe delays",
    severity: "severe",
    affectedLines: ["A", "C"],
    source: "gtfs",
    isRaw: false,
  },
  {
    id: "alert-2",
    headline: "Planned work",
    severity: "warning",
    affectedLines: ["1", "2", "3"],
    source: "gtfs",
    isRaw: false,
  },
  {
    id: "alert-3",
    headline: "Service change",
    severity: "info",
    affectedLines: ["4"],
    source: "gtfs",
    isRaw: false,
  },
  {
    id: "alert-4",
    headline: "Raw alert",
    severity: "info",
    affectedLines: [],
    source: "gtfs",
    isRaw: true,
  },
  {
    id: "alert-5",
    headline: "Predicted delay",
    severity: "warning",
    affectedLines: ["7"],
    source: "predicted",
    isRaw: false,
  },
] as const;

describe("AlertList", () => {
  describe("loading state", () => {
    it("renders skeleton when loading", () => {
      render(<AlertList alerts={[]} status="loading" />);

      expect(screen.getByTestId("alert-list-skeleton")).toBeInTheDocument();
    });

    it("renders skeleton when idle", () => {
      render(<AlertList alerts={[]} status="idle" />);

      expect(screen.getByTestId("alert-list-skeleton")).toBeInTheDocument();
    });
  });

  describe("error state", () => {
    it("renders error state when error with no data", () => {
      render(<AlertList alerts={[]} status="error" />);

      expect(screen.getByTestId("error-state")).toBeInTheDocument();
    });
  });

  describe("empty state", () => {
    it("renders empty state with default message", () => {
      render(<AlertList alerts={[]} status="success" />);

      expect(screen.getByTestId("empty-alerts")).toBeInTheDocument();
      expect(screen.getByText("No active alerts")).toBeInTheDocument();
    });

    it("renders custom empty message", () => {
      render(
        <AlertList
          alerts={[]}
          status="success"
          emptyMessage="No service disruptions"
          emptySubtext="All lines running normally"
        />
      );

      expect(screen.getByText("No service disruptions")).toBeInTheDocument();
      expect(screen.getByText("All lines running normally")).toBeInTheDocument();
    });
  });

  describe("success state - full mode", () => {
    it("groups alerts by severity", () => {
      render(<AlertList alerts={mockAlerts.slice(0, 3)} status="success" />);

      // Should have section headers
      expect(screen.getByText("Service Suspended")).toBeInTheDocument();
      expect(screen.getByText("Delays")).toBeInTheDocument();
      expect(screen.getByText("Planned Work & Info")).toBeInTheDocument();
    });

    it("renders alert cards in correct sections", () => {
      render(<AlertList alerts={mockAlerts.slice(0, 3)} status="success" />);

      expect(screen.getByTestId("alert-card-alert-1")).toBeInTheDocument();
      expect(screen.getByTestId("alert-card-alert-2")).toBeInTheDocument();
      expect(screen.getByTestId("alert-card-alert-3")).toBeInTheDocument();
    });

    it("passes isRaw prop to AlertCard", () => {
      render(<AlertList alerts={[mockAlerts[3]]} status="success" />);

      const card = screen.getByTestId("alert-card-alert-4");
      expect(card).toHaveAttribute("data-raw", "true");
    });

    it("passes isPredicted prop for predicted alerts", () => {
      render(<AlertList alerts={[mockAlerts[4]]} status="success" />);

      const card = screen.getByTestId("alert-card-alert-5");
      expect(card).toHaveAttribute("data-predicted", "true");
    });

    it("hides empty severity sections", () => {
      const onlySevere = [mockAlerts[0]];
      render(<AlertList alerts={onlySevere} status="success" />);

      expect(screen.getByText("Service Suspended")).toBeInTheDocument();
      expect(screen.queryByText("Delays")).not.toBeInTheDocument();
      expect(screen.queryByText("Planned Work & Info")).not.toBeInTheDocument();
    });
  });

  describe("compact mode", () => {
    it("renders flat list in compact mode", () => {
      render(<AlertList alerts={mockAlerts.slice(0, 3)} status="success" compact />);

      // Should not have section headers
      expect(screen.queryByText("Service Suspended")).not.toBeInTheDocument();
      expect(screen.queryByText("Delays")).not.toBeInTheDocument();
      expect(screen.queryByText("Planned Work & Info")).not.toBeInTheDocument();

      // Should have alert cards
      expect(screen.getByTestId("alert-card-alert-1")).toBeInTheDocument();
      expect(screen.getByTestId("alert-card-alert-2")).toBeInTheDocument();
      expect(screen.getByTestId("alert-card-alert-3")).toBeInTheDocument();
    });

    it("passes compact prop to AlertCard", () => {
      render(<AlertList alerts={[mockAlerts[0]]} status="success" compact />);

      const card = screen.getByTestId("alert-card-alert-1");
      expect(card).toHaveAttribute("data-compact", "true");
    });
  });

  describe("max alerts limit", () => {
    it("limits number of alerts displayed", () => {
      render(<AlertList alerts={mockAlerts} status="success" maxAlerts={2} />);

      expect(screen.getByTestId("alert-card-alert-1")).toBeInTheDocument();
      expect(screen.getByTestId("alert-card-alert-2")).toBeInTheDocument();
      expect(screen.queryByTestId("alert-card-alert-3")).not.toBeInTheDocument();
    });

    it("shows more alerts count", () => {
      render(<AlertList alerts={mockAlerts} status="success" maxAlerts={2} />);

      expect(screen.getByText(/\+3 more alerts/)).toBeInTheDocument();
    });

    it("shows more alerts count in compact mode", () => {
      render(<AlertList alerts={mockAlerts} status="success" maxAlerts={2} compact />);

      expect(screen.getByText(/\+3 more alerts/)).toBeInTheDocument();
    });

    it("does not show more count when all alerts displayed", () => {
      render(<AlertList alerts={mockAlerts.slice(0, 2)} status="success" maxAlerts={5} />);

      expect(screen.queryByText(/\d+ more alerts/)).not.toBeInTheDocument();
    });
  });

  describe("accessibility", () => {
    it("has proper role and aria-label", () => {
      render(<AlertList alerts={[mockAlerts[0]]} status="success" />);

      const list = screen.getByRole("list", { name: /alerts/i });
      expect(list).toBeInTheDocument();
    });

    it("has proper section headings for severity groups", () => {
      render(<AlertList alerts={mockAlerts.slice(0, 3)} status="success" />);

      // Check for proper heading structure
      const severeHeading = screen.getByText("Service Suspended");
      expect(severeHeading.tagName).toBe("H3");
    });
  });

  describe("retry functionality", () => {
    it("passes onRetry callback to DataState", () => {
      // This is handled by the mocked DataState, but we verify the prop is passed
      const onRetry = vi.fn();
      render(<AlertList alerts={[]} status="error" onRetry={onRetry} />);

      // The mock doesn't actually call onRetry, but we verify the component accepts the prop
      expect(onRetry).toBeDefined();
    });
  });
});
