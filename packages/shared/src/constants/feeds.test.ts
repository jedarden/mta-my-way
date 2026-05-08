/**
 * Tests for MTA GTFS-RT feed configuration.
 */

import { describe, expect, it } from "vitest";
import {
  CACHE_TTLS,
  GTFS_STATIC_URLS,
  LINE_TO_FEED,
  POLLING_INTERVALS,
  SUBWAY_FEEDS,
  getFeedById,
  getFeedForLine,
} from "./feeds";

describe("constants/feeds", () => {
  describe("SUBWAY_FEEDS", () => {
    it("contains all expected feeds", () => {
      const feedIds = SUBWAY_FEEDS.map((f) => f.id);
      expect(feedIds).toContain("gtfs");
      expect(feedIds).toContain("gtfs-ace");
      expect(feedIds).toContain("gtfs-bdfm");
      expect(feedIds).toContain("gtfs-g");
      expect(feedIds).toContain("gtfs-jz");
      expect(feedIds).toContain("gtfs-l");
      expect(feedIds).toContain("gtfs-nqrw");
      expect(feedIds).toContain("gtfs-si");
    });

    it("has unique feed IDs", () => {
      const feedIds = SUBWAY_FEEDS.map((f) => f.id);
      const uniqueIds = new Set(feedIds);
      expect(uniqueIds.size).toBe(feedIds.length);
    });

    it("has valid URLs for all feeds", () => {
      SUBWAY_FEEDS.forEach((feed) => {
        expect(feed.url).toMatch(/^https?:\/\//);
        expect(feed.url).toContain(feed.id);
      });
    });

    it("covers all NYC subway lines", () => {
      const allLines = SUBWAY_FEEDS.flatMap((f) => f.lines);
      const expectedLines = [
        "1",
        "2",
        "3",
        "4",
        "5",
        "6",
        "7",
        "A",
        "B",
        "C",
        "D",
        "E",
        "F",
        "G",
        "J",
        "L",
        "M",
        "N",
        "Q",
        "R",
        "S",
        "W",
        "Z",
        "GS",
        "SIR",
        "FS",
        "H",
      ];

      expectedLines.forEach((line) => {
        expect(allLines).toContain(line);
      });
    });

    it("has descriptive names for feeds", () => {
      SUBWAY_FEEDS.forEach((feed) => {
        expect(feed.name).toBeTruthy();
        expect(feed.name.length).toBeGreaterThan(0);
      });
    });
  });

  describe("LINE_TO_FEED", () => {
    it("maps every line to a feed", () => {
      const allLines = SUBWAY_FEEDS.flatMap((f) => f.lines);

      allLines.forEach((line) => {
        expect(LINE_TO_FEED[line]).toBeDefined();
      });
    });

    it("contains valid feed IDs", () => {
      const feedIds = new Set(SUBWAY_FEEDS.map((f) => f.id));
      Object.values(LINE_TO_FEED).forEach((feedId) => {
        expect(feedIds).toContain(feedId);
      });
    });
  });

  describe("getFeedForLine", () => {
    it("returns correct feed for A Division lines", () => {
      expect(getFeedForLine("1")?.id).toBe("gtfs");
      expect(getFeedForLine("6")?.id).toBe("gtfs");
      expect(getFeedForLine("7")?.id).toBe("gtfs");
    });

    it("returns correct feed for B Division lines", () => {
      expect(getFeedForLine("A")?.id).toBe("gtfs-ace");
      expect(getFeedForLine("F")?.id).toBe("gtfs-bdfm");
      expect(getFeedForLine("G")?.id).toBe("gtfs-g");
      expect(getFeedForLine("L")?.id).toBe("gtfs-l");
      expect(getFeedForLine("N")?.id).toBe("gtfs-nqrw");
    });

    it("returns undefined for unknown line", () => {
      expect(getFeedForLine("X")).toBeUndefined();
      expect(getFeedForLine("")).toBeUndefined();
    });

    it("returns feed config with all required fields", () => {
      const feed = getFeedForLine("1");
      expect(feed).toBeDefined();
      expect(feed?.id).toBeDefined();
      expect(feed?.name).toBeDefined();
      expect(feed?.lines).toBeDefined();
      expect(feed?.url).toBeDefined();
    });
  });

  describe("getFeedById", () => {
    it("returns correct feed by ID", () => {
      expect(getFeedById("gtfs")?.id).toBe("gtfs");
      expect(getFeedById("gtfs-ace")?.id).toBe("gtfs-ace");
    });

    it("returns undefined for unknown feed ID", () => {
      expect(getFeedById("gtfs-unknown")).toBeUndefined();
      expect(getFeedById("")).toBeUndefined();
    });
  });

  describe("POLLING_INTERVALS", () => {
    it("has all required interval types", () => {
      expect(POLLING_INTERVALS.arrivals).toBeDefined();
      expect(POLLING_INTERVALS.alerts).toBeDefined();
      expect(POLLING_INTERVALS.equipment).toBeDefined();
      expect(POLLING_INTERVALS.minRefresh).toBeDefined();
      expect(POLLING_INTERVALS.staleThreshold).toBeDefined();
      expect(POLLING_INTERVALS.grayThreshold).toBeDefined();
    });

    it("has reasonable interval values", () => {
      expect(POLLING_INTERVALS.arrivals).toBeGreaterThan(0);
      expect(POLLING_INTERVALS.alerts).toBeGreaterThan(0);
      expect(POLLING_INTERVALS.equipment).toBeGreaterThan(0);

      // Arrivals should update more frequently than alerts
      expect(POLLING_INTERVALS.arrivals).toBeLessThan(POLLING_INTERVALS.alerts);

      // Equipment should update least frequently
      expect(POLLING_INTERVALS.equipment).toBeGreaterThan(POLLING_INTERVALS.alerts);

      // Stale threshold should be greater than arrivals interval
      expect(POLLING_INTERVALS.staleThreshold).toBeGreaterThan(POLLING_INTERVALS.arrivals);

      // Gray threshold should be greater than stale threshold
      expect(POLLING_INTERVALS.grayThreshold).toBeGreaterThan(POLLING_INTERVALS.staleThreshold);
    });

    it("minRefresh is less than arrivals interval", () => {
      expect(POLLING_INTERVALS.minRefresh).toBeLessThan(POLLING_INTERVALS.arrivals);
    });
  });

  describe("CACHE_TTLS", () => {
    it("has all required TTL types", () => {
      expect(CACHE_TTLS.api).toBeDefined();
      expect(CACHE_TTLS.static).toBeDefined();
      expect(CACHE_TTLS.gtfsStatic).toBeDefined();
      expect(CACHE_TTLS.gtfsStaticStale).toBeDefined();
    });

    it("has appropriate TTL values", () => {
      // API TTL should be short (seconds)
      expect(CACHE_TTLS.api).toBeLessThan(60);

      // Static TTL should be very long (content-hashed assets)
      expect(CACHE_TTLS.static).toBeGreaterThan(86400); // More than a day

      // GTFS static should be about a day
      expect(CACHE_TTLS.gtfsStatic).toBeCloseTo(86400, 0);

      // Stale-while-revalidate should be longer
      expect(CACHE_TTLS.gtfsStaticStale).toBeGreaterThan(CACHE_TTLS.gtfsStatic);
    });
  });

  describe("GTFS_STATIC_URLS", () => {
    it("has all required URLs", () => {
      expect(GTFS_STATIC_URLS.base).toBeDefined();
      expect(GTFS_STATIC_URLS.supplemented).toBeDefined();
    });

    it("has valid URLs", () => {
      expect(GTFS_STATIC_URLS.base).toMatch(/^https?:\/\//);
      expect(GTFS_STATIC_URLS.supplemented).toMatch(/^https?:\/\//);

      expect(GTFS_STATIC_URLS.base).toContain("gtfs_subway.zip");
      expect(GTFS_STATIC_URLS.supplemented).toContain("gtfs_supplemented.zip");
    });

    it("uses the same base host", () => {
      const baseUrl = new URL(GTFS_STATIC_URLS.base).origin;
      const supplementedUrl = new URL(GTFS_STATIC_URLS.supplemented).origin;
      expect(baseUrl).toBe(supplementedUrl);
    });
  });

  describe("feed coverage", () => {
    it("all feeds have unique line coverage", () => {
      const feedLineCounts = SUBWAY_FEEDS.map((f) => f.lines.length);
      const totalLines = SUBWAY_FEEDS.reduce((sum, f) => sum + f.lines.length, 0);

      // Total should be greater than any individual feed
      expect(totalLines).toBeGreaterThan(Math.max(...feedLineCounts));
    });

    it("L line has its own dedicated feed", () => {
      const lFeed = getFeedForLine("L");
      expect(lFeed?.id).toBe("gtfs-l");
      expect(lFeed?.lines).toEqual(["L"]);
    });

    it("G line has its own dedicated feed", () => {
      const gFeed = getFeedForLine("G");
      expect(gFeed?.id).toBe("gtfs-g");
      expect(gFeed?.lines).toEqual(["G"]);
    });

    it("SIR has its own dedicated feed", () => {
      const sirFeed = getFeedForLine("SIR");
      expect(sirFeed?.id).toBe("gtfs-si");
      expect(sirFeed?.lines).toEqual(["SIR"]);
    });
  });
});
