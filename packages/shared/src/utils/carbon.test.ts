/**
 * Unit tests for carbon savings utilities
 */

import { describe, expect, it } from "vitest";
import {
  calculateCO2SavingsGrams,
  calculateCO2SavingsKg,
  calculateCO2SavingsTons,
  calculateCarbonSavingsSummary,
  formatCarbonSavings,
  formatDistance,
  getEnvironmentalEquivalents,
  kmToMiles,
  milesToKm,
} from "./carbon.js";

describe("carbon utilities", () => {
  describe("kmToMiles", () => {
    it("converts kilometers to miles", () => {
      expect(kmToMiles(1)).toBeCloseTo(0.621371, 5);
      expect(kmToMiles(10)).toBeCloseTo(6.21371, 4);
      expect(kmToMiles(100)).toBeCloseTo(62.1371, 3);
    });

    it("handles zero", () => {
      expect(kmToMiles(0)).toBe(0);
    });
  });

  describe("milesToKm", () => {
    it("converts miles to kilometers", () => {
      expect(milesToKm(1)).toBeCloseTo(1.60934, 4);
      expect(milesToKm(10)).toBeCloseTo(16.0934, 3);
      expect(milesToKm(100)).toBeCloseTo(160.934, 2);
    });

    it("handles zero", () => {
      expect(milesToKm(0)).toBe(0);
    });

    it("is inverse of kmToMiles", () => {
      const originalKm = 50;
      const miles = kmToMiles(originalKm);
      const backToKm = milesToKm(miles);
      expect(backToKm).toBeCloseTo(originalKm, 3);
    });
  });

  describe("calculateCO2SavingsGrams", () => {
    it("calculates CO2 savings in grams", () => {
      // 1 km = 0.621371 miles
      // Savings per mile = 374g
      // 1 km savings = 0.621371 * 374 ≈ 232.39g
      expect(calculateCO2SavingsGrams(1)).toBeCloseTo(232.4, 0);
      expect(calculateCO2SavingsGrams(10)).toBeCloseTo(2324, 0);
      expect(calculateCO2SavingsGrams(100)).toBeCloseTo(23239, 0);
    });

    it("handles zero", () => {
      expect(calculateCO2SavingsGrams(0)).toBe(0);
    });
  });

  describe("calculateCO2SavingsKg", () => {
    it("calculates CO2 savings in kilograms", () => {
      expect(calculateCO2SavingsKg(10)).toBeCloseTo(2.32, 1);
      expect(calculateCO2SavingsKg(100)).toBeCloseTo(23.2, 1);
    });

    it("handles zero", () => {
      expect(calculateCO2SavingsKg(0)).toBe(0);
    });
  });

  describe("calculateCO2SavingsTons", () => {
    it("calculates CO2 savings in metric tons", () => {
      expect(calculateCO2SavingsTons(1000)).toBeCloseTo(0.232, 2);
      expect(calculateCO2SavingsTons(10000)).toBeCloseTo(2.32, 1);
    });

    it("handles zero", () => {
      expect(calculateCO2SavingsTons(0)).toBe(0);
    });
  });

  describe("calculateCarbonSavingsSummary", () => {
    it("calculates comprehensive summary", () => {
      const summary = calculateCarbonSavingsSummary(100);

      expect(summary.totalDistanceKm).toBe(100);
      expect(summary.totalDistanceMiles).toBeCloseTo(62.14, 1);
      expect(summary.savingsGrams).toBeCloseTo(23239, 0);
      expect(summary.savingsKg).toBeCloseTo(23.2, 1);
      expect(summary.savingsTons).toBeCloseTo(0.023, 2);
      expect(summary.carFreeDays).toBeCloseTo(2, 0);
      expect(summary.equivalentTrees).toBeCloseTo(1, 0);
    });

    it("calculates car free days correctly", () => {
      const summary = calculateCarbonSavingsSummary(64.37); // ~40 miles
      expect(summary.carFreeDays).toBeCloseTo(1, 0);
    });

    it("calculates equivalent trees correctly", () => {
      // 1 tree absorbs ~21kg CO2/year
      const summary = calculateCarbonSavingsSummary(90); // ~21kg savings
      expect(summary.equivalentTrees).toBeCloseTo(1, 0);
    });

    it("handles zero distance", () => {
      const summary = calculateCarbonSavingsSummary(0);
      expect(summary.totalDistanceKm).toBe(0);
      expect(summary.savingsGrams).toBe(0);
    });
  });

  describe("formatCarbonSavings", () => {
    it("formats grams for < 1 kg", () => {
      expect(formatCarbonSavings(0.1)).toBe("100g CO₂ saved");
      expect(formatCarbonSavings(0.5)).toBe("500g CO₂ saved");
      expect(formatCarbonSavings(0.999)).toBe("999g CO₂ saved");
    });

    it("formats kg for 1-999 kg", () => {
      expect(formatCarbonSavings(1)).toBe("1.0kg CO₂ saved");
      expect(formatCarbonSavings(50.5)).toBe("50.5kg CO₂ saved");
      expect(formatCarbonSavings(999)).toBe("999.0kg CO₂ saved");
    });

    it("formats tons for >= 1000 kg", () => {
      expect(formatCarbonSavings(1000)).toBe("1.00 tons CO₂ saved");
      expect(formatCarbonSavings(5000)).toBe("5.00 tons CO₂ saved");
      expect(formatCarbonSavings(10500)).toBe("10.50 tons CO₂ saved");
    });

    it("handles zero", () => {
      expect(formatCarbonSavings(0)).toBe("0g CO₂ saved");
    });
  });

  describe("formatDistance", () => {
    it("formats feet for distances < 1 mile", () => {
      expect(formatDistance(0.1)).toBe("328 ft"); // 0.1 km ≈ 0.062 miles ≈ 328 ft
      expect(formatDistance(0.5)).toBe("1640 ft"); // 0.5 km ≈ 0.31 miles ≈ 1640 ft
    });

    it("formats miles with decimal for 1-10 miles", () => {
      expect(formatDistance(5)).toBe("3.1 mi"); // 5 km ≈ 3.1 miles
      expect(formatDistance(10)).toBe("6.2 mi"); // 10 km ≈ 6.2 miles
    });

    it("formats rounded miles for >= 10 miles", () => {
      expect(formatDistance(50)).toBe("31 mi"); // 50 km ≈ 31 miles
      expect(formatDistance(100)).toBe("62 mi"); // 100 km ≈ 62 miles
    });

    it("handles zero", () => {
      expect(formatDistance(0)).toBe("0 ft");
    });
  });

  describe("getEnvironmentalEquivalents", () => {
    it("calculates tree equivalents", () => {
      const equivalents = getEnvironmentalEquivalents(21); // 1 tree worth
      expect(equivalents.trees).toBe("1 tree");

      const many = getEnvironmentalEquivalents(42);
      expect(many.trees).toBe("2 trees");
    });

    it("calculates car miles equivalent", () => {
      // Car emits 404g per mile
      // 21kg = 21000g / 404 ≈ 52 miles
      const equivalents = getEnvironmentalEquivalents(21);
      expect(equivalents.carMiles).toMatch(/miles not driven/);
      expect(equivalents.carMiles).toContain("52");
    });

    it("calculates flight equivalents", () => {
      // NYC to LA ~700kg CO2
      const equivalents = getEnvironmentalEquivalents(700);
      expect(equivalents.flights).toBe("1.0 NYC↔LA flight");

      const twoFlights = getEnvironmentalEquivalents(1400);
      expect(twoFlights.flights).toBe("2.0 NYC↔LA flights");
    });

    it("handles zero", () => {
      const equivalents = getEnvironmentalEquivalents(0);
      expect(equivalents.trees).toBe("0 trees");
    });
  });
});
