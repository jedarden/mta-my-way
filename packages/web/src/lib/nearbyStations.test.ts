/**
 * Unit tests for nearby stations utilities
 */

import { describe, expect, it } from "vitest";
import { findNearbyStations, formatDistance, isInNYCArea } from "./nearbyStations";

describe("nearbyStations", () => {
  const mockStations = [
    {
      id: "127",
      name: "Times Sq - 42 St",
      lines: ["1", "2", "3", "7"],
      borough: "Manhattan",
      lat: 40.758,
      lon: -73.9855,
    },
    {
      id: "128",
      name: "34 St - Herald Sq",
      lines: ["B", "D", "F", "M", "N", "Q", "R"],
      borough: "Manhattan",
      lat: 40.7484,
      lon: -73.9876,
    },
    {
      id: "129",
      name: "14 St - Union Sq",
      lines: ["L", "N", "Q", "R", "W"],
      borough: "Manhattan",
      lat: 40.7365,
      lon: -73.9903,
    },
    {
      id: "130",
      name: "Grand Central",
      lines: ["4", "5", "6", "7"],
      borough: "Manhattan",
      lat: 40.7527,
      lon: -73.9772,
    },
    {
      id: "131",
      name: "Atlantic Av - Barclays Ctr",
      lines: ["2", "3", "4", "5"],
      borough: "Brooklyn",
      lat: 40.6853,
      lon: -73.9782,
    },
    { id: "132", name: "Far Rockaway", lines: ["A"], borough: "Queens", lat: 40.6, lon: -73.75 },
  ];

  const mockComplexes = [
    {
      complexId: "complex1",
      name: "Times Sq - 42 St",
      stations: ["127"],
      allLines: ["1", "2", "3", "7", "N", "R", "W"],
    },
    {
      complexId: "complex2",
      name: "Grand Central - 42 St",
      stations: ["130"],
      allLines: ["4", "5", "6", "7", "S"],
    },
  ];

  describe("findNearbyStations", () => {
    it("returns empty array for no stations", () => {
      const results = findNearbyStations(40.75, -73.98, [], mockComplexes);
      expect(results).toEqual([]);
    });

    it("finds nearest stations", () => {
      // Times Square coordinates
      const results = findNearbyStations(40.758, -73.9855, mockStations, mockComplexes, 3, 2.0);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].stationId).toBe("127"); // Times Square itself
    });

    it("sorts results by distance", () => {
      const results = findNearbyStations(40.75, -73.98, mockStations, mockComplexes, 5, 2.0);
      if (results.length > 1) {
        for (let i = 0; i < results.length - 1; i++) {
          expect(results[i].distanceKm).toBeLessThanOrEqual(results[i + 1].distanceKm);
        }
      }
    });

    it("respects maxStations parameter", () => {
      const results = findNearbyStations(40.75, -73.98, mockStations, mockComplexes, 2, 2.0);
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it("respects maxDistanceKm parameter", () => {
      // Looking for stations within 0.5km of Times Square
      const results = findNearbyStations(40.758, -73.9855, mockStations, mockComplexes, 10, 0.5);
      expect(results.length).toBeLessThanOrEqual(2);
      results.forEach((result) => {
        expect(result.distanceKm).toBeLessThanOrEqual(0.5);
      });
    });

    it("calculates walking time correctly", () => {
      const results = findNearbyStations(40.758, -73.9855, mockStations, mockComplexes, 1, 2.0);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].walkingMinutes).toBe(0); // Same location
      expect(results[0].walkingMinutes).toBeGreaterThanOrEqual(0);
    });

    it("includes all required fields", () => {
      const results = findNearbyStations(40.758, -73.9855, mockStations, mockComplexes, 1, 2.0);
      expect(results[0]).toHaveProperty("stationId");
      expect(results[0]).toHaveProperty("stationName");
      expect(results[0]).toHaveProperty("lines");
      expect(results[0]).toHaveProperty("distanceKm");
      expect(results[0]).toHaveProperty("walkingMinutes");
      expect(results[0]).toHaveProperty("borough");
    });

    it("deduplicates by complex", () => {
      // Times Square and Grand Central are both in complexes
      const results = findNearbyStations(40.755, -73.98, mockStations, mockComplexes, 10, 2.0);
      const uniqueComplexes = new Set(results.map((r) => r.stationId));
      expect(uniqueComplexes.size).toBe(results.length);
    });

    it("uses complex name when part of a complex", () => {
      const results = findNearbyStations(40.758, -73.9855, mockStations, mockComplexes, 1, 2.0);
      expect(results[0].stationName).toBe("Times Sq - 42 St");
    });

    it("includes all lines from complex", () => {
      const results = findNearbyStations(40.758, -73.9855, mockStations, mockComplexes, 1, 2.0);
      expect(results[0].lines).toContain("1");
      expect(results[0].lines).toContain("N");
      expect(results[0].lines).toContain("R");
    });
  });

  describe("isInNYCArea", () => {
    it("returns true for NYC coordinates", () => {
      expect(isInNYCArea(40.758, -73.9855)).toBe(true); // Manhattan
      expect(isInNYCArea(40.6853, -73.9782)).toBe(true); // Brooklyn
      expect(isInNYCArea(40.7282, -73.7949)).toBe(true); // Queens
      expect(isInNYCArea(40.5795, -74.1502)).toBe(true); // Staten Island
    });

    it("returns false for coordinates outside NYC", () => {
      expect(isInNYCArea(40.7128, -75.0)).toBe(false); // West of NYC
      expect(isInNYCArea(41.0, -73.9)).toBe(false); // North of NYC
      expect(isInNYCArea(40.4, -73.9)).toBe(false); // South of NYC
      expect(isInNYCArea(40.7, -73.5)).toBe(false); // East of NYC
    });

    it("handles boundary cases", () => {
      expect(isInNYCArea(40.49, -73.9)).toBe(true); // Just inside south boundary
      expect(isInNYCArea(40.48, -73.9)).toBe(false); // Just outside south boundary
      expect(isInNYCArea(40.92, -73.9)).toBe(true); // Just inside north boundary
      expect(isInNYCArea(40.93, -73.9)).toBe(false); // Just outside north boundary
      expect(isInNYCArea(40.7, -74.26)).toBe(true); // Just inside west boundary
      expect(isInNYCArea(40.7, -74.27)).toBe(false); // Just outside west boundary
      expect(isInNYCArea(40.7, -73.7)).toBe(true); // Just inside east boundary
      expect(isInNYCArea(40.7, -73.69)).toBe(false); // Just outside east boundary
    });
  });

  describe("formatDistance", () => {
    it("formats meters for distances < 0.1 km", () => {
      expect(formatDistance(0.05)).toBe("50 m");
      expect(formatDistance(0.09)).toBe("90 m");
    });

    it("formats meters for distances < 1 km", () => {
      expect(formatDistance(0.1)).toBe("100 m");
      expect(formatDistance(0.5)).toBe("500 m");
      expect(formatDistance(0.9)).toBe("900 m");
    });

    it("formats kilometers for distances >= 1 km", () => {
      expect(formatDistance(1)).toBe("1.0 km");
      expect(formatDistance(1.5)).toBe("1.5 km");
      expect(formatDistance(2.25)).toBe("2.3 km");
    });

    it("handles zero", () => {
      expect(formatDistance(0)).toBe("0 m");
    });

    it("rounds appropriately", () => {
      expect(formatDistance(0.094)).toBe("94 m");
      expect(formatDistance(1.234)).toBe("1.2 km");
    });
  });
});
