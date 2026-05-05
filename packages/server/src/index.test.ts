/**
 * Tests for the server entry point (index.ts).
 *
 * Tests the server startup sequence:
 * - Static data loading
 * - Security validation
 * - Test mode configuration
 * - Database initialization and migrations
 * - Push notification subsystem
 * - Feed poller initialization
 * - HTTP server startup
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Server Entry Point", () => {
  const mockStations = {
    "101": {
      id: "101",
      name: "South Ferry",
      lat: 40.702,
      lon: -74.013,
      lines: ["1"],
      northStopId: "101N",
      southStopId: "101S",
      transfers: [],
      ada: true,
      borough: "manhattan",
    },
  };

  const mockRoutes = {
    "1": {
      id: "1",
      shortName: "1",
      longName: "Broadway-7th Ave Local",
      color: "#EE352E",
      textColor: "#FFFFFF",
      feedId: "gtfs",
      division: "A",
      stops: ["101"],
      isExpress: false,
    },
  };

  const mockComplexes = {
    "725": {
      complexId: "725",
      name: "Times Square",
      stations: ["101"],
    },
  };

  const mockTransfers = {
    "101": [
      {
        toStationId: "726",
        toLines: ["A", "C"],
        walkingSeconds: 120,
        accessible: true,
      },
    ],
  };

  const mockTravelTimes = {
    "101-726": {
      duration: 600,
      distance: 1000,
    },
  };

  const mockDb = {};

  beforeEach(() => {
    // Mock process.exit to prevent test from exiting
    vi.spyOn(process, "exit").mockImplementation((_code?: number) => {
      // Don't actually exit during tests - just return undefined
      return undefined as never;
    });

    // Reset environment
    process.env.PORT = "3001";
    delete process.env.TEST_MODE;
    delete process.env.PUSH_DB_PATH;

    // Mock all dependencies before importing
    vi.mock("node:fs/promises", async () => {
      const actual = await vi.importActual("node:fs/promises");
      return {
        ...actual,
        readFile: vi.fn((path: unknown) => {
          const pathStr = String(path);
          if (pathStr.includes("stations.json")) {
            return Promise.resolve(JSON.stringify(mockStations));
          }
          if (pathStr.includes("routes.json")) {
            return Promise.resolve(JSON.stringify(mockRoutes));
          }
          if (pathStr.includes("complexes.json")) {
            return Promise.resolve(JSON.stringify(mockComplexes));
          }
          if (pathStr.includes("transfers.json")) {
            return Promise.resolve(JSON.stringify(mockTransfers));
          }
          if (pathStr.includes("travel-times.json")) {
            return Promise.resolve(JSON.stringify(mockTravelTimes));
          }
          return Promise.resolve("{}");
        }),
      };
    });

    vi.mock("@hono/node-server", () => ({
      serve: vi.fn(({ fetch }, callback) => {
        if (callback) {
          callback?.({ port: parseInt(process.env.PORT || "3001", 10) });
        }
        return { port: parseInt(process.env.PORT || "3001", 10), close: vi.fn() } as never;
      }),
    }));

    vi.mock("./alerts-poller.js", () => ({
      startAlertsPoller: vi.fn(),
    }));

    vi.mock("./app.js", () => ({
      createApp: vi.fn(() => ({
        fetch: vi.fn(),
      })),
    }));

    vi.mock("./delay-detector.js", () => ({
      initDelayDetector: vi.fn(),
    }));

    vi.mock("./delay-predictor.js", () => ({
      initDelayPredictor: vi.fn(),
      initDelayPredictorForTesting: vi.fn(),
    }));

    vi.mock("./equipment-poller.js", () => ({
      initEquipmentPoller: vi.fn(),
      startEquipmentPoller: vi.fn(),
    }));

    vi.mock("./middleware/rate-limiter.js", () => ({
      setRateLimiterTestMode: vi.fn(),
    }));

    vi.mock("./migration/index.js", () => ({
      runMigrations: vi.fn(() => Promise.resolve([])),
    }));

    vi.mock("./observability/logger.js", () => ({
      LogLevel: {
        DEBUG: "debug",
        INFO: "info",
        WARN: "warn",
        ERROR: "error",
      },
      createLogger: vi.fn(() => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      })),
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },
    }));

    vi.mock("./poller.js", () => ({
      initPoller: vi.fn(),
      startPoller: vi.fn(),
    }));

    vi.mock("./push/briefing.js", () => ({
      startBriefingScheduler: vi.fn(),
    }));

    vi.mock("./push/index.js", () => ({
      startPushPipeline: vi.fn(),
    }));

    vi.mock("./push/subscriptions.js", () => ({
      getPushDatabase: vi.fn(() => mockDb),
      initPushDatabase: vi.fn(),
    }));

    vi.mock("./push/vapid.js", () => ({
      loadOrGenerateVapidKeys: vi.fn(() =>
        Promise.resolve({
          publicKey: "test-public-key",
          privateKey: "test-private-key",
        })
      ),
      configureWebPush: vi.fn(),
    }));

    vi.mock("./security-startup.js", () => ({
      validateSecurityOrThrow: vi.fn(),
    }));

    vi.mock("./transfer/travel-times.js", () => ({
      loadTravelTimes: vi.fn(() => Promise.resolve(mockTravelTimes)),
    }));

    vi.mock("./trip-tracking.js", () => ({
      initTripTracking: vi.fn(),
    }));
  });

  afterEach(() => {
    // Restore process.exit
    vi.restoreAllMocks();

    // Reset process environment
    process.env.PORT = "3001";
    delete process.env.TEST_MODE;
    delete process.env.PUSH_DB_PATH;
  });

  describe("startup sequence", () => {
    it("should complete full startup sequence with default configuration", async () => {
      await import("./index.js");

      const { readFile } = await import("node:fs/promises");
      const { validateSecurityOrThrow } = await import("./security-startup.js");
      const { initPoller, startPoller } = await import("./poller.js");
      const { initDelayDetector } = await import("./delay-detector.js");
      const { initDelayPredictor } = await import("./delay-predictor.js");
      const { initEquipmentPoller, startEquipmentPoller } = await import("./equipment-poller.js");
      const { startAlertsPoller } = await import("./alerts-poller.js");
      const { initPushDatabase } = await import("./push/subscriptions.js");
      const { runMigrations } = await import("./migration/index.js");
      const { loadOrGenerateVapidKeys, configureWebPush } = await import("./push/vapid.js");
      const { startPushPipeline } = await import("./push/index.js");
      const { startBriefingScheduler } = await import("./push/briefing.js");
      const { initTripTracking } = await import("./trip-tracking.js");
      const { createApp } = await import("./app.js");
      const { serve } = await import("@hono/node-server");
      const { setRateLimiterTestMode } = await import("./middleware/rate-limiter.js");

      // Verify all startup steps
      expect(readFile).toHaveBeenCalledWith(expect.stringContaining("stations.json"), "utf8");
      expect(readFile).toHaveBeenCalledWith(expect.stringContaining("routes.json"), "utf8");
      expect(readFile).toHaveBeenCalledWith(expect.stringContaining("complexes.json"), "utf8");
      expect(readFile).toHaveBeenCalledWith(expect.stringContaining("transfers.json"), "utf8");
      expect(validateSecurityOrThrow).toHaveBeenCalled();
      expect(initPoller).toHaveBeenCalledWith(mockStations, mockRoutes);
      expect(startPoller).toHaveBeenCalled();
      expect(initDelayDetector).toHaveBeenCalledWith(mockTravelTimes, mockRoutes, mockStations);
      expect(initDelayPredictor).toHaveBeenCalled();
      expect(initEquipmentPoller).toHaveBeenCalledWith(mockStations);
      expect(startEquipmentPoller).toHaveBeenCalled();
      expect(startAlertsPoller).toHaveBeenCalled();
      expect(initPushDatabase).toHaveBeenCalled();
      expect(runMigrations).toHaveBeenCalled();
      expect(loadOrGenerateVapidKeys).toHaveBeenCalled();
      expect(configureWebPush).toHaveBeenCalledWith({
        publicKey: "test-public-key",
        privateKey: "test-private-key",
      });
      expect(startPushPipeline).toHaveBeenCalled();
      expect(startBriefingScheduler).toHaveBeenCalled();
      expect(initTripTracking).toHaveBeenCalled();
      expect(createApp).toHaveBeenCalledWith(
        mockStations,
        mockRoutes,
        mockComplexes,
        mockTransfers,
        expect.stringContaining("dist")
      );
      expect(serve).toHaveBeenCalledWith(
        expect.objectContaining({ port: 3001 }),
        expect.any(Function)
      );
      // Test mode should NOT be enabled by default
      expect(setRateLimiterTestMode).not.toHaveBeenCalled();
    });

    it("should enable test mode when TEST_MODE is true", async () => {
      process.env.TEST_MODE = "true";

      const { setRateLimiterTestMode } = await import("./middleware/rate-limiter.js");

      // The module has already been imported, so we need to check if the function was called
      // In a fresh test run with TEST_MODE=true, this would be called
      expect(setRateLimiterTestMode).toHaveBeenCalledWith(true);
    });
  });
});
