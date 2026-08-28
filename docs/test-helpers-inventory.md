# Test Helpers Inventory

**Package:** `@mta-my-way/shared/testing`  
**Directory:** `packages/shared/src/testing/`  
**Last Updated:** 2026-08-27

This document provides a comprehensive inventory of all test helper functions available in the MTA My Way shared testing package.

---

## Table of Contents

1. [Core Test Helpers](#core-test-helpers-test-helpersts)
2. [Observability Testing Helpers](#observability-testing-helpers-observability-helpersts)
3. [Security Testing Helpers](#security-testing-helpers-security-helpersts)

---

## Core Test Helpers (`test-helpers.ts`)

### Mock Data Generators

| Function | Purpose | What It Tests |
|----------|---------|----------------|
| `createMockStation(overrides?)` | Generates a mock subway station object with properties like ID, name, location, lines, ADA accessibility | Station data handling, location-based features, line validation |
| `createMockRoute(overrides?)` | Generates a mock subway route object with color, stops, express status | Route display, trip planning, line-specific features |
| `createMockArrival(overrides?)` | Generates a mock train arrival object with timing, direction, destination | Real-time arrival display, countdown timers, trip tracking |
| `createMockAlert(overrides?)` | Generates a mock service alert with severity, affected lines, active period | Alert display, service disruption notifications, active period filtering |
| `createMockFavorite(overrides?)` | Generates a mock favorite station with label, sort order, direction | Favorites management, quick access features, user preferences |
| `createMockCommute(overrides?)` | Generates a mock commute with origin, destination, preferred lines | Commute planning, transfer suggestions, route preferences |
| `createMockTripRecord(overrides?)` | Generates a mock historical trip record with timing and duration | Trip history, travel time tracking, journey analytics |
| `createMockPushSubscription(overrides?)` | Generates a mock web push subscription object | Push notification setup, subscription management |
| `createTestFixture()` | Creates a complete test fixture set with related stations, routes, arrivals, alerts, favorites, and commutes | Integration tests, component testing with realistic data |
| `createMockLogger()` | Creates a mock logger with spy functions for debug, info, warn, error | Logging behavior, error handling, debug output |
| `createMockDatabase()` | Creates a mock database connection with prepared statements, transactions | Database operations, data persistence, transaction handling |
| `createMockResponse(data, status?)` | Creates a mock HTTP response with status, JSON methods, headers | API response handling, error responses, status code validation |
| `createMockFetch(responses)` | Creates a mock fetch function that returns predefined responses | HTTP request testing, API integration, network failure scenarios |
| `createMockHeaders(overrides?)` | Creates mock HTTP headers with content-type, user-agent | Header validation, content negotiation, authentication testing |
| `createMockRequest(overrides?)` | Creates a mock HTTP request with method, URL, headers, body | Request handling, middleware testing, endpoint validation |

### Assertion Helpers

| Function | Purpose | What It Tests |
|----------|---------|----------------|
| `assertHasProperties(obj, requiredProps)` | Asserts object has all required properties | Object structure validation, schema compliance |
| `assertIsRecent(timestamp, maxAgeMs?)` | Asserts a timestamp is recent (within maxAgeMs) | Data freshness, timeout handling, real-time updates |
| `assertApiResponse(response, expectedStatus, expectedDataShape)` | Asserts API response has correct status and data shape | API contract testing, response validation |
| `assertIsSorted(array, key, order?)` | Asserts array is sorted by a key in ascending or descending order | Sorting logic, list ordering, display sequence |

### Test Setup Helpers

| Function | Purpose | What It Tests |
|----------|---------|----------------|
| `setupTestEnvironment()` | Sets up common test mocks (console, performance API, requestIdleCallback) | Test environment isolation, browser API mocking |
| `cleanupTestEnvironment()` | Restores all mocked globals and clears spies | Test cleanup, preventing test pollution |
| `createTestContext()` | Creates a complete test context with logger, database, fetch, and fixture | Integration test setup, component testing environment |

### Time Utilities

| Function | Purpose | What It Tests |
|----------|---------|----------------|
| `mockCurrentTime(timestamp)` | Mocks Date.now() and Date.parse() to return consistent timestamps | Time-dependent logic, expiration handling, scheduled events |
| `createMockDateString(date?)` | Creates a mock ISO date string | Date formatting, timestamp generation, date serialization |

### Performance Testing Utilities

| Function | Purpose | What It Tests |
|----------|---------|----------------|
| `measureExecutionTime(fn)` | Measures execution time of a synchronous or async function | Performance benchmarks, optimization validation |
| `assertCompletesWithin(fn, maxMs)` | Asserts a function completes within a time limit | Performance requirements, timeout handling, SLA compliance |

### Async Testing Utilities

| Function | Purpose | What It Tests |
|----------|---------|----------------|
| `waitFor(condition, timeout?, interval?)` | Waits for a condition to become true | Async state changes, polling behavior, race conditions |
| `flushPromises()` | Flushes all pending promises | Promise scheduling, microtask timing, async completion |
| `waitForAll(operations)` | Waits for multiple async operations to complete | Parallel operations, concurrent requests, batch processing |

---

## Observability Testing Helpers (`observability-helpers.ts`)

### Logger Mocking

| Function | Purpose | What It Tests |
|----------|---------|----------------|
| `createMockLogger()` | Creates a mock logger that captures all log entries (debug, info, warn, error) with metadata | Logging behavior, log level filtering, error tracking, context propagation |
| `assertLoggerCalled(mockLogger, level, message, context?)` | Asserts logger was called with specific level, message, and context | Log verification, audit trails, error logging validation |
| `assertLoggerNotCalled(mockLogger, level)` | Asserts logger was NOT called at a specific level | Conditional logging, log suppression, silent operation |

**Mock Logger Methods:**
- `clear()` - Clears all captured log entries
- `getEntriesAtLevel(level)` - Gets all log entries at a specific level
- `getEntriesWithMessage(message)` - Gets all log entries containing a message
- `getLastEntry()` - Gets the most recent log entry

### Metrics Testing

| Function | Purpose | What It Tests |
|----------|---------|----------------|
| `createMockMetricsRegistry()` | Creates a mock metrics registry with counter, gauge, and histogram support | Metrics collection, monitoring integration, data aggregation |
| `assertCounterIncremented(mockMetrics, metricName, expectedValue?)` | Asserts a counter was incremented (optionally to a specific value) | Counter metrics, usage tracking, event counting |
| `assertGaugeSet(mockMetrics, metricName, expectedValue)` | Asserts a gauge was set to a specific value | Gauge metrics, state tracking, current value monitoring |
| `assertHistogramObserved(mockMetrics, metricName, expectedValues?)` | Asserts a histogram observed specific values | Histogram metrics, distribution tracking, percentile calculation |

**Mock Metrics Registry Methods:**
- `counter(name, help)` - Creates or gets a counter with `inc()` and `reset()` methods
- `gauge(name, help)` - Creates or gets a gauge with `set()`, `inc()`, `dec()` methods
- `histogram(name, help, buckets)` - Creates or gets a histogram with `observe()` and `reset()` methods
- `getSnapshots()` - Gets all metric snapshots
- `getMetricSnapshots(name)` - Gets snapshots for a specific metric
- `getMetricValue(name)` - Gets the current value of a metric
- `clear()` - Clears all metrics

### Tracing Testing

| Function | Purpose | What It Tests |
|----------|---------|----------------|
| `createMockTracer()` | Creates a mock distributed tracing system with span management | Distributed tracing, request correlation, performance profiling |
| `assertSpanCreated(mockTracer, name)` | Asserts a span was created with a specific name | Span creation, trace validation, operation tracking |
| `assertSpanHasAttributes(span, attributes)` | Asserts a span has specific attributes with values | Span metadata, trace context, attribute propagation |
| `assertSpanCompletedWithin(span, maxMs)` | Asserts a span completed within a time limit | Operation performance, timeout detection, SLA monitoring |

**Mock Tracer Methods:**
- `generateTraceId()` - Generates a random trace ID
- `generateSpanId()` - Generates a random span ID
- `startSpan(name, parentContext?)` - Starts a new span with optional parent
- `endSpan(attributes?)` - Ends the current active span with optional attributes
- `activeSpan()` - Gets the current active span
- `addEvent(name, attributes?)` - Adds an event to the current span
- `setAttribute(key, value)` - Sets an attribute on the current span
- `setStatus(code, message?)` - Sets the status of the current span
- `withSpan(name, fn)` - Runs a function within a span (async-safe)
- `getCompletedSpans()` - Gets all completed spans
- `clearCompleted()` - Clears completed spans
- `getSpansForTrace(traceId)` - Gets all spans for a specific trace

### Performance Testing

| Function | Purpose | What It Tests |
|----------|---------|----------------|
| `createPerformanceMonitor()` | Creates a performance monitor for measuring operation execution time | Performance monitoring, bottleneck detection, optimization validation |
| `assertCompletesWithin(monitor, name, fn, maxMs)` | Asserts an operation completes within a time limit | Performance requirements, timeout handling, SLA compliance |
| `assertMeetsSLO(monitor, name, slo)` | Asserts performance meets SLO requirements (max, p95, p99) | SLO validation, percentile performance, quality of service |

**Performance Monitor Methods:**
- `start(name, metadata?)` - Starts measuring a named operation, returns `end()` function
- `measure(name, fn, metadata?)` - Measures a function's execution time
- `getSnapshots(name)` - Gets all snapshots for a named operation
- `getStatistics(name)` - Gets statistics (count, min, max, avg, p50, p95, p99)
- `clear()` - Clears all snapshots

### Health Check Testing

| Function | Purpose | What It Tests |
|----------|---------|----------------|
| `createMockHealthChecker()` | Creates a mock health checker for system health validation | Health check logic, dependency validation, system status |
| `assertHealthCheckPasses(healthChecker, name)` | Asserts a health check passes | Component health, dependency health, availability testing |
| `assertSystemHealthy(healthChecker)` | Asserts the overall system is healthy | System health aggregation, status calculation |

**Mock Health Checker Methods:**
- `register(name, checkFn, details?)` - Registers a health check, returns `run()` method
- `getStatus()` - Gets current health status (healthy/degraded/unhealthy)
- `getChecks()` - Gets all check results
- `clear()` - Clears all check results

### Integration Helpers

| Function | Purpose | What It Tests |
|----------|---------|----------------|
| `createMockObservability()` | Creates a complete observability mock suite (logger, metrics, tracer, performance, health) | Full observability stack integration, system-wide monitoring |
| `setupObservabilityMocks()` | Sets up test environment with observability mocks and reset/assert helpers | Observability setup, integration testing, mock lifecycle |

**Observability Mocks Methods:**
- `reset()` - Resets all mocks to initial state
- `assertWorking()` - Asserts all observability systems are working

---

## Security Testing Helpers (`security-helpers.ts`)

### Mock Authentication

| Function | Purpose | What It Tests |
|----------|---------|----------------|
| `createMockApiKey(overrides?)` | Generates a mock API key with scopes, rate limit tier, expiration | API key validation, scope checking, rate limit enforcement |
| `createMockAuthToken(overrides?)` | Generates a mock authentication token with scopes and expiration | Token validation, scope enforcement, expiration handling |
| `createMockSession(overrides?)` | Generates a mock user session with ID, activity timestamp, IP, user agent | Session management, activity tracking, session expiration |

### CSRF Protection

| Function | Purpose | What It Tests |
|----------|---------|----------------|
| `generateRandomToken(length?)` | Generates a random alphanumeric token for testing | Token generation, CSRF protection, random value generation |
| `createMockCsrfToken()` | Creates a mock CSRF token with expiration | CSRF validation, token freshness, expiration handling |
| `createCsrfHeaders(token)` | Creates CSRF headers for testing requests | CSRF header validation, request protection, header formatting |

### Rate Limiting

| Function | Purpose | What It Tests |
|----------|---------|----------------|
| `createMockRateLimitState(overrides?)` | Creates a mock rate limit state with remaining requests and reset time | Rate limiting logic, quota enforcement, reset calculation |
| `createMockRateLimitBan(overrides?)` | Creates a mock rate limit ban with ban expiration and violation count | Ban enforcement, violation tracking, ban expiration |

### Input Validation

| Function | Purpose | What It Tests |
|----------|---------|----------------|
| `MALICIOUS_INPUTS` | Constant containing malicious input patterns for testing validation | SQL injection, XSS, path traversal, command injection, LDAP injection, NoSQL injection, header injection |
| `containsMaliciousPatterns(input)` | Tests if input contains dangerous patterns (returns boolean) | Input validation, threat detection, pattern matching |
| `sanitizeInput(input)` | Sanitizes input by removing dangerous content (for comparison) | Sanitization logic, input cleaning, security filtering |

**Malicious Input Categories:**
- SQL Injection: `'; DROP TABLE users; --`, `1' OR '1'='1`
- XSS: `<script>alert('XSS')</script>`, `<img src=x onerror=alert('XSS')>`
- Path Traversal: `../../../etc/passwd`, `..\\..\\..\\windows\\system32`
- Command Injection: `; ls -la`, `| cat /etc/passwd`
- LDAP Injection: `*)(uid=*`, `*)(&`
- NoSQL Injection: `{"$ne": null}`, `{"$gt": ""}`
- Header Injection: `value\r\nX-Injected: true`

### Security Context Mocking

| Function | Purpose | What It Tests |
|----------|---------|----------------|
| `createMockSecurityContext(overrides?)` | Creates a mock security context with auth status, user, scopes, IP | Authentication state, authorization context, request context |
| `createAuthenticatedContext(overrides?)` | Creates an authenticated security context with user ID, API key, scopes | Authenticated request handling, permission checks, session validation |

### Security Event Mocking

| Function | Purpose | What It Tests |
|----------|---------|----------------|
| `createMockSecurityEvent(overrides?)` | Creates a mock security event with type, severity, timestamp, details | Event logging, security monitoring, audit trail |
| `SECURITY_EVENT_TYPES` | Constant containing security event type categories | Event type validation, categorization, filtering |

**Security Event Types:**
- Authentication: `login_success`, `login_failure`, `logout`, `session_expired`
- Authorization: `access_denied`, `insufficient_permissions`, `resource_not_found`
- Rate Limit: `rate_limit_exceeded`, `rate_limit_ban`, `rate_limit_reset`
- Data: `sensitive_data_access`, `data_export`, `data_deletion`
- Session: `session_created`, `session_destroyed`, `session_hijack_attempt`
- CSRF: `csrf_token_missing`, `csrf_token_invalid`, `csrf_token_expired`
- Input: `invalid_input`, `malicious_input_detected`, `sanitization_failed`

### Password Testing Utilities

| Function | Purpose | What It Tests |
|----------|---------|----------------|
| `PASSWORD_STRENGTH` | Constant containing password strength levels (weak, fair, good, strong) | Password strength validation, user feedback, security requirements |
| `createMockPasswordHash(overrides?)` | Creates a mock password hash with salt and iterations | Password hashing, hash verification, storage format |
| `createMockPasswordResetToken(overrides?)` | Creates a mock password reset token with expiration and metadata | Reset flow, token expiration, client tracking |

### RBAC Testing Utilities

| Function | Purpose | What It Tests |
|----------|---------|----------------|
| `ROLES` | Constant containing role definitions with permissions (admin, user, readonly, service) | Role-based access control, permission checking, authorization logic |
| `hasPermission(role, permission)` | Checks if a role has a specific permission (supports wildcard `*` and prefix matching) | Permission validation, role checking, wildcard matching |

**Available Roles:**
- **Admin**: All permissions (`*`)
- **User**: `read:arrivals`, `read:alerts`, `read:stations`, `write:favorites`, `write:commutes`, `write:journal`
- **Readonly**: `read:arrivals`, `read:alerts`, `read:stations`
- **Service**: `read:*`, `write:push`

### Audit Log Testing

| Function | Purpose | What It Tests |
|----------|---------|----------------|
| `createMockAuditLogEntry(overrides?)` | Creates a mock audit log entry with action, resource, IP, user agent | Audit logging, compliance tracking, user activity |
| `AUDIT_ACTIONS` | Constant containing audit action categories | Action type validation, audit filtering, log categorization |

**Audit Action Types:**
- Authentication: `login`, `logout`, `failed_login`, `password_changed`, `password_reset`
- API Keys: `api_key_created`, `api_key_updated`, `api_key_deleted`, `api_key_rotated`
- Data: `data_exported`, `data_deleted`, `data_updated`
- Admin: `user_created`, `user_updated`, `user_deleted`, `role_changed`
- Sessions: `session_created`, `session_destroyed`, `session_revoked`

### Mock Security Middleware

| Function | Purpose | What It Tests |
|----------|---------|----------------|
| `createMockSecurityMiddleware()` | Creates a mock security middleware with request context and auth/authorization methods | Middleware testing, request interception, security layer validation |

**Security Middleware Methods:**
- `authenticate(userId)` - Authenticates a user
- `authorize(permission)` - Authorizes a permission (throws if not authenticated)
- `setCsrfToken(token)` - Sets CSRF token
- `checkRateLimit()` - Checks and decrements rate limit

### Test Assertions

| Function | Purpose | What It Tests |
|----------|---------|----------------|
| `isSanitized(sanitized)` | Checks if input is properly sanitized (returns boolean) | Sanitization validation, security checking, output safety |
| `hasSecurityHeaders(headers)` | Checks if headers include required security headers (returns boolean) | Security header validation, header enforcement, compliance checking |

**Required Security Headers:**
- `x-content-type-options: nosniff`
- `x-frame-options` (any value)
- `x-xss-protection` (any value)
- `strict-transport-security` (must include `max-age=`)

---

## Utility Constants

### Security Testing Constants

| Constant | Type | Values |
|----------|------|--------|
| `MALICIOUS_INPUTS` | Object | SQL injection, XSS, path traversal, command injection, LDAP injection, NoSQL injection, header injection patterns |
| `SECURITY_EVENT_TYPES` | Object | Authentication, authorization, rate limit, data, session, CSRF, input event categories |
| `PASSWORD_STRENGTH` | Object | Weak, fair, good, strong password examples with scores |
| `ROLES` | Object | Admin, user, readonly, service role definitions with permissions |
| `AUDIT_ACTIONS` | Object | Authentication, API keys, data, admin, sessions action categories |

---

## Usage Examples

### Basic Mock Data Generation

```typescript
import { createMockStation, createMockArrival } from "@mta-my-way/shared/testing";

const timesSquare = createMockStation({ id: "725", name: "Times Square-42 St" });
const arrival = createMockArrival({ line: "1", direction: "N", minutesAway: 2 });
```

### Assertion Helpers

```typescript
import { assertHasProperties, assertIsRecent } from "@mta-my-way/shared/testing";

assertHasProperties(station, ["id", "name", "lat", "lon"]);
assertIsRecent(arrival.arrivalTime, 300000); // Within 5 minutes
```

### Observability Testing

```typescript
import { createMockLogger, assertLoggerCalled } from "@mta-my-way/shared/testing";

const logger = createMockLogger();
logger.info("Station loaded", { stationId: "725" });

assertLoggerCalled(logger, "info", "Station loaded", { stationId: "725" });
```

### Security Testing

```typescript
import { createAuthenticatedContext, hasPermission } from "@mta-my-way/shared/testing";

const context = createAuthenticatedContext();
const canRead = hasPermission("user", "read:arrivals"); // true
```

---

## E2E Test Helpers (`tests/e2e/helpers/`)

### Port Checking

| Function | Purpose | What It Tests |
|----------|---------|----------------|
| `checkPort(port)` | Checks if a TCP port is already in use on localhost | Port conflict detection, pre-flight server startup checks, CI/CD validation |

---

## Summary Statistics

- **Total Functions:** 75 (74 shared + 1 e2e)
- **Total Constants:** 5
- **Files:** 4 (test-helpers.ts, observability-helpers.ts, security-helpers.ts, check-port.ts)
- **Categories:** 10 (Mock Data, Assertions, Setup, Time, Performance, HTTP, Async, Observability, Security, E2E)

---

## Contributing

When adding new test helpers:
1. Add them to the appropriate category section above
2. Document the purpose and what it tests
3. Add a usage example if the pattern is new
4. Update the summary statistics
5. Follow existing naming conventions (`createMock*`, `assert*`, `setup*`)
