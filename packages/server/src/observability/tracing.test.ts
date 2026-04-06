/**
 * Unit tests for tracing.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { tracer } from "./tracing.js";

describe("tracer", () => {
  beforeEach(() => {
    tracer.clearCompleted();
  });

  describe("startSpan and endSpan", () => {
    it("starts and ends a span", () => {
      const span = tracer.startSpan("test-operation");
      expect(span.name).toBe("test-operation");
      expect(span.context.traceId).toBeTruthy();
      expect(span.context.spanId).toBeTruthy();
      expect(span.startTime).toBeLessThanOrEqual(Date.now());

      tracer.endSpan();

      const completed = tracer.getCompletedSpans();
      expect(completed).toHaveLength(1);
      expect(completed[0].name).toBe("test-operation");
      expect(completed[0].endTime).toBeTruthy();
    });

    it("creates parent-child relationships", () => {
      const parent = tracer.startSpan("parent");
      const child = tracer.startSpan("child");

      expect(child.context.parentSpanId).toBe(parent.context.spanId);
      expect(child.context.traceId).toBe(parent.context.traceId);

      tracer.endSpan(); // end child
      tracer.endSpan(); // end parent
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
      expect(active?.events[0].name).toBe("database.query");

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
  });

  describe("withSpan", () => {
    it("runs function within span", async () => {
      const result = await tracer.withSpan("async-operation", async (span) => {
        expect(span.name).toBe("async-operation");
        return "operation-result";
      });

      expect(result).toBe("operation-result");

      const completed = tracer.getCompletedSpans();
      expect(completed).toHaveLength(1);
    });

    it("sets error status on exception", async () => {
      await expect(
        tracer.withSpan("failing-operation", async () => {
          throw new Error("Operation failed");
        })
      ).rejects.toThrow("Operation failed");

      const completed = tracer.getCompletedSpans();
      expect(completed[0].status).toEqual({ code: 1, message: "Operation failed" });
    });

    it("respects parent context", async () => {
      const parentContext = {
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
  });

  describe("context propagation", () => {
    it("extracts context from headers", () => {
      const headers = new Headers();
      headers.set("traceparent", "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01");

      const context = tracer.extractContext(headers);

      expect(context).toBeTruthy();
      expect(context?.traceId).toBe("0af7651916cd43dd8448eb211c80319c");
      expect(context?.spanId).toBe("b7ad6b7169203331");
      expect(context?.sampled).toBe(true);
    });

    it("returns null for invalid traceparent", () => {
      const headers = new Headers();
      headers.set("traceparent", "invalid-format");

      const context = tracer.extractContext(headers);
      expect(context).toBeNull();
    });

    it("returns null when traceparent header is missing", () => {
      const headers = new Headers();
      const context = tracer.extractContext(headers);
      expect(context).toBeNull();
    });

    it("injects context into headers", () => {
      const context = {
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
  });

  describe("exportSpans", () => {
    it("exports completed spans with calculated duration", () => {
      const span = tracer.startSpan("test");
      const startTime = span.startTime;
      tracer.endSpan();

      const exported = tracer.exportSpans();

      expect(exported).toHaveLength(1);
      expect(exported[0].name).toBe("test");
      // Duration should be a non-negative number (endTime - startTime)
      // Can be 0 if span starts/ends within same millisecond
      expect(exported[0].duration).toBeGreaterThanOrEqual(0);
      expect(exported[0].traceId).toBeTruthy();
      expect(exported[0].spanId).toBeTruthy();
      expect(exported[0].startTime).toBe(startTime);
      expect(exported[0].endTime).toBeGreaterThanOrEqual(startTime);
    });

    it("includes attributes in exported spans", () => {
      tracer.startSpan("test");
      tracer.setAttribute("key", "value");
      tracer.endSpan();

      const exported = tracer.exportSpans();
      expect(exported[0].attributes).toEqual({ key: "value" });
    });
  });

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
  });
});
