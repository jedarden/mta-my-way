# Test Helpers

This directory provides comprehensive testing utilities for MTA My Way, a TypeScript monorepo for NYC subway commuters. These helpers are shared across all packages (server, web, shared).

## Table of Contents

- [Overview](#overview)
- [Core Test Helpers (`test-helpers.ts`)](#core-test-helpers-test-helpersts)
- [Security Helpers (`security-helpers.ts`)](#security-helpers-security-helpersts)
- [Observability Helpers (`observability-helpers.ts`)](#observability-helpers-observability-helpersts)
- [Middleware Helpers (`testing/middleware/`)](#middleware-helpers-testingmiddleware)
- [Smoke Tests (`smoke.test.ts`)](#smoke-tests-smoketestts)
- [Usage Examples](#usage-examples)
- [Known Issues and Missing Helpers](#known-issues-and-missing-helpers)

---

## Overview

The test helpers are organized into four main modules:

| Module | Purpose | Lines of Code |
|--------|---------|---------------|
| `test-helpers.ts` | Core test utilities (mock data, fixtures, assertions) | 988 |
| `security-helpers.ts` | Security testing (auth, CSRF, rate limiting, input validation) | 526 |
| `observability-helpers.ts` | Logging, metrics, tracing, performance monitoring | 839 |
| `middleware/` | Middleware testing (request builder, chain runner, header assertions, fixtures) | 537 |

All helpers are built on top of [Vitest](https://vitest.dev/) and use `vi` for mocking.

`response-validation.ts` also lives in this directory; it is exercised by its own test file rather than documented per-helper here.

---

## Core Test Helpers (`test-helpers.ts`)

### Mock Data Generators

#### `createMockStation(overrides?: object): Station`
Creates a mock subway station object.

**Parameters:**
- `overrides` (optional): Object to merge with default station data

**Type Definitions:**
All types are defined in [`packages/shared/src/types/stations.ts`](../types/stations.ts):

- [`Station`](../types/stations.ts#L29) - Main station interface (lines 29-52)
- [`Borough`](../types/stations.ts#L7) - NYC borough type: `"manhattan" | "brooklyn" | "queens" | "bronx" | "statenisland"` (line 7)
- [`TransferConnection`](../types/stations.ts#L15) - Transfer connection interface with `toStationId`, `toLines`, `walkingSeconds`, and `accessible` fields (lines 15-24)

**Import Path:**
```typescript
// Import types from the shared package
import type { Station, Borough, TransferConnection } from "@mta-my-way/shared/types/stations";
```

**Returns:** Station object with fields: `id`, `name`, `lat`, `lon`, `lines`, `northStopId`, `southStopId`, `transfers`, `ada`, `borough`

**Example:**
```typescript
const station = createMockStation({
  id: "725",
  name: "Times Square-42 St",
  lines: ["1", "2", "3"]
});
```

---

#### `createMockRoute(overrides?: object): Route`
Creates a mock subway route object.

**Parameters:**
- `overrides` (optional): Object to merge with default route data

**Returns:** Route object with fields: `id`, `shortName`, `longName`, `color`, `textColor`, `feedId`, `division`, `stops`, `isExpress`

**Example:**
```typescript
const route = createMockRoute({
  id: "1",
  shortName: "1",
  longName: "Broadway-7th Ave Local"
});
```

---

#### `createMockArrival(overrides?: object): Arrival`
Creates a mock arrival prediction object.

**Parameters:**
- `overrides` (optional): Object to merge with default arrival data

**Returns:** Arrival object with fields: `line`, `direction`, `arrivalTime`, `minutesAway`, `isAssigned`, `isRerouted`, `tripId`, `destination`, `confidence`, `feedName`, `feedAge`

**Example:**
```typescript
const arrival = createMockArrival({
  line: "1",
  direction: "N",
  minutesAway: 2,
  destination: "Van Cortlandt Park"
});
```

---

#### `createMockAlert(overrides?: object): Alert`
Creates a mock service alert object.

**Parameters:**
- `overrides` (optional): Object to merge with default alert data

**Returns:** Alert object with fields: `id`, `severity`, `headline`, `description`, `affectedLines`, `activePeriod`, `cause`, `effect`

**Example:**
```typescript
const alert = createMockAlert({
  severity: "warning",
  headline: "Delays on 1 train",
  affectedLines: ["1"]
});
```

---

#### `createMockFavorite(overrides?: object): Favorite`
Creates a mock favorite station object.

**Parameters:**
- `overrides` (optional): Object to merge with default favorite data

**Returns:** Favorite object with fields: `id`, `stationId`, `stationName`, `lines`, `direction`, `sortOrder`, `label`

**Example:**
```typescript
const favorite = createMockFavorite({
  stationId: "725",
  label: "Work"
});
```

---

#### `createMockCommute(overrides?: object): Commute`
Creates a mock commute object.

**Parameters:**
- `overrides` (optional): Object to merge with default commute data

**Returns:** Commute object with fields: `id`, `name`, `origin`, `destination`, `preferredLines`, `enableTransferSuggestions`

**Example:**
```typescript
const commute = createMockCommute({
  name: "Work to Home",
  origin: createMockStation({ id: "725" }),
  destination: createMockStation({ id: "726" })
});
```

---

#### `createMockTripRecord(overrides?: object): TripRecord`
Creates a mock trip record object.

**Parameters:**
- `overrides` (optional): Object to merge with default trip record data

**Returns:** TripRecord object with fields: `id`, `date`, `origin`, `destination`, `line`, `departureTime`, `arrivalTime`, `actualDurationMinutes`, `source`

**Example:**
```typescript
const trip = createMockTripRecord({
  line: "1",
  actualDurationMinutes: 30
});
```

---

#### `createMockPushSubscription(overrides?: object): PushSubscription`
Creates a mock push subscription object.

**Parameters:**
- `overrides` (optional): Object to merge with default subscription data

**Returns:** PushSubscription object with fields: `endpoint`, `keys`, `expirationTime`

**Example:**
```typescript
const subscription = createMockPushSubscription({
  endpoint: "https://fcm.googleapis.com/fcm/send/test"
});
```

---

### Test Fixtures

#### `createTestFixture(): TestFixture`
Creates a complete test fixture with related mock data.

**Returns:** Object containing:
- `stations`: Object with station mocks (timesSquare, pennStation)
- `routes`: Object with route mocks
- `arrivals`: Object with arrival arrays grouped by station/direction
- `alerts`: Array of alert mocks
- `favorites`: Array of favorite mocks
- `commutes`: Array of commute mocks

**Example:**
```typescript
const fixture = createTestFixture();
// fixture.stations.timesSquare
// fixture.arrivals.timesSquareNorth[0]
// fixture.alerts[0]
```

---

### Assertion Helpers

#### `assertHasProperties(obj: unknown, requiredProps: string[]): void`
Asserts that an object has all required properties.

**Parameters:**
- `obj`: Object to check
- `requiredProps`: Array of property names that must exist

**Throws:** Test assertion error if properties are missing

**Example:**
```typescript
assertHasProperties(station, ["id", "name", "lat", "lon"]);
```

---

#### `assertIsRecent(timestamp: number, maxAgeMs?: number): void`
Asserts that a timestamp is recent (within specified milliseconds).

**Parameters:**
- `timestamp`: Unix timestamp in milliseconds
- `maxAgeMs` (default: 60000): Maximum age in milliseconds (default: 1 minute)

**Throws:** Test assertion error if timestamp is too old or in the future

**Example:**
```typescript
assertIsRecent(Date.now(), 5000); // Within 5 seconds
```

---

#### `assertApiResponse(response: unknown, expectedStatus: number, expectedDataShape?: object): void`
Asserts that an API response has the correct structure.

**Parameters:**
- `response`: Response object with `status` and `data` fields
- `expectedStatus`: Expected HTTP status code
- `expectedDataShape` (optional): Expected shape of response data

**Throws:** Test assertion error if response doesn't match expectations

**Example:**
```typescript
assertApiResponse(response, 200, { success: true });
```

---

#### `assertIsSorted<T>(array: T[], key: keyof T, order?: "asc" | "desc"): void`
Asserts that an array is sorted by a specific key.

**Parameters:**
- `array`: Array to check
- `key`: Property key to sort by
- `order` (default: "asc"): Sort order ("asc" or "desc")

**Throws:** Test assertion error if array is not sorted

**Example:**
```typescript
assertIsSorted(arrivals, "minutesAway", "asc");
```

---

### Mock Helpers

#### `createMockLogger(): MockLogger`
Creates a mock logger with Vitest spies.

**Returns:** Logger object with mocked methods: `debug`, `info`, `warn`, `error`, `child`

**Example:**
```typescript
const logger = createMockLogger();
logger.info("Test message", { stationId: "725" });
expect(logger.info).toHaveBeenCalledWith("Test message", { stationId: "725" });
```

---

#### `createMockDatabase(): MockDatabase`
Creates a mock database connection with helper methods.

**Returns:** Database mock with methods:
- `prepare`, `exec`, `transaction`, `pragma`, `close`
- `_setData(table, data)`: Set mock data for a table
- `_getData(table)`: Get mock data for a table

**Example:**
```typescript
const db = createMockDatabase();
db._setData("stations", [station1, station2]);
const stmt = db.prepare("SELECT * FROM stations");
```

---

#### `createMockResponse(data: unknown, status?: number): Response`
Creates a mock fetch Response object.

**Parameters:**
- `data`: Response body data
- `status` (default: 200): HTTP status code

**Returns:** Response-like object with `ok`, `status`, `json()`, `text()`, `headers`

**Example:**
```typescript
const response = createMockResponse({ success: true }, 200);
const data = await response.json();
```

---

#### `createMockFetch(responses: Array<{url: string, response: Response}>): MockFetch`
Creates a mock fetch function with predefined responses.

**Parameters:**
- `responses`: Array of URL-response mappings

**Returns:** Mocked `fetch` function

**Example:**
```typescript
const mockFetch = createMockFetch([
  { url: "/api/stations", response: createMockResponse([station1, station2]) }
]);
const data = await mockFetch("/api/stations");
```

---

### Test Setup Helpers

#### `setupTestEnvironment(): void`
Sets up the test environment with common mocks (console, performance API, requestIdleCallback).

**Example:**
```typescript
beforeEach(() => {
  setupTestEnvironment();
});
```

---

#### `cleanupTestEnvironment(): void`
Cleans up test environment mocks.

**Example:**
```typescript
afterEach(() => {
  cleanupTestEnvironment();
});
```

---

#### `createTestContext(): TestContext`
Creates a test context object with common setup and cleanup.

**Returns:** Object containing:
- `mockLogger`: Mock logger
- `mockDb`: Mock database
- `mockFetch`: Mock fetch function
- `fixture`: Test fixture data
- `cleanup`: Cleanup function

**Example:**
```typescript
const ctx = createTestContext();
// ... run tests
ctx.cleanup();
```

---

### Time Utilities

#### `mockCurrentTime(timestamp: number): void`
Mocks the current time for consistent tests.

**Parameters:**
- `timestamp`: Unix timestamp in milliseconds

**Example:**
```typescript
mockCurrentTime(1704067200000); // 2024-01-01 00:00:00 UTC
```

---

#### `createMockDateString(date?: Date): string`
Creates a mock ISO date string.

**Parameters:**
- `date` (default: `new Date()`): Date to convert

**Returns:** ISO 8601 date string

**Example:**
```typescript
const dateStr = createMockDateString(new Date("2024-01-01"));
```

---

### Performance Testing Utilities

#### `measureExecutionTime<T>(fn: () => T | Promise<T>): Promise<{result: T, durationMs: number}>`
Measures execution time of a function.

**Parameters:**
- `fn`: Function to measure (sync or async)

**Returns:** Object with `result` (function return value) and `durationMs` (execution time in milliseconds)

**Example:**
```typescript
const { result, durationMs } = await measureExecutionTime(async () => {
  return await fetchData();
});
```

---

#### `assertCompletesWithin<T>(fn: () => T | Promise<T>, maxMs: number): Promise<T>`
Asserts that a function completes within a time limit.

**Parameters:**
- `fn`: Function to test
- `maxMs`: Maximum allowed time in milliseconds

**Returns:** Function return value

**Throws:** Test assertion error if function takes too long

**Example:**
```typescript
await assertCompletesWithin(async () => {
  await quickOperation();
}, 100); // Must complete within 100ms
```

---

### HTTP Testing Utilities

#### `createMockHeaders(overrides?: object): Headers`
Creates mock HTTP request headers.

**Parameters:**
- `overrides` (optional): Headers to add/override

**Returns:** Headers object with default headers: `content-type`, `user-agent`

**Example:**
```typescript
const headers = createMockHeaders({
  authorization: "Bearer token123"
});
```

---

#### `createMockRequest(overrides?: object): Request`
Creates a mock HTTP request object.

**Parameters:**
- `overrides` (optional): Request properties to override (method, url, headers, body)

**Returns:** Request-like object with `method`, `url`, `headers`, `body`, `json()`, `text()`

**Example:**
```typescript
const request = createMockRequest({
  method: "POST",
  url: "/api/favorites",
  body: { stationId: "725" }
});
```

---

### Async Testing Utilities

#### `waitFor(condition: () => boolean, timeout?: number, interval?: number): Promise<void>`
Waits for a condition to become true.

**Parameters:**
- `condition`: Function that returns boolean
- `timeout` (default: 5000): Maximum wait time in milliseconds
- `interval` (default: 50): Check interval in milliseconds

**Throws:** Error if condition is not met within timeout

**Example:**
```typescript
await waitFor(() => {
  return document.querySelector(".loaded") !== null;
}, 3000);
```

---

#### `flushPromises(): Promise<void>`
Flushes all pending promises.

**Returns:** Promise that resolves after one event loop tick

**Example:**
```typescript
await flushPromises();
```

---

#### `waitForAll<T>(operations: Array<() => Promise<T>>): Promise<T[]>`
Waits for multiple async operations to complete.

**Parameters:**
- `operations`: Array of functions returning promises

**Returns:** Array of results from all operations

**Example:**
```typescript
const results = await waitForAll([
  () => fetchStation("725"),
  () => fetchStation("726")
]);
```

---

## Security Helpers (`security-helpers.ts`)

### Mock Authentication

#### `createMockApiKey(overrides?: object): ApiKey`
Creates a mock API key object.

**Parameters:**
- `overrides` (optional): Object to merge with default API key data

**Returns:** ApiKey object with fields: `keyId`, `keyHash`, `keySalt`, `scope`, `role`, `rateLimitTier`, `active`, `createdAt`, `expiresAt`, `failedAttempts`

**Example:**
```typescript
const apiKey = createMockApiKey({
  scope: "read:arrivals read:alerts",
  role: "user"
});
```

---

#### `createMockAuthToken(overrides?: object): AuthToken`
Creates a mock authentication token object.

**Parameters:**
- `overrides` (optional): Object to merge with default token data

**Returns:** AuthToken object with fields: `token`, `expiresAt`, `scopes`, `userId`

**Example:**
```typescript
const token = createMockAuthToken({
  scopes: ["read:arrivals", "read:alerts"],
  userId: "user_123"
});
```

---

#### `createMockSession(overrides?: object): Session`
Creates a mock session object.

**Parameters:**
- `overrides` (optional): Object to merge with default session data

**Returns:** Session object with fields: `sessionId`, `userId`, `createdAt`, `lastActivityAt`, `expiresAt`, `ip`, `userAgent`

**Example:**
```typescript
const session = createMockSession({
  userId: "user_123",
  ip: "127.0.0.1"
});
```

---

### CSRF Protection

#### `generateRandomToken(length?: number): string`
Generates a random token string for testing.

**Parameters:**
- `length` (default: 32): Token length

**Returns:** Random alphanumeric token

**Example:**
```typescript
const token = generateRandomToken(32);
```

---

#### `createMockCsrfToken(): CsrfToken`
Creates a mock CSRF token object.

**Returns:** Object with `token` and `expiresAt` fields

**Example:**
```typescript
const csrfToken = createMockCsrfToken();
```

---

#### `createCsrfHeaders(token: string): Headers`
Creates CSRF headers for testing.

**Parameters:**
- `token`: CSRF token value

**Returns:** Headers object with `x-csrf-token` and `content-type`

**Example:**
```typescript
const headers = createCsrfHeaders("my_token_123");
```

---

### Rate Limiting

#### `createMockRateLimitState(overrides?: object): RateLimitState`
Creates a mock rate limit state object.

**Parameters:**
- `overrides` (optional): Object to merge with default rate limit data

**Returns:** RateLimitState object with fields: `identifier`, `remaining`, `resetAt`, `limit`, `windowMs`

**Example:**
```typescript
const rateLimit = createMockRateLimitState({
  remaining: 60,
  limit: 60
});
```

---

#### `createMockRateLimitBan(overrides?: object): RateLimitBan`
Creates a mock rate limit ban object.

**Parameters:**
- `overrides` (optional): Object to merge with default ban data

**Returns:** RateLimitBan object with fields: `identifier`, `bannedUntil`, `violationCount`, `reason`

**Example:**
```typescript
const ban = createMockRateLimitBan({
  bannedUntil: Date.now() + 3600000,
  reason: "Rate limit exceeded"
});
```

---

### Input Validation

#### `MALICIOUS_INPUTS: object`
Constant containing malicious input patterns for testing validation.

**Structure:**
- `sqlInjection`: SQL injection patterns
- `xss`: XSS patterns
- `pathTraversal`: Path traversal patterns
- `commandInjection`: Command injection patterns
- `ldapInjection`: LDAP injection patterns
- `nosqlInjection`: NoSQL injection patterns
- `headerInjection`: Header injection patterns

**Example:**
```typescript
MALICIOUS_INPUTS.sqlInjection.forEach(input => {
  expect(validator.sanitize(input)).not.toContain("<script>");
});
```

---

#### `containsMaliciousPatterns(input: string): boolean`
Tests if input contains malicious patterns.

**Parameters:**
- `input`: String to test

**Returns:** `true` if malicious patterns are detected

**Example:**
```typescript
expect(containsMaliciousPatterns("'; DROP TABLE users; --")).toBe(true);
```

---

#### `sanitizeInput(input: string): string`
Sanitizes input for testing (compare with actual sanitization).

**Parameters:**
- `input`: String to sanitize

**Returns:** Sanitized string with dangerous patterns removed

**Example:**
```typescript
const sanitized = sanitizeInput("<script>alert('XSS')</script>");
expect(sanitized).not.toContain("<script>");
```

---

### Security Context Mocking

#### `createMockSecurityContext(overrides?: object): SecurityContext`
Creates a mock security context object.

**Parameters:**
- `overrides` (optional): Object to merge with default security context data

**Returns:** SecurityContext object with fields: `isAuthenticated`, `userId`, `apiKey`, `scopes`, `ip`, `userAgent`, `sessionId`, `csrfToken`

**Example:**
```typescript
const context = createMockSecurityContext({
  isAuthenticated: false,
  ip: "127.0.0.1"
});
```

---

#### `createAuthenticatedContext(overrides?: object): SecurityContext`
Creates an authenticated security context.

**Parameters:**
- `overrides` (optional): Object to merge with default authenticated context data

**Returns:** SecurityContext object with `isAuthenticated: true`

**Example:**
```typescript
const context = createAuthenticatedContext({
  userId: "user_123",
  scopes: ["read:arrivals", "write:favorites"]
});
```

---

### Security Event Mocking

#### `createMockSecurityEvent(overrides?: object): SecurityEvent`
Creates a mock security event object.

**Parameters:**
- `overrides` (optional): Object to merge with default event data

**Returns:** SecurityEvent object with fields: `eventId`, `type`, `severity`, `timestamp`, `details`

**Example:**
```typescript
const event = createMockSecurityEvent({
  type: "auth_failure",
  severity: "warning"
});
```

---

#### `SECURITY_EVENT_TYPES: object`
Constant containing security event type categories.

**Structure:**
- `authentication`: Login/logout/session events
- `authorization`: Access control events
- `rateLimit`: Rate limiting events
- `data`: Data access events
- `session`: Session management events
- `csrf`: CSRF protection events
- `input`: Input validation events

**Example:**
```typescript
SECURITY_EVENT_TYPES.authentication.forEach(type => {
  // Test each authentication event type
});
```

---

### Password Testing Utilities

#### `PASSWORD_STRENGTH: object`
Constant containing password strength examples.

**Structure:**
- `weak`: Weak password example
- `fair`: Fair password example
- `good`: Good password example
- `strong`: Strong password example

**Example:**
```typescript
const result = passwordValidator(PASSWORD_STRENGTH.weak.password);
expect(result.score).toBe(0);
```

---

#### `createMockPasswordHash(overrides?: object): PasswordHash`
Creates a mock password hash object.

**Parameters:**
- `overrides` (optional): Object to merge with default hash data

**Returns:** PasswordHash object with fields: `hash`, `salt`, `iterations`

**Example:**
```typescript
const hash = createMockPasswordHash({
  iterations: 10
});
```

---

#### `createMockPasswordResetToken(overrides?: object): PasswordResetToken`
Creates a mock password reset token object.

**Parameters:**
- `overrides` (optional): Object to merge with default token data

**Returns:** PasswordResetToken object with fields: `tokenId`, `keyId`, `tokenHash`, `createdAt`, `expiresAt`, `used`, `clientIp`, `userAgent`

**Example:**
```typescript
const resetToken = createMockPasswordResetToken({
  clientIp: "127.0.0.1"
});
```

---

### RBAC Testing Utilities

#### `ROLES: object`
Constant containing role definitions with permissions.

**Structure:**
- `admin`: All permissions (`*`)
- `user`: Standard user permissions
- `readonly`: Read-only permissions
- `service`: Service account permissions

**Example:**
```typescript
const userRole = ROLES.user;
expect(userRole.permissions).toContain("read:arrivals");
```

---

#### `hasPermission(role: keyof typeof ROLES, permission: string): boolean`
Checks if a role has a specific permission.

**Parameters:**
- `role`: Role name (admin, user, readonly, service)
- `permission`: Permission string to check

**Returns:** `true` if role has the permission

**Example:**
```typescript
expect(hasPermission("user", "read:arrivals")).toBe(true);
expect(hasPermission("readonly", "write:favorites")).toBe(false);
```

---

### Audit Log Testing

#### `createMockAuditLogEntry(overrides?: object): AuditLogEntry`
Creates a mock audit log entry.

**Parameters:**
- `overrides` (optional): Object to merge with default audit log data

**Returns:** AuditLogEntry object with fields: `id`, `timestamp`, `userId`, `action`, `resourceType`, `resourceId`, `ip`, `userAgent`, `success`, `details`

**Example:**
```typescript
const entry = createMockAuditLogEntry({
  action: "api_key_created",
  resourceType: "api_key",
  resourceId: "key_test_123"
});
```

---

#### `AUDIT_ACTIONS: object`
Constant containing audit action type categories.

**Structure:**
- `authentication`: Login/password actions
- `api_keys`: API key management actions
- `data`: Data operations
- `admin`: User management actions
- `sessions`: Session management actions

**Example:**
```typescript
AUDIT_ACTIONS.api_keys.forEach(action => {
  // Test each API key audit action
});
```

---

### Mock Security Middleware

#### `createMockSecurityMiddleware(): MockSecurityMiddleware`
Creates a mock security middleware with context and helper methods.

**Returns:** Object containing:
- `context`: Security context object
- `authenticate(userId)`: Authenticate a user
- `authorize(permission)`: Check permission
- `setCsrfToken(token)`: Set CSRF token
- `checkRateLimit()`: Check rate limit status

**Example:**
```typescript
const middleware = createMockSecurityMiddleware();
middleware.authenticate("user_123");
middleware.authorize("read:arrivals");
```

---

### Test Assertions

#### `isSanitized(sanitized: string): boolean`
Checks if input is properly sanitized.

**Parameters:**
- `sanitized`: String to check

**Returns:** `true` if sanitized input is safe

**Example:**
```typescript
expect(isSanitized(sanitizeInput("<script>alert('XSS')</script>"))).toBe(true);
```

---

#### `hasSecurityHeaders(headers: Headers): boolean`
Checks if headers include required security headers.

**Parameters:**
- `headers`: Headers object to check

**Returns:** `true` if all required security headers are present

**Required headers:**
- `x-content-type-options: nosniff`
- `x-frame-options`
- `x-xss-protection`
- `strict-transport-security` with `max-age=`

**Example:**
```typescript
expect(hasSecurityHeaders(response.headers)).toBe(true);
```

---

## Observability Helpers (`observability-helpers.ts`)

### Logger Mocking

#### `createMockLogger(): MockLogger`
Creates a mock logger that captures all log entries.

**Returns:** Logger object with:
- Standard methods: `debug`, `info`, `warn`, `error`, `child`
- `entries`: Array of captured log entries
- `clear()`: Clear all log entries
- `getEntriesAtLevel(level)`: Get logs at specific level
- `getEntriesWithMessage(message)`: Get logs containing message
- `getLastEntry()`: Get most recent log entry

**Example:**
```typescript
const logger = createMockLogger();
logger.info("User logged in", { userId: "user_123" });
logger.error("Database error", error);

const errorLogs = logger.getEntriesAtLevel("error");
expect(errorLogs).toHaveLength(1);
```

---

#### `assertLoggerCalled(mockLogger, level, message, context?): void`
Asserts that a logger was called with specific parameters.

**Parameters:**
- `mockLogger`: Mock logger instance
- `level`: Log level (debug, info, warn, error)
- `message`: Expected message
- `context` (optional): Expected context object

**Example:**
```typescript
assertLoggerCalled(logger, "info", "User logged in", { userId: "user_123" });
```

---

#### `assertLoggerNotCalled(mockLogger, level): void`
Asserts that a logger was NOT called at a specific level.

**Parameters:**
- `mockLogger`: Mock logger instance
- `level`: Log level that should not have been called

**Example:**
```typescript
assertLoggerNotCalled(logger, "error");
```

---

### Metrics Testing

#### `createMockMetricsRegistry(): MockMetricsRegistry`
Creates a mock metrics registry with counter, gauge, and histogram support.

**Returns:** Metrics registry object with:
- `counter(name, help)`: Create/get counter metric
- `gauge(name, help)`: Create/get gauge metric
- `histogram(name, help, buckets)`: Create/get histogram metric
- `getSnapshots()`: Get all metric snapshots
- `getMetricSnapshots(name)`: Get snapshots for specific metric
- `getMetricValue(name)`: Get current metric value
- `clear()`: Clear all metrics

**Example:**
```typescript
const metrics = createMockMetricsRegistry();
const counter = metrics.counter("api_requests", "Total API requests");
counter.inc(1, { endpoint: "/api/stations" });

const value = metrics.getMetricValue("api_requests");
expect(value).toBe(1);
```

---

#### `assertCounterIncremented(mockMetrics, metricName, expectedValue?): void`
Asserts that a counter was incremented.

**Parameters:**
- `mockMetrics`: Mock metrics registry
- `metricName`: Name of the counter
- `expectedValue` (optional): Expected final value

**Example:**
```typescript
assertCounterIncremented(metrics, "api_requests", 10);
```

---

#### `assertGaugeSet(mockMetrics, metricName, expectedValue): void`
Asserts that a gauge was set to a specific value.

**Parameters:**
- `mockMetrics`: Mock metrics registry
- `metricName`: Name of the gauge
- `expectedValue`: Expected gauge value

**Example:**
```typescript
assertGaugeSet(metrics, "active_connections", 5);
```

---

#### `assertHistogramObserved(mockMetrics, metricName, expectedValues?): void`
Asserts that a histogram observed values.

**Parameters:**
- `mockMetrics`: Mock metrics registry
- `metricName`: Name of the histogram
- `expectedValues` (optional): Expected observed values

**Example:**
```typescript
assertHistogramObserved(metrics, "request_duration", [10, 20, 30]);
```

---

### Tracing Testing

#### `createMockTracer(): MockTracer`
Creates a mock tracer for distributed tracing.

**Returns:** Tracer object with:
- `generateTraceId()`: Generate random trace ID
- `generateSpanId()`: Generate random span ID
- `startSpan(name, parentContext)`: Start a new span
- `endSpan(attributes)`: End the active span
- `activeSpan()`: Get current active span
- `addEvent(name, attributes)`: Add event to current span
- `setAttribute(key, value)`: Set attribute on current span
- `setStatus(code, message)`: Set status of current span
- `withSpan(name, fn)`: Run function within a span
- `getCompletedSpans()`: Get all completed spans
- `clearCompleted()`: Clear completed spans
- `getSpansForTrace(traceId)`: Get spans for specific trace

**Example:**
```typescript
const tracer = createMockTracer();
const span = tracer.startSpan("fetch_station");
tracer.setAttribute("station_id", "725");
tracer.endSpan({ success: true });

expect(span.duration).toBeGreaterThanOrEqual(0);
```

---

#### `assertSpanCreated(mockTracer, name): void`
Asserts that a span was created.

**Parameters:**
- `mockTracer`: Mock tracer instance
- `name`: Expected span name

**Example:**
```typescript
assertSpanCreated(tracer, "fetch_station");
```

---

#### `assertSpanHasAttributes(span, attributes): void`
Asserts that a span has specific attributes.

**Parameters:**
- `span`: Span snapshot object
- `attributes`: Expected attributes

**Example:**
```typescript
assertSpanHasAttributes(span, { station_id: "725", success: true });
```

---

#### `assertSpanCompletedWithin(span, maxMs): void`
Asserts that a span completed within a time limit.

**Parameters:**
- `span`: Span snapshot object
- `maxMs`: Maximum duration in milliseconds

**Example:**
```typescript
assertSpanCompletedWithin(span, 100);
```

---

### Performance Testing

#### `createPerformanceMonitor(): PerformanceMonitor`
Creates a performance monitor for testing.

**Returns:** Performance monitor with:
- `start(name, metadata)`: Start measuring an operation
- `measure(name, fn, metadata)`: Measure a function's execution time
- `getSnapshots(name)`: Get snapshots for named operation
- `getStatistics(name)`: Get statistics (min, max, avg, percentiles)
- `clear()`: Clear all snapshots

**Example:**
```typescript
const monitor = createPerformanceMonitor();
const { result, duration } = await monitor.measure("fetch_stations", async () => {
  return await fetchStations();
}, { count: 10 });

const stats = monitor.getStatistics("fetch_stations");
expect(stats.avg).toBeLessThan(100);
```

---

#### `assertCompletesWithin(monitor, name, fn, maxMs): Promise<T>`
Asserts that an operation completes within a time limit.

**Parameters:**
- `monitor`: Performance monitor instance
- `name`: Operation name
- `fn`: Function to measure
- `maxMs`: Maximum time in milliseconds

**Returns:** Function result

**Example:**
```typescript
await assertCompletesWithin(monitor, "fetch_stations", async () => {
  return await fetchStations();
}, 100);
```

---

#### `assertMeetsSLO(monitor, name, slo): void`
Asserts that performance meets SLO requirements.

**Parameters:**
- `monitor`: Performance monitor instance
- `name`: Operation name
- `slo`: SLO object with optional `maxMs`, `p95Ms`, `p99Ms`

**Example:**
```typescript
assertMeetsSLO(monitor, "fetch_stations", {
  maxMs: 200,
  p95Ms: 150,
  p99Ms: 180
});
```

---

### Health Check Testing

#### `createMockHealthChecker(): MockHealthChecker`
Creates a mock health checker.

**Returns:** Health checker with:
- `register(name, checkFn, details)`: Register a health check
- `getStatus()`: Get overall system status
- `getChecks()`: Get all check results
- `clear()`: Clear all check results

**Status values:** `"healthy"`, `"degraded"`, `"unhealthy"`

**Example:**
```typescript
const healthChecker = createMockHealthChecker();
const check = healthChecker.register("database", async () => {
  return await pingDatabase();
});
const result = await check.run();

expect(healthChecker.getStatus()).toBe("healthy");
```

---

#### `assertHealthCheckPasses(healthChecker, name): Promise<void>`
Asserts that a health check passes.

**Parameters:**
- `healthChecker`: Mock health checker instance
- `name`: Health check name

**Example:**
```typescript
await assertHealthCheckPasses(healthChecker, "database");
```

---

#### `assertSystemHealthy(healthChecker): void`
Asserts that the overall system is healthy.

**Parameters:**
- `healthChecker`: Mock health checker instance

**Example:**
```typescript
assertSystemHealthy(healthChecker);
```

---

### Integration Helpers

#### `createMockObservability(): MockObservability`
Creates a complete observability mock suite.

**Returns:** Object containing:
- `logger`: Mock logger
- `metrics`: Mock metrics registry
- `tracer`: Mock tracer
- `performance`: Performance monitor
- `health`: Health checker

**Example:**
```typescript
const obs = createMockObservability();
obs.logger.info("Starting test");
obs.metrics.counter("test_counter").inc();
```

---

#### `setupObservabilityMocks(): MockObservabilityWithReset`
Sets up test environment with observability mocks.

**Returns:** Observability mocks plus:
- `reset()`: Reset all mocks to initial state
- `assertWorking()`: Assert all observability systems work

**Example:**
```typescript
const mocks = setupObservabilityMocks();
mocks.logger.info("Test");
mocks.reset(); // Clear all logs
mocks.assertWorking(); // Verify everything still works
```

---

## Middleware Helpers (`testing/middleware/`)

Middleware testing utilities for exercising the server's middleware without starting a server. Two styles are covered, because two contracts exist in the wild:

- **`middleware-helpers.ts`** — middleware modelled the way Hono writes it: a plain function that receives a real `Request` and either returns a `Response` (short-circuit) or calls `next()` to continue the chain.
- **`mock-chain.ts`** — middleware modelled the handler way: an Express-style `(request, response, next)` signature over mock objects whose `status`/`json`/`send` writes are recorded, with route `params` and a parsed `query` bag on the request and a simulator that reports the order the chain ran in.

`execution-context.ts` builds the execution context either style of middleware may read — the user behind a request, the auth credentials it presented, and the audit event it produces.

Unlike `createMockRequest` in `test-helpers.ts`, which is a plain object by design, these helpers operate on real `Request`/`Response` instances (`middleware-helpers.ts`) or on spies (`mock-chain.ts`).

### Directory Layout

```
packages/shared/src/testing/middleware/
├── index.ts                     → Barrel: re-exports every module below
├── middleware-helpers.ts        → Request builder, chain runner, header assertions,
│                                  test configs, setup/teardown fixture
├── mock-chain.ts                → Express-style request/response mocks, chain simulator,
│                                  chain-behaviour assertions
├── execution-context.ts         → User, auth and audit context builders
├── middleware-helpers.test.ts   → Unit tests, one describe block per export
├── mock-chain.test.ts           → Unit tests for the mocks, simulator and assertions
├── execution-context.test.ts    → Unit tests for the context builders
└── smoke.test.ts                → Barrel smoke test
```

`index.ts` contains no logic — it is a pure re-export, so a new helper only needs to be written and JSDoc-documented in its own module to be reachable from the barrel.

### Importing

```typescript
// From any package — the documented public entry point
import { executeMiddleware } from "@mta-my-way/shared/testing/middleware";

// Inside the middleware directory itself — sibling-relative (as middleware-helpers.test.ts does)
import { executeMiddleware } from "./middleware-helpers";
```

The module is also re-exported by the root testing barrel (`src/testing/index.ts`), but that barrel has no entry in the package `exports` map — only the per-module subpaths are declared — so a runtime import of `@mta-my-way/shared/testing` fails with `ERR_PACKAGE_PATH_NOT_EXPORTED`. Import a declared subpath. Prefer `testing/middleware` in tests that are specifically about middleware: it states what the test is exercising and keeps the middleware helpers greppable.

The subpath is declared in [`packages/shared/package.json`](../../package.json) as `"./testing/middleware"`.

### Writing a Middleware Test

Which file a new middleware test should import from:

| Test kind | File | Import from |
|-----------|------|-------------|
| Unit test for a helper in `middleware-helpers.ts` | `middleware/middleware-helpers.test.ts` | `./middleware-helpers` (relative) |
| Unit test for a helper in `mock-chain.ts` | `middleware/mock-chain.test.ts` | `@mta-my-way/shared/testing/middleware` (barrel) |
| Unit test for a helper in `execution-context.ts` | `middleware/execution-context.test.ts` | `@mta-my-way/shared/testing/middleware` (barrel) |
| New middleware's behaviour | `packages/server/src/middleware/<name>.test.ts` | `@mta-my-way/shared/testing/middleware` (barrel) |
| New helper added to the module | `middleware/smoke.test.ts` | `@mta-my-way/shared/testing/middleware` (barrel) |

`middleware-helpers.test.ts` holds one `describe` block per export, in the order the exports appear in `middleware-helpers.ts`, plus a final `describe` for fixture pairing; add new cases to the matching block rather than starting a parallel file. `mock-chain.test.ts` and `execution-context.test.ts` follow the same one-`describe`-per-export shape.

---

### Request Builders

#### `createMiddlewareRequest(options?: MiddlewareRequestOptions): Request`
Builds a real `Request` for middleware input.

**Parameters:**
- `options` (optional): Request parts to set — `method` (default `"GET"`), `url` (default `"http://localhost:3001/api/test"`), `headers` (case-insensitive names), `body`

Non-string bodies are JSON-serialized and sent with an `application/json` content type unless one is already provided. Supplying a body with `GET` or `HEAD` throws.

**Returns:** Standard `Request` instance

**Example:**
```typescript
const request = createMiddlewareRequest({
  method: "POST",
  url: "http://localhost:3001/api/favorites",
  headers: { authorization: "Bearer token123" },
  body: { stationId: "725" }
});
```

---

### Middleware Execution

#### `executeMiddleware(middleware: MiddlewareLike | MiddlewareLike[], request: Request, handler?: TerminalHandler): Promise<Response>`
Runs middleware around a terminal handler and returns the resulting response.

**Parameters:**
- `middleware`: A single middleware or a chain of them
- `request`: The request entering the chain
- `handler` (optional): Terminal handler run when every middleware calls `next()` (defaults to an empty `200` response)

Middleware compose like Hono's registration order: in `[a, b]`, `a` runs first, then `b`, then the handler. Each middleware receives its own clone of `request`, so a middleware that reads the body does not consume it for downstream layers.

**Returns:** The response produced by the chain

**Example:**
```typescript
const limited: MiddlewareLike = (_request, next) =>
  isOverLimit() ? new Response("Too Many Requests", { status: 429 }) : next();

const response = await executeMiddleware(limited, createMiddlewareRequest());
expect(response.status).toBe(429);
```

---

### Response Assertions

#### `assertHeader(response: Response, name: string, expected?: string): void`
Asserts that a response carries a header, and optionally that its value matches.

**Parameters:**
- `response`: Response to inspect
- `name`: Header name (case-insensitive)
- `expected` (optional): Exact value to require — omit to only require presence

**Throws:** When the header is absent or does not equal `expected`

**Example:**
```typescript
assertHeader(response, "X-Frame-Options", "DENY");
assertHeader(response, "Content-Type"); // presence only
```

---

#### `assertNoHeader(response: Response, name: string): void`
Asserts that a response omits a header.

**Parameters:**
- `response`: Response to inspect
- `name`: Header name (case-insensitive)

**Throws:** When the header is present

**Example:**
```typescript
assertNoHeader(response, "Set-Cookie");
```

---

#### `assertSecurityHeaders(response: Response, required?: readonly string[]): void`
Asserts that a response carries the expected security headers.

**Parameters:**
- `response`: Response to inspect
- `required` (optional): Header names to require (defaults to `SECURITY_HEADER_NAMES`)

**Throws:** Listing the headers that are missing

**Example:**
```typescript
assertSecurityHeaders(response);
assertSecurityHeaders(response, ["X-Frame-Options", "Content-Security-Policy"]);
```

---

#### `SECURITY_HEADER_NAMES: readonly string[]`
The security header names set by the server's `securityHeaders` middleware.

`Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`, `Cross-Origin-Embedder-Policy`, `X-Permitted-Cross-Domain-Policies`

Only the names are listed here — values (CSP directives, HSTS max-age, …) are policy owned by the middleware and should be asserted explicitly where they matter.

**Example:**
```typescript
assertSecurityHeaders(response, SECURITY_HEADER_NAMES);
```

---

### Test Configuration (Presets)

#### `MIDDLEWARE_TEST_PRESETS: Readonly<{ default: MiddlewareTestConfig; securityHeaders: MiddlewareTestConfig }>`
Named middleware test configurations shipped with these helpers.

**Presets:**
- `default`: the standard request `createMiddlewareRequest` builds, and no security-header requirement — for tests that exercise chain behaviour rather than the security-header contract
- `securityHeaders`: the baseline request plus every name in `SECURITY_HEADER_NAMES`

A config is a `MiddlewareRequestOptions` bag plus the `securityHeaders` a response produced under it must carry, so one object drives both halves of a middleware test. Configs are options only — no fixture, no mocks, no teardown — so they are safe to define at module scope and share across suites, and they are frozen so a test cannot poison a preset.

**Example:**
```typescript
const config = createMiddlewareTestConfig(
  { method: "POST", body: { stationId: "725" } },
  MIDDLEWARE_TEST_PRESETS.securityHeaders
);
const response = await executeMiddleware(chain, createMiddlewareRequest(config));
assertSecurityHeaders(response, config.securityHeaders);
```

---

#### `createMiddlewareTestConfig(overrides?: MiddlewareTestConfigOverrides, preset?: MiddlewareTestPresetName | MiddlewareTestConfig): MiddlewareTestConfig`
Builds a middleware test configuration from a preset plus overrides.

**Parameters:**
- `overrides`: Fields to set on top of the preset (`name` included)
- `preset`: Preset to derive from, by name (`"default"` | `"securityHeaders"`) or as a config (defaults to `"default"`)

Merging is a flat, shallow replace, so a preset value is either kept or replaced whole — an overriding `headers` object does not merge with the preset's.

**Returns:** A frozen config combining the preset with the overrides; the base preset is never modified

**Throws:** When `preset` is a string the presets do not hold

**Example:**
```typescript
const config = createMiddlewareTestConfig({ url: "http://localhost:3001/api/favorites" });
const response = await executeMiddleware(chain, createMiddlewareRequest(config));

const narrowed = createMiddlewareTestConfig({ securityHeaders: ["X-Frame-Options"] }, "securityHeaders");
assertSecurityHeaders(response, narrowed.securityHeaders);
```

---

### Test Setup / Teardown

#### `setupMiddlewareTest(options?: MiddlewareTestOptions): MiddlewareTestFixture`
Builds a middleware test fixture and installs its mocks. Pairs with `teardownMiddlewareTest`: call this in `beforeEach` and the teardown in `afterEach`.

**Options:**
- `request`: Request parts for the fixture's standard request (forwarded to `createMiddlewareRequest`)
- `middleware`: Chain the fixture runs, in registration order (defaults to `[]`)
- `handler`: Terminal handler the chain ends at (defaults to an empty `200` response)
- `fakeTimers`: Install vitest fake timers, reverted by teardown (defaults to `false`)
- `mockEnvironment`: Also install the testing-root `setupTestEnvironment` mocks (defaults to `true`)

**Returns:** Fixture with:
- `request`: The standard request entering the chain
- `middleware`: The fixture's chain, in registration order
- `handler`: The terminal handler the chain ends at
- `createRequest(overrides?)`: Variant of the fixture's request — overrides merge over the options the fixture was created with, so `{ method: "POST" }` keeps the fixture's URL and headers
- `run(overrides?)`: Runs the fixture's chain to its terminal handler; per-call overrides replace a part for that run only and do not change the fixture

Setup that throws mid-way tears itself down before rethrowing.

**Example:**
```typescript
let fixture: MiddlewareTestFixture;

beforeEach(() => {
  fixture = setupMiddlewareTest({
    request: { url: "http://localhost:3001/api/favorites" },
    middleware: [requireAuth]
  });
});

afterEach(() => {
  teardownMiddlewareTest(fixture);
});

it("lets an authenticated request through", async () => {
  const response = await fixture.run({
    request: fixture.createRequest({ headers: { authorization: "Bearer token123" } })
  });
  expect(response.status).toBe(200);
});
```

---

#### `teardownMiddlewareTest(fixture?: MiddlewareTestFixture | null): void`
Resets the state `setupMiddlewareTest` created.

**Parameters:**
- `fixture` (optional): Fixture returned by `setupMiddlewareTest`, if setup completed

Restores real timers when setup installed them, then applies the same reset as the testing-root `cleanupTestEnvironment` — restoring every spy and unstubbing every global, including ones the test body added on top of the fixture. Running a torn-down fixture's `run()` throws instead of executing. Safe to call with `null`/`undefined` or twice, so an `afterEach` needs no guard around a `beforeEach` that failed partway.

Timers a test body started on its own are only caught by `resetMiddlewareTestState`, which looks at vitest's actual state rather than at what this fixture remembers installing.

**Example:**
```typescript
afterEach(() => {
  teardownMiddlewareTest(fixture);
});
```

---

#### `cleanupMiddlewareTest(fixture?: MiddlewareTestFixture | null): void`
**Deprecated:** former name of `teardownMiddlewareTest`, kept as an alias so suites written against it keep working. New code should pair `setupMiddlewareTest` with `teardownMiddlewareTest`.

---

#### `resetMiddlewareTestState(): MiddlewareTestStateReset`
Resets the global test state between tests, without needing a fixture.

Restores real timers whenever vitest reports them active — covering timers a test body started directly, which `teardownMiddlewareTest` cannot see — then applies the same reset as the testing-root `cleanupTestEnvironment`: restoring every spy and unstubbing every global.

Fixtures are deliberately left alone: a suite-level fixture stays usable across the reset, and tearing one down is `teardownMiddlewareTest`'s job. Safe to call repeatedly and from an `afterEach` that runs after a teardown already did part of this.

**Returns:** `MiddlewareTestStateReset` — `{ restoredFakeTimers: boolean }`, where `true` means fake timers were active and were restored, i.e. the previous test left them running.

**Example:**
```typescript
afterEach(() => {
  const { restoredFakeTimers } = resetMiddlewareTestState();
  if (restoredFakeTimers) {
    console.warn("previous test leaked fake timers");
  }
});
```

---

### Mock Request, Response and Chain Simulation (`mock-chain.ts`)

The handler-shaped counterpart of `executeMiddleware`. Where `middleware-helpers.ts` passes real `Request`/`Response` instances, this module passes mock objects: the request carries route `params` and a parsed `query` bag that a real `Request` has no place for, and the response records every write so a test can assert on the calls as well as the final state.

The names are deliberately not `createMockRequest`/`createMockResponse` — those exist in `test-helpers.ts` with different shapes, and the root testing barrel `export *`s every module, so a collision would break the barrel.

#### `createMockHttpRequest(options?: MockHttpRequestOptions): MockHttpRequest`
Builds a mock request carrying headers, body, query and route params.

**Parameters:**
- `options` (optional): `method` (default `"GET"`, upper-cased), `url` (default `"http://localhost:3001/api/test"`), `headers`, `query`, `params`, `body`, `cookies`, `ip`, `context`

A query string on `url` is parsed into `query`; an explicit `query` entry wins on conflict, so a test can point at a realistic URL and still pin one parameter. `params` is explicit-only — route matching is the router's job, and the mock simulates its output. The body is served as-is through `request.body` and parsed on demand through `request.json()`, so an object body and a raw JSON string both work. Supplying a body with `GET` or `HEAD` throws.

**Returns:** `MockHttpRequest`, with `header(name)`/`get(name)` (case-insensitive), `json()`, `text()`, and `path`

#### `createMockHttpResponse(): MockHttpResponse`
Builds a mock response whose writes are vitest spies.

`status`, `json`, `send`, `set`, `setHeader` and `end` all record into `response.calls` and update the inspected state, and each returns the response so calls chain. `json`/`send` also close the response, so a chain stops after them whether or not the middleware called `next()`.

**Returns:** `MockHttpResponse` at status `200`, unwritten. Inspect `statusCode`, `headers`, `body`, `jsonBody`, `sentBody`, `ended` and `calls`; assert on any method directly (`expect(response.json).toHaveBeenCalledWith(...)`).

#### `attachContext(request, context): MockHttpRequest`
Stamps an execution context onto a mock request, in place, returning the same object. Reads as a statement: build the request, then attach the context.

#### `runMiddlewareChain(options: MiddlewareChainOptions): Promise<MiddlewareChainResult>`
Executes a `(request, response, next)` chain and reports what ran.

**Parameters:**
- `options.middleware`: the chain, in registration order — each layer is a bare function (named from `fn.name`, falling back to `middleware[n]`) or `{ name, middleware }`
- `options.request` (optional): defaults to `createMockHttpRequest()`
- `options.handler` (optional): terminal handler, defaults to writing an empty JSON `200`
- `options.errorHandler` (optional): receives errors passed to `next()`; without one the error lands on the result instead of throwing

**Returns:** `MiddlewareChainResult` — `request`, `response`, `order` (layer names in order, the terminal handler recorded as `"handler"`), `invocations` (whether each layer called `next()`), `reachedHandler`, `shortCircuited`, and `error` when one went unhandled.

A layer that writes the response stops the chain even if it also calls `next()`. `next(error)` skips the remaining layers to the error handler. A layer calling `next()` twice throws — a chain doing that calls its downstream layers twice, which should fail loudly rather than build a response twice.

#### Assertions

| Helper | Asserts |
|--------|---------|
| `assertChainOrder(result, expected)` | The layers ran in `expected` order |
| `assertChainReachedHandler(result)` | The chain reached its terminal handler |
| `assertChainShortCircuited(result, expectedStatus?)` | The chain stopped before the handler, optionally with a status |
| `assertResponseStatus(response, expected)` | The response carries a status |
| `assertResponseJson(response, expected)` | The response wrote a payload (`toEqual`, so failures diff) |

**Example:**
```typescript
const result = await runMiddlewareChain({
  middleware: [
    { name: "authenticate", middleware: authenticate },
    { name: "requireAdmin", middleware: requireAdmin },
  ],
  request: createMockHttpRequest({
    method: "POST",
    url: "http://localhost:3001/api/admin/purge-cache",
    headers: { authorization: "Bearer token" },
    params: { cache: "all" },
  }),
  handler: (_request, response) => response.status(201).json({ purged: true }),
});

assertChainOrder(result, ["authenticate", "requireAdmin", "handler"]);
assertResponseStatus(result.response, 201);
assertResponseJson(result.response, { purged: true });
```

---

### Execution Context Builders (`execution-context.ts`)

The user, auth and audit context a middleware may read. Every builder returns a complete object with deterministic defaults — fixed IDs and a fixed epoch (`MOCK_CONTEXT_TIMESTAMP`), never `Date.now()` — so a test can read any field without setting it first and snapshots stay stable.

Shapes mirror what `packages/server/src/middleware/` puts on a request: `AuthContext` from `authentication.ts` and `AuditEvent` from `audit-log.ts`. The small, stable unions (`role`, `scope`, `authMethod`, severity, category) are typed as literals so a typo fails typecheck; the permission list is `string[]` because the server's `Permission` union lives across the package boundary and would drift.

| Helper | Builds | Default |
|--------|--------|---------|
| `createMockUser(overrides?)` | `MockUser` | An active regular user |
| `createMockAuthContext(overrides?)` | `MockAuthContext` | A session-authenticated `read` key |
| `createMockAuditEvent(overrides?)` | `MockAuditEvent` | A successful `info` authentication event |
| `createMockExecutionContext(options?)` | `MockExecutionContext` | All three, wired together |

Overrides replace whole fields — arrays included, and `metadata` as a unit.

`createMockExecutionContext` derives outward from its user: the auth context inherits the user's `role`/`roles`, and the audit event is attributed to the user's ID and role. Passing an explicit `auth` or `audit` replaces that part whole — nothing is re-derived into an object the test supplied.

**Example:**
```typescript
const context = createMockExecutionContext({
  user: { role: "admin", roles: ["admin"] },
  audit: { action: "admin:purge_cache", category: "admin" },
});

const request = createMockHttpRequest({ method: "POST", context });
expect(request.context.audit.performedBy).toBe(context.user.id);
```

---

### Exported Types

#### `middleware-helpers.ts`

| Type | Kind | Purpose |
|------|------|---------|
| `MiddlewareRequestOptions` | interface | Request parts accepted by `createMiddlewareRequest` |
| `MiddlewareLike` | type | A middleware: `(request, next) => Response \| Promise<Response>` |
| `TerminalHandler` | type | Handler run when every middleware calls `next()` |
| `MiddlewareTestConfig` | interface | A preset: request options plus required `securityHeaders` |
| `MiddlewareTestPresetName` | type | `"default" \| "securityHeaders"` |
| `MiddlewareTestConfigOverrides` | type | `Partial<MiddlewareTestConfig>` — per-config replacements |
| `MiddlewareTestOptions` | interface | Options accepted by `setupMiddlewareTest` |
| `MiddlewareTestRunOverrides` | interface | Per-call replacements for `fixture.run()` |
| `MiddlewareTestFixture` | interface | Fixture returned by `setupMiddlewareTest` |

#### `mock-chain.ts`

| Type | Kind | Purpose |
|------|------|---------|
| `MockHttpRequest` | interface | Mock request: headers, body, query, params, cookies, IP, context |
| `MockHttpRequestOptions` | interface | Options accepted by `createMockHttpRequest` |
| `MockHttpResponse` | interface | Mock response whose writes are vitest spies |
| `MockResponseCall` | interface | One recorded write, from `response.calls` |
| `MockMiddleware` | type | A middleware: `(request, response, next) => void \| Promise<void>` |
| `NamedMockMiddleware` | interface | A chain entry with an explicit name |
| `MockChainEntry` | type | Either a bare middleware or a named one |
| `MockTerminalHandler` | type | Writes the response when the whole chain called `next()` |
| `MockErrorHandler` | type | Receives an error passed to `next()` |
| `NextFunction` | type | `(error?) => Promise<void>` |
| `MiddlewareInvocation` | interface | One layer's record of its own run |
| `MiddlewareChainResult` | interface | What `runMiddlewareChain` reports |
| `MiddlewareChainOptions` | interface | Options accepted by `runMiddlewareChain` |

#### `execution-context.ts`

| Type | Kind | Purpose |
|------|------|---------|
| `MockUser` / `MockUserOptions` | interface | The user a request acts for, and that builder's options |
| `MockAuthContext` / `MockAuthContextOptions` | interface | Credentials a request presented, mirroring the server's `AuthContext` |
| `MockAuditEvent` / `MockAuditEventOptions` | interface | Audit event a request produces, mirroring the server's `AuditEvent` |
| `MockExecutionContext` / `MockExecutionContextOptions` | interface | All three, built together |
| `MockUserRole`, `MockApiKeyScope`, `MockAuthMethod` | type | Closed unions mirroring the server's auth literals |
| `MockAuditEventCategory`, `MockAuditEventSeverity` | type | Closed unions mirroring the server's audit literals |

---

## Smoke Tests (`smoke.test.ts`)

The `smoke.test.ts` file validates that the test infrastructure itself is working correctly.

### Test Coverage

- ✅ Mock data generators (stations, arrivals, fixtures)
- ✅ Assertion helpers (assertHasProperties, assertIsRecent)
- ✅ Mock helpers (logger, database)
- ✅ Execution time measurement
- ✅ HTTP request mocking
- ✅ Test environment cleanup
- ✅ Fixture data relationships

### Running the Smoke Test

```bash
npm test smoke.test.ts
```

If the smoke test passes, the test infrastructure is functioning correctly.

The middleware module has its own counterpart at `testing/middleware/smoke.test.ts` (`npm test middleware/smoke.test.ts`), which proves the `testing/middleware` barrel resolves and its helpers cooperate; unit-level coverage for the module lives in `middleware-helpers.test.ts`.

---

## Usage Examples

### Example 1: Testing an API Endpoint

```typescript
import { describe, it, expect } from "vitest";
import { createMockStation, createMockRequest, assertApiResponse } from "@mta-my-way/shared/testing";

describe("GET /api/stations/:id", () => {
  it("returns station data", async () => {
    const mockStation = createMockStation({ id: "725" });
    const request = createMockRequest({
      url: "http://localhost:3001/api/stations/725"
    });

    const response = await app.fetch(request);

    assertApiResponse(response, 200, {
      id: "725",
      name: "Times Square-42 St"
    });
  });
});
```

---

### Example 2: Testing Security Middleware

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import {
  createMockSecurityMiddleware,
  createAuthenticatedContext,
  hasPermission
} from "@mta-my-way/shared/testing";

describe("Security Middleware", () => {
  let middleware;

  beforeEach(() => {
    middleware = createMockSecurityMiddleware();
  });

  it("allows authenticated user with correct permission", () => {
    middleware.authenticate("user_123");
    const authorized = middleware.authorize("read:arrivals");
    expect(authorized).toBe(true);
  });

  it("checks role permissions correctly", () => {
    expect(hasPermission("user", "read:arrivals")).toBe(true);
    expect(hasPermission("readonly", "write:favorites")).toBe(false);
  });
});
```

---

### Example 3: Testing with Observability

```typescript
import { describe, it, expect } from "vitest";
import {
  setupObservabilityMocks,
  assertCounterIncremented,
  assertSpanCompletedWithin
} from "@mta-my-way/shared/testing";

describe("API with Observability", () => {
  it("logs metrics and spans", async () => {
    const { logger, metrics, tracer } = setupObservabilityMocks();

    const span = tracer.startSpan("fetch_stations");
    logger.info("Fetching stations");
    metrics.counter("api_requests").inc(1, { endpoint: "/stations" });
    tracer.endSpan({ success: true });

    assertCounterIncremented(metrics, "api_requests", 1);
    assertSpanCompletedWithin(span, 100);
  });
});
```

---

### Example 4: Testing Performance

```typescript
import { describe, it, expect } from "vitest";
import {
  createPerformanceMonitor,
  assertMeetsSLO
} from "@mta-my-way/shared/testing";

describe("Performance Tests", () => {
  it("fetch completes within SLO", async () => {
    const monitor = createPerformanceMonitor();

    await monitor.measure("fetch_stations", async () => {
      return await fetchStations();
    }, { count: 100 });

    assertMeetsSLO(monitor, "fetch_stations", {
      maxMs: 200,
      p95Ms: 150
    });
  });
});
```

---

### Example 5: Testing Input Validation

```typescript
import { describe, it, expect } from "vitest";
import {
  MALICIOUS_INPUTS,
  containsMaliciousPatterns,
  sanitizeInput,
  isSanitized
} from "@mta-my-way/shared/testing";

describe("Input Validation", () => {
  it("detects malicious patterns", () => {
    MALICIOUS_INPUTS.sqlInjection.forEach(input => {
      expect(containsMaliciousPatterns(input)).toBe(true);
    });
  });

  it("sanitizes dangerous input", () => {
    const dangerous = "<script>alert('XSS')</script>";
    const sanitized = sanitizeInput(dangerous);
    expect(isSanitized(sanitized)).toBe(true);
    expect(sanitized).not.toContain("<script>");
  });
});
```

---

### Example 6: Testing Middleware

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  executeMiddleware,
  createMiddlewareRequest,
  assertSecurityHeaders,
  setupMiddlewareTest,
  teardownMiddlewareTest,
  type MiddlewareLike,
  type MiddlewareTestFixture
} from "@mta-my-way/shared/testing/middleware";

describe("securityHeaders middleware", () => {
  let fixture: MiddlewareTestFixture;

  beforeEach(() => {
    fixture = setupMiddlewareTest();
  });

  afterEach(() => {
    teardownMiddlewareTest(fixture);
  });

  it("adds security headers to every response", async () => {
    const chain: MiddlewareLike[] = [securityHeaders()];

    const response = await executeMiddleware(chain, createMiddlewareRequest());

    assertSecurityHeaders(response);
    expect(response.status).toBe(200);
  });

  it("runs through the fixture so each test starts clean", async () => {
    const response = await fixture.run({
      middleware: [securityHeaders()],
      handler: () => new Response("ok")
    });

    assertSecurityHeaders(response);
  });
});
```

---

## Audit Report

**Status:** ✅ All test helpers are functional and well-documented.

A comprehensive audit was conducted on 2026-08-27 and found:
- **78 helper functions** across 3 modules (core, security, observability)
- **100% documentation coverage** - all functions documented
- **0 broken or missing helpers** - everything works as expected
- Smoke tests validate core infrastructure

The audit was extended on 2026-09-04 with a fourth module — [`testing/middleware/`](#middleware-helpers-testingmiddleware), 10 exports (8 functions, 2 constants) plus 9 exported types — which postdates the original audit.

See [TEST_HELPERS_AUDIT.md](./TEST_HELPERS_AUDIT.md) for the complete audit report including:
- Detailed function inventory with status
- Module-by-module breakdown
- Quick reference index
- Optional enhancement suggestions

---

## Known Issues and Missing Helpers

### Status: ✅ All Critical Issues Resolved

The audit confirmed that the index file exists and all exports work correctly:

```typescript
// All exports available via barrel import
import { createMockStation } from "@mta-my-way/shared/testing";
import { createMockApiKey } from "@mta-my-way/shared/testing/security-helpers";
import { createMockLogger } from "@mta-my-way/shared/testing/observability-helpers";
```

---

### Missing Type Exports

**Issue:** Some type definitions are not exported (e.g., `Station`, `Route`, `Arrival`).

**Impact:** TypeScript users may need to re-define types for testing.

**Recommendation:** Export shared types from the main package.

---

### Inconsistent Mock Return Types

**Issue:** Some mocks return incomplete objects (e.g., `createMockRequest` doesn't fully implement the Request interface).

**Impact:** Tests may fail if they expect full Request object behavior.

**Status:** ✅ Working as designed - mocks are intentionally minimal.

---

### Missing Performance Baselines

**Issue:** No documented performance baselines for common operations.

**Impact:** SLO values in tests are arbitrary.

**Recommendation:** Document expected performance for key operations (fetch stations, calculate arrivals, etc.).

---

## Maintenance Guidelines

When adding new test helpers:

1. **Add JSDoc comments** documenting parameters, return types, and usage
2. **Add examples** to this README
3. **Run smoke tests** to verify infrastructure still works
4. **Export from index.ts** (once created)
5. **Add TypeScript types** for all mock objects

When modifying existing helpers:

1. **Maintain backward compatibility** - don't break existing tests
2. **Update this README** with any API changes
3. **Run existing tests** to ensure no regressions
4. **Add new examples** if behavior changes significantly

---

## Related Documentation

- [Vitest Documentation](https://vitest.dev/)
- [Testing Library](https://testing-library.com/)
- [Project README](../../../README.md)
- [Contributing Guidelines](../../../CONTRIBUTING.md)

---

## License

MIT - Part of the MTA My Way project.
