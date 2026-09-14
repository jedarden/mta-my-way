/**
 * Lightweight readiness routes.
 *
 * /healthz is the new machine-readiness path. /health remains as a temporary
 * backward-compatible alias while readiness consumers migrate to /healthz.
 * Both routes are deliberately registered before the normal middleware chain,
 * and both answers are pinned as non-cacheable (no-store) — a readiness probe
 * must never be served from a cache.
 *
 * The "interfering middleware" block proves the pre-middleware registration
 * with a host policy that genuinely blocks other paths in production: the
 * middleware chain would reject the probe's request, but /healthz (and the
 * /health alias) still answer because no middleware runs for them.
 */

import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

describe("readiness availability under interfering middleware", () => {
  const originalNodeEnv = process.env["NODE_ENV"];
  const originalAllowedHosts = process.env["ALLOWED_HOSTS"];

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env["NODE_ENV"];
    } else {
      process.env["NODE_ENV"] = originalNodeEnv;
    }
    if (originalAllowedHosts === undefined) {
      delete process.env["ALLOWED_HOSTS"];
    } else {
      process.env["ALLOWED_HOSTS"] = originalAllowedHosts;
    }
  });

  /**
   * createApp reads the host policy from the environment at construction
   * time, so the production configuration (require an allow-listed Host,
   * reject missing/localhost/pod-IP hosts) is applied by setting the
   * variables before createApp runs.
   */
  function createProductionApp(): Hono {
    process.env["NODE_ENV"] = "production";
    process.env["ALLOWED_HOSTS"] = "mta-my-way.example.com";
    return createApp({}, {}, {}, {}, "/nonexistent/dist");
  }

  it("remains reachable and non-cacheable when host-header protection would reject the request", async () => {
    // An in-pod readiness probe carries a Host (pod IP / localhost) that the
    // production host policy rejects on middleware-covered paths.
    const response = await createProductionApp().request("/healthz");

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ status: "ok" });
  });

  it("the same configuration rejects a middleware-covered path, proving the interference is real", async () => {
    const response = await createProductionApp().request("/api/health");

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "Invalid Host header" });
  });

  it("without the production policy the same path answers from its handler, attributing the 400 to the host middleware", async () => {
    // Default (non-production) configuration: /api/health passes the
    // middleware chain, so the 400 above is the host policy firing — not the
    // endpoint being unavailable in a bare app.
    const response = await app.request("/api/health");

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");
  });
});
