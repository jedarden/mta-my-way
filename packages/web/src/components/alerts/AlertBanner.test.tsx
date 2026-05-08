/**
 * Tests for AlertBanner component
 *
 * Tests the alert banner display including:
 * - Severity levels and styling
 * - Alert count display
 * - Affected lines display
 * - Expand/collapse behavior
 * - Single alert banner
 * - Shuttle info display
 * - Navigation to alerts screen
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AlertBanner, SingleAlertBanner } from "./AlertBanner";

// Mock dependencies
vi.mock("../../lib/outputEncoding.js", () => ({
  sanitizeUserInput: (text: string) => text,
}));

vi.mock("./ShuttleInfo.jsx", () => ({
  ShuttleInfo: ({
    shuttleInfo,
    compact,
  }: { shuttleInfo: { pickup: string; dropoff: string }; compact?: boolean }) => (
    <div data-testid="shuttle-info" data-compact={compact}>
      Shuttle: {shuttleInfo.pickup} → {shuttleInfo.dropoff}
    </div>
  ),
}));

vi.mock("../arrivals/LineBullet.jsx", () => ({
  LineBullet: ({ line, size }: { line: string; size: string }) => (
    <div data-testid={`line-bullet-${line}`} data-size={size}>
      {line}
    </div>
  ),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
}));

const mockAlerts = [
  {
    id: "alert-1",
    severity: "severe" as const,
    source: "official" as const,
    headline: "Planned work",
    description: "Trains bypass station",
    affectedLines: ["1", "2"],
    activePeriod: { start: Date.now() / 1000, end: Date.now() / 1000 + 3600 },
    cause: "construction",
    effect: "DELAY",
  },
  {
    id: "alert-2",
    severity: "warning" as const,
    source: "predicted" as const,
    headline: "Delays expected",
    description: "Due to signal problems",
    affectedLines: ["3"],
    activePeriod: { start: Date.now() / 1000 },
    cause: "signal",
    effect: "DELAY",
  },
  {
    id: "alert-3",
    severity: "info" as const,
    source: "official" as const,
    headline: "Service change",
    description: "Running local",
    affectedLines: ["A", "C"],
    activePeriod: { start: Date.now() / 1000 },
    cause: "maintenance",
    effect: "DETOUR",
  },
];

const mockAlertWithShuttle = {
  id: "alert-shuttle",
  severity: "warning" as const,
  source: "official" as const,
  headline: "Shuttle buses replace trains",
  description: "Between stations",
  affectedLines: ["1"],
  activePeriod: { start: Date.now() / 1000 },
  cause: "construction",
  effect: "REPLACE",
  shuttleInfo: {
    pickup: "Station A",
    dropoff: "Station B",
  },
};

describe("AlertBanner", () => {
  describe("basic rendering", () => {
    it("renders alert count", () => {
      render(<AlertBanner alerts={mockAlerts} />);

      expect(screen.getByText("3 Alerts")).toBeInTheDocument();
    });

    it("renders singular '1 Alert' for single alert", () => {
      render(<AlertBanner alerts={[mockAlerts[0]]} />);

      expect(screen.getByText("1 Alert")).toBeInTheDocument();
    });

    it("renders nothing when alerts array is empty", () => {
      const { container } = render(<AlertBanner alerts={[]} />);

      expect(container.firstChild).toBeNull();
    });
  });

  describe("severity styling", () => {
    it("applies severe styling for severe alerts", () => {
      const { container } = render(<AlertBanner alerts={[mockAlerts[0]]} />);

      const banner = container.querySelector("aside");
      expect(banner).toHaveClass("bg-mta-red/10");
      expect(banner).toHaveClass("border-mta-red/30");
    });

    it("applies warning styling for warning alerts", () => {
      const { container } = render(<AlertBanner alerts={[mockAlerts[1]]} />);

      const banner = container.querySelector("aside");
      expect(banner).toHaveClass("bg-mta-yellow/10");
      expect(banner).toHaveClass("border-mta-yellow/30");
    });

    it("applies info styling for info alerts", () => {
      const { container } = render(<AlertBanner alerts={[mockAlerts[2]]} />);

      const banner = container.querySelector("aside");
      expect(banner).toHaveClass("bg-mta-gray/10");
      expect(banner).toHaveClass("border-mta-gray/30");
    });

    it("uses most severe styling when mixed", () => {
      const { container } = render(<AlertBanner alerts={mockAlerts} />);

      const banner = container.querySelector("aside");
      expect(banner).toHaveClass("bg-mta-red/10");
    });
  });

  describe("affected lines", () => {
    it("displays affected line bullets", () => {
      render(<AlertBanner alerts={[mockAlerts[0]]} />);

      expect(screen.getByTestId("line-bullet-1")).toBeInTheDocument();
      expect(screen.getByTestId("line-bullet-2")).toBeInTheDocument();
    });

    it("limits displayed lines to 5 with counter for more", () => {
      const alertWithManyLines = {
        ...mockAlerts[0],
        affectedLines: ["1", "2", "3", "4", "5", "6", "7"],
      };
      render(<AlertBanner alerts={[alertWithManyLines]} />);

      expect(screen.getByTestId("line-bullet-1")).toBeInTheDocument();
      expect(screen.getByTestId("line-bullet-5")).toBeInTheDocument();
      expect(screen.getByText("+2")).toBeInTheDocument();
    });
  });

  describe("expand/collapse behavior", () => {
    it("shows most severe alert headline when collapsed", () => {
      render(<AlertBanner alerts={mockAlerts} maxVisible={1} />);

      // The headline appears in the header section when collapsed
      const headlines = screen.getAllByText(mockAlerts[0].headline);
      expect(headlines.length).toBeGreaterThan(0);
      // Second alert should not be visible when collapsed
      expect(screen.queryByText(mockAlerts[1].headline)).not.toBeInTheDocument();
    });

    it("expands to show more alerts when clicked", async () => {
      const user = userEvent.setup();
      render(<AlertBanner alerts={mockAlerts} maxVisible={1} />);

      const toggle = screen.getByText(/\+2 more alerts/);
      await user.click(toggle);

      // After expansion, all alerts should be visible
      const allHeadlines = screen.getAllByText(mockAlerts[1].headline);
      expect(allHeadlines.length).toBeGreaterThan(0);

      const allHeadlines2 = screen.getAllByText(mockAlerts[2].headline);
      expect(allHeadlines2.length).toBeGreaterThan(0);
    });

    it("shows 'Show less' when expanded", async () => {
      const user = userEvent.setup();
      render(<AlertBanner alerts={mockAlerts} maxVisible={1} />);

      const toggle = screen.getByText(/\+2 more alerts/);
      await user.click(toggle);

      expect(screen.getByText("Show less")).toBeInTheDocument();
    });

    it("collapses when 'Show less' is clicked", async () => {
      const user = userEvent.setup();
      render(<AlertBanner alerts={mockAlerts} maxVisible={1} />);

      await user.click(screen.getByText(/\+2 more alerts/));
      await user.click(screen.getByText("Show less"));

      // After collapse, only the most severe alert should be visible in header
      const headlines = screen.getAllByText(mockAlerts[0].headline);
      expect(headlines.length).toBeGreaterThan(0);
    });
  });

  describe("predicted alerts", () => {
    it("shows '(predicted)' label for predicted alerts", () => {
      render(<AlertBanner alerts={[mockAlerts[1]]} maxVisible={1} />);

      expect(screen.getByText("(predicted)")).toBeInTheDocument();
    });
  });

  describe("shuttle info", () => {
    it("displays shuttle info when available", () => {
      render(<AlertBanner alerts={[mockAlertWithShuttle]} maxVisible={1} />);

      expect(screen.getByTestId("shuttle-info")).toBeInTheDocument();
      expect(screen.getByText(/Station A → Station B/)).toBeInTheDocument();
    });
  });

  describe("view all link", () => {
    it("shows 'View all' link by default", () => {
      render(<AlertBanner alerts={mockAlerts} />);

      expect(screen.getByRole("button", { name: "View all" })).toBeInTheDocument();
    });

    it("hides 'View all' link when showLink is false", () => {
      render(<AlertBanner alerts={mockAlerts} showLink={false} />);

      expect(screen.queryByRole("button", { name: "View all" })).not.toBeInTheDocument();
    });
  });

  describe("accessibility", () => {
    it("uses aria-live=assertive for severe alerts", () => {
      const { container } = render(<AlertBanner alerts={[mockAlerts[0]]} />);

      const banner = container.querySelector("aside");
      expect(banner).toHaveAttribute("aria-live", "assertive");
    });

    it("uses aria-live=polite for non-severe alerts", () => {
      const { container } = render(<AlertBanner alerts={[mockAlerts[1]]} />);

      const banner = container.querySelector("aside");
      expect(banner).toHaveAttribute("aria-live", "polite");
    });

    it("has role='alert'", () => {
      const { container } = render(<AlertBanner alerts={[mockAlerts[0]]} />);

      const banner = container.querySelector("aside");
      expect(banner).toHaveAttribute("role", "alert");
    });
  });
});

describe("SingleAlertBanner", () => {
  it("renders single alert", () => {
    render(<SingleAlertBanner alert={mockAlerts[0]} />);

    expect(screen.getByText(mockAlerts[0].headline)).toBeInTheDocument();
  });

  it("applies severity styling", () => {
    const { container } = render(<SingleAlertBanner alert={mockAlerts[0]} />);

    const banner = container.querySelector("div");
    expect(banner).toHaveClass("bg-mta-red/10");
  });

  it("displays affected lines", () => {
    render(<SingleAlertBanner alert={mockAlerts[0]} />);

    expect(screen.getByTestId("line-bullet-1")).toBeInTheDocument();
    expect(screen.getByTestId("line-bullet-2")).toBeInTheDocument();
  });

  it("limits displayed lines to 3", () => {
    const alertWithManyLines = {
      ...mockAlerts[0],
      affectedLines: ["1", "2", "3", "4", "5"],
    };
    render(<SingleAlertBanner alert={alertWithManyLines} />);

    expect(screen.getByTestId("line-bullet-1")).toBeInTheDocument();
    expect(screen.getByTestId("line-bullet-3")).toBeInTheDocument();
    // Only 3 bullets should be shown
    expect(screen.queryByTestId("line-bullet-4")).not.toBeInTheDocument();
  });

  it("shows predicted label for predicted alerts", () => {
    render(<SingleAlertBanner alert={mockAlerts[1]} />);

    expect(screen.getByText("(predicted)")).toBeInTheDocument();
  });

  it("displays shuttle info when available", () => {
    render(<SingleAlertBanner alert={mockAlertWithShuttle} />);

    expect(screen.getByTestId("shuttle-info")).toBeInTheDocument();
  });

  it("has proper accessibility attributes", () => {
    const { container } = render(<SingleAlertBanner alert={mockAlerts[0]} />);

    const banner = container.querySelector("div");
    expect(banner).toHaveAttribute("role", "alert");
    expect(banner).toHaveAttribute("aria-live", "assertive");
  });
});
