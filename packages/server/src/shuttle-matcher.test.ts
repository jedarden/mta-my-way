/**
 * Unit tests for shuttle matcher
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { matchShuttle, resetShuttleCache } from "./shuttle-matcher.js";

// Mock the fs module to avoid file I/O during tests
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(() =>
    Promise.resolve(
      JSON.stringify([
        {
          lineId: "1",
          fromStopId: "101N",
          toStopId: "127S",
          fromStation: "Van Cortlandt Park - 242 St",
          toStation: "South Ferry",
          description: "1 train suspended, shuttle buses running",
          stops: [
            {
              stopId: "101N",
              stationName: "Van Cortlandt Park - 242 St",
              location: { lat: 40.8895, lon: -73.8877 },
            },
            {
              stopId: "127S",
              stationName: "South Ferry",
              location: { lat: 40.7022, lon: -74.0121 },
            },
          ],
          frequencyMinutes: "10",
          lastVerified: "2024-03-15",
        },
      ])
    )
  ),
}));

describe("shuttle matcher", () => {
  beforeEach(() => {
    // Clear the segments cache before each test
    resetShuttleCache();
  });

  describe("matchShuttle", () => {
    it("returns undefined when no lines match", async () => {
      const result = await matchShuttle(["A", "B"], ["127N"]);
      expect(result).toBeUndefined();
    });

    it("returns undefined when no stations overlap", async () => {
      const result = await matchShuttle(["1"], ["999N", "998N"]);
      expect(result).toBeUndefined();
    });

    it("returns shuttle info when line and station match", async () => {
      const result = await matchShuttle(["1"], ["101N"]);
      expect(result).toBeDefined();
      expect(result?.lineId).toBe("1");
      expect(result?.fromStopId).toBe("101N");
      expect(result?.toStopId).toBe("127S");
    });

    it("matches when station is in range", async () => {
      const result = await matchShuttle(["1"], ["115N"]);
      expect(result).toBeDefined();
    });

    it("matches with direction suffix stripped", async () => {
      const result = await matchShuttle(["1"], ["101"]);
      expect(result).toBeDefined();
    });

    it("returns frequency and verification info", async () => {
      const result = await matchShuttle(["1"], ["101N"]);
      expect(result?.frequencyMinutes).toBe("10");
      expect(result?.lastVerified).toBe("2024-03-15");
    });

    it("includes stop information", async () => {
      const result = await matchShuttle(["1"], ["101N"]);
      expect(result?.stops).toHaveLength(2);
      expect(result?.stops[0]?.nearStationId).toBe("101N");
      expect(result?.stops[1]?.nearStationId).toBe("127S");
    });

    it("matches multiple affected lines", async () => {
      const result = await matchShuttle(["A", "1", "B"], ["101N"]);
      expect(result).toBeDefined();
      expect(result?.lineId).toBe("1");
    });
  });
});
