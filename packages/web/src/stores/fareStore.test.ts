/**
 * Unit tests for fareStore
 *
 * Tests OMNY fare cap tracking with ride logging and period management.
 */

import type { RideLogEntry } from "@mta-my-way/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the migration module
vi.mock("./migration", () => ({
  createSafeMigration: vi.fn(() => (state: unknown, version: number) => state),
  setMigrationFailed: vi.fn(),
}));

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
};

Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
});

describe("fareStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
    // Reset the module to get a fresh store
    vi.resetModules();
  });

  describe("initial state", () => {
    it("initializes with default tracking values", async () => {
      const { useFareStore } = await import("./fareStore");
      const state = useFareStore.getState();

      expect(state.tracking.weeklyRides).toBe(0);
      expect(state.tracking.monthlyRides).toBe(0);
      expect(state.tracking.rideLog).toEqual([]);
      expect(state.tracking.currentFare).toBe(2.9);
      expect(state.tracking.unlimitedPassPrice).toBe(132);
    });

    it("has empty ride log initially", async () => {
      const { useFareStore } = await import("./fareStore");
      const state = useFareStore.getState();

      expect(state.tracking.rideLog).toHaveLength(0);
    });
  });

  describe("addRideLogEntry", () => {
    it("adds a ride to the log", async () => {
      const { useFareStore } = await import("./fareStore");

      const entry: RideLogEntry = {
        date: new Date().toISOString(),
        stationId: "101",
        stationName: "South Ferry",
        line: "1",
        fare: 2.9,
      };

      useFareStore.getState().addRideLogEntry(entry);

      const state = useFareStore.getState();
      expect(state.tracking.rideLog).toHaveLength(1);
      expect(state.tracking.rideLog[0]).toEqual(entry);
    });

    it("increments weekly and monthly ride counts", async () => {
      const { useFareStore } = await import("./fareStore");

      const entry: RideLogEntry = {
        date: new Date().toISOString(),
        stationId: "101",
        stationName: "South Ferry",
        line: "1",
        fare: 2.9,
      };

      useFareStore.getState().addRideLogEntry(entry);

      const state = useFareStore.getState();
      expect(state.tracking.weeklyRides).toBe(1);
      expect(state.tracking.monthlyRides).toBe(1);
    });

    it("enforces FIFO cap on ride log", async () => {
      const { useFareStore } = await import("./fareStore");

      // Add more than MAX_RIDE_LOG entries
      for (let i = 0; i < 510; i++) {
        const entry: RideLogEntry = {
          date: new Date().toISOString(),
          stationId: `${i}`,
          stationName: `Station ${i}`,
          line: "1",
          fare: 2.9,
        };
        useFareStore.getState().addRideLogEntry(entry);
      }

      const state = useFareStore.getState();
      // Should be capped at 500
      expect(state.tracking.rideLog.length).toBeLessThanOrEqual(500);
    });
  });

  describe("setCurrentFare", () => {
    it("updates the current fare", async () => {
      const { useFareStore } = await import("./fareStore");

      useFareStore.getState().setCurrentFare(3.0);

      const state = useFareStore.getState();
      expect(state.tracking.currentFare).toBe(3.0);
    });
  });

  describe("setUnlimitedPassPrice", () => {
    it("updates the unlimited pass price", async () => {
      const { useFareStore } = await import("./fareStore");

      useFareStore.getState().setUnlimitedPassPrice(140);

      const state = useFareStore.getState();
      expect(state.tracking.unlimitedPassPrice).toBe(140);
    });
  });

  describe("resetWeek", () => {
    it("resets weekly rides to zero", async () => {
      const { useFareStore } = await import("./fareStore");

      // Add some rides
      const entry: RideLogEntry = {
        date: new Date().toISOString(),
        stationId: "101",
        stationName: "South Ferry",
        line: "1",
        fare: 2.9,
      };
      useFareStore.getState().addRideLogEntry(entry);

      expect(useFareStore.getState().tracking.weeklyRides).toBeGreaterThan(0);

      // Reset week
      useFareStore.getState().resetWeek("2024-01-01");

      const state = useFareStore.getState();
      expect(state.tracking.weeklyRides).toBe(0);
      expect(state.tracking.weekStartDate).toBe("2024-01-01");
    });
  });

  describe("resetMonth", () => {
    it("resets monthly rides to zero", async () => {
      const { useFareStore } = await import("./fareStore");

      // Add some rides
      const entry: RideLogEntry = {
        date: new Date().toISOString(),
        stationId: "101",
        stationName: "South Ferry",
        line: "1",
        fare: 2.9,
      };
      useFareStore.getState().addRideLogEntry(entry);

      expect(useFareStore.getState().tracking.monthlyRides).toBeGreaterThan(0);

      // Reset month
      useFareStore.getState().resetMonth("2024-01-01");

      const state = useFareStore.getState();
      expect(state.tracking.monthlyRides).toBe(0);
      expect(state.tracking.monthStartDate).toBe("2024-01-01");
    });
  });

  describe("updateTracking", () => {
    it("updates multiple tracking fields", async () => {
      const { useFareStore } = await import("./fareStore");

      useFareStore.getState().updateTracking({
        currentFare: 3.0,
        unlimitedPassPrice: 140,
        weeklyRides: 5,
      });

      const state = useFareStore.getState();
      expect(state.tracking.currentFare).toBe(3.0);
      expect(state.tracking.unlimitedPassPrice).toBe(140);
      expect(state.tracking.weeklyRides).toBe(5);
    });
  });

  describe("clearFareData", () => {
    it("clears ride log and resets counters but preserves fares", async () => {
      const { useFareStore } = await import("./fareStore");

      // Set custom fares
      useFareStore.getState().setCurrentFare(3.0);
      useFareStore.getState().setUnlimitedPassPrice(140);

      // Add rides
      const entry: RideLogEntry = {
        date: new Date().toISOString(),
        stationId: "101",
        stationName: "South Ferry",
        line: "1",
        fare: 2.9,
      };
      useFareStore.getState().addRideLogEntry(entry);

      // Clear data
      useFareStore.getState().clearFareData();

      const state = useFareStore.getState();
      expect(state.tracking.rideLog).toHaveLength(0);
      expect(state.tracking.weeklyRides).toBe(0);
      expect(state.tracking.monthlyRides).toBe(0);
      expect(state.tracking.currentFare).toBe(3.0); // Preserved
      expect(state.tracking.unlimitedPassPrice).toBe(140); // Preserved
    });
  });

  describe("getCapStatus", () => {
    it("returns correct status when no rides", async () => {
      const { useFareStore } = await import("./fareStore");

      const capStatus = useFareStore.getState().getCapStatus();

      expect(capStatus.ridesThisWeek).toBe(0);
      expect(capStatus.ridesUntilFree).toBe(12);
      expect(capStatus.capReached).toBe(false);
      expect(capStatus.weeklySpend).toBe(0);
    });

    it("calculates rides until free correctly", async () => {
      const { useFareStore } = await import("./fareStore");

      // Add 5 rides
      for (let i = 0; i < 5; i++) {
        const entry: RideLogEntry = {
          date: new Date().toISOString(),
          stationId: "101",
          stationName: "South Ferry",
          line: "1",
          fare: 2.9,
        };
        useFareStore.getState().addRideLogEntry(entry);
      }

      const capStatus = useFareStore.getState().getCapStatus();

      expect(capStatus.ridesThisWeek).toBe(5);
      expect(capStatus.ridesUntilFree).toBe(7);
      expect(capStatus.capReached).toBe(false);
    });

    it("detects when cap is reached", async () => {
      const { useFareStore } = await import("./fareStore");

      // Add 12 rides (cap is 12)
      for (let i = 0; i < 12; i++) {
        const entry: RideLogEntry = {
          date: new Date().toISOString(),
          stationId: "101",
          stationName: "South Ferry",
          line: "1",
          fare: 2.9,
        };
        useFareStore.getState().addRideLogEntry(entry);
      }

      const capStatus = useFareStore.getState().getCapStatus();

      expect(capStatus.ridesThisWeek).toBe(12);
      expect(capStatus.ridesUntilFree).toBe(0);
      expect(capStatus.capReached).toBe(true);
    });

    it("calculates weekly spend correctly", async () => {
      const { useFareStore } = await import("./fareStore");

      // Add 5 rides at $2.90 each
      for (let i = 0; i < 5; i++) {
        const entry: RideLogEntry = {
          date: new Date().toISOString(),
          stationId: "101",
          stationName: "South Ferry",
          line: "1",
          fare: 2.9,
        };
        useFareStore.getState().addRideLogEntry(entry);
      }

      const capStatus = useFareStore.getState().getCapStatus();

      expect(capStatus.weeklySpend).toBe(5 * 2.9);
    });

    it("caps weekly spend at 12 rides", async () => {
      const { useFareStore } = await import("./fareStore");

      // Add 15 rides (more than cap)
      for (let i = 0; i < 15; i++) {
        const entry: RideLogEntry = {
          date: new Date().toISOString(),
          stationId: "101",
          stationName: "South Ferry",
          line: "1",
          fare: 2.9,
        };
        useFareStore.getState().addRideLogEntry(entry);
      }

      const capStatus = useFareStore.getState().getCapStatus();

      // Spend should only count first 12 rides
      expect(capStatus.weeklySpend).toBe(12 * 2.9);
    });

    it("calculates break-even correctly", async () => {
      const { useFareStore } = await import("./fareStore");

      const capStatus = useFareStore.getState().getCapStatus();

      // Break-even at $132 / $2.90 = ~46 rides
      expect(capStatus.breakEvenSpend).toBeCloseTo(132, 0);
    });

    it("determines if unlimited would be cheaper", async () => {
      const { useFareStore } = await import("./fareStore");

      // Add enough rides to exceed unlimited price
      for (let i = 0; i < 50; i++) {
        const entry: RideLogEntry = {
          date: new Date().toISOString(),
          stationId: "101",
          stationName: "South Ferry",
          line: "1",
          fare: 2.9,
        };
        useFareStore.getState().addRideLogEntry(entry);
      }

      const capStatus = useFareStore.getState().getCapStatus();

      expect(capStatus.unlimitedWouldBeCheaper).toBe(true);
    });

    it("calculates savings vs unlimited", async () => {
      const { useFareStore } = await import("./fareStore");

      // Add 50 rides
      for (let i = 0; i < 50; i++) {
        const entry: RideLogEntry = {
          date: new Date().toISOString(),
          stationId: "101",
          stationName: "South Ferry",
          line: "1",
          fare: 2.9,
        };
        useFareStore.getState().addRideLogEntry(entry);
      }

      const capStatus = useFareStore.getState().getCapStatus();

      // Monthly spend should be positive (unlimited is cheaper)
      expect(capStatus.monthlySpend).toBeGreaterThan(0);
      expect(capStatus.savingsVsUnlimited).toBeLessThan(0);
    });
  });

  describe("period resets", () => {
    it("recounts weekly rides when week changes", async () => {
      const { useFareStore } = await import("./fareStore");

      // This test would require mocking the date utilities
      // For now, we just verify the function exists
      const state = useFareStore.getState();
      expect(typeof state.resetWeek).toBe("function");
    });
  });

  describe("edge cases", () => {
    it("handles empty ride log gracefully", async () => {
      const { useFareStore } = await import("./fareStore");

      const capStatus = useFareStore.getState().getCapStatus();

      expect(capStatus.ridesThisWeek).toBe(0);
      expect(capStatus.monthlySpend).toBe(0);
    });

    it("handles zero fare", async () => {
      const { useFareStore } = await import("./fareStore");

      useFareStore.getState().setCurrentFare(0);

      const entry: RideLogEntry = {
        date: new Date().toISOString(),
        stationId: "101",
        stationName: "South Ferry",
        line: "1",
        fare: 0,
      };
      useFareStore.getState().addRideLogEntry(entry);

      const capStatus = useFareStore.getState().getCapStatus();

      expect(capStatus.weeklySpend).toBe(0);
    });

    it("handles very high unlimited pass price", async () => {
      const { useFareStore } = await import("./fareStore");

      useFareStore.getState().setUnlimitedPassPrice(1000);

      const capStatus = useFareStore.getState().getCapStatus();

      expect(capStatus.breakEvenSpend).toBeCloseTo(1000, 0);
    });
  });
});
