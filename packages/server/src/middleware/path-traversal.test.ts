/**
 * Unit tests for path traversal prevention middleware.
 */

import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { isSafePath, pathTraversalPrevention } from "./path-traversal.js";

function createTestApp(options?: Parameters<typeof pathTraversalPrevention>[0]) {
  const app = new Hono();
  // Always install the middleware (options will default to {} if undefined)
  app.use("*", pathTraversalPrevention(options));
  app.get("/api/test", (c) => c.json({ message: "ok" }));
  app.get("/api/stations/:id", (c) => c.json({ id: c.req.param("id") }));
  // Catch-all route to ensure middleware runs for all requests
  app.all("*", (c) => c.json({ message: "ok" }));
  return app;
}

describe("pathTraversalPrevention middleware", () => {
  it("allows requests with normal paths", async () => {
    const app = createTestApp();
    const res = await app.request("/api/test");
    expect(res.status).toBe(200);
  });

  it("blocks requests with path traversal in query parameters", async () => {
    const app = createTestApp();
    const res = await app.request("/api/test?file=../../etc/passwd");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid request parameter");
  });

  it("blocks requests with URL-encoded traversal in query", async () => {
    const app = createTestApp();
    const res = await app.request("/api/test?path=%2e%2e%2fsecret");
    expect(res.status).toBe(400);
  });

  it("allows requests with safe query parameters", async () => {
    const app = createTestApp();
    const res = await app.request("/api/test?file=normal.txt&limit=10");
    expect(res.status).toBe(200);
  });

  it("allows parameter names with single dots", async () => {
    const app = createTestApp();
    const res = await app.request("/api/test?file.name=test.txt");
    expect(res.status).toBe(200);
  });

  it("allows path parameters with safe values", async () => {
    const app = createTestApp();
    const res = await app.request("/api/stations/123");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("123");
  });

  it("can be configured to skip path checking", async () => {
    const app = createTestApp({ checkPath: false });
    const res = await app.request("/api/test?file=../../etc/passwd");
    // Query is still checked, path is not
    expect(res.status).toBe(400); // Query parameter should still be blocked
  });

  it("can be configured to skip query checking", async () => {
    const app = createTestApp({ checkQuery: false });
    const res = await app.request("/api/test?file=../../etc/passwd");
    expect(res.status).toBe(200); // Query should not be checked
  });

  it("accepts custom blocklist patterns", async () => {
    const app = createTestApp({ customBlocklist: [/blocked/] });
    const res = await app.request("/api/test?path=blocked/path");
    expect(res.status).toBe(400);
  });

  it("logs security events when blocking", async () => {
    const app = createTestApp();
    const consoleWarnSpy = vi.spyOn(console, "warn");
    await app.request("/api/test?file=../../etc/passwd");

    expect(consoleWarnSpy).toHaveBeenCalled();
    const logArg = JSON.parse(consoleWarnSpy.mock.calls[0]![0]!);
    expect(logArg.event).toBe("path_traversal_blocked");

    consoleWarnSpy.mockRestore();
  });

  it("allows requests with encoded forward slashes in params (not traversal)", async () => {
    const app = createTestApp();
    // Forward slash alone isn't traversal, only when combined with ..
    const res = await app.request("/api/test?path=%2fsome%2fpath");
    expect(res.status).toBe(200);
  });

  it("allows requests with multiple consecutive dots in valid context", async () => {
    const app = createTestApp();
    // Only two dots with slashes are problematic
    const res = await app.request("/api/test?name=file...txt");
    expect(res.status).toBe(200);
  });
});

describe("isSafePath helper", () => {
  it("returns true for safe paths", () => {
    expect(isSafePath("/api/test")).toBe(true);
    expect(isSafePath("/var/www/html/index.html")).toBe(true);
    expect(isSafePath("file.txt")).toBe(true);
    expect(isSafePath("./file.txt")).toBe(true); // Single dot is ok
  });

  it("returns false for paths with traversal sequences", () => {
    expect(isSafePath("../etc/passwd")).toBe(false);
    expect(isSafePath("..\\windows\\system32")).toBe(false);
    expect(isSafePath("%2e%2e/secret")).toBe(false);
    expect(isSafePath("path/../../../etc/passwd")).toBe(false);
    expect(isSafePath("path\x00null")).toBe(false);
  });

  it("returns false for URL-encoded traversal", () => {
    expect(isSafePath("%2e%2e%2fsecret")).toBe(false);
    expect(isSafePath("%2e%2e%5csecret")).toBe(false);
    expect(isSafePath("%252e%252e%252fsecret")).toBe(false);
  });

  it("returns false for unicode-encoded traversal", () => {
    expect(isSafePath("%c0%ae%c0%ae/secret")).toBe(false);
    expect(isSafePath("%u002e%u002e/secret")).toBe(false);
  });
});
