# Cross-Cutting Concerns

This document describes the cross-cutting concerns that span the entire MTA My Way application: testing, security, observability, and data migration.

## Overview

Cross-cutting concerns are aspects of a system that affect multiple components and cannot be cleanly encapsulated within a single module. For MTA My Way, these include:

- **Testing**: Comprehensive test coverage across all layers
- **Security**: Protection against common vulnerabilities
- **Observability**: Logging, metrics, and tracing
- **Data Migration**: Safe database and store schema evolution

## Testing

### Test Organization

```
packages/
├── shared/src/testing/
│   ├── test-helpers.ts       # General test utilities
│   ├── security-helpers.ts   # Security testing helpers
│   └── observability-helpers.ts  # Observability testing helpers
├── server/src/
│   ├── **/*.test.ts           # Server unit tests
│   └── security/
│       └── cross-cutting.test.ts  # Security test suite
├── web/src/
│   └── **/*.test.tsx          # React component tests
└── tests/e2e/
    └── *.e2e.ts               # End-to-end tests
```

### Test Utilities

#### General Test Helpers (`@mta-my-way/shared/testing/test-helpers`)

Common utilities for all tests:

```typescript
import {
  createMockStation,
  createMockArrival,
  createMockAlert,
  createTestFixture,
  createMockLogger,
  createMockDatabase,
  createMockResponse,
  setupTestEnvironment,
  cleanupTestEnvironment,
} from "@mta-my-way/shared/testing/test-helpers";
```

**Key Features:**
- Mock data generators for all domain objects
- Test fixtures with related data
- Mock logger, database, and fetch
- Test environment setup/teardown
- Assertion helpers

#### Security Test Helpers (`@mta-my-way/shared/testing/security-helpers`)

Security-specific testing utilities:

```typescript
import {
  createMockApiKey,
  createMockAuthToken,
  createMockCsrfToken,
  MALICIOUS_INPUTS,
  createMockSecurityContext,
  assertSanitized,
  assertHasSecurityHeaders,
  assertRateLimitEnforced,
} from "@mta-my-way/shared/testing/security-helpers";
```

**Key Features:**
- Mock authentication and authorization objects
- Malicious input patterns for testing
- Security context mocking
- Security assertion helpers

#### Observability Test Helpers (`@mta-my-way/shared/testing/observability-helpers`)

Testing utilities for observability:

```typescript
import {
  createMockLogger,
  createMockMetricsRegistry,
  createMockTracer,
  createPerformanceMonitor,
  assertLoggerCalled,
  assertCounterIncremented,
  assertSpanCompletedWithin,
  assertMeetsSLO,
} from "@mta-my-way/shared/testing/observability-helpers";
```

**Key Features:**
- Mock logger with entry capture
- Mock metrics registry
- Mock tracer for span testing
- Performance measurement utilities

### Test Coverage Goals

| Layer | Target Coverage | Status |
|-------|----------------|--------|
| Server | 80%+ | ✅ |
| Web | 80%+ | ✅ |
| Shared | 90%+ | ✅ |
| E2E | Critical paths | ✅ |

## Security

### Security Architecture

The security model follows defense-in-depth with multiple layers:

1. **Network Layer** (Cloudflare)
   - DDoS protection
   - Rate limiting (100 req/min per IP)
   - Bot detection

2. **Application Layer** (Hono middleware)
   - Input validation (Zod schemas)
   - Rate limiting (60 req/min per IP)
   - CSRF protection
   - Security headers

3. **Data Layer** (SQLite)
   - Parameterized queries
   - Encrypted sensitive data
   - Access controls

### Security Middleware

| Middleware | Purpose | Location |
|------------|---------|----------|
| `security-headers.ts` | CSP, HSTS, X-Frame-Options | `packages/server/src/middleware/` |
| `rate-limiter.ts` | Request rate limiting | `packages/server/src/middleware/` |
| `csrf-protection.ts` | CSRF token validation | `packages/server/src/middleware/` |
| `input-sanitization.ts` | Input cleaning | `packages/server/src/middleware/` |
| `api-key-management.ts` | API key authentication | `packages/server/src/middleware/` |

### Security Testing

The cross-cutting security test suite (`cross-cutting.test.ts`) covers:

- **Input Validation**: SQL injection, XSS, path traversal, command injection
- **CSRF Protection**: Token generation and validation
- **Rate Limiting**: Request counting and window reset
- **Security Headers**: Required headers present and correct
- **Authentication**: API key and session validation
- **Authorization**: Permission checking
- **Data Protection**: Sensitive data redaction

