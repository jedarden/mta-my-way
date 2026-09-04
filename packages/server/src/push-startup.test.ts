/**
 * Startup wiring test for the push notification subsystem.
 *
 * index.ts owns the boot wiring (loadOrGenerateVapidKeys → configureWebPush →
 * startPushPipeline → startBriefingScheduler); index.test.ts pins that those
 * calls happen. This file pins what they buy the client: the VAPID public key
 * endpoint answers 200 once web-push is configured, and 503 before it — the
 * exact regression where startup stopped wiring the subsystem and no browser
 * could ever subscribe.
 *
 * Both modules are imported fresh inside the test (vi.resetModules) so the
 * configure/no-configure order is deterministic regardless of what other test
 * files in the same fork did to the vapid module state.
 */

import type { ComplexIndex, RouteIndex, StationIndex } from "@mta-my-way/shared";
import type { Hono } from "hono";
import { expect, it, vi } from "vitest";

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

const COMPLEXES: ComplexIndex = {
  "725": {
    complexId: "725",
    name: "Times Square",
    stations: ["101"],
  },
};

it("returns 503 before web-push is configured and 200 after startup configures it", async () => {
  vi.resetModules();

  const { createApp } = await import("./app.js");
  const { configureWebPush, generateVapidKeys, getVapidPublicKey } = await import(
    "./push/vapid.js"
  );

  const app: Hono = createApp(STATIONS, ROUTES, COMPLEXES, {}, "/nonexistent/dist");

  // Unconfigured — the deleted-wiring state: no key to subscribe with.
  expect(getVapidPublicKey()).toBeNull();

  const before = await app.request("/api/push/vapid-public-key");
  expect(before.status).toBe(503);
  expect(await before.json()).toEqual({ error: "Push notifications not configured" });

  // What index.ts now does during startup (real modules, real key).
  configureWebPush(generateVapidKeys());

  expect(getVapidPublicKey()).not.toBeNull();

  const after = await app.request("/api/push/vapid-public-key");
  expect(after.status).toBe(200);

  const body = (await after.json()) as { publicKey: string };
  expect(body.publicKey).toBe(getVapidPublicKey());
});
