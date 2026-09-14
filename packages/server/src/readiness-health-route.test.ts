/**
 * Lightweight readiness routes.
 *
 * /healthz is the new machine-readiness path. /health remains as a temporary
 * backward-compatible alias while readiness consumers migrate to /healthz.
 * Both routes are deliberately registered before the normal middleware chain.
 */

import type { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";

let app: Hono;

beforeEach(() => {
  vi.clearAllMocks();
  app = createApp({}, {}, {}, {}, "/nonexistent/dist");
});

describe("GET /healthz", () => {
  it("returns a successful JSON readiness payload", async () => {
    const response = await app.request("/healthz");

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");

    const body = await response.json();
    expect(body).toEqual({
      status: "ok",
      uptime_seconds: expect.any(Number),
    });
    expect(Number.isFinite(body.uptime_seconds)).toBe(true);
    expect(body.uptime_seconds).toBeGreaterThanOrEqual(0);
  });

  it("is explicitly non-cacheable", async () => {
    const response = await app.request("/healthz");

    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("responds before the normal middleware chain", async () => {
    const response = await app.request("/healthz", {
      headers: { "X-Request-ID": "readiness-probe" },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Request-ID")).toBeNull();
    expect(response.headers.get("X-Content-Type-Options")).toBeNull();
  });
});

describe("GET /health backward-compatible alias", () => {
  it("preserves the existing readiness response", async () => {
    const response = await app.request("/health");

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      status: "ok",
      uptime_seconds: expect.any(Number),
    });
  });
});
