/**
 * Zustand migration infrastructure with backup safety and error logging.
 *
 * Provides versioned persistence with:
 * - Automatic backup before migration
 * - Restore from backup on failure
 * - Sentry error logging
 */

/**
 * Backup key format: _mta_backup_{storeName}_v{version}
 */
function getBackupKey(storeName: string, version: number): string {
  return `_mta_backup_${storeName}_v${version}`;
}

/**
 * Log migration error to Sentry (if available) and console.
 */
function logMigrationError(
  storeName: string,
  fromVersion: number,
  toVersion: number,
  error: unknown
): void {
  const errorInfo = {
    storeName,
    fromVersion,
    toVersion,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  };

  // Log to console in development
  console.error("[MTA Migration] Migration failed:", errorInfo);

  // Send to Sentry if available
  if (typeof window !== "undefined" && "Sentry" in window) {
    const Sentry = (window as unknown as { Sentry: { captureException: (e: unknown, context?: { extra: Record<string, unknown> }) => void } }).Sentry;
    Sentry.captureException(new Error(`Migration failed for ${storeName}`), { extra: errorInfo });
  }
}

/**
 * Backup current persisted state before migration.
 */
export function backupState<T>(
  storeName: string,
  version: number,
  state: T
): void {
  try {
    const backupKey = getBackupKey(storeName, version);
    localStorage.setItem(backupKey, JSON.stringify(state));
  } catch {
    // Ignore backup failures (quota exceeded, etc.)
    console.warn(`[MTA Migration] Failed to backup ${storeName} v${version}`);
  }
}

/**
 * Restore state from backup.
 */
export function restoreFromBackup<T>(
  storeName: string,
  version: number
): T | null {
  try {
    const backupKey = getBackupKey(storeName, version);
    const backup = localStorage.getItem(backupKey);
    if (backup) {
      return JSON.parse(backup) as T;
    }
  } catch {
    // Ignore restore failures
    console.warn(`[MTA Migration] Failed to restore ${storeName} v${version} from backup`);
  }
  return null;
}

/**
 * Clear backup after successful migration (optional cleanup).
 */
export function clearBackup(storeName: string, version: number): void {
  try {
    const backupKey = getBackupKey(storeName, version);
    localStorage.removeItem(backupKey);
  } catch {
    // Ignore cleanup failures
  }
}

/**
 * Create a safe migration function with backup/restore safety net.
 *
 * @param storeName - Name of the store (for backup keys and logging)
 * @param targetVersion - Current version of the store
 * @param migrations - Map of version -> migration function
 * @returns A migrate function suitable for Zustand persist middleware
 */
export function createSafeMigration<T>(
  storeName: string,
  targetVersion: number,
  migrations: Map<number, (state: unknown) => unknown>
): (persisted: unknown, version: number) => T {
  return (persisted: unknown, version: number): T => {
    // No migration needed if already at target version
    if (version >= targetVersion) {
      return persisted as T;
    }

    // Backup before attempting migration
    backupState(storeName, version, persisted);

    try {
      let state = persisted;

      // Apply migrations sequentially from current version to target
      for (let v = version + 1; v <= targetVersion; v++) {
        const migrate = migrations.get(v);
        if (migrate) {
          state = migrate(state);
        }
      }

      // Clear backup on success (optional - keep for debugging)
      // clearBackup(storeName, version);

      return state as T;
    } catch (error) {
      // Log the failure
      logMigrationError(storeName, version, targetVersion, error);

      // Attempt to restore from backup
      const restored = restoreFromBackup<T>(storeName, version);
      if (restored !== null) {
        console.warn(`[MTA Migration] Restored ${storeName} from backup v${version}`);
        return restored;
      }

      // If no backup available, return the original state (no migration)
      // This ensures the user never loses data, even if it means old behavior
      console.warn(`[MTA Migration] No backup available for ${storeName}, using original state`);
      return persisted as T;
    }
  };
}

/**
 * Flag to track if a migration has failed this session.
 * UI can use this to show a non-blocking banner.
 */
let migrationFailed = false;

export function setMigrationFailed(): void {
  migrationFailed = true;
}

export function hasMigrationFailed(): boolean {
  return migrationFailed;
}

export function clearMigrationFailed(): void {
  migrationFailed = false;
}
