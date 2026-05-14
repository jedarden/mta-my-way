# Data Migration Guide

This document describes the data migration infrastructure for MTA My Way, covering both server-side database migrations and client-side store migrations.

## Overview

MTA My Way uses two separate migration systems:

1. **Server-Side Migrations**: Database schema migrations for SQLite (better-sqlite3)
2. **Client-Side Migrations**: localStorage schema migrations for Zustand stores

Both systems are designed with safety, versioning, and rollback capabilities.

## Server-Side Database Migrations

### Architecture

**File**: `packages/server/src/migration/migration.ts`

The server-side migration system provides:

- **Version tracking**: `_migrations` table records all applied migrations
- **Dry-run mode**: Preview migrations without executing
- **Pre-migration backup**: Automatic database backup before migration
- **Migration locking**: Prevents concurrent migration execution
- **Rollback support**: Rollback to any previous version
- **Data validation**: Optional validation hooks for post-migration verification

### Migration Structure

Each migration is a numbered file in `packages/server/src/migration/migrations/`:

```typescript
// 018-add-security-persistence.ts
export const migration: Migration = {
  version: 18,
  name: "add-security-persistence",
  description: "Add tables for security event persistence and audit trail",
  up: (db: Database.Database) => {
    db.exec(`
      CREATE TABLE security_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        details TEXT,
        created_at INTEGER NOT NULL
      )
    `);
  },
  down: (db: Database.Database) => {
    db.exec(`DROP TABLE IF EXISTS security_events`);
  },
  validate: (db: Database.Database) => {
    const info = db.pragma(`table_info(security_events)`);
    return {
      valid: info.length > 0,
      errors: info.length === 0 ? ["security_events table not found"] : [],
    };
  },
};
```

### Migration Files

| Version | Name | Description |
|---------|------|-------------|
| 16 | `add-trips-table` | Create trips table for trip tracking |
| 17 | `add-resource-ownership` | Add resource ownership and RBAC support |
| 18 | `add-security-persistence` | Add security event persistence and audit trail |

### Running Migrations

#### Apply Pending Migrations

```typescript
import { runMigrations } from "./migration/index.js";

// Basic migration
await runMigrations(db);

// With options
await runMigrations(db, {
  dryRun: false,    // Actually execute migrations
  backup: true,     // Create backup before migration
  force: false,     // Skip lock check
});
```

#### Rollback Migrations

```typescript
import { rollbackToVersion, rollbackLastMigration } from "./migration/index.js";

// Rollback to specific version
await rollbackToVersion(db, 16);

// Rollback last migration
await rollbackLastMigration(db);
```

#### Dry-Run Mode

```typescript
const results = await runMigrations(db, { dryRun: true });
for (const result of results) {
  console.log(`${result.name}: ${result.applied ? "WOULD APPLY" : "WOULD SKIP"}`);
}
```

#### Get Migration Status

```typescript
import { getMigrationStatus, getAppliedMigrations } from "./migration/index.js";

// Get overall status
const status = getMigrationStatus(db);
console.log(`Current version: ${status.currentVersion}`);
console.log(`Pending migrations: ${status.pendingMigrations.length}`);

// Get applied migrations
const applied = getAppliedMigrations(db);
for (const record of applied) {
  console.log(`v${record.version}: ${record.name} applied at ${record.appliedAt}`);
}
```

### Backup System

Backups are stored in `packages/server/data/backups/`:

```typescript
import { createBackup, listBackups, restoreBackup } from "./migration/index.js";

// Create backup
const backupPath = await createBackup(db);

// List available backups
const backups = await listBackups();

// Restore from backup
await restoreBackup(db, backupPath);
```

### Database Schema

#### `_migrations` Table

```sql
CREATE TABLE _migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  applied_at TEXT NOT NULL,
  execution_time_ms INTEGER NOT NULL
);
```

#### Trips Table (v016)

