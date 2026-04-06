/**
 * Unit tests for freshness utilities
 */

import { describe, expect, it } from "vitest";
import {
  formatFeedAge,
  getFreshnessDotColor,
  getFreshnessLevel,
  getFreshnessTextColor,
} from "./freshness.js";

describe("freshness utilities", () => {
  describe("getFreshnessLevel", () => {
    it("returns 'fresh' for feeds < 15 seconds old", () => {
      expect(getFreshnessLevel(0)).toBe("fresh");
      expect(getFreshnessLevel(10)).toBe("fresh");
      expect(getFreshnessLevel(14)).toBe("fresh");
    });

    it("returns 'neutral' for feeds 15-44 seconds old", () => {
      expect(getFreshnessLevel(15)).toBe("neutral");
      expect(getFreshnessLevel(30)).toBe("neutral");
      expect(getFreshnessLevel(44)).toBe("neutral");
    });

    it("returns 'amber' for feeds 45-89 seconds old", () => {
      expect(getFreshnessLevel(45)).toBe("amber");
      expect(getFreshnessLevel(60)).toBe("amber");
      expect(getFreshnessLevel(89)).toBe("amber");
    });

    it("returns 'red' for feeds >= 90 seconds old", () => {
      expect(getFreshnessLevel(90)).toBe("red");
      expect(getFreshnessLevel(120)).toBe("red");
      expect(getFreshnessLevel(300)).toBe("red");
    });
  });

  describe("getFreshnessTextColor", () => {
    it("returns correct Tailwind classes for each level", () => {
      expect(getFreshnessTextColor("fresh")).toBe("text-green-600 dark:text-green-400");
      expect(getFreshnessTextColor("neutral")).toBe("text-text-tertiary dark:text-dark-text-tertiary");
      expect(getFreshnessTextColor("amber")).toBe("text-amber-600 dark:text-amber-400");
      expect(getFreshnessTextColor("red")).toBe("text-red-600 dark:text-red-400");
    });
  });

  describe("getFreshnessDotColor", () => {
    it("returns correct Tailwind classes for each level", () => {
      expect(getFreshnessDotColor("fresh")).toBe("bg-green-500");
      expect(getFreshnessDotColor("neutral")).toBe("bg-gray-400 dark:bg-gray-500");
      expect(getFreshnessDotColor("amber")).toBe("bg-amber-500");
      expect(getFreshnessDotColor("red")).toBe("bg-red-500");
    });
  });

  describe("formatFeedAge", () => {
    it("formats seconds for < 60 seconds", () => {
      expect(formatFeedAge(0)).toBe("0s");
      expect(formatFeedAge(5)).toBe("5s");
      expect(formatFeedAge(30)).toBe("30s");
      expect(formatFeedAge(59)).toBe("59s");
    });

    it("formats minutes only when seconds are 0", () => {
      expect(formatFeedAge(60)).toBe("1m");
      expect(formatFeedAge(120)).toBe("2m");
      expect(formatFeedAge(180)).toBe("3m");
    });

    it("formats minutes and seconds when seconds are non-zero", () => {
      expect(formatFeedAge(65)).toBe("1m 5s");
      expect(formatFeedAge(90)).toBe("1m 30s");
      expect(formatFeedAge(125)).toBe("2m 5s");
    });

    it("rounds correctly", () => {
      expect(formatFeedAge(29.4)).toBe("29s");
      expect(formatFeedAge(29.6)).toBe("30s");
    });
  });
});
