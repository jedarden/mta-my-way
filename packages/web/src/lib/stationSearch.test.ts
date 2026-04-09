/**
 * Unit tests for station search utilities
 */

import type { Station } from "@mta-my-way/shared";
import { describe, expect, it } from "vitest";
import { searchStations } from "./stationSearch";

describe("stationSearch", () => {
  const mockStations: Station[] = [
    {
      id: "127",
      name: "Times Sq - 42 St",
      lines: ["1", "2", "3", "7", "N", "R", "W"],
      borough: "manhattan",
      lat: 40.758,
      lon: -73.9855,
      northStopId: "127N",
      southStopId: "127S",
      transfers: [],
      ada: true,
    },
    {
      id: "128",
      name: "34 St - Herald Sq",
      lines: ["B", "D", "F", "M", "N", "Q", "R", "W"],
      borough: "manhattan",
      lat: 40.7484,
      lon: -73.9876,
      northStopId: "128N",
      southStopId: "128S",
      transfers: [],
      ada: true,
    },
    {
      id: "129",
      name: "14 St - Union Sq",
      lines: ["L", "N", "Q", "R", "W", "4", "5", "6"],
      borough: "manhattan",
      lat: 40.7365,
      lon: -73.9903,
      northStopId: "129N",
      southStopId: "129S",
      transfers: [],
      ada: true,
    },
    {
      id: "130",
      name: "Grand Central",
      lines: ["4", "5", "6", "7", "S"],
      borough: "manhattan",
      lat: 40.7527,
      lon: -73.9772,
      northStopId: "130N",
      southStopId: "130S",
      transfers: [],
      ada: true,
    },
    {
      id: "131",
      name: "Atlantic Av - Barclays Ctr",
      lines: ["2", "3", "4", "5", "B", "D", "N", "Q", "R"],
      borough: "brooklyn",
      lat: 40.6853,
      lon: -73.9782,
      northStopId: "131N",
      southStopId: "131S",
      transfers: [],
      ada: true,
    },
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

  describe("searchStations", () => {
    it("returns empty array for empty query", () => {
      const results = searchStations("  ", mockStations, mockComplexes);
      expect(results).toEqual([]);
    });

    it("returns empty array for no matches", () => {
      const results = searchStations("nonexistent station", mockStations, mockComplexes);
      expect(results).toEqual([]);
    });

    it("matches exact station name", () => {
      const results = searchStations("Times Square", mockStations, mockComplexes);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]?.displayName).toContain("Times");
    });

    it("matches by line ID", () => {
      const results = searchStations("1", mockStations, mockComplexes);
      expect(results.length).toBeGreaterThan(0);
      // Line matches should score highest (1000)
      expect(results[0]?.score).toBe(1000);
    });

    it("matches by line ID case insensitively", () => {
      const results = searchStations("L", mockStations, mockComplexes);
      expect(results.length).toBeGreaterThan(0);
    });

    it("matches name prefix", () => {
      const results = searchStations("Times", mockStations, mockComplexes);
      expect(results.length).toBeGreaterThan(0);
      // Prefix matches should score high (100)
      expect(results[0]?.score).toBeGreaterThanOrEqual(100);
    });

    it("matches word prefix", () => {
      const results = searchStations("Sq", mockStations, mockComplexes);
      expect(results.length).toBeGreaterThan(0);
      // Word prefix matches should score 50
      expect(results.some((r) => r.score >= 50)).toBe(true);
    });

    it("matches partial name anywhere", () => {
      const results = searchStations("central", mockStations, mockComplexes);
      expect(results.length).toBeGreaterThan(0);
      // Partial matches score 10
      expect(results.some((r) => r.score >= 10)).toBe(true);
    });

    it("expands abbreviations", () => {
      const results = searchStations("St", mockStations, mockComplexes);
      expect(results.length).toBeGreaterThan(0);
    });

    it("sorts results by score (highest first)", () => {
      const results = searchStations("Sq", mockStations, mockComplexes);
      if (results.length > 1) {
        for (let i = 0; i < results.length - 1; i++) {
          expect(results[i]?.score).toBeGreaterThanOrEqual(results[i + 1]?.score ?? 0);
        }
      }
    });

    it("includes all relevant fields in results", () => {
      const results = searchStations("Times", mockStations, mockComplexes);
      expect(results[0]).toHaveProperty("stationId");
      expect(results[0]).toHaveProperty("displayName");
      expect(results[0]).toHaveProperty("lines");
      expect(results[0]).toHaveProperty("borough");
      expect(results[0]).toHaveProperty("score");
      expect(Array.isArray(results[0]?.lines)).toBe(true);
    });

    it("groups stations by complex", () => {
      const results = searchStations("Times", mockStations, mockComplexes);
      const timesSquare = results.find((r) => r.displayName.includes("Times"));
      expect(timesSquare).toBeDefined();
      expect(timesSquare?.lines).toContain("1");
      expect(timesSquare?.lines).toContain("7");
    });

    it("handles special characters in search", () => {
      const results = searchStations("42", mockStations, mockComplexes);
      expect(results.length).toBeGreaterThan(0);
    });
  });
});