```sql
CREATE TABLE IF NOT EXISTS trips (
  id TEXT PRIMARY KEY,
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  line TEXT NOT NULL,
  departure_time INTEGER NOT NULL,
  arrival_time INTEGER NOT NULL,
  notes TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_trips_origin ON trips(origin);
CREATE INDEX idx_trips_destination ON trips(destination);
CREATE INDEX idx_trips_departure_time ON trips(departure_time);
```

#### Resource Ownership (v017)

```sql
CREATE TABLE IF NOT EXISTS resource_ownership (
  id TEXT PRIMARY KEY,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(resource_type, resource_id)
);
CREATE INDEX idx_ownership_resource ON resource_ownership(resource_type, resource_id);
CREATE INDEX idx_ownership_owner ON resource_ownership(owner_id);
```

#### Security Events (v018)

```sql
CREATE TABLE IF NOT EXISTS security_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  details TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_security_events_type ON security_events(event_type);
CREATE INDEX idx_security_events_created_at ON security_events(created_at);
```

### Migration Best Practices

1. **Always provide both `up` and `down` functions**: Migrations must be reversible
2. **Use transactions**: Wrap schema changes in transactions for atomicity
3. **Test migrations**: Write tests for both up and down migrations
4. **Add validation**: Implement `validate` to verify post-migration state
5. **Number sequentially**: Use zero-padded numbers (e.g., `019-*.ts`)
6. **Describe changes**: Write clear descriptions of what changes and why
7. **Handle data carefully**: Preserve existing data when adding/removing columns
8. **Use indexes wisely**: Add indexes for common query patterns

### Testing Migrations

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { runMigrations, rollbackLastMigration } from "./migration/index.js";
import { createTestDatabase } from "./test/helpers.js";

describe("Database Migrations", () => {
  it("applies migration 018", async () => {
    const db = createTestDatabase();
    
    // Run migrations
    await runMigrations(db);
    
    // Verify schema
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    expect(tables.some((t) => t.name === "security_events")).toBe(true);
  });
  
  it("rolls back migration 018", async () => {
    const db = createTestDatabase();
    await runMigrations(db);
    
    // Rollback
    await rollbackLastMigration(db);
    
    // Verify table is gone
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    expect(tables.some((t) => t.name === "security_events")).toBe(false);
  });
});
```

## Client-Side Store Migrations

### Architecture

**File**: `packages/web/src/stores/migration.ts`

The client-side migration system provides:

- **Version tracking**: Built into Zustand persist middleware
- **Backup and restore**: Automatic backup before migration
- **Sequential migration**: Applies migrations step-by-step
- **Error handling**: Graceful fallback on migration failure
- **Migration flag**: UI notification when migration fails

### Store Versions

| Store | Key | Current Version | Data |
|-------|-----|----------------|------|
| `favoritesStore` | `mta-favorites` | 1 | Favorites, commutes, tapHistory |
| `arrivalsStore` | `mta-arrivals` | 1 | Cached arrivals per station |
| `journalStore` | `mta-journal` | 1 | TripRecord[], CommuteStats |
| `fareStore` | `mta-fare` | 1 | FareTracking, RideLogEntry[] |
| `settingsStore` | `mta-settings` | 1 | Theme, refresh interval, accessible mode |

### Migration Pattern

```typescript
import { createSafeMigration, backupState, restoreFromBackup } from "./migration";

const migrations = new Map<number, (state: unknown) => unknown>([
  [
    2,
    (state) => ({
      ...(state as Record<string, unknown>),
      newField: "defaultValue",
      existingField: transformExistingField(state),
    }),
  ],
]);

persist(
  (set, get) => ({
    // Store implementation
  }),
  {
    name: "mta-favorites",
    version: 2,
    migrate: createSafeMigration("mta-favorites", 2, migrations),
  }
);
```

### Migration Utilities

#### `createSafeMigration`

Creates a migration function with backup and error handling:

```typescript
const migrate = createSafeMigration("store-name", 3, migrations);
const newState = migrate(persistedState, oldVersion);
```

Features:
- Backs up state before migration
- Applies migrations sequentially
- Restores from backup on error
- Logs errors and sets migration failed flag

#### `backupState` / `restoreFromBackup`

```typescript
// Backup state
backupState("store-name", 1, state);

