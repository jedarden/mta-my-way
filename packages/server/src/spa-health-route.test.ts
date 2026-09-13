/**
 * SPA routing: /health must serve the app shell, /healthz the readiness probe.
 *
 * The server's lightweight readiness endpoint used to live at /health, which is
 * also an SPA route (the health dashboard screen). Because it was registered
 * before the static/SPA fallback, every direct visit to /health — a deep link,
 * a refresh on that screen, a shared link, a back/forward history entry —
 * received the readiness JSON and the React screen never rendered. The probe
 * now lives at /healthz so the SPA fallback owns /health.
 *
 * These tests pin both halves of that split. They build a real dist directory
 * (a marker index.html) rather than the usual /nonexistent/dist, because the
 * property under test is precisely that the fallback's index.html is what
 * comes back.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ComplexIndex, RouteIndex, StationIndex } from "@mta-my-way/shared";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";

const STATIONS: StationIndex = {
  "101": {
    id: "101",
    name: "South Ferry",
    lat: 40.702,
    lon: -74.013,
    lines: ["1"],
    northStopId: "101N",
    southStopId: "101S",
    transfers: [],
    ada: true,
    borough: "manhattan",
  },
};

const ROUTES: RouteIndex = {
  "1": {
    id: "1",
    shortName: "1",
    longName: "Broadway-7th Ave Local",
    color: "#EE352E",
    textColor: "#FFFFFF",
    feedId: "gtfs",
    division: "A",
    stops: ["101"],
    isExpress: false,
  },
};

const COMPLEXES: ComplexIndex = {};

/** Marker embedded in the fixture index.html — proves the SPA shell was served. */
const SPA_MARKER = "<!-- spa-health-route-fixture -->";

let distDir: string;
let app: Hono;

afterEach(() => {
  if (distDir) rmSync(distDir, { recursive: true, force: true });
});

beforeEach(() => {
  vi.clearAllMocks();
  distDir = mkdtempSync(join(tmpdir(), "mta-spa-dist-"));
  writeFileSync(
    join(distDir, "index.html"),
    `<!doctype html><html><body>${SPA_MARKER}</body></html>`
  );
  app = createApp(STATIONS, ROUTES, COMPLEXES, {}, distDir);
});

describe("GET /health (SPA route)", () => {
  it("serves the SPA index rather than a JSON readiness payload", async () => {
    const res = await app.request("/health");

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
    expect(await res.text()).toContain(SPA_MARKER);
  });

  it("does not return the machine readiness JSON", async () => {
    const res = await app.request("/health");

    expect(res.headers.get("Content-Type")).not.toContain("application/json");
  });

  it("is reachable with a trailing slash", async () => {
    const res = await app.request("/health/");

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
    expect(await res.text()).toContain(SPA_MARKER);
  });
});

describe("GET /healthz (machine readiness probe)", () => {
  it("returns the readiness JSON", async () => {
    const res = await app.request("/healthz");

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");

    const body = (await res.json()) as { status: string; uptime_seconds: number };
    expect(body.status).toBe("ok");
    expect(typeof body.uptime_seconds).toBe("number");
  });

  it("is not cached", async () => {
    const res = await app.request("/healthz");

    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("does not serve the SPA shell", async () => {
    const res = await app.request("/healthz");

    expect(res.headers.get("Content-Type")).not.toContain("text/html");
  });
});
