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
  it("stores a new subscription and returns success", () => {
    const { success, endpointHash } = upsertSubscription(makeRequest());
    expect(success).toBe(true);
    expect(endpointHash).toHaveLength(64); // SHA-256 hex
  });

  it("persists subscription data retrievable via getAllSubscriptions", () => {
    const req = makeRequest();
    upsertSubscription(req);

    const subs = getAllSubscriptions();
    expect(subs).toHaveLength(1);
    expect(subs[0]?.endpoint).toBe(req.subscription.endpoint);
    expect(subs[0]?.p256dh).toBe(req.subscription.keys.p256dh);
    expect(subs[0]?.auth).toBe(req.subscription.keys.auth);
  });

  it("stores favorites as JSON", () => {
    upsertSubscription(makeRequest());
    const subs = getAllSubscriptions();
    const favorites = JSON.parse(subs[0]?.favorites ?? "[]") as PushFavoriteTuple[];
    expect(favorites[0]?.stationId).toBe("127");
    expect(favorites[0]?.lines).toEqual(["1", "2", "3"]);
  });

  it("stores quietHours as JSON", () => {
    upsertSubscription(makeRequest());
    const subs = getAllSubscriptions();
    const qh = JSON.parse(subs[0]?.quietHours ?? "{}") as {
      enabled: boolean;
      startHour: number;
      endHour: number;
    };
    expect(qh.enabled).toBe(false);
    expect(qh.startHour).toBe(0);
    expect(qh.endHour).toBe(5);
  });

  it("updates an existing subscription when endpoint is the same", () => {
    const endpoint = "https://push.example.com/sub/same";
    upsertSubscription(
      makeRequest(endpoint, {
        favorites: [{ id: "fav1", stationId: "127", lines: ["1"], direction: "N" }],
      })
    );
    upsertSubscription(
      makeRequest(endpoint, {
        favorites: [{ id: "fav2", stationId: "999", lines: ["A"], direction: "S" }],
      })
    );

    expect(getSubscriptionCount()).toBe(1); // still one record

    const subs = getAllSubscriptions();
    const favorites = JSON.parse(subs[0]?.favorites ?? "[]") as PushFavoriteTuple[];
    expect(favorites[0]?.stationId).toBe("999"); // updated value
  });

  it("stores different endpoints as separate records", () => {
    upsertSubscription(makeRequest("https://push.example.com/sub/A"));
    upsertSubscription(makeRequest("https://push.example.com/sub/B"));
    expect(getSubscriptionCount()).toBe(2);
  });

  it("uses default quietHours when none provided in request", () => {
    upsertSubscription(
      makeRequest("https://push.example.com/sub/no-qh", { quietHours: undefined })
    );
    const subs = getAllSubscriptions();
    const qh = JSON.parse(subs[0]?.quietHours ?? "{}") as { enabled: boolean };
    expect(qh.enabled).toBe(false); // default quiet hours
  });
});

// ---------------------------------------------------------------------------
// getSubscriptionCount
// ---------------------------------------------------------------------------

describe("getSubscriptionCount", () => {
  it("returns 0 on an empty database", () => {
    expect(getSubscriptionCount()).toBe(0);
  });

  it("increments after upsert", () => {
    upsertSubscription(makeRequest("https://push.example.com/a"));
    expect(getSubscriptionCount()).toBe(1);
    upsertSubscription(makeRequest("https://push.example.com/b"));
    expect(getSubscriptionCount()).toBe(2);
  });

  it("does not increment on duplicate endpoint upsert", () => {
    upsertSubscription(makeRequest());
    upsertSubscription(makeRequest());
    expect(getSubscriptionCount()).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// removeSubscription
// ---------------------------------------------------------------------------

describe("removeSubscription", () => {
  it("removes an existing subscription and returns true", () => {
    const req = makeRequest();
    upsertSubscription(req);
    expect(getSubscriptionCount()).toBe(1);

    const removed = removeSubscription(req.subscription.endpoint);
    expect(removed).toBe(true);
    expect(getSubscriptionCount()).toBe(0);
  });

  it("returns false when the endpoint does not exist", () => {
    const removed = removeSubscription("https://push.example.com/nonexistent");
    expect(removed).toBe(false);
  });

  it("only removes the targeted subscription", () => {
    upsertSubscription(makeRequest("https://push.example.com/a"));
    upsertSubscription(makeRequest("https://push.example.com/b"));
    removeSubscription("https://push.example.com/a");
    expect(getSubscriptionCount()).toBe(1);
    expect(getAllSubscriptions()[0]?.endpoint).toBe("https://push.example.com/b");
  });
});

// ---------------------------------------------------------------------------
// updateSubscriptionFavorites
// ---------------------------------------------------------------------------

describe("updateSubscriptionFavorites", () => {
  it("updates favorites for an existing subscription", () => {
    const req = makeRequest();
    upsertSubscription(req);

    const newFavorites: PushFavoriteTuple[] = [
      { id: "fav1", stationId: "999", lines: ["7"], direction: "S" },
    ];
    // Use the default owner ID (anonymous) for ownership validation
    const updated = updateSubscriptionFavorites(
      req.subscription.endpoint,
      newFavorites,
      "anonymous"
    );
    expect(updated).toBe(true);

    const subs = getAllSubscriptions();
    const parsed = JSON.parse(subs[0]?.favorites ?? "[]") as PushFavoriteTuple[];
    expect(parsed[0]?.stationId).toBe("999");
    expect(parsed[0]?.lines).toEqual(["7"]);
  });

  it("returns false when subscription does not exist", () => {
    const updated = updateSubscriptionFavorites("https://unknown.example.com/sub", [], "anonymous");
    expect(updated).toBe(false);
  });

  it("returns false when owner ID does not match", () => {
    const req = makeRequest();
    upsertSubscription(req);

    const newFavorites: PushFavoriteTuple[] = [
      { id: "fav1", stationId: "999", lines: ["7"], direction: "S" },
    ];
    // Use different owner ID - should fail
    const updated = updateSubscriptionFavorites(
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
  it("updates quiet hours for an existing subscription", () => {
    upsertSubscription(makeRequest());

    const updated = updateSubscriptionQuietHours(
      "https://push.example.com/sub/test-endpoint",
      {
        enabled: true,
        startHour: 22,
        endHour: 7,
      },
      "anonymous"
    );
    expect(updated).toBe(true);

    const subs = getAllSubscriptions();
    const qh = JSON.parse(subs[0]?.quietHours ?? "{}") as {
      enabled: boolean;
      startHour: number;
      endHour: number;
    };
    expect(qh.enabled).toBe(true);
    expect(qh.startHour).toBe(22);
    expect(qh.endHour).toBe(7);
  });

  it("returns false when subscription does not exist", () => {
    const updated = updateSubscriptionQuietHours(
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

  it("returns false when owner ID does not match", () => {
    upsertSubscription(makeRequest());

    const updated = updateSubscriptionQuietHours(
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
  it("does not purge fresh subscriptions", () => {
    upsertSubscription(makeRequest("https://push.example.com/fresh"));
    const purged = purgeStaleSubscriptions(60); // 60 days max age
    expect(purged).toBe(0);
    expect(getSubscriptionCount()).toBe(1);
  });

  it("returns a number", () => {
    expect(typeof purgeStaleSubscriptions(30)).toBe("number");
  });
});
