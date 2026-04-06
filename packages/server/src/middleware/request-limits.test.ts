/**
 * Unit tests for request size limits middleware.
 */

import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import { requestSizeLimits } from "./request-limits.js";

describe("requestSizeLimits middleware", () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
  });

  it("allows requests within size limits", async () => {
    app.use("*", requestSizeLimits());
    app.post("/api/test", (c) => c.json({ message: "ok" }));

    const res = await app.request("/api/test", {
      method: "POST",
      headers: {
        "Content-Length": "1024", // 1KB, well under 1MB limit
      },
    });

    expect(res.status).toBe(200);
  });

  it("rejects requests exceeding body size limit", async () => {
    app.use("*", requestSizeLimits({ maxBodySize: 100 }));
    app.post("/api/test", (c) => c.json({ message: "ok" }));

    const res = await app.request("/api/test", {
      method: "POST",
      headers: {
        "Content-Length": "200", // Exceeds 100 byte limit
      },
    });

    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error).toContain("too large");
  });

  it("rejects requests with excessive URL length", async () => {
    app.use("*", requestSizeLimits({ maxUrlLength: 100 }));
    app.get("/api/test", (c) => c.json({ message: "ok" }));

    const longUrl = "/api/test?" + "a".repeat(200);
    const res = await app.request(longUrl);

    expect(res.status).toBe(414);
    const body = await res.json();
    expect(body.error).toContain("URL too large");
  });

  it("handles missing Content-Length header", async () => {
    app.use("*", requestSizeLimits());
    app.post("/api/test", (c) => c.json({ message: "ok" }));

    const res = await app.request("/api/test", {
      method: "POST",
      // No Content-Length header
    });

    expect(res.status).toBe(200);
  });

  it("handles invalid Content-Length header", async () => {
    app.use("*", requestSizeLimits());
    app.post("/api/test", (c) => c.json({ message: "ok" }));

    const res = await app.request("/api/test", {
      method: "POST",
      headers: {
        "Content-Length": "invalid",
      },
    });

    expect(res.status).toBe(200); // Should proceed, body will be read normally
  });

  it("estimates and checks header size", async () => {
    app.use("*", requestSizeLimits({ maxHeaderSize: 50 }));
    app.get("/api/test", (c) => c.json({ message: "ok" }));

    const res = await app.request("/api/test", {
      headers: {
        "X-Very-Long-Header": "a".repeat(100),
      },
    });

    expect(res.status).toBe(431);
    const body = await res.json();
    expect(body.error).toContain("headers too large");
  });

  it("uses default limits when not specified", async () => {
    app.use("*", requestSizeLimits());
    app.post("/api/test", (c) => c.json({ message: "ok" }));

    // Default body limit is 1MB
    const res = await app.request("/api/test", {
      method: "POST",
      headers: {
        "Content-Length": "1048576", // Exactly 1MB
      },
    });

    expect(res.status).toBe(200);
  });
});
