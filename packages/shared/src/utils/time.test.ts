/**
 * Unit tests for time utilities
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  calculateMinutesAway,
  calculateSecondsAway,
  formatMinutesAway,
  formatTime,
  formatShortDate,
  formatFullDate,
  formatTimeAgo,
  formatDuration,
  getCurrentDayOfWeek,
  getCurrentHour,
  getTodayISO,
  getWeekStartISO,
  getMonthStartISO,
  isRecent,
  isStale,
  getDataAge,
} from "./time.js";

describe("time utilities", () => {
  describe("calculateMinutesAway", () => {
    it("returns 0 for past timestamps", () => {
      const pastTime = Date.now() - 60000; // 1 minute ago
      expect(calculateMinutesAway(pastTime)).toBe(0);
    });

    it("returns minutes for future timestamps", () => {
      const futureTime = Date.now() + 300000; // 5 minutes from now
      expect(calculateMinutesAway(futureTime)).toBe(5);
    });

    it("rounds correctly", () => {
      const futureTime = Date.now() + 90000; // 1.5 minutes from now
      expect(calculateMinutesAway(futureTime)).toBe(2);
    });
  });

  describe("calculateSecondsAway", () => {
    it("returns 0 for past timestamps", () => {
      const pastTime = Date.now() - 10000; // 10 seconds ago
      expect(calculateSecondsAway(pastTime)).toBe(0);
    });

    it("returns seconds for future timestamps", () => {
      const futureTime = Date.now() + 120000; // 2 minutes from now
      expect(calculateSecondsAway(futureTime)).toBe(120);
    });
  });

  describe("formatMinutesAway", () => {
    it("returns 'now' for 0 minutes", () => {
      expect(formatMinutesAway(0)).toBe("now");
    });

    it("returns 'now' for negative minutes", () => {
      expect(formatMinutesAway(-1)).toBe("now");
    });

    it("returns minutes for < 60 minutes", () => {
      expect(formatMinutesAway(5)).toBe("5 min");
      expect(formatMinutesAway(59)).toBe("59 min");
    });

    it("returns hours for >= 60 minutes with no remainder", () => {
      expect(formatMinutesAway(60)).toBe("1 hr");
      expect(formatMinutesAway(120)).toBe("2 hr");
    });

    it("returns hours and minutes for >= 60 minutes with remainder", () => {
      expect(formatMinutesAway(90)).toBe("1 hr 30 min");
      expect(formatMinutesAway(150)).toBe("2 hr 30 min");
    });
  });

  describe("formatTime", () => {
    it("formats timestamp as time string", () => {
      const timestamp = new Date("2024-03-15T08:30:00Z").getTime();
      const formatted = formatTime(timestamp, "UTC");
      expect(formatted).toMatch(/8:30/);
    });

    it("uses local timezone when not specified", () => {
      const timestamp = Date.now();
      expect(formatTime(timestamp)).toBeDefined();
      expect(typeof formatTime(timestamp)).toBe("string");
    });
  });

  describe("formatShortDate", () => {
    it("formats timestamp as short date", () => {
      const timestamp = new Date("2024-03-15T12:00:00Z").getTime();
      expect(formatShortDate(timestamp)).toBe("Mar 15");
    });
  });

  describe("formatFullDate", () => {
    it("formats timestamp as full date", () => {
      const timestamp = new Date("2024-03-15T12:00:00Z").getTime();
      expect(formatFullDate(timestamp)).toBe("March 15, 2024");
    });
  });

  describe("formatTimeAgo", () => {
    it("formats seconds ago", () => {
      expect(formatTimeAgo(30)).toBe("30s ago");
      expect(formatTimeAgo(59)).toBe("59s ago");
    });

    it("formats minutes ago", () => {
      expect(formatTimeAgo(60)).toBe("1 min ago");
      expect(formatTimeAgo(120)).toBe("2 min ago");
      expect(formatTimeAgo(3540)).toBe("59 min ago");
    });

    it("formats hours ago", () => {
      expect(formatTimeAgo(3600)).toBe("1 hr ago");
      expect(formatTimeAgo(7200)).toBe("2 hr ago");
    });
  });

  describe("formatDuration", () => {
    it("formats seconds for < 60 seconds", () => {
      expect(formatDuration(30)).toBe("30 sec");
      expect(formatDuration(59)).toBe("59 sec");
    });

    it("formats minutes for >= 60 seconds with no remainder", () => {
      expect(formatDuration(60)).toBe("1 min");
      expect(formatDuration(120)).toBe("2 min");
    });

    it("formats minutes and seconds for >= 60 seconds with remainder", () => {
      expect(formatDuration(90)).toBe("1 min 30 sec");
      expect(formatDuration(150)).toBe("2 min 30 sec");
    });

    it("formats hours for >= 60 minutes", () => {
      expect(formatDuration(3600)).toBe("1 hr");
      expect(formatDuration(5400)).toBe("1 hr 30 min");
    });
  });

  describe("getCurrentDayOfWeek", () => {
    it("returns day of week (0-6)", () => {
      const day = getCurrentDayOfWeek();
      expect(day).toBeGreaterThanOrEqual(0);
      expect(day).toBeLessThanOrEqual(6);
    });
  });

  describe("getCurrentHour", () => {
    it("returns current hour (0-23)", () => {
      const hour = getCurrentHour();
      expect(hour).toBeGreaterThanOrEqual(0);
      expect(hour).toBeLessThanOrEqual(23);
    });
  });

  describe("getTodayISO", () => {
    it("returns today's date in ISO format", () => {
      const today = getTodayISO();
      expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe("getWeekStartISO", () => {
    it("returns Monday of current week", () => {
      const weekStart = getWeekStartISO();
      expect(weekStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      const date = new Date(weekStart);
      expect(date.getDay()).toBe(1); // Monday
    });

    it("calculates from provided date", () => {
      const wednesday = new Date("2024-03-13T12:00:00Z"); // March 13, 2024 is a Wednesday
      const weekStart = getWeekStartISO(wednesday);
      expect(weekStart).toBe("2024-03-11"); // Monday of that week
    });

    it("handles Sunday (previous week's Monday)", () => {
      const sunday = new Date("2024-03-10T12:00:00Z"); // March 10, 2024 is a Sunday
      const weekStart = getWeekStartISO(sunday);
      expect(weekStart).toBe("2024-03-04"); // Monday of previous week
    });
  });

  describe("getMonthStartISO", () => {
    it("returns first day of current month", () => {
      const monthStart = getMonthStartISO();
      expect(monthStart).toMatch(/^\d{4}-\d{2}-01$/);
    });
  });

  describe("isRecent", () => {
    it("returns true for recent timestamps", () => {
      const recentTime = Date.now() - 30000; // 30 seconds ago
      expect(isRecent(recentTime, 60)).toBe(true);
    });

    it("returns false for old timestamps", () => {
      const oldTime = Date.now() - 120000; // 2 minutes ago
      expect(isRecent(oldTime, 60)).toBe(false);
    });
  });

  describe("isStale", () => {
    it("returns true for stale data", () => {
      const staleTime = Date.now() - 120000; // 2 minutes ago
      expect(isStale(staleTime, 60)).toBe(true);
    });

    it("returns false for fresh data", () => {
      const freshTime = Date.now() - 30000; // 30 seconds ago
      expect(isStale(freshTime, 60)).toBe(false);
    });
  });

  describe("getDataAge", () => {
    it("returns age in seconds", () => {
      const oldTime = Date.now() - 30000; // 30 seconds ago
      expect(getDataAge(oldTime)).toBeCloseTo(30, 0);
    });
  });
});
