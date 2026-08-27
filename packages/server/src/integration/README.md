# Integration Testing Infrastructure

Server-side integration test helpers, database fixtures, and test data factories for middleware and API testing.

## Overview

The integration testing infrastructure provides:

- **In-memory database setup** with complete schema
- **Test data factories** for all domain entities
- **Authentication helpers** for API key testing
- **CSRF helpers** for state-changing requests
- **Module state cleanup** for test isolation
- **GTFS-RT protobuf fixtures** for feed parser testing

## Installation

Import from the server package:

```typescript
import {
  createIntegrationTestDatabase,
  createTestTrip,
  createTestApiKey,
  cleanupAllState,
  getCsrfToken,
} from "@mta-my-way/server/integration/test-helpers";

import {
  aDivisionFeed,
  bDivisionFeed,
  alertsFeed,
} from "@mta-my-way/server/test/fixtures";
```

## Database Setup

### Complete Integration Database

```typescript
import { createIntegrationTestDatabase } from "@mta-my-way/server/integration/test-helpers";

// Creates in-memory database with all schemas
const db = createIntegrationTestDatabase();

// Includes:
// - trips table (with owner_id for authorization)
// - commute_stats table
// - push_subscriptions table (with owner_id for authorization)
```

### Specialized Databases

```typescript
// Trip tracking only
const tripDb = createTripTrackingDatabase();

// Push subscriptions only
const pushDb = createPushDatabase();

// Close database when done
closeDatabase(db);
```

### Database Schema

**Trips Table:**
```sql
CREATE TABLE trips (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  origin_station_id TEXT NOT NULL,
  origin_station_name TEXT NOT NULL,
  destination_station_id TEXT NOT NULL,
  destination_station_name TEXT NOT NULL,
  line TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'N',
  departure_time INTEGER NOT NULL,
  arrival_time INTEGER NOT NULL,
  actual_duration_minutes INTEGER NOT NULL,
  scheduled_duration_minutes INTEGER,
  source TEXT NOT NULL DEFAULT 'manual',
  notes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  owner_id TEXT NOT NULL DEFAULT 'anonymous'
);

-- Indexes on date, origin, destination, line, departure_time, owner_id
```

**Push Subscriptions Table:**
```sql
CREATE TABLE push_subscriptions (
  endpoint_hash TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  favorites TEXT NOT NULL DEFAULT '[]',
  quiet_hours TEXT NOT NULL DEFAULT '{"enabled":false,"startHour":22,"endHour":7}',
  morning_scores TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  owner_id TEXT NOT NULL DEFAULT 'anonymous'
);

-- Indexes on updated_at, owner_id
```

**Commute Stats Table:**
```sql
CREATE TABLE commute_stats (
  commute_id TEXT PRIMARY KEY,
  average_duration_minutes REAL NOT NULL DEFAULT 0,
  median_duration_minutes REAL NOT NULL DEFAULT 0,
  std_dev_minutes REAL NOT NULL DEFAULT 0,
  total_trips INTEGER NOT NULL DEFAULT 0,
  trips_this_week INTEGER NOT NULL DEFAULT 0,
  trend REAL NOT NULL DEFAULT 0,
  average_delay_minutes REAL NOT NULL DEFAULT 0,
  max_delay_minutes REAL NOT NULL DEFAULT 0,
  on_time_percentage REAL NOT NULL DEFAULT 0,
  last_updated INTEGER NOT NULL
);
```

## Test Data Factories

### Station Index Fixture

```typescript
import { TEST_STATIONS } from "@mta-my-way/server/integration/test-helpers";

// Predefined station index with common test stations:
// - 101: South Ferry (1 line)
// - 102: Rector St (1 line)
// - 725: Times Sq-42 St (1,2,3,7,N,Q,R,W,S)
// - 726: 42 St-Port Authority (A,C,E)
// - 727: 50 St (A,C,E)

// All stations include:
// - id, name, lat, lon
// - lines array
// - northStopId, southStopId
// - transfers array (with walking time and accessibility)
// - ada boolean
// - borough
// - complex ID (where applicable)
```

