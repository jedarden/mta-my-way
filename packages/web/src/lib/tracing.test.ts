/**
 * Tests for client-side distributed tracing.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Span } from "./tracing";
import {
  getCurrentTraceId,
  getTraceHeaders,
  recordEvent,
  setSpanAttribute,
  tracedFetch,
  tracer,
  trackInteraction,
  withChildSpan,
} from "./tracing";

// Mock sessionStorage
const mockSessionStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
};

describe("ClientTracer", () => {
  beforeEach(() => {
    // Clear completed spans before each test
    tracer.clearCompleted();
    // Clear context
    tracer.clearContext();
    // Clear any active spans by ending them
    while (tracer.activeSpan() !== null) {
      tracer.endSpan();
    }
    vi.clearAllMocks();
  });

  describe("trace ID and span ID generation", () => {
    it("should generate valid trace IDs (32 hex chars)", () => {
      const headers = getTraceHeaders();
      const traceParent = headers.traceparent;
      expect(traceParent).toBeDefined();

      const parts = traceParent.split("-");
      expect(parts[0]).toBe("00"); // version
      expect(parts[1]).toHaveLength(32); // traceId
      expect(/^[a-f0-9]{32}$/.test(parts[1])).toBe(true);
    });

    it("should generate valid span IDs (16 hex chars)", () => {
      const headers = getTraceHeaders();
      const traceParent = headers.traceparent;

      const parts = traceParent.split("-");
      expect(parts[2]).toHaveLength(16); // spanId
      expect(/^[a-f0-9]{16}$/.test(parts[2])).toBe(true);
    });

    it("should set sampled flag to 01 by default", () => {
      const headers = getTraceHeaders();
      const traceParent = headers.traceparent;

      const parts = traceParent.split("-");
      expect(parts[3]).toBe("01"); // sampled
    });
  });

  describe("span lifecycle", () => {
    it("should start a new span and make it active", () => {
      tracer.startSpan("test-span");
      const active = tracer.activeSpan();

      expect(active).toBeDefined();
      expect(active?.name).toBe("test-span");
      expect(active?.startTime).toBeGreaterThan(0);
      expect(active?.endTime).toBeUndefined();
    });

    it("should end the active span", () => {
      tracer.startSpan("test-span");
      const span = tracer.endSpan();

      expect(span).toBeDefined();
      expect(span?.name).toBe("test-span");
      expect(span?.endTime).toBeDefined();
      expect(span?.endTime).toBeGreaterThan(span?.startTime || 0);
    });

    it("should return null when ending with no active span", () => {
      const result = tracer.endSpan();
      expect(result).toBeNull();
    });

    it("should support nested spans (parent-child relationship)", () => {
      const parent = tracer.startSpan("parent");
      const child = tracer.startSpan("child");

      expect(child.context.parentSpanId).toBe(parent.context.spanId);

      tracer.endSpan(); // end child
      tracer.endSpan(); // end parent

      const completed = tracer.getCompletedSpans();
      expect(completed).toHaveLength(2);
      expect(completed[0].name).toBe("child");
      expect(completed[1].name).toBe("parent");
    });
  });

  describe("span attributes and events", () => {
    it("should set attributes on the active span", () => {
      tracer.startSpan("test-span");
      setSpanAttribute("test.key", "test-value");
      setSpanAttribute("test.number", 42);
      setSpanAttribute("test.bool", true);

      const span = tracer.activeSpan();
      expect(span?.attributes["test.key"]).toBe("test-value");
      expect(span?.attributes["test.number"]).toBe(42);
      expect(span?.attributes["test.bool"]).toBe(true);

      tracer.endSpan();
    });

    it("should add events to the active span", () => {
      tracer.startSpan("test-span");
      recordEvent("test-event", { data: "value" });

      const span = tracer.activeSpan();
      expect(span?.events).toHaveLength(1);
      expect(span?.events[0].name).toBe("test-event");
      expect(span?.events[0].attributes).toEqual({ data: "value" });

      tracer.endSpan();
    });
  });

  describe("trace context propagation", () => {
    it("should extract context from traceparent header", () => {
      const headers = new Headers();
      headers.set("traceparent", "00-12345678901234567890123456789012-abcdef0123456789-01");

      const context = tracer.extractContext(headers);
      expect(context).toEqual({
        traceId: "12345678901234567890123456789012",
        spanId: "abcdef0123456789",
        sampled: true,
      });
    });

    it("should return null for invalid traceparent format", () => {
      const headers = new Headers();
      headers.set("traceparent", "invalid-format");

      const context = tracer.extractContext(headers);
      expect(context).toBeNull();
    });

    it("should inject context into headers", () => {
      const headers = new Headers();
      const context = {
        traceId: "12345678901234567890123456789012",
        spanId: "abcdef0123456789",
        sampled: true,
      };

      tracer.injectContext(context, headers);
      expect(headers.get("traceparent")).toBe(
        "00-12345678901234567890123456789012-abcdef0123456789-01"
      );
    });

    it("should get trace headers for fetch requests", () => {
      tracer.startSpan("test-span");
      const headers = getTraceHeaders();

      expect(headers.traceparent).toBeDefined();
      expect(headers.traceparent).toMatch(/^00-[a-fA-F0-9]{32}-[a-fA-F0-9]{16}-[01]{2}$/);

      tracer.endSpan();
    });

    it("should maintain trace ID across nested spans", () => {
      const parent = tracer.startSpan("parent");
      const traceId = parent.context.traceId;

      const child = tracer.startSpan("child");
      expect(child.context.traceId).toBe(traceId);

      tracer.endSpan();
      tracer.endSpan();
    });
  });

  describe("withChildSpan helper", () => {
    it("should execute function within a span", async () => {
      let capturedSpan: Span | null = null;
      const result = await withChildSpan("async-operation", (span) => {
        capturedSpan = span;
        return "result";
      });

      expect(result).toBe("result");
      expect(capturedSpan).toBeDefined();
      expect(capturedSpan.name).toBe("async-operation");

      const completed = tracer.getCompletedSpans();
      expect(completed).toHaveLength(1);
      expect(completed[0].name).toBe("async-operation");
    });

    it("should set attributes on span", async () => {
      await withChildSpan("operation", () => {}, {
        "custom.attr": "value",
        number: 123,
      });

      const completed = tracer.getCompletedSpans();
      const span = completed[0];
      expect(span?.attributes["custom.attr"]).toBe("value");
      expect(span?.attributes.number).toBe(123);
    });

    it("should handle errors and set error attributes", async () => {
      await expect(
        withChildSpan("failing-operation", () => {
          throw new Error("Test error");
        })
      ).rejects.toThrow("Test error");

      const completed = tracer.getCompletedSpans();
      expect(completed[0]?.attributes.error).toBe(true);
      expect(completed[0]?.attributes["error.message"]).toBe("Test error");
    });
  });

  describe("getCurrentTraceId", () => {
    it("should return null when no active span", () => {
      expect(getCurrentTraceId()).toBeNull();
    });

    it("should return trace ID when span is active", () => {
      tracer.startSpan("test-span");
      const traceId = getCurrentTraceId();
      expect(traceId).toBeDefined();
      expect(traceId).toHaveLength(32);
      tracer.endSpan();
    });
  });

  describe("span export", () => {
    it("should export completed spans with calculated duration", () => {
      tracer.startSpan("span1");
      tracer.endSpan();

      tracer.startSpan("span2");
      setSpanAttribute("key", "value");
      tracer.endSpan();

      const exported = tracer.exportSpans();
      expect(exported).toHaveLength(2);

      expect(exported[0]?.name).toBe("span1");
      expect(exported[0]?.duration).toBeGreaterThanOrEqual(0);
      expect(exported[0]?.traceId).toBeDefined();
      expect(exported[0]?.spanId).toBeDefined();

      expect(exported[1]?.name).toBe("span2");
      expect(exported[1]?.attributes.key).toBe("value");
    });
  });

  describe("clearCompleted", () => {
    it("should clear all completed spans", () => {
      tracer.startSpan("span1");
      tracer.endSpan();

      expect(tracer.getCompletedSpans()).toHaveLength(1);

      tracer.clearCompleted();
      expect(tracer.getCompletedSpans()).toHaveLength(0);
    });
  });

  describe("trackInteraction", () => {
    it("should track user interaction as span", async () => {
      await trackInteraction("click", "submit-button");

      const completed = tracer.getCompletedSpans();
      expect(completed).toHaveLength(1);
      expect(completed[0].name).toBe("click:submit-button");
      expect(completed[0].attributes["interaction.type"]).toBe("click");
      expect(completed[0].attributes["interaction.element"]).toBe("submit-button");
    });

    it("should track interaction without element name", async () => {
      await trackInteraction("scroll");

      const completed = tracer.getCompletedSpans();
      expect(completed).toHaveLength(1);
      expect(completed[0].name).toBe("scroll");
      expect(completed[0].attributes["interaction.type"]).toBe("scroll");
    });

    it("should include custom attributes", async () => {
      await trackInteraction("click", "button", { "button.variant": "primary" });

      const completed = tracer.getCompletedSpans();
      expect(completed[0].attributes["button.variant"]).toBe("primary");
    });
  });

  describe("sessionStorage persistence", () => {
    beforeEach(() => {
      // Mock sessionStorage for Node.js environment
      Object.defineProperty(global, "sessionStorage", {
        value: mockSessionStorage,
        writable: true,
      });
    });

    it("should persist trace context to sessionStorage", () => {
      tracer.startSpan("test-span");

      expect(mockSessionStorage.setItem).toHaveBeenCalledWith(
        "mta_my_way_trace_context",
        expect.stringContaining('"traceId"')
      );

      tracer.endSpan();
    });

    it("should clear context from sessionStorage", () => {
      tracer.clearContext();
      expect(mockSessionStorage.removeItem).toHaveBeenCalledWith("mta_my_way_trace_context");
    });
  });
});

describe("tracedFetch", () => {
  beforeEach(() => {
    tracer.clearCompleted();
    tracer.clearContext();
  });

  it("should create a span and inject trace headers", async () => {
    // Mock fetch
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: "test" }),
        status: 200,
      } as Response)
    );

    await tracedFetch<{ data: string }>("https://api.example.com/test");

    const completed = tracer.getCompletedSpans();
    expect(completed).toHaveLength(1);
    expect(completed[0].name).toBe("HTTP /test");
    expect(completed[0].attributes["http.method"]).toBe("GET");
    expect(completed[0].attributes["http.url"]).toBe("https://api.example.com/test");
    expect(completed[0].attributes["http.status_code"]).toBe(200);

    expect(fetch).toHaveBeenCalledWith(
      "https://api.example.com/test",
      expect.objectContaining({
        headers: expect.objectContaining({
          traceparent: expect.stringMatching(/^00-[a-fA-F0-9]{32}-[a-fA-F0-9]{16}-01$/),
        }),
      })
    );
  });

  it("should use custom span name if provided", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: "test" }),
        status: 200,
      } as Response)
    );

    await tracedFetch("https://api.example.com/test", {
      spanName: "custom-api-call",
    });

    const completed = tracer.getCompletedSpans();
    expect(completed[0].name).toBe("custom-api-call");
  });

  it("should handle fetch errors and set error attributes", async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error("Network error")));

    await expect(tracedFetch("https://api.example.com/test")).rejects.toThrow("Network error");

    const completed = tracer.getCompletedSpans();
    expect(completed[0].attributes.error).toBe(true);
    expect(completed[0].attributes["error.message"]).toBe("Network error");
  });

  it("should handle non-OK responses", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ error: "Not found" }),
        status: 404,
      } as Response)
    );

    await tracedFetch("https://api.example.com/test");

    const completed = tracer.getCompletedSpans();
    expect(completed[0].attributes["http.status_code"]).toBe(404);
    expect(completed[0].attributes.error).toBe(true);
  });
});
