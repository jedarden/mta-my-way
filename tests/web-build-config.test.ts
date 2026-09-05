import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import config, {
  BUNDLE_ANALYZE_FLAG,
  BUNDLE_REPORT_FILENAME,
  SERVICE_WORKER_NAVIGATION_FALLBACK,
} from "../packages/web/vite.config";

/**
 * Guards the service-worker navigation contract that broke in production.
 *
 * The bundle visualizer used to write dist/stats.html unconditionally, the
 * workbox precache swept up every *.html, and precache matching cleans URLs —
 * so a visit to /stats was answered with the bundle report instead of the app.
 * Fixing that surfaced a second defect: the navigation fallback was the offline
 * page, so the service worker answered every deep link but "/" with "You're
 * Offline", even while online.
 *
 * This lives in the root (node) project rather than packages/web/src because
 * the config imports vite and esbuild, which cannot load under jsdom's
 * TextEncoder. These assertions pin the config decisions; they cannot check the
 * built output, so the served-document behaviour is verified separately by a
 * browser probe against a production build: load /, wait for sw.js to control,
 * navigate to /stats, and expect the StatsScreen.
 */

describe("web build config — service worker navigation contract", () => {
  it(`does not run the bundle visualizer unless ${BUNDLE_ANALYZE_FLAG} is set`, () => {
    // A normal `npm run build` ships no analysis report at all.
    delete process.env[BUNDLE_ANALYZE_FLAG];
    const names = config.plugins.flat().map((p) => (p as { name?: string } | null)?.name);
    expect(names).not.toContain("visualizer");
  });

  it("writes the bundle report outside the served build output", () => {
    // Anything landing in dist/ is served statically and swept into the workbox
    // precache manifest, which is how stats.html became reachable as /stats.
    const resolved = resolve("packages/web", BUNDLE_REPORT_FILENAME);
    const distDir = resolve("packages/web", "dist");
    expect(resolved.startsWith(`${distDir}/`)).toBe(false);
    expect(resolved).not.toBe(distDir);
  });

  it("falls back to the app shell for navigations, not the offline page", () => {
    // This is a client-routed SPA: the fallback must be index.html so a deep
    // link boots the app and the router picks the screen. Pointing it at
    // offline.html made every deep link but "/" read as "You're Offline".
    expect(SERVICE_WORKER_NAVIGATION_FALLBACK).toBe("/index.html");
    expect(SERVICE_WORKER_NAVIGATION_FALLBACK).not.toBe("/offline.html");
  });
});
