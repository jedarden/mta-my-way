import type {
  Commute,
  ComplexIndex,
  RouteIndex,
  TransferConnection,
  TripRecord,
} from "@mta-my-way/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Round-trip proof that the frontend consumes the server journal surface.
 *
 * Every web-side journal suite stubs `fetch` with canned responses, so none of
 * them can show a write actually reaching the server. This file stubs nothing
 * but the transport boundary itself: the real zustand journal store records a
 * trip, the real sync step (`pushLocalTrips`) uploads it through the real
 * client (`journalApi`), the request is handled by the real Hono app
 * (`createApp`) over a real SQLite trip database, and the read side
 * (`pullServerTrips`, `getJournalSummary`) reads it back into the store.
 *
 * The one substitution is the browser session cookie, which the fetch shim
 * replaces with the API-key Authorization header the server's own auth
 * middleware accepts — the same substitution every `packages/server`
 * integration test makes. Everything above and below that seam is production
 * code on both sides.
 *
 * This lives in the root (node) project rather than packages/web/src because
 * it imports across package lines in both directions — the web store/sync/
 * client and the server app — which no package's tsconfig rootDir can cover.
 * The modules are imported dynamically per test so `vi.resetModules()` gives
 * each test one coherent module graph instead of a static/dynamic split.
 */

const DIST_DIR = "/nonexistent/dist";

const TEST_ROUTES: RouteIndex = {
  "1": {
    id: "1",
    shortName: "1",
    longName: "Broadway-7th Ave Local",
    color: "#EE352E",
    textColor: "#FFFFFF",
    feedId: "gtfs",
    division: "A",
    stops: ["725", "102"],
    isExpress: false,
  },
};

const TEST_COMPLEXES: ComplexIndex = {};
const TEST_TRANSFERS: Record<string, TransferConnection[]> = {};

/** Matches the trip below, so the pulled-back record lands on this commute. */
const WORK_COMMUTE: Commute = {
  id: "work",
  name: "Work",
  origin: { stationId: "725", stationName: "Times Sq-42 St" },
  destination: { stationId: "102", stationName: "Rector St" },
  preferredLines: ["1"],
  isPinned: false,
  enableTransferSuggestions: false,
};

/** Minimal localStorage, so the stores and the sync registry have a home. */
function memoryStorage(): {
  length: number;
  clear(): void;
  getItem(key: string): string | null;
  key(index: number): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
} {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => map.delete(key),
    setItem: (key, value) => map.set(key, String(value)),
  };
}

/** A local record the journal logger would have written for this commute. */
function makeLocalTrip(): TripRecord {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return {
    id: "local-1",
    date: new Date().toISOString().split("T")[0]!,
    origin: { stationId: "725", stationName: "Times Sq-42 St" },
    destination: { stationId: "102", stationName: "Rector St" },
    line: "1",
    departureTime: nowSeconds - 3600,
    arrivalTime: nowSeconds - 1800,
    actualDurationMinutes: 30,
    source: "tracked",
    notes: "mirrored from the device journal",
  };
}

/**
 * Build one test's worth of production code on both sides of the wire.
 * Returns the dynamically imported modules so no static import can hold a
 * second copy of a module graph that `vi.resetModules()` just discarded.
 */
async function freshHarness() {
  vi.resetModules();
  vi.stubGlobal("localStorage", memoryStorage());
  // journalApi reads the CSRF token off document.cookie before a write.
  vi.stubGlobal("document", { cookie: "csrf_token=test-csrf-token" });

  const helpers = await import("../packages/server/src/integration/test-helpers");
  const { setRateLimiterTestMode } = await import("../packages/server/src/middleware/rate-limiter");
  const tracking = await import("../packages/server/src/trip-tracking");
  const subscriptions = await import("../packages/server/src/push/subscriptions");
  const { createApp } = await import("../packages/server/src/app");

  setRateLimiterTestMode(true);

  const db = helpers.createIntegrationTestDatabase();
  tracking.initTripTracking(db, helpers.TEST_STATIONS);
  subscriptions.initPushDatabase(":memory:");

  const credentials = await helpers.createTestUserCredentials();
  const app = createApp(
    helpers.TEST_STATIONS,
    TEST_ROUTES,
    TEST_COMPLEXES,
    TEST_TRANSFERS,
    DIST_DIR
  );

  // Transport seam: same-origin fetch is rewritten onto the mounted app. The
  // path, query, headers, JSON body, status codes and payloads stay exactly
  // what the client produced and what the routes answered.
  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const path = url.startsWith("http") ? new URL(url).pathname + new URL(url).search : url;
    const headers = new Headers(init?.headers);
    headers.set("Authorization", credentials.authorizationHeader);
    return app.request(path, { ...init, headers });
  });

  const sync = await import("../packages/web/src/hooks/useJournalSync");
  const journal = await import("../packages/web/src/stores/journalStore");
  const favorites = await import("../packages/web/src/stores/favoritesStore");
  const api = await import("../packages/web/src/lib/journalApi");

  favorites.useFavoritesStore.setState({ commutes: [WORK_COMMUTE] });
  journal.useJournalStore.setState({ stats: {}, dayOfWeekStats: {}, lastStationVisit: null });

  return {
    db,
    close: () => {
      helpers.closeDatabase(db);
      subscriptions.closePushDatabase();
    },
    sync,
    journal,
    api,
    tracking,
  };
}

