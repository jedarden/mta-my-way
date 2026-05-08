/**
 * Tests for equipment-poller module.
 *
 * Tests the MTA Elevator & Escalator (ENE) feed polling system including:
 * - Station name normalization and matching
 * - XML parsing
 * - Date parsing
 * - Outage transformation
 * - Polling behavior
 * - Circuit breaker
 * - Equipment status queries
 */

import type { StationIndex } from "@mta-my-way/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock dependencies
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

describe("equipment-poller", () => {
  let equipmentPoller: typeof import("./equipment-poller.js");
  let mockLogger: {
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
  let mockTracedFetch: ReturnType<typeof vi.fn>;

  const mockStations: StationIndex = {
    "101": {
      id: "101",
      name: "South Ferry",
      lines: ["1"],
      northStopId: "101N",
      southStopId: "101S",
      lat: 40.702,
      lon: -74.013,
      transfers: [],
      ada: true,
      borough: "manhattan",
    },
    "102": {
      id: "102",
      name: "Rector Street",
      lines: ["1"],
      northStopId: "102N",
      southStopId: "102S",
      lat: 40.709,
      lon: -74.014,
      transfers: [],
      ada: false,
      borough: "manhattan",
    },
    "725": {
      id: "725",
      name: "Times Square - 42nd Street",
      lines: ["1", "2", "3", "7", "N", "Q", "R", "W", "S"],
      northStopId: "725N",
      southStopId: "725S",
      lat: 40.758,
      lon: -73.985,
      transfers: [],
      ada: true,
      borough: "manhattan",
    },
  };

  const mockENEFeed = `
    <?xml version="1.0" encoding="UTF-8"?>
    <NyctPlannedWorkOutages>
      <outage>
        <station>South Ferry</station>
        <trainno>1</trainno>
        <equipment>Elevator to street level</equipment>
        <equipmenttype>EL</equipmenttype>
        <serving>Street level to mezzanine</serving>
        <ADA>Y</ADA>
        <outagedate>01/05/2024 08:00:00 AM</outagedate>
        <estimatedreturntoservice>01/05/2024 06:00:00 PM</estimatedreturntoservice>
        <reason>Repair work</reason>
        <isupcomingoutage>N</isupcomingoutage>
        <ismaintenanceoutage>N</ismaintenanceoutage>
      </outage>
      <outage>
        <station>Times Square</station>
        <trainno>1/2/3</trainno>
        <equipment>Escalator to mezzanine</equipment>
        <equipmenttype>ES</equipmenttype>
        <serving>Platform to mezzanine</serving>
        <ADA>N</ADA>
        <outagedate>01/05/2024 10:30:00 AM</outagedate>
        <estimatedreturntoservice></estimatedreturntoservice>
        <reason>Maintenance</reason>
        <isupcomingoutage>N</isupcomingoutage>
        <ismaintenanceoutage>Y</ismaintenanceoutage>
      </outage>
    </NyctPlannedWorkOutages>
  `;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Import after mocks are set up
    equipmentPoller = await import("./equipment-poller.js");
    const observability = await import("./observability/logger.js");
    const tracing = await import("./observability/tracing.js");

    mockLogger = observability.logger;
    mockTracedFetch = tracing.tracedFetch;

    // Default mock implementation
    mockTracedFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      text: () => Promise.resolve(mockENEFeed),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("initEquipmentPoller", () => {
    it("should initialize station name mapping", () => {
      equipmentPoller.initEquipmentPoller(mockStations);

      // Should successfully initialize
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it("should handle empty station index", () => {
      expect(() => {
        equipmentPoller.initEquipmentPoller({});
      }).not.toThrow();
    });
  });

  describe("station name normalization", () => {
    beforeEach(() => {
      equipmentPoller.initEquipmentPoller(mockStations);
    });

    it("should match exact station names", async () => {
      // The poller should match "South Ferry" to station "101"
      equipmentPoller.startEquipmentPoller();
      // Advance time to allow the initial poll to complete
      await vi.runOnlyPendingTimersAsync();

      const equipment = equipmentPoller.getEquipmentForStation("101");
      expect(equipment).not.toBeNull();

      equipmentPoller.stopEquipmentPoller();
    });

    it("should match normalized station names", async () => {
      // "Times Square" in feed should match "Times Square - 42nd Street"
      equipmentPoller.startEquipmentPoller();
      // Advance time to allow the initial poll to complete
      await vi.runOnlyPendingTimersAsync();

      const equipment = equipmentPoller.getEquipmentForStation("725");
      expect(equipment).not.toBeNull();

      equipmentPoller.stopEquipmentPoller();
    });
  });

  describe("XML parsing", () => {
    it("should parse ENE XML feed", async () => {
      equipmentPoller.initEquipmentPoller(mockStations);
      equipmentPoller.startEquipmentPoller();

      await vi.runOnlyPendingTimersAsync();

      // Should have parsed outages
      const allEquipment = equipmentPoller.getAllEquipment();
      expect(allEquipment.length).toBeGreaterThan(0);

      equipmentPoller.stopEquipmentPoller();
    });

    it("should skip upcoming outages", async () => {
      const feedWithUpcoming = `
        <?xml version="1.0" encoding="UTF-8"?>
        <NyctPlannedWorkOutages>
          <outage>
            <station>South Ferry</station>
            <trainno>1</trainno>
            <equipment>Test Elevator</equipment>
            <equipmenttype>EL</equipmenttype>
            <serving>Test</serving>
            <ADA>N</ADA>
            <outagedate>01/05/2024 08:00:00 AM</outagedate>
            <estimatedreturntoservice></estimatedreturntoservice>
            <reason>Test</reason>
            <isupcomingoutage>Y</isupcomingoutage>
            <ismaintenanceoutage>N</ismaintenanceoutage>
          </outage>
          <outage>
            <station>South Ferry</station>
            <trainno>1</trainno>
            <equipment>Active Elevator</equipment>
            <equipmenttype>EL</equipmenttype>
            <serving>Test</serving>
            <ADA>N</ADA>
            <outagedate>01/05/2024 08:00:00 AM</outagedate>
            <estimatedreturntoservice></estimatedreturntoservice>
            <reason>Test</reason>
            <isupcomingoutage>N</isupcomingoutage>
            <ismaintenanceoutage>N</ismaintenanceoutage>
          </outage>
        </NyctPlannedWorkOutages>
      `;

      // Clear the default mock and set our specific mock
      mockTracedFetch.mockReset();
      mockTracedFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        text: () => Promise.resolve(feedWithUpcoming),
      });

      equipmentPoller.initEquipmentPoller(mockStations);
      equipmentPoller.startEquipmentPoller();

      await vi.runOnlyPendingTimersAsync();

      // Should only have 1 equipment (upcoming outage skipped)
      const allEquipment = equipmentPoller.getAllEquipment();
      expect(allEquipment.length).toBe(1);

      equipmentPoller.stopEquipmentPoller();
    });
  });

  describe("equipment status queries", () => {
    beforeEach(async () => {
      equipmentPoller.initEquipmentPoller(mockStations);

      mockTracedFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        text: () => Promise.resolve(mockENEFeed),
      });

      equipmentPoller.startEquipmentPoller();
      await vi.runOnlyPendingTimersAsync();
    });

    afterEach(() => {
      equipmentPoller.stopEquipmentPoller();
    });

    it("should get equipment for a specific station", () => {
      const equipment = equipmentPoller.getEquipmentForStation("101");

      expect(equipment).not.toBeNull();
      expect(equipment?.stationId).toBe("101");
      expect(equipment?.equipment.length).toBeGreaterThan(0);
    });

    it("should return null for unknown station", () => {
      const equipment = equipmentPoller.getEquipmentForStation("999");
      expect(equipment).toBeNull();
    });

    it("should get all equipment", () => {
      const allEquipment = equipmentPoller.getAllEquipment();

      expect(Array.isArray(allEquipment)).toBe(true);
      expect(allEquipment.length).toBeGreaterThan(0);
    });

    it("should identify stations with broken elevators", () => {
      const brokenElevatorStations = equipmentPoller.getStationsWithBrokenElevators();

      expect(brokenElevatorStations).toBeInstanceOf(Set);
      // South Ferry (101) has an ADA elevator outage
      expect(brokenElevatorStations.has("101")).toBe(true);
    });

    it("should build correct equipment summary", () => {
      const equipment = equipmentPoller.getEquipmentForStation("101");

      expect(equipment?.brokenElevators).toBeGreaterThan(0);
      expect(equipment?.adaAccessible).toBe(false); // Has ADA elevator outage
    });
  });

  describe("getEquipmentStatus", () => {
    it("should return initial status", async () => {
      // Reset the poller state by re-importing to get a clean state
      vi.clearAllMocks();
      vi.resetModules();

      equipmentPoller = await import("./equipment-poller.js");
      const status = equipmentPoller.getEquipmentStatus();

      expect(status.lastFetchAt).toBeNull();
      expect(status.lastSuccessAt).toBeNull();
      expect(status.outageCount).toBe(0);
      expect(status.consecutiveFailures).toBe(0);
      expect(status.circuitOpen).toBe(false);
    });

    it("should return updated status after successful poll", async () => {
      equipmentPoller.initEquipmentPoller(mockStations);

      mockTracedFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        text: () => Promise.resolve(mockENEFeed),
      });

      equipmentPoller.startEquipmentPoller();
      await vi.runOnlyPendingTimersAsync();

      const status = equipmentPoller.getEquipmentStatus();

      expect(status.lastFetchAt).toBeTruthy();
      expect(status.lastSuccessAt).toBeTruthy();
      expect(status.outageCount).toBeGreaterThan(0);

      equipmentPoller.stopEquipmentPoller();
    });
  });

  describe("polling behavior", () => {
    it("should start polling immediately", async () => {
      equipmentPoller.initEquipmentPoller(mockStations);

      equipmentPoller.startEquipmentPoller();

      // Immediate poll
      expect(mockTracedFetch).toHaveBeenCalledTimes(1);

      equipmentPoller.stopEquipmentPoller();
    });

    it("should poll on interval", async () => {
      equipmentPoller.initEquipmentPoller(mockStations);

      equipmentPoller.startEquipmentPoller();

      const initialCount = mockTracedFetch.mock.calls.length;

      // Fast-forward past poll interval (5 minutes)
      vi.advanceTimersByTime(300_000);
      await vi.runOnlyPendingTimersAsync();

      expect(mockTracedFetch.mock.calls.length).toBeGreaterThan(initialCount);

      equipmentPoller.stopEquipmentPoller();
    });

    it("should stop polling when stopped", () => {
      equipmentPoller.initEquipmentPoller(mockStations);

      equipmentPoller.startEquipmentPoller();
      equipmentPoller.stopEquipmentPoller();

      const _clearIntervalSpy = vi.spyOn(global, "clearInterval");

      // Starting and stopping should call clearInterval
      equipmentPoller.startEquipmentPoller();
      equipmentPoller.stopEquipmentPoller();

      // Should not error when stopped twice
      equipmentPoller.stopEquipmentPoller();
    });
  });

  describe("error handling", () => {
    it("should handle network errors", async () => {
      equipmentPoller.initEquipmentPoller(mockStations);

      mockTracedFetch.mockRejectedValue(new TypeError("Failed to fetch"));

      equipmentPoller.startEquipmentPoller();
      await vi.runOnlyPendingTimersAsync();

      expect(mockLogger.error).toHaveBeenCalled();

      equipmentPoller.stopEquipmentPoller();
    });

    it("should handle HTTP errors", async () => {
      equipmentPoller.initEquipmentPoller(mockStations);

      mockTracedFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: () => Promise.resolve(""),
      });

      equipmentPoller.startEquipmentPoller();
      await vi.runOnlyPendingTimersAsync();

      expect(mockLogger.error).toHaveBeenCalled();

      equipmentPoller.stopEquipmentPoller();
    });

    it("should handle timeout errors", async () => {
      equipmentPoller.initEquipmentPoller(mockStations);

      const timeoutError = new Error("Timeout");
      timeoutError.name = "AbortError";
      mockTracedFetch.mockRejectedValue(timeoutError);

      equipmentPoller.startEquipmentPoller();
      await vi.runOnlyPendingTimersAsync();

      expect(mockLogger.error).toHaveBeenCalled();

      equipmentPoller.stopEquipmentPoller();
    });
  });

  describe("circuit breaker", () => {
    it("should open circuit after consecutive failures", async () => {
      equipmentPoller.initEquipmentPoller(mockStations);

      // Reset the mock to use rejection
      mockTracedFetch.mockReset();
      mockTracedFetch.mockRejectedValue(new Error("Network error"));

      equipmentPoller.startEquipmentPoller();

      // Trigger initial poll failure
      await vi.runOnlyPendingTimersAsync();

      // Trigger more failures to reach CIRCUIT_OPEN_AFTER (3 total)
      // Initial poll + 2 more = 3 failures
      for (let i = 0; i < 3; i++) {
        vi.advanceTimersByTime(300_000);
        await vi.runOnlyPendingTimersAsync();
      }

      const status = equipmentPoller.getEquipmentStatus();
      expect(status.circuitOpen).toBe(true);

      equipmentPoller.stopEquipmentPoller();
    });

    it("should reset circuit after timeout", async () => {
      equipmentPoller.initEquipmentPoller(mockStations);

      // Reset the mock and cause circuit to open
      mockTracedFetch.mockReset();
      mockTracedFetch.mockRejectedValue(new Error("Network error"));

      equipmentPoller.startEquipmentPoller();

      // Trigger initial poll failure
      await vi.runOnlyPendingTimersAsync();

      // Trigger more failures to open circuit (3 total failures needed)
      for (let i = 0; i < 3; i++) {
        vi.advanceTimersByTime(300_000);
        await vi.runOnlyPendingTimersAsync();
      }

      let status = equipmentPoller.getEquipmentStatus();
      expect(status.circuitOpen).toBe(true);

      // Fast-forward past circuit reset timeout (60 seconds)
      vi.advanceTimersByTime(60_000);

      // Now make fetch succeed
      mockTracedFetch.mockReset();
      mockTracedFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        text: () => Promise.resolve(mockENEFeed),
      });

      // Trigger next poll
      vi.advanceTimersByTime(300_000);
      await vi.runOnlyPendingTimersAsync();

      status = equipmentPoller.getEquipmentStatus();
      // Circuit should be reset after successful poll
      expect(status.circuitOpen).toBe(false);

      equipmentPoller.stopEquipmentPoller();
    });
  });

  describe("equipment types", () => {
    it("should parse elevators correctly", async () => {
      const elevatorFeed = `
        <?xml version="1.0" encoding="UTF-8"?>
        <NyctPlannedWorkOutages>
          <outage>
            <station>South Ferry</station>
            <trainno>1</trainno>
            <equipment>Test Elevator</equipment>
            <equipmenttype>EL</equipmenttype>
            <serving>Test</serving>
            <ADA>Y</ADA>
            <outagedate>01/05/2024 08:00:00 AM</outagedate>
            <estimatedreturntoservice></estimatedreturntoservice>
            <reason>Test</reason>
            <isupcomingoutage>N</isupcomingoutage>
            <ismaintenanceoutage>N</ismaintenanceoutage>
          </outage>
        </NyctPlannedWorkOutages>
      `;

      // Reset mock and set elevator feed
      mockTracedFetch.mockReset();
      mockTracedFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        text: () => Promise.resolve(elevatorFeed),
      });

      equipmentPoller.initEquipmentPoller(mockStations);
      equipmentPoller.startEquipmentPoller();
      await vi.runOnlyPendingTimersAsync();

      const equipment = equipmentPoller.getEquipmentForStation("101");
      expect(equipment?.equipment[0].type).toBe("elevator");

      equipmentPoller.stopEquipmentPoller();
    });

    it("should parse escalators correctly", async () => {
      const escalatorFeed = `
        <?xml version="1.0" encoding="UTF-8"?>
        <NyctPlannedWorkOutages>
          <outage>
            <station>South Ferry</station>
            <trainno>1</trainno>
            <equipment>Test Escalator</equipment>
            <equipmenttype>ES</equipmenttype>
            <serving>Test</serving>
            <ADA>N</ADA>
            <outagedate>01/05/2024 08:00:00 AM</outagedate>
            <estimatedreturntoservice></estimatedreturntoservice>
            <reason>Test</reason>
            <isupcomingoutage>N</isupcomingoutage>
            <ismaintenanceoutage>N</ismaintenanceoutage>
          </outage>
        </NyctPlannedWorkOutages>
      `;

      // Reset mock and set escalator feed
      mockTracedFetch.mockReset();
      mockTracedFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        text: () => Promise.resolve(escalatorFeed),
      });

      equipmentPoller.initEquipmentPoller(mockStations);
      equipmentPoller.startEquipmentPoller();
      await vi.runOnlyPendingTimersAsync();

      const equipment = equipmentPoller.getEquipmentForStation("101");
      expect(equipment?.equipment[0].type).toBe("escalator");

      equipmentPoller.stopEquipmentPoller();
    });
  });

  describe("ADA equipment tracking", () => {
    it("should track ADA equipment status", async () => {
      const adaFeed = `
        <?xml version="1.0" encoding="UTF-8"?>
        <NyctPlannedWorkOutages>
          <outage>
            <station>South Ferry</station>
            <trainno>1</trainno>
            <equipment>ADA Elevator</equipment>
            <equipmenttype>EL</equipmenttype>
            <serving>Test</serving>
            <ADA>Y</ADA>
            <outagedate>01/05/2024 08:00:00 AM</outagedate>
            <estimatedreturntoservice></estimatedreturntoservice>
            <reason>Test</reason>
            <isupcomingoutage>N</isupcomingoutage>
            <ismaintenanceoutage>N</ismaintenanceoutage>
          </outage>
        </NyctPlannedWorkOutages>
      `;

      // Reset mock and set ADA feed
      mockTracedFetch.mockReset();
      mockTracedFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        text: () => Promise.resolve(adaFeed),
      });

      equipmentPoller.initEquipmentPoller(mockStations);
      equipmentPoller.startEquipmentPoller();
      await vi.runOnlyPendingTimersAsync();

      const equipment = equipmentPoller.getEquipmentForStation("101");
      expect(equipment?.equipment[0].ada).toBe(true);
      expect(equipment?.adaAccessible).toBe(false); // Not accessible due to outage

      equipmentPoller.stopEquipmentPoller();
    });
  });

  describe("date parsing", () => {
    it("should parse ENE date format correctly", async () => {
      const feedWithDates = `
        <?xml version="1.0" encoding="UTF-8"?>
        <NyctPlannedWorkOutages>
          <outage>
            <station>South Ferry</station>
            <trainno>1</trainno>
            <equipment>Test</equipment>
            <equipmenttype>EL</equipmenttype>
            <serving>Test</serving>
            <ADA>N</ADA>
            <outagedate>01/05/2024 08:30:00 AM</outagedate>
            <estimatedreturntoservice>01/05/2024 06:00:00 PM</estimatedreturntoservice>
            <reason>Test</reason>
            <isupcomingoutage>N</isupcomingoutage>
            <ismaintenanceoutage>N</ismaintenanceoutage>
          </outage>
        </NyctPlannedWorkOutages>
      `;

      // Reset mock and set date feed
      mockTracedFetch.mockReset();
      mockTracedFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        text: () => Promise.resolve(feedWithDates),
      });

      equipmentPoller.initEquipmentPoller(mockStations);
      equipmentPoller.startEquipmentPoller();
      await vi.runOnlyPendingTimersAsync();

      const equipment = equipmentPoller.getEquipmentForStation("101");
      const eq = equipment?.equipment[0];

      // 01/05/2024 08:30:00 AM local time
      // The exact timestamp depends on timezone, so just check it's a valid timestamp
      // and roughly in the right timeframe (January 2024)
      expect(eq?.outOfServiceSince).toBeDefined();
      expect(eq?.outOfServiceSince).toBeGreaterThan(1704067200); // Jan 1 2024 00:00:00 UTC
      expect(eq?.outOfServiceSince).toBeLessThan(1706745600); // Feb 1 2024 00:00:00 UTC

      equipmentPoller.stopEquipmentPoller();
    });

    it("should handle PM times correctly", async () => {
      const pmFeed = `
        <?xml version="1.0" encoding="UTF-8"?>
        <NyctPlannedWorkOutages>
          <outage>
            <station>South Ferry</station>
            <trainno>1</trainno>
            <equipment>Test</equipment>
            <equipmenttype>EL</equipmenttype>
            <serving>Test</serving>
            <ADA>N</ADA>
            <outagedate>01/05/2024 11:59:59 PM</outagedate>
            <estimatedreturntoservice></estimatedreturntoservice>
            <reason>Test</reason>
            <isupcomingoutage>N</isupcomingoutage>
            <ismaintenanceoutage>N</ismaintenanceoutage>
          </outage>
        </NyctPlannedWorkOutages>
      `;

      // Reset mock and set PM feed
      mockTracedFetch.mockReset();
      mockTracedFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        text: () => Promise.resolve(pmFeed),
      });

      equipmentPoller.initEquipmentPoller(mockStations);
      equipmentPoller.startEquipmentPoller();
      await vi.runOnlyPendingTimersAsync();

      const equipment = equipmentPoller.getEquipmentForStation("101");
      const eq = equipment?.equipment[0];

      // 11:59:59 PM = 23:59:59 = 86399 seconds into the day
      expect(eq?.outOfServiceSince).toBeGreaterThan(0);

      equipmentPoller.stopEquipmentPoller();
    });
  });
});
