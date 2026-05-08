# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: security.e2e.ts >> Security headers >> sets Cross-Origin-Resource-Policy
- Location: security.e2e.ts:59:3

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "same-origin"
Received: undefined
```

# Test source

```ts
  1   | /**
  2   |  * E2E tests for security headers, rate limiting, and OWASP protections.
  3   |  */
  4   | 
  5   | import { expect, test } from "@playwright/test";
  6   | 
  7   | test.describe("Security headers", () => {
  8   |   test("sets Content-Security-Policy header", async ({ request }) => {
  9   |     const response = await request.get("/api/health");
  10  | 
  11  |     const csp = response.headers()["content-security-policy"];
  12  |     expect(csp).toBeDefined();
  13  |     expect(csp).toContain("default-src 'self'");
  14  |     expect(csp).toContain("script-src 'self'");
  15  |     expect(csp).toContain("style-src 'self' 'unsafe-inline'");
  16  |   });
  17  | 
  18  |   test("sets X-Content-Type-Options: nosniff", async ({ request }) => {
  19  |     const response = await request.get("/api/health");
  20  | 
  21  |     expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  22  |   });
  23  | 
  24  |   test("sets X-Frame-Options: DENY", async ({ request }) => {
  25  |     const response = await request.get("/api/health");
  26  | 
  27  |     expect(response.headers()["x-frame-options"]).toBe("DENY");
  28  |   });
  29  | 
  30  |   test("sets Referrer-Policy: strict-origin-when-cross-origin", async ({ request }) => {
  31  |     const response = await request.get("/api/health");
  32  | 
  33  |     expect(response.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  34  |   });
  35  | 
  36  |   test("sets Strict-Transport-Security", async ({ request }) => {
  37  |     const response = await request.get("/api/health");
  38  | 
  39  |     const hsts = response.headers()["strict-transport-security"];
  40  |     expect(hsts).toBeDefined();
  41  |     expect(hsts).toContain("max-age=31536000");
  42  |     expect(hsts).toContain("includeSubDomains");
  43  |   });
  44  | 
  45  |   test("sets Permissions-Policy", async ({ request }) => {
  46  |     const response = await request.get("/api/health");
  47  | 
  48  |     const permissionsPolicy = response.headers()["permissions-policy"];
  49  |     expect(permissionsPolicy).toBeDefined();
  50  |     expect(permissionsPolicy).toContain("geolocation=()");
  51  |   });
  52  | 
  53  |   test("sets Cross-Origin-Opener-Policy", async ({ request }) => {
  54  |     const response = await request.get("/api/health");
  55  | 
  56  |     expect(response.headers()["cross-origin-opener-policy"]).toBe("same-origin");
  57  |   });
  58  | 
  59  |   test("sets Cross-Origin-Resource-Policy", async ({ request }) => {
  60  |     const response = await request.get("/api/health");
  61  | 
> 62  |     expect(response.headers()["cross-origin-resource-policy"]).toBe("same-origin");
      |                                                                ^ Error: expect(received).toBe(expected) // Object.is equality
  63  |   });
  64  | });
  65  | 
  66  | test.describe("Rate limiting", () => {
  67  |   test("allows requests within rate limit", async ({ request }) => {
  68  |     const response = await request.get("/api/health", {
  69  |       headers: { "CF-Connecting-IP": "127.0.0.1" },
  70  |     });
  71  | 
  72  |     expect(response.status()).toBe(200);
  73  |   });
  74  | 
  75  |   test("returns 429 when rate limit is exceeded", async ({ request }) => {
  76  |     // Make many requests from the same IP
  77  |     const requests = [];
  78  |     for (let i = 0; i < 70; i++) {
  79  |       requests.push(
  80  |         request.get("/api/health", {
  81  |           headers: { "CF-Connecting-IP": "10.0.0.1" },
  82  |         })
  83  |       );
  84  |     }
  85  | 
  86  |     const responses = await Promise.all(requests);
  87  |     const hasRateLimit = responses.some((r) => r.status() === 429);
  88  | 
  89  |     // At least some requests should be rate limited
  90  |     expect(hasRateLimit).toBe(true);
  91  |   });
  92  | 
  93  |   test("rate limited response includes retry info", async ({ request }) => {
  94  |     // Make many rapid requests
  95  |     const requests = [];
  96  |     for (let i = 0; i < 70; i++) {
  97  |       requests.push(
  98  |         request.get("/api/health", {
  99  |           headers: { "CF-Connecting-IP": "10.0.0.2" },
  100 |         })
  101 |       );
  102 |     }
  103 | 
  104 |     const responses = await Promise.all(requests);
  105 |     const rateLimitedResponse = responses.find((r) => r.status() === 429);
  106 | 
  107 |     if (rateLimitedResponse) {
  108 |       const body = await rateLimitedResponse.json();
  109 |       expect(body).toHaveProperty("error");
  110 |       expect(body.error).toBe("Too many requests");
  111 |       expect(body).toHaveProperty("retryAfter");
  112 |       expect(typeof body.retryAfter).toBe("number");
  113 |     }
  114 |   });
  115 | });
  116 | 
  117 | test.describe("OWASP A01: Broken Access Control", () => {
  118 |   test("blocks path traversal attempts", async ({ request }) => {
  119 |     const response = await request.get("/api/stations/../../etc/passwd");
  120 | 
  121 |     // Should be blocked or return 404
  122 |     expect([400, 404]).toContain(response.status());
  123 |   });
  124 | 
  125 |   test("blocks parameter pollution attempts", async ({ request }) => {
  126 |     const response = await request.get("/api/stations?id=123&id=456");
  127 | 
  128 |     // Should be handled safely
  129 |     expect([200, 400]).toContain(response.status());
  130 |   });
  131 | });
  132 | 
  133 | test.describe("OWASP A03: Injection", () => {
  134 |   test("sanitizes HTML in query parameters", async ({ request }) => {
  135 |     const response = await request.get("/api/stations/search?q=<script>alert('xss')</script>");
  136 | 
  137 |     // Should not reflect HTML back
  138 |     expect(response.status()).toBe(200);
  139 |     const body = await response.json();
  140 |     expect(JSON.stringify(body)).not.toContain("<script>");
  141 |   });
  142 | 
  143 |   test("handles SQL injection attempts safely", async ({ request }) => {
  144 |     const response = await request.get("/api/stations/search?q='; DROP TABLE stations; --");
  145 | 
  146 |     // Should be handled safely
  147 |     expect(response.status()).toBe(200);
  148 |   });
  149 | });
  150 | 
  151 | test.describe("OWASP A05: Security Misconfiguration", () => {
  152 |   test("does not expose stack traces in error responses", async ({ request }) => {
  153 |     const response = await request.get("/api/nonexistent");
  154 | 
  155 |     expect(response.status()).toBe(404);
  156 |     const body = await response.json();
  157 |     expect(body).not.toHaveProperty("stack");
  158 |     expect(body).not.toHaveProperty("stackTrace");
  159 |   });
  160 | 
  161 |   test("does not expose internal paths in error messages", async ({ request }) => {
  162 |     const response = await request.get("/api/nonexistent");
```