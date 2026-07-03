/**
 * Unit tests for distributed tracing.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  Tracer,
  generateSpanId,
  generateTraceId,
  getCurrentSpanId,
  getCurrentTraceId,
  recordEvent,
  setSpanAttribute,
  tracer,
  withChildSpan,
} from "./tracing.js";
import type { SpanContext } from "./tracing.js";

describe("tracing", () => {
  beforeEach(() => {
    tracer.clearCompleted();
  });

  // =========================================================================
  // ID generation
  // =========================================================================

  describe("generateTraceId", () => {
    it("produces a 32-char hex string", () => {
      const id = generateTraceId();
      expect(id).toMatch(/^[0-9a-f]{32}$/);
    });

    it("produces unique IDs across calls", () => {
      const ids = new Set(Array.from({ length: 50 }, () => generateTraceId()));
      expect(ids.size).toBe(50);
    });
  });

  describe("generateSpanId", () => {
    it("produces a 16-char hex string", () => {
      const id = generateSpanId();
      expect(id).toMatch(/^[0-9a-f]{16}$/);
    });

    it("produces unique IDs across calls", () => {
      const ids = new Set(Array.from({ length: 50 }, () => generateSpanId()));
      expect(ids.size).toBe(50);
    });
  });

  // =========================================================================
  // Span lifecycle
  // =========================================================================

  describe("startSpan and endSpan", () => {
    it("starts and ends a span", () => {
      const span = tracer.startSpan("test-operation");
      expect(span.name).toBe("test-operation");
      expect(span.context.traceId).toMatch(/^[0-9a-f]{32}$/);
      expect(span.context.spanId).toMatch(/^[0-9a-f]{16}$/);
      expect(span.startTime).toBeLessThanOrEqual(Date.now());
      expect(span.endTime).toBeUndefined();

      tracer.endSpan();

      const completed = tracer.getCompletedSpans();
      expect(completed).toHaveLength(1);
      expect(completed[0]!.name).toBe("test-operation");
      expect(completed[0]!.endTime).toBeTruthy();
    });

    it("creates parent-child relationships", () => {
      const parent = tracer.startSpan("parent");
      const child = tracer.startSpan("child");

      expect(child.context.parentSpanId).toBe(parent.context.spanId);
      expect(child.context.traceId).toBe(parent.context.traceId);

      tracer.endSpan(); // end child
      tracer.endSpan(); // end parent
    });

    it("three-level nesting shares the same trace ID", () => {
      const root = tracer.startSpan("root");
      const mid = tracer.startSpan("mid");
      const leaf = tracer.startSpan("leaf");

      expect(root.context.traceId).toBe(mid.context.traceId);
      expect(mid.context.traceId).toBe(leaf.context.traceId);

      tracer.endSpan(); // leaf
      tracer.endSpan(); // mid
      tracer.endSpan(); // root
    });

    it("adds attributes to span", () => {
      tracer.startSpan("test");
      tracer.setAttribute("user.id", "123");
      tracer.setAttribute("http.method", "GET");

      const active = tracer.activeSpan();
      expect(active?.attributes["user.id"]).toBe("123");
      expect(active?.attributes["http.method"]).toBe("GET");

      tracer.endSpan();
    });

    it("adds events to span", () => {
      tracer.startSpan("test");
      tracer.addEvent("database.query", { query: "SELECT * FROM users" });

      const active = tracer.activeSpan();
      expect(active?.events).toHaveLength(1);
      expect(active?.events[0]!.name).toBe("database.query");

      tracer.endSpan();
    });

    it("sets span status", () => {
      tracer.startSpan("test");
      tracer.setStatus(1, "Operation failed");

      const active = tracer.activeSpan();
      expect(active?.status).toEqual({ code: 1, message: "Operation failed" });

      tracer.endSpan();
    });

    it("returns null when ending with no active span", () => {
      const result = tracer.endSpan();
      expect(result).toBeNull();
    });

    it("returns null when getting active span with none active", () => {
      const active = tracer.activeSpan();
      expect(active).toBeNull();
    });

    it("merges attributes when ending a span", () => {
      tracer.startSpan("test");
      tracer.setAttribute("a", 1);
      tracer.endSpan({ b: 2 });

      const completed = tracer.getCompletedSpans();
      expect(completed[0]!.attributes).toEqual({ a: 1, b: 2 });
    });
  });

  // =========================================================================
  // withSpan
  // =========================================================================

  describe("withSpan", () => {
    it("runs function within span and returns result", async () => {
      const result = await tracer.withSpan("async-operation", async (span) => {
        expect(span.name).toBe("async-operation");
        return "operation-result";
      });

      expect(result).toBe("operation-result");

      const completed = tracer.getCompletedSpans();
      expect(completed).toHaveLength(1);
    });

    it("works with synchronous functions", async () => {
      const result = await tracer.withSpan("sync-operation", (span) => {
        expect(span.name).toBe("sync-operation");
        return 42;
      });

      expect(result).toBe(42);
    });

    it("sets error status on exception and re-throws", async () => {
      await expect(
        tracer.withSpan("failing-operation", async () => {
          throw new Error("Operation failed");
        })
      ).rejects.toThrow("Operation failed");

      const completed = tracer.getCompletedSpans();
      expect(completed[0]!.status).toEqual({ code: 1, message: "Operation failed" });
    });

    it("sets error status with non-Error throws", async () => {
      await expect(
        tracer.withSpan("string-error", () => {
          throw "something went wrong";
        })
      ).rejects.toBe("something went wrong");

      const completed = tracer.getCompletedSpans();
      expect(completed[0]!.status).toEqual({ code: 1, message: "something went wrong" });
    });

    it("respects parent context", async () => {
      const parentContext: SpanContext = {
        traceId: "parent-trace-id",
        spanId: "parent-span-id",
        sampled: true,
      };

      await tracer.withSpan(
        "child-operation",
        async (span) => {
          expect(span.context.traceId).toBe("parent-trace-id");
          expect(span.context.parentSpanId).toBe("parent-span-id");
        },
        parentContext
      );
    });

    it("isolates concurrent withSpan calls", async () => {
      const results = await Promise.all([
        tracer.withSpan("op-a", async (span) => {
          await sleep(10);
          expect(span.name).toBe("op-a");
          return "a";
        }),
        tracer.withSpan("op-b", async (span) => {
          await sleep(10);
          expect(span.name).toBe("op-b");
          return "b";
        }),
      ]);

      expect(results).toEqual(["a", "b"]);

      const completed = tracer.getCompletedSpans();
      expect(completed).toHaveLength(2);
    });
  });

  // =========================================================================
  // Convenience helpers
  // =========================================================================

  describe("withChildSpan", () => {
    it("creates a span and applies initial attributes", async () => {
      const result = await withChildSpan(
        "fetch-feeds",
        (span) => {
          expect(span.attributes["feed.type"]).toBe("gtfs-rt");
          return "ok";
        },
        { "feed.type": "gtfs-rt" }
      );

      expect(result).toBe("ok");
      const completed = tracer.getCompletedSpans();
      expect(completed[0]!.attributes["feed.type"]).toBe("gtfs-rt");
    });
  });

  describe("recordEvent", () => {
    it("adds event to active span", () => {
      tracer.startSpan("test");
      recordEvent("cache.miss", { key: "arrivals:42" });

      const active = tracer.activeSpan();
      expect(active?.events).toHaveLength(1);
      expect(active?.events[0]!.name).toBe("cache.miss");
      expect(active?.events[0]!.attributes?.["key"]).toBe("arrivals:42");

      tracer.endSpan();
    });
  });

  describe("setSpanAttribute", () => {
    it("sets attribute on active span", () => {
      tracer.startSpan("test");
      setSpanAttribute("http.status_code", 200);

      const active = tracer.activeSpan();
      expect(active?.attributes["http.status_code"]).toBe(200);

      tracer.endSpan();
    });
  });

  describe("getCurrentTraceId / getCurrentSpanId", () => {
    it("returns null when no span is active", () => {
      expect(getCurrentTraceId()).toBeNull();
      expect(getCurrentSpanId()).toBeNull();
    });

    it("returns IDs when a span is active", () => {
      tracer.startSpan("active");
      expect(getCurrentTraceId()).toMatch(/^[0-9a-f]{32}$/);
      expect(getCurrentSpanId()).toMatch(/^[0-9a-f]{16}$/);
      tracer.endSpan();
    });
  });

  // =========================================================================
  // Context propagation
  // =========================================================================

  describe("W3C tracecontext extraction", () => {
    it("extracts context from headers", () => {
      const headers = new Headers();
      headers.set("traceparent", "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01");

      const context = tracer.extractContext(headers);

      expect(context).toBeTruthy();
      expect(context!.traceId).toBe("0af7651916cd43dd8448eb211c80319c");
      expect(context!.spanId).toBe("b7ad6b7169203331");
      expect(context!.sampled).toBe(true);
    });

    it("extracts unsampled context", () => {
      const headers = new Headers();
      headers.set("traceparent", "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-00");

      const context = tracer.extractContext(headers);
      expect(context!.sampled).toBe(false);
    });

    it("returns null for invalid format", () => {
      const headers = new Headers();
      headers.set("traceparent", "invalid-format");

      const context = tracer.extractContext(headers);
      expect(context).toBeNull();
    });

    it("returns null for wrong version", () => {
      const headers = new Headers();
      headers.set("traceparent", "ff-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01");

      const context = tracer.extractContext(headers);
      expect(context).toBeNull();
    });

    it("returns null when traceparent header is missing", () => {
      const headers = new Headers();
      const context = tracer.extractContext(headers);
      expect(context).toBeNull();
    });
  });

  describe("plain object extraction", () => {
    it("extracts from plain header object (lowercase key)", () => {
      const context = tracer.extractContextFromPlain({
        traceparent: "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
      });

      expect(context!.traceId).toBe("0af7651916cd43dd8448eb211c80319c");
    });

    it("extracts from plain header object (capitalized key)", () => {
      const context = tracer.extractContextFromPlain({
        TraceParent: "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
      });

      expect(context!.traceId).toBe("0af7651916cd43dd8448eb211c80319c");
    });

    it("returns null when key is absent", () => {
      const context = tracer.extractContextFromPlain({});
      expect(context).toBeNull();
    });
  });

  describe("W3C tracecontext injection", () => {
    it("injects context into headers", () => {
      const context: SpanContext = {
        traceId: "0af7651916cd43dd8448eb211c80319c",
        spanId: "b7ad6b7169203331",
        sampled: true,
      };

      const headers = new Headers();
      tracer.injectContext(context, headers);

      expect(headers.get("traceparent")).toBe(
        "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01"
      );
    });

    it("injects unsampled flag", () => {
      const context: SpanContext = {
        traceId: "0af7651916cd43dd8448eb211c80319c",
        spanId: "b7ad6b7169203331",
        sampled: false,
      };

      const headers = new Headers();
      tracer.injectContext(context, headers);

      expect(headers.get("traceparent")).toBe(
        "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-00"
      );
    });
  });

  describe("getTraceContextHeaders", () => {
    it("returns plain headers from active span", () => {
      tracer.startSpan("active");
      const headers = tracer.getTraceContextHeaders();

      expect(headers).toHaveProperty("traceparent");
      expect(headers["traceparent"]).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);

      tracer.endSpan();
    });

    it("returns empty object when no span active", () => {
      const headers = tracer.getTraceContextHeaders();
      expect(headers).toEqual({});
    });
  });

  // =========================================================================
  // Span export
  // =========================================================================

  describe("exportSpans", () => {
    it("exports completed spans with calculated duration", () => {
      const span = tracer.startSpan("test");
      const startTime = span.startTime;
      tracer.endSpan();

      const exported = tracer.exportSpans();

      expect(exported).toHaveLength(1);
      expect(exported[0]!.name).toBe("test");
      expect(exported[0]!.duration).toBeGreaterThanOrEqual(0);
      expect(exported[0]!.traceId).toBeTruthy();
      expect(exported[0]!.spanId).toBeTruthy();
      expect(exported[0]!.startTime).toBe(startTime);
      expect(exported[0]!.endTime).toBeGreaterThanOrEqual(startTime);
    });

    it("includes attributes in exported spans", () => {
      tracer.startSpan("test");
      tracer.setAttribute("key", "value");
      tracer.endSpan();

      const exported = tracer.exportSpans();
      expect(exported[0]!.attributes).toEqual({ key: "value" });
    });

    it("includes status in exported spans", () => {
      tracer.startSpan("test");
      tracer.setStatus(1, "failed");
      tracer.endSpan();

      const exported = tracer.exportSpans();
      expect(exported[0]!.status).toEqual({ code: 1, message: "failed" });
    });

    it("exports multiple spans in order", () => {
      tracer.startSpan("first");
      tracer.endSpan();
      tracer.startSpan("second");
      tracer.endSpan();

      const exported = tracer.exportSpans();
      expect(exported).toHaveLength(2);
      expect(exported[0]!.name).toBe("first");
      expect(exported[1]!.name).toBe("second");
    });
  });

  // =========================================================================
  // clearCompleted
  // =========================================================================

  describe("clearCompleted", () => {
    it("clears completed spans", () => {
      tracer.startSpan("test1");
      tracer.endSpan();
      tracer.startSpan("test2");
      tracer.endSpan();

      expect(tracer.getCompletedSpans()).toHaveLength(2);

      tracer.clearCompleted();
      expect(tracer.getCompletedSpans()).toHaveLength(0);
    });

    it("does not affect active spans", () => {
      tracer.startSpan("active");
      tracer.clearCompleted();
      expect(tracer.activeSpan()).toBeTruthy();
      tracer.endSpan();
    });
  });

  // =========================================================================
  // Independent Tracer instances
  // =========================================================================

  describe("independent Tracer instances", () => {
    it("do not share span state", () => {
      const other = new Tracer();

      tracer.startSpan("global-span");
      other.startSpan("other-span");

      expect(tracer.getCompletedSpans()).toHaveLength(0);
      expect(other.getCompletedSpans()).toHaveLength(0);

      tracer.endSpan();
      other.endSpan();

      expect(tracer.getCompletedSpans()).toHaveLength(1);
      expect(tracer.getCompletedSpans()[0]!.name).toBe("global-span");
      expect(other.getCompletedSpans()).toHaveLength(1);
      expect(other.getCompletedSpans()[0]!.name).toBe("other-span");
    });
  });
});

// ============================================================================
// Helpers
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