### Trip Factory

```typescript
// Create test trip with defaults
const trip = createTestTrip({
  id: "trip-123",
  date: "2024-01-15",
  originId: "101",
  originName: "South Ferry",
  destinationId: "725",
  destinationName: "Times Sq-42 St",
  line: "1",
  departureTime: Date.now() - 3600000,
  arrivalTime: Date.now() - 1800000,
  actualDurationMinutes: 60,
  scheduledDurationMinutes: 55,
  source: "tracked",
  notes: "Regular commute",
});

// Defaults if not provided:
// - id: crypto.randomUUID()
// - date: today
// - origin: 101 (South Ferry)
// - destination: 725 (Times Square)
// - line: "1"
// - departureTime: 1 hour ago
// - arrivalTime: now
// - actualDurationMinutes: 60
// - scheduledDurationMinutes: 55
// - source: "manual"
// - notes: undefined
```

### Push Subscription Factory

```typescript
const subscription = createTestSubscription({
  endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint",
  p256dh: "test-p256dh-key",
  auth: "test-auth-key",
  favorites: [
    { id: "fav-1", stationId: "101", lines: ["1"], direction: "both" },
  ],
  quietHours: { enabled: false, startHour: 22, endHour: 7 },
  morningScores: {},
});

// Defaults:
// - endpoint: https://fcm.googleapis.com/fcm/send/test-endpoint
// - p256dh: test-p256dh-key
// - auth: test-auth-key
// - favorites: [{ id: "fav-1", stationId: "101", lines: ["1"], direction: "both" }]
// - quietHours: { enabled: false, startHour: 22, endHour: 7 }
// - morningScores: {}
```

## Authentication Helpers

### Create API Key Credentials

```typescript
import {
  createTestApiKey,
  createTestAdminCredentials,
  createTestUserCredentials,
  createTestReadCredentials,
} from "@mta-my-way/server/integration/test-helpers";

// Custom scope and role
const credentials = await createTestApiKey("write", "user");
// Returns: { keyId, apiKey, authorizationHeader: "Bearer keyId:apiKey" }

// Predefined credential types
const adminCreds = await createTestAdminCredentials();    // scope: "admin", role: "admin"
const userCreds = await createTestUserCredentials();     // scope: "write", role: "user"
const readCreds = await createTestReadCredentials();     // scope: "read", role: "user"

// Use in requests
const response = await app.request("/api/trips", {
  headers: {
    Authorization: credentials.authorizationHeader,
  },
});
```

### Scope Types

- **"read"** - Read-only access to public endpoints
- **"write"** - Read + write user data (favorites, trips, preferences)
- **"admin"** - Full access including admin operations

### Role Types

- **"guest"** - Unauthenticated user
- **"user"** - Regular authenticated user
- **"admin"** - Administrative user

## CSRF Protection Helpers

### Get CSRF Token

```typescript
import { getCsrfToken } from "@mta-my-way/server/integration/test-helpers";

// Fetch fresh CSRF token from /api/csrf-token endpoint
const token = await getCsrfToken(app);
```

### State-Changing Requests with CSRF

```typescript
import { requestWithCsrf } from "@mta-my-way/server/integration/test-helpers";

// Make POST/PUT/DELETE request with CSRF token
const response = await requestWithCsrf(app, "/api/favorites", {
  method: "POST",
  body: JSON.stringify({ stationId: "725", lines: ["1"], direction: "both" }),
  headers: {
    "Content-Type": "application/json",
  },
});
```

### Authenticated Requests with CSRF

```typescript
import { requestWithAuthAndCsrf } from "@mta-my-way/server/integration/test-helpers";

const credentials = await createTestUserCredentials();

// Combine authentication + CSRF for state changes
const response = await requestWithAuthAndCsrf(
  app,
  "/api/trips",
  { Authorization: credentials.authorizationHeader },
  {
    method: "POST",
    body: JSON.stringify(createTestTrip()),
  }
);
```

