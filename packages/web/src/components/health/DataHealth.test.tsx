/**
 * Tests for DataHealth component
 *
 * Tests the feed data health component including:
 * - Feed list display
 * - Feed age calculation
 * - Freshness indicators
 * - Circuit open status
 * - Sorting by age
 * - Latency display
 */

import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DataHealth } from "./DataHealth";

// Mock the shared utilities
vi.mock("@mta-my-way/shared", () => ({
  formatFeedAge: (age: number) => {
    if (age === Infinity) return "Never";
    if (age < 60) return `${age}s`;
    if (age < 3600) return `${Math.floor(age / 60)}m ${age % 60}s`;
    return `${Math.floor(age / 3600)}h`;
  },
  getFreshnessDotColor: (level: string) => {
    const colors = {
      green: "bg-green-500",
      gray: "bg-gray-400",
      amber: "bg-amber-500",
      red: "bg-red-500",
    };
    return colors[level as keyof typeof colors] || "bg-gray-400";
  },
  getFreshnessLevel: (age: number) => {
    if (age < 15) return "green";
    if (age < 45) return "gray";
    if (age < 90) return "amber";
    return "red";
  },
  getFreshnessTextColor: (level: string) => {
    const colors = {
      green: "text-green-600 dark:text-green-400",
      gray: "text-gray-600 dark:text-gray-400",
      amber: "text-amber-600 dark:text-amber-400",
      red: "text-red-600 dark:text-red-400",
    };
    return colors[level as keyof typeof colors] || "text-gray-600";
  },
}));

const BASE_TIME = new Date("2025-01-01T12:00:00Z").getTime();

const mockFeeds = [
  {
    id: "1",
    name: "123 Line Feed",
    status: "active",
    lastSuccessAt: new Date(BASE_TIME - 10_000).toISOString(),
    avgLatencyMs: 150,
  },
  {
    id: "2",
    name: "ACE Line Feed",
    status: "active",
    lastSuccessAt: new Date(BASE_TIME - 30_000).toISOString(),
    avgLatencyMs: 200,
  },
  {
    id: "3",
    name: "BDFM Line Feed",
    status: "active",
    lastSuccessAt: new Date(BASE_TIME - 60_000).toISOString(),
    avgLatencyMs: 180,
  },
  {
    id: "4",
    name: "G Line Feed",
    status: "circuit_open",
    lastSuccessAt: new Date(BASE_TIME - 120_000).toISOString(),
    avgLatencyMs: 0,
  },
  {
    id: "5",
    name: "JZ Line Feed",
    status: "never_polled",
    lastSuccessAt: null,
    avgLatencyMs: 0,
  },
] as const;

