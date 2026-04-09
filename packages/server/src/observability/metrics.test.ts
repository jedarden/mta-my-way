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
      const metricMap = allMetrics.get("test_counter");
      expect(metricMap).toBeDefined();

      const defaultKey = "";
      const metric = metricMap?.get(defaultKey);
      expect(metric?.metric.type).toBe("counter");
      if (metric?.metric.type === "counter") {
        expect(metric.metric.value).toBe(6);
      }
    });

    it("increments counter with labels", () => {
      const counter = metrics.counter("test_counter", "Test counter");
      counter.inc(1, { method: "GET" });
      counter.inc(2, { method: "POST" });

      const allMetrics = metrics.getAll();
      const metricMap = allMetrics.get("test_counter");

      const getMetric = metricMap?.get('method="GET"');
      const postMetric = metricMap?.get('method="POST"');

      if (getMetric?.metric.type === "counter") {
        expect(getMetric.metric.value).toBe(1);
      }
      if (postMetric?.metric.type === "counter") {
        expect(postMetric.metric.value).toBe(2);
      }
    });

    it("resets counter", () => {
      const counter = metrics.counter("test_counter", "Test counter");
      counter.inc(10);
      counter.reset();

      const allMetrics = metrics.getAll();
      const metricMap = allMetrics.get("test_counter");
      const defaultKey = "";
      const metric = metricMap?.get(defaultKey);

      if (metric?.metric.type === "counter") {
        expect(metric.metric.value).toBe(0);
      }
    });
  });

  describe("gauge", () => {
    it("sets gauge value", () => {
      const gauge = metrics.gauge("test_gauge", "Test gauge");
      gauge.set(42);

      const allMetrics = metrics.getAll();
      const metricMap = allMetrics.get("test_gauge");
      const defaultKey = "";
      const metric = metricMap?.get(defaultKey);

      if (metric?.metric.type === "gauge") {
        expect(metric.metric.value).toBe(42);
      }
    });

    it("increments gauge", () => {
      const gauge = metrics.gauge("test_gauge", "Test gauge");
      gauge.inc(5);
      gauge.inc(3);

      const allMetrics = metrics.getAll();
      const metricMap = allMetrics.get("test_gauge");
      const defaultKey = "";
      const metric = metricMap?.get(defaultKey);

      if (metric?.metric.type === "gauge") {
        expect(metric.metric.value).toBe(8);
      }
    });

    it("decrements gauge", () => {
      const gauge = metrics.gauge("test_gauge", "Test gauge");
      gauge.set(10);
      gauge.dec(3);

      const allMetrics = metrics.getAll();
      const metricMap = allMetrics.get("test_gauge");
      const defaultKey = "";
      const metric = metricMap?.get(defaultKey);

      if (metric?.metric.type === "gauge") {
        expect(metric.metric.value).toBe(7);
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
      const metricMap = allMetrics.get("test_histogram");
      const defaultKey = "";
      const metric = metricMap?.get(defaultKey);

      if (metric?.metric.type === "histogram") {
        expect(metric.metric.values).toEqual([0.1, 0.5, 1.5]);
      }
    });

    it("resets histogram", () => {
      const histogram = metrics.histogram("test_histogram", "Test histogram");
      histogram.observe(0.1);
      histogram.reset();

      const allMetrics = metrics.getAll();
      const metricMap = allMetrics.get("test_histogram");
      const defaultKey = "";
      const metric = metricMap?.get(defaultKey);

      if (metric?.metric.type === "histogram") {
        expect(metric.metric.values).toEqual([]);
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
      // Sanitization replaces / and - with _
      expect(exported).toContain("test_invalid_name");
    });

    it("exports multiple labeled metrics", () => {
      const counter = metrics.counter("api_requests", "API requests");
      counter.inc(5, { method: "GET", route: "/api/stations" });
      counter.inc(3, { method: "POST", route: "/api/trips" });

      const exported = metrics.exportPrometheus();

      expect(exported).toContain('api_requests{method="GET",route="/api/stations"} 5');
      expect(exported).toContain('api_requests{method="POST",route="/api/trips"} 3');
    });

    it("exports histogram buckets with labels", () => {
      const histogram = metrics.histogram("response_time", "Response time");
      histogram.observe(0.05, { endpoint: "/api/health" });
      histogram.observe(0.15, { endpoint: "/api/health" });
      histogram.observe(0.5, { endpoint: "/api/stations" });

      const exported = metrics.exportPrometheus();

      // Check that labels are included in bucket exports
      expect(exported).toContain('response_time_bucket{endpoint="/api/health",le="0.001"}');
      expect(exported).toContain('response_time_bucket{endpoint="/api/health",le="0.005"}');
      expect(exported).toContain('response_time_bucket{endpoint="/api/health",le="+Inf"}');
    });
  });

  describe("default labels", () => {
    it("merges default labels with provided labels", () => {
      metrics.setDefaultLabels({ service: "mta-my-way", environment: "production" });

      const counter = metrics.counter("test_counter", "Test counter");
      counter.inc(1, { method: "GET" });

      const allMetrics = metrics.getAll();
      const metricMap = allMetrics.get("test_counter");

      // Should have both default and provided labels
      const metric = metricMap?.values().next().value;
      expect(metric?.labels).toEqual({
        service: "mta-my-way",
        environment: "production",
        method: "GET",
      });
    });

    it("allows provided labels to override default labels", () => {
      metrics.setDefaultLabels({ service: "mta-my-way", environment: "production" });

      const counter = metrics.counter("test_counter", "Test counter");
      counter.inc(1, { environment: "staging" });

      const allMetrics = metrics.getAll();
      const metricMap = allMetrics.get("test_counter");

      const metric = metricMap?.values().next().value;
      expect(metric?.labels).toEqual({
        service: "mta-my-way",
        environment: "staging", // Provided label overrides default
      });
    });
  });

  describe("common metrics", () => {
    it("provides common application metrics", async () => {
      const m = await import("./metrics.js");

      expect(m.httpRequestsTotal).toBeDefined();
      expect(m.httpRequestDuration).toBeDefined();
      expect(m.cacheHits).toBeDefined();
      expect(m.cacheMisses).toBeDefined();
      expect(m.feedPollDuration).toBeDefined();
      expect(m.feedErrors).toBeDefined();
      expect(m.pushNotificationsSent).toBeDefined();
      expect(m.pushNotificationsFailed).toBeDefined();
      expect(m.tripsCreated).toBeDefined();
      expect(m.tripsActive).toBeDefined();
      expect(m.alertsActive).toBeDefined();
      expect(m.equipmentOutages).toBeDefined();
    });
  });
});