/** One full sync cycle: local record in, mirrored record back out. */
async function runRoundTrip() {
  const harness = await freshHarness();
  const local = makeLocalTrip();

  harness.journal.useJournalStore.getState().addTripRecord(WORK_COMMUTE.id, local);
  expect(
    harness.journal.useJournalStore.getState().stats[WORK_COMMUTE.id]!.records.map((r) => r.id)
  ).toEqual([local.id]);
  expect(harness.tracking.getTotalTripCount()).toBe(0);

  // Push: sync step -> client API -> POST /api/trips -> SQLite.
  expect(await harness.sync.pushLocalTrips()).toBe(false);
  expect(harness.tracking.getTotalTripCount()).toBe(1);

  // Pull: GET /api/trips -> client API -> mergeServerRecords -> store.
  expect(await harness.sync.pullServerTrips()).toBe(true);

  const records = harness.journal.useJournalStore.getState().stats[WORK_COMMUTE.id]!.records;
  expect(records).toHaveLength(1);
  return { harness, local, roundTripped: records[0]! };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("journal sync round trip — the web store through the server routes", () => {
  it("carries a journal write from the store through the client API to the server routes and back", async () => {
    const { harness, local, roundTripped } = await runRoundTrip();

    // The server assigned its own identity, so this record came back through
    // the route rather than being the local copy echoed by a stub.
    expect(roundTripped.id).not.toBe(local.id);
    expect(roundTripped.id).toBeTruthy();

    // Same ride by the identity the sync matches on: origin, destination,
    // line and departure time survive the server's own storage verbatim.
    expect(harness.journal.tripIdentityKey(roundTripped)).toBe(
      harness.journal.tripIdentityKey(local)
    );

    // Station names were resolved by the server from its own station index.
    expect(roundTripped.origin).toEqual(local.origin);
    expect(roundTripped.destination).toEqual(local.destination);
    expect(roundTripped.line).toBe(local.line);
    expect(roundTripped.departureTime).toBe(local.departureTime);
    expect(roundTripped.arrivalTime).toBe(local.arrivalTime);
    expect(roundTripped.notes).toBe(local.notes);

    // The server records a mirrored trip as "manual"; the locally observed
    // source is the one field the merge is specified to keep.
    expect(roundTripped.source).toBe("tracked");

    // The aggregate journal route answers from the same server-side database.
    const summary = await harness.api.getJournalSummary();
    expect(summary.totalTrips).toBe(1);
    expect(summary.recentTrips.map((trip) => trip.id)).toContain(roundTripped.id);
  });

  it("does not re-upload a trip the server has already acknowledged", async () => {
    const { harness } = await runRoundTrip();

    // The pulled record's identity key is registered as mirrored, so a second
    // sync pass uploads nothing — the server journal stays at one trip.
    expect(await harness.sync.pushLocalTrips()).toBe(false);
    expect(harness.tracking.getTotalTripCount()).toBe(1);
  });

  it("deletes the server copy when the local record is removed", async () => {
    const { harness, roundTripped } = await runRoundTrip();

    // The delete queue is driven by the server id the pull registered, which
    // is what makes the tombstone reach the route instead of the trip
    // resurrecting on the next pull.
    harness.sync.notifyJournalTripDeleted(roundTripped);
    harness.journal.useJournalStore.getState().removeTripRecord(WORK_COMMUTE.id, roundTripped.id);
    await expect(harness.api.deleteServerTrip(roundTripped.id)).resolves.toBeUndefined();

    expect(harness.tracking.getTotalTripCount()).toBe(0);
    expect(await harness.sync.pullServerTrips()).toBe(true);
    expect(
      harness.journal.useJournalStore.getState().stats[WORK_COMMUTE.id]?.records ?? []
    ).toHaveLength(0);
  });
});

describe("app shell mount contract", () => {
  it("mounts the journal sync exactly once", async () => {
    // The sync hook is the only consumer of the server journal surface, so a
    // shell that stops mounting it silently re-creates the unconsumed-API
    // state this file proves is gone. Exactly one call site: two would double
    // every poll under StrictMode.
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(new URL("../packages/web/src/App.tsx", import.meta.url), "utf8");
    const callSites = source.match(/^\s*useJournalSync\(\);$/gm) ?? [];
    expect(callSites).toHaveLength(1);
    expect(source).toContain('import { useJournalSync } from "./hooks/useJournalSync"');
  });
});
