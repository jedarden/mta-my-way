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

import type * as FsPromises from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Set up mocks at module level - must be before any imports
vi.mock("./middleware/rate-limiter.js", () => ({
  setRateLimiterTestMode: vi.fn(),
}));

// Mock node:fs/promises
const mockReadFile = vi.fn();
vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<typeof FsPromises>("node:fs/promises");
  return {
    ...actual,
    readFile: mockReadFile,
  };
});

// Mock @hono/node-server
vi.mock("@hono/node-server", () => ({
  serve: vi.fn(),
}));

// Mock all server modules
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
  getPushDatabase: vi.fn(),
  initPushDatabase: vi.fn(),
}));

vi.mock("./push/vapid.js", () => ({
  loadOrGenerateVapidKeys: vi.fn(),
  configureWebPush: vi.fn(),
}));

vi.mock("./security-startup.js", () => ({
  validateSecurityOrThrow: vi.fn(),
}));

vi.mock("./transfer/travel-times.js", () => ({
  loadTravelTimes: vi.fn(),
}));

vi.mock("./trip-tracking.js", () => ({
  initTripTracking: vi.fn(),
}));

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

  beforeEach(async () => {
    // Mock process.exit to prevent test from exiting
    vi.spyOn(process, "exit").mockImplementation((_code?: number) => {
      // Don't actually exit during tests - just return undefined
      return undefined as never;
    });

    // Reset environment
    process.env.PORT = "3001";
    delete process.env.TEST_MODE;
    delete process.env.PUSH_DB_PATH;

    // Configure readFile mock
    mockReadFile.mockImplementation((path: unknown) => {
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
    });

    // Configure @hono/node-server mock using dynamic import
    const { serve } = await import("@hono/node-server");
    (serve as ReturnType<typeof vi.fn>).mockImplementation(
      (_fetch: unknown, _callback?: unknown) => {
        const callback = _callback as ((info: { port: number }) => void) | undefined;
        if (callback) {
          callback?.({ port: parseInt(process.env.PORT || "3001", 10) });
        }
        return { port: parseInt(process.env.PORT || "3001", 10), close: vi.fn() };
      }
    );

    // Configure push subscriptions mock
    const { getPushDatabase } = await import("./push/subscriptions.js");
    (getPushDatabase as ReturnType<typeof vi.fn>).mockReturnValue(mockDb);

    // Configure vapid mock
    const { loadOrGenerateVapidKeys } = await import("./push/vapid.js");
    (loadOrGenerateVapidKeys as ReturnType<typeof vi.fn>).mockResolvedValue({
      publicKey: "test-public-key",
      privateKey: "test-private-key",
    });

    // Configure travel times mock
    const { loadTravelTimes } = await import("./transfer/travel-times.js");
    (loadTravelTimes as ReturnType<typeof vi.fn>).mockResolvedValue(mockTravelTimes);
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

      const { validateSecurityOrThrow } = await import("./security-startup.js");
      const { initPoller, startPoller } = await import("./poller.js");
      const { initDelayDetector } = await import("./delay-detector.js");
      const { initDelayPredictor } = await import("./delay-predictor.js");
      const { initEquipmentPoller, startEquipmentPoller } = await import("./equipment-poller.js");
      const { runMigrations } = await import("./migration/index.js");
      const { initPushDatabase } = await import("./push/subscriptions.js");
      const { loadOrGenerateVapidKeys, configureWebPush } = await import("./push/vapid.js");
      const { startPushPipeline } = await import("./push/index.js");
      const { startBriefingScheduler } = await import("./push/briefing.js");
      const { initTripTracking } = await import("./trip-tracking.js");
      const { loadTravelTimes } = await import("./transfer/travel-times.js");
      const { serve } = await import("@hono/node-server");
      const { createApp } = await import("./app.js");

      // Verify static data was loaded (loadTravelTimes is mocked, so travel-times.json is not read via readFile)
      expect(mockReadFile).toHaveBeenCalledWith(expect.stringContaining("stations.json"), "utf8");
      expect(mockReadFile).toHaveBeenCalledWith(expect.stringContaining("routes.json"), "utf8");
      expect(mockReadFile).toHaveBeenCalledWith(expect.stringContaining("complexes.json"), "utf8");
      expect(mockReadFile).toHaveBeenCalledWith(expect.stringContaining("transfers.json"), "utf8");

      // Verify security validation was called
      expect(validateSecurityOrThrow).toHaveBeenCalled();

      // Verify poller was initialized
      expect(initPoller).toHaveBeenCalled();
      expect(startPoller).toHaveBeenCalled();

      // Verify delay detector was initialized
      expect(initDelayDetector).toHaveBeenCalled();

      // Verify delay predictor was initialized
      expect(initDelayPredictor).toHaveBeenCalled();

      // Verify equipment poller was initialized
      expect(initEquipmentPoller).toHaveBeenCalled();
      expect(startEquipmentPoller).toHaveBeenCalled();

      // Verify migrations were run
      expect(runMigrations).toHaveBeenCalled();

      // Verify push notification subsystem was initialized
      expect(initPushDatabase).toHaveBeenCalled();
      expect(loadOrGenerateVapidKeys).toHaveBeenCalled();
      expect(configureWebPush).toHaveBeenCalled();
      expect(startPushPipeline).toHaveBeenCalled();
      expect(startBriefingScheduler).toHaveBeenCalled();

      // Verify trip tracking was initialized
      expect(initTripTracking).toHaveBeenCalled();

      // Verify travel times were loaded
      expect(loadTravelTimes).toHaveBeenCalled();

      // Verify HTTP server was started
      expect(serve).toHaveBeenCalled();
      expect(createApp).toHaveBeenCalled();
    });

    it("should enable test mode when TEST_MODE is true", async () => {
      // Reset modules to ensure fresh import
      vi.resetModules();

      process.env.TEST_MODE = "true";

      // Import the mocked delay predictor to set up expectations
      const { initDelayPredictorForTesting: mockInitForTesting } = await import(
        "./delay-predictor.js"
      );

      // Import index module which should call initDelayPredictorForTesting when TEST_MODE is true
      await import("./index.js");

      // Verify testing mode was enabled for delay predictor
      expect(mockInitForTesting).toHaveBeenCalled();
    });
  });
});
