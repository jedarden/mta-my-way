# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: health.e2e.ts >> Health endpoint >> includes delay detector status
- Location: health.e2e.ts:59:3

# Error details

```
Error: expect(received).toHaveProperty(path)

Expected path: "delayDetector"
Received path: []

Received value: {"error": "Too many requests", "retryAfter": 60}
```

# Test source

```ts
  1  | /**
  2  |  * E2E tests for health endpoint and observability.
  3  |  */
  4  | 
  5  | import { expect, test } from "@playwright/test";
  6  | 
  7  | test.describe("Health endpoint", () => {
  8  |   test("returns system health status", async ({ request }) => {
  9  |     const response = await request.get("/api/health");
  10 |     expect(response.status()).toBe(200);
  11 | 
  12 |     const body = await response.json();
  13 |     expect(body).toHaveProperty("status");
  14 |     expect(body.status).toMatch(/^(ok|degraded)$/);
  15 |     expect(body).toHaveProperty("timestamp");
  16 |     expect(body).toHaveProperty("uptime_seconds");
  17 |     expect(body.uptime_seconds).toBeGreaterThan(0);
  18 |   });
  19 | 
  20 |   test("includes per-feed status for all 8 subway feeds", async ({ request }) => {
  21 |     const response = await request.get("/api/health");
  22 |     const body = await response.json();
  23 | 
  24 |     expect(body.feeds).toBeInstanceOf(Array);
  25 |     expect(body.feeds.length).toBeGreaterThanOrEqual(8);
  26 | 
  27 |     const feedIds = body.feeds.map((f: { id: string }) => f.id);
  28 |     expect(feedIds).toContain("gtfs");
  29 |     expect(feedIds).toContain("gtfs-ace");
  30 |     expect(feedIds).toContain("gtfs-bdfm");
  31 |     expect(feedIds).toContain("gtfs-g");
  32 |     expect(feedIds).toContain("gtfs-jz");
  33 |     expect(feedIds).toContain("gtfs-l");
  34 |     expect(feedIds).toContain("gtfs-nqrw");
  35 |     expect(feedIds).toContain("gtfs-si");
  36 |   });
  37 | 
  38 |   test("includes alerts status", async ({ request }) => {
  39 |     const response = await request.get("/api/health");
  40 |     const body = await response.json();
  41 | 
  42 |     expect(body).toHaveProperty("alerts");
  43 |     expect(body.alerts).toHaveProperty("count");
  44 |     expect(body.alerts).toHaveProperty("circuitOpen");
  45 |     expect(typeof body.alerts.circuitOpen).toBe("boolean");
  46 |   });
  47 | 
  48 |   test("includes memory usage metrics", async ({ request }) => {
  49 |     const response = await request.get("/api/health");
  50 |     const body = await response.json();
  51 | 
  52 |     expect(body).toHaveProperty("memory");
  53 |     expect(body.memory).toHaveProperty("rssBytes");
  54 |     expect(body.memory.rssBytes).toBeGreaterThan(0);
  55 |     expect(body.memory).toHaveProperty("heapUsedBytes");
  56 |     expect(body.memory.heapUsedBytes).toBeGreaterThan(0);
  57 |   });
  58 | 
  59 |   test("includes delay detector status", async ({ request }) => {
  60 |     const response = await request.get("/api/health");
  61 |     const body = await response.json();
  62 | 
> 63 |     expect(body).toHaveProperty("delayDetector");
     |                  ^ Error: expect(received).toHaveProperty(path)
  64 |     expect(body.delayDetector).toHaveProperty("trackedTrips");
  65 |     expect(body.delayDetector).toHaveProperty("activeAlerts");
  66 |     expect(body.delayDetector).toHaveProperty("thresholdMultiplier");
  67 |   });
  68 | });
  69 | 
```