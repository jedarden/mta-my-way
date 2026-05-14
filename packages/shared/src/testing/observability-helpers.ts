/**
 * Observability testing utilities for MTA My Way.
 *
 * Provides helpers for testing logging, metrics, and tracing:
 * - Mock logger with spy capabilities
 * - Metrics testing helpers
 * - Tracing test utilities
 * - Performance measurement helpers
 */

import { vi } from "vitest";

// ============================================================================
// Logger Mocking
// ============================================================================

export interface LogEntry {
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

/**
 * Create a mock logger that captures all log entries.
 */
export function createMockLogger() {
  const entries: LogEntry[] = [];

  return {
    entries,

    debug: vi.fn((message: string, context?: Record<string, unknown>) => {
      entries.push({ level: "debug", message, context });
    }),

    info: vi.fn((message: string, context?: Record<string, unknown>) => {
      entries.push({ level: "info", message, context });
    }),

    warn: vi.fn((message: string, context?: Record<string, unknown>) => {
      entries.push({ level: "warn", message, context });
    }),

    error: vi.fn((
      message: string,
      error?: Error,
      context?: Record<string, unknown>
    ) => {
      entries.push({
        level: "error",
        message,
        context,
        error: error ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        } : undefined,
      });
    }),

    child: vi.fn((additionalContext: Record<string, unknown>) => {
      return createMockLogger();
    }),

    /**
     * Clear all captured log entries.
     */
    clear() {
      entries.length = 0;
    },

    /**
     * Get all log entries at a specific level.
     */
    getEntriesAtLevel(level: LogEntry["level"]): LogEntry[] {
      return entries.filter((e) => e.level === level);
    },

    /**
     * Get all log entries containing a specific message.
     */
    getEntriesWithMessage(message: string): LogEntry[] {
      return entries.filter((e) => e.message.includes(message));
    },

    /**
     * Get the most recent log entry.
     */
    getLastEntry(): LogEntry | undefined {
      return entries[entries.length - 1];
    },
  };
}

/**
 * Assert that a logger was called with specific parameters.
 */
export function assertLoggerCalled(
  mockLogger: ReturnType<typeof createMockLogger>,
  level: LogEntry["level"],
  message: string,
  context?: Record<string, unknown>
): void {
  const levelFn = mockLogger[level];
  expect(levelFn).toHaveBeenCalled();

  if (context) {
    expect(levelFn).toHaveBeenCalledWith(message, expect.objectContaining(context));
  } else {
    expect(levelFn).toHaveBeenCalledWith(message, expect.anything());
  }
}

/**
 * Assert that a logger was NOT called.
 */
export function assertLoggerNotCalled(
  mockLogger: ReturnType<typeof createMockLogger>,
  level: LogEntry["level"]
): void {
  expect(mockLogger[level]).not.toHaveBeenCalled();
}

// ============================================================================
// Metrics Testing
// ============================================================================

export interface MetricSnapshot {
  type: "counter" | "gauge" | "histogram";
  name: string;
  value: number;
  labels?: Record<string, string>;
  timestamp: number;
}

/**
 * Create a mock metrics registry.
 */