## Module State Cleanup

### Comprehensive Cleanup

```typescript
import { cleanupAllState } from "@mta-my-way/server/integration/test-hatters";

// Reset ALL module-level singletons between tests
// Call in beforeEach hook for test isolation
beforeEach(async () => {
  await cleanupAllState();
});

// Resets:
// - Cache state (cache.ts)
// - Alerts cache (alerts-poller.ts)
// - Authentication state (authentication.ts)
// - API keys (api-key-management.ts)
// - Rate limiter (rate-limiter.ts)
// - Auth rate limit (auth-rate-limit.ts)
// - Access patterns (authorization-security.ts)
// - Audit log (audit-log.ts)
// - Token encryption state (token-encryption.ts)
// - Trip tracking (trip-tracking.ts)
// - Shuttle cache (shuttle-matcher.ts)
// - Delay detector (delay-detector.ts)
// - Transformer state (transformer.ts)
```

### Database Cleanup Helpers

```typescript
import {
  clearCommuteStatsCache,
  clearAllTrips,
} from "@mta-my-way/server/integration/test-helpers";

// Clear commute stats
clearCommuteStatsCache(db);

// Clear all trips
clearAllTrips(db);
```

## GTFS-RT Protobuf Fixtures

### Feed Fixtures

```typescript
import {
  aDivisionFeed,
  bDivisionFeed,
  lLineFeed,
  emptyFeed,
  unassignedTripsFeed,
  reroutedTrackFeed,
  deletedEntitiesFeed,
  noNyctExtensionFeed,
  alertsFeed,
  pastArrivalsFeed,
  bDivisionFeedMissingFTrip,
  nqrwFeed,
} from "@mta-my-way/server/test/fixtures";

// Each fixture returns a Uint8Array (encoded protobuf)
// Use for testing feed parsers and transformers
```

### Available Fixtures

**Basic Route Feeds:**
- `aDivisionFeed()` - A Division (1,2,3,4,5,6,7) with assigned 1-train
- `bDivisionFeed()` - B Division (B,D,F,M,N,Q,R,W) with assigned F and unassigned D
- `lLineFeed()` - L Line (CBTC) feed
- `nqrwFeed()` - N/Q/R/W multi-line feed

**Special Cases:**
- `emptyFeed()` - Header only, no entities
- `unassignedTripsFeed()` - All trips unassigned
- `reroutedTrackFeed()` - Shows track change (reroute)
- `deletedEntitiesFeed()` - Contains deleted entities (should be filtered)
- `noNyctExtensionFeed()` - No NYCT trip replacement period
- `pastArrivalsFeed()` - All arrivals in past (>30s ago)
- `bDivisionFeedMissingFTrip()` - F trip cancelled between polls
- `alertsFeed()` - Multiple alert types (suspension, delays, resumed, HTML entities)

### Using Fixtures in Tests

```typescript
import { parser } from "../parser.js";
import { aDivisionFeed, alertsFeed } from "@mta-my-way/server/test/fixtures";

test("parses A Division feed", () => {
  const feed = aDivisionFeed();
  const result = parser(feed);

  expect(result.trips).toHaveLength(2);
  expect(result.trips[0].line).toBe("1");
  expect(result.trips[0].isAssigned).toBe(true);
});

test("parses alerts correctly", () => {
  const feed = alertsFeed();
  const result = parser(feed);

  expect(result.alerts).toHaveLength(4);
  expect(result.alerts[0].severity).toBe("warning");
  expect(result.alerts[0].affectedLines).toContain("F");
});
```

## Test Patterns

### Integration Test Example

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { createIntegrationTestDatabase, createTestTrip, cleanupAllState } from "@mta-my-way/server/integration/test-helpers";