// Restore from backup
const restored = restoreFromBackup("store-name", 1);

// Clear backup
clearBackup("store-name", 1);
```

#### Migration Failed Flag

```typescript
import { setMigrationFailed, hasMigrationFailed, clearMigrationFailed } from "./migration";

// Check if migration failed
if (hasMigrationFailed()) {
  showMigrationFailedBanner();
}

// Clear flag after user acknowledges
clearMigrationFailed();
```

### Backup Keys

Backups use the pattern `_mta_backup_<store>_v<version>`:

```typescript
"_mta_backup_favorites_v1"
"_mta_backup_settings_v2"
"_mta_backup_journal_v1"
```

### Testing Client Migrations

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { createSafeMigration, backupState, restoreFromBackup } from "./migration";

describe("Favorites Store Migration", () => {
  it("migrates from v1 to v2", () => {
    const migrations = new Map([
      [2, (state) => ({ ...state, newField: "value" })],
    ]);
    const migrate = createSafeMigration("favorites", 2, migrations);
    
    const oldState = { favorites: [] };
    const newState = migrate(oldState, 1);
    
    expect(newState).toEqual({ favorites: [], newField: "value" });
  });
  
  it("restores from backup on error", () => {
    const migrations = new Map([
      [2, () => { throw new Error("Migration failed"); }],
    ]);
    const migrate = createSafeMigration("favorites", 2, migrations);
    
    const state = { favorites: [{ id: "1" }] };
    backupState("favorites", 1, state);
    
    const result = migrate(state, 1);
    
    expect(result).toEqual(state);
  });
});
```

## Cross-Cutting Considerations

### Performance

- **Server migrations**: Run during application startup before serving requests
- **Client migrations**: Run synchronously during store initialization
- **Large datasets**: Use batch processing for data migrations

### Safety

- **Always backup**: Both systems create backups before migration
- **Test thoroughly**: Write tests for both up and down migrations
- **Monitor failures**: Log and alert on migration failures
- **Graceful degradation**: App should function with old data if migration fails

### Versioning Strategy

1. **Server migrations**: Incremental numbers (016, 017, 018, ...)
2. **Client migrations**: Incremental integers starting at 1
3. **Never skip versions**: Always apply all intermediate migrations
4. **Version in sync**: Coordinate server and client versions for related features

### Rollback Strategy

1. **Server rollback**: Use `rollbackToVersion()` to revert database schema
2. **Client rollback**: Deploy previous build with old migration logic
3. **Data preservation**: Backups ensure no data loss during rollback
4. **Forward-only**: Prefer new migrations over rolling back when possible

## Troubleshooting

### Migration Lock Stuck

If the migration lock is stuck (e.g., crashed during migration):

```typescript
// Force release lock (use with caution)
import { releaseLock } from "./migration/index.js";
releaseLock();
```

### Migration Failed Flag Set

If client-side migration fails:

1. Check browser console for error details
2. Verify localStorage has space available
3. Clear migration flag manually if needed:
   ```typescript
   clearMigrationFailed();
   ```

### Backup Recovery

To restore from a backup:

```typescript
// List available backups
const backups = await listBackups();

// Restore specific backup
await restoreBackup(db, backups[0].path);
```

## CI/CD Integration

### Pre-Deployment Checklist

- [ ] All migrations tested locally
- [ ] Migration scripts committed to repo
- [ ] Backup strategy tested
- [ ] Rollback procedure documented
- [ ] Dry-run mode verified

### Database Migration in CI

```yaml
# .github/workflows/ci.yml
- name: Run database migrations
  run: |
    npm run migrate:dry-run
    npm run migrate:up
```

### Client Migration Testing in CI

```yaml
# .github/workflows/ci.yml
- name: Test client migrations
  run: |
    npm run test -- packages/web/src/stores/migration.test.ts
```

## Related Documentation

- [Testing Guide](./testing.md) - Testing strategies for migrations
- [Security Guide](./security.md) - Security considerations for data handling
- [Observability Guide](./observability.md) - Monitoring migration execution
