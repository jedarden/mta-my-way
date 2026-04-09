/**
 * Distributed tracing utility.
 *
 * Provides span creation and trace context propagation for observability.
 * Compatible with OpenTelemetry concepts (can be swapped for full OTel implementation).
 *
 * Features:
 * - W3C tracecontext format (traceparent header)
 * - Async context tracking with span stack
 * - HTTP request/response propagation
 * - Integration with structured logging
 */

interface SpanContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  sampled: boolean;
}

interface Span {
  name: string;
  context: SpanContext;
  startTime: number;
  endTime?: number;
  status?: { code: number; message?: string };
  attributes: Record<string, string | number | boolean>;
  events: Array<{ name: string; timestamp: number; attributes?: Record<string, unknown> }>;
}

/**
 * Generate a random trace ID (16 bytes, 32 hex chars).
 */
function generateTraceId(): string {
  return Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, "0")
  ).join("");
}

/**
 * Generate a random span ID (8 bytes, 16 hex chars).
 */
function generateSpanId(): string {
  return Array.from({ length: 8 }, () =>
    Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, "0")
  ).join("");
}

/**
 * Active span stack for async context tracking.
 */
class Tracer {
  private activeSpans: Span[] = [];
  private completedSpans: Span[] = [];

  /**
   * Extract trace context from headers.
   * Supports W3C traceparent format: 00-traceId-spanId-sampled
   */
  extractContext(headers: Headers): SpanContext | null {
    const traceParent = headers.get("traceparent");
    if (!traceParent) {
      return null;
    }

    // traceparent format: 00-traceId-spanId-sampled
    const parts = traceParent.split("-");
    if (parts.length !== 4 || parts[0] !== "00") {
      return null;
    }

    const [, traceId, spanId, sampled] = parts;
    return {
      traceId,
      spanId,
      sampled: sampled === "01",
    };
  }

  /**
   * Extract trace context from a plain object (e.g., incoming request headers).
   */
  extractContextFromPlain(headers: Record<string, string | undefined>): SpanContext | null {
    const traceParent = headers["traceparent"] || headers["TraceParent"];
    if (!traceParent) {
      return null;
    }

    const h = new Headers();
    h.set("traceparent", traceParent);
    return this.extractContext(h);
  }

  /**
   * Inject trace context into headers (W3C traceparent format).
   */
  injectContext(context: SpanContext, headers: Headers): void {
    const sampled = context.sampled ? "01" : "00";
    headers.set("traceparent", `00-${context.traceId}-${context.spanId}-${sampled}`);
  }

  /**
   * Get trace context as a plain object for use with fetch.
   */
  getTraceContextHeaders(): Record<string, string> {
    const span = this.activeSpan();
    if (!span) {
      return {};
    }

    const headers: Record<string, string> = {};
    this.injectContext(span.context, new Headers({}));
    headers["traceparent"] =
      `00-${span.context.traceId}-${span.context.spanId}-${span.context.sampled ? "01" : "00"}`;
    return headers;
  }

  /**
   * Get the current trace ID from the active span.
   */
  getCurrentTraceId(): string | null {
    const span = this.activeSpan();
    return span ? span.context.traceId : null;
  }

  /**
   * Get the current span ID from the active span.
   */
  getCurrentSpanId(): string | null {
    const span = this.activeSpan();
    return span ? span.context.spanId : null;
  }

  /**
   * Start a new span.
   */
  startSpan(name: string, parentContext?: SpanContext): Span {
    const parentSpan = this.activeSpans[this.activeSpans.length - 1];
    const traceId = parentContext?.traceId || parentSpan?.context.traceId || generateTraceId();
    const spanId = generateSpanId();

    const context: SpanContext = {
      traceId,
      spanId,
      parentSpanId: parentContext?.spanId || parentSpan?.context.spanId,
      sampled: parentContext?.sampled ?? true,
    };

    const span: Span = {
      name,
      context,
      startTime: Date.now(),
      attributes: {},
      events: [],
    };

    this.activeSpans.push(span);
    return span;
  }

  /**
   * End the current active span.
   */
  endSpan(attributes?: Record<string, string | number | boolean>): Span | null {
    const span = this.activeSpans.pop();
    if (!span) {
      return null;
    }

    span.endTime = Date.now();
    if (attributes) {
      span.attributes = { ...span.attributes, ...attributes };
    }

    this.completedSpans.push(span);
    return span;
  }

  /**
   * Get the current active span.
   */
  activeSpan(): Span | null {
    return this.activeSpans[this.activeSpans.length - 1] || null;
  }

  /**
   * Add an event to the current span.
   */
  addEvent(name: string, attributes?: Record<string, unknown>): void {
    const span = this.activeSpan();
    if (span) {
      span.events.push({
        name,
        timestamp: Date.now(),
        attributes,
      });
    }
  }

  /**
   * Set an attribute on the current span.
   */
  setAttribute(key: string, value: string | number | boolean): void {
    const span = this.activeSpan();
    if (span) {
      span.attributes[key] = value;
    }
  }

