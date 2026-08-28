# Test Helper Functions Inventory

Complete inventory of all test helper functions in `packages/shared/src/testing/`.

## Overview

The testing utilities are organized across 4 main files:

| File | Purpose | Helper Count |
|------|---------|---------------|
| `test-helpers.ts` | Core mock data, assertions, and test setup | 32 functions |
| `observability-helpers.ts` | Logging, metrics, tracing, and performance testing | 23 functions |
| `security-helpers.ts` | Authentication, CSRF, rate limiting, and input validation | 20 functions + 6 constants |
| `index.ts` | Barrel export (no new helpers) | — |

**Total: 75+ helper functions** across 3 modules.

---

## 1. Core Test Helpers (`test-helpers.ts`)

### Mock Data Generators (8 functions)

#### `createMockStation(overrides?)`
**Purpose:** Generate mock station objects for testing subway station data.

**Tests:** Station lookups, line transfers, ADA compliance, borough filtering.

**Default data:**
- ID: "725"
- Name: "Times Square-42 St"
- Lines: ["1", "2", "3", "7", "N", "Q", "R", "W"]
- ADA accessible, Manhattan borough

---

#### `createMockRoute(overrides?)`
**Purpose:** Generate mock route objects for testing subway line configurations.

**Tests:** Route queries, line colors, express vs local, stop lists.

**Default data:**
- ID: "1"
- Short name: "1"
- Long name: "Broadway-7th Ave Local"
- Color: "#EE352E"
- Not express

---

#### `createMockArrival(overrides?)`
**Purpose:** Generate mock arrival predictions for testing real-time subway data.

**Tests:** Arrival time calculations, direction filtering, confidence levels, feed aging.

**Default data:**
- Line: "1"
- Direction: "N" (North)
- 2 minutes away
- High confidence
- Assigned (not rerouted)

---

#### `createMockAlert(overrides?)`
**Purpose:** Generate mock service alert objects for testing delay notifications.

**Tests:** Alert display, severity filtering, affected lines, active periods.

**Default data:**
- ID: "alert_123"
- Severity: "warning"
- Headline: "Delays on 1 train"
- Cause: "SIGNAL_PROBLEM"
- Effect: "DELAY"

---

#### `createMockFavorite(overrides?)`
**Purpose:** Generate mock favorite station objects for testing user preferences.

**Tests:** Favorite stations, custom labels, direction preferences, sort ordering.

**Default data:**
- ID: "fav_123"
- Station: Times Square
- Lines: ["1", "2", "3"]
- Direction: "both"
- Label: "Work"

---

#### `createMockCommute(overrides?)`
**Purpose:** Generate mock commute objects for testing saved routes.

**Tests:** Commute planning, transfer suggestions, preferred lines.

**Default data:**
- ID: "commute_123"
- Name: "Work"
- Origin: Times Square
- Destination: Penn Station
- Preferred lines: ["1", "2", "3"]

---

#### `createMockTripRecord(overrides?)`
**Purpose:** Generate mock trip history records for testing ride tracking.

**Tests:** Trip history, duration calculations, source attribution.

**Default data:**
- ID: "trip_123"
- Line: "1"
- Origin: Times Square
- Destination: Penn Station
- Duration: 30 minutes
- Source: "tracked"

---

#### `createMockPushSubscription(overrides?)`
**Purpose:** Generate mock push notification subscriptions for testing web push.

**Tests:** Push notification delivery, subscription management.

**Default data:**
- Endpoint: "https://fcm.googleapis.com/fcm/send/test_endpoint"
- Has p256dh and auth keys
- No expiration

---

### Test Fixtures (1 function)

#### `createTestFixture()`
**Purpose:** Create a complete set of related test data for integration testing.

**Tests:** End-to-end workflows, data relationships, complex scenarios.

**Returns:**
- `stations`: Times Square, Penn Station
- `routes`: Route 1
- `arrivals`: Northbound and Southbound arrivals
- `alerts`: 1 train delay
- `favorites`: Work favorite
- `commutes`: Work commute

---

### Assertion Helpers (5 functions)

#### `assertHasProperties(obj, requiredProps[])`
**Purpose:** Assert that an object has all required properties.

**Tests:** API response structure, data model validation, type checking.

**Validates:**
- Object is defined and not null
- All properties exist on the object

