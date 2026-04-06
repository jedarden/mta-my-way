/**
 * Unit tests for metrics.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { metrics } from "./metrics.js";

describe("metrics", () => {
  beforeEach(() => {
    metrics.clear();
  });

  describe("counter", () => {
    it("increments counter", () => {
      const counter = metrics.counter("test_counter", "Test counter");
      counter.inc();
      counter.inc(5);

      const allMetrics = metrics.getAll();
      const metric = allMetrics.get("test_counter");

      expect(metric?.type).toBe("counter");
      if (metric?.type === "counter") {
        expect(metric.value).toBe(6);
      }
    });

    it("resets counter", () => {
      const counter = metrics.counter("test_counter", "Test counter");
      counter.inc(10);
      counter.reset();

      const allMetrics = metrics.getAll();
      const metric = allMetrics.get("test_counter");

      if (metric?.type === "counter") {
        expect(metric.value).toBe(0);
      }
    });

    it("stores labels", () => {
      const counter = metrics.counter("test_counter", "Test counter");
      counter.inc(1, { method: "GET", path: "/api/test" });

      const allMetrics = metrics.getAll();
      const metric = allMetrics.get("test_counter");

      if (metric?.type === "counter") {
        expect(metric.labels).toEqual({ method: "GET", path: "/api/test" });
      }
    });
  });

  describe("gauge", () => {
    it("sets gauge value", () => {
      const gauge = metrics.gauge("test_gauge", "Test gauge");
      gauge.set(42);

      const allMetrics = metrics.getAll();
      const metric = allMetrics.get("test_gauge");

      if (metric?.type === "gauge") {
        expect(metric.value).toBe(42);
      }
    });

    it("increments gauge", () => {
      const gauge = metrics.gauge("test_gauge", "Test gauge");
      gauge.inc(5);
      gauge.inc(3);

      const allMetrics = metrics.getAll();
      const metric = allMetrics.get("test_gauge");

      if (metric?.type === "gauge") {
        expect(metric.value).toBe(8);
      }
    });

    it("decrements gauge", () => {
      const gauge = metrics.gauge("test_gauge", "Test gauge");
      gauge.set(10);
      gauge.dec(3);

      const allMetrics = metrics.getAll();
      const metric = allMetrics.get("test_gauge");

      if (metric?.type === "gauge") {
        expect(metric.value).toBe(7);
      }
    });
  });

  describe("histogram", () => {
    it("observes values", () => {
      const histogram = metrics.histogram("test_histogram", "Test histogram");
      histogram.observe(0.1);
      histogram.observe(0.5);
      histogram.observe(1.5);

      const allMetrics = metrics.getAll();
      const metric = allMetrics.get("test_histogram");

      if (metric?.type === "histogram") {
        expect(metric.values).toEqual([0.1, 0.5, 1.5]);
      }
    });

    it("resets histogram", () => {
      const histogram = metrics.histogram("test_histogram", "Test histogram");
      histogram.observe(0.1);
      histogram.reset();

      const allMetrics = metrics.getAll();
      const metric = allMetrics.get("test_histogram");

      if (metric?.type === "histogram") {
        expect(metric.values).toEqual([]);
      }
    });
  });

  describe("exportPrometheus", () => {
    it("exports counter in Prometheus format", () => {
      const counter = metrics.counter("http_requests_total", "Total HTTP requests");
      counter.inc(100, { method: "GET" });

      const exported = metrics.exportPrometheus();

      expect(exported).toContain("# HELP http_requests_total Total HTTP requests");
      expect(exported).toContain("# TYPE http_requests_total counter");
      expect(exported).toContain('http_requests_total{method="GET"} 100');
    });

    it("exports gauge in Prometheus format", () => {
      const gauge = metrics.gauge("active_connections", "Active connections");
      gauge.set(42);

      const exported = metrics.exportPrometheus();

      expect(exported).toContain("# HELP active_connections Active connections");
      expect(exported).toContain("# TYPE active_connections gauge");
      expect(exported).toContain("active_connections 42");
    });

    it("exports histogram in Prometheus format", () => {
      const histogram = metrics.histogram("http_duration_seconds", "HTTP request duration");
      histogram.observe(0.1);
      histogram.observe(0.5);
      histogram.observe(1.5);

      const exported = metrics.exportPrometheus();

      expect(exported).toContain("# HELP http_duration_seconds HTTP request duration");
      expect(exported).toContain("# TYPE http_duration_seconds histogram");
      expect(exported).toContain("http_duration_seconds_count");
      expect(exported).toContain("http_duration_seconds_sum");
      expect(exported).toContain("http_duration_seconds_bucket");
    });

    it("sanitizes metric names", () => {
      metrics.counter("test/invalid-name", "Test").inc(1);

      const exported = metrics.exportPrometheus();
      expect(exported).toContain("test_invalid-name");
    });
  });

  describe("common metrics", () => {
    it("provides common application metrics", async () => {
      const { metrics: m } = await import("./metrics.js");

      expect(m.httpRequestsTotal).toBeDefined();
      expect(m.httpRequestDuration).toBeDefined();
      expect(m.cacheHits).toBeDefined();
      expect(m.cacheMisses).toBeDefined();
      expect(m.feedPollDuration).toBeDefined();
      expect(m.feedErrors).toBeDefined();
      expect(m.pushNotificationsSent).toBeDefined();
      expect(m.pushNotificationsFailed).toBeDefined();
    });
  });
});
