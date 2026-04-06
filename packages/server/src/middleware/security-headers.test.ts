/**
 * Unit tests for security headers middleware.
 *
 * Tests:
 * - CSP headers are set correctly
 * - X-Content-Type-Options: nosniff
 * - X-Frame-Options: DENY
 * - Referrer-Policy: strict-origin-when-cross-origin
 * - Strict-Transport-Security with correct max-age
 */

import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import { securityHeaders } from "./security-headers.js";

describe("securityHeaders middleware", () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.use("*", securityHeaders());
    app.get("/api/test", (c) => c.json({ message: "ok" }));
    app.get("/", (c) => c.html("<html><body>Test</body></html>"));
  });

  it("sets Content-Security-Policy header", async () => {
    const res = await app.request("/api/test");

    const csp = res.headers.get("Content-Security-Policy");
    expect(csp).toBeTruthy();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).toContain("img-src 'self' data:");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("font-src 'self'");
    expect(csp).toContain("manifest-src 'self'");
    expect(csp).toContain("worker-src 'self'");
  });

  it("sets X-Content-Type-Options to nosniff", async () => {
    const res = await app.request("/api/test");

    const header = res.headers.get("X-Content-Type-Options");
    expect(header).toBe("nosniff");
  });

  it("sets X-Frame-Options to DENY", async () => {
    const res = await app.request("/api/test");

    const header = res.headers.get("X-Frame-Options");
    expect(header).toBe("DENY");
  });

  it("sets Referrer-Policy", async () => {
    const res = await app.request("/api/test");

    const header = res.headers.get("Referrer-Policy");
    expect(header).toBe("strict-origin-when-cross-origin");
  });

  it("sets Strict-Transport-Security with 1 year max-age", async () => {
    const res = await app.request("/api/test");

    const header = res.headers.get("Strict-Transport-Security");
    expect(header).toBeTruthy();
    expect(header).toContain("max-age=31536000");
    expect(header).toContain("includeSubDomains");
  });

  it("applies security headers to HTML responses", async () => {
    const res = await app.request("/");

    expect(res.headers.get("Content-Security-Policy")).toBeTruthy();
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("applies security headers to all routes", async () => {
    const apiRes = await app.request("/api/test");
    const htmlRes = await app.request("/");

    // Both responses should have all security headers
    for (const res of [apiRes, htmlRes]) {
      expect(res.headers.get("Content-Security-Policy")).toBeTruthy();
      expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(res.headers.get("X-Frame-Options")).toBe("DENY");
      expect(res.headers.get("Referrer-Policy")).toBeTruthy();
      expect(res.headers.get("Strict-Transport-Security")).toBeTruthy();
    }
  });
});
