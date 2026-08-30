# Observability Testing Helpers - Comprehensive Guide

**Package:** `@mta-my-way/shared/testing`  
**Source:** `packages/shared/src/testing/observability-helpers.ts`  
**Last Updated:** 2026-08-30

This guide provides comprehensive documentation for observability testing helpers including detailed usage examples, common patterns, and edge cases for production-grade testing.

---

## Table of Contents

1. [Logger Mocking](#logger-mocking)
2. [Metrics Testing](#metrics-testing)
3. [Tracing Testing](#tracing-testing)
4. [Performance Monitoring](#performance-monitoring)
5. [Health Check Testing](#health-check-testing)
6. [Integration Helpers](#integration-helpers)
7. [Real-World Testing Patterns](#real-world-testing-patterns)

---

## Logger Mocking

### `createMockLogger()`

Creates a comprehensive mock logger that captures all log entries while providing Vitest spies for assertion testing.

**Signature:**
```typescript
function createMockLogger(): MockLogger
```

**Parameters:**
- None

**Returns:**
- `MockLogger` object with:
  - `entries: LogEntry[]` - Array of all captured log entries in chronological order
  - `debug: vi.fn` - Debug-level logging function
    - Type: `(message: string, context?: Record<string, unknown>) => void`
    - Spy tracks all calls for assertions
  - `info: vi.fn` - Info-level logging function
    - Type: `(message: string, context?: Record<string, unknown>) => void`
    - Most common level for operational logging
  - `warn: vi.fn` - Warning-level logging function
    - Type: `(message: string, context?: Record<string, unknown>) => void`
    - For non-critical issues requiring attention
  - `error: vi.fn` - Error-level logging function
    - Type: `(message: string, error?: Error, context?: Record<string, unknown>) => void`
    - Accepts optional Error object for stack trace capture
  - `child: vi.fn` - Creates child logger with additional context
    - Type: `(additionalContext: Record<string, unknown>) => MockLogger`
    - Returns new independent logger (no shared state with parent)
  - `clear(): void` - Clears all captured log entries
  - `getEntriesAtLevel(level): LogEntry[]` - Filters entries by log level
  - `getEntriesWithMessage(message): LogEntry[]` - Filters entries by message substring
  - `getLastEntry(): LogEntry | undefined` - Gets most recent entry

**LogEntry Interface:**
```typescript
interface LogEntry {
  level: "debug" | "info" | "warn" | "error";
  message: string;
  timestamp?: string;
  context?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}
```

**Common Usage Patterns:**

```typescript
// 1. Basic logging verification
const logger = createMockLogger();
logger.info("Station loaded", { stationId: "725", lines: ["1", "2", "3"] });

expect(logger.info).toHaveBeenCalledWith(
  "Station loaded",
  { stationId: "725", lines: ["1", "2", "3"] }
);
expect(logger.info).toHaveBeenCalledTimes(1);

// 2. Error logging with stack trace
const logger = createMockLogger();
try {
  await fetchArrivals("invalid_station");
} catch (error) {
  logger.error("Failed to fetch arrivals", error as Error, { stationId: "invalid" });
}

const errorCall = logger.error.mock.calls[0];
expect(errorCall[0]).toBe("Failed to fetch arrivals");
expect(errorCall[1]).toBeInstanceOf(Error);
expect(errorCall[1].message).toContain("invalid");
expect(errorCall[2]).toEqual({ stationId: "invalid" });

// 3. Testing log level filtering
const logger = createMockLogger();
setLogLevel("warn"); // Hypothetical log level setter

logger.debug("This won't be logged");
logger.info("This won't be logged");
logger.warn("This will be logged");
logger.error("This will be logged");

expect(logger.debug).not.toHaveBeenCalled();
expect(logger.info).not.toHaveBeenCalled();
expect(logger.warn).toHaveBeenCalledTimes(1);
expect(logger.error).toHaveBeenCalledTimes(1);

// 4. Verifying context propagation
const logger = createMockLogger();
function processRequest(requestId: string) {
  logger.info("Processing request", { requestId, userId: "123" });
  logger.info("Request completed", { requestId, duration: 150 });
}

processRequest("req_abc");

const calls = logger.info.mock.calls;
expect(calls[0][1]).toMatchObject({ requestId: "req_abc", userId: "123" });
expect(calls[1][1]).toMatchObject({ requestId: "req_abc", duration: 150 });

// 5. Testing child logger independence
const logger = createMockLogger();
const childLogger = logger.child({ component: "DatabaseService" });

logger.info("Parent message");
childLogger.info("Child message");

expect(logger.info).toHaveBeenCalledTimes(1);
expect(childLogger.info).toHaveBeenCalledTimes(1);
expect(childLogger.entries).toHaveLength(1); // Child has own entries

// 6. Filtering entries by level
const logger = createMockLogger();
logger.debug("Debug message");
logger.info("Info message");
logger.warn("Warning message");
logger.error("Error message");

const errors = logger.getEntriesAtLevel("error");
const warningsAndErrors = logger.entries.filter(e => e.level === "warn" || e.level === "error");

expect(errors).toHaveLength(1);
expect(warningsAndErrors).toHaveLength(2);

// 7. Message filtering for specific events
const logger = createMockLogger();
logger.info("User logged in", { userId: "123" });
logger.info("User logged out", { userId: "123" });
logger.info("Station loaded", { stationId: "725" });

const authLogs = logger.getEntriesWithMessage("User");
expect(authLogs).toHaveLength(2);

// 8. Testing log entry order
const logger = createMockLogger();
logger.info("Step 1");
logger.info("Step 2");
logger.info("Step 3");

const entries = logger.entries;
expect(entries[0].message).toBe("Step 1");
expect(entries[1].message).toBe("Step 2");
expect(entries[2].message).toBe("Step 3");

// 9. Accessing the most recent entry
const logger = createMockLogger();
logger.info("First");
logger.info("Second");
logger.warn("Third");

const lastEntry = logger.getLastEntry();
expect(lastEntry?.level).toBe("warn");
expect(lastEntry?.message).toBe("Third");

// 10. Clearing log entries between tests
const logger = createMockLogger();
logger.info("Test 1");
expect(logger.entries).toHaveLength(1);

logger.clear();
logger.info("Test 2");
expect(logger.entries).toHaveLength(1);
```

**Advanced Usage Patterns:**

```typescript
// 1. Testing structured logging in services
test("StationService logs all operations", () => {
  const logger = createMockLogger();
  const service = new StationService(logger);

  await service.loadStation("725");
  await service.loadStation("726");

  expect(logger.info).toHaveBeenCalledTimes(2);
  expect(logger.info).toHaveBeenCalledWith("Loading station", { stationId: "725" });
  expect(logger.info).toHaveBeenCalledWith("Loading station", { stationId: "726" });
});

// 2. Verifying error handling with proper logging
test("API client logs errors with context", async () => {
  const logger = createMockLogger();
  const client = new ApiClient(logger);

  try {
    await client.fetchArrivals("invalid_station");
  } catch (error) {
    // Expected to throw
  }

  expect(logger.error).toHaveBeenCalledWith(
    "API request failed",
    expect.any(Error),
    expect.objectContaining({
      endpoint: "/arrivals/invalid_station",
      status: 404
    })
  );
});

// 3. Testing performance logging
test("Operation logs execution time", async () => {
  const logger = createMockLogger();
  const start = Date.now();

  await someOperation();

  const duration = Date.now() - start;
  logger.info("Operation completed", { duration, operation: "fetch" });

  const call = logger.info.mock.calls[0];
  expect(call[1]?.duration).toBeGreaterThan(0);
  expect(typeof call[1]?.duration).toBe("number");
});

// 4. Testing conditional logging
test("Only logs errors in production mode", () => {
  const logger = createMockLogger();
  setEnvironment("production");

  processStations(logger);

  expect(logger.debug).not.toHaveBeenCalled();
  expect(logger.info).toHaveBeenCalled();
});

// 5. Testing log context enrichment
test("Logger enriches all messages with request context", () => {
  const logger = createMockLogger();
  const requestLogger = logger.child({ requestId: "req_123", userId: "user_456" });

  requestLogger.info("Action 1");
  requestLogger.info("Action 2");

  const calls = requestLogger.info.mock.calls;
  expect(calls[0][1]).toMatchObject({ requestId: "req_123", userId: "user_456" });
  expect(calls[1][1]).toMatchObject({ requestId: "req_123", userId: "user_456" });
});
```

**Edge Cases & Gotchas:**

- **Child logger independence**: Child loggers are separate mocks with no shared state
  ```typescript
  const parent = createMockLogger();
  const child = parent.child({ component: "DB" });
  
  parent.info("Parent message");
  child.info("Child message");
  
  expect(parent.entries).toHaveLength(1); // Not 2
  expect(child.entries).toHaveLength(1); // Independent
  ```

- **Error object serialization**: Error objects are captured, not serialized
  ```typescript
  const error = new Error("Test error");
  logger.error("Failed", error);
  
  const entry = logger.entries[0];
  expect(entry.error?.message).toBe("Test error");
  expect(entry.error?.stack).toBeDefined(); // Stack trace captured
  ```

- **Context object merging**: Context is stored as-is, no deep merging
  ```typescript
  logger.info("Message", { key1: "value1" });
  logger.info("Message", { key2: "value2" });
  
  // Two separate entries, not merged
  expect(logger.entries[0].context).toEqual({ key1: "value1" });
  expect(logger.entries[1].context).toEqual({ key2: "value2" });
  ```

- **Spy call persistence**: Calls persist across test runs if logger not recreated
  ```typescript
  const logger = createMockLogger();
  logger.info("Test 1");
  // If reused in next test without clearing:
  logger.info("Test 2");
  expect(logger.info).toHaveBeenCalledTimes(2); // Includes previous test
  ```

- **Type safety**: Context can be any shape, no runtime validation
  ```typescript
  logger.info("Message", { arbitrary: "data", nested: { obj: true } });
  // TypeScript accepts this, no validation at runtime
  ```

**Performance Considerations:**

- Spy call tracking has minimal overhead (~0.01ms per call)
- Context objects stored by reference (not cloned)
- For high-frequency logging (>1000 calls/second), consider simpler mocks
- `clear()` is O(1) - just resets array length

---

### `assertLoggerCalled(mockLogger, level, message, context?)`

Asserts that a logger was called with specific level, message, and optional context properties.

**Signature:**
```typescript
function assertLoggerCalled(
  mockLogger: MockLogger,
  level: LogEntry["level"],
  message: string,
  context?: Record<string, unknown>
): void
```

**Parameters:**
- `mockLogger: MockLogger` - Mock logger instance from `createMockLogger()`
- `level: "debug" | "info" | "warn" | "error"` - Expected log level
- `message: string` - Exact expected message string (not substring match)
- `context` (optional): Partial context object to match using `expect.objectContaining()`

**Returns:**
- `void` - Throws Vitest assertion error if conditions not met

**Common Usage Patterns:**

```typescript
// 1. Basic message verification
const logger = createMockLogger();
logger.info("User logged in", { userId: "123" });

assertLoggerCalled(logger, "info", "User logged in", { userId: "123" });

// 2. Verifying error logging
const logger = createMockLogger();
try {
  await riskyOperation();
} catch (error) {
  logger.error("Operation failed", error as Error, { code: "ERR_001" });
}

assertLoggerCalled(logger, "error", "Operation failed", { code: "ERR_001" });

// 3. Testing without context matching
const logger = createMockLogger();
logger.warn("High memory usage");

assertLoggerCalled(logger, "warn", "High memory usage"); // No context check

// 4. Multiple log calls with specific assertions
const logger = createMockLogger();
logger.info("Step 1: Loading data");
logger.info("Step 2: Processing data");
logger.info("Step 3: Saving data");

assertLoggerCalled(logger, "info", "Step 1: Loading data");
assertLoggerCalled(logger, "info", "Step 2: Processing data");
assertLoggerCalled(logger, "info", "Step 3: Saving data");

// 5. Partial context matching
const logger = createMockLogger();
logger.info("Request received", {
  method: "POST",
  path: "/api/stations",
  body: { name: "Test" },
  timestamp: Date.now()
});

// Only check specific fields
assertLoggerCalled(logger, "info", "Request received", {
  method: "POST",
  path: "/api/stations"
  // Doesn't check body or timestamp
});
```

**Advanced Usage Patterns:**

```typescript
// 1. Testing service layer logging
test("StationRepository logs database operations", () => {
  const logger = createMockLogger();
  const repository = new StationRepository(logger);

  repository.findById("725");

  assertLoggerCalled(logger, "info", "Querying database", {
    table: "stations",
    id: "725"
  });
});

// 2. Verifying audit trail logging
test("Security events are logged with full context", () => {
  const logger = createMockLogger();
  const audit = new AuditLogger(logger);

  audit.logAccessAttempt("user_123", "admin_panel", true);

  assertLoggerCalled(logger, "info", "Access attempt", {
    userId: "user_123",
    resource: "admin_panel",
    granted: true
  });
});

// 3. Testing error context propagation
test("API errors include request metadata", async () => {
  const logger = createMockLogger();
  const api = new ApiService(logger);

  try {
    await api.fetchStation("invalid");
  } catch {
    // Expected
  }

  assertLoggerCalled(logger, "error", "Station fetch failed", {
    stationId: "invalid",
    errorCode: expect.any(String)
  });
});
```

**Edge Cases & Gotchas:**

- **Message must match exactly**: Not a substring match
  ```typescript
  logger.info("User logged in successfully");
  assertLoggerCalled(logger, "info", "User logged in"); // ❌ Fails - not exact match
  assertLoggerCalled(logger, "info", "User logged in successfully"); // ✅ Works
  ```

- **Context uses partial matching**: Uses `expect.objectContaining()`
  ```typescript
  logger.info("Message", { key1: "val1", key2: "val2" });
  assertLoggerCalled(logger, "info", "Message", { key1: "val1" }); // ✅ Works
  // Doesn't require key2 to be present
  ```

- **Context check is optional**: Can omit context parameter
  ```typescript
  logger.info("Message", { some: "context" });
  assertLoggerCalled(logger, "info", "Message"); // ✅ Works - ignores context
  ```

- **Level must be exact string**: Not case-insensitive
  ```typescript
  logger.info("Message");
  assertLoggerCalled(logger, "INFO", "Message"); // ❌ Fails - wrong case
  assertLoggerCalled(logger, "info", "Message"); // ✅ Works
  ```

---

### `assertLoggerNotCalled(mockLogger, level)`

Asserts that a logger was NOT called at a specific level, useful for testing error-free operations or conditional logging.

**Signature:**
```typescript
function assertLoggerNotCalled(
  mockLogger: MockLogger,
  level: LogEntry["level"]
): void
```

**Parameters:**
- `mockLogger: MockLogger` - Mock logger instance
- `level: "debug" | "info" | "warn" | "error"` - Log level that should not be called

**Returns:**
- `void` - Throws Vitest assertion error if level was called

**Common Usage Patterns:**

```typescript
// 1. Testing error-free operations
const logger = createMockLogger();
await successfulOperation();

assertLoggerNotCalled(logger, "error");
assertLoggerNotCalled(logger, "warn");

// 2. Testing suppressed debug logging
const logger = createMockLogger();
setLogLevel("info"); // Debug disabled

debugOperation(logger);

assertLoggerNotCalled(logger, "debug");
expect(logger.info).toHaveBeenCalled(); // But info should work

// 3. Verifying no warnings in happy path
const logger = createMockLogger();
processPayment(logger, { amount: 100, currency: "USD" });

assertLoggerNotCalled(logger, "warn");
assertLoggerNotCalled(logger, "error");

// 4. Testing level-specific filtering
const logger = createMockLogger();
logger.info("Info message");
logger.debug("Debug message");

assertLoggerNotCalled(logger, "warn"); // No warnings
assertLoggerNotCalled(logger, "error"); // No errors

// 5. Conditional error logging
const logger = createMockLogger();
const isValid = true;

if (!isValid) {
  logger.error("Invalid data");
}

assertLoggerNotCalled(logger, "error"); // Error not logged because isValid=true
```

**Advanced Usage Patterns:**

```typescript
// 1. Testing successful API responses
test("Successful API calls don't log errors", async () => {
  const logger = createMockLogger();
  const api = new ApiService(logger);

  await api.fetchStation("725"); // Valid station

  assertLoggerNotCalled(logger, "error");
});

// 2. Testing data validation passes without warnings
test("Valid data doesn't trigger validation warnings", () => {
  const logger = createMockLogger();
  const validator = new DataValidator(logger);

  const result = validator.validate({
    id: "725",
    name: "Times Square",
    lines: ["1", "2", "3"]
  });

  expect(result.isValid).toBe(true);
  assertLoggerNotCalled(logger, "warn");
});

// 3. Testing graceful degradation
test("Cache miss doesn't cause errors, only info logs", () => {
  const logger = createMockLogger();
  const cache = new CacheService(logger);

  cache.get("missing_key"); // Cache miss

  assertLoggerNotCalled(logger, "error");
  expect(logger.info).toHaveBeenCalledWith("Cache miss", expect.anything());
});
```

**Edge Cases & Gotchas:**

- **Only checks specified level**: Other levels may be called
  ```typescript
  logger.info("Info message");
  logger.warn("Warning message");
  
  assertLoggerNotCalled(logger, "error"); // ✅ Passes - no errors
  assertLoggerNotCalled(logger, "warn"); // ❌ Fails - warning was called
  ```

- **Doesn't check message content**: Only checks if level was called at all
  ```typescript
  logger.error("Any error message");
  assertLoggerNotCalled(logger, "error"); // ❌ Fails regardless of message
  ```

- **Useful for testing error conditions**: Verify errors are logged when expected
  ```typescript
  try {
    await operationThatThrows();
  } catch {
    // Expected
  }
  
  expect(logger.error).toHaveBeenCalled(); // Error should be logged
  ```

---

## Metrics Testing

### `createMockMetricsRegistry()`

Creates a mock metrics registry supporting counter, gauge, and histogram metric types with full snapshot tracking.

**Signature:**
```typescript
function createMockMetricsRegistry(): MockMetricsRegistry
```

**Parameters:**
- None

**Returns:**
- `MockMetricsRegistry` object with:
  - `metrics: Map<string, MetricSnapshot[]>` - Internal storage of all metric snapshots
  - `counter(name, help): Counter` - Creates or gets counter metric
    - Returns `{ inc(amount?, labels?), reset(labels?) }`
  - `gauge(name, help): Gauge` - Creates or gets gauge metric
    - Returns `{ set(value, labels?), inc(amount?, labels?), dec(amount?, labels?) }`
  - `histogram(name, help, buckets?): Histogram` - Creates or gets histogram metric
    - Returns `{ observe(value, labels?), reset(labels?) }`
  - `getSnapshots(): MetricSnapshot[]` - Gets all metric snapshots
  - `getMetricSnapshots(name): MetricSnapshot[]` - Gets snapshots for specific metric
  - `getMetricValue(name): number` - Gets current value of metric
  - `clear(): void` - Clears all metrics

**MetricSnapshot Interface:**
```typescript
interface MetricSnapshot {
  type: "counter" | "gauge" | "histogram";
  name: string;
  value: number;
  labels?: Record<string, string>;
  timestamp: number;
}
```

**Common Usage Patterns:**

```typescript
// 1. Counter metric for event counting
const metrics = createMockMetricsRegistry();
const requestCount = metrics.counter("api_requests", "Total API requests");

requestCount.inc(1, { endpoint: "/api/stations", method: "GET" });
requestCount.inc(1, { endpoint: "/api/arrivals", method: "GET" });

expect(metrics.getMetricValue("api_requests")).toBe(2);

// 2. Gauge metric for state tracking
const metrics = createMockMetricsRegistry();
const activeConnections = metrics.gauge("db_connections", "Active database connections");

activeConnections.set(10);
activeConnections.inc(5);  // 10 + 5 = 15
activeConnections.dec(3);  // 15 - 3 = 12

expect(metrics.getMetricValue("db_connections")).toBe(12);

// 3. Histogram metric for distribution tracking
const metrics = createMockMetricsRegistry();
const responseTime = metrics.histogram("http_request_duration", "Request duration", [10, 50, 100, 500]);

responseTime.observe(45);  // 45ms
responseTime.observe(120); // 120ms
responseTime.observe(30);  // 30ms

const snapshots = metrics.getMetricSnapshots("http_request_duration");
expect(snapshots).toHaveLength(3);
expect(metrics.getMetricValue("http_request_duration")).toBe(195); // Sum

// 4. Metric with labels
const metrics = createMockMetricsRegistry();
const counter = metrics.counter("api_requests", "API requests");

counter.inc(1, { endpoint: "/stations", status: "200" });
counter.inc(1, { endpoint: "/arrivals", status: "200" });
counter.inc(1, { endpoint: "/stations", status: "404" });

const snapshots = metrics.getMetricSnapshots("api_requests");
expect(snapshots).toHaveLength(3);
expect(snapshots[0].labels).toEqual({ endpoint: "/stations", status: "200" });

// 5. Resetting metrics
const metrics = createMockMetricsRegistry();
const counter = metrics.counter("test_counter", "Test counter");

counter.inc();
counter.inc();
expect(metrics.getMetricValue("test_counter")).toBe(2);

counter.reset(); // Reset all
expect(metrics.getMetricSnapshots("test_counter")).toHaveLength(0);

// 6. Label-specific reset
const metrics = createMockMetricsRegistry();
const counter = metrics.counter("requests", "Requests");

counter.inc(1, { endpoint: "/api1" });
counter.inc(1, { endpoint: "/api2" });
counter.inc(1, { endpoint: "/api1" });

counter.reset({ endpoint: "/api1" }); // Only reset /api1 labels
const snapshots = metrics.getMetricSnapshots("requests");
expect(snapshots).toHaveLength(1);
expect(snapshots[0].labels?.endpoint).toBe("/api2");
```

**Advanced Usage Patterns:**

```typescript
// 1. Testing metrics in API middleware
test("API middleware tracks request metrics", () => {
  const metrics = createMockMetricsRegistry();
  const middleware = metricsMiddleware(metrics);

  middleware({ method: "GET", url: "/api/stations" }, () => {});

  const counter = metrics.getMetricSnapshots("http_requests_total");
  expect(counter).toHaveLength(1);
  expect(counter[0].labels).toMatchObject({ method: "GET", path: "/api/stations" });
});

// 2. Testing database connection pooling metrics
test("Connection pool tracks active connections", () => {
  const metrics = createMockMetricsRegistry();
  const pool = new ConnectionPool(metrics, { maxConnections: 10 });

  pool.acquire();
  pool.acquire();
  pool.release();

  expect(metrics.getMetricValue("db_connections_active")).toBe(1);
});

// 3. Testing histogram bucket distribution
test("Request duration histogram captures distribution", () => {
  const metrics = createMockMetricsRegistry();
  const histogram = metrics.histogram("request_duration", "Duration", [10, 50, 100, 500]);

  histogram.observe(5);   // < 10ms bucket
  histogram.observe(45);  // 10-50ms bucket
  histogram.observe(75);  // 50-100ms bucket
  histogram.observe(200); // 100-500ms bucket

  const values = metrics.getMetricSnapshots("request_duration").map(s => s.value);
  expect(values).toEqual([5, 45, 75, 200]);
});

// 4. Testing gauge behavior for state metrics
test("Gauge reflects current state, not cumulative", () => {
  const metrics = createMockMetricsRegistry();
  const queueSize = metrics.gauge("queue_size", "Current queue size");

  queueSize.set(5);
  queueSize.set(10);
  queueSize.set(3);

  expect(metrics.getMetricValue("queue_size")).toBe(3); // Last value, not sum
});

// 5. Testing counter increments
test("Counter accumulates all increments", () => {
  const metrics = createMockMetricsRegistry();
  const counter = metrics.counter("events", "Total events");

  counter.inc(5);
  counter.inc(3);
  counter.inc(2);

  expect(metrics.getMetricValue("events")).toBe(10); // Sum of all
});
```

**Edge Cases & Gotchas:**

- **Counter vs Gauge value semantics**: Counters sum, gauges use last value
  ```typescript
  const metrics = createMockMetricsRegistry();
  const counter = metrics.counter("test", "Test");
  const gauge = metrics.gauge("test_gauge", "Test");
  
  counter.inc(5);
  counter.inc(3);
  expect(metrics.getMetricValue("test")).toBe(8); // Sum
  
  gauge.set(5);
  gauge.set(3);
  expect(metrics.getMetricValue("test_gauge")).toBe(3); // Last value
  ```

- **Metric resets are destructive**: Can't undo a reset
  ```typescript
  const counter = metrics.counter("test", "Test");
  counter.inc();
  counter.inc();
  counter.reset(); // Data lost forever
  expect(metrics.getMetricSnapshots("test")).toHaveLength(0);
  ```

- **Label-specific reset filtering**: Uses partial matching
  ```typescript
  const counter = metrics.counter("test", "Test");
  counter.inc(1, { endpoint: "/api", method: "GET" });
  counter.inc(1, { endpoint: "/api", method: "POST" });
  
  counter.reset({ endpoint: "/api" }); // Resets both GET and POST
  expect(metrics.getMetricSnapshots("test")).toHaveLength(0);
  ```

- **Histogram value is sum**: Not individual observations
  ```typescript
  const histogram = metrics.histogram("test", "Test");
  histogram.observe(10);
  histogram.observe(20);
  histogram.observe(30);
  
  expect(metrics.getMetricValue("test")).toBe(60); // Sum, not array
  ```

- **Metric name collision**: Same name returns same metric
  ```typescript
  const counter1 = metrics.counter("test", "First");
  const counter2 = metrics.counter("test", "Second"); // Same metric
  
  counter1.inc();
  counter2.inc();
  
  expect(metrics.getMetricValue("test")).toBe(2); // Both increments counted
  ```

**Performance Considerations:**

- Metric operations are O(1) - just array push
- `getMetricValue()` is O(n) where n = snapshots for that metric
- Label resets are O(n) - filters through all snapshots
- For high-frequency metrics (>10,000 operations), consider real metrics

---

### `assertCounterIncremented(mockMetrics, metricName, expectedValue?)`

Asserts that a counter metric was incremented, optionally to a specific value.

**Signature:**
```typescript
function assertCounterIncremented(
  mockMetrics: MockMetricsRegistry,
  metricName: string,
  expectedValue?: number
): void
```

**Parameters:**
- `mockMetrics: MockMetricsRegistry` - Mock metrics registry instance
- `metricName: string` - Name of the counter metric
- `expectedValue` (optional): Expected final counter value

**Returns:**
- `void` - Throws Vitest assertion error if conditions not met

**Common Usage Patterns:**

```typescript
// 1. Basic increment check
const metrics = createMockMetricsRegistry();
const counter = metrics.counter("api_requests", "API requests");

counter.inc();
assertCounterIncremented(metrics, "api_requests");

// 2. Exact value check
const metrics = createMockMetricsRegistry();
const counter = metrics.counter("events", "Events");

counter.inc(5);
counter.inc(3);
assertCounterIncremented(metrics, "events", 8);

// 3. Testing with labels
const metrics = createMockMetricsRegistry();
const counter = metrics.counter("requests", "Requests");

counter.inc(1, { endpoint: "/api/stations" });
counter.inc(1, { endpoint: "/api/arrivals" });

assertCounterIncremented(metrics, "requests", 2);

// 4. Multiple increments
const metrics = createMockMetricsRegistry();
const counter = metrics.counter("logins", "User logins");

for (let i = 0; i < 10; i++) {
  counter.inc();
}

assertCounterIncremented(metrics, "logins", 10);
```

**Edge Cases & Gotchas:**

- **Without expectedValue**: Only checks counter was called > 0 times
  ```typescript
  counter.inc();
  counter.inc();
  assertCounterIncremented(metrics, "test"); // ✅ Passes - was incremented
  ```

- **With expectedValue**: Checks exact sum of all increments
  ```typescript
  counter.inc(5);
  counter.inc(3);
  assertCounterIncremented(metrics, "test", 8); // ✅ Exact value
  assertCounterIncremented(metrics, "test", 7); // ❌ Wrong value
  ```

- **Throws if metric has no snapshots**: Metric never created/inc'd
  ```typescript
  assertCounterIncremented(metrics, "nonexistent"); // ❌ Throws
  ```

---

### `assertGaugeSet(mockMetrics, metricName, expectedValue)`

Asserts that a gauge metric was set to a specific value (checks last value).

**Signature:**
```typescript
function assertGaugeSet(
  mockMetrics: MockMetricsRegistry,
  metricName: string,
  expectedValue: number
): void
```

**Parameters:**
- `mockMetrics: MockMetricsRegistry` - Mock metrics registry instance
- `metricName: string` - Name of the gauge metric
- `expectedValue: number` - Expected current gauge value

**Returns:**
- `void` - Throws Vitest assertion error if conditions not met

**Common Usage Patterns:**

```typescript
// 1. Basic gauge check
const metrics = createMockMetricsRegistry();
const gauge = metrics.gauge("active_connections", "Active connections");

gauge.set(10);
assertGaugeSet(metrics, "active_connections", 10);

// 2. Gauge increment/decrement
const metrics = createMockMetricsRegistry();
const queueSize = metrics.gauge("queue_size", "Queue size");

queueSize.inc(5);  // Starts at 0, becomes 5
queueSize.dec(2);  // 5 - 2 = 3
assertGaugeSet(metrics, "queue_size", 3);

// 3. Testing state changes
const metrics = createMockMetricsRegistry();
const status = metrics.gauge("service_status", "Service status (0=down, 1=up)");

status.set(1); // Service up
assertGaugeSet(metrics, "service_status", 1);

status.set(0); // Service down
assertGaugeSet(metrics, "service_status", 0);
```

**Edge Cases & Gotchas:**

- **Checks last value, not sum**: Gauges track state, not cumulative values
  ```typescript
  const gauge = metrics.gauge("test", "Test");
  gauge.set(5);
  gauge.set(10);
  gauge.set(3);
  assertGaugeSet(metrics, "test", 3); // Last value, not 18
  ```

- **Throws if no snapshots**: Gauge never used
  ```typescript
  assertGaugeSet(metrics, "unused", 0); // ❌ Throws
  ```

- **inc/dec also work**: Gauges support increment/decrement
  ```typescript
  const gauge = metrics.gauge("test", "Test");
  gauge.inc(10); // 0 + 10 = 10
  gauge.dec(3);  // 10 - 3 = 7
  assertGaugeSet(metrics, "test", 7);
  ```

---

### `assertHistogramObserved(mockMetrics, metricName, expectedValues?)`

Asserts that a histogram observed specific values, in order.

**Signature:**
```typescript
function assertHistogramObserved(
  mockMetrics: MockMetricsRegistry,
  metricName: string,
  expectedValues?: number[]
): void
```

**Parameters:**
- `mockMetrics: MockMetricsRegistry` - Mock metrics registry instance
- `metricName: string` - Name of the histogram metric
- `expectedValues` (optional): Expected array of observed values in order

**Returns:**
- `void` - Throws Vitest assertion error if conditions not met

**Common Usage Patterns:**

```typescript
// 1. Basic observation check
const metrics = createMockMetricsRegistry();
const histogram = metrics.histogram("response_time", "Response time");

histogram.observe(100);
assertHistogramObserved(metrics, "response_time");

// 2. Exact value sequence check
const metrics = createMockMetricsRegistry();
const histogram = metrics.histogram("request_size", "Request size");

histogram.observe(1024);
histogram.observe(2048);
histogram.observe(512);

assertHistogramObserved(metrics, "request_size", [1024, 2048, 512]);

// 3. Testing distribution
const metrics = createMockMetricsRegistry();
const histogram = metrics.histogram("duration", "Duration");

[45, 120, 30, 200, 80].forEach(duration => histogram.observe(duration));

assertHistogramObserved(metrics, "duration", [45, 120, 30, 200, 80]);
```

**Edge Cases & Gotchas:**

- **Without expectedValues**: Only checks histogram was called > 0 times
  ```typescript
  histogram.observe(100);
  histogram.observe(200);
  assertHistogramObserved(metrics, "test"); // ✅ Passes - was observed
  ```

- **With expectedValues**: Checks exact array match (order matters)
  ```typescript
  histogram.observe(10);
  histogram.observe(20);
  assertHistogramObserved(metrics, "test", [10, 20]); // ✅ Exact match
  assertHistogramObserved(metrics, "test", [20, 10]); // ❌ Wrong order
  ```

- **Multiple observations**: Array includes all observations in order
  ```typescript
  histogram.observe(1);
  histogram.observe(2);
  histogram.observe(3);
  assertHistogramObserved(metrics, "test", [1, 2, 3]);
  ```

---

## Tracing Testing

### `createMockTracer()`

Creates a mock distributed tracing system with full span lifecycle management, hierarchical trace support, and performance measurement.

**Signature:**
```typescript
function createMockTracer(): MockTracer
```

**Parameters:**
- None

**Returns:**
- `MockTracer` object with:
  - `spans: SpanSnapshot[]` - All completed spans
  - `activeSpans: SpanSnapshot[]` - Currently active spans (stack)
  - `generateTraceId(): string` - Generates random 16-byte hex trace ID
  - `generateSpanId(): string` - Generates random 8-byte hex span ID
  - `startSpan(name, parentContext?): SpanSnapshot` - Starts new span with optional parent
  - `endSpan(attributes?): SpanSnapshot | null` - Ends current active span
  - `activeSpan(): SpanSnapshot | null` - Gets current active span
  - `addEvent(name, attributes?): void` - Adds event to current span
  - `setAttribute(key, value): void` - Sets attribute on current span
  - `setStatus(code, message?): void` - Sets status on current span
  - `withSpan(name, fn): Promise<T>` - Runs function within span (async-safe)
  - `getCompletedSpans(): SpanSnapshot[]` - Gets all completed spans
  - `clearCompleted(): void` - Clears completed spans
  - `getSpansForTrace(traceId): SpanSnapshot[]` - Gets all spans for specific trace

**SpanSnapshot Interface:**
```typescript
interface SpanSnapshot {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTime: number;
  endTime: number;
  duration: number;
  attributes: Record<string, string | number | boolean>;
  status?: { code: number; message?: string };
}
```

**Common Usage Patterns:**

```typescript
// 1. Basic span creation
const tracer = createMockTracer();
const span = tracer.startSpan("fetchStations");

tracer.setAttribute("stationId", "725");
tracer.endSpan({ success: true });

expect(tracer.getCompletedSpans()).toHaveLength(1);

// 2. Hierarchical spans (parent-child relationships)
const tracer = createMockTracer();
const parent = tracer.startSpan("processRequest");
tracer.setAttribute("requestId", "req_123");

{
  const child = tracer.startSpan("fetchData", { traceId: parent.traceId, spanId: parent.spanId });
  tracer.setAttribute("source", "database");
  tracer.endSpan();
}

tracer.endSpan();

const spans = tracer.getCompletedSpans();
expect(spans).toHaveLength(2);
expect(spans[1].parentSpanId).toBe(spans[0].spanId);

// 3. Using withSpan for automatic error handling
const tracer = createMockTracer();

await tracer.withSpan("fetchArrivals", async (span) => {
  const data = await fetchData();
  tracer.setAttribute("recordCount", data.length);
  return data;
});

// 4. Setting span status
const tracer = createMockTracer();
tracer.startSpan("processData");

try {
  await riskyOperation();
  tracer.setStatus(0, "OK"); // OK status
} catch (error) {
  tracer.setStatus(1, error instanceof Error ? error.message : String(error));
} finally {
  tracer.endSpan();
}

// 5. Adding events to spans
const tracer = createMockTracer();
tracer.startSpan("processPayment");

tracer.addEvent("validation_started", { amount: 100 });
tracer.addEvent("validation_completed");
tracer.addEvent("payment_processed", { transactionId: "txn_123" });

tracer.endSpan();

// 6. Multiple spans in same trace
const tracer = createMockTracer();
const traceId = tracer.generateTraceId();

const span1 = tracer.startSpan("operation1", { traceId });
tracer.endSpan();

const span2 = tracer.startSpan("operation2", { traceId });
tracer.endSpan();

const traceSpans = tracer.getSpansForTrace(traceId);
expect(traceSpans).toHaveLength(2);
expect(traceSpans[0].traceId).toBe(traceSpans[1].traceId);
```

**Advanced Usage Patterns:**

```typescript
// 1. Testing distributed trace context propagation
test("Trace context propagates through service calls", async () => {
  const tracer = createMockTracer();
  
  await tracer.withSpan("handleRequest", async () => {
    await callDownstreamService(tracer);
  });
  
  const spans = tracer.getCompletedSpans();
  expect(spans).toHaveLength(2);
  expect(spans[1].traceId).toBe(spans[0].traceId); // Same trace
  expect(spans[1].parentSpanId).toBe(spans[0].spanId); // Parent-child
});

// 2. Testing span attributes for observability
test("Spans capture operation metadata", () => {
  const tracer = createMockTracer();
  tracer.startSpan("fetchStation");
  
  tracer.setAttribute("station.id", "725");
  tracer.setAttribute("station.name", "Times Square");
  tracer.setAttribute("cache.hit", false);
  
  tracer.endSpan();
  
  const span = tracer.getCompletedSpans()[0];
  expect(span.attributes).toMatchObject({
    "station.id": "725",
    "station.name": "Times Square",
    "cache.hit": false
  });
});

// 3. Testing automatic error status with withSpan
test("withSpan sets error status on exceptions", async () => {
  const tracer = createMockTracer();
  
  try {
    await tracer.withSpan("failingOperation", async () => {
      throw new Error("Operation failed");
    });
  } catch {
    // Expected
  }
  
  const span = tracer.getCompletedSpans()[0];
  expect(span.status?.code).toBe(1);
  expect(span.status?.message).toBe("Operation failed");
});

// 4. Testing span duration calculation
test("Span duration is calculated correctly", async () => {
  const tracer = createMockTracer();
  
  tracer.startSpan("operation");
  await delay(100);
  tracer.endSpan();
  
  const span = tracer.getCompletedSpans()[0];
  expect(span.duration).toBeGreaterThanOrEqual(100);
});

// 5. Testing multiple operations in parallel
test("Parallel operations create separate traces", async () => {
  const tracer = createMockTracer();
  
  await Promise.all([
    tracer.withSpan("operation1", async () => await delay(10)),
    tracer.withSpan("operation2", async () => await delay(10)),
    tracer.withSpan("operation3", async () => await delay(10))
  ]);
  
  const spans = tracer.getCompletedSpans();
  expect(spans).toHaveLength(3);
  
  // Each should have different trace IDs (parallel, not nested)
  const traceIds = new Set(spans.map(s => s.traceId));
  expect(traceIds.size).toBe(3);
});
```

**Edge Cases & Gotchas:**

- **Span hierarchy requires explicit parent context**: Not automatic
  ```typescript
  const parent = tracer.startSpan("parent");
  const child = tracer.startSpan("child"); // ❌ Not linked to parent
  
  const parent = tracer.startSpan("parent");
  const child = tracer.startSpan("child", {
    traceId: parent.traceId,
    spanId: parent.spanId
  }); // ✅ Properly linked
  ```

- **Duration calculated on endSpan()**: Not available during span
  ```typescript
  tracer.startSpan("test");
  expect(tracer.activeSpan()?.duration).toBe(0); // Not yet calculated
  tracer.endSpan();
  expect(tracer.getCompletedSpans()[0].duration).toBeGreaterThan(0);
  ```

- **withSpan automatically ends span**: Even if error thrown
  ```typescript
  try {
    await tracer.withSpan("test", async () => {
      throw new Error("Failed");
    });
  } catch {}
  expect(tracer.getCompletedSpans()).toHaveLength(1); // Span was ended
  ```

- **Active spans work like a stack**: Last in, first out
  ```typescript
  tracer.startSpan("span1");
  tracer.startSpan("span2"); // Now active
  tracer.endSpan(); // Ends span2
  tracer.endSpan(); // Ends span1
  ```

- **Trace/span ID generation**: Random hex strings
  ```typescript
  const traceId = tracer.generateTraceId();
  expect(traceId).toHaveLength(32); // 16 bytes = 32 hex chars
  
  const spanId = tracer.generateSpanId();
  expect(spanId).toHaveLength(16); // 8 bytes = 16 hex chars
  ```

**Performance Considerations:**

- Span operations are O(1) - simple object creation
- Span hierarchy requires manual parent context passing
- `getSpansForTrace()` is O(n) where n = total completed spans
- For high-volume tracing, consider real distributed tracing systems

---

### `assertSpanCreated(mockTracer, name)`

Asserts that a span was created with a specific name.

**Signature:**
```typescript
function assertSpanCreated(
  mockTracer: MockTracer,
  name: string
): void
```

**Parameters:**
- `mockTracer: MockTracer` - Mock tracer instance
- `name: string` - Expected span name

**Returns:**
- `void` - Throws Vitest assertion error if span not created

**Common Usage Patterns:**

```typescript
// 1. Basic span creation check
const tracer = createMockTracer();
tracer.startSpan("fetchStations");

assertSpanCreated(tracer, "fetchStations");

// 2. Testing operation tracking
test("Service creates span for database operations", () => {
  const tracer = createMockTracer();
  const service = new DatabaseService(tracer);
  
  service.query("SELECT * FROM stations");
  
  assertSpanCreated(tracer, "database_query");
});

// 3. Testing conditional span creation
test("Span only created for slow operations", async () => {
  const tracer = createMockTracer();
  
  await fastOperation(tracer);
  assertSpanCreated(tracer, "slow_operation"); // ❌ Should not be created
  
  await slowOperation(tracer);
  assertSpanCreated(tracer, "slow_operation"); // ✅ Should be created
});
```

**Edge Cases & Gotchas:**

- **Only checks startSpan was called**: Doesn't verify span was completed
  ```typescript
  tracer.startSpan("test");
  assertSpanCreated(tracer, "test"); // ✅ Passes
  // Span never ended, but assertion passes
  ```

- **Name must match exactly**: Not substring match
  ```typescript
  tracer.startSpan("fetch_stations_data");
  assertSpanCreated(tracer, "fetch_stations"); // ❌ Fails - not exact match
  ```

---

### `assertSpanHasAttributes(span, attributes)`

Asserts that a span has specific attributes with exact values.

**Signature:**
```typescript
function assertSpanHasAttributes(
  span: SpanSnapshot,
  attributes: Record<string, string | number | boolean>
): void
```

**Parameters:**
- `span: SpanSnapshot` - Span to check (from `getCompletedSpans()` or `startSpan()`)
- `attributes: Record<string, string | number | boolean>` - Expected attributes

**Returns:**
- `void` - Throws Vitest assertion error if attributes missing or wrong

**Common Usage Patterns:**

```typescript
// 1. Basic attribute check
const tracer = createMockTracer();
tracer.startSpan("fetchData");
tracer.setAttribute("stationId", "725");
tracer.setAttribute("cacheHit", true);
tracer.endSpan();

const span = tracer.getCompletedSpans()[0];
assertSpanHasAttributes(span, { stationId: "725", cacheHit: true });

// 2. Testing request context in spans
test("Spans include request metadata", () => {
  const tracer = createMockTracer();
  
  await tracer.withSpan("handleRequest", async () => {
    tracer.setAttribute("request.method", "GET");
    tracer.setAttribute("request.path", "/api/stations");
    tracer.setAttribute("request.userId", "123");
  });
  
  const span = tracer.getCompletedSpans()[0];
  assertSpanHasAttributes(span, {
    "request.method": "GET",
    "request.path": "/api/stations",
    "request.userId": "123"
  });
});

// 3. Testing error attributes
test("Error spans include error details", async () => {
  const tracer = createMockTracer();
  
  try {
    await tracer.withSpan("riskyOperation", async () => {
      throw new Error("Database connection failed");
    });
  } catch {}
  
  const span = tracer.getCompletedSpans()[0];
  assertSpanHasAttributes(span, {
    "error.type": "Error",
    "error.message": "Database connection failed"
  });
});
```

**Edge Cases & Gotchas:**

- **Checks exact match for each attribute**: Value must be identical
  ```typescript
  span.attributes = { stationId: "725", count: 5 };
  assertSpanHasAttributes(span, { stationId: "725" }); // ✅ Partial check OK
  assertSpanHasAttributes(span, { stationId: "726" }); // ❌ Wrong value
  ```

- **Throws if attribute missing**: All expected attributes must exist
  ```typescript
  span.attributes = { stationId: "725" };
  assertSpanHasAttributes(span, { stationId: "725", count: 5 }); // ❌ count missing
  ```

- **Type-sensitive**: String "5" !== number 5
  ```typescript
  span.attributes = { count: 5 }; // number
  assertSpanHasAttributes(span, { count: "5" }); // ❌ string vs number
  ```

---

### `assertSpanCompletedWithin(span, maxMs)`

Asserts that a span completed within a time limit, useful for SLA testing.

**Signature:**
```typescript
function assertSpanCompletedWithin(
  span: SpanSnapshot,
  maxMs: number
): void
```

**Parameters:**
- `span: SpanSnapshot` - Span to check (must be completed - duration calculated)
- `maxMs: number` - Maximum allowed duration in milliseconds

**Returns:**
- `void` - Throws Vitest assertion error if duration exceeds maxMs

**Common Usage Patterns:**

```typescript
// 1. Basic performance check
const tracer = createMockTracer();
tracer.startSpan("fetchStations");

await fetchDataFromAPI(); // Takes 50ms

tracer.endSpan();
const span = tracer.getCompletedSpans()[0];

assertSpanCompletedWithin(span, 1000); // Must complete in < 1 second

// 2. Testing SLA compliance
test("API operations meet SLA requirements", async () => {
  const tracer = createMockTracer();
  
  await tracer.withSpan("fetchArrivals", async () => {
    return await fetchArrivals("725");
  });
  
  const span = tracer.getCompletedSpans()[0];
  assertSpanCompletedWithin(span, 500); // API SLA: < 500ms
});

// 3. Testing database query performance
test("Database queries complete within acceptable time", async () => {
  const tracer = createMockTracer();
  
  tracer.startSpan("db_query");
  await db.query("SELECT * FROM stations LIMIT 100");
  tracer.endSpan();
  
  const span = tracer.getCompletedSpans()[0];
  assertSpanCompletedWithin(span, 100); // DB SLA: < 100ms
});
```

**Edge Cases & Gotchas:**

- **Duration calculated on endSpan()**: Must be completed
  ```typescript
  tracer.startSpan("test");
  const active = tracer.activeSpan();
  assertSpanCompletedWithin(active, 1000); // ❌ Duration is 0 (not ended)
  
  tracer.endSpan();
  const completed = tracer.getCompletedSpans()[0];
  assertSpanCompletedWithin(completed, 1000); // ✅ Has duration
  ```

- **Real duration may vary**: Not suitable for exact timing
  ```typescript
  // Use tolerance for real operations
  tracer.startSpan("test");
  await operationThatTakesAbout50ms();
  tracer.endSpan();
  
  const span = tracer.getCompletedSpans()[0];
  assertSpanCompletedWithin(span, 100); // ✅ Tolerance, not exact
  ```

- **Throws if exceeds maxMs**: Strict inequality
  ```typescript
  const span = { duration: 101 };
  assertSpanCompletedWithin(span, 100); // ❌ 101 > 100
  assertSpanCompletedWithin(span, 101); // ✅ 101 <= 101
  ```

---

## Performance Monitoring

### `createPerformanceMonitor()`

Creates a performance monitor for measuring operation execution time with statistics aggregation (min, max, avg, percentiles).

**Signature:**
```typescript
function createPerformanceMonitor(): PerformanceMonitor
```

**Parameters:**
- None

**Returns:**
- `PerformanceMonitor` object with:
  - `snapshots: PerformanceSnapshot[]` - All measurements
  - `start(name, metadata?): { end(): number }` - Starts measuring, returns end function
  - `measure(name, fn, metadata?): Promise<{ result: T, duration: number }>` - Measures function execution
  - `getSnapshots(name): PerformanceSnapshot[]` - Gets snapshots for named operation
  - `getStatistics(name): Statistics | null` - Gets statistics (count, min, max, avg, p50, p95, p99)
  - `clear(): void` - Clears all snapshots

**PerformanceSnapshot Interface:**
```typescript
interface PerformanceSnapshot {
  name: string;
  duration: number;
  startTime: number;
  endTime: number;
  metadata?: Record<string, unknown>;
}
```

**Statistics Interface:**
```typescript
interface Statistics {
  count: number;
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
}
```

**Common Usage Patterns:**

```typescript
// 1. Manual start/stop timing
const monitor = createPerformanceMonitor();
const timer = monitor.start("fetchData");

await fetchDataFromAPI();

const duration = timer.end();
console.log(`Operation took ${duration}ms`);

// 2. Using measure() for automatic timing
const monitor = createPerformanceMonitor();

const { result, duration } = await monitor.measure("fetchStations", async () => {
  return await fetchStations();
});

console.log(`Fetched ${result.length} stations in ${duration}ms`);

// 3. Getting statistics across multiple runs
const monitor = createPerformanceMonitor();

for (let i = 0; i < 100; i++) {
  await monitor.measure("query", () => db.query("SELECT * FROM stations"));
}

const stats = monitor.getStatistics("query");
console.log(`Min: ${stats.min}ms, Max: ${stats.max}ms, Avg: ${stats.avg}ms`);
console.log(`P95: ${stats.p95}ms, P99: ${stats.p99}ms`);

// 4. Comparing operation performance
const monitor = createPerformanceMonitor();

await monitor.measure("cache_lookup", () => cache.get("key"));
await monitor.measure("database_query", () => db.query("SELECT * FROM stations"));

const cacheStats = monitor.getStatistics("cache_lookup");
const dbStats = monitor.getStatistics("database_query");

console.log(`Cache avg: ${cacheStats.avg}ms vs DB avg: ${dbStats.avg}ms`);

// 5. Using metadata for grouping
const monitor = createPerformanceMonitor();

await monitor.measure("api_request", async () => await fetch("/stations"), {
  endpoint: "/stations",
  method: "GET"
});

await monitor.measure("api_request", async () => await fetch("/arrivals"), {
  endpoint: "/arrivals",
  method: "GET"
});

const allSnapshots = monitor.getSnapshots("api_request");
const stationSnapshots = allSnapshots.filter(s => s.metadata?.endpoint === "/stations");
```

**Advanced Usage Patterns:**

```typescript
// 1. Testing performance regression
test("API response time meets performance requirements", async () => {
  const monitor = createPerformanceMonitor();
  
  for (let i = 0; i < 10; i++) {
    await monitor.measure("fetchStations", () => api.getStations());
  }
  
  const stats = monitor.getStatistics("fetchStations");
  expect(stats.p95).toBeLessThan(200); // 95th percentile under 200ms
  expect(stats.max).toBeLessThan(500); // No request over 500ms
});

// 2. Comparing algorithm performance
test("New algorithm is faster than old", async () => {
  const monitor = createPerformanceMonitor();
  
  // Old algorithm
  for (let i = 0; i < 100; i++) {
    await monitor.measure("old_algo", () => oldAlgorithm());
  }
  
  // New algorithm
  for (let i = 0; i < 100; i++) {
    await monitor.measure("new_algo", () => newAlgorithm());
  }
  
  const oldStats = monitor.getStatistics("old_algo");
  const newStats = monitor.getStatistics("new_algo");
  
  expect(newStats.avg).toBeLessThan(oldStats.avg);
  expect(newStats.p95).toBeLessThan(oldStats.p95);
});

// 3. Testing cache effectiveness
test("Cache is faster than database", async () => {
  const monitor = createPerformanceMonitor();
  
  // Cold cache (database)
  await monitor.measure("get_data", async () => {
    return await fetchDataFromDB();
  });
  
  // Warm cache
  await monitor.measure("get_data", async () => {
    return await fetchDataFromCache();
  });
  
  const snapshots = monitor.getSnapshots("get_data");
  expect(snapshots[0].duration).toBeGreaterThan(snapshots[1].duration);
});

// 4. Testing performance under load
test("Performance degrades gracefully under load", async () => {
  const monitor = createPerformanceMonitor();
  
  // Simulate concurrent requests
  await Promise.all(Array.from({ length: 50 }, () =>
    monitor.measure("concurrent_request", () => api.getData())
  ));
  
  const stats = monitor.getStatistics("concurrent_request");
  expect(stats.p99).toBeLessThan(1000); // Even 99th percentile under 1s
});

// 5. Testing performance consistency
test("Performance is consistent across runs", async () => {
  const monitor = createPerformanceMonitor();
  
  for (let i = 0; i < 20; i++) {
    await monitor.measure("stable_operation", () => stableOperation());
  }
  
  const stats = monitor.getStatistics("stable_operation");
  const variance = stats.max - stats.min;
  
  expect(variance).toBeLessThan(stats.avg * 0.5); // Variance under 50% of avg
});
```

**Edge Cases & Gotchas:**

- **Percentile calculation**: Uses array indices, not interpolation
  ```typescript
  // For 100 measurements:
  // p50 = index 49 (50th percentile)
  // p95 = index 94 (95th percentile)
  // p99 = index 98 (99th percentile)
  
  // With only 3 measurements:
  // p50 = index 1 (floor(3 * 0.5))
  // p95 = index 2 (floor(3 * 0.95))
  // p99 = index 2 (floor(3 * 0.99)) - Same as p95!
  ```

- **Statistics return null for missing operations**: No measurements yet
  ```typescript
  const stats = monitor.getStatistics("never_measured");
  expect(stats).toBeNull();
  ```

- **Duration uses performance.now()**: High-resolution timing
  ```typescript
  const { duration } = await monitor.measure("test", async () => {});
  expect(duration).toBeGreaterThan(0); // Sub-millisecond precision
  expect(typeof duration).toBe("number");
  ```

- **Metadata is optional**: Can omit for simple tracking
  ```typescript
  await monitor.measure("simple", () => operation()); // No metadata
  await monitor.measure("detailed", () => operation(), { key: "value" }); // With metadata
  ```

- **start() requires calling end()**: Manual timing
  ```typescript
  const timer = monitor.start("operation");
  await operation();
  timer.end(); // Must call this
  // Forgetting to call end() means no snapshot recorded
  ```

**Performance Considerations:**

- `measure()` is more accurate than manual start/stop for async operations
- Statistics calculation is O(n log n) due to sorting for percentiles
- For high-frequency monitoring (>10,000 ops), consider sampling
- `performance.now()` provides sub-millisecond precision

---

### `assertCompletesWithin(monitor, name, fn, maxMs)`

Asserts that an operation completes within a time limit, automatically measuring and recording.

**Signature:**
```typescript
async function assertCompletesWithin<T>(
  monitor: PerformanceMonitor,
  name: string,
  fn: () => T | Promise<T>,
  maxMs: number
): Promise<T>
```

**Parameters:**
- `monitor: PerformanceMonitor` - Performance monitor instance
- `name: string` - Operation name for tracking
- `fn: () => T | Promise<T>` - Function to measure (sync or async)
- `maxMs: number` - Maximum allowed duration in milliseconds

**Returns:**
- `Promise<T>` - Function result if completes within maxMs, throws otherwise

**Common Usage Patterns:**

```typescript
// 1. Basic timeout assertion
const monitor = createPerformanceMonitor();

const result = await assertCompletesWithin(monitor, "fetchData", async () => {
  return await fetchDataFromAPI();
}, 1000);

// 2. Testing critical path performance
test("Login completes within SLA", async () => {
  const monitor = createPerformanceMonitor();
  
  const session = await assertCompletesWithin(monitor, "login", async () => {
    return await authenticateUser("user", "pass");
  }, 2000);
  
  expect(session.userId).toBe("user");
});

// 3. Testing database query performance
test("Station lookup is fast", async () => {
  const monitor = createPerformanceMonitor();
  
  const station = await assertCompletesWithin(monitor, "lookup_station", async () => {
    return await db.findStation("725");
  }, 100);
  
  expect(station.name).toBe("Times Square");
});

// 4. Testing multiple operations
test("All API endpoints meet SLA", async () => {
  const monitor = createPerformanceMonitor();
  
  await assertCompletesWithin(monitor, "stations", () => api.getStations(), 500);
  await assertCompletesWithin(monitor, "arrivals", () => api.getArrivals(), 500);
  await assertCompletesWithin(monitor, "alerts", () => api.getAlerts(), 500);
});
```

**Edge Cases & Gotchas:**

- **Automatically measures and records**: Snapshot added to monitor
  ```typescript
  await assertCompletesWithin(monitor, "test", async () => {}, 1000);
  expect(monitor.getSnapshots("test")).toHaveLength(1);
  ```

- **Throws Vitest assertion error if exceeds limit**: Not a Promise rejection
  ```typescript
  try {
    await assertCompletesWithin(monitor, "slow", async () => {
      await delay(2000);
    }, 1000);
  } catch (error) {
    expect(error).toBeInstanceOf(Error); // Vitest assertion error
  }
  ```

- **Returns function result**: Can use returned value
  ```typescript
  const result = await assertCompletesWithin(monitor, "compute", () => {
    return 42;
  }, 100);
  
  expect(result).toBe(42);
  ```

---

### `assertMeetsSLO(monitor, name, slo)`

Asserts that performance meets Service Level Objectives (SLO) across multiple measurements using percentiles.

**Signature:**
```typescript
function assertMeetsSLO(
  monitor: PerformanceMonitor,
  name: string,
  slo: {
    maxMs?: number,
    p95Ms?: number,
    p99Ms?: number
  }
): void
```

**Parameters:**
- `monitor: PerformanceMonitor` - Performance monitor instance
- `name: string` - Operation name
- `slo: { maxMs?, p95Ms?, p99Ms? }` - SLO thresholds (all optional)

**Returns:**
- `void` - Throws Vitest assertion error if any threshold exceeded

**Common Usage Patterns:**

```typescript
// 1. Basic SLO check
const monitor = createPerformanceMonitor();

for (let i = 0; i < 100; i++) {
  await monitor.measure("api_call", async () => {
    return await fetchData();
  });
}

assertMeetsSLO(monitor, "api_call", {
  maxMs: 1000,  // No request over 1 second
  p95Ms: 500,   // 95th percentile under 500ms
  p99Ms: 800    // 99th percentile under 800ms
});

// 2. Testing API SLO compliance
test("API meets SLO requirements", async () => {
  const monitor = createPerformanceMonitor();
  
  // Run 100 requests
  for (let i = 0; i < 100; i++) {
    await monitor.measure("get_stations", () => api.getStations());
  }
  
  assertMeetsSLO(monitor, "get_stations", {
    maxMs: 2000,  // Max acceptable latency
    p95Ms: 1000,  // 95% of requests under 1s
    p99Ms: 1500   // 99% of requests under 1.5s
  });
});

// 3. Testing only specific percentiles
test("99th percentile is acceptable", async () => {
  const monitor = createPerformanceMonitor();
  
  for (let i = 0; i < 50; i++) {
    await monitor.measure("operation", () => operation());
  }
  
  // Only check p99, ignore max and p95
  assertMeetsSLO(monitor, "operation", {
    p99Ms: 1000
  });
});

// 4. Testing strict SLO
test("Critical operation meets strict SLO", async () => {
  const monitor = createPerformanceMonitor();
  
  for (let i = 0; i < 1000; i++) {
    await monitor.measure("auth_check", () => auth.checkToken("valid_token"));
  }
  
  assertMeetsSLO(monitor, "auth_check", {
    maxMs: 100,   // Very fast max
    p95Ms: 50,    // Very fast p95
    p99Ms: 75     // Very fast p99
  });
});
```

**Advanced Usage Patterns:**

```typescript
// 1. Testing SLO degradation over time
test("Performance doesn't degrade under sustained load", async () => {
  const monitor = createPerformanceMonitor();
  
  // First 100 requests
  for (let i = 0; i < 100; i++) {
    await monitor.measure("batch1", () => api.getData());
  }
  
  assertMeetsSLO(monitor, "batch1", { p95Ms: 500 });
  
  // Next 100 requests (should be similar)
  for (let i = 0; i < 100; i++) {
    await monitor.measure("batch2", () => api.getData());
  }
  
  assertMeetsSLO(monitor, "batch2", { p95Ms: 500 });
  
  // Compare
  const batch1Stats = monitor.getStatistics("batch1");
  const batch2Stats = monitor.getStatistics("batch2");
  expect(batch2Stats.p95).toBeLessThanOrEqual(batch1Stats.p95 * 1.2); // Within 20%
});

// 2. Testing SLO with outliers
test("SLO allows occasional slow requests", async () => {
  const monitor = createPerformanceMonitor();
  
  // Mostly fast, some slow
  for (let i = 0; i < 95; i++) {
    await monitor.measure("request", () => fastRequest());
  }
  for (let i = 0; i < 5; i++) {
    await monitor.measure("request", () => slowRequest());
  }
  
  // Max allows outliers, p95 ensures most are fast
  assertMeetsSLO(monitor, "request", {
    maxMs: 5000,  // Allow occasional slow request
    p95Ms: 100    // But 95% must be fast
  });
});

// 3. Testing SLO percentiles independently
test("Can validate any combination of percentiles", async () => {
  const monitor = createPerformanceMonitor();
  
  for (let i = 0; i < 100; i++) {
    await monitor.measure("operation", () => operation());
  }
  
  // Check only max, ignore percentiles
  assertMeetsSLO(monitor, "operation", { maxMs: 1000 });
  
  // Check only p95, ignore max and p99
  assertMeetsSLO(monitor, "operation", { p95Ms: 500 });
  
  // Check all three
  assertMeetsSLO(monitor, "operation", {
    maxMs: 1000,
    p95Ms: 500,
    p99Ms: 800
  });
});
```

**Edge Cases & Gotchas:**

- **Throws if getStatistics returns null**: No measurements for operation
  ```typescript
  assertMeetsSLO(monitor, "never_measured", { maxMs: 1000 }); // ❌ Throws
  ```

- **Only checks provided thresholds**: Optional slo properties
  ```typescript
  assertMeetsSLO(monitor, "test", { maxMs: 1000 }); // ✅ Only checks max
  assertMeetsSLO(monitor, "test", { p95Ms: 500 });   // ✅ Only checks p95
  assertMeetsSLO(monitor, "test", {});               // ✅ No checks
  ```

- **Percentile calculation from sorted array**: Uses array indices
  ```typescript
  // For 100 measurements:
  // p95 = durations[94] (95th percentile, 0-indexed)
  // p99 = durations[98] (99th percentile, 0-indexed)
  
  // For small sample sizes, percentiles may overlap
  // For 3 measurements: p50 = [1], p95 = [2], p99 = [2]
  ```

- **All thresholds must pass**: Any failure throws assertion error
  ```typescript
  // If max fails but p95 passes:
  assertMeetsSLO(monitor, "test", {
    maxMs: 100,  // ❌ Actual max is 150
    p95Ms: 1000 // ✅ Actual p95 is 500
  }); // Throws because max failed
  ```

---

## Health Check Testing

### `createMockHealthChecker()`

Creates a mock health checker for system health validation with multiple check support.

**Signature:**
```typescript
function createMockHealthChecker(): MockHealthChecker
```

**Parameters:**
- None

**Returns:**
- `MockHealthChecker` object with:
  - `checks: HealthCheckSnapshot[]` - All check results
  - `register(name, checkFn, details?): { run(): Promise<boolean> }` - Registers health check
  - `getStatus(): "healthy" | "degraded" | "unhealthy"` - Gets overall system health
  - `getChecks(): HealthCheckSnapshot[]` - Gets all check results
  - `clear(): void` - Clears all check results

**HealthCheckSnapshot Interface:**
```typescript
interface HealthCheckSnapshot {
  name: string;
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: number;
  details?: Record<string, unknown>;
}
```

**Common Usage Patterns:**

```typescript
// 1. Basic health check registration
const health = createMockHealthChecker();
const dbCheck = health.register("database", async () => {
  return await pingDatabase();
});

await dbCheck.run();
expect(health.getStatus()).toBe("healthy");

// 2. Multiple health checks
const health = createMockHealthChecker();

const dbCheck = health.register("database", async () => true);
const cacheCheck = health.register("cache", async () => true);
const apiCheck = health.register("external_api", async () => true);

await dbCheck.run();
await cacheCheck.run();
await apiCheck.run();

expect(health.getStatus()).toBe("healthy");
expect(health.getChecks()).toHaveLength(3);

// 3. Handling failing health checks
const health = createMockHealthChecker();

const dbCheck = health.register("database", async () => {
  return await isDatabaseHealthy(); // Returns false
});

await dbCheck.run();
expect(health.getStatus()).toBe("unhealthy");

// 4. Using details for additional context
const health = createMockHealthChecker();

const dbCheck = health.register("database", async () => {
  const latency = await measureDbLatency();
  return {
    healthy: latency < 100,
    details: { latency, connectionCount: 10 }
  };
}, { critical: true });

const result = await dbCheck.run();
const checks = health.getChecks();
expect(checks[0].details?.latency).toBeDefined();
```

**Advanced Usage Patterns:**

```typescript
// 1. Testing health check aggregation
test("System status aggregates all check results", async () => {
  const health = createMockHealthChecker();
  
  const dbCheck = health.register("database", async () => true);
  const cacheCheck = health.register("cache", async () => true);
  const apiCheck = health.register("api", async () => false);
  
  await dbCheck.run();
  await cacheCheck.run();
  await apiCheck.run();
  
  expect(health.getStatus()).toBe("unhealthy"); // One failed
});

// 2. Testing health check retry logic
test("Health checks retry on failure", async () => {
  const health = createMockHealthChecker();
  let attempts = 0;
  
  const flakyCheck = health.register("flaky_service", async () => {
    attempts++;
    return attempts >= 3; // Succeeds on 3rd attempt
  });
  
  for (let i = 0; i < 3; i++) {
    await flakyCheck.run();
  }
  
  expect(health.getChecks()).toHaveLength(3);
  expect(health.getChecks()[2].status).toBe("healthy");
});

// 3. Testing health check with timeout
test("Health checks timeout on slow services", async () => {
  const health = createMockHealthChecker();
  
  const slowCheck = health.register("slow_service", async () => {
    await delay(5000); // Too slow
    return true;
  });
  
  // Should timeout and mark as unhealthy
  const result = await withTimeout(slowCheck.run(), 1000);
  expect(result).toBe(false);
  
  expect(health.getStatus()).toBe("unhealthy");
});
```

**Edge Cases & Gotchas:**

- **Throwing functions marked unhealthy**: Exceptions = unhealthy
  ```typescript
  const throwingCheck = health.register("throws", async () => {
    throw new Error("Service down");
  });
  
  await throwingCheck.run();
  expect(health.getStatus()).toBe("unhealthy");
  ```

- ** getStatus returns "degraded"**: If any check degraded (not implemented in mock, but pattern exists)
  ```typescript
  // In real implementation, degraded = partially functional
  // Mock only supports healthy/unhealthy based on boolean return
  ```

- **No checks = healthy**: Default state
  ```typescript
  const health = createMockHealthChecker();
  expect(health.getStatus()).toBe("healthy"); // No checks = healthy
  ```

---

### `assertHealthCheckPasses(healthChecker, name)`

Asserts that a health check passes, creating a new check with always-true function.

**Signature:**
```typescript
async function assertHealthCheckPasses(
  healthChecker: MockHealthChecker,
  name: string
): Promise<void>
```

**Parameters:**
- `healthChecker: MockHealthChecker` - Mock health checker instance
- `name: string` - Check name

**Returns:**
- `Promise<void>` - Throws Vitest assertion error if check fails

**Common Usage Patterns:**

```typescript
// 1. Basic health check assertion
const health = createMockHealthChecker();

await assertHealthCheckPasses(health, "database");

// 2. Testing health check infrastructure
test("Health check system is functional", async () => {
  const health = createMockHealthChecker();
  
  await assertHealthCheckPasses(health, "test_check");
  expect(health.getStatus()).toBe("healthy");
});
```

**Edge Cases & Gotchas:**

- **Creates new check with `async () => true`**: Not testing actual function
  ```typescript
  await assertHealthCheckPasses(health, "api");
  // Always passes because it creates: health.register("api", async () => true)
  ```

- **Runs the check automatically**: No manual run needed
  ```typescript
  await assertHealthCheckPasses(health, "test");
  // Check already run, just asserts
  ```

---

### `assertSystemHealthy(healthChecker)`

Asserts that the overall system is healthy (no unhealthy checks).

**Signature:**
```typescript
function assertSystemHealthy(
  healthChecker: MockHealthChecker
): void
```

**Parameters:**
- `healthChecker: MockHealthChecker` - Mock health checker instance

**Returns:**
- `void` - Throws Vitest assertion error if system not healthy

**Common Usage Patterns:**

```typescript
// 1. Basic system health assertion
const health = createMockHealthChecker();

const dbCheck = health.register("database", async () => true);
await dbCheck.run();

assertSystemHealthy(health);

// 2. Testing all dependencies
test("All system dependencies are healthy", async () => {
  const health = createMockHealthChecker();
  
  await health.register("database", async () => await isDbHealthy()).run();
  await health.register("cache", async () => await isCacheHealthy()).run();
  await health.register("api", async () => await isApiHealthy()).run();
  
  assertSystemHealthy(health);
});
```

**Edge Cases & Gotchas:**

- **Returns "healthy" if no checks**: Default state
  ```typescript
  const health = createMockHealthChecker();
  assertSystemHealthy(health); // ✅ Passes - no checks = healthy
  ```

- **Throws if any check unhealthy**: All must pass
  ```typescript
  await health.register("db", async () => true).run();
  await health.register("api", async () => false).run();
  
  assertSystemHealthy(health); // ❌ Throws - api check failed
  ```

---

## Integration Helpers

### `createMockObservability()`

Creates a complete observability mock suite with all components (logger, metrics, tracer, performance, health).

**Signature:**
```typescript
function createMockObservability(): {
  logger: MockLogger,
  metrics: MockMetricsRegistry,
  tracer: MockTracer,
  performance: PerformanceMonitor,
  health: MockHealthChecker
}
```

**Parameters:**
- None

**Returns:**
- Object containing all observability mocks

**Common Usage Patterns:**

```typescript
// 1. Basic observability setup
const obs = createMockObservability();

obs.logger.info("Application started");
obs.metrics.counter("startup", "Startup count").inc();
obs.tracer.startSpan("init");
obs.performance.measure("init", () => initialize());

// 2. Testing service with full observability
test("Service uses all observability components", () => {
  const obs = createMockObservability();
  const service = new DataService(obs);
  
  service.loadData();
  
  expect(obs.logger.info).toHaveBeenCalled();
  expect(obs.metrics.counter).toHaveBeenCalled();
  expect(obs.tracer.startSpan).toHaveBeenCalled();
});
```

**Edge Cases & Gotchas:**

- **All mocks are independent**: No cross-coupling
  ```typescript
  obs.logger.info("test");
  obs.metrics.counter("test", "Test").inc();
  // No relationship between logger and metrics
  ```

---

### `setupObservabilityMocks()`

Sets up test environment with observability mocks and additional helper methods.

**Signature:**
```typescript
function setupObservabilityMocks(): ObservabilityMocks
```

**Parameters:**
- None

**Returns:**
- `ObservabilityMocks` object with:
  - All observability mocks (from `createMockObservability()`)
  - `reset(): void` - Resets all mocks to initial state
  - `assertWorking(): void` - Asserts all observability systems are working

**Common Usage Patterns:**

```typescript
// 1. Test setup with lifecycle management
const mocks = setupObservabilityMocks();

// Run tests
mocks.logger.info("Test");
mocks.metrics.counter("test", "Test").inc();

// Assert working
mocks.assertWorking();

// Reset for next test
mocks.reset();

// 2. BeforeEach/AfterEach pattern
let mocks: ObservabilityMocks;

beforeEach(() => {
  mocks = setupObservabilityMocks();
});

afterEach(() => {
  mocks.assertWorking();
  mocks.reset();
});
```

**Edge Cases & Gotchas:**

- **reset() clears all mock state**: Fresh state for next test
  ```typescript
  mocks.logger.info("Test 1");
  mocks.reset();
  expect(mocks.logger.entries).toHaveLength(0);
  ```

- **assertWorking validates infrastructure**: Checks methods exist
  ```typescript
  mocks.assertWorking(); // Verifies all methods are callable
  ```

---

## Real-World Testing Patterns

### End-to-End Observability Testing

```typescript
// Test that all observability systems work together
test("Service integrates with full observability stack", async () => {
  const obs = createMockObservability();
  const service = new StationService(obs);
  
  // Execute operation
  const result = await service.getStation("725");
  
  // Verify logging
  assertLoggerCalled(obs.logger, "info", "Fetching station", { stationId: "725" });
  
  // Verify metrics
  assertCounterIncremented(obs.metrics, "station_requests");
  
  // Verify tracing
  const spans = obs.tracer.getCompletedSpans();
  expect(spans.length).toBeGreaterThan(0);
  expect(spans[0].name).toBe("fetch_station");
  
  // Verify performance
  const stats = obs.performance.getStatistics("get_station");
  expect(stats).not.toBeNull();
  expect(stats!.avg).toBeLessThan(1000);
});
```

### Performance Regression Testing

```typescript
// Test that performance doesn't degrade
test("Performance regression detection", async () => {
  const monitor = createPerformanceMonitor();
  
  // Baseline measurement
  for (let i = 0; i < 100; i++) {
    await monitor.measure("baseline", () => oldImplementation());
  }
  
  const baselineStats = monitor.getStatistics("baseline");
  
  // New implementation
  for (let i = 0; i < 100; i++) {
    await monitor.measure("new", () => newImplementation());
  }
  
  const newStats = monitor.getStatistics("new");
  
  // Assert new is faster or same
  expect(newStats.avg).toBeLessThanOrEqual(baselineStats.avg);
  expect(newStats.p95).toBeLessThanOrEqual(baselineStats.p95);
});
```

### SLA Compliance Testing

```typescript
// Test that operations meet SLA requirements
test("SLA compliance across all endpoints", async () => {
  const monitor = createPerformanceMonitor();
  
  // Test all critical endpoints
  const endpoints = [
    { name: "stations", fn: () => api.getStations() },
    { name: "arrivals", fn: () => api.getArrivals() },
    { name: "alerts", fn: () => api.getAlerts() }
  ];
  
  for (const endpoint of endpoints) {
    for (let i = 0; i < 100; i++) {
      await monitor.measure(endpoint.name, endpoint.fn);
    }
    
    assertMeetsSLO(monitor, endpoint.name, {
      maxMs: 2000,
      p95Ms: 1000,
      p99Ms: 1500
    });
  }
});
```

### Error Handling with Observability

```typescript
// Test that errors are properly observed
test("Errors are logged and traced", async () => {
  const obs = createMockObservability();
  const service = new ApiService(obs);
  
  try {
    await service.fetchStation("invalid");
  } catch {
    // Expected to throw
  }
  
  // Verify error logging
  assertLoggerCalled(obs.logger, "error", "Failed to fetch station");
  
  // Verify error tracing
  const errorSpans = obs.tracer.getCompletedSpans().filter(
    s => s.status?.code === 1
  );
  expect(errorSpans.length).toBeGreaterThan(0);
  
  // Verify error metrics
  assertCounterIncremented(obs.metrics, "api_errors");
});
```

---

## Best Practices

### 1. Test Setup

```typescript
// Use setupObservabilityMocks for comprehensive setup
const obs = setupObservabilityMocks();

// Clean up between tests
afterEach(() => {
  obs.reset();
});
```

### 2. Granular Assertions

```typescript
// Test specific observability aspects
assertLoggerCalled(logger, "info", "Operation completed");
assertCounterIncremented(metrics, "operations", 5);
assertSpanCompletedWithin(span, 1000);
```

### 3. Realistic Thresholds

```typescript
// Use realistic thresholds based on production data
assertMeetsSLO(monitor, "api_call", {
  maxMs: 2000,   // Based on p99 in production
  p95Ms: 1000,   // Based on p95 in production
  p99Ms: 1500    // Slightly above production p99
});
```

### 4. Comprehensive Coverage

```typescript
// Test all observability aspects together
test("Full observability integration", async () => {
  const obs = createMockObservability();
  
  await operationUnderTest(obs);
  
  // Check all aspects
  obs.logger.info("Called");
  assertCounterIncremented(obs.metrics, "operations");
  expect(obs.tracer.getCompletedSpans()).toHaveLength(1);
  expect(obs.performance.getStatistics("operation")).not.toBeNull();
});
```

---

## Summary

This comprehensive guide provides detailed documentation for all observability testing helpers including:

- **Logger Mocking**: Full-featured mock logger with entry capture and filtering
- **Metrics Testing**: Counter, gauge, and histogram metrics with snapshot tracking
- **Tracing**: Distributed tracing with span hierarchy and attribute support
- **Performance Monitoring**: Execution time measurement with statistics and SLO validation
- **Health Checks**: System health validation with multiple check support
- **Integration Helpers**: Complete observability stack setup

Each helper includes:
- Detailed parameter and return type documentation
- Common usage patterns showing real-world scenarios
- Advanced usage patterns for complex testing situations
- Edge cases and gotchas to avoid common pitfalls
- Performance considerations for high-frequency testing

Use these helpers to build comprehensive observability tests that ensure your application's monitoring, logging, and performance tracking systems work correctly.