/**
 * Tests for Zustand store migration infrastructure.
 *
 * Covers:
 * - createSafeMigration: version comparison, sequential migration
 * - backupState and restoreFromBackup: localStorage persistence
 * - Error handling: failed migrations with fallback
 * - Migration flag: setMigrationFailed, hasMigrationFailed, clearMigrationFailed
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  backupState,
  clearBackup,
  clearMigrationFailed,
  createSafeMigration,
  hasMigrationFailed,
  restoreFromBackup,
  setMigrationFailed,
} from "./migration";

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(global, "localStorage", {
  value: localStorageMock,
});

// ---------------------------------------------------------------------------
// createSafeMigration
// ---------------------------------------------------------------------------

describe("createSafeMigration", () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it("returns persisted state unchanged when already at target version", () => {
    const migrations = new Map<number, (state: unknown) => unknown>();
    const migrate = createSafeMigration("test-store", 2, migrations);

    const state = { foo: "bar", count: 5 };
    const result = migrate(state, 2);

    expect(result).toEqual(state);
  });

  it("returns persisted state unchanged when version is higher than target", () => {
    const migrations = new Map<number, (state: unknown) => unknown>();
    const migrate = createSafeMigration("test-store", 2, migrations);

    const state = { foo: "bar", count: 5 };
    const result = migrate(state, 3);

    expect(result).toEqual(state);
  });

  it("applies a single migration from version 0 to 1", () => {
    const migrations = new Map<number, (state: unknown) => unknown>([
      [
        1,
        (state) => ({
          ...(state as Record<string, unknown>),
          newField: "defaultValue",
        }),
      ],
    ]);
    const migrate = createSafeMigration("test-store", 1, migrations);

    const state = { foo: "bar" };
    const result = migrate(state, 0) as Record<string, unknown>;

    expect(result.foo).toBe("bar");
    expect(result.newField).toBe("defaultValue");
  });

  it("applies multiple migrations sequentially", () => {
    const migrations = new Map<number, (state: unknown) => unknown>([
      [
        1,
        (state) => ({
          ...(state as Record<string, unknown>),
          v1: true,
        }),
      ],
      [
        2,
        (state) => ({
          ...(state as Record<string, unknown>),
          v2: true,
        }),
      ],
      [
        3,
        (state) => ({
          ...(state as Record<string, unknown>),
          v3: true,
        }),
      ],
    ]);
    const migrate = createSafeMigration("test-store", 3, migrations);

    const state = { original: true };
    const result = migrate(state, 0) as Record<string, unknown>;

    expect(result.original).toBe(true);
    expect(result.v1).toBe(true);
    expect(result.v2).toBe(true);
    expect(result.v3).toBe(true);
  });

  it("only applies migrations from current version + 1 to target", () => {
    const migrations = new Map<number, (state: unknown) => unknown>([
      [
        1,
        (state) => ({
          ...(state as Record<string, unknown>),
          v1: "should-not-appear",
        }),
      ],
      [
        2,
        (state) => ({
          ...(state as Record<string, unknown>),
          v2: true,
        }),
      ],
    ]);
    const migrate = createSafeMigration("test-store", 2, migrations);

    const state = { original: true };
    const result = migrate(state, 1) as Record<string, unknown>;

    expect(result.v1).toBeUndefined();
    expect(result.v2).toBe(true);
  });

  it("skips versions without migration functions", () => {
    const migrations = new Map<number, (state: unknown) => unknown>([
      // No migration for version 1
      [
        2,
        (state) => ({
          ...(state as Record<string, unknown>),
          v2: true,
        }),
      ],
    ]);
    const migrate = createSafeMigration("test-store", 2, migrations);

    const state = { original: true };
    const result = migrate(state, 0) as Record<string, unknown>;

    expect(result.original).toBe(true);
    expect(result.v2).toBe(true);
  });

  it("backs up state before migration", () => {
    const migrations = new Map<number, (state: unknown) => unknown>([
      [
        1,
        (state) => ({
          ...(state as Record<string, unknown>),
          migrated: true,
        }),
      ],
    ]);
    const migrate = createSafeMigration("test-store", 1, migrations);

    const state = { original: true };
    migrate(state, 0);

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "_mta_backup_test-store_v0",
      JSON.stringify(state)
    );
  });

  it("restores from backup when migration throws", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const migrations = new Map<number, (state: unknown) => unknown>([
      [
        1,
        () => {
          throw new Error("Migration failed!");
        },
      ],
    ]);
    const migrate = createSafeMigration("test-store", 1, migrations);

    const state = { original: true };

    // Pre-populate backup
    localStorageMock.setItem("_mta_backup_test-store_v0", JSON.stringify(state));

    const result = migrate(state, 0);

    expect(result).toEqual(state);
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it("returns original state when migration fails and no backup exists", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const migrations = new Map<number, (state: unknown) => unknown>([
      [
        1,
        () => {
          throw new Error("Migration failed!");
        },
      ],
    ]);
    const migrate = createSafeMigration("test-store", 1, migrations);

    const state = { original: true };
    const result = migrate(state, 0);

    expect(result).toEqual(state);

    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// backupState / restoreFromBackup / clearBackup
// ---------------------------------------------------------------------------

describe("backup and restore utilities", () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it("backupState stores state in localStorage", () => {
    const state = { foo: "bar", nested: { count: 5 } };
    backupState("my-store", 1, state);

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "_mta_backup_my-store_v1",
      JSON.stringify(state)
    );
  });

  it("restoreFromBackup retrieves state from localStorage", () => {
    const state = { foo: "bar", count: 10 };
    localStorageMock.setItem("_mta_backup_my-store_v2", JSON.stringify(state));

    const restored = restoreFromBackup("my-store", 2);

    expect(restored).toEqual(state);
  });

  it("restoreFromBackup returns null when no backup exists", () => {
    const restored = restoreFromBackup("nonexistent", 1);
    expect(restored).toBeNull();
  });

  it("clearBackup removes backup from localStorage", () => {
    localStorageMock.setItem("_mta_backup_my-store_v1", JSON.stringify({ foo: "bar" }));

    clearBackup("my-store", 1);

    expect(localStorageMock.removeItem).toHaveBeenCalledWith("_mta_backup_my-store_v1");
  });

  it("backupState handles localStorage quota errors gracefully", () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    localStorageMock.setItem.mockImplementationOnce(() => {
      throw new Error("QuotaExceededError");
    });

    // Should not throw
    expect(() => backupState("test", 1, { data: "test" })).not.toThrow();
    expect(consoleWarnSpy).toHaveBeenCalled();

    consoleWarnSpy.mockRestore();
  });

  it("restoreFromBackup handles JSON parse errors gracefully", () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    localStorageMock.getItem.mockReturnValueOnce("invalid json {{{");

    const restored = restoreFromBackup("test", 1);

    expect(restored).toBeNull();
    expect(consoleWarnSpy).toHaveBeenCalled();

    consoleWarnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Migration failed flag
// ---------------------------------------------------------------------------

describe("migration failed flag", () => {
  beforeEach(() => {
    clearMigrationFailed();
  });

  it("initially returns false", () => {
    expect(hasMigrationFailed()).toBe(false);
  });

  it("returns true after setMigrationFailed is called", () => {
    setMigrationFailed();
    expect(hasMigrationFailed()).toBe(true);
  });

  it("returns false after clearMigrationFailed is called", () => {
    setMigrationFailed();
    clearMigrationFailed();
    expect(hasMigrationFailed()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Real-world migration scenarios
// ---------------------------------------------------------------------------

describe("migration scenarios", () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it("migrates favorites store from v0 to v1 (initial schema)", () => {
    // Simulating a future migration where we add a new field
    const migrations = new Map<number, (state: unknown) => unknown>([
      [
        1,
        (state) => ({
          ...(state as Record<string, unknown>),
          favorites: (state as Record<string, unknown>).favorites ?? [],
          commutes: (state as Record<string, unknown>).commutes ?? [],
          tapHistory: (state as Record<string, unknown>).tapHistory ?? [],
          onboardingComplete: (state as Record<string, unknown>).onboardingComplete ?? false,
        }),
      ],
    ]);
    const migrate = createSafeMigration("favorites", 1, migrations);

    // Empty state from v0
    const result = migrate({}, 0) as Record<string, unknown>;

    expect(result.favorites).toEqual([]);
    expect(result.commutes).toEqual([]);
    expect(result.tapHistory).toEqual([]);
    expect(result.onboardingComplete).toBe(false);
  });

  it("preserves existing data during migration", () => {
    const migrations = new Map<number, (state: unknown) => unknown>([
      [
        2,
        (state) => ({
          ...(state as Record<string, unknown>),
          newField: "added",
        }),
      ],
    ]);
    const migrate = createSafeMigration("test", 2, migrations);

    const existingState = {
      favorites: [{ id: "1", stationId: "101", lines: ["1", "2"] }],
      commutes: [{ id: "c1", name: "Work" }],
      tapHistory: [{ favoriteId: "1", dayOfWeek: 1, hour: 8 }],
    };

    const result = migrate(existingState, 1) as Record<string, unknown>;

    expect(result.favorites).toEqual(existingState.favorites);
    expect(result.commutes).toEqual(existingState.commutes);
    expect(result.tapHistory).toEqual(existingState.tapHistory);
    expect(result.newField).toBe("added");
  });

  it("handles deeply nested state transformations", () => {
    const migrations = new Map<number, (state: unknown) => unknown>([
      [
        1,
        (state) => {
          const s = state as Record<string, unknown>;
          return {
            ...s,
            settings: {
              ...(s.settings as Record<string, unknown>),
              theme: (s.settings as Record<string, unknown>)?.theme ?? "system",
            },
          };
        },
      ],
    ]);
    const migrate = createSafeMigration("settings", 1, migrations);

    const state = {
      settings: {
        notifications: true,
      },
    };

    const result = migrate(state, 0) as Record<string, unknown>;

    expect(result.settings).toEqual({
      notifications: true,
      theme: "system",
    });
  });
});