---

#### `assertIsRecent(timestamp, maxAgeMs?)`
**Purpose:** Assert that a timestamp is recent (within maxAgeMs, default 60s).

**Tests:** Feed freshness, cache validity, time-sensitive data.

**Validates:**
- Timestamp is non-negative (not future)
- Within maxAgeMs of current time

---

#### `assertApiResponse(response, expectedStatus, expectedDataShape?)`
**Purpose:** Assert that an HTTP response has correct status and data structure.

**Tests:** API endpoints, error handling, response validation.

**Validates:**
- Response status matches expected
- Response data matches shape (if provided)

---

#### `assertIsSorted(array, key, order?)`
**Purpose:** Assert that an array is sorted by a key (default: ascending).

**Tests:** Sorting algorithms, list ordering, ranking systems.

**Validates:**
- Each element is ≤ (asc) or ≥ (desc) the next

---

### Mock Helpers (3 functions)

#### `createMockLogger()`
**Purpose:** Create a mock logger with vitest spies for all log methods.

**Tests:** Logging behavior, debug output, error handling.

**Methods:**
- `debug`, `info`, `warn`, `error` (all spies)
- `child` (returns nested mock logger)

---

#### `createMockDatabase()`
**Purpose:** Create a mock SQLite database connection.

**Tests:** Database queries, transactions, migrations.

**Methods:**
- `prepare`: Returns mock statement with `all`, `get`, `run`
- `exec`, `transaction`, `pragma`, `close`
- `_setData`, `_getData`: Test helpers for setting data

---

#### `createMockResponse(data, status?)`
**Purpose:** Create a mock fetch Response object.

**Tests:** HTTP client behavior, error handling, response parsing.

**Returns:**
- `ok`: status >= 200 && < 300
- `status`, `json`, `text`, `headers`

---

#### `createMockFetch(responses[])`
**Purpose:** Create a mock fetch function that returns predefined responses.

**Tests:** API client behavior, network failure handling, response caching.

**Behavior:**
- Matches by URL or substring
- Returns 404 for unmatched URLs

---

### Test Setup Helpers (3 functions)

#### `setupTestEnvironment()`
**Purpose:** Setup common test environment mocks.

**Tests:** Reduces console noise, mocks performance API.

**Mocks:**
- `console.debug`, `console.log` (no-op)
- `performance.now`, `performance.mark`, `performance.measure`
- `requestIdleCallback`, `cancelIdleCallback` (if missing)

---

#### `cleanupTestEnvironment()`
**Purpose:** Restore all mocks after tests complete.

**Tests:** Test isolation, cleanup verification.

**Actions:**
- Restores all vi.spyOn mocks
- Unstubs all globals

---

#### `createTestContext()`
**Purpose:** Create a complete test context with common mocks.

**Tests:** Integration tests, complex scenarios.

**Returns:**
- `mockLogger`
- `mockDb`
- `mockFetch`
- `fixture`
- `cleanup` function

---

### Time Utilities (2 functions)

#### `mockCurrentTime(timestamp)`
**Purpose:** Mock Date.now() and Date.parse() for consistent time-based tests.

**Tests:** Expiration handling, time-based filtering, feed aging.

**Mocks:**
- `Date.now()` → returns timestamp
- `Date.parse()` → returns timestamp (simplified)

---

#### `createMockDateString(date?)`
**Purpose:** Create an ISO date string for testing.

**Tests:** Date formatting, parsing, storage.

**Returns:** ISO 8601 formatted date string

---

### Performance Testing Utilities (2 functions)

#### `measureExecutionTime(fn)`
**Purpose:** Measure async/sync function execution time.

**Tests:** Performance benchmarks, timeout handling, optimization validation.

**Returns:**
- `result`: Function return value
- `durationMs`: Execution time in milliseconds

---

#### `assertCompletesWithin(fn, maxMs)`
**Purpose:** Assert that a function completes within a time limit.

**Tests:** Timeout enforcement, performance requirements, SLA compliance.

**Behavior:**
- Executes function
- Throws if duration > maxMs
- Returns result

---

### HTTP Testing Utilities (2 functions)

#### `createMockHeaders(overrides?)`
**Purpose:** Create mock HTTP headers for testing.

**Tests:** Header parsing, content negotiation, auth headers.

