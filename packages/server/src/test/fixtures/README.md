# Middleware Test Database Fixtures

This directory contains test database fixtures and helper utilities for middleware integration testing.

## Overview

The test fixture system provides:

- **Pre-seeded test data** for all security/middleware database tables
- **Helper utilities** for creating and resetting test databases
- **Scenario-specific fixtures** for common test patterns
- **Transaction support** for isolated test execution

## Database Schema

The fixtures populate the following tables (defined in `migration/migrations/018-add-security-persistence.ts`):

| Table | Purpose |
|-------|---------|
| `security_api_key_registry` | API key storage with metadata |
| `security_password_reset_tokens` | Password reset tokens |
| `security_password_history` | Password hash history for reuse prevention |
| `security_password_reset_attempts` | Rate limiting for password reset requests |
| `security_account_lockouts` | Account lockout tracking |
| `security_rate_limit_bans` | Rate limit bans (IP/key-based) |
| `security_trusted_ips` | Trusted IPs that bypass rate limiting |
| `security_notification_preferences` | Per-key notification settings |
| `security_recent_events` | Security event history for deduplication |
| `security_notification_history` | Notification delivery tracking |
| `security_notification_templates` | Custom notification templates |

## Quick Start

### Basic Usage

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { createTestDatabaseWithFixtures, assertSecurityTableRowCount } from "./fixtures/middleware-helpers.js";
import { loadApiKeyRegistry } from "../security/security-db.js";

describe("My Middleware Test", () => {
  let db: Database.Database;

  beforeEach(async () => {
    db = await createTestDatabaseWithFixtures();
  });

  it("should load API keys from database", () => {
    const keys = loadApiKeyRegistry();
    expect(keys).toHaveLength(5); // Standard fixtures include 5 API keys
  });
});
```

### Scenario-Specific Fixtures

```typescript
import { createAuthTestDatabase, createPasswordResetTestDatabase } from "./fixtures/middleware-helpers.js";

// For authentication tests (minimal fixtures)
const db = await createAuthTestDatabase(); // Single read-only API key

// For password reset tests (includes tokens + rate limiting)
const db = await createPasswordResetTestDatabase(); // Valid/expired/used tokens + rate limits
```

### In-Test Fixture Reset

```typescript
import { resetToScenario } from "./fixtures/middleware-helpers.js";

beforeEach(async () => {
  db = await createTestDatabaseWithFixtures();
});

it("test with authorization scenario", () => {
  resetToScenario(db, "authorization"); // Now has read/write/admin keys

  // ... test code
});