Run security tests:

```bash
npm run test -- packages/server/src/security/cross-cutting.test.ts
```

### Malicious Input Testing

The security helpers provide a comprehensive set of malicious input patterns:

```typescript
import { MALICIOUS_INPUTS } from "@mta-your-way/shared/testing/security-helpers";

// Test against all patterns
for (const pattern of MALICIOUS_INPUTS.sqlInjection) {
  // Test SQL injection prevention
}
```

## Observability

### Observability Stack

| Component | Purpose | Implementation |
|-----------|---------|----------------|
| **Structured Logging** | JSON logs with context | `packages/server/src/observability/logger.ts` |
| **Metrics** | Counters, gauges, histograms | `packages/server/src/observability/metrics.ts` |
| **Distributed Tracing** | Request tracing | `packages/server/src/observability/tracing.ts` |
| **Health Checks** | System status | `/health` endpoint |
| **Metrics Export** | Prometheus scraping | `/metrics` endpoint |

### Logging

**Logger API:**

```typescript
import { logger } from "./observability/logger.js";

logger.debug("Debug message", { context: "value" });
logger.info("Info message", { metadata: "value" });
logger.warn("Warning message", { issue: "description" });
logger.error("Error message", error, { context: "value" });
```

**Features:**
- JSON-formatted logs
- Automatic sensitive data redaction
- Trace ID integration
- Child logger creation

### Metrics

**Metrics API:**

```typescript
import {
  httpRequestsTotal,
  httpRequestDuration,
  cacheHits,
  feedPollDuration,
  pushNotificationsSent,
} from "./observability/metrics.js";

// Counter
httpRequestsTotal.inc({ method: "GET", route: "/api/stations", status: 200 });

// Gauge
activeConnections.set(42);

// Histogram
httpRequestDuration.observe(0.123, { route: "/api/stations" });
```

**Available Metrics:**

| Metric | Type | Labels |
|--------|------|--------|
| `http_requests_total` | Counter | method, route, status |
| `http_request_duration_seconds` | Histogram | method, route, status |
| `cache_hits_total` | Counter | - |
| `cache_misses_total` | Counter | - |
| `feed_poll_duration_seconds` | Histogram | - |
| `feed_errors_total` | Counter | feed |
| `push_notifications_sent_total` | Counter | - |
| `push_notifications_failed_total` | Counter | - |

### Tracing

**Tracer API:**

```typescript
import { tracer, withChildSpan } from "./observability/tracing.js";

// Manual span creation
const span = tracer.startSpan("operation-name");
try {
  // Do work
  span.setAttributes({ key: "value" });
} finally {
  tracer.endSpan();
}

// Automatic span wrapping
await withChildSpan("operation-name", async () => {
  // Work here is traced
});
```

**Features:**
- W3C tracecontext format
- Async context tracking
- HTTP request/response propagation
- Integration with logging

### Metrics Export Endpoint

The `/metrics` endpoint exports all metrics in Prometheus text format:

```bash
curl http://localhost:3001/metrics
```

Response:
```
# HELP http_requests_total Total HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",route="/api/stations",status="200"} 1234
```

## Data Migration

### Migration Systems

MTA My Way uses two separate migration systems:

#### Server-Side Migrations

**Location:** `packages/server/src/migration/`

**Features:**
- Version tracking with `_migrations` table
- Dry-run mode for preview
- Pre-migration backup
- Migration locking
- Rollback support
- Data validation

**Migration Structure:**

```typescript
// 019-add-feature.ts
export const description = "Add new feature";

export function up(db: Database.Database): void {
  db.exec(`
    CREATE TABLE new_feature (
      id TEXT PRIMARY KEY,
      data TEXT
    )
  `);
}

export function down(db: Database.Database): void {
  db.exec(`DROP TABLE new_feature`);
}

export function validate(db: Database.Database): { valid: boolean; errors?: string[] } {
  const info = db.pragma("table_info(new_feature)");
  return {
    valid: info.length > 0,
    errors: info.length === 0 ? ["Table not found"] : [],
  };
}
```

#### Client-Side Migrations

**Location:** `packages/web/src/stores/migration.ts`

**Features:**
- Version tracking via Zustand persist
- Automatic backup before migration
- Sequential migration
- Error handling with restore
- Migration failed flag

**Migration Pattern:**

```typescript
import { createSafeMigration } from "./migration";

const migrations = new Map<number, (state: unknown) => unknown>([
  [2, (state) => ({
    ...state,
    newField: "defaultValue",
  })],
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

### Migration CLI

The migration CLI provides commands for database management:

```bash
# Apply pending migrations
npm run migrate:up

