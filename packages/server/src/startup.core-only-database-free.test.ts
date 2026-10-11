/**
 * Focused startup tests for the CORE_ONLY database-free guarantee (ADR-001).
 *
 * index.test.ts mocks the whole push/subscriptions module, which can only
 * prove that index.ts never *calls* the database entry points. These tests
 * leave the real subscriptions module wired and instead intercept the single
 * real SQLite open seam — the better-sqlite3 constructor that
 * openPushDatabase() drives. Any startup path that opens SQLite in CORE_ONLY
 * mode (an import-time side effect, a subsystem bypassing withPushDatabase,
 * a regressed CORE_ONLY guard in index.ts) is recorded by the constructor
 * mock and fails the core-mode proof, while the listening-path assertion
 * proves main() still ran to completion.
 */

import type * as FsPromises from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";

// Shape of the mocked better-sqlite3 default export. The open record lives on
// the mock itself (not on vi.fn call history) so vi.clearAllMocks() in the
// global setup cannot wipe it mid-test.
type MockDatabaseFn = ((dbPath: string) => Record<string, unknown>) & {
  __opens: string[];
  __instances: Record<string, unknown>[];
};

vi.mock("better-sqlite3", () => {
  const opens: string[] = [];
  const instances: Record<string, unknown>[] = [];

  // Function form — the driver is constructed with `new`, and vitest cannot
  // `new` an arrow-function mock.
  function MockDatabase(dbPath: string) {
    opens.push(dbPath);
    const instance = {
      close: vi.fn(),
      exec: vi.fn(),
      pragma: vi.fn(),
      prepare: vi.fn(() => ({ all: vi.fn(() => []), get: vi.fn(), run: vi.fn() })),
      transaction: vi.fn((fn: (...args: unknown[]) => unknown) => fn()),
    };
    instances.push(instance);
    // Returning the object from a constructor call replaces `this`.
    return instance;
  }

  return {
    default: Object.assign(MockDatabase, { __opens: opens, __instances: instances }),
  };
});

// Mock node:fs/promises so the GTFS static load reads fixtures instead of the
// real data directory.
const mockReadFile = vi.fn();
vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<typeof FsPromises>("node:fs/promises");
  return {
    ...actual,
    readFile: mockReadFile,
  };
});