it("test with rate limit scenario", () => {
  resetToScenario(db, "rate-limit"); // Now has bans + trusted IPs

  // ... test code
});
```

## Available Scenarios

| Scenario | Fixture Set | Use Case |
|----------|-------------|----------|
| `standard` | All fixtures | General integration tests |
| `auth` | Minimal auth fixtures | Basic authentication tests |
| `authorization` | Read/write/admin keys | Permission and RBAC tests |
| `password-reset` | Tokens + rate limits | Password reset flow tests |
| `rate-limit` | Bans + trusted IPs | Rate limiting tests |
| `security-events` | Events + notifications | Event correlation tests |
| `account-lockout` | Locked accounts + history | Account lockout tests |

## Helper Functions

### Database Creation

#### `createTestDatabaseWithFixtures()`
Creates an in-memory database with all standard fixtures loaded. **Use this for most tests.**

```typescript
const db = await createTestDatabaseWithFixtures();
```

#### `createEmptyTestDatabase()`
Creates a database with migrations applied but no data. Use when tests need complete control.

```typescript
const db = await createEmptyTestDatabase();
// Seed only what you need
```

#### `createFileBasedTestDatabaseWithFixtures(name?)`
Creates a file-based database for debugging or persistence testing. Returns cleanup function.

```typescript
const { db, cleanup } = await createFileBasedTestDatabaseWithFixtures("debug.db");
try {
  // ... test code
} finally {
  cleanup(); // Removes database file
}
```

### Scenario-Specific Creation

- `createAuthTestDatabase()` - Single valid API key
- `createAuthorizationTestDatabase()` - Multiple keys with different scopes
- `createPasswordResetTestDatabase()` - Password reset tokens + rate limits
- `createRateLimitTestDatabase()` - Rate limit bans + trusted IPs
- `createSecurityEventTestDatabase()` - Security events + notifications
- `createAccountLockoutTestDatabase()` - Locked accounts + history

### Reset Utilities

#### `resetSecurityFixtures(db)`
Clears all security fixture tables.

```typescript
resetSecurityFixtures(db);
// All tables now empty
```

#### `restoreStandardSecurityFixtures(db)`
Clears and re-seeds with standard fixtures.

```typescript
restoreStandardSecurityFixtures(db);
// Back to initial state
```

#### `resetToScenario(db, scenario)`
Clears and re-seeds with a specific scenario.

```typescript
resetToScenario(db, "rate-limit");
// Now has rate limit fixtures
```

### Assertion Helpers

#### `assertSecurityTableRowCount(db, tableName, expectedCount)`

```typescript
assertSecurityTableRowCount(db, "api_key_registry", 5);
// Throws if count != 5
```

#### `assertSecurityTableEmpty(db, tableName)`

```typescript
assertSecurityTableEmpty(db, "password_reset_tokens");
// Throws if table not empty
```

#### `getSecurityTableRows(db, tableName)`

```typescript
const rows = getSecurityTableRows(db, "rate_limit_bans");
console.log(rows); // Inspect data in tests
```

## Test Lifecycle Management

### Using `setupMiddlewareTestDatabase()`

For complex test suites, use the lifecycle helper:

```typescript
import { setupMiddlewareTestDatabase } from "./fixtures/middleware-helpers.js";

