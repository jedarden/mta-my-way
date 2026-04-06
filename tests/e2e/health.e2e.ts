/**
 * E2E tests for health endpoint and observability.
 */

import { expect, test } from "@playwright/test";

test.describe("Health endpoint", () => {
  test("returns system health status", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty("status");
    expect(body.status).toMatch(/^(ok|degraded)$/);
    expect(body).toHaveProperty("timestamp");
    expect(body).toHaveProperty("uptime_seconds");
    expect(body.uptime_seconds).toBeGreaterThan(0);
  });

  test("includes per-feed status for all 8 subway feeds", async ({ request }) => {
    const response = await request.get("/api/health");
    const body = await response.json();

    expect(body.feeds).toBeInstanceOf(Array);
    expect(body.feeds.length).toBeGreaterThanOrEqual(8);

    const feedIds = body.feeds.map((f: { id: string }) => f.id);
    expect(feedIds).toContain("gtfs");
    expect(feedIds).toContain("gtfs-ace");
    expect(feedIds).toContain("gtfs-bdfm");
    expect(feedIds).toContain("gtfs-g");
    expect(feedIds).toContain("gtfs-jz");
    expect(feedIds).toContain("gtfs-l");
    expect(feedIds).toContain("gtfs-nqrw");
    expect(feedIds).toContain("gtfs-si");
  });

  test("includes alerts status", async ({ request }) => {
    const response = await request.get("/api/health");
    const body = await response.json();

    expect(body).toHaveProperty("alerts");
    expect(body.alerts).toHaveProperty("count");
    expect(body.alerts).toHaveProperty("circuitOpen");
    expect(typeof body.alerts.circuitOpen).toBe("boolean");
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
    expect(body.delayDetector).toHaveProperty("trackedTrips");
    expect(body.delayDetector).toHaveProperty("activeAlerts");
    expect(body.delayDetector).toHaveProperty("thresholdMultiplier");
  });
});