vi.mock("@hono/node-server", () => ({
  serve: vi.fn(),
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

vi.mock("./gtfs-refresh.js", () => ({
  startGtfsRefreshScheduler: vi.fn(),
}));

vi.mock("./middleware/api-key-management.js", () => ({
  initApiKeyRegistryFromDb: vi.fn(() => Promise.resolve()),
}));

vi.mock("./middleware/auth-rate-limit.js", () => ({
  loadRateLimitDataFromDb: vi.fn(),
}));

vi.mock("./middleware/concurrent-session-management.js", () => ({
  startSessionCleanup: vi.fn(),
}));

vi.mock("./middleware/password-management.js", () => ({
  initPasswordManagementFromDb: vi.fn(),
}));

vi.mock("./middleware/suspicious-activity-notifications.js", () => ({
  initNotificationsFromDb: vi.fn(),
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

vi.mock("./observability/index.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  initObservability: vi.fn(() => Promise.resolve()),
  shutdownObservability: vi.fn(() => Promise.resolve()),
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

vi.mock("./push/vapid.js", () => ({
  configureWebPush: vi.fn(),
  isWebPushConfigured: vi.fn(() => true),
  loadOrGenerateVapidKeys: vi.fn(),
}));

vi.mock("./security-startup.js", () => ({
  validateSecurityOrThrow: vi.fn(),
}));

vi.mock("./security/security-db.js", () => ({
  setSecurityDb: vi.fn(),
}));

vi.mock("./services/password-reset.service.js", () => ({
  configureEmailProvider: vi.fn(),
  reportEmailProviderReadiness: vi.fn(),
}));

vi.mock("./transfer/travel-times.js", () => ({
  loadTravelTimes: vi.fn(),
}));

vi.mock("./trip-tracking.js", () => ({
  initTripTracking: vi.fn(),
}));

describe("CORE_ONLY database-free startup", () => {
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

  afterEach(() => {
    delete process.env.CORE_ONLY;
  });

  /**
   * Reset the module registry, point CORE_ONLY at the requested value, and
   * run main() against the real push/subscriptions module with the SQLite
   * driver mocked at the constructor seam. Unlike index.test.ts, the
   * subscriptions module is NOT mocked — the real openPushDatabase() path
   * runs, so the recorded constructor calls are the actual database opens.
   *
   * CORE_ONLY is read by ./config.js at import time, so it is set before
   * index.js (and config.js) are imported.
   */
  async function importServer(options: { coreOnlyEnv?: string } = {}) {
    vi.resetModules();
    vi.clearAllMocks();
    process.exitCode = undefined;

    if (options.coreOnlyEnv === undefined) {
      delete process.env.CORE_ONLY;
    } else {
      process.env.CORE_ONLY = options.coreOnlyEnv;
    }

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

    const { serve } = await import("@hono/node-server");
    vi.mocked(serve).mockImplementation((_fetch: unknown, _callback?: unknown) => {
      const callback = _callback as ((info: { port: number }) => void) | undefined;
      callback?.({ port: parseInt(process.env.PORT || "3001", 10) });
      return { port: parseInt(process.env.PORT || "3001", 10), close: vi.fn() };
    });

    // The mock factory state survives vi.resetModules(), so capture the
    // recording arrays and empty them here — from this point on they cover
    // exactly the opens performed by this main() run.
    const database = (
      (await import("better-sqlite3")) as unknown as {
        default: MockDatabaseFn;
      }
    ).default;
    database.__opens.length = 0;
    database.__instances.length = 0;
    const subscriptions = await import("./push/subscriptions.js");
    const migration = await import("./migration/index.js");
    const securityDb = await import("./security/security-db.js");
    const pipeline = await import("./push/index.js");
    const briefing = await import("./push/briefing.js");
    const sessions = await import("./middleware/concurrent-session-management.js");
    const tripTracking = await import("./trip-tracking.js");
    const vapid = await import("./push/vapid.js");
    const { loadTravelTimes } = await import("./transfer/travel-times.js");

    vi.mocked(loadTravelTimes).mockResolvedValue(mockTravelTimes);
    vi.mocked(migration.runMigrations).mockResolvedValue([]);
    vi.mocked(vapid.loadOrGenerateVapidKeys).mockResolvedValue({
      publicKey: "test-public-key",
      privateKey: "test-private-key",
    });

    await import("./index.js");

    // main() runs detached — wait for it to reach the HTTP server.
    await vi.waitFor(() => expect(serve as ReturnType<typeof vi.fn>).toHaveBeenCalled());

    return {
      database,
      subscriptions,
      migration,
      securityDb,
      pipeline,
      briefing,
      sessions,
      tripTracking,
    };
  }

  it("opens no SQLite database in CORE_ONLY mode and still reaches the listening path", async () => {
    const { database, subscriptions, migration, securityDb, pipeline, briefing, sessions } =
      await importServer({ coreOnlyEnv: "true" });

    // The real SQLite open seam was never driven — any open (file-backed or
    // :memory:) during startup fails this assertion.
    expect(database.__opens).toEqual([]);

    // No DB-backed initialization ran against anything.
    expect(migration.runMigrations).not.toHaveBeenCalled();
    expect(securityDb.setSecurityDb).not.toHaveBeenCalled();

    // The DB-backed subsystems never started.
    expect(pipeline.startPushPipeline).not.toHaveBeenCalled();
    expect(briefing.startBriefingScheduler).not.toHaveBeenCalled();
    expect(sessions.startSessionCleanup).not.toHaveBeenCalled();

    // The subscriptions module itself never reached a ready state.
    expect(subscriptions.isPushDatabaseReady()).toBe(false);

    // main() swallowed nothing: startup ran to the listening path.
    expect(process.exitCode).toBeUndefined();
  }, 15000);

  it("opens and initializes SQLite when CORE_ONLY is unset (stateful default)", async () => {
    const {
      database,
      subscriptions,
      migration,
      securityDb,
      pipeline,
      briefing,
      sessions,
      tripTracking,
    } = await importServer();

    // Exactly one open, of the stateful subscriptions database.
    expect(database.__opens).toEqual([expect.stringContaining("subscriptions.db")]);

    // The opened handle is the same object initialization ran against.
    const openedInstance = database.__instances.at(-1);
    expect(migration.runMigrations).toHaveBeenCalledTimes(1);
    expect(migration.runMigrations).toHaveBeenCalledWith(openedInstance);
    expect(securityDb.setSecurityDb).toHaveBeenCalledWith(openedInstance);

    // Trip tracking shares the (lazily resolved) database.
    expect(tripTracking.initTripTracking).toHaveBeenCalledWith(null, expect.anything());

    // The DB-backed subsystems started.
    expect(pipeline.startPushPipeline).toHaveBeenCalledTimes(1);
    expect(briefing.startBriefingScheduler).toHaveBeenCalledTimes(1);
    expect(sessions.startSessionCleanup).toHaveBeenCalledTimes(1);
    expect(subscriptions.isPushDatabaseReady()).toBe(true);

    expect(process.exitCode).toBeUndefined();
  }, 15000);

  it("keeps persistence active when CORE_ONLY is explicitly false", async () => {
    const { database, subscriptions, migration } = await importServer({ coreOnlyEnv: "false" });

    expect(database.__opens).toEqual([expect.stringContaining("subscriptions.db")]);
    expect(migration.runMigrations).toHaveBeenCalledTimes(1);
    expect(subscriptions.isPushDatabaseReady()).toBe(true);
    expect(process.exitCode).toBeUndefined();
  }, 15000);
});
