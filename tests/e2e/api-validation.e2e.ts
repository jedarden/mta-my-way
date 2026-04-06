/**
 * E2E tests for API validation and Zod schema enforcement.
 */

import { expect, test } from "@playwright/test";

test.describe("API validation", () => {
  test("rejects malformed JSON in POST requests", async ({ request }) => {
    const response = await request.post("/api/commute/analyze", {
      data: "not valid json",
      headers: { "Content-Type": "application/json" },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toBe("Validation failed");
  });

  test("rejects missing required fields", async ({ request }) => {
    const response = await request.post("/api/commute/analyze", {
      data: JSON.stringify({ originId: "101" }), // Missing destinationId
      headers: { "Content-Type": "application/json" },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toBe("Validation failed");
  });

  test("rejects invalid station IDs", async ({ request }) => {
    const response = await request.post("/api/commute/analyze", {
      data: JSON.stringify({
        originId: "101",
        destinationId: "999999", // Non-existent station
      }),
      headers: { "Content-Type": "application/json" },
    });

    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toContain("not found");
  });

  test("accepts valid commute analyze request", async ({ request }) => {
    const response = await request.post("/api/commute/analyze", {
      data: JSON.stringify({
        originId: "101",
        destinationId: "726",
      }),
      headers: { "Content-Type": "application/json" },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("commuteId");
    expect(body).toHaveProperty("origin");
    expect(body).toHaveProperty("destination");
    expect(body).toHaveProperty("directRoutes");
    expect(body).toHaveProperty("transferRoutes");
    expect(body).toHaveProperty("recommendation");
  });
});

test.describe("Station search validation", () => {
  test("returns 400 for empty search query", async ({ request }) => {
    const response = await request.get("/api/stations/search?q=");

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toContain("required");
  });

  test("returns empty array for no matches", async ({ request }) => {
    const response = await request.get("/api/stations/search?q=NonexistentStation");

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(0);
  });

  test("returns results for valid search", async ({ request }) => {
    const response = await request.get("/api/stations/search?q=Times");

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    expect(body[0]).toHaveProperty("id");
    expect(body[0]).toHaveProperty("name");
    expect(body[0]).toHaveProperty("lines");
  });
});

test.describe("Push notification validation", () => {
  test("validates push subscribe request schema", async ({ request }) => {
    const response = await request.post("/api/push/subscribe", {
      data: JSON.stringify({
        subscription: {
          endpoint: "https://fcm.googleapis.com/fcm/send/test",
          keys: {
            p256dh: "test-key",
            auth: "test-auth",
          },
        },
        favorites: [{ id: "fav-1", stationId: "101", lines: ["1"], direction: "both" }],
      }),
      headers: { "Content-Type": "application/json" },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("success");
    expect(body.success).toBe(true);
  });

  test("rejects invalid push subscription data", async ({ request }) => {
    const response = await request.post("/api/push/subscribe", {
      data: JSON.stringify({
        subscription: "invalid", // Should be an object
      }),
      headers: { "Content-Type": "application/json" },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body).toHaveProperty("error");
  });
});
