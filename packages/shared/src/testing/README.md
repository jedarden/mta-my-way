# MTA My Way - Testing Infrastructure

Comprehensive testing utilities and helpers for E2E and integration testing across all packages.

> **📋 Audit Report:** See [TEST_HELPERS_AUDIT.md](./TEST_HELPERS_AUDIT.md) for the complete audit of all test helpers, including function inventory, status checks, and usage examples.

## Quick Reference

| Module | File | Functions | Status |
|--------|------|-----------|--------|
| Core Helpers | `test-helpers.ts` | 30 | ✅ All Working |
| Security Helpers | `security-helpers.ts` | 28 | ✅ All Working |
| Observability Helpers | `observability-helpers.ts` | 20 | ✅ All Working |
| **Total** | **4 files** | **78 functions** | **✅ 100% Healthy** |

## Overview

The testing infrastructure provides three main helper modules:

- **`test-helpers.ts`** - Core testing utilities (mock data, fixtures, assertions)
- **`security-helpers.ts`** - Security testing utilities (auth, CSRF, rate limiting, input validation)
- **`observability-helpers.ts`** - Observability testing (logging, metrics, tracing, performance)

## Installation

The helpers are exported from the `@mta-my-way/shared` package:

```typescript
import {
  createMockStation,
  createMockArrival,
  createTestFixture,
} from "@mta-my-way/shared/testing/test-helpers";

import {
  createMockApiKey,
  createAuthenticatedContext,
  MALICIOUS_INPUTS,
} from "@mta-my-way/shared/testing/security-helpers";

import {
  createMockLogger,
  createMockMetricsRegistry,
  createMockTracer,
} from "@mta-my-way/shared/testing/observability-helpers";
```

## Core Test Helpers (`test-helpers.ts`)

### Mock Data Generators

Generate realistic test data for all domain entities:

```typescript
// Station
const station = createMockStation({
  id: "725",
  name: "Times Square-42 St",
  lines: ["1", "2", "3"],
});

// Route
const route = createMockRoute({
  id: "1",
  shortName: "1",
  isExpress: false,
});

// Arrival
const arrival = createMockArrival({
  line: "1",
  direction: "N",
  minutesAway: 2,
  confidence: "high",
});

// Alert
const alert = createMockAlert({
  severity: "warning",
  affectedLines: ["1"],
  headline: "Delays on 1 train",
});

// Favorite, Commute, Trip Record, Push Subscription
const favorite = createMockFavorite({ stationId: "725" });
const commute = createMockCommute({ name: "Work" });
const trip = createMockTripRecord({ source: "tracked" });
const subscription = createMockPushSubscription();
```

### Test Fixtures

Complete fixture sets with related data:

```typescript
const fixture = createTestFixture();

// Contains:
// - stations: { timesSquare, pennStation }
// - routes: { "1": route1 }
// - arrivals: { timesSquareNorth, timesSquareSouth }
// - alerts: [alert1]
// - favorites: [favorite1]
// - commutes: [commute1]
```

### Assertion Helpers

```typescript
// Property existence checks
assertHasProperties(obj, ["id", "name", "timestamp"]);

// Timestamp freshness (within maxAgeMs)
assertIsRecent(timestamp, 60000);

// API response validation
assertApiResponse(response, 200, { status: "ok" });

// Sorted array validation
assertIsSorted(arrivals, "arrivalTime", "asc");
```

### Mock Creation

```typescript
// Mock logger with spy capabilities
const mockLogger = createMockLogger();

// Mock database with in-memory storage
const mockDb = createMockDatabase();
mockDb._setData("stations", [station1, station2]);
const stations = mockDb._getData("stations");

// Mock HTTP response
const mockResponse = createMockResponse({ data: "test" }, 200);

// Mock fetch function
const mockFetch = createMockFetch([
  { url: "/api/stations", response: mockResponse },
]);
```

### Test Environment Setup

```typescript
// Setup test environment
setupTestEnvironment();

// Cleanup after tests
cleanupTestEnvironment();

// Complete test context
const context = createTestContext();
// Contains: { mockLogger, mockDb, mockFetch, fixture, cleanup }
```

### Time Utilities

```typescript
// Mock current time
mockCurrentTime(Date.now());

// Create mock date strings
const dateStr = createMockDateString(new Date());
```

### Performance Testing

