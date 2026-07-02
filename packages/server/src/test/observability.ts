/**
 * Test utilities for observability (logging, metrics, tracing).
 */

import { vi } from "vitest";
import type { Span } from "../observability/tracing.js";

/**
 * Mock logger for testing.
 *
 * Provides methods to assert on logged messages.
 */
export class MockLogger {
  private logs: Array<{
    level: string;
    message: string;
    context?: Record<string, unknown>;
    error?: Error;
  }> = [];

  debug(message: string, context?: Record<string, unknown>): void {
    this.logs.push({ level: "debug", message, context });
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.logs.push({ level: "info", message, context });
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.logs.push({ level: "warn", message, context });
  }

  error(message: string, error?: Error, context?: Record<string, unknown>): void {
    this.logs.push({ level: "error", message, error, context });
  }

  /**
   * Get all logs at a specific level.
   */
  getLogs(level: string) {
    return this.logs.filter((l) => l.level === level);
  }

  /**
   * Get all logs containing a specific message.
   */
  getLogsWithMessage(message: string) {
    return this.logs.filter((l) => l.message.includes(message));
  }

  /**
   * Assert that a log entry exists.
   */
  assertLogged(level: string, message: string) {
    const found = this.logs.some((l) => l.level === level && l.message.includes(message));
    if (!found) {
      throw new Error(
        `Expected to find ${level} log containing "${message}", but it was not logged. Logs: ${JSON.stringify(this.logs, null, 2)}`
      );
    }
  }

  /**
   * Clear all logs.
   */
  clear() {
    this.logs = [];
  }

  /**
   * Get log count for a level.
   */
  count(level: string) {
    return this.logs.filter((l) => l.level === level).length;
  }
}

/**
 * Create a mock span for testing.
 */
export function createMockSpan(name: string, attributes?: Record<string, unknown>): Span {
  return {
    name,
    context: {
      traceId: "test-trace-id",
      spanId: "test-span-id",
      sampled: true,
    },
    startTime: Date.now(),
    endTime: Date.now() + 100,
    attributes: attributes || {},
    events: [],
  };
}

/**
 * Mock tracer for testing.
 */
export class MockTracer {
  private spans: Span[] = [];
  private currentSpan: Span | null = null;

  startSpan(name: string): Span {
    const span = createMockSpan(name);
    this.spans.push(span);
    this.currentSpan = span;
    return span;
  }

  endSpan(): Span | null {
    const span = this.currentSpan;
    this.currentSpan = null;
    return span;
  }

  activeSpan(): Span | null {
    return this.currentSpan;
  }

  addEvent(name: string, attributes?: Record<string, unknown>): void {
    if (this.currentSpan) {
      this.currentSpan.events.push({
        name,
        timestamp: Date.now(),
        attributes,
      });
    }
  }

  setAttribute(key: string, value: string | number | boolean): void {
    if (this.currentSpan) {
      this.currentSpan.attributes[key] = value;
    }
  }

  setStatus(code: number, message?: string): void {
    if (this.currentSpan) {
      this.currentSpan.status = { code, message };
    }
  }

  getCompletedSpans(): Span[] {
    return [...this.spans];
  }

  clearCompleted(): void {
    this.spans = [];
  }

  async withSpan<T>(name: string, fn: (span: Span) => Promise<T> | T): Promise<T> {
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
}

/**
 * Mock metrics registry for testing.
 */
export class MockMetricsRegistry {
  private counters: Map<string, number> = new Map();
  private gauges: Map<string, number> = new Map();
  private histograms: Map<string, number[]> = new Map();

  counter(name: string) {
    return {
      inc: (amount = 1) => {
        const current = this.counters.get(name) || 0;
        this.counters.set(name, current + amount);
      },
      reset: () => {
        this.counters.set(name, 0);
      },
    };
  }

  gauge(name: string) {
    return {
      set: (value: number) => {
        this.gauges.set(name, value);
      },
      inc: (amount = 1) => {
        const current = this.gauges.get(name) || 0;
        this.gauges.set(name, current + amount);
      },
      dec: (amount = 1) => {
        const current = this.gauges.get(name) || 0;
        this.gauges.set(name, current - amount);
      },
    };
  }

  histogram(name: string) {
    return {
      observe: (value: number) => {
        const values = this.histograms.get(name) || [];
        values.push(value);
        this.histograms.set(name, values);
      },
      reset: () => {
        this.histograms.set(name, []);
      },
    };
  }

  /**
   * Get the current value of a counter.
   */
  getCounter(name: string): number {
    return this.counters.get(name) || 0;
  }

  /**
   * Get the current value of a gauge.
   */
  getGauge(name: string): number {
    return this.gauges.get(name) || 0;
  }

  /**
   * Get all observed values for a histogram.
   */
  getHistogramValues(name: string): number[] {
    return this.histograms.get(name) || [];
  }

  /**
   * Clear all metrics.
   */
  clear() {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }
}

/**
 * Assert that a metric was incremented.
 */
export function assertMetricIncremented(
  registry: MockMetricsRegistry,
  name: string,
  expectedValue?: number
) {
  const value = registry.getCounter(name);
  if (expectedValue !== undefined && value !== expectedValue) {
    throw new Error(`Expected counter "${name}" to be ${expectedValue}, but got ${value}`);
  }
  if (value === 0) {
    throw new Error(`Expected counter "${name}" to be incremented, but it is 0`);
  }
}

/**
 * Assert that a span was created with specific attributes.
 */
export function assertSpanCreated(
  tracer: MockTracer,
  name: string,
  attributes?: Record<string, unknown>
) {
  const spans = tracer.getCompletedSpans();
  const span = spans.find((s) => s.name === name);

  if (!span) {
    throw new Error(
      `Expected to find span "${name}", but found: ${spans.map((s) => s.name).join(", ")}`
    );
  }

  if (attributes) {
    for (const [key, value] of Object.entries(attributes)) {
      if (span.attributes[key] !== value) {
        throw new Error(
          `Expected span "${name}" to have attribute ${key}=${value}, but got ${span.attributes[key]}`
        );
      }
    }
  }
}

/**
 * Assert that a log entry was created.
 */
export function assertLogged(logger: MockLogger, level: string, message: string) {
  logger.assertLogged(level, message);
}

/**
 * Wait for an async assertion to pass.
 */
export async function waitForAssertion(
  assertion: () => void,
  timeout = 1000,
  interval = 50
): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    try {
      assertion();
      return;
    } catch {
      // Assertion failed, wait and retry
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  // Final attempt
  assertion();
}
