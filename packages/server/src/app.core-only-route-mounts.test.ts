/**
 * App-level pin: which route families each deployment mode mounts.
 *
 * ADR-001 (docs/plan/plan.md) originally promised a core→stateful app-layer
 * proxy for `/api/auth/password/*`, `/api/auth/session` and `/api/preferences`.
 * That mechanism was superseded by ingress-level routing (declarative-config
 * `d23c4a87`, 2026-09-12): the IngressRoute sends the six stateful prefixes
 * (`/api/push/`, `/api/auth/`, `/api/preferences`, `/api/trips`,
 * `/api/journal/`, `/auth/`) straight to `mta-my-way-stateful` — which runs
 * with CORE_ONLY unset and therefore mounts every handler itself — and only
 * the catch-all reaches the core. The supersession was ratified as the
 * deliberate design, not a gap, in
 * `docs/notes/adr-001-core-only-stateful-routes-decision.md` §4
 * (mtamyway-60cde06d), which forbids bringing proxy route code back.
 *
 * These tests pin the app half of that split for all four route families that
 * sit behind an `if (!CORE_ONLY)` mount gate in `app.ts` (push subscriptions,
 * trips/journal, OAuth, and the password-reset/preferences/session block) —
 * one representative path per family, probed through the single shared
 * constant `CORE_ONLY` exported from `config.ts`. The browser-facing `/auth/`
 * prefix (same gate as the OAuth aliases, its own ingress prefix) has a
 * dedicated pair of tests because a provider must be registered to
 * distinguish a mounted begin handler (302) from the unmounted 404.
 * That constant is the only
 * `CORE_ONLY` read in the codebase, so no per-route env parsing is involved
 * or may return. The handlers themselves are mode-agnostic; that is pinned
 * separately in `routes/password-reset.routes.test.ts` ("deployment-mode
 * independence"). The startup half — that CORE_ONLY=true never opens or
 * initializes the SQLite database at all — is pinned separately in
 * `index.test.ts` ("skips the push subsystem / security persistence entirely
 * in CORE_ONLY mode"), which asserts `configurePushDatabase` and
 * `withPushDatabase` are never invoked.
 *
 * Fixture note: `createApp` gets a nonexistent web dist (the app.test.ts
 * convention), so an unmounted path falls through to the SPA fallback's
 * `c.notFound()` and answers 404, while a mounted path answers from its real
 * handler — policy 200, session 200 (unauthenticated), preferences 401, push
 * key 200, OAuth providers 200, trips 401. All of these full-mode responses
 * are deterministic without a database, which keeps the pin hermetic. The
 * static/PWA test at the bottom instead builds a real on-disk dist, because
 * proving those routes stay available requires files to serve.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ComplexIndex, RouteIndex, StationIndex, TravelTimeIndex } from "@mta-my-way/shared";
import type { Hono } from "hono";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { initDelayPredictor } from "./delay-predictor.js";

// ---------------------------------------------------------------------------
// Minimal fixtures (trimmed from app.test.ts to what createApp requires)
// ---------------------------------------------------------------------------

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

const TRANSFERS: Record<
  string,
  Array<{ toStationId: string; toLines: string[]; walkingSeconds: number; accessible: boolean }>
> = {};

const TRAVEL_TIMES: TravelTimeIndex = {};

beforeAll(() => {
  initDelayPredictor(TRAVEL_TIMES, STATIONS);
});

// Same inert-module mocks app.test.ts registers, so createApp's import graph
// stays hermetic in both modes. config.js is deliberately NOT mocked — the
// real module must be re-evaluated so the shared CORE_ONLY constant flips.
vi.mock("./cache.js", () => ({
  getArrivals: vi.fn(() => null),
  getFeedStates: vi.fn(() => [
    {
      id: "gtfs",
      name: "A Division (1/2/3/4/5/6/7/S/GS)",
      circuitOpenAt: null,
      lastSuccessAt: Date.now(),
      lastPollAt: Date.now(),
      consecutiveFailures: 0,
      entityCount: 150,
      isStale: false,
      lastErrorMessage: null,
      latencyHistory: [100, 120, 95],
      errorTimestamps: [],
      parseErrors: 0,
      tripReplacementPeriod: 12000,
    },
  ]),
  avgLatency: vi.fn(() => 105),
  errorCount24h: vi.fn(() => 0),
  getPositions: vi.fn(() => null),
}));

vi.mock("./alerts-poller.js", () => ({
  getAllAlerts: vi.fn(() => []),
  getAlertsForLine: vi.fn(() => []),
  getAlertsForLines: vi.fn(() => ({})),
  getAlertsForStation: vi.fn(() => []),
  getAlertsStatus: vi.fn(() => ({
    alertCount: 0,
    lastSuccessAt: new Date().toISOString(),
    matchRate: 1,
    consecutiveFailures: 0,
    circuitOpen: false,
    unmatchedCount: 0,
  })),
}));

vi.mock("./delay-detector.js", () => ({
  getPredictedAlerts: vi.fn(() => []),
  getDelayDetectorStatus: vi.fn(() => ({
    trackedTrips: 0,
    activeAlerts: 0,
    thresholdMultiplier: 2.0,
    minTrainsForLineAlert: 2,
  })),
}));

vi.mock("./equipment-poller.js", () => ({
  getEquipmentForStation: vi.fn(() => null),
  getAllEquipment: vi.fn(() => []),
  getEquipmentStatus: vi.fn(() => ({
    lastFetchAt: null,
    lastSuccessAt: null,
    outages: 0,
    outageCount: 0,
    consecutiveFailures: 0,
    circuitOpen: false,
  })),
  getStationsWithBrokenElevators: vi.fn(() => []),
}));

vi.mock("./push/subscriptions.js", () => ({
  getSubscriptionCount: vi.fn(() => 0),
  getSubscriptionOwner: vi.fn(() => "test-owner"),
  upsertSubscription: vi.fn(),
  removeSubscription: vi.fn(() => true),
  updateSubscriptionFavorites: vi.fn(),
  updateSubscriptionQuietHours: vi.fn(),
  updateSubscriptionMorningScores: vi.fn(),
  isPushDatabaseReady: vi.fn(() => true),
  getPushDatabaseInitError: vi.fn(() => null),
}));

vi.mock("./push/vapid.js", () => ({
  getVapidPublicKey: vi.fn(() => "test-public-key-base64"),
}));

vi.mock("./positions-interpolator.js", () => ({
  buildLineDiagram: vi.fn(() => null),
}));

vi.mock("./trip-lookup.js", () => ({
  lookupTrip: vi.fn(() => null),
}));

// ---------------------------------------------------------------------------
// Mode flipping
// ---------------------------------------------------------------------------

/**
 * Rebuild the app in the requested deployment mode. `CORE_ONLY` is read by
 * `config.js` at import time, so the module registry is reset and the env var
 * is set before `app.js` (and `config.js`) are imported — the same pattern the
 * startup-wiring tests in `index.test.ts` use.
 */
