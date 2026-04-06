/**
 * Unit tests for push notification validation schemas
 */

import { describe, expect, it } from "vitest";
import {
  pushFavoriteTupleSchema,
  pushSubscribeRequestSchema,
  pushUnsubscribeRequestSchema,
  pushUpdateRequestSchema,
} from "./push.js";

describe("push schemas", () => {
  describe("pushFavoriteTupleSchema", () => {
    const validFavorite = {
      id: "fav-123",
      stationId: "station-456",
      lines: ["1", "2", "3"],
      direction: "N" as const,
    };

    it("accepts valid favorite tuple", () => {
      const result = pushFavoriteTupleSchema.safeParse(validFavorite);
      expect(result.success).toBe(true);
    });

    it("accepts both direction", () => {
      const favorite = { ...validFavorite, direction: "both" as const };
      const result = pushFavoriteTupleSchema.safeParse(favorite);
      expect(result.success).toBe(true);
    });

    it("accepts South direction", () => {
      const favorite = { ...validFavorite, direction: "S" as const };
      const result = pushFavoriteTupleSchema.safeParse(favorite);
      expect(result.success).toBe(true);
    });

    it("rejects invalid direction", () => {
      const invalidFavorite = { ...validFavorite, direction: "E" };
      const result = pushFavoriteTupleSchema.safeParse(invalidFavorite);
      expect(result.success).toBe(false);
    });

    it("rejects empty lines array", () => {
      const invalidFavorite = { ...validFavorite, lines: [] };
      const result = pushFavoriteTupleSchema.safeParse(invalidFavorite);
      expect(result.success).toBe(false);
    });

    it("rejects more than 10 lines", () => {
      const invalidFavorite = {
        ...validFavorite,
        lines: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"],
      };
      const result = pushFavoriteTupleSchema.safeParse(invalidFavorite);
      expect(result.success).toBe(false);
    });

    it("rejects empty stationId", () => {
      const invalidFavorite = { ...validFavorite, stationId: "" };
      const result = pushFavoriteTupleSchema.safeParse(invalidFavorite);
      expect(result.success).toBe(false);
    });

    it("rejects empty id", () => {
      const invalidFavorite = { ...validFavorite, id: "" };
      const result = pushFavoriteTupleSchema.safeParse(invalidFavorite);
      expect(result.success).toBe(false);
    });
  });

  describe("pushSubscribeRequestSchema", () => {
    const validSubscription = {
      subscription: {
        endpoint: "https://fcm.googleapis.com/fcm/test",
        keys: {
          p256dh: "base64url-encoded-key-12345678901234567890",
          auth: "base64url-auth-secret-123456",
        },
      },
      favorites: [
        {
          id: "fav-1",
          stationId: "station-1",
          lines: ["1"],
          direction: "N" as const,
        },
      ],
      quietHours: {
        enabled: true,
        startHour: 22,
        endHour: 7,
      },
      morningScores: {
        "station-1": 85,
      },
    };

    it("accepts valid subscription request with all fields", () => {
      const result = pushSubscribeRequestSchema.safeParse(validSubscription);
      expect(result.success).toBe(true);
    });

    it("accepts valid subscription request with minimal fields", () => {
      const minimalRequest = {
        subscription: {
          endpoint: "https://fcm.googleapis.com/fcm/test",
          keys: {
            p256dh: "base64url-encoded-key-12345678901234567890",
            auth: "base64url-auth-secret-123456",
          },
        },
        favorites: [
          {
            id: "fav-1",
            stationId: "station-1",
            lines: ["1"],
            direction: "N" as const,
          },
        ],
      };
      const result = pushSubscribeRequestSchema.safeParse(minimalRequest);
      expect(result.success).toBe(true);
    });

    it("accepts FCM endpoint", () => {
      const request = {
        ...validSubscription,
        subscription: {
          ...validSubscription.subscription,
          endpoint: "https://fcm.googleapis.com/fcm/send/test-token",
        },
      };
      const result = pushSubscribeRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it("accepts Mozilla push service endpoint", () => {
      const request = {
        ...validSubscription,
        subscription: {
          ...validSubscription.subscription,
          endpoint: "https://updates.push.services.mozilla.com/wpush/v2/test",
        },
      };
      const result = pushSubscribeRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it("accepts Apple push service endpoint", () => {
      const request = {
        ...validSubscription,
        subscription: {
          ...validSubscription.subscription,
          endpoint: "https://webpush.shopify.com/push/test",
        },
      };
      const result = pushSubscribeRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it("rejects HTTP endpoint", () => {
      const invalidRequest = {
        ...validSubscription,
        subscription: {
          ...validSubscription.subscription,
          endpoint: "http://example.com/push",
        },
      };
      const result = pushSubscribeRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });

    it("rejects unknown HTTPS endpoint", () => {
      const invalidRequest = {
        ...validSubscription,
        subscription: {
          ...validSubscription.subscription,
          endpoint: "https://unknown-service.com/push",
        },
      };
      const result = pushSubscribeRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });

    it("rejects invalid p256dh key (contains invalid characters)", () => {
      const invalidRequest = {
        ...validSubscription,
        subscription: {
          ...validSubscription.subscription,
          keys: {
            ...validSubscription.subscription.keys,
            p256dh: "key-with-spaces and special chars!",
          },
        },
      };
      const result = pushSubscribeRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });

    it("rejects invalid auth key (contains invalid characters)", () => {
      const invalidRequest = {
        ...validSubscription,
        subscription: {
          ...validSubscription.subscription,
          keys: {
            ...validSubscription.subscription.keys,
            auth: "auth/with/slashes",
          },
        },
      };
      const result = pushSubscribeRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });

    it("rejects more than 50 favorites", () => {
      const invalidRequest = {
        ...validSubscription,
        favorites: Array.from({ length: 51 }, (_, i) => ({
          id: `fav-${i}`,
          stationId: `station-${i}`,
          lines: ["1"],
          direction: "N" as const,
        })),
      };
      const result = pushSubscribeRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });

    it("rejects invalid quietHours (startHour > 23)", () => {
      const invalidRequest = {
        ...validSubscription,
        quietHours: {
          enabled: true,
          startHour: 24,
          endHour: 7,
        },
      };
      const result = pushSubscribeRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });

    it("rejects invalid quietHours (endHour < 0)", () => {
      const invalidRequest = {
        ...validSubscription,
        quietHours: {
          enabled: true,
          startHour: 22,
          endHour: -1,
        },
      };
      const result = pushSubscribeRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });

    it("rejects morningScore out of range (> 100)", () => {
      const invalidRequest = {
        ...validSubscription,
        morningScores: {
          "station-1": 150,
        },
      };
      const result = pushSubscribeRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });

    it("rejects morningScore out of range (< 0)", () => {
      const invalidRequest = {
        ...validSubscription,
        morningScores: {
          "station-1": -10,
        },
      };
      const result = pushSubscribeRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });
  });

  describe("pushUnsubscribeRequestSchema", () => {
    const validUnsubscribe = {
      endpoint: "https://fcm.googleapis.com/fcm/test",
    };

    it("accepts valid unsubscribe request", () => {
      const result = pushUnsubscribeRequestSchema.safeParse(validUnsubscribe);
      expect(result.success).toBe(true);
    });

    it("rejects HTTP endpoint", () => {
      const invalidRequest = {
        endpoint: "http://example.com/push",
      };
      const result = pushUnsubscribeRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });

    it("rejects unknown HTTPS endpoint", () => {
      const invalidRequest = {
        endpoint: "https://unknown-service.com/push",
      };
      const result = pushUnsubscribeRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });
  });

  describe("pushUpdateRequestSchema", () => {
    const validUpdate = {
      endpoint: "https://fcm.googleapis.com/fcm/test",
      favorites: [
        {
          id: "fav-1",
          stationId: "station-1",
          lines: ["1"],
          direction: "N" as const,
        },
      ],
    };

    it("accepts valid update with favorites", () => {
      const result = pushUpdateRequestSchema.safeParse(validUpdate);
      expect(result.success).toBe(true);
    });

    it("accepts valid update with quietHours", () => {
      const update = {
        endpoint: "https://fcm.googleapis.com/fcm/test",
        quietHours: {
          enabled: true,
          startHour: 22,
          endHour: 7,
        },
      };
      const result = pushUpdateRequestSchema.safeParse(update);
      expect(result.success).toBe(true);
    });

    it("accepts valid update with morningScores", () => {
      const update = {
        endpoint: "https://fcm.googleapis.com/fcm/test",
        morningScores: {
          "station-1": 85,
        },
      };
      const result = pushUpdateRequestSchema.safeParse(update);
      expect(result.success).toBe(true);
    });

    it("accepts valid update with all optional fields", () => {
      const update = {
        endpoint: "https://fcm.googleapis.com/fcm/test",
        favorites: [
          {
            id: "fav-1",
            stationId: "station-1",
            lines: ["1"],
            direction: "N" as const,
          },
        ],
        quietHours: {
          enabled: true,
          startHour: 22,
          endHour: 7,
        },
        morningScores: {
          "station-1": 85,
        },
      };
      const result = pushUpdateRequestSchema.safeParse(update);
      expect(result.success).toBe(true);
    });

    it("rejects update without any updatable fields", () => {
      const invalidRequest = {
        endpoint: "https://fcm.googleapis.com/fcm/test",
      };
      const result = pushUpdateRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });

    it("rejects invalid endpoint", () => {
      const invalidRequest = {
        endpoint: "http://example.com/push",
        favorites: [
          {
            id: "fav-1",
            stationId: "station-1",
            lines: ["1"],
            direction: "N" as const,
          },
        ],
      };
      const result = pushUpdateRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });
  });
});
