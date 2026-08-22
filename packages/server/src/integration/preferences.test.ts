/** Integration tests for authenticated preference sync. */

import type { ComplexIndex, RouteIndex, TransferConnection } from "@mta-my-way/shared";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { createSession } from "../middleware/authentication.js";
import { closePushDatabase, getPushDatabase, initPushDatabase } from "../push/subscriptions.js";
import { TEST_STATIONS, createTestUserCredentials, getCsrfToken } from "./test-helpers.js";

const TEST_ROUTES: RouteIndex = {
  "1": {
    id: "1",
    shortName: "1",
    longName: "Broadway-7th Ave Local",
    color: "#EE352E",
    textColor: "#FFFFFF",
    feedId: "gtfs",
    division: "A",
    stops: ["101", "102"],
    isExpress: false,
  },
};

const TEST_COMPLEXES: ComplexIndex = {};
const TEST_TRANSFERS: Record<string, TransferConnection[]> = {};

describe("Preferences API integration", () => {
  let app: ReturnType<typeof createApp>;
  let sessionHeaders: Record<string, string>;
  let userId: string;

  beforeEach(async () => {
    initPushDatabase(":memory:");

    const credentials = await createTestUserCredentials();
    userId = credentials.keyId;
    const session = await createSession(userId, "127.0.0.1", undefined, undefined, {
      ipBinding: false,
      createRefreshToken: false,
    });
    sessionHeaders = { "X-Session-Token": session.sessionId };

    app = createApp(
      TEST_STATIONS,
      TEST_ROUTES,
      TEST_COMPLEXES,
      TEST_TRANSFERS,
      "/nonexistent/dist"
    );
  });

  afterAll(() => {
    closePushDatabase();
  });

  async function putPreferences(body: unknown): Promise<Response> {
    const csrfToken = await getCsrfToken(app);
    return app.request("/api/preferences", {
      method: "PUT",
      headers: {
        ...sessionHeaders,
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken,
      },
      body: JSON.stringify(body),
    });
  }

  it("returns 401 for unauthenticated requests", async () => {
    const getResponse = await app.request("/api/preferences");
    expect(getResponse.status).toBe(401);

    const csrfToken = await getCsrfToken(app);
    const putResponse = await app.request("/api/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
      body: JSON.stringify({ favorites: [], commutes: [] }),
    });
    expect(putResponse.status).toBe(401);
  });

  it("returns the complete default snapshot for a new authenticated user", async () => {
    const response = await app.request("/api/preferences", { headers: sessionHeaders });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      favorites: [],
      commutes: [],
      settings: {
        theme: "system",
        showUnassignedTrips: false,
        refreshInterval: 30,
        alertSeverityFilter: "delays",
        hapticFeedback: true,
        accessibleMode: false,
        quietHours: { enabled: false, startHour: 22, endHour: 7 },
      },
      pushSubscription: null,
      schemaVersion: 1,
      tapHistory: [],
      onboardingComplete: false,
    });
  });

  it("stores a full preference snapshot in SQLite and returns it on a later GET", async () => {
    const payload = {
      favorites: [
        {
          id: "favorite-1",
          stationId: "101",
          stationName: "South Ferry",
          lines: ["1"],
          direction: "N",
          sortOrder: 0,
          pinned: true,
        },
      ],
      commutes: [
        {
          id: "commute-1",
          name: "Work",
          origin: { stationId: "101", stationName: "South Ferry" },
          destination: { stationId: "102", stationName: "Rector St" },
          preferredLines: ["1"],
          enableTransferSuggestions: true,
          isPinned: true,
        },
      ],
      settings: { theme: "dark", refreshInterval: 60 },
      schemaVersion: 1,
      tapHistory: [{ favoriteId: "favorite-1", dayOfWeek: 1, hour: 8 }],
      onboardingComplete: true,
    };

    const putResponse = await putPreferences(payload);
    expect(putResponse.status).toBe(200);
    expect((await putResponse.json()).favorites).toEqual(payload.favorites);

    const stored = getPushDatabase()
      .prepare("SELECT preferences_json FROM user_preferences WHERE user_id = ?")
      .get(userId) as { preferences_json: string } | undefined;
    expect(stored).toBeDefined();

    const getResponse = await app.request("/api/preferences", { headers: sessionHeaders });
    expect(getResponse.status).toBe(200);
    const preferences = await getResponse.json();
    expect(preferences).toMatchObject({
      ...payload,
      settings: {
        ...payload.settings,
        showUnassignedTrips: false,
        alertSeverityFilter: "delays",
        hapticFeedback: true,
        accessibleMode: false,
        quietHours: { enabled: false, startHour: 22, endHour: 7 },
      },
      pushSubscription: null,
    });
  });

  it("uses replacement semantics so deleted items stay deleted", async () => {
    await putPreferences({
      favorites: [{ id: "favorite-1" }],
      commutes: [{ id: "commute-1" }],
    });

    const replacementResponse = await putPreferences({ favorites: [], commutes: [] });
    expect(replacementResponse.status).toBe(200);

    const getResponse = await app.request("/api/preferences", { headers: sessionHeaders });
    expect(await getResponse.json()).toMatchObject({ favorites: [], commutes: [] });
  });

  it("rejects malformed preference payloads", async () => {
    const response = await putPreferences({ favorites: {}, commutes: "not an array" });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "favorites and commutes must both be arrays" });
  });
});