**Default headers:**
- `content-type: application/json`
- `user-agent: test-agent`

---

#### `createMockRequest(overrides?)`
**Purpose:** Create a mock HTTP request object.

**Tests:** Request handling, body parsing, header extraction.

**Default values:**
- Method: "GET"
- URL: "http://localhost:3001/api/test"
- Has headers, body, json, text methods

---

### Async Testing Utilities (3 functions)

#### `waitFor(condition, timeout?, interval?)`
**Purpose:** Wait for a condition to become true (polling).

**Tests:** Async state changes, DOM updates, race conditions.

**Defaults:**
- timeout: 5000ms
- interval: 50ms

**Throws:** "Condition not met within {timeout}ms"

---

#### `flushPromises()`
**Purpose:** Flush all pending promises (setTimeout-based microtask queue).

**Tests:** Promise resolution order, async cleanup, state updates.

---

#### `waitForAll(operations[])`
**Purpose:** Wait for multiple async operations to complete.

**Tests:** Parallel operations, concurrent requests, batch processing.

**Returns:** Array of results from all operations

---

## 2. Observability Test Helpers (`observability-helpers.ts`)

### Logger Mocking (4 functions)

#### `createMockLogger()`
**Purpose:** Create a mock logger that captures all log entries for inspection.

**Tests:** Logging behavior, log level filtering, structured logging.

**Features:**
- Captures debug, info, warn, error entries
- `clear()`: Reset entries
- `getEntriesAtLevel(level)`: Filter by level
- `getEntriesWithMessage(message)`: Filter by message
- `getLastEntry()`: Get most recent entry

---

#### `assertLoggerCalled(mockLogger, level, message, context?)`
**Purpose:** Assert that a logger was called with specific parameters.

**Tests:** Log output verification, error logging, debug messages.

**Validates:**
- Logger method was called
- Message matches (or any message)
- Context matches if provided

---

#### `assertLoggerNotCalled(mockLogger, level)`
**Purpose:** Assert that a logger was NOT called.

**Tests:** Error suppression, conditional logging, silent failures.

---

### Metrics Testing (5 functions)

#### `createMockMetricsRegistry()`
**Purpose:** Create a mock metrics registry (counters, gauges, histograms).

**Tests:** Metrics recording, metric types, label handling.

**Features:**
- `counter(name, help)`: Create counter with inc, reset
- `gauge(name, help)`: Create gauge with set, inc, dec
- `histogram(name, help, buckets)`: Create histogram with observe, reset
- `getSnapshots()`: Get all metric snapshots
- `getMetricSnapshots(name)`: Get specific metric snapshots
- `getMetricValue(name)`: Get current value (sum for counter/histogram, last for gauge)
- `clear()`: Reset all metrics

---

#### `assertCounterIncremented(mockMetrics, metricName, expectedValue?)`
**Purpose:** Assert that a counter was incremented (optionally to a specific value).

**Tests:** Counter usage, increment behavior, cumulative values.

---

#### `assertGaugeSet(mockMetrics, metricName, expectedValue)`
**Purpose:** Assert that a gauge was set to a specific value.

**Tests:** Gauge behavior, state tracking, current value retrieval.

---

#### `assertHistogramObserved(mockMetrics, metricName, expectedValues?)`
**Purpose:** Assert that a histogram observed values (optionally specific values).

**Tests:** Distribution tracking, percentile calculations, histogram data.

---

### Tracing Testing (5 functions)

#### `createMockTracer()`
**Purpose:** Create a mock distributed tracing system.

**Tests:** Trace propagation, span creation, parent-child relationships.

**Features:**
- `generateTraceId()`, `generateSpanId()`: Random IDs
- `startSpan(name, parentContext?)`: Create span with parent
- `endSpan(attributes?)`: End span, calculate duration
- `activeSpan()`: Get current active span
- `addEvent(name, attributes?)`: Add event to span
- `setAttribute(key, value)`: Set span attribute
- `setStatus(code, message?)`: Set span status
- `withSpan(name, fn)`: Run function within span
- `getCompletedSpans()`: Get all finished spans
- `getSpansForTrace(traceId)`: Get spans by trace ID
- `clearCompleted()`: Reset spans

---

#### `assertSpanCreated(mockTracer, name)`
**Purpose:** Assert that a span was created with a specific name.

