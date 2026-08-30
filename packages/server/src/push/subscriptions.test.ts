/**
 * Tests for push subscription SQLite storage.
 *
 * All tests use an in-memory database (:memory:) so they are isolated
 * and leave no files on disk.
 */

import type { PushFavoriteTuple, PushSubscribeRequest } from "@mta-my-way/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  closePushDatabase,
  getAllSubscriptions,
  getSubscriptionCount,
  initPushDatabase,
  purgeStaleSubscriptions,
  removeSubscription,
  updateSubscriptionFavorites,
  updateSubscriptionQuietHours,
  upsertSubscription,
} from "./subscriptions.js";

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

function makeRequest(
  endpoint = "https://push.example.com/sub/test-endpoint",
  overrides: Partial<PushSubscribeRequest> = {}
): PushSubscribeRequest {
  return {
    subscription: {
      endpoint,
      keys: {
        p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtZ34Tuqe",
        auth: "tBHItJI5svbpez7KI4CCXg==",
      },
    },
    favorites: [{ id: "fav1", stationId: "127", lines: ["1", "2", "3"], direction: "N" }],
    quietHours: { enabled: false, startHour: 0, endHour: 5 },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

// The subscription store initializes lazily, so CRUD helpers are asynchronous.
// Awaiting each call keeps afterEach from closing the database while an
// operation is still pending, which previously caused rejected promises to
// leak into the following test.

beforeEach(() => {
  initPushDatabase(":memory:");
});

afterEach(() => {
  closePushDatabase();
});

// ---------------------------------------------------------------------------
// upsertSubscription
// ---------------------------------------------------------------------------

describe("upsertSubscription", () => {
  it("stores a new subscription and returns success", async () => {
    const { success, endpointHash } = await upsertSubscription(makeRequest());
    expect(success).toBe(true);
    expect(endpointHash).toHaveLength(64); // SHA-256 hex
  });

  it("persists subscription data retrievable via getAllSubscriptions", async () => {
    const req = makeRequest();
    await upsertSubscription(req);

    const subs = await getAllSubscriptions();
    expect(subs).toHaveLength(1);
    expect(subs[0]?.endpoint).toBe(req.subscription.endpoint);
    expect(subs[0]?.p256dh).toBe(req.subscription.keys.p256dh);
    expect(subs[0]?.auth).toBe(req.subscription.keys.auth);
  });

  it("stores favorites as JSON", async () => {
    await upsertSubscription(makeRequest());
    const subs = await getAllSubscriptions();
    const favorites = JSON.parse(subs[0]?.favorites ?? "[]") as PushFavoriteTuple[];
    expect(favorites[0]?.stationId).toBe("127");
    expect(favorites[0]?.lines).toEqual(["1", "2", "3"]);
  });

  it("stores quietHours as JSON", async () => {
    await upsertSubscription(makeRequest());
    const subs = await getAllSubscriptions();
    const qh = JSON.parse(subs[0]?.quietHours ?? "{}") as {
      enabled: boolean;
      startHour: number;
      endHour: number;
    };
    expect(qh.enabled).toBe(false);
    expect(qh.startHour).toBe(0);
    expect(qh.endHour).toBe(5);
  });

  it("updates an existing subscription when endpoint is the same", async () => {
    const endpoint = "https://push.example.com/sub/same";
    await upsertSubscription(
      makeRequest(endpoint, {
        favorites: [{ id: "fav1", stationId: "127", lines: ["1"], direction: "N" }],
      })
    );
    await upsertSubscription(
      makeRequest(endpoint, {
        favorites: [{ id: "fav2", stationId: "999", lines: ["A"], direction: "S" }],
      })
    );

    expect(await getSubscriptionCount()).toBe(1); // still one record

    const subs = await getAllSubscriptions();
    const favorites = JSON.parse(subs[0]?.favorites ?? "[]") as PushFavoriteTuple[];
    expect(favorites[0]?.stationId).toBe("999"); // updated value
  });

  it("stores different endpoints as separate records", async () => {
    await upsertSubscription(makeRequest("https://push.example.com/sub/A"));
    await upsertSubscription(makeRequest("https://push.example.com/sub/B"));
    expect(await getSubscriptionCount()).toBe(2);
  });

  it("uses default quietHours when none provided in request", async () => {
    await upsertSubscription(
      makeRequest("https://push.example.com/sub/no-qh", { quietHours: undefined })
    );
    const subs = await getAllSubscriptions();
    const qh = JSON.parse(subs[0]?.quietHours ?? "{}") as { enabled: boolean };
    expect(qh.enabled).toBe(false); // default quiet hours
  });
});

// ---------------------------------------------------------------------------
// getSubscriptionCount
// ---------------------------------------------------------------------------

describe("getSubscriptionCount", () => {
  it("returns 0 on an empty database", async () => {
    expect(await getSubscriptionCount()).toBe(0);
  });

  it("increments after upsert", async () => {
    await upsertSubscription(makeRequest("https://push.example.com/a"));
    expect(await getSubscriptionCount()).toBe(1);
    await upsertSubscription(makeRequest("https://push.example.com/b"));
    expect(await getSubscriptionCount()).toBe(2);
  });

  it("does not increment on duplicate endpoint upsert", async () => {
    await upsertSubscription(makeRequest());
    await upsertSubscription(makeRequest());
    expect(await getSubscriptionCount()).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// removeSubscription
// ---------------------------------------------------------------------------

describe("removeSubscription", () => {
  it("removes an existing subscription and returns true", async () => {
    const req = makeRequest();
    await upsertSubscription(req);
    expect(await getSubscriptionCount()).toBe(1);

    const removed = await removeSubscription(req.subscription.endpoint);
    expect(removed).toBe(true);
    expect(await getSubscriptionCount()).toBe(0);
  });

  it("returns false when the endpoint does not exist", async () => {
    const removed = await removeSubscription("https://push.example.com/nonexistent");
    expect(removed).toBe(false);
  });

  it("only removes the targeted subscription", async () => {
    await upsertSubscription(makeRequest("https://push.example.com/a"));
    await upsertSubscription(makeRequest("https://push.example.com/b"));
    await removeSubscription("https://push.example.com/a");
    expect(await getSubscriptionCount()).toBe(1);
    expect((await getAllSubscriptions())[0]?.endpoint).toBe("https://push.example.com/b");
  });
});

// ---------------------------------------------------------------------------
// updateSubscriptionFavorites
// ---------------------------------------------------------------------------

describe("updateSubscriptionFavorites", () => {
  it("updates favorites for an existing subscription", async () => {
    const req = makeRequest();
    await upsertSubscription(req);

    const newFavorites: PushFavoriteTuple[] = [
      { id: "fav1", stationId: "999", lines: ["7"], direction: "S" },
    ];
    // Use the default owner ID (anonymous) for ownership validation
    const updated = await updateSubscriptionFavorites(
      req.subscription.endpoint,
      newFavorites,
      "anonymous"
    );
    expect(updated).toBe(true);

    const subs = await getAllSubscriptions();
    const parsed = JSON.parse(subs[0]?.favorites ?? "[]") as PushFavoriteTuple[];
    expect(parsed[0]?.stationId).toBe("999");
    expect(parsed[0]?.lines).toEqual(["7"]);
  });

  it("returns false when subscription does not exist", async () => {
    const updated = await updateSubscriptionFavorites(
      "https://unknown.example.com/sub",
      [],
      "anonymous"
    );
    expect(updated).toBe(false);
  });

  it("returns false when owner ID does not match", async () => {
    const req = makeRequest();
    await upsertSubscription(req);

    const newFavorites: PushFavoriteTuple[] = [
      { id: "fav1", stationId: "999", lines: ["7"], direction: "S" },
    ];
    // Use different owner ID - should fail
    const updated = await updateSubscriptionFavorites(
      req.subscription.endpoint,
      newFavorites,
      "different-owner"
    );
    expect(updated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// updateSubscriptionQuietHours
// ---------------------------------------------------------------------------

describe("updateSubscriptionQuietHours", () => {
  it("updates quiet hours for an existing subscription", async () => {
    await upsertSubscription(makeRequest());

    const updated = await updateSubscriptionQuietHours(
      "https://push.example.com/sub/test-endpoint",
      {
        enabled: true,
        startHour: 22,
        endHour: 7,
      },
      "anonymous"
    );
    expect(updated).toBe(true);

    const subs = await getAllSubscriptions();
    const qh = JSON.parse(subs[0]?.quietHours ?? "{}") as {
      enabled: boolean;
      startHour: number;
      endHour: number;
    };
    expect(qh.enabled).toBe(true);
    expect(qh.startHour).toBe(22);
    expect(qh.endHour).toBe(7);
  });

  it("returns false when subscription does not exist", async () => {
    const updated = await updateSubscriptionQuietHours(
      "https://unknown.example.com/sub",
      {
        enabled: true,
        startHour: 0,
        endHour: 5,
      },
      "anonymous"
    );
    expect(updated).toBe(false);
  });

  it("returns false when owner ID does not match", async () => {
    await upsertSubscription(makeRequest());

    const updated = await updateSubscriptionQuietHours(
      "https://push.example.com/sub/test-endpoint",
      {
        enabled: true,
        startHour: 22,
        endHour: 7,
      },
      "different-owner"
    );
    expect(updated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// purgeStaleSubscriptions
// ---------------------------------------------------------------------------

describe("purgeStaleSubscriptions", () => {
  it("does not purge fresh subscriptions", async () => {
    await upsertSubscription(makeRequest("https://push.example.com/fresh"));
    const purged = await purgeStaleSubscriptions(60); // 60 days max age
    expect(purged).toBe(0);
    expect(await getSubscriptionCount()).toBe(1);
  });

  it("returns a number", async () => {
    expect(typeof (await purgeStaleSubscriptions(30))).toBe("number");
  });
});
