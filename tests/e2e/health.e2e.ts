/**
 * E2E tests for health endpoint and observability.
 */

import { expect, test } from "@playwright/test";

test.describe("Health endpoint", () => {
  test("returns system health status", async ({ request }) => {
    const response = await request.get("/api/health");
    // Server returns 200 when healthy, 503 when 3+ feeds are failing for >5 min
    expect([200, 503]).toContain(response.status());

    const body = await response.json();
    expect(body).toHaveProperty("status");
    expect(body.status).toMatch(/^(ok|degraded)$/);
    expect(body).toHaveProperty("timestamp");
    expect(body).toHaveProperty("uptime_seconds");
    // Allow uptime_seconds to be 0 on fresh server startup (<1s old)
    expect(body.uptime_seconds).toBeGreaterThanOrEqual(0);
  });

  test("includes per-feed status for all 8 subway feeds", async ({ request }) => {
    const response = await request.get("/api/health");
    const body = await response.json();

    expect(body.feeds).toBeInstanceOf(Array);
    // Server initializes all 8 feeds at startup, even before polling begins
    expect(body.feeds.length).toBe(8);

    // All 8 subway feeds must be present (initialized from SUBWAY_FEEDS constant)
    const feedIds = body.feeds.map((f: { id: string }) => f.id);
    const expectedFeedIds = [
      "gtfs",
      "gtfs-ace",
      "gtfs-bdfm",
      "gtfs-g",
      "gtfs-jz",
      "gtfs-l",
      "gtfs-nqrw",
      "gtfs-si",
    ];

    for (const feedId of expectedFeedIds) {
      expect(feedIds).toContain(feedId);
    }

    // Each feed should have the expected structure, even if never polled
    for (const feed of body.feeds) {
      expect(feed).toHaveProperty("id");
      expect(feed).toHaveProperty("name");
      expect(feed).toHaveProperty("status");
      // Status can be: "circuit_open", "never_polled", "stale", or "ok"
      // "never_polled" is valid on server startup before first poll completes
      expect(["circuit_open", "never_polled", "stale", "ok"]).toContain(feed.status);
      expect(feed).toHaveProperty("lastSuccessAt");
      expect(feed).toHaveProperty("lastPollAt");
      expect(feed).toHaveProperty("consecutiveFailures");
      expect(typeof feed.consecutiveFailures).toBe("number");
    }
  });

  test("includes alerts status", async ({ request }) => {
    const response = await request.get("/api/health");
    const body = await response.json();

    expect(body).toHaveProperty("alerts");

    // Alerts status structure validation
    expect(body.alerts).toHaveProperty("count");
    expect(typeof body.alerts.count).toBe("number");
    expect(body.alerts.count).toBeGreaterThanOrEqual(0);

    expect(body.alerts).toHaveProperty("circuitOpen");
    expect(typeof body.alerts.circuitOpen).toBe("boolean");

    // Additional alerts fields (present even on startup)
    expect(body.alerts).toHaveProperty("matchRate");
    expect(typeof body.alerts.matchRate).toBe("number");
    expect(body.alerts.matchRate).toBeGreaterThanOrEqual(0);
    expect(body.alerts.matchRate).toBeLessThanOrEqual(1);

    expect(body.alerts).toHaveProperty("consecutiveFailures");
    expect(typeof body.alerts.consecutiveFailures).toBe("number");

    expect(body.alerts).toHaveProperty("unmatchedCount");
    expect(typeof body.alerts.unmatchedCount).toBe("number");
  });

  test("includes memory usage metrics", async ({ request }) => {
    const response = await request.get("/api/health");
    const body = await response.json();

    expect(body).toHaveProperty("memory");
    expect(body.memory).toHaveProperty("rssBytes");
    expect(body.memory.rssBytes).toBeGreaterThan(0);
    expect(body.memory).toHaveProperty("heapUsedBytes");
    expect(body.memory.heapUsedBytes).toBeGreaterThan(0);
  });

  test("includes delay detector status", async ({ request }) => {
    const response = await request.get("/api/health");
    const body = await response.json();

    expect(body).toHaveProperty("delayDetector");
    expect(body.delayDetector).toHaveProperty("enabled");
    expect(typeof body.delayDetector.enabled).toBe("boolean");
    expect(body.delayDetector).toHaveProperty("activePredictions");
    expect(typeof body.delayDetector.activePredictions).toBe("number");
    expect(body.delayDetector).toHaveProperty("lastRunAt");
    // lastRunAt can be null if the detector hasn't run yet
    expect(
      body.delayDetector.lastRunAt === null || typeof body.delayDetector.lastRunAt === "string"
    ).toBe(true);
  });

  test("rejects unexpected query parameters", async ({ request }) => {
    const response = await request.get("/api/health?extra=param");
    expect(response.status()).toBe(400);

    const body = await response.json();
    expect(body).toHaveProperty("error");
  });
});
