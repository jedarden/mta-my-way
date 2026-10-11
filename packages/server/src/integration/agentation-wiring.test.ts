/**
 * Integration tests for the Agentation wiring on the /status dashboard.
 *
 * The workspace agentation rule requires every HTML entry point to mount
 * the visual-feedback toolbar, and requires that it be verified by
 * mounting, never by grepping for a script tag. These tests lock the
 * structural half of that contract for the server-assembled page: the
 * import map must exist and must precede the /agentation.js module tag
 * (a map that follows the module dies with "Failed to resolve module
 * specifier" while the page renders perfectly), the react/react-dom pins
 * must be present, and the mount self-check must ship. The live mounting
 * half is covered by the browser check against a built app — see
 * docs/notes/agentation-wiring.md.
 */

import type {
  ComplexIndex,
  RouteIndex,
  StationIndex,
  TransferConnection,
} from "@mta-my-way/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import {
  TEST_STATIONS,
  cleanupAllState,
  closeDatabase,
  createIntegrationTestDatabase,
} from "./test-helpers.js";

const TEST_ROUTES: RouteIndex = {
  "1": {
    id: "1",
    shortName: "1",
    longName: "Broadway-7th Ave Local",
    color: "#EE352E",
    textColor: "#FFFFFF",
    feedId: "gtfs",
    division: "A",
    stops: ["101", "102", "725"],
    isExpress: false,
  },
};

const TEST_COMPLEXES: ComplexIndex = {
  "725-726": {
    complexId: "725-726",
    name: "Times Sq-42 St / Port Authority",
    stations: ["725", "726"],
    allLines: ["1", "2", "3", "7", "N", "Q", "R", "W", "S", "A", "C", "E"],
    allStopIds: ["725N", "725S", "726N", "726S"],
  },
};

const TEST_TRANSFERS: Record<string, TransferConnection[]> = {
  "725": [{ toStationId: "726", toLines: ["A", "C", "E"], walkingSeconds: 120, accessible: true }],
};

describe("Agentation wiring on GET /status", () => {
  let app: ReturnType<typeof createApp>;
  let db: ReturnType<typeof createIntegrationTestDatabase>;

  beforeEach(() => {
    db = createIntegrationTestDatabase();
    app = createApp(
      TEST_STATIONS as StationIndex,
      TEST_ROUTES,
      TEST_COMPLEXES,
      TEST_TRANSFERS,
      "/nonexistent/dist"
    );
  });

  afterEach(async () => {
    await cleanupAllState();
    closeDatabase(db);
  });

  it("serves the page with the Agentation import map before the module tag", async () => {
    const res = await app.request("/status");
    expect(res.status).toBe(200);

    const html = await res.text();

    // One import map, and it precedes the module tag that needs it.
    const mapCount = html.split('<script type="importmap">').length - 1;
    expect(mapCount).toBe(1);
    const mapIndex = html.indexOf('<script type="importmap">');
    const moduleIndex = html.indexOf('<script type="module" src="/agentation.js">');
    expect(moduleIndex).toBeGreaterThan(-1);
    expect(mapIndex).toBeGreaterThanOrEqual(0);
    expect(mapIndex).toBeLessThan(moduleIndex);
  });

  it("pins react and react-dom through the import map", async () => {
    const res = await app.request("/status");
    const html = await res.text();

    // react (module) + react/jsx-runtime both resolve to the react pin;
    // react-dom and react-dom/client to the react-dom pin.
    expect(html.match(/https:\/\/esm\.sh\/react@18\.3\.1/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html.match(/https:\/\/esm\.sh\/react-dom@18\.3\.1/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html).toContain("https://esm.sh/react-dom@18.3.1/client");
    expect(html).toContain("https://esm.sh/react@18.3.1/jsx-runtime");
  });

  it("ships the mount self-check for #agentation-root", async () => {
    const res = await app.request("/status");
    const html = await res.text();

    expect(html).toContain("getElementById('agentation-root')");
    expect(html).toContain("Agentation did not mount");
  });
});