describe("Trip recording", () => {
  let db: Database.Database;

  beforeEach(async () => {
    await cleanupAllState();
    db = createIntegrationTestDatabase();
  });

  it("records a trip successfully", async () => {
    const trip = createTestTrip({
      originId: "101",
      destinationId: "725",
      line: "1",
    });

    await db.prepare(
      "INSERT INTO trips (id, date, origin_station_id, origin_station_name, destination_station_id, destination_station_name, line, departure_time, arrival_time, actual_duration_minutes, created_at, updated_at, owner_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      trip.id,
      trip.date,
      trip.origin.stationId,
      trip.origin.stationName,
      trip.destination.stationId,
      trip.destination.stationName,
      trip.line,
      trip.departureTime,
      trip.arrivalTime,
      trip.actualDurationMinutes,
      Date.now(),
      Date.now(),
      "anonymous"
    );

    const recorded = db.prepare("SELECT * FROM trips WHERE id = ?").get(trip.id);
    expect(recorded).toBeDefined();
    expect(recorded.line).toBe("1");
  });
});
```

### API Test Example

```typescript
import { test } from "vitest";
import { createTestApiKey, requestWithAuthAndCsrf, cleanupAllState } from "@mta-my-way/server/integration/test-helpers";
import { app } from "../app.js";

describe("POST /api/trips", () => {
  beforeEach(async () => {
    await cleanupAllState();
  });

  it("creates trip with authentication and CSRF", async () => {
    const credentials = await createTestUserCredentials();
    const trip = createTestTrip();

    const response = await requestWithAuthAndCsrf(
      app,
      "/api/trips",
      { Authorization: credentials.authorizationHeader },
      {
        method: "POST",
        body: JSON.stringify(trip),
      }
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.id).toBe(trip.id);
  });
});
```

## Best Practices

### 1. Always Clean Up State

```typescript
beforeEach(async () => {
  await cleanupAllState();
  vi.clearAllMocks();
});
```

### 2. Use In-Memory Databases

```typescript
// Good: Isolated database
const db = createIntegrationTestDatabase();

// Avoid: Shared file database in tests
const db = new Database("./test.db");
```

### 3. Use Factories for Consistency

```typescript
// Good: Use factory with defaults
const trip = createTestTrip({ line: "1" });

// Avoid: Manual creation
const trip = {
  id: "123",
  date: "2024-01-15",
  // ... 20 more properties
};
```

### 4. Combine Authentication + CSRF

```typescript
// For state-changing endpoints (POST/PUT/DELETE)
const response = await requestWithAuthAndCsrf(
  app,
  "/api/favorites",
  { Authorization: creds.authorizationHeader },
  { method: "POST", body: JSON.stringify(data) }
);
```

### 5. Use Realistic Fixtures

```typescript
// Good: Use realistic protobuf fixtures
const feed = aDivisionFeed();
const result = parser(feed);

// Avoid: Manually constructed protobuf
const feed = Buffer.from([/* lots of bytes */]);
```

## Troubleshooting

### State Leaking Between Tests

```typescript
// Add comprehensive cleanup
beforeEach(async () => {
  await cleanupAllState();
  vi.clearAllMocks();
  vi.clearAllTimers();
});
```

### CSRF Token Errors

```typescript
// Always fetch fresh token
const token = await getCsrfToken(app);

// Use helper for state changes
const response = await requestWithCsrf(app, "/api/data", {
  method: "POST",
  body: JSON.stringify(data),
});
```

### Database Lock Errors

```typescript
// Use in-memory database with WAL mode
const db = createIntegrationTestDatabase(); // WAL enabled by default

// Close database after test
afterAll(() => {
  closeDatabase(db);
});
```

## Related Documentation

- [Shared Test Helpers](../shared/src/testing/README.md) - Core testing utilities
- [Server Test Fixtures](./test/fixtures.ts) - GTFS-RT protobuf fixtures
- [Vitest Configuration](../../vitest.config.ts) - Test runner setup
- [Playwright E2E Tests](../../../tests/e2e/README.md) - End-to-end testing
