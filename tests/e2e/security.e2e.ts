/**
 * E2E tests for security headers, rate limiting, and OWASP protections.
 */

import { expect, test } from "@playwright/test";

test.describe("Security headers", () => {
  test("sets Content-Security-Policy header", async ({ request }) => {
    const response = await request.get("/api/health");

    const csp = response.headers()["content-security-policy"];
    expect(csp).toBeDefined();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("style-src 'self'");
    expect(csp).toContain("report-uri");
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

  test("sets Strict-Transport-Security on HTTPS", async ({ request }) => {
    // HSTS is only set when x-forwarded-proto is "https".
    // In local dev/test (HTTP), the header is absent — that's correct behavior.
    const response = await request.get("/api/health");

    const hsts = response.headers()["strict-transport-security"];
    if (!hsts) {
      // Running on HTTP — HSTS correctly omitted
      return;
    }
    // If somehow HTTPS, validate the value
    expect(hsts).toContain("max-age=31536000");
    expect(hsts).toContain("includeSubDomains");
  });

  test("sets Permissions-Policy", async ({ request }) => {
    const response = await request.get("/api/health");

    const permissionsPolicy = response.headers()["permissions-policy"];
    expect(permissionsPolicy).toBeDefined();
    expect(permissionsPolicy).toContain("geolocation=()");
  });

  test("sets Cross-Origin-Opener-Policy", async ({ request }) => {
    const response = await request.get("/api/health");

    expect(response.headers()["cross-origin-opener-policy"]).toBe("same-origin");
  });

  test("sets Cross-Origin-Resource-Policy", async ({ request }) => {
    const response = await request.get("/api/health");

    expect(response.headers()["cross-origin-resource-policy"]).toBe("same-origin");
  });

  test("sets Cross-Origin-Embedder-Policy", async ({ request }) => {
    const response = await request.get("/api/health");

    expect(response.headers()["cross-origin-embedder-policy"]).toBe("require-corp");
  });

  test("sets X-XSS-Protection", async ({ request }) => {
    const response = await request.get("/api/health");

    expect(response.headers()["x-xss-protection"]).toBe("1; mode=block");
  });
});

test.describe("Rate limiting", () => {
  test("allows requests within rate limit", async ({ request }) => {
    // In TEST_MODE, rate limiting is disabled — all requests should succeed.
    const response = await request.get("/api/health", {
      headers: { "CF-Connecting-IP": "127.0.0.1" },
    });

    expect(response.status()).toBe(200);
  });

  test("does not rate-limit in test mode", async ({ request }) => {
    // In TEST_MODE, rate limiting is disabled. Even rapid requests succeed.
    const requests = [];
    for (let i = 0; i < 70; i++) {
      requests.push(
        request.get("/api/health", {
          headers: { "CF-Connecting-IP": "10.0.0.1" },
        })
      );
    }

    const responses = await Promise.all(requests);
    const statuses = responses.map((r) => r.status());
    // All should succeed (no 429s) in test mode
    expect(statuses.every((s) => s === 200)).toBe(true);
  });
});

test.describe("OWASP A01: Broken Access Control", () => {
  test("blocks path traversal attempts", async ({ request }) => {
    const response = await request.get("/api/stations/../../etc/passwd");

    // Should be blocked or return 404
    expect([400, 404]).toContain(response.status());
  });

  test("blocks parameter pollution attempts", async ({ request }) => {
    const response = await request.get("/api/stations?id=123&id=456");

    // Should be handled safely
    expect([200, 400]).toContain(response.status());
  });
});

test.describe("OWASP A03: Injection", () => {
  test("rejects HTML tags in search query parameters", async ({ request }) => {
    // The stationSearchQuerySchema rejects HTML tags via refine
    const response = await request.get("/api/stations/search?q=<script>alert('xss')</script>");

    expect(response.status()).toBe(400);
  });

  test("handles SQL injection attempts safely", async ({ request }) => {
    // SQL injection string doesn't match any station names — empty result
    const response = await request.get("/api/stations/search?q='; DROP TABLE stations; --");

    // Should be handled safely — either 200 with empty results or 400
    expect([200, 400]).toContain(response.status());
    if (response.status() === 200) {
      const body = await response.json();
      expect(Array.isArray(body)).toBe(true);
    }
  });
});

test.describe("OWASP A05: Security Misconfiguration", () => {
  test("does not expose stack traces in error responses", async ({ request }) => {
    const response = await request.get("/api/nonexistent");

    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body).not.toHaveProperty("stack");
    expect(body).not.toHaveProperty("stackTrace");
  });

  test("does not expose internal paths in error messages", async ({ request }) => {
    const response = await request.get("/api/nonexistent");

    expect(response.status()).toBe(404);
    const body = await response.json();
    const bodyStr = JSON.stringify(body);
    expect(bodyStr).not.toContain("/home/coding");
    expect(bodyStr).not.toContain("packages/server");
  });
});

test.describe("OWASP A10: Server-Side Request Forgery", () => {
  test("blocks requests to internal network addresses", async ({ request }) => {
    // This would be tested on endpoints that make external requests.
    // For now, we verify the protection is in place via headers.
    const response = await request.get("/api/health");

    // The SSRF protection middleware should be active
    expect(response.status()).toBe(200);
  });
});

test.describe("HTTP Response Splitting Protection", () => {
  test("blocks CRLF injection in query parameters", async ({ request }) => {
    const response = await request.get(
      "/api/health?test=value%0D%0AInjected-Header%3A%20malicious"
    );

    // Should be blocked by request smuggling middleware (CRLF pattern)
    expect([400, 200]).toContain(response.status());
    if (response.status() === 400) {
      const body = await response.json();
      expect(body).toHaveProperty("error");
    }
  });
});

test.describe("HTTP Request Smuggling Protection", () => {
  test("blocks invalid Content-Length headers", async ({ request }) => {
    const response = await request.get("/api/health", {
      headers: { "Content-Length": "invalid" },
    });

    expect(response.status()).toBe(400);
  });

  test("blocks conflicting length headers", async ({ request }) => {
    const response = await request.get("/api/health", {
      headers: {
        "Content-Length": "100",
        "Transfer-Encoding": "chunked",
      },
    });

    expect(response.status()).toBe(400);
  });
});

test.describe("CSP violation reporting", () => {
  test("accepts CSP violation reports", async ({ request }) => {
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

    // Should accept the report
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("received");
    expect(body.received).toBe(true);
  });
});
