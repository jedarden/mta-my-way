# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: security.e2e.ts >> CSP violation reporting >> accepts CSP violation reports
- Location: security.e2e.ts:222:3

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 200
Received: 404
```

# Test source

```ts
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
> 238 |     expect(response.status()).toBe(200);
      |                               ^ Error: expect(received).toBe(expected) // Object.is equality
  239 |   });
  240 | });
  241 | 
```