describe("DataHealth", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("rendering", () => {
    it("renders section header", () => {
      render(<DataHealth feeds={mockFeeds.slice(0, 1)} />);

      expect(screen.getByText("Data Health")).toBeInTheDocument();
    });

    it("renders fresh feed count", () => {
      render(<DataHealth feeds={mockFeeds} />);

      expect(screen.getByText("1/5 feeds fresh")).toBeInTheDocument();
    });

    it("renders all feeds", () => {
      render(<DataHealth feeds={mockFeeds} />);

      expect(screen.getByText("123 Line Feed")).toBeInTheDocument();
      expect(screen.getByText("ACE Line Feed")).toBeInTheDocument();
      expect(screen.getByText("BDFM Line Feed")).toBeInTheDocument();
      expect(screen.getByText("G Line Feed")).toBeInTheDocument();
      expect(screen.getByText("JZ Line Feed")).toBeInTheDocument();
    });
  });

  describe("freshness indicators", () => {
    it("shows green dot for fresh feeds (<15s)", () => {
      render(<DataHealth feeds={[mockFeeds[0]]} />);

      const dot = screen.getByText("123 Line Feed").previousElementSibling;
      expect(dot).toHaveClass("bg-green-500");
    });

    it("shows gray dot for aging feeds (15-45s)", () => {
      render(<DataHealth feeds={[mockFeeds[1]]} />);

      const dot = screen.getByText("ACE Line Feed").previousElementSibling;
      expect(dot).toHaveClass("bg-gray-400");
    });

    it("shows amber dot for stale feeds (45-90s)", () => {
      render(<DataHealth feeds={[mockFeeds[2]]} />);

      const dot = screen.getByText("BDFM Line Feed").previousElementSibling;
      expect(dot).toHaveClass("bg-amber-500");
    });

    it("shows red dot for very stale feeds (>90s)", () => {
      const staleFeed = {
        ...mockFeeds[2],
        lastSuccessAt: new Date(BASE_TIME - 120_000).toISOString(),
      };
      render(<DataHealth feeds={[staleFeed]} />);

      const dot = screen.getByText("BDFM Line Feed").previousElementSibling;
      expect(dot).toHaveClass("bg-red-500");
    });
  });

  describe("feed age display", () => {
    it("displays age in seconds for fresh feeds", () => {
      render(<DataHealth feeds={[mockFeeds[0]]} />);

      expect(screen.getByText("10s")).toBeInTheDocument();
    });

    it("displays age in minutes for older feeds", () => {
      render(<DataHealth feeds={[mockFeeds[2]]} />);

      expect(screen.getByText("1m 0s")).toBeInTheDocument();
    });
  });

  describe("latency display", () => {
    it("shows latency when available", () => {
      render(<DataHealth feeds={[mockFeeds[0]]} />);

      expect(screen.getByText("150ms")).toBeInTheDocument();
    });

    it("does not show latency when zero", () => {
      render(<DataHealth feeds={[mockFeeds[3]]} />);

      expect(screen.queryByText("0ms")).not.toBeInTheDocument();
    });
  });

  describe("circuit open status", () => {
    it("shows circuit open status for down feeds", () => {
      render(<DataHealth feeds={[mockFeeds[3]]} />);

      expect(screen.getByText("Circuit open")).toBeInTheDocument();
    });

    it("shows pulsing red dot for circuit open", () => {
      render(<DataHealth feeds={[mockFeeds[3]]} />);

      const dot = screen.getByText("G Line Feed").previousElementSibling;
      expect(dot).toHaveClass("bg-red-500", "animate-pulse");
    });

    it("shows red text for circuit open", () => {
      render(<DataHealth feeds={[mockFeeds[3]]} />);

      const statusText = screen.getByText("Circuit open");
      expect(statusText).toHaveClass("text-red-500");
    });
  });

  describe("never polled status", () => {
    it("shows never polled status", () => {
      render(<DataHealth feeds={[mockFeeds[4]]} />);

      expect(screen.getByText("Never polled")).toBeInTheDocument();
    });

    it("shows pulsing red dot for never polled", () => {
      render(<DataHealth feeds={[mockFeeds[4]]} />);

      const dot = screen.getByText("JZ Line Feed").previousElementSibling;
      expect(dot).toHaveClass("bg-red-500", "animate-pulse");
    });
  });

  describe("sorting", () => {
    it("sorts feeds by age (freshest first)", () => {
      render(<DataHealth feeds={mockFeeds.slice(0, 3)} />);

      const feeds = screen.getAllByText(/Line Feed/);
      expect(feeds[0]).toHaveTextContent("123 Line Feed");
      expect(feeds[1]).toHaveTextContent("ACE Line Feed");
      expect(feeds[2]).toHaveTextContent("BDFM Line Feed");
    });
  });

  describe("empty state", () => {
    it("shows 0/0 when no feeds", () => {
      render(<DataHealth feeds={[]} />);

      expect(screen.getByText("0/0 feeds fresh")).toBeInTheDocument();
    });

    it("shows no feeds when empty", () => {
      const { container } = render(<DataHealth feeds={[]} />);

      const feedItems = container.querySelectorAll('[class*="py-1.5"]');
      expect(feedItems.length).toBe(0);
    });
  });

  describe("styling", () => {
    it("has proper section structure", () => {
      const { container } = render(<DataHealth feeds={mockFeeds} />);

      const section = container.querySelector("section");
      expect(section).toBeInTheDocument();
      expect(section).toHaveClass("mt-6");
    });

    it("has rounded container", () => {
      const { container } = render(<DataHealth feeds={mockFeeds} />);

      const feedContainer = container.querySelector(".rounded-xl");
      expect(feedContainer).toBeInTheDocument();
    });
  });
});
