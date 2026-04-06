/**
 * Unit tests for CORS middleware.
 */

import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import { cors } from "./cors.js";

describe("cors middleware", () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
  });

  it("allows same-origin requests by default", async () => {
    app.use("*", cors());
    app.get("/api/test", (c) => c.json({ message: "ok" }));

    const res = await app.request("/api/test", {
      headers: {
        Origin: "http://localhost:3001",
        Host: "localhost:3001",
      },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3001");
  });

  it("handles preflight OPTIONS requests", async () => {
    app.use("*", cors());
    app.get("/api/test", (c) => c.json({ message: "ok" }));

    const res = await app.request("/api/test", {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:3001",
        "Access-Control-Request-Method": "POST",
      },
    });

    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Methods")).toBeTruthy();
    expect(res.headers.get("Access-Control-Allow-Headers")).toBeTruthy();
  });

  it("allows specific origins when configured", async () => {
    app.use("*", cors({ allowedOrigins: ["https://example.com"] }));
    app.get("/api/test", (c) => c.json({ message: "ok" }));

    const res = await app.request("/api/test", {
      headers: { Origin: "https://example.com" },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://example.com");
  });

  it("blocks origins not in allowed list", async () => {
    app.use("*", cors({ allowedOrigins: ["https://example.com"] }));
    app.get("/api/test", (c) => c.json({ message: "ok" }));

    const res = await app.request("/api/test", {
      headers: { Origin: "https://malicious.com" },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("allows all origins with wildcard", async () => {
    app.use("*", cors({ allowedOrigins: ["*"] }));
    app.get("/api/test", (c) => c.json({ message: "ok" }));

    const res = await app.request("/api/test", {
      headers: { Origin: "https://any-origin.com" },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("sets Access-Control-Max-Age header", async () => {
    app.use("*", cors({ maxAge: 3600 }));
    app.get("/api/test", (c) => c.json({ message: "ok" }));

    const res = await app.request("/api/test", {
      method: "OPTIONS",
      headers: { Origin: "http://localhost:3001" },
    });

    expect(res.headers.get("Access-Control-Max-Age")).toBe("3600");
  });

  it("sets Access-Control-Allow-Credentials when enabled", async () => {
    app.use("*", cors({ allowCredentials: true }));
    app.get("/api/test", (c) => c.json({ message: "ok" }));

    const res = await app.request("/api/test", {
      headers: { Origin: "http://localhost:3001" },
    });

    expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  });

  it("sets exposed headers when configured", async () => {
    app.use("*", cors({ exposedHeaders: ["X-Custom-Header", "X-Total-Count"] }));
    app.get("/api/test", (c) => c.json({ message: "ok" }));

    const res = await app.request("/api/test", {
      headers: { Origin: "http://localhost:3001" },
    });

    const exposed = res.headers.get("Access-Control-Expose-Headers");
    expect(exposed).toContain("X-Custom-Header");
    expect(exposed).toContain("X-Total-Count");
  });
});
