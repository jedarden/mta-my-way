/**
 * Distributed tracing for MTA My Way.
 *
 * Provides W3C tracecontext-compatible span creation and propagation
 * for observability across the monorepo. Compatible with OpenTelemetry
 * semantic conventions but self-contained — no SDK dependency required.
 *
 * Features:
 * - W3C traceparent header format (traceparent: 00-traceId-spanId-sampled)
 * - AsyncLocalStorage-backed span stack for concurrent request isolation
 * - Context extraction/injection for HTTP headers and plain objects
 * - Child span creation with automatic parent linking
 * - Span attributes, events, and status recording
 * - Span export for logging and transmission
 *
 * Usage:
 *   import { tracer, withChildSpan, getCurrentTraceId } from '@mta-my-way/shared';
 *
 *   const result = await withChildSpan('fetch-feeds', async (span) => {
 *     span.setAttribute('feed.type', 'gtfs-rt');
 *     return fetchFeed();
 *   });
 */

import { AsyncLocalStorage } from "node:async_hooks";

// ============================================================================
// Types
// ============================================================================

/** Immutable context carried by every span — identifies a trace and position. */
export interface SpanContext {
  /** 32-hex-char trace identifier. */
  traceId: string;
  /** 16-hex-char span identifier. */
  spanId: string;
  /** Parent span identifier (absent for root spans). */
  parentSpanId?: string;
  /** Whether this span's trace is sampled for export. */
  sampled: boolean;
}

/** A recorded unit of work within a distributed trace. */
export interface Span {
  /** Human-readable operation name (e.g. "GET /arrivals"). */
  name: string;
  /** Trace-scoped identity and parent link. */
  context: SpanContext;
  /** High-resolution unix-ms when the span started. */
  startTime: number;
  /** High-resolution unix-ms when the span ended (undefined while active). */
  endTime?: number;
  /** OpenTelemetry-style status (0 = unset, 1 = error, 2 = ok). */
  status?: { code: number; message?: string };
  /** Key-value metadata attached to the span. */
  attributes: Record<string, string | number | boolean>;
  /** Timestamped annotations within the span (logs in OTel parlance). */
  events: Array<{ name: string; timestamp: number; attributes?: Record<string, unknown> }>;
}

/** Exported span with computed duration, suitable for logging or external transmission. */
export interface ExportedSpan {
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

// ============================================================================
// ID Generation
// ============================================================================

/**
 * Generate a random trace ID (16 bytes → 32 lowercase hex chars).
 */
export function generateTraceId(): string {
  return Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, "0")
  ).join("");
}

/**
 * Generate a random span ID (8 bytes → 16 lowercase hex chars).
 */
export function generateSpanId(): string {
  return Array.from({ length: 8 }, () =>
    Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, "0")
  ).join("");
}

// ============================================================================
// Tracer
// ============================================================================

/**
 * Tracer creates, tracks, and exports spans.
 *
 * Uses AsyncLocalStorage so concurrent requests get isolated span stacks.
 * Falls back to a global stack when called outside a `withSpan` context
 * (e.g., unit tests or standalone scripts).
 */
export class Tracer {
  private storage = new AsyncLocalStorage<Span[]>();
  private globalStack: Span[] = [];
  private completedSpans: Span[] = [];

  // --------------------------------------------------------------------------
  // Context propagation
  // --------------------------------------------------------------------------