async function importApp(coreOnly: boolean, webDistPath = "/nonexistent/dist"): Promise<Hono> {
  vi.resetModules();
  if (coreOnly) {
    process.env.CORE_ONLY = "true";
  } else {
    delete process.env.CORE_ONLY;
  }
  const { createApp } = await import("./app.js");
  return createApp(STATIONS, ROUTES, COMPLEXES, TRANSFERS, webDistPath);
}

afterEach(() => {
  delete process.env.CORE_ONLY;
  delete process.env.GOOGLE_OAUTH_CLIENT_ID;
  delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
});

/**
 * One representative path per `if (!CORE_ONLY)`-gated route family in app.ts:
 * push subscriptions, trips (trip tracking), the journal API (mounted behind
 * the same gate as trips but under its own `/api/journal/*` path family and
 * same-origin middleware), OAuth, and the password-reset/preferences/session
 * block that ADR-001 §4 covers.
 * Each is probed with GET, which every family serves without a state-changing
 * request (so same-origin protection never fires and no database is touched).
 */
const STATEFUL_GET_ROUTES = [
  "/api/auth/password/policy", // password reset
  "/api/auth/session", // preferences/session block
  "/api/preferences", // preferences/session block
  "/api/push/vapid-public-key", // push subscriptions
  "/api/trips", // trips (trip tracking)
  "/api/journal/summary", // journal API
  "/api/auth/oauth/providers", // OAuth
] as const;

/** Deterministic full-mode answer per probed path (no session, no database). */
const FULL_MODE_EXPECTED_STATUS: Record<(typeof STATEFUL_GET_ROUTES)[number], number> = {
  "/api/auth/password/policy": 200, // static policy, no auth required
  "/api/auth/session": 200, // reports unauthenticated
  "/api/preferences": 401, // requires a session
  "/api/push/vapid-public-key": 200, // mocked VAPID key
  "/api/trips": 401, // requires trips:read:own
  "/api/journal/summary": 401, // requires journals:read:own
  "/api/auth/oauth/providers": 200, // no providers configured → empty list
};

// ---------------------------------------------------------------------------
// Static/PWA fixture — a real on-disk dist, because availability requires
// files to serve. Same shape static-precompression.test.ts builds.
// ---------------------------------------------------------------------------

/** Marker embedded in the fixture SPA shell — proves the shell came back. */
const SPA_MARKER = "<!-- core-only-pwa-fixture -->";
const MANIFEST_BODY = JSON.stringify({ name: "MTA My Way fixture", start_url: "/" });

let pwaDistDir: string | null = null;

function buildPwaDist(): string {
  const dir = mkdtempSync(join(tmpdir(), "mta-core-only-pwa-dist-"));
  writeFileSync(join(dir, "index.html"), `<!doctype html><html><body>${SPA_MARKER}</body></html>`);
  writeFileSync(join(dir, "manifest.webmanifest"), MANIFEST_BODY);
  writeFileSync(join(dir, "sw.js"), "// service worker fixture");
  return dir;
}

