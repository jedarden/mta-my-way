/**
 * Zod validation schemas for push notification API payloads.
 * Shared between server and frontend for consistent validation.
 */

import { z } from "zod";

/** A single station/line/direction favorite tuple */
export const pushFavoriteTupleSchema = z.object({
  stationId: z.string().min(1),
  lines: z.array(z.string()).min(1),
  direction: z.enum(["N", "S", "both"]),
});

/** POST /api/push/subscribe */
export const pushSubscribeRequestSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string().min(1),
      auth: z.string().min(1),
    }),
  }),
  favorites: z.array(pushFavoriteTupleSchema),
  quietHours: z
    .object({
      enabled: z.boolean(),
      startHour: z.number().int().min(0).max(23),
      endHour: z.number().int().min(0).max(23),
    })
    .optional(),
  morningScores: z.record(z.string(), z.number().int().min(0)).optional(),
});

/** DELETE /api/push/unsubscribe */
export const pushUnsubscribeRequestSchema = z.object({
  endpoint: z.string().url(),
});

/** PATCH /api/push/subscription */
export const pushUpdateRequestSchema = z
  .object({
    endpoint: z.string().url(),
    favorites: z.array(pushFavoriteTupleSchema).optional(),
    quietHours: z
      .object({
        enabled: z.boolean(),
        startHour: z.number().int().min(0).max(23),
        endHour: z.number().int().min(0).max(23),
      })
      .optional(),
    morningScores: z.record(z.string(), z.number().int().min(0)).optional(),
  })
  .refine((data) => data.favorites !== undefined || data.quietHours !== undefined || data.morningScores !== undefined, {
    message: "favorites, quietHours, or morningScores is required",
  });