**Tests:** Span creation, trace instrumentation, operation naming.

---

#### `assertSpanHasAttributes(span, attributes)`
**Purpose:** Assert that a span has specific attributes.

**Tests:** Attribute propagation, metadata tagging, span context.

---

#### `assertSpanCompletedWithin(span, maxMs)`
**Purpose:** Assert that a span completed within a time limit.

**Tests:** Operation performance, timeout handling, SLA tracking.

---

### Performance Testing (3 functions)

#### `createPerformanceMonitor()`
**Purpose:** Create a performance measurement system.

**Tests:** Execution time tracking, performance regression, SLO compliance.

**Features:**
- `start(name, metadata?)`: Start measurement, returns end function
- `measure(name, fn, metadata?)`: Measure function execution
- `getSnapshots(name)`: Get measurements by name
- `getStatistics(name)`: Get count, min, max, avg, p50, p95, p99
- `clear()`: Reset all measurements

---

#### `assertCompletesWithin(monitor, name, fn, maxMs)`
**Purpose:** Assert that a function completes within a time limit (with monitoring).

**Tests:** Performance requirements, timeout enforcement, optimization validation.

---

#### `assertMeetsSLO(monitor, name, slo)`
**Purpose:** Assert that performance meets SLO requirements.

**Tests:** SLA compliance, performance guarantees, latency targets.

**SLO options:**
- `maxMs`: Maximum allowed duration
- `p95Ms`: 95th percentile limit
- `p99Ms`: 99th percentile limit

---

### Health Check Testing (3 functions)

#### `createMockHealthChecker()`
**Purpose:** Create a mock health check system.

**Tests:** Health status aggregation, check registration, failure detection.

**Features:**
- `register(name, checkFn, details?)`: Register health check
- `getStatus()`: Get overall status (healthy/degraded/unhealthy)
- `getChecks()`: Get all check results
- `clear()`: Reset checks

---

#### `assertHealthCheckPasses(healthChecker, name)`
**Purpose:** Assert that a health check passes.

**Tests:** Health check logic, dependency health, system readiness.

---

#### `assertSystemHealthy(healthChecker)`
**Purpose:** Assert that the overall system is healthy.

**Tests:** Health aggregation, system status, deployment readiness.

---

### Integration Helpers (2 functions)

#### `createMockObservability()`
**Purpose:** Create a complete observability mock suite.

**Tests:** Integration of logging, metrics, tracing, performance, health.

**Returns:**
- `logger`
- `metrics`
- `tracer`
- `performance`
- `health`

---

#### `setupObservabilityMocks()`
**Purpose:** Setup test environment with observability mocks and helpers.

**Tests:** Full observability stack, integration testing, end-to-end scenarios.

**Features:**
- All observability mocks
- `reset()`: Reset all mocks
- `assertWorking()`: Assert all systems are functional

---

## 3. Security Test Helpers (`security-helpers.ts`)

### Mock Authentication (3 functions)

#### `createMockApiKey(overrides?)`
**Purpose:** Generate mock API key objects for testing authentication.

**Tests:** API key validation, scope checking, rate limit tiers.

**Default data:**
- keyId: "key_test_123"
- Scope: "read:arrivals read:alerts"
- Role: "user"
- Rate limit tier: 1
- Active, expires in 1 year

---

#### `createMockAuthToken(overrides?)`
**Purpose:** Generate mock authentication tokens.

**Tests:** Token validation, scope enforcement, expiration handling.

**Default data:**
- Token: "Bearer " + 32-char random
- Scopes: ["read:arrivals", "read:alerts"]
- Expires in 1 hour
- UserId: "user_123"

---

#### `createMockSession(overrides?)`
**Purpose:** Generate mock session objects.

**Tests:** Session management, activity tracking, expiration.

**Default data:**
- 16-char session ID
- UserId: "user_123"
- IP: "127.0.0.1"
- User agent: "test-agent"
- Expires in 1 hour

---

### CSRF Protection (3 functions)

#### `generateRandomToken(length?)`
**Purpose:** Generate a random alphanumeric token for testing.

**Tests:** Token generation, CSRF protection, nonce creation.

**Default length:** 32 characters

---

#### `createMockCsrfToken()`
**Purpose:** Create a mock CSRF token object.