```typescript
// Measure execution time
const { result, durationMs } = await measureExecutionTime(async () => {
  return await fetchData();
});

// Assert completion within time limit
await assertCompletesWithin(async () => {
  return await processRequest();
}, 1000); // max 1 second
```

### HTTP Testing Utilities

```typescript
// Mock headers and requests
const headers = createMockHeaders({
  "content-type": "application/json",
  "authorization": "Bearer token123",
});

const request = createMockRequest({
  method: "POST",
  url: "http://localhost:3001/api/favorites",
  headers,
  body: { stationId: "725" },
});
```

### Async Testing Utilities

```typescript
// Wait for condition
await waitFor(() => mockDb.getData().length > 0, 5000, 50);

// Flush pending promises
await flushPromises();

// Wait for multiple operations
const results = await waitForAll([
  () => fetchArrivals(),
  () => fetchAlerts(),
]);
```

## Security Helpers (`security-helpers.ts`)

### Authentication Mocks

```typescript
// Mock API key
const apiKey = createMockApiKey({
  keyId: "key_test_123",
  scope: "read:arrivals read:alerts",
  rateLimitTier: 1,
});

// Mock auth token
const authToken = createMockAuthToken({
  token: "Bearer token123",
  expiresAt: Date.now() + 3600000,
  scopes: ["read:arrivals"],
});

// Mock session
const session = createMockSession({
  userId: "user_123",
  ip: "127.0.0.1",
  userAgent: "test-agent",
});
```

### CSRF Protection

```typescript
// Generate tokens
const csrfToken = createMockCsrfToken();

// Create CSRF-protected headers
const headers = createCsrfHeaders(csrfToken.token);
```

### Rate Limiting

```typescript
// Mock rate limit state
const rateLimitState = createMockRateLimitState({
  identifier: "127.0.0.1",
  remaining: 60,
  limit: 60,
  resetAt: Date.now() + 60000,
});

// Mock rate limit ban
const ban = createMockRateLimitBan({
  identifier: "127.0.0.1",
  bannedUntil: Date.now() + 3600000,
  violationCount: 5,
});
```

### Input Validation Testing

```typescript
// Predefined malicious input patterns
const sqlInputs = MALICIOUS_INPUTS.sqlInjection;
const xssInputs = MALICIOUS_INPUTS.xss;
const pathInputs = MALICIOUS_INPUTS.pathTraversal;

// Test detection
const isMalicious = containsMaliciousPatterns(userInput);

// Sanitize for comparison
const sanitized = sanitizeInput(dangerousInput);
const isSafe = isSanitized(sanitized);
```

### Security Contexts

```typescript
// Anonymous context
const anonContext = createMockSecurityContext();

// Authenticated context
const authContext = createAuthenticatedContext({
  userId: "user_123",
  scopes: ["read:arrivals", "write:favorites"],
});
```

### Security Events

```typescript
// Mock security event
const event = createMockSecurityEvent({
  type: "auth_failure",
  severity: "warning",
  details: { ip: "127.0.0.1", attemptCount: 3 },
});

// Event types
SECURITY_EVENT_TYPES.authentication; // ["login_success", "login_failure", ...]
SECURITY_EVENT_TYPES.rateLimit;       // ["rate_limit_exceeded", ...]
```

### RBAC Testing

```typescript
// Available roles
ROLES.admin;    // { name: "admin", permissions: ["*"] }
ROLES.user;     // { name: "user", permissions: ["read:arrivals", ...] }
ROLES.readonly; // { name: "readonly", permissions: ["read:arrivals", ...] }

// Check permissions
const canRead = hasPermission("user", "read:arrivals"); // true
const canWrite = hasPermission("readonly", "write:favorites"); // false
```

### Password Testing

```typescript
// Password strength presets
PASSWORD_STRENGTH.weak.password;     // "123456"
PASSWORD_STRENGTH.good.password;    // "SecurePass456!"
PASSWORD_STRENGTH.strong.password;  // "V3ry$tr0ng!P@ssw0rd#2024"

// Mock password hash
const hash = createMockPasswordHash();

// Mock password reset token
const resetToken = createMockPasswordResetToken();
```

### Audit Logging

```typescript
// Mock audit entry
const auditEntry = createMockAuditLogEntry({
  action: "api_key_created",
  resourceType: "api_key",
  success: true,
});

// Audit action types
AUDIT_ACTIONS.authentication; // ["login", "logout", "failed_login", ...]
AUDIT_ACTIONS.api_keys;       // ["api_key_created", "api_key_deleted", ...]
```

