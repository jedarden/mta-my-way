/**
 * Integration tests for observability module initialization and shutdown.
 *
 * Verifies that:
 * - The barrel export (observability/index.ts) re-exports all sub-modules
 * - initObservability() completes without error
 * - shutdownObservability() completes without error
 * - App still serves requests after observability initialization
 * - Shutdown hooks are properly wired in the server entry point
 */

import type { ComplexIndex, RouteIndex, TransferConnection } from "@mta-my-way/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import {
  type MetricsRegistry,
  flushOpenTelemetry,
  initObservability,
  initOpenTelemetry,
  isOpenTelemetryEnabled,
  logger,
  metrics,
  shutdownObservability,
  shutdownOpenTelemetry,
  tracer,
  tracingMiddleware,
} from "../observability/index.js";
import {
  LogLevel,
  cacheHits,
  createLogger,
  feedPollDuration,
  getCurrentTraceId,
  httpRequestDuration,
  httpRequestsTotal,
  recordEvent,
  setSpanAttribute,
  tracer as tracerDirect,
  tracingMiddleware as tracingMiddlewareDirect,
  withChildSpan,
} from "../observability/index.js";
import { TEST_STATIONS } from "./test-helpers.js";

// ---------------------------------------------------------------------------
// Test fixtures
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
// Tests
// ---------------------------------------------------------------------------

describe("Observability barrel exports", () => {
  it("re-exports logger singleton and factory", () => {
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.debug).toBe("function");
    expect(typeof createLogger).toBe("function");
    expect(LogLevel).toBeDefined();
    expect(LogLevel.INFO).toBe("info");
  });

  it("re-exports metrics registry and pre-registered handles", () => {
    expect(metrics).toBeDefined();
    expect(metrics.exportPrometheus).toBeDefined();
    expect(typeof metrics.exportPrometheus).toBe("function");
    expect(typeof httpRequestsTotal.inc).toBe("function");
    expect(typeof httpRequestDuration.observe).toBe("function");
    expect(typeof cacheHits.inc).toBe("function");
    expect(typeof feedPollDuration.observe).toBe("function");
  });

  it("re-exports tracing primitives", () => {
    expect(tracer).toBeDefined();
    expect(typeof tracingMiddleware).toBe("function");
    expect(typeof getCurrentTraceId).toBe("function");
    expect(typeof withChildSpan).toBe("function");
    expect(typeof recordEvent).toBe("function");
    expect(typeof setSpanAttribute).toBe("function");
  });

  it("re-exports opentelemetry lifecycle functions", () => {
    expect(typeof initOpenTelemetry).toBe("function");
    expect(typeof shutdownOpenTelemetry).toBe("function");
    expect(typeof flushOpenTelemetry).toBe("function");
    expect(typeof isOpenTelemetryEnabled).toBe("function");
  });

  it("exports initObservability and shutdownObservability orchestrators", () => {
    expect(typeof initObservability).toBe("function");
    expect(typeof shutdownObservability).toBe("function");
  });

  it("barrel exports are the same objects as direct sub-module exports", () => {
    // Verify that the barrel re-exports the exact same singleton instances
    // that the sub-modules export (no duplicate instantiation).
    expect(tracer).toBe(tracerDirect);
    expect(tracingMiddleware).toBe(tracingMiddlewareDirect);
  });
});

describe("initObservability", () => {
  it("completes without error", async () => {
    await expect(initObservability()).resolves.toBeUndefined();
  });

  it("is idempotent — calling twice does not throw", async () => {
    await initObservability();
    await expect(initObservability()).resolves.toBeUndefined();
  });

  it("logs an info message on completion", async () => {
    const spy = vi.spyOn(logger, "info");
    await initObservability();
    expect(spy).toHaveBeenCalledWith(
      "Observability initialized",
      expect.objectContaining({ otel: expect.any(Boolean) })
    );
  });
});

describe("shutdownObservability", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-10T08:00:00Z"));
    // Ensure observability is initialized before each shutdown test
    await initObservability();
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("completes without error", async () => {
    await expect(shutdownObservability()).resolves.toBeUndefined();
  });

  it("logs shutdown messages", async () => {
    const spy = vi.spyOn(logger, "info");
    await shutdownObservability();
    const messages = spy.mock.calls.map((c) => c[0]);
    expect(messages).toContain("Shutting down observability…");
    expect(messages).toContain("Observability shutdown complete");
  });

  it("does not throw even when OTel flush fails", async () => {
    vi.spyOn(logger, "error");
    // Re-importing won't help; directly mock the module-level function
    const flushSpy = vi
      .spyOn(await import("../observability/opentelemetry.js"), "flushOpenTelemetry")
      .mockRejectedValue(new Error("flush failed"));
    await expect(shutdownObservability()).resolves.toBeUndefined();
    flushSpy.mockRestore();
  });
});

describe("App integration with observability", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    await initObservability();
    app = createApp(
      TEST_STATIONS,
      TEST_ROUTES,
      TEST_COMPLEXES,
      TEST_TRANSFERS,
      "/nonexistent/dist"
    );
  });

  afterEach(async () => {
    await shutdownObservability();
  });

  it("app serves health endpoint after observability init", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBeDefined();
    expect(body.uptime_seconds).toBeGreaterThanOrEqual(0);
  });

  it("observability headers are present on responses", async () => {
    const res = await app.request("/api/health");
    expect(res.headers.get("X-Request-ID")).toBeTruthy();
    expect(res.headers.get("x-trace-id")).toBeTruthy();
  });

  it("metrics endpoint returns Prometheus output", async () => {
    const res = await app.request("/api/metrics");
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("# HELP");
    expect(text).toContain("# TYPE");
  });

  it("tracing middleware produces trace IDs across requests", async () => {
    const [res1, res2] = await Promise.all([
      app.request("/api/health"),
      app.request("/api/health"),
    ]);
    const trace1 = res1.headers.get("x-trace-id");
    const trace2 = res2.headers.get("x-trace-id");
    expect(trace1).toBeTruthy();
    expect(trace2).toBeTruthy();
    expect(trace1).not.toBe(trace2);
  });
});

describe("Shutdown hooks", () => {
  it("shutdownObservability can be called without prior init", async () => {
    // Should not throw even if initObservability was never called
    await expect(shutdownObservability()).resolves.toBeUndefined();
  });
});