afterAll(() => {
  if (pwaDistDir) {
    rmSync(pwaDistDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("stateful-route mounting per deployment mode (ADR-001 amendment)", () => {
  it("mounts none of the stateful routes when CORE_ONLY is true", async () => {
    const app = await importApp(true);

    // Prove the app really booted in core mode, so the 404s below are the
    // mount gate and not an app-wide failure (the control test covers that
    // too, per mode).
    const health = await app.request("/api/health");
    expect(health.status).toBe(200);
    const healthBody = (await health.json()) as { deploymentMode: string };
    expect(healthBody.deploymentMode).toBe("core-only");

    for (const path of STATEFUL_GET_ROUTES) {
      const res = await app.request(path);
      expect(
        res.status,
        `${path} must be unmounted in core mode — the ingress routes it to ` +
          `mta-my-way-stateful (docs/notes/adr-001-core-only-stateful-routes-decision.md §4)`
      ).toBe(404);
    }
  });

  it("mounts all of them in full mode (CORE_ONLY unset)", async () => {
    const app = await importApp(false);

    const health = await app.request("/api/health");
    expect(health.status).toBe(200);
    const healthBody = (await health.json()) as { deploymentMode: string };
    expect(healthBody.deploymentMode).toBe("full");

    for (const path of STATEFUL_GET_ROUTES) {
      const res = await app.request(path);
      expect(res.status, `${path} must answer from its real handler in full mode`).toBe(
        FULL_MODE_EXPECTED_STATUS[path]
      );
    }

    // The two stateless-reading handlers answer from their mocks, not a DB.
    const vapid = (await (await app.request("/api/push/vapid-public-key")).json()) as {
      publicKey: string;
    };
    expect(vapid.publicKey).toBe("test-public-key-base64");
    const providers = (await (await app.request("/api/auth/oauth/providers")).json()) as {
      providers: unknown[];
    };
    expect(providers.providers).toEqual([]);
  });

  /**
   * The browser-facing `/auth/*` family sits behind the same gate as the
   * `/api/auth/oauth/*` aliases but is a separate ingress prefix (ADR-001 §4
   * routes `/auth/` to the stateful deployment on its own), so it gets its
   * own representative. A bare begin request cannot serve as one: with no
   * provider configured the mounted handler answers 404 exactly like the
   * unmounted fallthrough. Registering Google through the documented env
   * credentials makes the mounted answer distinguishable — beginOAuth
   * redirects (302) to the provider's authorization endpoint, which also
   * proves the gate-internal `initializeDefaultProviders()` ran. Core mode
   * must stay 404 even with credentials present, pinning that the mount
   * gate — not missing configuration — is what unmounts the family.
   */
  it("keeps the browser-facing /auth/* family unmounted in core mode despite credentials", async () => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = "test-client-secret";
    const app = await importApp(true);

    const res = await app.request("/auth/google");
    expect(
      res.status,
      "/auth/:providerId must be unmounted in core mode — the ingress routes " +
        "/auth/ to mta-my-way-stateful (docs/notes/adr-001-core-only-stateful-routes-decision.md §4)"
    ).toBe(404);
  });

  it("mounts the browser-facing /auth/* family in full mode and initializes providers", async () => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = "test-client-secret";
    const app = await importApp(false);

    const res = await app.request("/auth/google");
    expect(res.status, "/auth/:providerId must answer from beginOAuth in full mode").toBe(302);
    const location = res.headers.get("location") ?? "";
    expect(location).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/);
    expect(location).toContain("client_id=test-client-id");
    expect(location).toContain("redirect_uri=");
    expect(location).toContain("state=");
  });

  it("keeps the core read path mounted in both modes", async () => {
    for (const coreOnly of [true, false]) {
      const app = await importApp(coreOnly);
      const res = await app.request("/api/stations");
      expect(
        res.status,
        `/api/stations must stay mounted in ${coreOnly ? "core-only" : "full"} mode`
      ).toBe(200);
    }
  });

  it("keeps static/PWA routes available in core mode", async () => {
    pwaDistDir = buildPwaDist();
    const app = await importApp(true, pwaDistDir);

    // The SPA shell serves at the root…
    const shell = await app.request("/");
    expect(shell.status).toBe(200);
    expect(await shell.text()).toContain(SPA_MARKER);

    // …the PWA manifest and service worker serve as static files…
    const manifest = await app.request("/manifest.webmanifest");
    expect(manifest.status).toBe(200);
    expect(await manifest.text()).toBe(MANIFEST_BODY);
    const sw = await app.request("/sw.js");
    expect(sw.status).toBe(200);

    // …and the lightweight readiness endpoint still answers first.
    expect((await app.request("/healthz")).status).toBe(200);
  });

  it("keeps static/PWA routes available in full mode too", async () => {
    if (!pwaDistDir) {
      pwaDistDir = buildPwaDist();
    }
    const app = await importApp(false, pwaDistDir);

    const shell = await app.request("/");
    expect(shell.status).toBe(200);
    expect(await shell.text()).toContain(SPA_MARKER);
    expect((await app.request("/manifest.webmanifest")).status).toBe(200);
  });
});
