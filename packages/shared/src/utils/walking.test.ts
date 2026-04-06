/**
 * Unit tests for walking utilities
 */

import { describe, expect, it } from "vitest";
import {
  haversineDistance,
  walkingTime,
  walkingTimeFromDistance,
  walkingTimeBetweenStations,
  walkingDistanceBetweenStations,
  isWalkingViable,
  compareWalkingVsTransit,
  formatWalkingDistance,
  formatWalkingTime,
  type StationWithCoords,
} from "./walking.js";

describe("walking utilities", () => {
  describe("haversineDistance", () => {
    it("calculates distance between two points", () => {
      // Times Square to Grand Central (approximately 1.2 km)
      const timesSquare = { lat: 40.758, lon: -73.9855 };
      const grandCentral = { lat: 40.7527, lon: -73.9772 };

      const distance = haversineDistance(
        timesSquare.lat,
        timesSquare.lon,
        grandCentral.lat,
        grandCentral.lon
      );

      expect(distance).toBeGreaterThan(1.0);
      expect(distance).toBeLessThan(1.5);
    });

    it("returns 0 for same location", () => {
      const distance = haversineDistance(40.758, -73.9855, 40.758, -73.9855);
      expect(distance).toBe(0);
    });

    it("handles short distances", () => {
      const distance = haversineDistance(40.758, -73.9855, 40.759, -73.986);
      expect(distance).toBeGreaterThan(0);
      expect(distance).toBeLessThan(0.5);
    });

    it("handles long distances", () => {
      // NYC to LA (approximately 3944 km)
      const nyc = { lat: 40.7128, lon: -74.006 };
      const la = { lat: 34.0522, lon: -118.2437 };

      const distance = haversineDistance(nyc.lat, nyc.lon, la.lat, la.lon);

      expect(distance).toBeGreaterThan(3900);
      expect(distance).toBeLessThan(4000);
    });
  });

  describe("walkingTime", () => {
    it("calculates walking time from coordinates", () => {
      // Times Square to Grand Central (~1.2 km)
      const timesSquare = { lat: 40.758, lon: -73.9855 };
      const grandCentral = { lat: 40.7527, lon: -73.9772 };

      const minutes = walkingTime(
        timesSquare.lat,
        timesSquare.lon,
        grandCentral.lat,
        grandCentral.lon
      );

      // 1.2 km at 4.5 km/h ≈ 16 minutes
      expect(minutes).toBeGreaterThan(10);
      expect(minutes).toBeLessThan(25);
    });

    it("returns 1 minute for very short distances", () => {
      const minutes = walkingTime(40.758, -73.9855, 40.7581, -73.9856);
      expect(minutes).toBe(1);
    });

    it("returns 0 for same location", () => {
      const minutes = walkingTime(40.758, -73.9855, 40.758, -73.9855);
      expect(minutes).toBe(0);
    });
  });

  describe("walkingTimeFromDistance", () => {
    it("calculates walking time from distance in km", () => {
      expect(walkingTimeFromDistance(1)).toBe(14); // 1 km / 4.5 km/h * 60 ≈ 13.33, ceil to 14
      expect(walkingTimeFromDistance(2)).toBe(27); // 2 km / 4.5 km/h * 60 ≈ 26.67, ceil to 27
    });

    it("returns 0 for 0 distance", () => {
      expect(walkingTimeFromDistance(0)).toBe(0);
    });
  });

  describe("walkingTimeBetweenStations", () => {
    it("calculates walking time between station objects", () => {
      const station1: StationWithCoords = { lat: 40.758, lon: -73.9855 };
      const station2: StationWithCoords = { lat: 40.7527, lon: -73.9772 };

      const minutes = walkingTimeBetweenStations(station1, station2);
      expect(minutes).toBeGreaterThan(0);
      expect(typeof minutes).toBe("number");
    });
  });

  describe("walkingDistanceBetweenStations", () => {
    it("calculates distance between station objects", () => {
      const station1: StationWithCoords = { lat: 40.758, lon: -73.9855 };
      const station2: StationWithCoords = { lat: 40.7527, lon: -73.9772 };

      const distance = walkingDistanceBetweenStations(station1, station2);
      expect(distance).toBeGreaterThan(1.0);
      expect(distance).toBeLessThan(1.5);
    });
  });

  describe("isWalkingViable", () => {
    it("returns true for short walks with few stops", () => {
      expect(isWalkingViable(10, 2)).toBe(true);
      expect(isWalkingViable(15, 3)).toBe(true);
    });

    it("returns false for long walks", () => {
      expect(isWalkingViable(25, 2)).toBe(false);
      expect(isWalkingViable(20, 2)).toBe(false); // 20 min is not < 20
    });

    it("returns false for many stops", () => {
      expect(isWalkingViable(10, 4)).toBe(false);
      expect(isWalkingViable(15, 5)).toBe(false);
    });
  });

  describe("compareWalkingVsTransit", () => {
    it("returns 'walk' when walking is significantly faster", () => {
      const result = compareWalkingVsTransit(10, 15, 5); // 10 min walk vs 20 min transit
      expect(result.walkingIsFaster).toBe(true);
      expect(result.recommendation).toBe("walk");
    });

    it("returns 'transit' when transit is significantly faster", () => {
      const result = compareWalkingVsTransit(20, 5, 10); // 20 min walk vs 15 min transit
      expect(result.walkingIsFaster).toBe(false);
      expect(result.recommendation).toBe("transit");
    });

    it("returns 'similar' when times are close (within 2 minutes)", () => {
      const result1 = compareWalkingVsTransit(15, 5, 10); // 15 min walk vs 15 min transit
      expect(result1.recommendation).toBe("similar");

      const result2 = compareWalkingVsTransit(15, 5, 12); // 15 min walk vs 17 min transit
      expect(result2.recommendation).toBe("similar");
    });

    it("calculates time difference correctly", () => {
      const result = compareWalkingVsTransit(10, 5, 20); // 10 min walk vs 25 min transit
      expect(result.timeDifference).toBe(15);
    });
  });

  describe("formatWalkingDistance", () => {
    it("formats meters for distances < 1 km", () => {
      expect(formatWalkingDistance(0.5)).toBe("500 m");
      expect(formatWalkingDistance(0.1)).toBe("100 m");
      expect(formatWalkingDistance(0.05)).toBe("50 m");
    });

    it("formats kilometers for distances >= 1 km", () => {
      expect(formatWalkingDistance(1)).toBe("1.0 km");
      expect(formatWalkingDistance(1.5)).toBe("1.5 km");
      expect(formatWalkingDistance(2.25)).toBe("2.3 km");
    });

    it("formats 0 km as 0 m", () => {
      expect(formatWalkingDistance(0)).toBe("0 m");
    });
  });

  describe("formatWalkingTime", () => {
    it("formats minutes", () => {
      expect(formatWalkingTime(1)).toBe("1 min walk");
      expect(formatWalkingTime(5)).toBe("5 min walk");
      expect(formatWalkingTime(15)).toBe("15 min walk");
    });

    it("formats < 1 minute", () => {
      expect(formatWalkingTime(0)).toBe("<1 min walk");
      expect(formatWalkingTime(0.5)).toBe("<1 min walk");
    });
  });
});
