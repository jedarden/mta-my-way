/**
 * Unit tests for security headers middleware.
 *
 * Tests:
 * - CSP headers are set correctly
 * - X-Content-Type-Options: nosniff
 * - X-Frame-Options: DENY
 * - Referrer-Policy: strict-origin-when-cross-origin
 * - Strict-Transport-Security with correct max-age
 * - Permissions-Policy to restrict browser features
 * - Cross-Origin-Opener-Policy: same-origin
 * - Cross-Origin-Resource-Policy: same-origin
 * - Cross-Origin-Embedder-Policy: require-corp
 * - X-XSS-Protection: 1; mode=block
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
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
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
    const res = await app.request("/api/test", {
      headers: { "x-forwarded-proto": "https" },
    });

    const header = res.headers.get("Strict-Transport-Security");
    expect(header).toBeTruthy();
    expect(header).toContain("max-age=31536000");
    expect(header).toContain("includeSubDomains");
    expect(header).toContain("preload");
  });

  it("does not set HSTS on non-HTTPS requests", async () => {
    const res = await app.request("/api/test");

    const header = res.headers.get("Strict-Transport-Security");
    expect(header).toBeNull();
  });

  it("sets Permissions-Policy to restrict browser features", async () => {
    const res = await app.request("/api/test");

    const header = res.headers.get("Permissions-Policy");
    expect(header).toBeTruthy();
    expect(header).toContain("geolocation=()");
    expect(header).toContain("camera=()");
    expect(header).toContain("microphone=()");
    expect(header).toContain("payment=()");
  });

  it("sets Cross-Origin-Opener-Policy to same-origin", async () => {
    const res = await app.request("/api/test");

    const header = res.headers.get("Cross-Origin-Opener-Policy");
    expect(header).toBe("same-origin");
  });

  it("sets Cross-Origin-Resource-Policy to same-origin", async () => {
    const res = await app.request("/api/test");

    const header = res.headers.get("Cross-Origin-Resource-Policy");
    expect(header).toBe("same-origin");
  });

  it("sets Cross-Origin-Embedder-Policy to require-corp", async () => {
    const res = await app.request("/api/test");

    const header = res.headers.get("Cross-Origin-Embedder-Policy");
    expect(header).toBe("require-corp");
  });

  it("sets X-XSS-Protection", async () => {
    const res = await app.request("/api/test");

    const header = res.headers.get("X-XSS-Protection");
    expect(header).toBe("1; mode=block");
  });

  it("applies security headers to HTML responses", async () => {
    const res = await app.request("/");

    expect(res.headers.get("Content-Security-Policy")).toBeTruthy();
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("Permissions-Policy")).toBeTruthy();
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
      expect(res.headers.get("Permissions-Policy")).toBeTruthy();
      expect(res.headers.get("Cross-Origin-Opener-Policy")).toBeTruthy();
      expect(res.headers.get("Cross-Origin-Resource-Policy")).toBeTruthy();
      expect(res.headers.get("Cross-Origin-Embedder-Policy")).toBeTruthy();
      expect(res.headers.get("X-XSS-Protection")).toBeTruthy();
    }
  });

  it("supports custom CSP directive", async () => {
    const customApp = new Hono();
    customApp.use("*", securityHeaders({ customCSP: "default-src 'none'" }));
    customApp.get("/test", (c) => c.json({ ok: true }));

    const res = await customApp.request("/test");

    const csp = res.headers.get("Content-Security-Policy");
    expect(csp).toBe("default-src 'none'");
  });

  it("supports disabling CSP", async () => {
    const noCspApp = new Hono();
    noCspApp.use("*", securityHeaders({ enableCSP: false }));
    noCspApp.get("/test", (c) => c.json({ ok: true }));

    const res = await noCspApp.request("/test");

    expect(res.headers.get("Content-Security-Policy")).toBeNull();
    // Other headers should still be set
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("supports disabling HSTS", async () => {
    const noHstsApp = new Hono();
    noHstsApp.use("*", securityHeaders({ enableHSTS: false }));
    noHstsApp.get("/test", (c) => c.json({ ok: true }));

    const res = await noHstsApp.request("/test", {
      headers: { "x-forwarded-proto": "https" },
    });

    expect(res.headers.get("Strict-Transport-Security")).toBeNull();
    // Other headers should still be set
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("sets CSP-Report-Only when report-to is provided", async () => {
    const reportApp = new Hono();
    reportApp.use("*", securityHeaders({ reportTo: "security-endpoint" }));
    reportApp.get("/test", (c) => c.json({ ok: true }));

    const res = await reportApp.request("/test");

    const reportOnly = res.headers.get("Content-Security-Policy-Report-Only");
    expect(reportOnly).toBeTruthy();
    expect(reportOnly).toContain("report-to=security-endpoint");
  });
});