# Rollback migrations
npm run migrate:down

# Check migration status
npm run migrate:status

# Create new migration
npm run migrate:create <name>

# Validate database
npm run migrate:validate

# Create backup
npm run migrate:backup

# List backups
npm run migrate:backups

# Restore from backup
npm run migrate:restore <backup>

# Cleanup old backups
npm run migrate:cleanup
```

### Migration Best Practices

1. **Always provide both `up` and `down` functions**
2. **Use transactions** for atomic schema changes
3. **Write tests** for both up and down migrations
4. **Add validation** to verify post-migration state
5. **Number sequentially** (e.g., `019-*.ts`)
6. **Test migrations** in development before production
7. **Create backups** before applying migrations
8. **Document breaking changes** in migration descriptions

## Integration

### Putting It All Together

The cross-cutting concerns work together to provide a robust, observable, secure application:

```typescript
import { Hono } from "hono";
import { logger } from "./observability/logger.js";
import { metrics, metricsMiddleware } from "./observability/metrics.js";
import { tracingMiddleware } from "./observability/tracing.js";

const app = new Hono();

// Add observability middleware
app.use("*", metricsMiddleware);
app.use("*", tracingMiddleware);

// Add security middleware
app.use("*", securityHeaders);
app.use("*", rateLimiter);

// API routes
app.get("/api/stations", async (c) => {
  logger.info("Fetching stations", { count: 10 });

  const span = tracer.startSpan("fetch-stations");
  try {
    const stations = await fetchStations();
    span.endSpan({ stationCount: stations.length });
    return c.json({ stations });
  } catch (error) {
    span.setStatus(1, error.message);
    span.endSpan();
    throw error;
  }
});

// Metrics endpoint
app.get("/metrics", metricsHandler);
```

## CI/CD Integration

### Testing Pipeline

```yaml
# .github/workflows/ci.yml
- name: Run tests
  run: |
    npm run test

- name: Run security tests
  run: |
    npm run test -- packages/server/src/security/cross-cutting.test.ts

- name: Run E2E tests
  run: |
    cd tests/e2e && npm test

- name: Check migration status
  run: |
    npm run migrate:status

- name: Validate database schema
  run: |
    npm run migrate:validate
```

### Quality Gates

- All tests must pass before merge
- Security tests must have 100% pass rate
- Coverage thresholds must be met
- Migrations must be tested
- No high-severity security vulnerabilities

## Monitoring in Production

### Health Endpoint

The `/health` endpoint provides system status:

```bash
curl http://localhost:3001/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2026-05-14T12:34:56.789Z",
  "uptime": 123456,
  "feeds": {
    "1": { "status": "ok", "lastUpdate": "8s ago" },
    "L": { "status": "stale", "lastUpdate": "5m ago" }
  },
  "metrics": {
    "activeConnections": 42,
    "memoryUsage": "123MB"
  }
}
```

### Metrics Endpoint

The `/metrics` endpoint provides Prometheus-compatible metrics:

```bash
curl http://localhost:3001/metrics
```

### Alerting Rules

Configure alerts for:

- **High error rate**: errors > 1% of requests
- **High latency**: p95 > 1s
- **Feed staleness**: no update > 5 minutes
- **Low push success rate**: < 90%
- **High memory usage**: > 1GB
- **Security events**: rate limit bans, auth failures

## Documentation

| Document | Purpose |
|----------|---------|
| [Testing Guide](./testing.md) | Comprehensive testing documentation |
| [Observability Guide](./observability.md) | Logging, metrics, tracing details |
| [Data Migration Guide](./data-migration.md) | Migration procedures and best practices |
| [Security Guide](./security.md) | Security architecture and policies |

## Best Practices

### Testing
1. Test behavior, not implementation
2. Keep tests independent
3. Use descriptive test names
4. Mock external dependencies
5. Clean up side effects
6. Test edge cases

### Security
1. Never trust user input
2. Use parameterized queries
3. Implement defense-in-depth
4. Keep dependencies updated
5. Log security events
6. Test security controls

### Observability
1. Use structured logging
2. Include request IDs
3. Track key metrics
4. Use distributed tracing
5. Set up alerting
6. Monitor system health

### Data Migration
1. Always backup before migration
2. Test migrations thoroughly
3. Provide rollback path
4. Validate post-migration state
5. Monitor migration execution
6. Document breaking changes