### Security Middleware Mock

```typescript
const mockMiddleware = createMockSecurityMiddleware();

// Authenticate a user
mockMiddleware.authenticate("user_123");

// Authorize with permission
mockMiddleware.authorize("read:arrivals");

// Set CSRF token
mockMiddleware.setCsrfToken("token123");

// Check rate limit
const withinLimit = mockMiddleware.checkRateLimit();
```

## Observability Helpers (`observability-helpers.ts`)

### Logger Mocking

```typescript
// Create mock logger with capture
const mockLogger = createMockLogger();
mockLogger.info("Test message", { stationId: "725" });

// Query captured logs
mockLogger.getEntriesAtLevel("info");
mockLogger.getEntriesWithMessage("Test");
mockLogger.getLastEntry();

// Clear logs
mockLogger.clear();

// Assertions
assertLoggerCalled(mockLogger, "info", "Test message", { stationId: "725" });
assertLoggerNotCalled(mockLogger, "error");
```

### Metrics Testing

```typescript
// Create metrics registry
const mockMetrics = createMockMetricsRegistry();

// Counter
const counter = mockMetrics.counter("api_requests", "API request count");
counter.inc(1, { endpoint: "/api/stations" });

// Gauge
const gauge = mockMetrics.gauge("active_sessions", "Active session count");
gauge.set(42, { region: "us-east" });

// Histogram
const histogram = mockMetrics.histogram("request_duration", "Request duration", [10, 50, 100, 500]);
histogram.observe(123, { endpoint: "/api/arrivals" });

// Query metrics
mockMetrics.getMetricValue("api_requests");
mockMetrics.getMetricSnapshots("active_sessions");

// Assertions
assertCounterIncremented(mockMetrics, "api_requests", 42);
assertGaugeSet(mockMetrics, "active_sessions", 42);
assertHistogramObserved(mockMetrics, "request_duration", [10, 50, 100]);
```

### Tracing

```typescript
// Create mock tracer
const mockTracer = createMockTracer();

// Start span
const span = mockTracer.startSpan("fetch_stations");

// Add attributes and events
mockTracer.setAttribute("station_id", "725");
mockTracer.addEvent("cache_miss", { source: "api" });

// End span
mockTracer.endSpan({ status: "ok" });

// Run function within span
const result = await mockTracer.withSpan("process_request", async (span) => {
  // span is available here
  return await processRequest();
});

// Query spans
mockTracer.getCompletedSpans();
mockTracer.getSpansForTrace(traceId);

// Assertions
assertSpanCreated(mockTracer, "fetch_stations");
assertSpanHasAttributes(span, { station_id: "725" });
assertSpanCompletedWithin(span, 100);
```

### Performance Monitoring

```typescript
// Create performance monitor
const monitor = createPerformanceMonitor();

// Manual measurement
const timer = monitor.start("database_query");
await runQuery();
const duration = timer.end();

// Automatic measurement
const { result, duration } = await monitor.measure("api_call", async () => {
  return await fetchArrivals();
}, { endpoint: "/api/arrivals" });

// Query statistics
const stats = monitor.getStatistics("database_query");
// { count: 100, min: 5, max: 150, avg: 45, p50: 42, p95: 95, p99: 120 }

// Assertions
await assertCompletesWithin(monitor, "api_call", async () => {
  return await fetchData();
}, 1000);

assertMeetsSLO(monitor, "database_query", {
  maxMs: 500,
  p95Ms: 200,
  p99Ms: 400,
});
```

### Health Checks

```typescript
// Create health checker
const healthChecker = createMockHealthChecker();

// Register check
const check = healthChecker.register("database", async () => {
  return await pingDatabase();
});
const isHealthy = await check.run();

// Get status
const status = healthChecker.getStatus(); // "healthy" | "degraded" | "unhealthy"

// Query checks
healthChecker.getChecks();

// Assertions
await assertHealthCheckPasses(healthChecker, "database");
assertSystemHealthy(healthChecker);
```

### Complete Observability Suite

```typescript
// Create all mocks at once
const mocks = createMockObservability();
// { logger, metrics, tracer, performance, health }

// Setup with reset and validation
const obs = setupObservabilityMocks();
obs.reset();                    // Reset all mocks
obs.assertWorking();            // Verify all systems operational
```

