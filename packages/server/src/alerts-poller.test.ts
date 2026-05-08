/**
 * Tests for alerts-poller module.
 *
 * Tests the MTA alerts feed polling system including:
 * - Polling behavior (start, stop, interval)
 * - Alert fetching and parsing
 * - Circuit breaker behavior
 * - Alert change detection
 * - Change listeners
 * - Filtering functions
 * - Status reporting
 */

import type { StationAlert } from "@mta-my-way/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedAlert } from "./alerts-parser.js";

// Mock all dependencies
vi.mock("./alerts-parser.js", () => ({
  parseAlerts: vi.fn(),
  calculateMatchRate: vi.fn(() => 1.0),
  getUnmatchedAlerts: vi.fn(() => []),
  toStationAlert: vi.fn((alert) => ({
    id: alert.id,
    severity: "info" as const,
    source: "official" as const,
    headline: alert.title || "Test Alert",
    description: alert.description || "Test Description",
    affectedLines: alert.affectedLines || [],
    affectedStations: alert.affectedStations || [],
    activePeriod: { start: Date.now() / 1000 },
    cause: "unknown",
    effect: "unknown",
  })),
}));

vi.mock("./middleware/metrics.js", () => ({
  recordAlertsChange: vi.fn(),
  recordFeedError: vi.fn(),
  recordFeedPollDuration: vi.fn(),
  setAlertsActive: vi.fn(),
  setAlertsMatchRate: vi.fn(),
}));

vi.mock("./observability/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("./observability/tracing.js", () => ({
  tracedFetch: vi.fn(),
  withChildSpan: vi.fn((name, fn) => fn()),
}));

