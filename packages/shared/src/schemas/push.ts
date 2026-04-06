/**
 * Zod validation schemas for push notification API payloads.
 * Shared between server and frontend for consistent validation.
 */

import { z } from "zod";

/**
 * Allowed push endpoint domains.
 *
 * Web Push endpoints must come from known, trusted push services.
 * This prevents attackers from registering malicious endpoints that
 * could be used to exfiltrate data or cause denial of service.
 */
const ALLOWED_PUSH_ENDPOINTS = [
  "https://fcm.googleapis.com", // Firebase Cloud Messaging
  "https://updates.push.services.mozilla.com", // Mozilla Push Service
  "https://push.apple.com", // Apple Push Notification Service
  "https://webpush.shopify.com", // Shopify (for merchant apps)
  "https://push.services.mozilla.com", // Legacy Mozilla Push Service
  "https://android.googleapis.com", // Legacy Google Cloud Messaging
];

/**
 * Custom refinement to validate push subscription endpoints.
 *
 * Ensures:
 * - URL is valid
 * - URL starts with https:// (secure connections required)
 * - URL is from a known push service provider
 */
function validatePushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);

    // Must use HTTPS for security
    if (url.protocol !== "https:") {
      return false;
    }

    // Check if the endpoint is from a known push service
    return ALLOWED_PUSH_ENDPOINTS.some((allowed) => endpoint.startsWith(allowed));
  } catch {
    return false;
  }
}

/**
 * Zod schema for push endpoint validation.
 */
const pushEndpointSchema = z
  .string()
  .url()
  .min(1)
  .max(2048) // Reasonable max length for URLs
  .refine((val) => validatePushEndpoint(val), {
    message: `Endpoint must be a valid HTTPS URL from a known push service`,
  });

/**
 * Schema for push subscription keys with stricter validation.
 *
 * - p256dh: Base64-encoded P-256 public key (typically 65-88 chars)
 * - auth: Base64-encoded authentication secret (typically 16-24 chars)
 */
const pushKeysSchema = z.object({
  p256dh: z
    .string()
    .min(1)
    .max(256)
    .regex(/^[A-Za-z0-9_-]+$/, {
      message: "p256dh must be a valid base64url-encoded string",
    }),
  auth: z
    .string()
    .min(1)
    .max(256)
    .regex(/^[A-Za-z0-9_-]+$/, {
      message: "auth must be a valid base64url-encoded string",
    }),
});

/** A single station/line/direction favorite tuple */
export const pushFavoriteTupleSchema = z.object({
  id: z.string().min(1).max(100),
  stationId: z.string().min(1).max(50),
  lines: z.array(z.string().min(1).max(10)).min(1).max(10), // Limit to 10 lines
  direction: z.enum(["N", "S", "both"]),
});

/** POST /api/push/subscribe */
export const pushSubscribeRequestSchema = z.object({
  subscription: z.object({
    endpoint: pushEndpointSchema,
    keys: pushKeysSchema,
  }),
  favorites: z.array(pushFavoriteTupleSchema).max(50), // Limit favorites to prevent abuse
  quietHours: z
    .object({
      enabled: z.boolean(),
      startHour: z.number().int().min(0).max(23),
      endHour: z.number().int().min(0).max(23),
    })
    .optional(),
  morningScores: z.record(z.string().max(50), z.number().int().min(0).max(100)).optional(),
});

/** DELETE /api/push/unsubscribe */
export const pushUnsubscribeRequestSchema = z.object({
  endpoint: pushEndpointSchema,
});

/** PATCH /api/push/subscription */
export const pushUpdateRequestSchema = z
  .object({
    endpoint: pushEndpointSchema,
    favorites: z.array(pushFavoriteTupleSchema).max(50).optional(),
    quietHours: z
      .object({
        enabled: z.boolean(),
        startHour: z.number().int().min(0).max(23),
        endHour: z.number().int().min(0).max(23),
      })
      .optional(),
    morningScores: z.record(z.string().max(50), z.number().int().min(0).max(100)).optional(),
  })
  .refine(
    (data) =>
      data.favorites !== undefined ||
      data.quietHours !== undefined ||
      data.morningScores !== undefined,
    {
      message: "favorites, quietHours, or morningScores is required",
    }
  );