**Tests:** CSRF validation, token expiration, anti-CSRF measures.

**Returns:**
- 32-char token
- Expires in 1 hour

---

#### `createCsrfHeaders(token)`
**Purpose:** Create HTTP headers with CSRF token for testing.

**Tests:** CSRF header validation, request authentication.

**Headers:**
- `x-csrf-token`: token
- `content-type: application/json`

---

### Rate Limiting (2 functions)

#### `createMockRateLimitState(overrides?)`
**Purpose:** Generate mock rate limit state objects.

**Tests:** Rate limit enforcement, quota tracking, window resets.

**Default data:**
- Identifier: "127.0.0.1"
- Remaining: 60
- Limit: 60
- Window: 60 seconds

---

#### `createMockRateLimitBan(overrides?)`
**Purpose:** Generate mock rate limit ban objects.

**Tests:** Ban enforcement, violation tracking, ban expiration.

**Default data:**
- Identifier: "127.0.0.1"
- Banned for 1 hour
- Violation count: 5
- Reason: "Rate limit exceeded"

---

### Input Validation (4 functions + 1 constant)

#### `MALICIOUS_INPUTS` (constant)
**Purpose:** Collection of malicious input patterns for testing security.

**Tests:** Input validation, XSS prevention, SQL injection blocking.

**Categories:**
- `sqlInjection`: 5 patterns (DROP TABLE, OR 1=1, etc.)
- `xss`: 5 patterns (script tags, onerror, javascript: URL)
- `pathTraversal`: 4 patterns (../, /etc/passwd, C:\\Windows)
- `commandInjection`: 5 patterns (; ls, | cat, `id`, $(whoami))
- `ldapInjection`: 3 patterns (*)(uid=*, etc.)
- `nosqlInjection`: 3 patterns ($ne, $gt, $regex)
- `headerInjection`: 3 patterns (CRLF injection)

---

#### `containsMaliciousPatterns(input)`
**Purpose:** Test if input contains known malicious patterns.

**Tests:** Input sanitization, security filtering, pattern detection.

**Detects:**
- SQL injection (quotes, comments, SQL keywords)
- XSS (script tags, javascript:, event handlers)
- Path traversal (../, system paths)
- Command injection (separators, substitution)
- Header injection (CRLF)
- NoSQL injection ($ne, $gt, $regex, $where)

---

#### `sanitizeInput(input)`
**Purpose:** Reference implementation of input sanitization for testing.

**Tests:** Compare against actual sanitization, validate safe output.

**Removes:**
- HTML tags and script content
- SQL special characters
- Path traversal sequences
- Command injection characters
- Header injection (CRLF)
- Excess whitespace

---

### Security Context Mocking (2 functions)

#### `createMockSecurityContext(overrides?)`
**Purpose:** Create a mock security context object.

**Tests:** Security middleware, authentication state, authorization.

**Default state:**
- Not authenticated
- No user ID or API key
- IP: "127.0.0.1"
- No CSRF token

---

#### `createAuthenticatedContext(overrides?)`
**Purpose:** Create an authenticated security context.

**Tests:** Authenticated requests, permission checks, session management.

**Default state:**
- Authenticated
- UserId: "user_123"
- Scopes: ["read:arrivals", "read:alerts", "write:favorites"]
- Has session ID and CSRF token

---

### Security Event Mocking (1 function + 1 constant)

#### `createMockSecurityEvent(overrides?)`
**Purpose:** Generate mock security event objects.

**Tests:** Security event logging, alert generation, audit trails.

**Default data:**
- Type: "auth_failure"
- Severity: "warning"
- IP: "127.0.0.1"
- Attempt count: 3

---

#### `SECURITY_EVENT_TYPES` (constant)
**Purpose:** Security event type categories for testing.

**Categories:**
- `authentication`: login_success, login_failure, logout, session_expired
- `authorization`: access_denied, insufficient_permissions, resource_not_found
- `rateLimit`: rate_limit_exceeded, rate_limit_ban, rate_limit_reset
- `data`: sensitive_data_access, data_export, data_deletion
- `session`: session_created, session_destroyed, session_hijack_attempt
- `csrf`: csrf_token_missing, csrf_token_invalid, csrf_token_expired
- `input`: invalid_input, malicious_input_detected, sanitization_failed

