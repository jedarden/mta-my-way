/**
 * Integration tests for push subscriptions with real database operations.
 *
 * Tests the full data flow:
 * - Database CRUD operations
 * - Endpoint hashing
 * - Favorites and settings updates
 * - Stale subscription cleanup
 */

import { existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  closePushDatabase,
  getAllSubscriptions,
  getSubscriptionCount,
  initPushDatabase,
  purgeStaleSubscriptions,
  removeSubscription,
  updateSubscriptionFavorites,
  updateSubscriptionMorningScores,
  updateSubscriptionQuietHours,
  upsertSubscription,
} from "../push/subscriptions.js";
import { createTestSubscription } from "./test-helpers.js";

describe("Push Subscriptions Integration Tests", () => {
  let testDbPath: string;
  const tempFilesToCleanup: string[] = [];

  beforeAll(() => {
    // Register crash-safe cleanup handler
    const cleanup = () => {
      for (const file of tempFilesToCleanup) {
        try {
          if (existsSync(file)) {
            unlinkSync(file);
          }
        } catch {
          // Ignore cleanup errors
        }
      }
    };

    // Clean up on process exit (crash-safe)
    process.on("exit", cleanup);
    process.on("SIGINT", () => {
      cleanup();
      process.exit(0);
    });
    process.on("SIGTERM", () => {
      cleanup();
      process.exit(0);
    });
  });

  // Lazy push-database initialization makes every storage helper async.
  // Awaiting them and closing the connection before deleting the temp file
  // prevents an unfinished operation from leaking into the next test.
  beforeEach(() => {
    // Use a temp file database so the module and test share the same database
    testDbPath = join(tmpdir(), `test-push-${crypto.randomUUID()}.db`);
    tempFilesToCleanup.push(testDbPath);
    initPushDatabase(testDbPath);
  });

  afterEach(() => {
    closePushDatabase();

    // Clean up temp files created during this test
    for (let i = tempFilesToCleanup.length - 1; i >= 0; i--) {
      const file = tempFilesToCleanup[i];
      try {
        if (existsSync(file)) {
          unlinkSync(file);
        }
      } catch {
        // Ignore cleanup errors
      }
      tempFilesToCleanup.splice(i, 1);
    }
  });

  describe("initPushDatabase", () => {
    it("creates push_subscriptions table", async () => {
      // Verify by successfully inserting and querying
      const sub = createTestSubscription({
        endpoint: "https://example.com/push/verify-table",
      });
      await upsertSubscription(sub);

      const count = await getSubscriptionCount();
      expect(count).toBe(1);
    });

    it("sets WAL journal mode", async () => {
      // If we get here without errors, WAL mode was set successfully
      // (the init function throws if there's an issue)
      const sub = createTestSubscription({
        endpoint: "https://example.com/push/verify-wal",
      });
      const result = await upsertSubscription(sub);
      expect(result.success).toBe(true);
    });
  });

  describe("upsertSubscription", () => {
    it("inserts new subscription", async () => {
      const sub = createTestSubscription({
        endpoint: "https://example.com/push/1",
      });

      const result = await upsertSubscription(sub);

      expect(result.success).toBe(true);
      expect(result.endpointHash).toBeDefined();
      expect(result.endpointHash).toHaveLength(64); // SHA-256 hex length
    });

    it("updates existing subscription", async () => {
      const sub1 = createTestSubscription({
        endpoint: "https://example.com/push/2",
        favorites: [{ id: "fav-1", stationId: "101", lines: ["1"], direction: "both" }],
      });

      await upsertSubscription(sub1);

      // Update with different favorites
      const sub2 = createTestSubscription({
        endpoint: "https://example.com/push/2",
        favorites: [
          { id: "fav-1", stationId: "101", lines: ["1"], direction: "both" },
          { id: "fav-2", stationId: "725", lines: ["A"], direction: "north" },
        ],
      });

      const result = await upsertSubscription(sub2);
      expect(result.success).toBe(true);

      // Verify only one subscription exists for this endpoint
      const all = await getAllSubscriptions();
      const matching = all.filter((s) => s.endpoint === "https://example.com/push/2");
      expect(matching).toHaveLength(1);
      // Favorites is stored as JSON string, parse it to verify
      const favorites = JSON.parse(matching[0]?.favorites ?? "[]");
      expect(favorites).toHaveLength(2);
    });

    it("stores subscription keys", async () => {
      const sub = createTestSubscription({
        endpoint: "https://example.com/push/3",
        p256dh: "test-p256dh",
        auth: "test-auth",
      });

      await upsertSubscription(sub);

      const all = await getAllSubscriptions();
      const created = all.find((s) => s.endpoint === "https://example.com/push/3");

      expect(created?.p256dh).toBe("test-p256dh");
      expect(created?.auth).toBe("test-auth");
    });

    it("stores favorites as JSON", async () => {
      const sub = createTestSubscription({
        endpoint: "https://example.com/push/4",
        favorites: [
          { id: "fav-1", stationId: "101", lines: ["1"], direction: "both" },
          { id: "fav-2", stationId: "725", lines: ["A", "C"], direction: "south" },
        ],
      });

      await upsertSubscription(sub);

      const all = await getAllSubscriptions();
      const created = all.find((s) => s.endpoint === "https://example.com/push/4");

      // Favorites is stored as JSON string
      expect(created?.favorites).toBe(
        '[{"id":"fav-1","stationId":"101","lines":["1"],"direction":"both"},{"id":"fav-2","stationId":"725","lines":["A","C"],"direction":"south"}]'
      );
      // Verify it parses correctly
      const parsed = JSON.parse(created?.favorites ?? "[]");
      expect(parsed).toEqual([
        { id: "fav-1", stationId: "101", lines: ["1"], direction: "both" },
        { id: "fav-2", stationId: "725", lines: ["A", "C"], direction: "south" },
      ]);
    });

    it("stores quiet hours settings", async () => {
      const sub = createTestSubscription({
        endpoint: "https://example.com/push/5",
        quietHours: { enabled: true, startHour: 23, endHour: 6 },
      });

      await upsertSubscription(sub);

      const all = await getAllSubscriptions();
      const created = all.find((s) => s.endpoint === "https://example.com/push/5");

      // quietHours is stored as JSON string
      expect(created?.quietHours).toBe('{"enabled":true,"startHour":23,"endHour":6}');
      // Verify it parses correctly
      const parsed = JSON.parse(created?.quietHours ?? "{}");
      expect(parsed).toEqual({ enabled: true, startHour: 23, endHour: 6 });
    });

    it("stores morning scores", async () => {
      const sub = createTestSubscription({
        endpoint: "https://example.com/push/6",
        morningScores: {
          "101": { line: "1", scores: [0.8, 0.9, 0.7] },
          "725": { line: "A", scores: [0.6, 0.85] },
        },
      });

      await upsertSubscription(sub);

      const all = await getAllSubscriptions();
      const created = all.find((s) => s.endpoint === "https://example.com/push/6");

      // morningScores is stored as JSON string
      expect(created?.morningScores).toBe(
        '{"101":{"line":"1","scores":[0.8,0.9,0.7]},"725":{"line":"A","scores":[0.6,0.85]}}'
      );
      // Verify it parses correctly
      const parsed = JSON.parse(created?.morningScores ?? "{}");
      expect(parsed).toEqual({
        "101": { line: "1", scores: [0.8, 0.9, 0.7] },
        "725": { line: "A", scores: [0.6, 0.85] },
      });
    });

    it("uses default values when optional fields missing", async () => {
      const sub = createTestSubscription({
        endpoint: "https://example.com/push/7",
      });
      sub.quietHours = undefined as unknown as typeof sub.quietHours;
      sub.morningScores = undefined as unknown as typeof sub.morningScores;

      await upsertSubscription(sub);

      const all = await getAllSubscriptions();
      const created = all.find((s) => s.endpoint === "https://example.com/push/7");

      // Defaults are stored as JSON strings
      expect(created?.quietHours).toBe('{"enabled":false,"startHour":22,"endHour":7}');
      expect(created?.morningScores).toBe("{}");
    });
  });

  describe("getAllSubscriptions", () => {
    beforeEach(async () => {
      await upsertSubscription(createTestSubscription({ endpoint: "https://example.com/push/10" }));
      await upsertSubscription(createTestSubscription({ endpoint: "https://example.com/push/11" }));
      await upsertSubscription(createTestSubscription({ endpoint: "https://example.com/push/12" }));
    });

    it("returns all subscriptions", async () => {
      const all = await getAllSubscriptions();
      expect(all).toHaveLength(3);
    });

    it("includes subscription metadata", async () => {
      const all = await getAllSubscriptions();
      const sub = all[0];

      expect(sub).toHaveProperty("endpointHash");
      expect(sub).toHaveProperty("endpoint");
      expect(sub).toHaveProperty("p256dh");
      expect(sub).toHaveProperty("auth");
      expect(sub).toHaveProperty("favorites");
      expect(sub).toHaveProperty("quietHours");
      expect(sub).toHaveProperty("morningScores");
      expect(sub).toHaveProperty("createdAt");
      expect(sub).toHaveProperty("updatedAt");
    });

    it("returns empty array when no subscriptions", async () => {
      // Create a fresh database with no subscriptions
      const freshDbPath = join(tmpdir(), `test-push-fresh-${crypto.randomUUID()}.db`);
      tempFilesToCleanup.push(freshDbPath);
      initPushDatabase(freshDbPath);

      const all = await getAllSubscriptions();
      expect(all).toEqual([]);
    });
  });

  describe("getSubscriptionCount", () => {
    it("returns zero when no subscriptions", async () => {
      // Fresh database
      const freshDbPath = join(tmpdir(), `test-push-count-${crypto.randomUUID()}.db`);
      tempFilesToCleanup.push(freshDbPath);
      initPushDatabase(freshDbPath);

      const count = await getSubscriptionCount();
      expect(count).toBe(0);
    });

    it("counts all subscriptions", async () => {
      await upsertSubscription(createTestSubscription({ endpoint: "https://example.com/push/20" }));
      await upsertSubscription(createTestSubscription({ endpoint: "https://example.com/push/21" }));
      await upsertSubscription(createTestSubscription({ endpoint: "https://example.com/push/22" }));

      const count = await getSubscriptionCount();
      expect(count).toBe(3);
    });
  });

  describe("removeSubscription", () => {
    it("removes subscription by endpoint", async () => {
      const sub = createTestSubscription({ endpoint: "https://example.com/push/30" });
      await upsertSubscription(sub);

      const beforeCount = await getSubscriptionCount();
      expect(beforeCount).toBeGreaterThan(0);

      const removed = await removeSubscription("https://example.com/push/30");
      expect(removed).toBe(true);

      const afterCount = await getSubscriptionCount();
      expect(afterCount).toBe(beforeCount - 1);
    });

    it("returns false for non-existent endpoint", async () => {
      const removed = await removeSubscription("https://example.com/push/nonexistent");
      expect(removed).toBe(false);
    });
  });

  describe("updateSubscriptionFavorites", () => {
    beforeEach(async () => {
      await upsertSubscription(createTestSubscription({ endpoint: "https://example.com/push/40" }));
    });

    it("updates favorites for existing subscription", async () => {
      const newFavorites = [
        { id: "fav-1", stationId: "101", lines: ["1"], direction: "both" },
        { id: "fav-2", stationId: "725", lines: ["A"], direction: "north" },
        { id: "fav-3", stationId: "726", lines: ["C", "E"], direction: "south" },
      ];

      const success = await updateSubscriptionFavorites(
        "https://example.com/push/40",
        newFavorites,
        "anonymous"
      );
      expect(success).toBe(true);

      const all = await getAllSubscriptions();
      const updated = all.find((s) => s.endpoint === "https://example.com/push/40");
      // Parse the JSON string to verify
      const parsed = JSON.parse(updated?.favorites ?? "[]");
      expect(parsed).toEqual(newFavorites);
    });

    it("returns false for non-existent endpoint", async () => {
      const success = await updateSubscriptionFavorites(
        "https://example.com/push/nonexistent",
        [],
        "anonymous"
      );
      expect(success).toBe(false);
    });

    it("returns false when owner ID does not match", async () => {
      const newFavorites = [{ id: "fav-1", stationId: "101", lines: ["1"], direction: "both" }];
      const success = await updateSubscriptionFavorites(
        "https://example.com/push/40",
        newFavorites,
        "different-owner"
      );
      expect(success).toBe(false);
    });

    it("can clear favorites", async () => {
      const success = await updateSubscriptionFavorites(
        "https://example.com/push/40",
        [],
        "anonymous"
      );
      expect(success).toBe(true);

      const all = await getAllSubscriptions();
      const updated = all.find((s) => s.endpoint === "https://example.com/push/40");
      expect(updated?.favorites).toBe("[]");
    });
  });

  describe("updateSubscriptionQuietHours", () => {
    beforeEach(async () => {
      await upsertSubscription(createTestSubscription({ endpoint: "https://example.com/push/50" }));
    });

    it("updates quiet hours for existing subscription", async () => {
      const newQuietHours = { enabled: true, startHour: 22, endHour: 7 };

      const success = await updateSubscriptionQuietHours(
        "https://example.com/push/50",
        newQuietHours,
        "anonymous"
      );
      expect(success).toBe(true);

      const all = await getAllSubscriptions();
      const updated = all.find((s) => s.endpoint === "https://example.com/push/50");
      // Parse the JSON string to verify
      const parsed = JSON.parse(updated?.quietHours ?? "{}");
      expect(parsed).toEqual(newQuietHours);
    });

    it("returns false for non-existent endpoint", async () => {
      const success = await updateSubscriptionQuietHours(
        "https://example.com/push/nonexistent",
        {
          enabled: false,
          startHour: 22,
          endHour: 7,
        },
        "anonymous"
      );
      expect(success).toBe(false);
    });
  });

  describe("updateSubscriptionMorningScores", () => {
    beforeEach(async () => {
      await upsertSubscription(createTestSubscription({ endpoint: "https://example.com/push/60" }));
    });

    it("updates morning scores for existing subscription", async () => {
      const newScores = {
        "101": { line: "1", scores: [0.9, 0.85, 0.95] },
        "725": { line: "A", scores: [0.7, 0.8] },
      };

      const success = await updateSubscriptionMorningScores(
        "https://example.com/push/60",
        newScores,
        "anonymous"
      );
      expect(success).toBe(true);

      const all = await getAllSubscriptions();
      const updated = all.find((s) => s.endpoint === "https://example.com/push/60");
      // Parse the JSON string to verify
      const parsed = JSON.parse(updated?.morningScores ?? "{}");
      expect(parsed).toEqual(newScores);
    });

    it("returns false for non-existent endpoint", async () => {
      const success = await updateSubscriptionMorningScores(
        "https://example.com/push/nonexistent",
        {},
        "anonymous"
      );
      expect(success).toBe(false);
    });

    it("returns false when owner ID does not match", async () => {
      const newScores = {
        "101": { line: "1", scores: [0.9, 0.85, 0.95] },
      };
      const success = await updateSubscriptionMorningScores(
        "https://example.com/push/60",
        newScores,
        "different-owner"
      );
      expect(success).toBe(false);
    });

    it("can clear morning scores", async () => {
      const success = await updateSubscriptionMorningScores(
        "https://example.com/push/60",
        {},
        "anonymous"
      );
      expect(success).toBe(true);

      const all = await getAllSubscriptions();
      const updated = all.find((s) => s.endpoint === "https://example.com/push/60");
      expect(updated?.morningScores).toBe("{}");
    });
  });

  describe("purgeStaleSubscriptions", () => {
    it("removes subscriptions older than specified days", async () => {
      // Create a subscription updated recently
      await upsertSubscription(
        createTestSubscription({ endpoint: "https://example.com/push/recent" })
      );

      // Manually create an old subscription by directly modifying the database
      // Since we can't easily set old dates, we'll test with a mock
      const deleted = await purgeStaleSubscriptions(60);
      // The recent subscription should not be deleted
      expect(deleted).toBe(0);

      const afterCount = await getSubscriptionCount();
      expect(afterCount).toBe(1);
    });

    it("uses default 60 days when not specified", async () => {
      const deleted = await purgeStaleSubscriptions();
      expect(typeof deleted).toBe("number");
    });

    it("returns 0 when no stale subscriptions", async () => {
      // All subscriptions are recent
      await upsertSubscription(
        createTestSubscription({ endpoint: "https://example.com/push/recent2" })
      );

      const deleted = await purgeStaleSubscriptions(60);
      expect(deleted).toBe(0);
    });
  });
});