export function createMockMetricsRegistry() {
  const metrics = new Map<string, MetricSnapshot[]>();

  return {
    metrics,

    /**
     * Create or get a counter metric.
     */
    counter: vi.fn((name: string, help: string) => {
      if (!metrics.has(name)) {
        metrics.set(name, []);
      }
      return {
        inc: vi.fn((amount = 1, labels = {}) => {
          metrics.get(name)!.push({
            type: "counter",
            name,
            value: amount,
            labels,
            timestamp: Date.now(),
          });
        }),
        reset: vi.fn((labels = {}) => {
          const entries = metrics.get(name)!;
          if (Object.keys(labels).length === 0) {
            entries.length = 0;
          } else {
            const filtered = entries.filter((e) => {
              if (!e.labels) return false;
              return Object.entries(labels).some(([k, v]) => e.labels![k] !== v);
            });
            metrics.set(name, filtered);
          }
        }),
      };
    }),

    /**
     * Create or get a gauge metric.
     */
    gauge: vi.fn((name: string, help: string) => {
      if (!metrics.has(name)) {
        metrics.set(name, []);
      }
      return {
        set: vi.fn((value: number, labels = {}) => {
          metrics.get(name)!.push({
            type: "gauge",
            name,
            value,
            labels,
            timestamp: Date.now(),
          });
        }),
        inc: vi.fn((amount = 1, labels = {}) => {
          metrics.get(name)!.push({
            type: "gauge",
            name,
            value: amount,
            labels,
            timestamp: Date.now(),
          });
        }),
        dec: vi.fn((amount = 1, labels = {}) => {
          metrics.get(name)!.push({
            type: "gauge",
            name,
            value: -amount,
            labels,
            timestamp: Date.now(),
          });
        }),
      };
    }),

    /**
     * Create or get a histogram metric.
     */
    histogram: vi.fn((name: string, help: string, buckets: number[] = []) => {
      if (!metrics.has(name)) {
        metrics.set(name, []);
      }
      return {
        observe: vi.fn((value: number, labels = {}) => {
          metrics.get(name)!.push({
            type: "histogram",
            name,
            value,
            labels,
            timestamp: Date.now(),
          });
        }),
        reset: vi.fn((labels = {}) => {
          const entries = metrics.get(name)!;
          if (Object.keys(labels).length === 0) {
            entries.length = 0;
          } else {
            const filtered = entries.filter((e) => {
              if (!e.labels) return false;
              return Object.entries(labels).some(([k, v]) => e.labels![k] !== v);
            });
            metrics.set(name, filtered);
          }
        }),
      };
    }),

    /**
     * Get all metric snapshots.
     */
    getSnapshots(): MetricSnapshot[] {
      return Array.from(metrics.values()).flat();
    },

    /**
     * Get snapshots for a specific metric.
     */
    getMetricSnapshots(name: string): MetricSnapshot[] {
      return metrics.get(name) ?? [];
    },

    /**
     * Get the current value of a metric.
     */
    getMetricValue(name: string): number {
      const snapshots = this.getMetricSnapshots(name);
      if (snapshots.length === 0) return 0;

      const type = snapshots[0].type;
      if (type === "counter" || type === "histogram") {
        return snapshots.reduce((sum, s) => sum + s.value, 0);
      }
      // Gauge - return the last value
      return snapshots[snapshots.length - 1].value;
    },

    /**
     * Clear all metrics.
     */
    clear(): void {
      metrics.clear();
    },
  };
}

/**
 * Assert that a counter was incremented.
 */
export function assertCounterIncremented(
  mockMetrics: ReturnType<typeof createMockMetricsRegistry>,
  metricName: string,
  expectedValue?: number
): void {
  const snapshots = mockMetrics.getMetricSnapshots(metricName);
  expect(snapshots.length).toBeGreaterThan(0);

  if (expectedValue !== undefined) {
    const actualValue = mockMetrics.getMetricValue(metricName);
    expect(actualValue).toBe(expectedValue);
  }
}

/**
 * Assert that a gauge was set to a specific value.
 */
export function assertGaugeSet(
  mockMetrics: ReturnType<typeof createMockMetricsRegistry>,
  metricName: string,
  expectedValue: number
): void {
  const snapshots = mockMetrics.getMetricSnapshots(metricName);
  expect(snapshots.length).toBeGreaterThan(0);

  const lastValue = snapshots[snapshots.length - 1].value;
  expect(lastValue).toBe(expectedValue);
}

/**
 * Assert that a histogram observed a value.
 */