---

### Password Testing Utilities (3 functions + 1 constant)

#### `PASSWORD_STRENGTH` (constant)
**Purpose:** Password strength examples for testing validation.

**Levels:**
- `weak`: "123456" (score: 0)
- `fair`: "password123" (score: 1)
- `good`: "SecurePass456!" (score: 2)
- `strong`: "V3ry$tr0ng!P@ssw0rd#2024" (score: 3)

---

#### `createMockPasswordHash(overrides?)`
**Purpose:** Generate mock password hash objects (bcrypt format).

**Tests:** Password hashing, verification, hash storage.

**Default data:**
- Bcrypt hash: "$2b$10$" + 53 chars
- Salt: "$2b$10$" + 22 chars
- Iterations: 10

---

#### `createMockPasswordResetToken(overrides?)`
**Purpose:** Generate mock password reset tokens.

**Tests:** Password reset flow, token expiration, one-time use.

**Default data:**
- 16-char token ID
- Key ID: "key_test_123"
- Expires in 1 hour
- Unused
- Client IP and user agent tracked

---

### RBAC Testing Utilities (2 functions + 1 constant)

#### `ROLES` (constant)
**Purpose:** Role definitions with permissions for testing RBAC.

**Roles:**
- `admin`: All permissions ("*")
- `user`: read arrivals/alerts/stations, write favorites/commutes/journal
- `readonly`: read arrivals/alerts/stations only
- `service`: read all, write push

---

#### `hasPermission(role, permission)`
**Purpose:** Check if a role has a specific permission.

**Tests:** Permission checks, RBAC enforcement, scope validation.

**Supports:**
- Wildcard permissions ("*")
- Prefix wildcards ("read:*")

---

### Audit Log Testing (1 function + 1 constant)

#### `createMockAuditLogEntry(overrides?)`
**Purpose:** Generate mock audit log entries.

**Tests:** Audit logging, compliance tracking, activity history.

**Default data:**
- Action: "api_key_created"
- ResourceType: "api_key"
- ResourceId: "key_test_123"
- Success: true
- IP and user agent tracked

---

#### `AUDIT_ACTIONS` (constant)
**Purpose:** Audit action categories for testing.

**Categories:**
- `authentication`: login, logout, failed_login, password_changed, password_reset
- `api_keys`: api_key_created, api_key_updated, api_key_deleted, api_key_rotated
- `data`: data_exported, data_deleted, data_updated
- `admin`: user_created, user_updated, user_deleted, role_changed
- `sessions`: session_created, session_destroyed, session_revoked

---

### Mock Security Middleware (1 function)

#### `createMockSecurityMiddleware()`
**Purpose:** Create a mock security middleware with authentication, authorization, CSRF, and rate limiting.

**Tests:** Security middleware integration, request filtering, protection mechanisms.

**Methods:**
- `authenticate(userId)`: Mark request as authenticated
- `authorize(permission)`: Check permission (throws if not authenticated)
- `setCsrfToken(token)`: Set CSRF token
- `checkRateLimit()`: Decrement remaining, return true if not exhausted

**Context includes:**
- Request (IP, headers, method, URL)
- Session (null or {sessionId, userId})
- User (null or {id})
- Security state (auth status, CSRF, rate limit)

---

### Test Assertions (2 functions)

#### `isSanitized(sanitized)`
**Purpose:** Check if input is properly sanitized (reference implementation).

**Tests:** Sanitization effectiveness, safe output validation.

**Checks:**
- No script tags
- No HTML brackets
- No javascript: URLs
- No event handlers (onerror)
- No path traversal (../)
- No SQL injection characters (;)

---

#### `hasSecurityHeaders(headers)`
**Purpose:** Check if headers include required security headers.

**Tests:** Security header configuration, header validation.

**Required headers:**
- `x-content-type-options: nosniff`
- `x-frame-options` (any value)
- `x-xss-protection` (any value)
- `strict-transport-security` with `max-age=`

---

## Usage Patterns

### Importing

```typescript
// Import all helpers
import * as testing from "@mta-my-way/shared/testing";

// Import specific helpers
import { createMockStation, assertHasProperties } from "@mta-my-way/shared/testing";
import { createMockLogger, assertLoggerCalled } from "@mta-my-way/shared/testing/observability-helpers";
import { createMockApiKey, createCsrfHeaders } from "@mta-my-way/shared/testing/security-helpers";
```