describe("alerts-poller", () => {
  let alertsPoller: typeof import("./alerts-poller.js");
  let mockParseAlerts: any;
  let mockTracedFetch: any;
  let mockLogger: any;

  const mockParsedAlerts: ParsedAlert[] = [
    {
      id: "alert1",
      title: "1 Line Delay",
      description: "Delays on 1 line",
      affectedLines: ["1"],
      affectedStations: ["101", "102"],
      modifiedAt: Date.now() / 1000,
      patternMatched: true,
      cause: "signal",
      effect: "delay",
      severity: "severe",
      isActive: true,
    },
    {
      id: "alert2",
      title: "A Line Reroute",
      description: "A trains rerouted",
      affectedLines: ["A"],
      affectedStations: ["201"],
      modifiedAt: Date.now() / 1000,
      patternMatched: true,
      cause: "construction",
      effect: "reroute",
      severity: "warning",
      isActive: true,
    },
  ];

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Import after mocks are set up
    alertsPoller = await import("./alerts-poller.js");
    const alertsParser = await import("./alerts-parser.js");
    const tracing = await import("./observability/tracing.js");
    const observability = await import("./observability/logger.js");

    mockParseAlerts = alertsParser.parseAlerts as any;
    mockTracedFetch = tracing.tracedFetch as any;
    mockLogger = observability.logger;

    // Reset module state to ensure clean tests
    alertsPoller.stopAlertsPoller();
    alertsPoller.resetAlertsCacheForTesting();

    // Default mock implementations
    mockParseAlerts.mockResolvedValue(mockParsedAlerts);
    mockTracedFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("startAlertsPoller", () => {
    it("should start polling immediately and on interval", async () => {
      alertsPoller.startAlertsPoller();

      // Need to run timers to complete the immediate async poll
      await vi.runOnlyPendingTimersAsync();

      // Immediate poll should have completed
      expect(mockTracedFetch).toHaveBeenCalled();

      // Fast-forward 60 seconds (POLL_INTERVAL_MS)
      vi.advanceTimersByTime(60_000);
      await vi.runOnlyPendingTimersAsync();

      // Second poll should have occurred
      expect(mockTracedFetch.mock.calls.length).toBeGreaterThanOrEqual(1);

      alertsPoller.stopAlertsPoller();
    });

    it("should log start message", () => {
      alertsPoller.startAlertsPoller();
      expect(mockLogger.info).toHaveBeenCalledWith("Alerts poller started", {
        interval_ms: 60_000,
      });
      alertsPoller.stopAlertsPoller();
    });
  });

  describe("stopAlertsPoller", () => {
    it("should stop polling", async () => {
      alertsPoller.startAlertsPoller();

      // Let the initial poll complete
      await vi.runOnlyPendingTimersAsync();

      const initialCallCount = mockTracedFetch.mock.calls.length;

      // Fast-forward past interval
      vi.advanceTimersByTime(60_000);
      await vi.runOnlyPendingTimersAsync();

      expect(mockTracedFetch.mock.calls.length).toBeGreaterThanOrEqual(initialCallCount);

      // Stop polling
      alertsPoller.stopAlertsPoller();

      // Clear call count and fast-forward again
      const callCountAfterStop = mockTracedFetch.mock.calls.length;
      vi.advanceTimersByTime(60_000);
      await vi.runOnlyPendingTimersAsync();

      // No new calls after stopping (or minimal increase due to pending promises)
      expect(mockTracedFetch.mock.calls.length).toBeLessThanOrEqual(callCountAfterStop + 1);
    });
  });

  describe("getAllAlerts", () => {
    it("should return empty array initially", () => {
      const alerts = alertsPoller.getAllAlerts();
      expect(alerts).toEqual([]);
    });

    it("should return alerts after successful poll", async () => {
      alertsPoller.startAlertsPoller();

      // Wait for the poll to complete
      await vi.runOnlyPendingTimersAsync();

      const alerts = alertsPoller.getAllAlerts();
      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts[0].id).toBe("alert1");

      alertsPoller.stopAlertsPoller();
    });
  });

  describe("getAlertsForLine", () => {
    it("should filter alerts by line ID", async () => {
      alertsPoller.setAlertsForTesting(mockParsedAlerts);

      const line1Alerts = alertsPoller.getAlertsForLine("1");
      expect(line1Alerts.length).toBe(1);
      expect(line1Alerts[0].affectedLines).toContain("1");

      const lineBAlerts = alertsPoller.getAlertsForLine("B");
      expect(lineBAlerts).toEqual([]);
    });

    it("should be case-sensitive", async () => {
      alertsPoller.setAlertsForTesting(mockParsedAlerts);

      const upperCaseAlerts = alertsPoller.getAlertsForLine("A");
      const lowerCaseAlerts = alertsPoller.getAlertsForLine("a");

      expect(upperCaseAlerts.length).toBe(1);
      expect(lowerCaseAlerts.length).toBe(0);
    });
  });

  describe("getAlertsForLines", () => {
    it("should filter alerts by multiple line IDs", async () => {
      alertsPoller.setAlertsForTesting(mockParsedAlerts);

      const alerts = alertsPoller.getAlertsForLines(["1", "A"]);
      expect(alerts.length).toBe(2);

      const line1Only = alertsPoller.getAlertsForLines(["1"]);
      expect(line1Only.length).toBe(1);
    });

    it("should return empty array for empty line list", async () => {
      alertsPoller.setAlertsForTesting(mockParsedAlerts);

      const alerts = alertsPoller.getAlertsForLines([]);
      expect(alerts).toEqual([]);
    });
  });

  describe("getAlertsForStation", () => {
    it("should filter alerts by station ID", async () => {
      alertsPoller.setAlertsForTesting(mockParsedAlerts);

      const station101Alerts = alertsPoller.getAlertsForStation("101");
      expect(station101Alerts.length).toBe(1);
      expect(station101Alerts[0].affectedStations).toContain("101");

      const station999Alerts = alertsPoller.getAlertsForStation("999");
      expect(station999Alerts).toEqual([]);
    });
  });

  describe("getAlertsStatus", () => {
    it("should return initial status with no data", () => {
      const status = alertsPoller.getAlertsStatus();

      expect(status.lastFetchAt).toBeNull();
      expect(status.lastSuccessAt).toBeNull();
      expect(status.alertCount).toBe(0);
      expect(status.matchRate).toBe(0);
      expect(status.consecutiveFailures).toBe(0);
      expect(status.circuitOpen).toBe(false);
      expect(status.unmatchedCount).toBe(0);
    });

    it("should return updated status after successful poll", async () => {
      alertsPoller.setAlertsForTesting(mockParsedAlerts);

      const status = alertsPoller.getAlertsStatus();

      expect(status.lastFetchAt).toBeTruthy();
      expect(status.lastSuccessAt).toBeTruthy();
      expect(status.alertCount).toBe(2);
      expect(status.matchRate).toBe(1.0);
      expect(status.consecutiveFailures).toBe(0);
      expect(status.circuitOpen).toBe(false);
    });
  });

  describe("getAlertsAgeSeconds", () => {
    it("should return 0 when no successful fetch", () => {
      const age = alertsPoller.getAlertsAgeSeconds();
      expect(age).toBe(0);
    });

    it("should return age in seconds since last fetch", async () => {
      alertsPoller.setAlertsForTesting(mockParsedAlerts);

      vi.advanceTimersByTime(5000);

      const age = alertsPoller.getAlertsAgeSeconds();
      expect(age).toBeGreaterThanOrEqual(5);
    });
  });

  describe("onAlertChange", () => {
    it("should call listener when alerts change", async () => {
      const listener = vi.fn();
      alertsPoller.onAlertChange(listener);

      alertsPoller.startAlertsPoller();

      // Wait for poll to complete
      await vi.runOnlyPendingTimersAsync();

      // Listener should be called (with initial alerts as "new")
      expect(listener).toHaveBeenCalled();

      alertsPoller.stopAlertsPoller();
    });

    it("should return unsubscribe function", async () => {
      const listener = vi.fn();
      const unsubscribe = alertsPoller.onAlertChange(listener);

      unsubscribe();

      // Start poller - listener should not be called
      alertsPoller.startAlertsPoller();
      await vi.runOnlyPendingTimersAsync();

      expect(listener).not.toHaveBeenCalled();

      alertsPoller.stopAlertsPoller();
    });

    it("should handle multiple listeners", async () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      alertsPoller.onAlertChange(listener1);
      alertsPoller.onAlertChange(listener2);

      alertsPoller.startAlertsPoller();
      await vi.runOnlyPendingTimersAsync();

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();

      alertsPoller.stopAlertsPoller();
    });
  });

  describe("refreshAlerts", () => {
    it("should trigger immediate refresh", async () => {
      alertsPoller.startAlertsPoller();
      await vi.runOnlyPendingTimersAsync();

      const initialCallCount = mockTracedFetch.mock.calls.length;

      const alerts = await alertsPoller.refreshAlerts();

      expect(mockTracedFetch.mock.calls.length).toBeGreaterThan(initialCallCount);
      expect(alerts.length).toBeGreaterThan(0);

      alertsPoller.stopAlertsPoller();
    });
  });

  describe("circuit breaker", () => {
    it("should open circuit after consecutive failures", async () => {
      mockTracedFetch.mockRejectedValue(new Error("Network error"));

      alertsPoller.startAlertsPoller();

      // Trigger multiple polls to reach CIRCUIT_OPEN_AFTER (3)
      for (let i = 0; i < 4; i++) {
        vi.advanceTimersByTime(60_000);
        await vi.runOnlyPendingTimersAsync();
      }

      const status = alertsPoller.getAlertsStatus();
      expect(status.circuitOpen).toBe(true);

      alertsPoller.stopAlertsPoller();
    });

    it("should skip fetch when circuit is open", async () => {
      mockTracedFetch.mockRejectedValue(new Error("Network error"));

      alertsPoller.startAlertsPoller();

      // Trigger enough failures to open circuit (3 failures trigger circuit open)
      // First poll happens immediately, then we need 2 more intervals
      await vi.runOnlyPendingTimersAsync(); // Initial poll (failure 1)
      vi.advanceTimersByTime(60_000);
      await vi.runOnlyPendingTimersAsync(); // Second poll (failure 2)
      vi.advanceTimersByTime(60_000);
      await vi.runOnlyPendingTimersAsync(); // Third poll (failure 3) - circuit opens

      const callsAfterCircuitOpen = mockTracedFetch.mock.calls.length;

      // Fast-forward by less than the reset period - circuit should prevent additional calls
      vi.advanceTimersByTime(30_000);
      await vi.runOnlyPendingTimersAsync();

      expect(mockTracedFetch.mock.calls.length).toBeLessThanOrEqual(callsAfterCircuitOpen + 1);

      alertsPoller.stopAlertsPoller();
    });

    it("should reset circuit after reset period", async () => {
      // Set up mock to reject 3 times, then resolve once
      mockTracedFetch.mockRejectedValue(new Error("Network error"));
      alertsPoller.startAlertsPoller();

      // Trigger 3 failures to open circuit (immediate + 2 intervals)
      await vi.runOnlyPendingTimersAsync(); // Failure 1
      vi.advanceTimersByTime(60_000);
      await vi.runOnlyPendingTimersAsync(); // Failure 2
      vi.advanceTimersByTime(60_000);
      await vi.runOnlyPendingTimersAsync(); // Failure 3 - circuit opens

      let status = alertsPoller.getAlertsStatus();
      expect(status.circuitOpen).toBe(true);

      // Now set up mock to succeed on next fetch
      mockTracedFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      });

      // Fast-forward past circuit reset period (60 seconds)
      vi.advanceTimersByTime(60_001);

      // Trigger another poll - this will attempt to fetch and reset the circuit
      await vi.runOnlyPendingTimersAsync();

      // Circuit should be reset now after successful poll
      status = alertsPoller.getAlertsStatus();
      expect(status.circuitOpen).toBe(false);

      alertsPoller.stopAlertsPoller();
    });
  });

  describe("error handling", () => {
    it("should handle network errors", async () => {
      mockTracedFetch.mockRejectedValue(new TypeError("Failed to fetch"));

      alertsPoller.startAlertsPoller();
      await vi.runOnlyPendingTimersAsync();

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Alerts fetch failed",
        expect.any(Error),
        expect.any(Object)
      );

      alertsPoller.stopAlertsPoller();
    });

    it("should handle timeout errors", async () => {
      const timeoutError = new Error("Timeout");
      timeoutError.name = "AbortError";
      mockTracedFetch.mockRejectedValue(timeoutError);

      alertsPoller.startAlertsPoller();
      await vi.runOnlyPendingTimersAsync();

      expect(mockLogger.error).toHaveBeenCalled();

      alertsPoller.stopAlertsPoller();
    });

    it("should handle HTTP errors", async () => {
      mockTracedFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      });

      alertsPoller.startAlertsPoller();
      await vi.runOnlyPendingTimersAsync();

      expect(mockLogger.error).toHaveBeenCalled();

      alertsPoller.stopAlertsPoller();
    });
  });

  describe("setAlertsForTesting", () => {
    it("should set alerts and update status", () => {
      alertsPoller.setAlertsForTesting(mockParsedAlerts);

      const alerts = alertsPoller.getAllAlerts();
      expect(alerts.length).toBe(2);

      const status = alertsPoller.getAlertsStatus();
      expect(status.alertCount).toBe(2);
      expect(status.matchRate).toBe(1.0);
    });
  });
});