export function assertHistogramObserved(
  mockMetrics: ReturnType<typeof createMockMetricsRegistry>,
  metricName: string,
  expectedValues?: number[]
): void {
  const snapshots = mockMetrics.getMetricSnapshots(metricName);
  expect(snapshots.length).toBeGreaterThan(0);

  if (expectedValues) {
    expect(snapshots.map((s) => s.value)).toEqual(expectedValues);
  }
}

// ============================================================================
// Tracing Testing
// ============================================================================

export interface SpanSnapshot {
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

/**
 * Create a mock tracer.
 */
export function createMockTracer() {
  const spans: SpanSnapshot[] = [];
  const activeSpans: SpanSnapshot[] = [];

  return {
    spans,
    activeSpans,

    /**
     * Generate a random trace ID.
     */
    generateTraceId: vi.fn(() => {
      return Array.from({ length: 16 }, () =>
        Math.floor(Math.random() * 256)
          .toString(16)
          .padStart(2, "0")
      ).join("");
    }),

    /**
     * Generate a random span ID.
     */
    generateSpanId: vi.fn(() => {
      return Array.from({ length: 8 }, () =>
        Math.floor(Math.random() * 256)
          .toString(16)
          .padStart(2, "0")
      ).join("");
    }),

    /**
     * Start a new span.
     */
    startSpan: vi.fn((name: string, parentContext?: { traceId?: string; spanId?: string }) => {
      const traceId = parentContext?.traceId ?? this.generateTraceId();
      const spanId = this.generateSpanId();

      const span: SpanSnapshot = {
        traceId,
        spanId,
        parentSpanId: parentContext?.spanId,
        name,
        startTime: Date.now(),
        endTime: 0,
        duration: 0,
        attributes: {},
      };

      activeSpans.push(span);
      return span;
    }),

    /**
     * End the current active span.
     */
    endSpan: vi.fn((attributes?: Record<string, string | number | boolean>) => {
      const span = activeSpans.pop();
      if (!span) return null;

      span.endTime = Date.now();
      span.duration = span.endTime - span.startTime;
      if (attributes) {
        span.attributes = { ...span.attributes, ...attributes };
      }

      spans.push(span);
      return span;
    }),

    /**
     * Get the current active span.
     */
    activeSpan: vi.fn(() => {
      return activeSpans[activeSpans.length - 1] ?? null;
    }),

    /**
     * Add an event to the current span.
     */
    addEvent: vi.fn((name: string, attributes?: Record<string, unknown>) => {
      const span = activeSpans[activeSpans.length - 1];
      if (span) {
        span.attributes = { ...span.attributes, ...attributes };
      }
    }),

    /**
     * Set an attribute on the current span.
     */
    setAttribute: vi.fn((key: string, value: string | number | boolean) => {
      const span = activeSpans[activeSpans.length - 1];
      if (span) {
        span.attributes[key] = value;
      }
    }),

    /**
     * Set the status of the current span.
     */
    setStatus: vi.fn((code: number, message?: string) => {
      const span = activeSpans[activeSpans.length - 1];
      if (span) {
        span.status = { code, message };
      }
    }),

    /**
     * Run a function within a span.
     */
    withSpan: vi.fn(
      async <T>(
        name: string,
        fn: (span: SpanSnapshot) => Promise<T> | T
      ): Promise<T> => {
        const span = this.startSpan(name);
        try {
          const result = await fn(span);
          this.endSpan();
          return result;
        } catch (error) {
          this.setStatus(1, error instanceof Error ? error.message : String(error));
          this.endSpan();
          throw error;
        }
      }
    ),

    /**
     * Get all completed spans.
     */
    getCompletedSpans(): SpanSnapshot[] {
      return [...spans];
    },

    /**
     * Clear completed spans.
     */
    clearCompleted(): void {
      spans.length = 0;
    },

    /**
     * Get all spans for a specific trace.
     */
    getSpansForTrace(traceId: string): SpanSnapshot[] {
      return spans.filter((s) => s.traceId === traceId);
    },
  };
}

/**
 * Assert that a span was created.
 */
export function assertSpanCreated(
  mockTracer: ReturnType<typeof createMockTracer>,
  name: string
): void {
  expect(mockTracer.startSpan).toHaveBeenCalledWith(name, expect.anything());
}

/**
 * Assert that a span has specific attributes.
 */
export function assertSpanHasAttributes(
  span: SpanSnapshot,
  attributes: Record<string, string | number | boolean>
): void {
  for (const [key, value] of Object.entries(attributes)) {
    expect(span.attributes[key]).toBe(value);
  }
}

/**
 * Assert that a span completed within a time limit.
 */
export function assertSpanCompletedWithin(
  span: SpanSnapshot,
  maxMs: number
): void {
  expect(span.duration).toBeLessThanOrEqual(maxMs);
}

// ============================================================================
// Performance Testing
// ============================================================================

export interface PerformanceSnapshot {
  name: string;
  duration: number;
  startTime: number;
  endTime: number;
  metadata?: Record<string, unknown>;
}

/**
 * Create a performance monitor for testing.
 */
export function createPerformanceMonitor() {
  const snapshots: PerformanceSnapshot[] = [];

  return {
    snapshots,

    /**
     * Start measuring a named operation.
     */
    start: vi.fn((name: string, metadata?: Record<string, unknown>) => {
      const startTime = performance.now();
      return {
        end: () => {
          const endTime = performance.now();
          const duration = endTime - startTime;
          snapshots.push({ name, duration, startTime, endTime, metadata });
          return duration;
        },
      };
    }),

    /**
     * Measure a function's execution time.
     */
    async measure<T>(
      name: string,
      fn: () => T | Promise<T>,
      metadata?: Record<string, unknown>
    ): Promise<{ result: T; duration: number }> {
      const startTime = performance.now();
      const result = await fn();
      const endTime = performance.now();
      const duration = endTime - startTime;

      snapshots.push({ name, duration, startTime, endTime, metadata });

      return { result, duration };
    },

    /**
     * Get all snapshots for a named operation.
     */
    getSnapshots(name: string): PerformanceSnapshot[] {
      return snapshots.filter((s) => s.name === name);
    },

    /**
     * Get statistics for a named operation.
     */
    getStatistics(name: string): {
      count: number;
      min: number;
      max: number;
      avg: number;
      p50: number;
      p95: number;
      p99: number;
    } | null {
      const nameSnapshots = this.getSnapshots(name);
      if (nameSnapshots.length === 0) return null;

      const durations = nameSnapshots.map((s) => s.duration).sort((a, b) => a - b);

      return {
        count: durations.length,
        min: durations[0],
        max: durations[durations.length - 1],
        avg: durations.reduce((sum, d) => sum + d, 0) / durations.length,
        p50: durations[Math.floor(durations.length * 0.5)],
        p95: durations[Math.floor(durations.length * 0.95)],
        p99: durations[Math.floor(durations.length * 0.99)],
      };
    },

    /**
     * Clear all snapshots.
     */
    clear(): void {
      snapshots.length = 0;
    },
  };
}

/**
 * Assert that an operation completes within a time limit.
 */
export async function assertCompletesWithin<T>(
  monitor: ReturnType<typeof createPerformanceMonitor>,
  name: string,
  fn: () => T | Promise<T>,
  maxMs: number
): Promise<T> {
  const { result, duration } = await monitor.measure(name, fn);

  expect(duration).toBeLessThanOrEqual(maxMs);

  return result;
}

/**
 * Assert that performance meets SLO requirements.
 */
export function assertMeetsSLO(
  monitor: ReturnType<typeof createPerformanceMonitor>,
  name: string,
  slo: {
    maxMs?: number;
    p95Ms?: number;
    p99Ms?: number;
  }
): void {
  const stats = monitor.getStatistics(name);

  expect(stats).not.toBeNull();

  if (slo.maxMs) {
    expect(stats!.max).toBeLessThanOrEqual(slo.maxMs);
  }

  if (slo.p95Ms) {
    expect(stats!.p95).toBeLessThanOrEqual(slo.p95Ms);
  }

  if (slo.p99Ms) {
    expect(stats!.p99).toBeLessThanOrEqual(slo.p99Ms);
  }
}

// ============================================================================
// Health Check Testing
// ============================================================================

export interface HealthCheckSnapshot {
  name: string;
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: number;
  details?: Record<string, unknown>;
}

/**
 * Create a mock health checker.
 */
export function createMockHealthChecker() {
  const checks: HealthCheckSnapshot[] = [];

  return {
    checks,

    /**
     * Register a health check.
     */
    register: vi.fn((
      name: string,
      checkFn: () => Promise<boolean> | boolean,
      details?: Record<string, unknown>
    ) => {
      return {
        async run() {
          const startTime = Date.now();
          try {
            const result = await checkFn();
            checks.push({
              name,
              status: result ? "healthy" : "unhealthy",
              timestamp: startTime,
              details,
            });
            return result;
          } catch {
            checks.push({
              name,
              status: "unhealthy",
              timestamp: startTime,
              details,
            });
            return false;
          }
        },
      };
    }),

    /**
     * Get the current health status.
     */
    getStatus(): "healthy" | "degraded" | "unhealthy" {
      if (checks.length === 0) return "healthy";

      const hasUnhealthy = checks.some((c) => c.status === "unhealthy");
      const hasDegraded = checks.some((c) => c.status === "degraded");

      if (hasUnhealthy) return "unhealthy";
      if (hasDegraded) return "degraded";
      return "healthy";
    },

    /**
     * Get all check results.
     */
    getChecks(): HealthCheckSnapshot[] {
      return [...checks];
    },

    /**
     * Clear all check results.
     */
    clear(): void {
      checks.length = 0;
    },
  };
}

/**
 * Assert that a health check passes.
 */
export async function assertHealthCheckPasses(
  healthChecker: ReturnType<typeof createMockHealthChecker>,
  name: string
): Promise<void> {
  const check = healthChecker.register(name, async () => true);
  const result = await check.run();
  expect(result).toBe(true);
}

/**
 * Assert that the overall system is healthy.
 */
export function assertSystemHealthy(
  healthChecker: ReturnType<typeof createMockHealthChecker>
): void {
  expect(healthChecker.getStatus()).toBe("healthy");
}

// ============================================================================
// Integration Helpers
// ============================================================================

/**
 * Create a complete observability mock suite.
 */
export function createMockObservability() {
  return {
    logger: createMockLogger(),
    metrics: createMockMetricsRegistry(),
    tracer: createMockTracer(),
    performance: createPerformanceMonitor(),
    health: createMockHealthChecker(),
  };
}

/**
 * Setup test environment with observability mocks.
 */
export function setupObservabilityMocks() {
  const mocks = createMockObservability();

  return {
    ...mocks,

    /**
     * Reset all mocks to their initial state.
     */
    reset() {
      mocks.logger.clear();
      mocks.metrics.clear();
      mocks.tracer.clearCompleted();
      mocks.performance.clear();
      mocks.health.clear();
    },

    /**
     * Assert that all observability systems are working.
     */
    assertWorking() {
      // Logger should be callable
      expect(mocks.logger.info).toBeDefined();

      // Metrics should be recordable
      const counter = mocks.metrics.counter("test_counter", "Test counter");
      expect(counter.inc).toBeDefined();

      // Tracer should be able to create spans
      expect(mocks.tracer.startSpan).toBeDefined();

      // Performance monitor should be able to measure
      expect(mocks.performance.measure).toBeDefined();

      // Health checker should be able to register checks
      expect(mocks.health.register).toBeDefined();
    },
  };
}