### Common Patterns

#### 1. Quick Unit Test
```typescript
import { createMockStation, assertHasProperties } from "@mta-my-way/shared/testing";

test("station has required properties", () => {
  const station = createMockStation();
  assertHasProperties(station, ["id", "name", "lines", "lat", "lon"]);
});
```

#### 2. Integration Test with Observability
```typescript
import { createTestContext } from "@mta-my-way/shared/testing";
import { setupObservabilityMocks } from "@mta-my-way/shared/testing/observability-helpers";

test("endpoint with logging and metrics", async () => {
  const obs = setupObservabilityMocks();
  const ctx = createTestContext();

  // Run test...
  await someEndpoint(ctx.mockLogger, obs.metrics);

  // Assert logging and metrics
  assertLoggerCalled(obs.logger, "info", "Request received");
  assertCounterIncremented(obs.metrics, "http_requests_total");
});
```

#### 3. Security Testing
```typescript
import { createAuthenticatedContext, createCsrfHeaders, MALICIOUS_INPUTS } from "@mta-my-way/shared/testing/security-helpers";

test("authenticated request with CSRF", async () => {
  const authCtx = createAuthenticatedContext();
  const headers = createCsrfHeaders(authCtx.csrfToken);

  // Make request with auth and CSRF...
});

test("rejects malicious input", () => {
  for (const input of MALICIOUS_INPUTS.xss) {
    expect(() => validateInput(input)).toThrow();
  }
});
```

#### 4. Performance Testing
```typescript
import { assertCompletesWithin } from "@mta-my-way/shared/testing";
import { createPerformanceMonitor, assertMeetsSLO } from "@mta-my-way/shared/testing/observability-helpers";

test("endpoint responds within SLA", async () => {
  const monitor = createPerformanceMonitor();

  const result = await assertCompletesWithin(
    monitor,
    "api_request",
    () => fetchArrivals(),
    500 // max 500ms
  );

  assertMeetsSLO(monitor, "api_request", { p95Ms: 400 });
});
```

---

## Summary by Category

| Category | File | Function Count |
|----------|------|----------------|
| Mock Data Generators | test-helpers.ts | 8 |
| Test Fixtures | test-helpers.ts | 1 |
| Assertion Helpers | test-helpers.ts | 5 |
| Mock Helpers | test-helpers.ts | 4 |
| Test Setup | test-helpers.ts | 3 |
| Time Utilities | test-helpers.ts | 2 |
| Performance Testing | test-helpers.ts | 2 |
| HTTP Testing | test-helpers.ts | 2 |
| Async Testing | test-helpers.ts | 3 |
| **Total (core)** | | **30** |
| Logger Mocking | observability-helpers.ts | 4 |
| Metrics Testing | observability-helpers.ts | 5 |
| Tracing Testing | observability-helpers.ts | 5 |
| Performance Testing | observability-helpers.ts | 3 |
| Health Check Testing | observability-helpers.ts | 3 |
| Integration Helpers | observability-helpers.ts | 2 |
| **Total (observability)** | | **22** |
| Mock Authentication | security-helpers.ts | 3 |
| CSRF Protection | security-helpers.ts | 3 |
| Rate Limiting | security-helpers.ts | 2 |
| Input Validation | security-helpers.ts | 4 |
| Security Context Mocking | security-helpers.ts | 2 |
| Security Event Mocking | security-helpers.ts | 2 |
| Password Testing | security-helpers.ts | 4 |
| RBAC Testing | security-helpers.ts | 3 |
| Audit Log Testing | security-helpers.ts | 2 |
| Security Middleware | security-helpers.ts | 1 |
| Test Assertions | security-helpers.ts | 2 |
| **Total (security)** | | **28** |

**Grand Total: 80+ functions and constants** across 3 modules.

---

## Test Coverage Recommendations

The following areas should have corresponding test coverage using these helpers:

- ✅ **All helpers are currently used in the codebase**
- ✅ **Helpers are tested in packages/shared/src/testing/smoke.test.ts**
- ✅ **Import barrel in index.ts exports all helpers correctly**

When adding new features, ensure corresponding test helpers are added to maintain this comprehensive testing utility suite.
