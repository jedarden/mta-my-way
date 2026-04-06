/**
 * Distributed tracing utility.
 *
 * Provides span creation and trace context propagation for observability.
 * Compatible with OpenTelemetry concepts (can be swapped for full OTel implementation).
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
 * Generate a random trace ID.
 */
function generateTraceId(): string {
  return Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, "0")
  ).join("");
}

/**
 * Generate a random span ID.
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
   * Inject trace context into headers.
   */
  injectContext(context: SpanContext, headers: Headers): void {
    const sampled = context.sampled ? "01" : "00";
    headers.set("traceparent", `00-${context.traceId}-${context.spanId}-${sampled}`);
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

/**
 * Hono middleware for automatic request tracing.
 */
export async function tracingMiddleware(
  c: { req: { header: (name: string) => string | undefined | null }; method: string; url: string },
  next: () => Promise<unknown>
): Promise<void> {
  // Extract incoming trace context
  const headers = new Headers();
  const traceParent = c.req.header("traceparent");
  if (traceParent) {
    headers.set("traceparent", traceParent);
  }

  const parentContext = tracer.extractContext(headers);

  // Start a span for this request
  const spanName = `${c.method} ${new URL(c.req.url || c.url).pathname}`;
  await tracer.withSpan(
    spanName,
    async (span) => {
      span.attributes = {
        "http.method": c.method,
        "http.url": c.req.url || c.url,
      };

      try {
        await next();
        span.attributes["http.status_code"] = 200;
      } catch (error) {
        span.attributes["http.status_code"] = 500;
        span.attributes["error.message"] = error instanceof Error ? error.message : String(error);
        throw error;
      }
    },
    parentContext
  );
}