  /**
   * Extract trace context from W3C `traceparent` header.
   *
   * Format: `00-{traceId}-{spanId}-{sampled}`
   * Returns `null` if the header is missing or malformed.
   */
  extractContext(headers: Headers): SpanContext | null {
    const traceParent = headers.get("traceparent");
    if (!traceParent) {
      return null;
    }

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
   * Extract trace context from a plain object (e.g., Hono request headers).
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
   * Inject trace context into `Headers` in W3C traceparent format.
   */
  injectContext(context: SpanContext, headers: Headers): void {
    const sampled = context.sampled ? "01" : "00";
    headers.set("traceparent", `00-${context.traceId}-${context.spanId}-${sampled}`);
  }

  /**
   * Get the active span's trace context as a plain object for `fetch`.
   *
   * Returns an empty object when no span is active.
   */
  getTraceContextHeaders(): Record<string, string> {
    const span = this.activeSpan();
    if (!span) {
      return {};
    }

    const sampled = span.context.sampled ? "01" : "00";
    return {
      traceparent: `00-${span.context.traceId}-${span.context.spanId}-${sampled}`,
    };
  }

  // --------------------------------------------------------------------------
  // Identity helpers
  // --------------------------------------------------------------------------

  /** Get the current trace ID from the active span, or `null`. */
  getCurrentTraceId(): string | null {
    const span = this.activeSpan();
    return span ? span.context.traceId : null;
  }

  /** Get the current span ID from the active span, or `null`. */
  getCurrentSpanId(): string | null {
    const span = this.activeSpan();
    return span ? span.context.spanId : null;
  }

  // --------------------------------------------------------------------------
  // Span lifecycle
  // --------------------------------------------------------------------------

  /**
   * Start a new span. If a parent span is active or `parentContext` is provided,
   * the new span is linked as a child sharing the same trace ID.
   */
  startSpan(name: string, parentContext?: SpanContext): Span {
    const stack = this.currentStack();
    const parentSpan = stack[stack.length - 1];
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

    stack.push(span);
    return span;
  }

  /**
   * End the current active span and move it to the completed list.
   *
   * Returns the ended span, or `null` if no span was active.
   */
  endSpan(attributes?: Record<string, string | number | boolean>): Span | null {
    const stack = this.currentStack();
    const span = stack.pop();
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

  /** Get the currently active (innermost) span, or `null`. */
  activeSpan(): Span | null {
    const stack = this.currentStack();
    return stack[stack.length - 1] || null;
  }

  /** Add a timestamped event annotation to the active span. */
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

  /** Set a key-value attribute on the active span. */
  setAttribute(key: string, value: string | number | boolean): void {
    const span = this.activeSpan();
    if (span) {
      span.attributes[key] = value;
    }
  }

  /** Set the status on the active span (0 = unset, 1 = error, 2 = ok). */
  setStatus(code: number, message?: string): void {
    const span = this.activeSpan();
    if (span) {
      span.status = { code, message };
    }
  }

  // --------------------------------------------------------------------------
  // Inspection
  // --------------------------------------------------------------------------

  /** Get a copy of all completed spans. */
  getCompletedSpans(): Span[] {
    return [...this.completedSpans];
  }

  /** Discard all completed spans. */
  clearCompleted(): void {
    this.completedSpans = [];
  }

  /**
   * Run `fn` inside a new span, isolated via AsyncLocalStorage.
   *
   * The span is automatically ended after `fn` resolves. If `fn` throws,
   * the span is marked with `ERROR` status before re-throwing.
   */
  async withSpan<T>(
    name: string,
    fn: (span: Span) => Promise<T> | T,
    parentContext?: SpanContext
  ): Promise<T> {
    const parentStack = this.currentStack();
    const isolatedStack: Span[] = [...parentStack];

    return this.storage.run(isolatedStack, async () => {
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
    });
  }

  /**
   * Export all completed spans with computed duration.
   */
  exportSpans(): ExportedSpan[] {
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

  // --------------------------------------------------------------------------
  // Internal
  // --------------------------------------------------------------------------

  private currentStack(): Span[] {
    return this.storage.getStore() ?? this.globalStack;
  }
}

// ============================================================================
// Global singleton
// ============================================================================

/** Default global tracer instance. */
export const tracer = new Tracer();

// ============================================================================
// Convenience helpers
// ============================================================================

/**
 * Create a child span for an async operation, automatically linked to the
 * current active span.
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

/** Record a timestamped event on the active span. */
export function recordEvent(name: string, attributes?: Record<string, unknown>): void {
  tracer.addEvent(name, attributes);
}

/** Set an attribute on the active span. */
export function setSpanAttribute(key: string, value: string | number | boolean): void {
  tracer.setAttribute(key, value);
}

/** Get the current trace ID for log correlation. */
export function getCurrentTraceId(): string | null {
  return tracer.getCurrentTraceId();
}

/** Get the current span ID for log correlation. */
export function getCurrentSpanId(): string | null {
  return tracer.getCurrentSpanId();
}
