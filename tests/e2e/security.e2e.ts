/**
 * E2E tests for security headers and rate limiting.
 */

import { expect, test } from "@playwright/test";

test.describe("Security headers", () => {
  test("sets Content-Security-Policy header", async ({ request }) => {
    const response = await request.get("/api/health");

    const csp = response.headers()["content-security-policy"];
    expect(csp).toBeDefined();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
  });

  test("sets X-Content-Type-Options: nosniff", async ({ request }) => {
    const response = await request.get("/api/health");

    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  });

  test("sets X-Frame-Options: DENY", async ({ request }) => {
    const response = await request.get("/api/health");

    expect(response.headers()["x-frame-options"]).toBe("DENY");
  });

  test("sets Referrer-Policy: strict-origin-when-cross-origin", async ({ request }) => {
    const response = await request.get("/api/health");

    expect(response.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });

  test("sets Strict-Transport-Security", async ({ request }) => {
    const response = await request.get("/api/health");

    const hsts = response.headers()["strict-transport-security"];
    expect(hsts).toBeDefined();
    expect(hsts).toContain("max-age=31536000");
    expect(hsts).toContain("includeSubDomains");
  });
});

test.describe("Rate limiting", () => {
  test("allows requests within rate limit", async ({ request }) => {
    const response = await request.get("/api/health", {
      headers: { "CF-Connecting-IP": "127.0.0.1" },
    });

    expect(response.status()).toBe(200);
  });

  test("returns 429 when rate limit is exceeded", async ({ request }) => {
    // Make many requests from the same IP
    const requests = [];
    for (let i = 0; i < 70; i++) {
      requests.push(
        request.get("/api/health", {
          headers: { "CF-Connecting-IP": "10.0.0.1" },
        })
      );
    }

    const responses = await Promise.all(requests);
    const hasRateLimit = responses.some((r) => r.status() === 429);

    // At least some requests should be rate limited
    expect(hasRateLimit).toBe(true);
  });

  test("rate limited response includes retry info", async ({ request }) => {
    // Make many rapid requests
    const requests = [];
    for (let i = 0; i < 70; i++) {
      requests.push(
        request.get("/api/health", {
          headers: { "CF-Connecting-IP": "10.0.0.2" },
        })
      );
    }

    const responses = await Promise.all(requests);
    const rateLimitedResponse = responses.find((r) => r.status() === 429);

    if (rateLimitedResponse) {
      const body = await rateLimitedResponse.json();
      expect(body).toHaveProperty("error");
      expect(body.error).toBe("Too many requests");
      expect(body).toHaveProperty("retryAfter");
      expect(typeof body.retryAfter).toBe("number");
    }
  });
});
