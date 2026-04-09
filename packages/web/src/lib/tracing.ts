/**
 * Client-side distributed tracing for MTA My Way.
 *
 * Provides W3C tracecontext-compatible tracing with:
 * - Trace ID and span ID generation
 * - Context propagation to backend via traceparent header
 * - Span lifecycle management
 * - Integration with API clients
 *
 * Compatible with the server-side tracing implementation in packages/server/src/observability/tracing.ts
 */

interface SpanContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  sampled: boolean;
}

export interface Span {
  name: string;
  context: SpanContext;
  startTime: number;
  endTime?: number;
  attributes: Record<string, string | number | boolean>;
  events: Array<{ name: string; timestamp: number; attributes?: Record<string, unknown> }>;
}

/**
 * Generate a random trace ID (16 bytes, 32 hex chars).
 */
function generateTraceId(): string {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  // Fallback for older browsers
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
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  // Fallback for older browsers
  return Array.from({ length: 8 }, () =>
    Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, "0")
  ).join("");
}

/**
 * Client-side tracer for distributed tracing.
 */
class ClientTracer {
  private activeSpans: Span[] = [];
  private completedSpans: Span[] = [];
  private storageKey = "mta_my_way_trace_context";

  constructor() {
    // Restore trace context from sessionStorage if available
    this.restoreContext();
  }

  /**
   * Extract trace context from headers object.
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
      traceId: traceId as string,
      spanId: spanId as string,
      sampled: sampled === "01",
    };
  }

  /**
   * Inject trace context into headers (W3C traceparent format).
   */
  injectContext(context: SpanContext, headers: Headers): void {
    const sampled = context.sampled ? "01" : "00";
    headers.set("traceparent", `00-${context.traceId}-${context.spanId}-${sampled}`);
  }

  /**
   * Get trace context headers for fetch requests.
   * Returns a plain object that can be spread into fetch options.
   * Creates a temporary root span if no active span exists.
   */
  getTraceContextHeaders(): Record<string, string> {
    const span = this.activeSpan();
    if (!span) {
      // If no active span, generate a temporary trace ID
      const traceId = generateTraceId();
      const spanId = generateSpanId();
      return {
        traceparent: `00-${traceId}-${spanId}-01`,
      };
    }

    return {
      traceparent: `00-${span.context.traceId}-${span.context.spanId}-${span.context.sampled ? "01" : "00"}`,
    };
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
      startTime: performance.now(),
      attributes: {},
      events: [],
    };

    this.activeSpans.push(span);
    this.persistContext();
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

    span.endTime = performance.now();
    if (attributes) {
      span.attributes = { ...span.attributes, ...attributes };
    }

    this.completedSpans.push(span);
    this.persistContext();
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
        timestamp: performance.now(),
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
   * Get the current trace ID for logging/correlation.
   */
  getCurrentTraceId(): string | null {
    const span = this.activeSpan();
    return span ? span.context.traceId : null;
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
      this.setAttribute("error", true);
      this.setAttribute("error.message", error instanceof Error ? error.message : String(error));
      this.endSpan();
      throw error;
    }
  }

  /**
   * Get all completed spans.
   */
  getCompletedSpans(): Span[] {
    return [...this.completedSpans];
  }

  /**
   * Clear completed spans to free memory.
   */
  clearCompleted(): void {
    this.completedSpans = [];
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
  }> {
    return this.completedSpans.map((span) => ({
      traceId: span.context.traceId,
      spanId: span.context.spanId,
      parentSpanId: span.context.parentSpanId,
      name: span.name,
      startTime: span.startTime,
      endTime: span.endTime || performance.now(),
      duration: (span.endTime || performance.now()) - span.startTime,
      attributes: span.attributes,
    }));
  }

  /**
   * Persist trace context to sessionStorage for page navigation continuity.
   */
  private persistContext(): void {
    const span = this.activeSpan();
    if (span) {
      try {
        sessionStorage.setItem(this.storageKey, JSON.stringify(span.context));
      } catch {
        // SessionStorage might not be available in all contexts
      }
    }
  }

  /**
   * Restore trace context from sessionStorage.
   */
  private restoreContext(): void {
    try {
      const stored = sessionStorage.getItem(this.storageKey);
      if (stored) {
        const context = JSON.parse(stored) as SpanContext;
        // Start a new root span with the restored trace ID
        this.startSpan("page-load", context);
      }
    } catch {
      // SessionStorage might not be available or is corrupted
    }
  }

  /**
   * Clear stored trace context.
   */
  clearContext(): void {
    try {
      sessionStorage.removeItem(this.storageKey);
    } catch {
      // SessionStorage might not be available
    }
  }
}

