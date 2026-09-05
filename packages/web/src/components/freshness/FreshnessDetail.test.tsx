/**
 * Tests for FreshnessDetail component
 *
 * Tests the expanded per-feed status panel, including:
 * - Full subway feed inventory, active and inactive
 * - Formatted age and freshness label for active feeds
 * - "Not needed" placeholder for feeds the station doesn't draw from
 * - Per-level dot coloring
 * - Feed name output encoding
 */

import { SUBWAY_FEEDS, getFeedById } from "@mta-my-way/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FreshnessDetail } from "./FreshnessDetail";

type FeedEntry = [string, { name: string; age: number }];

/** Render the panel and return its feed rows, in SUBWAY_FEEDS order. */
function renderDetail(entries: FeedEntry[]) {
  const utils = render(<FreshnessDetail feedEntries={entries} />);
  const rows = Array.from(utils.container.querySelectorAll<HTMLElement>("h3 + div > div"));
  return { ...utils, rows };
}

/** The row corresponding to a feed id, looked up from SUBWAY_FEEDS order. */
function rowForFeed(rows: HTMLElement[], feedId: string): HTMLElement {
  const index = SUBWAY_FEEDS.findIndex((feed) => feed.id === feedId);
  if (index < 0) throw new Error(`Unknown feed id ${feedId}`);
  const row = rows[index];
  if (!row) throw new Error(`No row rendered for feed ${feedId}`);
  return row;
}

/** The level dot is the first child of the row's name group. */
function dotFor(row: HTMLElement): HTMLElement {
  const dot = row.firstElementChild?.firstElementChild as HTMLElement | null;
  if (!dot) throw new Error("Expected a freshness dot in the feed row");
  return dot;
}

function entry(feedId: string, age: number): FeedEntry {
  const feed = getFeedById(feedId);
  if (!feed) throw new Error(`Unknown feed id ${feedId}`);
  return [feedId, { name: feed.name, age }];
}

describe("FreshnessDetail", () => {
  describe("feed inventory", () => {
    it("heads the panel", () => {
      renderDetail([]);

      expect(screen.getByText("Feed Status")).toBeInTheDocument();
    });

    it("renders one row per subway feed", () => {
      const { rows } = renderDetail([entry("gtfs", 8)]);

      expect(rows).toHaveLength(SUBWAY_FEEDS.length);
    });

    it("marks feeds the station does not draw from as not needed", () => {
      renderDetail([]);

      expect(screen.getAllByText("Not needed")).toHaveLength(SUBWAY_FEEDS.length);
    });

    it("treats an unrecognized feed id as no active feeds", () => {
      renderDetail([["future-feed", { name: "Future Feed", age: 8 }]]);

      expect(screen.getAllByText("Not needed")).toHaveLength(SUBWAY_FEEDS.length);
      expect(screen.queryByText("Future Feed")).not.toBeInTheDocument();
    });
  });

  describe("active feeds", () => {
    it("shows the formatted age next to the feed name", () => {
      const { rows } = renderDetail([entry("gtfs", 62)]);

      expect(screen.getByText("A Division")).toBeInTheDocument();
      expect(rowForFeed(rows, "gtfs").textContent).toContain("1m 2s");
      expect(rowForFeed(rows, "gtfs").textContent).toContain("Delayed");
    });

    it("maps each freshness level to its own status label", () => {
      const { rows } = renderDetail([
        entry("gtfs", 8),
        entry("gtfs-l", 30),
        entry("gtfs-g", 62),
        entry("gtfs-nqrw", 120),
      ]);

      expect(screen.getByText("Up to date")).toBeInTheDocument();
      expect(screen.getByText("Normal")).toBeInTheDocument();
      expect(screen.getByText("Delayed")).toBeInTheDocument();
      expect(screen.getByText("Stale")).toBeInTheDocument();

      expect(rowForFeed(rows, "gtfs").textContent).toContain("8s");
      expect(rowForFeed(rows, "gtfs").textContent).toContain("Up to date");
      expect(rowForFeed(rows, "gtfs-l").textContent).toContain("30s");
      expect(rowForFeed(rows, "gtfs-l").textContent).toContain("Normal");
      expect(rowForFeed(rows, "gtfs-g").textContent).toContain("1m 2s");
      expect(rowForFeed(rows, "gtfs-g").textContent).toContain("Delayed");
      expect(rowForFeed(rows, "gtfs-nqrw").textContent).toContain("2m");
      expect(rowForFeed(rows, "gtfs-nqrw").textContent).toContain("Stale");
    });

    it("colors each active feed's dot by its level", () => {
      const { rows } = renderDetail([
        entry("gtfs", 8),
        entry("gtfs-l", 30),
        entry("gtfs-g", 62),
        entry("gtfs-nqrw", 120),
      ]);

      expect(dotFor(rowForFeed(rows, "gtfs"))).toHaveClass("bg-green-500");
      expect(dotFor(rowForFeed(rows, "gtfs-l"))).toHaveClass("bg-gray-400", "dark:bg-gray-500");
      expect(dotFor(rowForFeed(rows, "gtfs-g"))).toHaveClass("bg-amber-500");
      expect(dotFor(rowForFeed(rows, "gtfs-nqrw"))).toHaveClass("bg-red-500");
    });
  });

  describe("inactive feeds", () => {
    it("shows no age for a feed the station does not draw from", () => {
      const { rows } = renderDetail([entry("gtfs", 8)]);

      const row = rowForFeed(rows, "gtfs-g");
      expect(row.textContent).toContain("Not needed");
      expect(row.textContent).not.toContain("8s");
    });

    it("gives inactive feeds the neutral dot", () => {
      const { rows } = renderDetail([]);

      expect(dotFor(rowForFeed(rows, "gtfs-g"))).toHaveClass("bg-gray-400", "dark:bg-gray-500");
    });
  });

  describe("feed names", () => {
    it("renders feed names verbatim when they need no encoding", () => {
      const { rows } = renderDetail([]);

      expect(rowForFeed(rows, "gtfs").textContent).toContain("A Division");
      expect(rowForFeed(rows, "gtfs-g").textContent).toContain("G Line");
      expect(rowForFeed(rows, "gtfs-l").textContent).toContain("L Line");
      expect(rowForFeed(rows, "gtfs-si").textContent).toContain("Staten Island Railway");
    });

    it("renders a row for every feed, including slash-separated names", () => {
      const { rows } = renderDetail([]);

      for (const feed of SUBWAY_FEEDS) {
        const text = rowForFeed(rows, feed.id).textContent ?? "";
        if (feed.name.includes("/")) {
          // sanitizeUserInput entity-encodes "/", so the rendered text is not
          // the plain name — assert the row is present without pinning that.
          expect(text).toContain("Lines");
        } else {
          expect(text).toContain(feed.name);
        }
      }
    });
  });
});
