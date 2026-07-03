/**
 * E2E tests for API validation and Zod schema enforcement.
 *
 * Tests endpoints that are accessible without authentication (GET endpoints
 * and CSRF-excluded POST endpoints). Authenticated endpoints are tested for
 * proper rejection of unauthenticated requests.
 */

import { expect, test } from "@playwright/test";

test.describe("Query parameter validation (Zod schemas)", () => {
  test("health endpoint rejects unexpected query parameters", async ({ request }) => {
    const response = await request.get("/api/health?extra=param");
    expect(response.status()).toBe(400);

    const body = await response.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toBe("validation failed");
    expect(body).toHaveProperty("details");
    expect(Array.isArray(body.details)).toBe(true);
  });

  test("metrics endpoint rejects unexpected query parameters", async ({ request }) => {
    const response = await request.get("/api/metrics?debug=true");
    expect(response.status()).toBe(400);

    const body = await response.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toBe("validation failed");
  });

  test("stations list endpoint rejects unexpected query parameters", async ({ request }) => {
    const response = await request.get("/api/stations?format=csv");
    expect(response.status()).toBe(400);

    const body = await response.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toBe("validation failed");
  });
});

test.describe("Station search validation", () => {
  test("returns 400 for empty search query", async ({ request }) => {
    const response = await request.get("/api/stations/search?q=");

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toBe("validation failed");
    expect(body).toHaveProperty("details");
    expect(body.details.length).toBeGreaterThan(0);
    // The detail message should reference the 'q' field
    expect(body.details[0]!.field).toBe("q");
  });

  test("returns 400 for missing search query parameter", async ({ request }) => {
    const response = await request.get("/api/stations/search");

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toBe("validation failed");
  });

  test("returns 400 for search query with HTML tags", async ({ request }) => {
    const response = await request.get("/api/stations/search?q=<script>alert('xss')</script>");

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toBe("validation failed");
  });

  test("returns 400 for search query with event handlers", async ({ request }) => {
    const response = await request.get("/api/stations/search?q=testonload=alert(1)");

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toBe("validation failed");
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

  test("returns results for station search by line", async ({ request }) => {
    const response = await request.get("/api/stations/search?q=L");

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
    // Searching by "L" should match stations on the L line
    expect(body.length).toBeGreaterThan(0);
    expect(body[0]!.lines).toContain("L");
  });
});

test.describe("Station detail validation", () => {
  test("returns 404 for non-existent station ID", async ({ request }) => {
    const response = await request.get("/api/stations/999999");

    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body).toHaveProperty("error");
  });

  test("returns station data for valid station ID", async ({ request }) => {
    // Station 101 is a well-known station (Van Cortlandt Park - 242 St)
    const response = await request.get("/api/stations/101");

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("id");
    expect(body.id).toBe("101");
    expect(body).toHaveProperty("name");
    expect(body).toHaveProperty("lines");
  });

  test("returns 400 for station ID with path traversal characters", async ({ request }) => {
    const response = await request.get("/api/stations/../../etc/passwd");

    // Should be rejected by validation (sanitized path params)
    expect([400, 404]).toContain(response.status());
  });
});

test.describe("Arrivals endpoint validation", () => {
  test("returns 404 for non-existent station arrivals", async ({ request }) => {
    const response = await request.get("/api/arrivals/999999");

    // 404 if station doesn't exist or no data yet
    expect([404]).toContain(response.status());
  });

  test("returns 400 for invalid station ID format", async ({ request }) => {
    const response = await request.get("/api/arrivals/<script>");

    // Should be rejected by validation (sanitization)
    expect([400, 404]).toContain(response.status());
  });
});

test.describe("Authentication enforcement", () => {
  test("rejects unauthenticated POST to commute/analyze", async ({ request }) => {
    // CSRF protection blocks POST without valid token
    const response = await request.post("/api/commute/analyze", {
      data: JSON.stringify({
        originId: "101",
        destinationId: "726",
      }),
      headers: { "Content-Type": "application/json" },
    });

    // Should be blocked by CSRF (403) or auth (401)
    expect([401, 403]).toContain(response.status());
  });

  test("rejects unauthenticated POST to push/subscribe", async ({ request }) => {
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

    // Should be blocked by same-origin (403) or CSRF (403) or auth (401)
    expect([401, 403]).toContain(response.status());
  });

  test("rejects unauthenticated POST to trips", async ({ request }) => {
    const response = await request.post("/api/trips", {
      data: JSON.stringify({
        origin: "101",
        destination: "726",
        line: "1",
        departureTime: Math.floor(Date.now() / 1000),
        arrivalTime: Math.floor(Date.now() / 1000) + 600,
      }),
      headers: { "Content-Type": "application/json" },
    });

    // Should be blocked by CSRF (403) or auth (401)
    expect([401, 403]).toContain(response.status());
  });
});

test.describe("CSP violation report validation", () => {
  test("accepts valid CSP violation report", async ({ request }) => {
    const report = {
      cspReport: {
        documentURI: "https://example.com",
        violatedDirective: "script-src",
        effectiveDirective: "script-src",
        originalPolicy: "default-src 'self'",
        blockedURI: "https://evil.com/script.js",
      },
    };

    const response = await request.post("/api/security/csp-report", {
      data: report,
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("received");
    expect(body.received).toBe(true);
  });

  test("rejects invalid (non-JSON) CSP report", async ({ request }) => {
    const response = await request.post("/api/security/csp-report", {
      data: "not valid json at all",
      headers: { "Content-Type": "application/json" },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body).toHaveProperty("error");
  });
});

test.describe("Alerts endpoint validation", () => {
  test("returns alerts with valid response shape", async ({ request }) => {
    const response = await request.get("/api/alerts");

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("alerts");
    expect(body).toHaveProperty("meta");
    expect(body.meta).toHaveProperty("count");
  });

  test("returns alerts filtered by line", async ({ request }) => {
    const response = await request.get("/api/alerts/1");

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("alerts");
    expect(body).toHaveProperty("lineId");
    expect(body.lineId).toBe("1");
  });
});

test.describe("Routes endpoint validation", () => {
  test("returns route list", async ({ request }) => {
    const response = await request.get("/api/routes");

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
  });

  test("returns 404 for non-existent route", async ({ request }) => {
    const response = await request.get("/api/routes/Z999");

    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body).toHaveProperty("error");
  });
});
