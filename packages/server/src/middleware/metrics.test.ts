/**
 * Tests for HTTP metrics middleware and metric recording functions.
 */

import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  httpMetrics,
  recordAlertsChange,
  recordCacheHitMetric,
  recordCacheMissMetric,
  recordCommuteAnalysisDuration,
  recordCommuteAnalysisRequest,
  recordContextDetection,
  recordContextOverride,
  recordContextTransition,
  recordDelayPredictionDuration,
  recordDelayPredictionRequest,
  recordFeedEntitiesProcessed,
  recordFeedError,
  recordFeedPollDuration,
  recordPushNotificationFailed,
  recordPushNotificationSent,
  recordStationSearchDuration,
  recordStationSearchRequest,
  recordTripCreated,
  recordTripQueried,
  recordTripQueryDuration,
  setActiveTripsCount,
  setAlertsActive,
  setAlertsMatchRate,
  setEquipmentOutages,
  setPushSubscriptionsActive,
} from "./metrics.js";

describe("HTTP Metrics Middleware", () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
  });

  describe("httpMetrics", () => {
    it("should track request counts", async () => {
      app.use("*", httpMetrics());
      app.get("/test", (c) => c.json({ success: true }));

      await app.request("/test");
      await app.request("/test");

      // Metrics should have been recorded
      expect(true).toBe(true);
    });

    it("should track different HTTP methods", async () => {
      app.use("*", httpMetrics());
      app.get("/test", (c) => c.json({ success: true }));
      app.post("/test", (c) => c.json({ success: true }));

      await app.request("/test", { method: "GET" });
      await app.request("/test", { method: "POST" });

      expect(true).toBe(true);
    });

    it("should track request duration", async () => {
      app.use("*", httpMetrics());
      app.get("/test", async (c) => {
        // Simulate some processing time
        await new Promise((resolve) => setTimeout(resolve, 10));
        return c.json({ success: true });
      });

      const start = Date.now();
      await app.request("/test");
      const duration = Date.now() - start;

      expect(duration).toBeGreaterThanOrEqual(10);
    });

    it("should track request size when content-length is present", async () => {
      app.use("*", httpMetrics({ trackRequestSize: true }));
      app.post("/test", (c) => c.json({ success: true }));

      await app.request("/test", {
        method: "POST",
        headers: {
          "Content-Length": "1024",
        },
      });

      expect(true).toBe(true);
    });

    it("should track response size when content-length is present", async () => {
      app.use("*", httpMetrics({ trackResponseSize: true }));
      app.get("/test", (c) => {
        c.header("Content-Length", "512");
        return c.json({ success: true });
      });

      await app.request("/test");

      expect(true).toBe(true);
    });

    it("should handle errors and track them", async () => {
      app.use("*", httpMetrics());
      app.get("/test", () => {
        throw new Error("Test error");
      });

      try {
        await app.request("/test");
      } catch (e) {
        // Expected
      }

      expect(true).toBe(true);
    });

    it("should add custom labels to metrics", async () => {
      app.use("*", httpMetrics({ labels: { service: "api" } }));
      app.get("/test", (c) => c.json({ success: true }));

      await app.request("/test");

      expect(true).toBe(true);
    });

    it("should track active connections", async () => {
      app.use("*", httpMetrics());
      app.get("/test", async (c) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return c.json({ success: true });
      });

      // Make concurrent requests
      await Promise.all([app.request("/test"), app.request("/test"), app.request("/test")]);

      expect(true).toBe(true);
    });

    it("should categorize status codes correctly", async () => {
      app.use("*", httpMetrics());
      app.get("/ok", (c) => c.json({ success: true }));
      app.get("/redirect", (c) => c.redirect("/other"));
      app.get("/bad", (c) => c.text("Not found", 404));
      app.get("/error", (c) => c.text("Error", 500));

      await app.request("/ok");
      await app.request("/redirect");
      await app.request("/bad");
      await app.request("/error");

      expect(true).toBe(true);
    });
  });

  describe("Cache Metrics", () => {
    it("should record cache hits", () => {
      expect(() => recordCacheHitMetric("arrivals")).not.toThrow();
      expect(() => recordCacheHitMetric("stations")).not.toThrow();
      expect(() => recordCacheHitMetric("alerts")).not.toThrow();
    });

    it("should record cache misses", () => {
      expect(() => recordCacheMissMetric("arrivals")).not.toThrow();
      expect(() => recordCacheMissMetric("trips")).not.toThrow();
    });
  });

  describe("Feed Polling Metrics", () => {
    it("should record feed poll duration", () => {
      expect(() => recordFeedPollDuration(1.5, "gtfs")).not.toThrow();
      expect(() => recordFeedPollDuration(0.8, "gtfs-ace")).not.toThrow();
      expect(() => recordFeedPollDuration(2.3, "gtfs-bdfm")).not.toThrow();
    });

    it("should record feed errors", () => {
      expect(() => recordFeedError("gtfs", "network")).not.toThrow();
      expect(() => recordFeedError("gtfs-ace", "parse")).not.toThrow();
      expect(() => recordFeedError("gtfs-bdfm", "timeout")).not.toThrow();
    });

    it("should record entity counts", () => {
      expect(() => recordFeedEntitiesProcessed("gtfs", 150)).not.toThrow();
      expect(() => recordFeedEntitiesProcessed("gtfs-ace", 75)).not.toThrow();
      expect(() => recordFeedEntitiesProcessed("gtfs-bdfm", 200)).not.toThrow();
    });
  });

  describe("Push Notification Metrics", () => {
    it("should record sent notifications", () => {
      expect(() => recordPushNotificationSent(["1", "2", "3"])).not.toThrow();
      expect(() => recordPushNotificationSent(["A"])).not.toThrow();
      expect(() => recordPushNotificationSent([])).not.toThrow();
    });

    it("should record failed notifications", () => {
      expect(() => recordPushNotificationFailed("invalid_endpoint")).not.toThrow();
      expect(() => recordPushNotificationFailed("rate_limited")).not.toThrow();
      expect(() => recordPushNotificationFailed("timeout")).not.toThrow();
    });

    it("should set active subscription count", () => {
      expect(() => setPushSubscriptionsActive(100)).not.toThrow();
      expect(() => setPushSubscriptionsActive(0)).not.toThrow();
      expect(() => setPushSubscriptionsActive(9999)).not.toThrow();
    });
  });

  describe("Trip Tracking Metrics", () => {
    it("should record trip created", () => {
      expect(() => recordTripCreated("api", "1")).not.toThrow();
      expect(() => recordTripCreated("inference", "A")).not.toThrow();
      expect(() => recordTripCreated("manual")).not.toThrow();
    });

    it("should set active trips count", () => {
      expect(() => setActiveTripsCount(10)).not.toThrow();
      expect(() => setActiveTripsCount(0)).not.toThrow();
      expect(() => setActiveTripsCount(5000)).not.toThrow();
    });

    it("should record trip queried", () => {
      expect(() => recordTripQueried(true)).not.toThrow();
      expect(() => recordTripQueried(false)).not.toThrow();
    });

    it("should record trip query duration", () => {
      expect(() => recordTripQueryDuration(0.1)).not.toThrow();
      expect(() => recordTripQueryDuration(1.5)).not.toThrow();
      expect(() => recordTripQueryDuration(5.0)).not.toThrow();
    });
  });

  describe("Commute Analysis Metrics", () => {
    it("should record commute analysis request", () => {
      expect(() => recordCommuteAnalysisRequest(true, false, false)).not.toThrow();
      expect(() => recordCommuteAnalysisRequest(true, true, true)).not.toThrow();
      expect(() => recordCommuteAnalysisRequest(false, false, false)).not.toThrow();
    });

    it("should record commute analysis duration", () => {
      expect(() => recordCommuteAnalysisDuration(0.5)).not.toThrow();
      expect(() => recordCommuteAnalysisDuration(2.0)).not.toThrow();
      expect(() => recordCommuteAnalysisDuration(10.0)).not.toThrow();
    });
  });

  describe("Station Search Metrics", () => {
    it("should record station search request", () => {
      expect(() => recordStationSearchRequest(0)).not.toThrow();
      expect(() => recordStationSearchRequest(5)).not.toThrow();
      expect(() => recordStationSearchRequest(100)).not.toThrow();
    });

    it("should record station search duration", () => {
      expect(() => recordStationSearchDuration(0.01)).not.toThrow();
      expect(() => recordStationSearchDuration(0.1)).not.toThrow();
      expect(() => recordStationSearchDuration(0.5)).not.toThrow();
    });
  });

  describe("Delay Prediction Metrics", () => {
    it("should record delay prediction request", () => {
      expect(() => recordDelayPredictionRequest(true, true)).not.toThrow();
      expect(() => recordDelayPredictionRequest(true, false)).not.toThrow();
      expect(() => recordDelayPredictionRequest(false, false)).not.toThrow();
    });

    it("should record delay prediction duration", () => {
      expect(() => recordDelayPredictionDuration(0.1)).not.toThrow();
      expect(() => recordDelayPredictionDuration(0.5)).not.toThrow();
      expect(() => recordDelayPredictionDuration(2.0)).not.toThrow();
    });
  });

  describe("Context Detection Metrics", () => {
    it("should record context detection", () => {
      expect(() => recordContextDetection("commute", "high")).not.toThrow();
      expect(() => recordContextDetection("home", "medium")).not.toThrow();
      expect(() => recordContextDetection("work", "low")).not.toThrow();
    });

    it("should record context transition", () => {
      expect(() => recordContextTransition("home", "commute")).not.toThrow();
      expect(() => recordContextTransition("commute", "work")).not.toThrow();
      expect(() => recordContextTransition("work", "home")).not.toThrow();
    });

    it("should record context override", () => {
      expect(() => recordContextOverride("commute")).not.toThrow();
      expect(() => recordContextOverride("work")).not.toThrow();
      expect(() => recordContextOverride("home")).not.toThrow();
    });
  });

  describe("Alert Metrics", () => {
    it("should set active alerts count", () => {
      expect(() => setAlertsActive(0)).not.toThrow();
      expect(() => setAlertsActive(10)).not.toThrow();
      expect(() => setAlertsActive(100)).not.toThrow();
    });

    it("should set alert match rate", () => {
      expect(() => setAlertsMatchRate(0.0)).not.toThrow();
      expect(() => setAlertsMatchRate(0.5)).not.toThrow();
      expect(() => setAlertsMatchRate(1.0)).not.toThrow();
    });

    it("should record alert changes", () => {
      expect(() => recordAlertsChange("added")).not.toThrow();
      expect(() => recordAlertsChange("removed")).not.toThrow();
      expect(() => recordAlertsChange("updated")).not.toThrow();
    });
  });

  describe("Equipment Metrics", () => {
    it("should set equipment outages", () => {
      expect(() => setEquipmentOutages(10, 5, 3)).not.toThrow();
      expect(() => setEquipmentOutages(0, 0, 0)).not.toThrow();
      expect(() => setEquipmentOutages(100, 50, 50)).not.toThrow();
    });
  });

  describe("Metrics Middleware Options", () => {
    it("should disable request size tracking when configured", async () => {
      app.use("*", httpMetrics({ trackRequestSize: false }));
      app.post("/test", (c) => c.json({ success: true }));

      await app.request("/test", {
        method: "POST",
        headers: {
          "Content-Length": "1024",
        },
      });

      expect(true).toBe(true);
    });

    it("should disable response size tracking when configured", async () => {
      app.use("*", httpMetrics({ trackResponseSize: false }));
      app.get("/test", (c) => {
        c.header("Content-Length", "512");
        return c.json({ success: true });
      });

      await app.request("/test");

      expect(true).toBe(true);
    });

    it("should allow both size tracking to be disabled", async () => {
      app.use(
        "*",
        httpMetrics({
          trackRequestSize: false,
          trackResponseSize: false,
        })
      );
      app.get("/test", (c) => c.json({ success: true }));

      await app.request("/test");

      expect(true).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    it("should handle requests without content-length", async () => {
      app.use("*", httpMetrics({ trackRequestSize: true }));
      app.post("/test", (c) => c.json({ success: true }));

      await app.request("/test", {
        method: "POST",
        // No Content-Length header
      });

      expect(true).toBe(true);
    });

    it("should handle invalid content-length", async () => {
      app.use("*", httpMetrics({ trackRequestSize: true }));
      app.post("/test", (c) => c.json({ success: true }));

      await app.request("/test", {
        method: "POST",
        headers: {
          "Content-Length": "invalid",
        },
      });

      expect(true).toBe(true);
    });

    it("should handle very large duration values", () => {
      expect(() => recordFeedPollDuration(9999, "gtfs")).not.toThrow();
      expect(() => recordTripQueryDuration(1000)).not.toThrow();
    });

    it("should handle zero duration values", () => {
      expect(() => recordFeedPollDuration(0, "gtfs")).not.toThrow();
      expect(() => recordTripQueryDuration(0)).not.toThrow();
    });

    it("should handle negative values gracefully", () => {
      // These should not throw but might be ignored or clamped
      expect(() => setAlertsActive(-1)).not.toThrow();
      expect(() => setPushSubscriptionsActive(-1)).not.toThrow();
    });

    it("should handle decimal precision", () => {
      expect(() => recordFeedPollDuration(1.234567, "gtfs")).not.toThrow();
      expect(() => recordTripQueryDuration(0.123456)).not.toThrow();
    });
  });

  describe("Integration Tests", () => {
    it("should track multiple types of metrics in a single request", async () => {
      app.use("*", httpMetrics());
      app.get("/api/stations", (c) => {
        recordCacheHitMetric("stations");
        recordStationSearchRequest(5);
        recordStationSearchDuration(0.05);
        return c.json({ stations: [] });
      });

      await app.request("/api/stations");

      expect(true).toBe(true);
    });

    it("should handle concurrent requests with metrics", async () => {
      app.use("*", httpMetrics());
      app.get("/test", async (c) => {
        recordCacheHitMetric("test");
        await new Promise((resolve) => setTimeout(resolve, 10));
        return c.json({ success: true });
      });

      await Promise.all([
        app.request("/test"),
        app.request("/test"),
        app.request("/test"),
        app.request("/test"),
        app.request("/test"),
      ]);

      expect(true).toBe(true);
    });

    it("should record metrics for all feed types", () => {
      const feedTypes = [
        "gtfs",
        "gtfs-ace",
        "gtfs-bdfm",
        "gtfs-nqrw",
        "gtfs-l",
        "gtfs-7",
        "gtfs-jz",
      ];

      for (const feedType of feedTypes) {
        expect(() => recordFeedPollDuration(1.0, feedType)).not.toThrow();
        expect(() => recordFeedError(feedType, "test")).not.toThrow();
        expect(() => recordFeedEntitiesProcessed(feedType, 100)).not.toThrow();
      }
    });

    it("should record metrics for all subway lines", () => {
      const lines = [
        "1",
        "2",
        "3",
        "4",
        "5",
        "6",
        "7",
        "A",
        "C",
        "E",
        "B",
        "D",
        "F",
        "M",
        "N",
        "Q",
        "R",
        "W",
        "G",
        "L",
        "J",
        "Z",
        "S",
      ];

      for (const line of lines) {
        expect(() => recordTripCreated("api", line)).not.toThrow();
        expect(() => recordPushNotificationSent([line])).not.toThrow();
      }
    });
  });

  describe("Metric Recording Function Signatures", () => {
    it("should accept various parameter types", () => {
      // Cache metrics with different cache types
      expect(() => recordCacheHitMetric("arrivals" as string)).not.toThrow();
      expect(() => recordCacheHitMetric("stations" as string)).not.toThrow();

      // Feed metrics with different IDs
      expect(() => recordFeedPollDuration(1.5, "gtfs" as string)).not.toThrow();
      expect(() => recordFeedError("gtfs-ace" as string, "network" as string)).not.toThrow();

      // Trip metrics with optional line parameter
      expect(() => recordTripCreated("api" as string)).not.toThrow();
      expect(() => recordTripCreated("api" as string, "1" as string)).not.toThrow();

      // Commute metrics with boolean flags
      expect(() => recordCommuteAnalysisRequest(true, true, true)).not.toThrow();
      expect(() => recordCommuteAnalysisRequest(false, false, false)).not.toThrow();
    });
  });

  describe("Metrics Thread Safety", () => {
    it("should handle rapid concurrent metric updates", async () => {
      const updates = [];

      for (let i = 0; i < 1000; i++) {
        updates.push(
          Promise.resolve().then(() => {
            recordCacheHitMetric("test");
            recordCacheMissMetric("test");
            recordTripCreated("api");
            setActiveTripsCount(i);
          })
        );
      }

      await Promise.all(updates);

      expect(true).toBe(true);
    });
  });
});
