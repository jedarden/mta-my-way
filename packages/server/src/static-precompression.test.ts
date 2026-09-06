/**
 * Precompressed static assets: .br/.gz siblings must be served with
 * Content-Encoding, not discarded.
 *
 * vite-plugin-compression writes index.html.br/.gz and per-chunk .js/.br/.gz
 * alongside every asset in dist. The static path used to ignore them, so the
 * build paid for bytes the server never sent. These tests pin the response
 * headers a browser actually negotiates on: Accept-Encoding: br must come back
 * as Content-Encoding: br (and the bytes must really be brotli), and a client
 * that sends no Accept-Encoding must still get the identity body.
 *
 * Like spa-health-route.test.ts, this builds a real dist directory rather than
 * /nonexistent/dist, because the property under test is what comes back off disk.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brotliCompressSync, brotliDecompressSync, gunzipSync, gzipSync } from "node:zlib";
import type { ComplexIndex, RouteIndex, StationIndex } from "@mta-my-way/shared";
import type { Hono } from "hono";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
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
  "1": { id: "1", name: "1", color: "#EE352E", textColor: "#FFFFFF", stations: ["101"] },
};

const COMPLEXES: ComplexIndex = {};

/** Marker embedded in the fixture SPA shell — proves the shell (not a 404) came back. */
const SPA_MARKER = "<!-- static-precompression-fixture -->";

/** Vite-emitted hashed chunk name; the hash shape is what immutable caching keys on. */
const CHUNK_NAME = "app-1a2b3c4d.js";
const CHUNK_SOURCE = `console.log("${"fixture-payload".repeat(40)}");`;

/** Fixture with the full set of precompressed siblings, as the web build emits them. */
let distDir: string;
let app: Hono;

/** Fixture with a brotli sibling but no gzip one, for the missing-sibling fallthrough. */
let partialDistDir: string;
let partialApp: Hono;

function buildDist(options: { withGzip: boolean }): string {
  const dir = mkdtempSync(join(tmpdir(), "mta-precompressed-dist-"));
  const shell = Buffer.from(`<!doctype html><html><body>${SPA_MARKER}</body></html>`);
  writeFileSync(join(dir, "index.html"), shell);
  writeFileSync(join(dir, "index.html.br"), brotliCompressSync(shell));
  if (options.withGzip) writeFileSync(join(dir, "index.html.gz"), gzipSync(shell));
  mkdirSync(join(dir, "assets"), { recursive: true });
  writeFileSync(join(dir, "assets", CHUNK_NAME), CHUNK_SOURCE);
  writeFileSync(
    join(dir, "assets", `${CHUNK_NAME}.br`),
    brotliCompressSync(Buffer.from(CHUNK_SOURCE))
  );
  writeFileSync(join(dir, "assets", `${CHUNK_NAME}.gz`), gzipSync(Buffer.from(CHUNK_SOURCE)));
  return dir;
}

afterAll(() => {
  for (const dir of [distDir, partialDistDir]) {
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

beforeEach(() => {
  vi.clearAllMocks();
  distDir = buildDist({ withGzip: true });
  partialDistDir = buildDist({ withGzip: false });
  app = createApp(STATIONS, ROUTES, COMPLEXES, {}, distDir);
  partialApp = createApp(STATIONS, ROUTES, COMPLEXES, {}, partialDistDir);
});

function get(path: string, acceptEncoding?: string): Promise<Response> {
  return app.request(path, {
    headers: acceptEncoding ? { "Accept-Encoding": acceptEncoding } : {},
  });
}

describe("GET /assets/<chunk>.js (precompressed on-disk asset)", () => {
  it("returns content-encoding: br for Accept-Encoding: br", async () => {
    const res = await get(`assets/${CHUNK_NAME}`, "br");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Encoding")).toBe("br");
    expect(res.headers.get("Vary")).toContain("Accept-Encoding");
  });

  it("sends bytes that really are brotli", async () => {
    const res = await get(`assets/${CHUNK_NAME}`, "br");
    const decoded = brotliDecompressSync(Buffer.from(await res.arrayBuffer()));
    expect(decoded.toString("utf8")).toBe(CHUNK_SOURCE);
  });

  it("returns content-encoding: gzip for Accept-Encoding: gzip", async () => {
    const res = await get(`assets/${CHUNK_NAME}`, "gzip");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Encoding")).toBe("gzip");
    const decoded = gunzipSync(Buffer.from(await res.arrayBuffer()));
    expect(decoded.toString("utf8")).toBe(CHUNK_SOURCE);
  });

  it("prefers brotli when the client accepts both", async () => {
    const res = await get(`assets/${CHUNK_NAME}`, "gzip, br");
    expect(res.headers.get("Content-Encoding")).toBe("br");
  });

  it("keeps the identity body when no encoding is accepted", async () => {
    const res = await get(`assets/${CHUNK_NAME}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Encoding")).toBeNull();
    expect(await res.text()).toBe(CHUNK_SOURCE);
  });

  it("keeps the identity body when the client sends an explicit q=0", async () => {
    const res = await get(`assets/${CHUNK_NAME}`, "gzip;q=0, br;q=0");
    expect(res.headers.get("Content-Encoding")).toBeNull();
    expect(await res.text()).toBe(CHUNK_SOURCE);
  });

  it("keeps immutable caching keyed on the un-suffixed asset path", async () => {
    const res = await get(`assets/${CHUNK_NAME}`, "br");
    expect(res.headers.get("Cache-Control")).toContain("immutable");
  });
});

describe("GET / (SPA shell served by serveStatic)", () => {
  it("returns content-encoding: br for Accept-Encoding: br", async () => {
    const res = await get("/", "br");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Encoding")).toBe("br");
    expect(res.headers.get("Content-Type")).toContain("text/html");
  });

  it("sends the identity shell when no encoding is accepted", async () => {
    const res = await get("/");
    expect(res.headers.get("Content-Encoding")).toBeNull();
    expect(await res.text()).toContain(SPA_MARKER);
  });
});

describe("GET /commute (SPA fallback route, no file on disk)", () => {
  it("returns content-encoding: br and brotli bytes of the shell", async () => {
    const res = await get("/commute", "br");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Encoding")).toBe("br");
    expect(res.headers.get("Content-Type")).toContain("text/html");
    const decoded = brotliDecompressSync(Buffer.from(await res.arrayBuffer()));
    expect(decoded.toString("utf8")).toContain(SPA_MARKER);
  });

  it("returns content-encoding: gzip when only gzip is accepted", async () => {
    const res = await get("/commute", "gzip");
    expect(res.headers.get("Content-Encoding")).toBe("gzip");
    const decoded = gunzipSync(Buffer.from(await res.arrayBuffer()));
    expect(decoded.toString("utf8")).toContain(SPA_MARKER);
  });

  it("falls back to the identity shell when only a rejected encoding exists on disk", async () => {
    // partialDistDir ships index.html.br only; a gzip-only client must get the
    // identity shell rather than .br bytes with no Content-Encoding.
    const res = await partialApp.request("/commute", {
      headers: { "Accept-Encoding": "deflate, gzip" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Encoding")).toBeNull();
    expect(await res.text()).toContain(SPA_MARKER);
  });

  it("does not send Vary when the shell is served uncompressed", async () => {
    const res = await get("/commute");
    expect(res.headers.get("Vary")).toBeNull();
  });
});