/**
 * Global client tracer instance.
 */
export const tracer = new ClientTracer();

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

/**
 * Get trace context headers for fetch requests.
 * This is the main function to use for adding tracing to API calls.
 */
export function getTraceHeaders(): Record<string, string> {
  return tracer.getTraceContextHeaders();
}

// ============================================================================
// Integration Helper
// ============================================================================

/**
 * Wrap a fetch call with automatic tracing.
 * Creates a child span and injects trace context headers.
 */
export async function tracedFetch<T>(
  url: string,
  options?: RequestInit & { spanName?: string }
): Promise<T> {
  const spanName = options?.spanName || `HTTP ${new URL(url, window.location.origin).pathname}`;
  const fetchOptions = { ...options };
  delete (fetchOptions as { spanName?: string }).spanName;

  // Add trace context to request headers
  const traceHeaders = tracer.getTraceContextHeaders();
  fetchOptions.headers = {
    ...(fetchOptions.headers || {}),
    ...traceHeaders,
  };

  return tracer.withSpan(spanName, async (span) => {
    span.attributes = {
      "http.method": fetchOptions.method || "GET",
      "http.url": url,
    };

    try {
      const response = await fetch(url, fetchOptions);
      span.attributes["http.status_code"] = response.status;

      if (!response.ok) {
        span.attributes["error"] = true;
      }

      return (await response.json()) as T;
    } catch (error) {
      span.attributes["error"] = true;
      span.attributes["error.message"] = error instanceof Error ? error.message : String(error);
      throw error;
    }
  });
}

// ============================================================================
// Performance Navigation Timing Integration
// ============================================================================

/**
 * Create a span for the initial page load using Performance Navigation Timing API.
 */
export function recordPageLoadSpan(): void {
  if (typeof window === "undefined" || !window.performance) {
    return;
  }

  const timing =
    window.performance.timing ||
    (window.performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming);
  if (!timing) {
    return;
  }

  void tracer.withSpan("page-load", (span) => {
    const domContentLoaded = timing.domContentLoadedEventEnd - timing.navigationStart;
    const loadComplete = timing.loadEventEnd - timing.navigationStart;
    const dnsLookup = timing.domainLookupEnd - timing.domainLookupStart;
    const tcpConnect = timing.connectEnd - timing.connectStart;
    const requestTime = timing.responseStart - timing.requestStart;
    const responseTime = timing.responseEnd - timing.responseStart;

    span.attributes = {
      "timing.dom_content_loaded": domContentLoaded,
      "timing.load_complete": loadComplete,
      "timing.dns": dnsLookup,
      "timing.tcp": tcpConnect,
      "timing.request": requestTime,
      "timing.response": responseTime,
    };
  });
}

// ============================================================================
// User Interaction Span Helper
// ============================================================================

/**
 * Track user interactions as spans (e.g., button clicks, form submissions).
 */
export async function trackInteraction(
  interactionType: string,
  element?: string,
  attributes?: Record<string, string | number | boolean>
): Promise<void> {
  const name = element ? `${interactionType}:${element}` : interactionType;
  await tracer.withSpan(name, (span) => {
    span.attributes = {
      "interaction.type": interactionType,
      ...(element ? { "interaction.element": element } : {}),
      ...attributes,
    };
  });
}
