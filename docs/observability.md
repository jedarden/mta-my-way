# Observability Guide

This document describes the observability stack for MTA My Way, including logging, metrics, and tracing.

## Overview

MTA My Way implements a comprehensive observability stack:

1. **Structured Logging**: JSON-formatted logs with contextual metadata
2. **Metrics Collection**: Counters, gauges, and histograms for system performance
3. **Distributed Tracing**: Request tracing for performance debugging

## Logging

### Logger API

The logger is available at `packages/server/src/observability/logger.ts`:

```typescript
import { logger } from "./observability/logger.js";

// Log levels
logger.debug("Debug message", { context: "value" });
logger.info("Info message", { metadata: "value" });
logger.warn("Warning message", { issue: "description" });
logger.error("Error message", error, { context: "value" });
```

### Log Format

Logs are emitted as JSON for easy parsing:

```json
{
  "level": "info",
  "message": "Server started",
  "timestamp": "2026-05-14T12:34:56.789Z",
  "context": {
    "port": 3001,
    "pid": 12345
  }
}
```

### Log Levels

| Level | Usage | Example |
|-------|-------|---------|
| `debug` | Detailed diagnostic info | Function entry/exit, variable values |
| `info` | Normal operational events | Server startup, request completion |
| `warn` | Warning conditions | Deprecated feature usage, high latency |
| `error` | Error events | Failed requests, exceptions |

### Creating Loggers

Create category-specific loggers:

```typescript
import { createLogger } from "./observability/logger.js";

const feedLogger = createLogger("feed-poller");
feedLogger.info("Polling feed", { feed: "L" });
```

### Logging Best Practices

1. **Use structured data**: Pass objects as context, not formatted strings
2. **Include request IDs**: Add `requestId` to all request-related logs
3. **Log at appropriate levels**: Don't log errors as warnings
4. **Avoid sensitive data**: Never log passwords, tokens, or PII

## Metrics

### Metrics API

Metrics are available at `packages/server/src/observability/metrics.ts`:

```typescript
import { metrics } from "./observability/metrics.js";

// Counters (monotonically increasing)
metrics.httpRequestsTotal.inc({
  method: "GET",
  route: "/api/stations",
  status: 200
});

// Gauges (up/down values)
metrics.activeConnections.set(42);

// Histograms (distributions)
metrics.httpRequestDuration.observe(123, {
  route: "/api/stations"
});
```

### Available Metrics

#### HTTP Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `httpRequestsTotal` | Counter | Total HTTP requests |
| `httpRequestDuration` | Histogram | Request duration (ms) |
| `httpRequestSize` | Histogram | Request size (bytes) |
| `httpResponseSize` | Histogram | Response size (bytes) |
| `activeConnections` | Gauge | Active HTTP connections |

#### Cache Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `cacheHits` | Counter | Cache hits |
| `cacheMisses` | Counter | Cache misses |

#### Feed Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `feedPollDuration` | Histogram | Feed poll duration (ms) |
| `feedErrors` | Counter | Feed parsing errors |
| `feedEntitiesProcessed` | Counter | GTFS-RT entities processed |

#### Push Notification Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `pushNotificationsSent` | Counter | Push notifications sent |
| `pushNotificationsFailed` | Counter | Push notifications failed |
| `pushSubscriptionsActive` | Gauge | Active push subscriptions |

#### Trip Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `tripsCreated` | Counter | Trips created |
| `tripsActive` | Gauge | Active trips |
| `tripsQueried` | Counter | Trip lookups |
| `tripQueryDuration` | Histogram | Trip query duration (ms) |

#### Commute Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `commuteAnalysisRequests` | Counter | Commute analysis requests |
| `commuteAnalysisDuration` | Histogram | Analysis duration (ms) |

#### Station Search Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `stationSearchRequests` | Counter | Station searches |
| `stationSearchDuration` | Histogram | Search duration (ms) |
| `stationSearchResults` | Gauge | Number of results |

#### Delay Prediction Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `delayPredictionRequests` | Counter | Delay predictions |
| `delayPredictionDuration` | Histogram | Prediction duration (ms) |
| `delayPredictionAccuracy` | Gauge | Prediction accuracy |

#### Context Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `contextDetections` | Counter | Context detections |
| `contextTransitions` | Counter | Context transitions |
| `contextOverrides` | Counter | Manual context overrides |