describe("Complex Test Suite", () => {
  const testDb = setupMiddlewareTestDatabase();

  beforeEach(async () => {
    await testDb.setup("authorization");
  });

  afterEach(() => {
    testDb.teardown();
  });

  it("should have read/write/admin keys", () => {
    const db = testDb.getDb();
    const count = db.prepare("SELECT COUNT(*) FROM security_api_key_registry").get();
    expect(count).toEqual({ "COUNT(*)": 3 });
  });
});
```

### Manual Lifecycle

```typescript
describe("Manual Lifecycle", () => {
  let db: Database.Database;

  beforeEach(async () => {
    db = await createTestDatabaseWithFixtures();
  });

  afterEach(() => {
    db.close();
  });

  it("test", () => {
    // Use db here
  });
});
```

## Transactional Testing

### `withTestTransaction(db, callback)`

Execute code within a transaction that **always rolls back**:

```typescript
test("should not modify database on error", async () => {
  const db = await createTestDatabaseWithFixtures();

  // This will NOT persist to the database
  await withTestTransaction(db, () => {
    db.prepare("INSERT INTO security_api_key_registry ...").run();
    throw new Error("Something went wrong");
  });

  // Database unchanged
  assertSecurityTableRowCount(db, "api_key_registry", 5);
});
```

### `withSavepoint(db, callback)`

Nested transaction support (can be used within existing transactions):

```typescript
test("nested savepoint", async () => {
  const db = await createTestDatabaseWithFixtures();

  db.transaction(() => {
    // Outer transaction

    withSavepoint(db, () => {
      // Inner savepoint
      db.prepare("INSERT ...").run();
      throw new Error("Rollback only this");
    });

    // Outer transaction continues
  })();
});
```

## Standard Fixture Data

### API Keys (`standardApiKeys`)

| key_id | scope | active | expires_at |
|--------|-------|--------|------------|
| `test_read_key_123` | read | true | +30 days |
| `test_write_key_456` | write | true | +30 days |
| `test_admin_key_789` | admin | true | never |
| `test_expired_key` | read | true | **expired yesterday** |
| `test_locked_key` | write | **false (locked)** | +30 days |

### Password Reset Tokens (`standardPasswordResetTokens`)

| token_id | key_id | expires_at | used |
|----------|--------|-------------|-----|
| `reset_token_valid_123` | test_read_key_123 | +30 minutes | false |
| `reset_token_expired_456` | test_write_key_456 | **expired 1 hour ago** | false |
| `reset_token_used_789` | test_admin_key_789 | +2 hours | **true** |

### Rate Limit Bans (`standardRateLimitBans`)

| identifier | banned_until | violation_count |
|------------|--------------|-----------------|
| `192.168.1.200` | +30 minutes | 15 |
| `banned_key_abc` | **expired 1 hour ago** | 8 |
| `10.0.0.50` | +24 hours | 25 |

### Trusted IPs (`standardTrustedIps`)

- `127.0.0.1` (localhost)
- `::1` (localhost IPv6)
- `10.0.0.1` (internal network)

## Best Practices

### ✅ DO

- **Use in-memory databases** for unit tests (`createTestDatabaseWithFixtures()`)
- **Use scenario-specific helpers** for focused test suites
- **Clean up between tests** with `resetSecurityFixtures()` or fresh databases
- **Use transactions** for tests that modify database state
- **Assert final state** with helper functions like `assertSecurityTableRowCount()`

### ❌ DON'T

- **Don't use file-based databases** unless testing persistence or debugging
- **Don't share databases between tests** without resetting
- **Don't forget to close connections** in `afterEach()` hooks
- **Don't rely on hardcoded IDs** without verifying fixtures loaded correctly

## Complete Example

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import {
  createTestDatabaseWithFixtures,
  resetToScenario,
  assertSecurityTableRowCount,
  withTestTransaction,
} from "../test/fixtures/middleware-helpers.js";
import { loadApiKeyRegistry, setSecurityDb } from "../security/security-db.js";

describe("API Key Management", () => {
  let db: Database.Database;

  beforeEach(async () => {
    db = await createTestDatabaseWithFixtures();
    setSecurityDb(db);
  });

  afterEach(() => {
    db.close();
  });

  describe("with read-only API key", () => {
    beforeEach(() => {
      resetToScenario(db, "auth"); // Single read key
    });

    it("should load exactly one API key", () => {
      const keys = loadApiKeyRegistry();
      expect(keys).toHaveLength(1);
      expect(keys[0]!.key.scope).toBe("read");
    });
  });

  describe("with multiple keys for authorization", () => {
    beforeEach(() => {
      resetToScenario(db, "authorization"); // read/write/admin keys
    });

    it("should load three API keys with different scopes", () => {
      const keys = loadApiKeyRegistry();
      expect(keys).toHaveLength(3);

      const scopes = keys.map((k) => k.key.scope);
      expect(scopes).toContain("read");
      expect(scopes).toContain("write");
      expect(scopes).toContain("admin");
    });

    it("should not persist changes within a test transaction", () => {
      withTestTransaction(db, () => {
        db.prepare("DELETE FROM security_api_key_registry").run();
        expect(() => assertSecurityTableRowCount(db, "api_key_registry", 0)).not.toThrow();
      });

      // Transaction rolled back - data unchanged
      assertSecurityTableRowCount(db, "api_key_registry", 3);
    });
  });

  describe("with locked and expired keys", () => {
    beforeEach(() => {
      resetToScenario(db, "standard"); // All 5 keys including locked/expired
    });

    it("should load active and inactive keys", () => {
      const keys = loadApiKeyRegistry();
      expect(keys).toHaveLength(5);

      const activeKeys = keys.filter((k) => k.key.active);
      expect(activeKeys).toHaveLength(4); // One key is locked (inactive)

      const expiredKeys = keys.filter((k) => k.key.expiresAt < Date.now());
      expect(expiredKeys).toHaveLength(1); // One key is expired
    });
  });
});
```

## File Structure

```
test/fixtures/
├── security.ts              # Seed data and insert functions for all security tables
├── middleware-helpers.ts    # High-level helpers for test lifecycle and scenarios
├── fixtures.ts              # GTFS-RT protobuf fixtures (feed testing)
└── feeds/                   # Binary feed fixtures (downloaded from MTA)
```

## Related Documentation

- `../database.ts` - Core test database utilities
- `../../migration/migrations/018-add-security-persistence.ts` - Schema definitions
- `../../security/security-db.ts` - Database access layer for security middleware
- `../../middleware/authentication.ts` - Authentication middleware (uses these fixtures)
