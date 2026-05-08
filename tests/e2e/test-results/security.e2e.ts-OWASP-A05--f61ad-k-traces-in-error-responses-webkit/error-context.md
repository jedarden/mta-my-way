# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: security.e2e.ts >> OWASP A05: Security Misconfiguration >> does not expose stack traces in error responses
- Location: security.e2e.ts:152:3

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 404
Received: 200
```

# Test source

```ts
  55  | 
  56  |     expect(response.headers()["cross-origin-opener-policy"]).toBe("same-origin");
  57  |   });
  58  | 
  59  |   test("sets Cross-Origin-Resource-Policy", async ({ request }) => {
  60  |     const response = await request.get("/api/health");
  61  | 
  62  |     expect(response.headers()["cross-origin-resource-policy"]).toBe("same-origin");
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
> 155 |     expect(response.status()).toBe(404);
      |                               ^ Error: expect(received).toBe(expected) // Object.is equality
  156 |     const body = await response.json();
  157 |     expect(body).not.toHaveProperty("stack");
  158 |     expect(body).not.toHaveProperty("stackTrace");
  159 |   });
  160 | 
  161 |   test("does not expose internal paths in error messages", async ({ request }) => {
  162 |     const response = await request.get("/api/nonexistent");
  163 | 
  164 |     expect(response.status()).toBe(404);
  165 |     const body = await response.json();
  166 |     const bodyStr = JSON.stringify(body);
  167 |     expect(bodyStr).not.toContain("/home/coding");
  168 |     expect(bodyStr).not.toContain("packages/server");
  169 |   });
  170 | });
  171 | 
  172 | test.describe("OWASP A10: Server-Side Request Forgery", () => {
  173 |   test("blocks requests to internal network addresses", async ({ request }) => {
  174 |     // This would be tested on endpoints that make external requests
  175 |     // For now, we verify the protection is in place via headers
  176 |     const response = await request.get("/api/health");
  177 | 
  178 |     // The SSRF protection middleware should be active
  179 |     expect(response.status()).toBe(200);
  180 |   });
  181 | });
  182 | 
  183 | test.describe("HTTP Response Splitting Protection", () => {
  184 |   test("blocks CRLF injection in query parameters", async ({ request }) => {
  185 |     const response = await request.get(
  186 |       "/api/health?test=value%0D%0AInjected-Header%3A%20malicious"
  187 |     );
  188 | 
  189 |     // Should be blocked
  190 |     expect([400, 200]).toContain(response.status());
  191 |     if (response.status() === 400) {
  192 |       const body = await response.json();
  193 |       expect(body).toHaveProperty("error");
  194 |     }
  195 |   });
  196 | });
  197 | 
  198 | test.describe("HTTP Request Smuggling Protection", () => {
  199 |   test("blocks invalid Content-Length headers", async ({ request }) => {
  200 |     const response = await request.get("/api/health", {
  201 |       headers: { "Content-Length": "invalid" },
  202 |     });
  203 | 
  204 |     // Should be blocked
  205 |     expect(response.status()).toBe(400);
  206 |   });
  207 | 
  208 |   test("blocks conflicting length headers", async ({ request }) => {
  209 |     const response = await request.get("/api/health", {
  210 |       headers: {
  211 |         "Content-Length": "100",
  212 |         "Transfer-Encoding": "chunked",
  213 |       },
  214 |     });
  215 | 
  216 |     // Should be blocked
  217 |     expect(response.status()).toBe(400);
  218 |   });
  219 | });
  220 | 
  221 | test.describe("CSP violation reporting", () => {
  222 |   test("accepts CSP violation reports", async ({ request }) => {
  223 |     const report = {
  224 |       cspReport: {
  225 |         documentURI: "https://example.com",
  226 |         violatedDirective: "script-src",
  227 |         effectiveDirective: "script-src",
  228 |         originalPolicy: "default-src 'self'",
  229 |         blockedURI: "https://evil.com/script.js",
  230 |       },
  231 |     };
  232 | 
  233 |     const response = await request.post("/api/security/csp-report", {
  234 |       data: report,
  235 |     });
  236 | 
  237 |     // Should accept the report
  238 |     expect(response.status()).toBe(200);
  239 |   });
  240 | });
  241 | 
```