#### Alert Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `alertsActive` | Gauge | Active alerts |
| `alertsMatchRate` | Gauge | Alert match rate |
| `alertsChanges` | Counter | Alert changes detected |

#### Equipment Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `equipmentOutages` | Gauge | Total equipment outages |
| `equipmentElevatorsOut` | Gauge | Elevators out of service |
| `equipmentEscalatorsOut` | Gauge | Escalators out of service |

### Metric Labels

Metrics use labels for dimensional data:

```typescript
metrics.httpRequestsTotal.inc({
  method: "GET",      // HTTP method
  route: "/api/*",    // Route pattern
  status: 200         // HTTP status code
});
```

### Metrics Middleware

The metrics middleware automatically tracks HTTP requests:

```typescript
import { metricsMiddleware } from "./observability/metrics.js";

app.use(metricsMiddleware);
```

## Tracing

### Tracer API

Distributed tracing is available at `packages/server/src/observability/tracing.ts`:

```typescript
import { tracer, withChildSpan, recordEvent } from "./observability/tracing.js";

// Create a span
const span = tracer.startSpan("operation-name");
try {
  // Do work
  span.setAttributes({ key: "value" });
} finally {
  span.end();
}

// Wrap a function
await withChildSpan("operation-name", async () => {
  // Work here is traced
});

// Record an event
recordEvent("event-name", { detail: "value" });
```

### Tracing Middleware

Add tracing middleware to Hono apps:

```typescript
import { tracingMiddleware } from "./observability/tracing.js";

app.use(tracingMiddleware);
```

### Client-Side Tracing

Client-side performance tracking is in `packages/web/src/lib/tracing.ts`:

```typescript
import { trackPerformance, markAndMeasure } from "./lib/tracing";

// Track performance marks
markAndMeasure("feature-load", ["start", "end"]);

// Track Web Vitals
trackPerformance((metric) => {
  console.log(metric.name, metric.value);
});
```

## Health Endpoint

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
    "1": { "status": "ok", "lastUpdate": "2026-05-14T12:30:00Z" },
    "2": { "status": "ok", "lastUpdate": "2026-05-14T12:30:00Z" },
    "L": { "status": "stale", "lastUpdate": "2026-05-14T12:25:00Z" }
  },
  "errors": [
    { "feed": "L", "error": "Feed parse error", "timestamp": "2026-05-14T12:25:00Z" }
  ],
  "metrics": {
    "activeConnections": 42,
    "memoryUsage": "123MB",
    "cpuUsage": "5%"
  }
}
```

## Observability in Development

### Viewing Logs

Logs are written to stdout. Use journalctl or docker logs:

```bash
# For systemd service
journalctl -u mta-my-way -f

# For Docker
docker logs -f mta-my-way
```

### Viewing Metrics

Metrics are exposed in the health endpoint:

```bash
curl http://localhost:3001/health | jq .metrics
```

### Debug Mode

Enable debug logging:

```bash
LOG_LEVEL=debug npm start
```

## Production Considerations

### Log Aggregation

In production, logs should be aggregated to a centralized service:

- **Cloudflare**: Logs available in dashboard
- **Self-hosted**: Use Loki, Elasticsearch, or CloudWatch

### Metrics Export

Metrics can be exported to external systems:

- **Prometheus**: Use `/metrics` endpoint (not yet implemented)
- **Datadog**: Use Datadog agent
- **CloudWatch**: Use CloudWatch agent

### Alerting

Set up alerts for:

- High error rates (errors > 1% of requests)
- High latency (p95 > 1s)
- Feed staleness (no update > 5 minutes)
- Low push notification success rate (< 90%)
- High memory usage (> 1GB)

## Testing Observability

### Mocking Logger

```typescript
import { vi } from "vitest";
import { logger } from "./observability/logger.js";

vi.spyOn(logger, "info").mockReturnValue(undefined);
```

### Mocking Metrics

```typescript
import { vi } from "vitest";
import { metrics } from "./observability/metrics.js";

vi.spyOn(metrics.httpRequestsTotal, "inc").mockReturnValue(undefined);
```

### Testing Logs

```typescript
expect(logger.info).toHaveBeenCalledWith(
  "Expected message",
  expect.objectContaining({ key: "value" })
);
```