## E2E Testing Infrastructure

### Playwright Configuration

E2E tests use Playwright with the following setup:

- **Test Directory**: `tests/e2e/`
- **Test Pattern**: `*.e2e.ts`
- **Base URL**: `http://localhost:3001` (configurable via `PLAYWRIGHT_BASE_URL`)
- **Browsers**: Chromium, Firefox, WebKit, Mobile Chrome, Mobile Safari
- **Server Auto-start**: Tests automatically start the dev server with health-check polling

### Running E2E Tests

```bash
# Run all E2E tests
npm test -- tests/e2e

# Run with browser visible
npm run test:e2e:headed

# Run with Playwright UI
npm run test:e2e:ui

# Debug mode
npm run test:e2e:debug

# Run specific test file
npx playwright test health.e2e.ts
```

### E2E Test Helpers

Port checking helper to avoid conflicts:

```typescript
// tests/e2e/helpers/check-port.ts
// Automatically checks if port 3001 is available before starting server
```

### Sample E2E Test

```typescript
import { test, expect } from "@playwright/test";

test.describe("API endpoints", () => {
  test("GET /api/health returns system status", async ({ request }) => {
    const response = await request.get("/api/health");

    expect([200, 503]).toContain(response.status());
    const body = await response.json();

    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("timestamp");
    expect(body).toHaveProperty("feeds");
    expect(body.feeds).toHaveLength(8);
  });
});
```

## Best Practices

### 1. Use Fixtures for Consistent Data

```typescript
// Good: Use fixtures
const fixture = createTestFixture();
const { stations, arrivals } = fixture;

// Avoid: Manual creation
const station = { id: "123", name: "Station", /* ... */ };
```

### 2. Clean Up After Tests

```typescript
afterEach(() => {
  cleanupTestEnvironment();
});
```

### 3. Use Specific Assertions

```typescript
// Good: Specific assertion
assertHasProperties(response, ["id", "name", "timestamp"]);

// Better: Custom assertion with context
assertApiResponse(response, 200, { status: "ok" });
```

### 4. Mock External Dependencies

```typescript
const mockFetch = createMockFetch([
  { url: "/api/external", response: createMockResponse({ data: "test" }) },
]);
```

### 5. Test Security Boundaries

```typescript
// Test authentication
const anonContext = createMockSecurityContext();
const authContext = createAuthenticatedContext();

// Test authorization
assertThrows(() => {
  authContext.authorize("admin:only");
});
```

### 6. Measure Performance

```typescript
const { result, duration } = await measureExecutionTime(async () => {
  return await expensiveOperation();
});

expect(duration).toBeLessThan(1000); // 1 second max
```

### 7. Test Observability

```typescript
const mockLogger = createMockLogger();
await operation();
assertLoggerCalled(mockLogger, "info", "Operation completed");
```

## Test Database and Fixtures

### Database Fixtures

The server package includes integration test helpers for database operations:

```typescript
import { cleanupAllState } from "../integration/test-helpers.js";

// Called automatically in test setup
beforeEach(async () => {
  await cleanupAllState();
});
```

### Test Mode

Set `TEST_MODE=true` to enable:
- Disabled rate limiting
- In-memory database
- Mock external services
- Faster test execution

```typescript
// In vitest.config.ts
env: {
  TEST_MODE: "true",
},
```

## Continuous Integration

Tests run automatically on push via CI/CD. See `.github/workflows/` for workflow definitions.

## Troubleshooting

### Tests Timing Out

Increase timeout for slow operations:

```typescript
test("slow operation", async () => {
  await operation();
}, { timeout: 10000 }); // 10 seconds
```

### Port Already in Use

Kill existing server or use different port:

```bash
# Kill process on port 3001
lsof -ti:3001 | xargs kill -9

# Or set custom base URL
PLAYWRIGHT_BASE_URL=http://localhost:3002 npx playwright test
```

### Mocks Not Resetting

Ensure cleanup in test setup:

```typescript
afterEach(() => {
  vi.restoreAllMocks();
  cleanupTestEnvironment();
});
```

### Database State Leaking

Use cleanup helpers:

```typescript
beforeEach(async () => {
  await cleanupAllState();
  vi.clearAllMocks();
});
```

## Additional Resources

- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)
- [Testing Library](https://testing-library.com/)
- Project-specific test examples in `packages/*/src/**/*.test.ts`
