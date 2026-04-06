/**
 * Unit tests for pattern analysis utilities
 */

import { describe, expect, it } from "vitest";
import {
  getCurrentTimeBucket,
  getDayCategory,
  getDayCategoryForTimestamp,
  getDayCategoryLabel,
  getTimeBucket,
  getTimeBucketForTimestamp,
  getTimeBucketLabel,
} from "./patterns.js";

describe("pattern utilities", () => {
  describe("getTimeBucket", () => {
    it("returns 'early_morning' for 4-6 AM", () => {
      expect(getTimeBucket(4)).toBe("early_morning");
      expect(getTimeBucket(5)).toBe("early_morning");
    });

    it("returns 'morning_rush' for 6-10 AM", () => {
      expect(getTimeBucket(6)).toBe("morning_rush");
      expect(getTimeBucket(8)).toBe("morning_rush");
      expect(getTimeBucket(9)).toBe("morning_rush");
    });

    it("returns 'midday' for 10 AM - 3 PM", () => {
      expect(getTimeBucket(10)).toBe("midday");
      expect(getTimeBucket(12)).toBe("midday");
      expect(getTimeBucket(14)).toBe("midday");
    });

    it("returns 'evening_rush' for 3-7 PM", () => {
      expect(getTimeBucket(15)).toBe("evening_rush");
      expect(getTimeBucket(17)).toBe("evening_rush");
      expect(getTimeBucket(18)).toBe("evening_rush");
    });

    it("returns 'night' for 7 PM - 4 AM", () => {
      expect(getTimeBucket(19)).toBe("night");
      expect(getTimeBucket(23)).toBe("night");
      expect(getTimeBucket(0)).toBe("night");
      expect(getTimeBucket(3)).toBe("night");
    });

    it("handles edge cases", () => {
      expect(getTimeBucket(3)).toBe("night"); // Before early morning
      expect(getTimeBucket(4)).toBe("early_morning"); // Start of early morning
      expect(getTimeBucket(6)).toBe("morning_rush"); // Start of morning rush
      expect(getTimeBucket(10)).toBe("midday"); // Start of midday
      expect(getTimeBucket(15)).toBe("evening_rush"); // Start of evening rush
      expect(getTimeBucket(19)).toBe("night"); // Start of night
    });
  });

  describe("getTimeBucketForTimestamp", () => {
    it("returns time bucket for a timestamp", () => {
      // Create a date that will have hour 8 (morning_rush) regardless of timezone
      const date = new Date();
      date.setHours(8, 30, 0, 0);
      const morningTimestamp = date.getTime();
      expect(getTimeBucketForTimestamp(morningTimestamp)).toBe("morning_rush");
    });

    it("handles different timezones correctly", () => {
      const timestamp = Date.now();
      const bucket = getTimeBucketForTimestamp(timestamp);
      expect(["early_morning", "morning_rush", "midday", "evening_rush", "night"]).toContain(
        bucket
      );
    });
  });

  describe("getCurrentTimeBucket", () => {
    it("returns current time bucket", () => {
      const bucket = getCurrentTimeBucket();
      expect(["early_morning", "morning_rush", "midday", "evening_rush", "night"]).toContain(
        bucket
      );
    });
  });

  describe("getTimeBucketLabel", () => {
    it("returns human-readable labels", () => {
      expect(getTimeBucketLabel("early_morning")).toBe("4 AM - 6 AM");
      expect(getTimeBucketLabel("morning_rush")).toBe("6 AM - 10 AM");
      expect(getTimeBucketLabel("midday")).toBe("10 AM - 3 PM");
      expect(getTimeBucketLabel("evening_rush")).toBe("3 PM - 7 PM");
      expect(getTimeBucketLabel("night")).toBe("7 PM - 4 AM");
    });

    it("returns bucket name for unknown buckets", () => {
      expect(getTimeBucketLabel("unknown" as never)).toBe("unknown");
    });
  });

  describe("getDayCategory", () => {
    it("returns 'sunday' for Sunday (day 0)", () => {
      const sunday = new Date(2024, 2, 10); // March 10, 2024 is a Sunday
      expect(getDayCategory(sunday)).toBe("sunday");
    });

    it("returns 'saturday' for Saturday (day 6)", () => {
      const saturday = new Date(2024, 2, 9); // March 9, 2024 is a Saturday
      expect(getDayCategory(saturday)).toBe("saturday");
    });

    it("returns 'weekday' for Monday-Friday (days 1-5)", () => {
      const monday = new Date(2024, 2, 11); // March 11, 2024 is a Monday
      const wednesday = new Date(2024, 2, 13); // March 13, 2024 is a Wednesday
      const friday = new Date(2024, 2, 15); // March 15, 2024 is a Friday

      expect(getDayCategory(monday)).toBe("weekday");
      expect(getDayCategory(wednesday)).toBe("weekday");
      expect(getDayCategory(friday)).toBe("weekday");
    });
  });

  describe("getDayCategoryForTimestamp", () => {
    it("returns day category for a timestamp", () => {
      // March 10, 2024 is a Sunday
      const sundayTimestamp = new Date("2024-03-10T12:00:00Z").getTime();
      expect(getDayCategoryForTimestamp(sundayTimestamp)).toBe("sunday");
    });
  });

  describe("getDayCategoryLabel", () => {
    it("returns human-readable labels", () => {
      expect(getDayCategoryLabel("weekday")).toBe("Weekday");
      expect(getDayCategoryLabel("saturday")).toBe("Saturday");
      expect(getDayCategoryLabel("sunday")).toBe("Sunday");
    });

    it("returns category name for unknown categories", () => {
      expect(getDayCategoryLabel("unknown" as never)).toBe("unknown");
    });
  });
});
