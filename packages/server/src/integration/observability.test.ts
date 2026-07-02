/**
 * Integration tests for the observability stack.
 *
 * Verifies end-to-end behavior of:
 * - W3C traceparent header propagation (incoming → outgoing)
 * - X-Request-ID presence on all responses
 * - x-trace-id presence on all responses
 * - /api/metrics Prometheus output completeness
 * - Correlation: trace ID matches across request/response cycle
 */

import type { ComplexIndex, RouteIndex, TransferConnection } from "@mta-my-way/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { TEST_STATIONS } from "./test-helpers.js";

// ---------------------------------------------------------------------------
// Test fixtures (minimal — we only need the app to boot)
// ---------------------------------------------------------------------------

const TEST_ROUTES: RouteIndex = {
  "1": {
    id: "1",
    shortName: "1",
    longName: "Broadway-7th Ave Local",
    color: "#EE352E",
    textColor: "#FFFFFF",
    feedId: "gtfs",
    division: "A",
    stops: ["101", "102"],
    isExpress: false,
  },
};

const TEST_COMPLEXES: ComplexIndex = {};
const TEST_TRANSFERS: Record<string, TransferConnection[]> = {};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("Observability Integration Tests", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp(
      TEST_STATIONS,
      TEST_ROUTES,
      TEST_COMPLEXES,
      TEST_TRANSFERS,
      "/nonexistent/dist"
    );
  });

  // -------------------------------------------------------------------------
  // X-Request-ID header
  // -------------------------------------------------------------------------

  describe("X-Request-ID header", () => {
    it("is present on all API responses", async () => {
      const res = await app.request("/api/health");
      expect(res.headers.get("X-Request-ID")).toBeTruthy();
    });

    it("is a valid UUID when no incoming ID is provided", async () => {
      const res = await app.request("/api/health");
      const id = res.headers.get("X-Request-ID");
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it("echoes back a valid incoming X-Request-ID", async () => {
      const incomingId = "my-request-abc123";
      const res = await app.request("/api/health", {
        headers: { "X-Request-ID": incomingId },
      });
      expect(res.headers.get("X-Request-ID")).toBe(incomingId);
    });

    it("generates a fresh UUID when the incoming ID is invalid", async () => {
      const res = await app.request("/api/health", {
        headers: { "X-Request-ID": "<script>bad</script>" },
      });
      const id = res.headers.get("X-Request-ID");
      expect(id).not.toContain("<");
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/i);
    });

    it("is unique across independent requests", async () => {
      const [res1, res2] = await Promise.all([
        app.request("/api/health"),
        app.request("/api/health"),
      ]);
      const id1 = res1.headers.get("X-Request-ID");
      const id2 = res2.headers.get("X-Request-ID");
      expect(id1).toBeTruthy();
      expect(id2).toBeTruthy();
      expect(id1).not.toBe(id2);
    });

    it("is present on metrics endpoint responses too", async () => {
      const res = await app.request("/api/metrics");
      expect(res.headers.get("X-Request-ID")).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // W3C Distributed Tracing (traceparent / x-trace-id)
  // -------------------------------------------------------------------------

  describe("distributed tracing headers", () => {
    it("x-trace-id is present on API responses", async () => {
      const res = await app.request("/api/health");
      expect(res.headers.get("x-trace-id")).toBeTruthy();
    });

    it("x-trace-id is a 32-hex-char trace ID", async () => {
      const res = await app.request("/api/health");
      const traceId = res.headers.get("x-trace-id");
      expect(traceId).toMatch(/^[0-9a-f]{32}$/);
    });

    it("traceparent response header is present", async () => {
      const res = await app.request("/api/health");
      expect(res.headers.get("traceparent")).toBeTruthy();
    });

    it("traceparent response header is well-formed W3C format", async () => {
      const res = await app.request("/api/health");
      const tp = res.headers.get("traceparent");
      // W3C format: 00-<32-hex>-<16-hex>-<flags>
      expect(tp).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/);
    });

    it("propagates trace ID from incoming traceparent header", async () => {
      const incomingTraceId = "0af7651916cd43dd8448eb211c80319c";
      const incomingSpanId = "b7ad6b7169203331";
      const incomingTraceparent = `00-${incomingTraceId}-${incomingSpanId}-01`;

      const res = await app.request("/api/health", {
        headers: { traceparent: incomingTraceparent },
      });

      // The response traceparent should preserve the incoming trace ID
      const outgoingTraceparent = res.headers.get("traceparent");
      expect(outgoingTraceparent).toBeTruthy();
      expect(outgoingTraceparent).toContain(incomingTraceId);

      // x-trace-id should also reflect the propagated trace ID
      const outgoingTraceId = res.headers.get("x-trace-id");
      expect(outgoingTraceId).toBe(incomingTraceId);
    });

    it("trace ID in traceparent matches x-trace-id header", async () => {
      const res = await app.request("/api/health");
      const tp = res.headers.get("traceparent");
      const traceId = res.headers.get("x-trace-id");

      // Extract trace ID from traceparent: 00-<traceId>-<spanId>-<flags>
      const parts = tp?.split("-");
      expect(parts).toHaveLength(4);
      expect(parts?.[1]).toBe(traceId);
    });

    it("each request gets a distinct trace ID when no incoming context", async () => {
      const [res1, res2] = await Promise.all([
        app.request("/api/stations"),
        app.request("/api/stations"),
      ]);
      const t1 = res1.headers.get("x-trace-id");
      const t2 = res2.headers.get("x-trace-id");
      expect(t1).toBeTruthy();
      expect(t2).toBeTruthy();
      expect(t1).not.toBe(t2);
    });

    it("trace headers are present on metrics endpoint", async () => {
      const res = await app.request("/api/metrics");
      expect(res.headers.get("x-trace-id")).toBeTruthy();
      expect(res.headers.get("traceparent")).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // /api/metrics — Prometheus format
  // -------------------------------------------------------------------------

  describe("/api/metrics endpoint", () => {
    it("returns 200 with text/plain content type", async () => {
      const res = await app.request("/api/metrics");
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("text/plain");
    });

    it("includes # HELP lines for registered metrics", async () => {
      const res = await app.request("/api/metrics");
      const text = await res.text();
      expect(text).toContain("# HELP");
    });

    it("includes # TYPE lines for registered metrics", async () => {
      const res = await app.request("/api/metrics");
      const text = await res.text();
      expect(text).toContain("# TYPE");
    });

    it("registers counter metrics for HTTP requests", async () => {
      // Make a request first to ensure the counter has been touched
      await app.request("/api/health");
      const res = await app.request("/api/metrics");
      const text = await res.text();
      // The http_requests_total counter is registered in observability/metrics.ts
      expect(text).toContain("http_requests_total");
    });

    it("registers histogram metrics for request duration", async () => {
      const res = await app.request("/api/metrics");
      const text = await res.text();
      expect(text).toContain("http_request_duration_seconds");
    });

    it("registers cache hit/miss counters", async () => {
      const res = await app.request("/api/metrics");
      const text = await res.text();
      expect(text).toContain("cache_hits_total");
      expect(text).toContain("cache_misses_total");
    });

    it("registers push notification metrics", async () => {
      const res = await app.request("/api/metrics");
      const text = await res.text();
      expect(text).toContain("push_notifications_sent_total");
      expect(text).toContain("push_notifications_failed_total");
    });

    it("registers trip lifecycle metrics", async () => {
      const res = await app.request("/api/metrics");
      const text = await res.text();
      expect(text).toContain("trips_created_total");
    });

    it("includes histogram bucket lines in output", async () => {
      const res = await app.request("/api/metrics");
      const text = await res.text();
      expect(text).toContain("_bucket{");
    });

    it("includes _count and _sum for histograms", async () => {
      const res = await app.request("/api/metrics");
      const text = await res.text();
      expect(text).toContain("_count");
      expect(text).toContain("_sum");
    });

    it("metric output is non-empty after a request", async () => {
      await app.request("/api/health");
      const res = await app.request("/api/metrics");
      const text = await res.text();
      expect(text.length).toBeGreaterThan(100);
    });
  });

  // -------------------------------------------------------------------------
  // Cross-cutting header correlation
  // -------------------------------------------------------------------------

  describe("header correlation", () => {
    it("X-Request-ID and x-trace-id are both present and non-null on any API response", async () => {
      const endpoints = ["/api/health", "/api/stations", "/api/routes"];
      await Promise.all(
        endpoints.map(async (path) => {
          const res = await app.request(path);
          expect(res.headers.get("X-Request-ID"), `${path}: X-Request-ID`).toBeTruthy();
          expect(res.headers.get("x-trace-id"), `${path}: x-trace-id`).toBeTruthy();
        })
      );
    });

    it("security headers are present alongside observability headers", async () => {
      const res = await app.request("/api/health");
      // Security headers (from securityHeaders middleware)
      expect(res.headers.get("X-Content-Type-Options")).toBeTruthy();
      // Observability headers
      expect(res.headers.get("X-Request-ID")).toBeTruthy();
      expect(res.headers.get("x-trace-id")).toBeTruthy();
    });
  });
});