  /**
   * Set the status of the current span.
   */
  setStatus(code: number, message?: string): void {
    const span = this.activeSpan();
    if (span) {
      span.status = { code, message };
    }
  }

  /**
   * Get all completed spans.
   */
  getCompletedSpans(): Span[] {
    return [...this.completedSpans];
  }

  /**
   * Clear completed spans.
   */
  clearCompleted(): void {
    this.completedSpans = [];
  }

  /**
   * Run a function within a span.
   */
  async withSpan<T>(
    name: string,
    fn: (span: Span) => Promise<T> | T,
    parentContext?: SpanContext
  ): Promise<T> {
    const span = this.startSpan(name, parentContext);
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

  /**
   * Export spans for logging or transmission.
   */
  exportSpans(): Array<{
    traceId: string;
    spanId: string;
    parentSpanId?: string;
    name: string;
    startTime: number;
    endTime: number;
    duration: number;
    attributes: Record<string, string | number | boolean>;
    status?: { code: number; message?: string };
  }> {
    return this.completedSpans.map((span) => ({
      traceId: span.context.traceId,
      spanId: span.context.spanId,
      parentSpanId: span.context.parentSpanId,
      name: span.name,
      startTime: span.startTime,
      endTime: span.endTime || Date.now(),
      duration: (span.endTime || Date.now()) - span.startTime,
      attributes: span.attributes,
      status: span.status,
    }));
  }
}

/**
 * Global tracer instance.
 */
export const tracer = new Tracer();

// ============================================================================
// Hono Middleware
// ============================================================================

import type { MiddlewareHandler } from "hono";

/**
 * Hono middleware for automatic request tracing.
 * Extracts incoming trace context, creates a span, and injects trace context into response.
 */
export const tracingMiddleware: MiddlewareHandler = async (c, next) => {
  // Extract incoming trace context
  const headers = new Headers();
  const traceParent = c.req.header("traceparent");
  if (traceParent) {
    headers.set("traceparent", traceParent);
  }

  const parentContext = tracer.extractContext(headers);

  // Start a span for this request
  const path = c.req.path;
  const spanName = `${c.req.method} ${path}`;

  await tracer.withSpan(
    spanName,
    async (span) => {
      span.attributes = {
        "http.method": c.req.method,
        "http.target": path,
        "http.url": c.req.url,
      };

      try {
        await next();
        // Response status will be set by Hono
        span.attributes["http.status_code"] = c.res.status;
      } catch (error) {
        span.attributes["http.status_code"] = 500;
        span.attributes["error.message"] = error instanceof Error ? error.message : String(error);
        throw error;
      } finally {
        // Inject trace context into response headers for downstream services
        if (span.context.sampled) {
          const sampled = span.context.sampled ? "01" : "00";
          c.header("traceparent", `00-${span.context.traceId}-${span.context.spanId}-${sampled}`);
          c.header("x-trace-id", span.context.traceId);
        }
      }
    },
    parentContext
  );
};

// ============================================================================
// HTTP Request Utilities
// ============================================================================

/**
 * Wrap fetch with automatic trace context propagation.
 * Creates a child span for the outbound request and injects trace context.
 */
export async function tracedFetch(
  url: string | URL,
  options?: RequestInit & { spanName?: string }
): Promise<Response> {
  const spanName =
    options?.spanName || `HTTP ${typeof url === "string" ? url.split("/")[1] : url.hostname}`;
  const fetchOptions = { ...options };
  delete fetchOptions.spanName;

  // Add trace context to request headers
  const traceHeaders = tracer.getTraceContextHeaders();
  if (Object.keys(traceHeaders).length > 0) {
    fetchOptions.headers = {
      ...(fetchOptions.headers || {}),
      ...traceHeaders,
    };
  }

  return tracer.withSpan(spanName, async (span) => {
    span.attributes = {
      "http.method": fetchOptions.method || "GET",
      "http.url": typeof url === "string" ? url : url.href,
    };

    try {
      const response = await fetch(url, fetchOptions);
      span.attributes["http.status_code"] = response.status;
      return response;
    } catch (error) {
      span.attributes["error.message"] = error instanceof Error ? error.message : String(error);
      throw error;
    }
  });
}

// ============================================================================
// Span Utilities
// ============================================================================

/**
 * Create a child span for an async operation.
 * Automatically links to the current active span.
 */
export async function withChildSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T> | T,
  attributes?: Record<string, string | number | boolean>
): Promise<T> {
  return tracer.withSpan(name, async (span) => {
    if (attributes) {
      Object.entries(attributes).forEach(([k, v]) => {
        span.attributes[k] = v;
      });
    }
    return fn(span);
  });
}

/**
 * Record an event on the current span.
 */
export function recordEvent(name: string, attributes?: Record<string, unknown>): void {
  tracer.addEvent(name, attributes);
}

/**
 * Set an attribute on the current span.
 */
export function setSpanAttribute(key: string, value: string | number | boolean): void {
  tracer.setAttribute(key, value);
}

/**
 * Get the current trace ID for logging correlation.
 */
export function getCurrentTraceId(): string | null {
  return tracer.getCurrentTraceId();
}
