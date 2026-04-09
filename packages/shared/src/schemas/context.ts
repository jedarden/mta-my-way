/**
 * Zod validation schemas for context-aware switching API payloads.
 * Shared between server and frontend for consistent validation.
 */

import { z } from "zod";

/**
 * Valid context types for the application.
 * These represent the different user states the app can detect or be set to.
 */
export const validContexts = ["commuting", "planning", "reviewing", "idle", "at_station"] as const;

const contextSchema = z.enum(validContexts, {
  message: `Context must be one of: ${validContexts.join(", ")}`,
});

/**
 * Screen name schema.
 * Validates screen identifiers to prevent injection.
 */
const screenNameSchema = z
  .string()
  .min(1)
  .max(50)
  .regex(/^[a-zA-Z0-9_-]+$/, {
    message: "Screen name must contain only alphanumeric characters, hyphens, and underscores",
  });

/**
 * Action name schema.
 * Validates action identifiers to prevent injection.
 */
const actionNameSchema = z
  .string()
  .min(1)
  .max(50)
  .regex(/^[a-zA-Z0-9_-]+$/, {
    message: "Action name must contain only alphanumeric characters, hyphens, and underscores",
  });

/**
 * Latitude/longitude validation.
 * Reasonable bounds for NYC area (slightly wider than NYC to handle edge cases).
 */
const latitudeSchema = z
  .number()
  .min(-90)
  .max(90)
  .refine((val) => val >= 40.4 && val <= 40.95, {
    message: "Latitude must be within NYC area bounds",
  });

const longitudeSchema = z
  .number()
  .min(-180)
  .max(180)
  .refine((val) => val >= -74.3 && val <= -73.7, {
    message: "Longitude must be within NYC area bounds",
  });

/** POST /api/context/detect */
export const contextDetectRequestSchema = z.object({
  latitude: latitudeSchema.optional(),
  longitude: longitudeSchema.optional(),
  tapHistory: z
    .array(
      z.object({
        screen: screenNameSchema,
        action: actionNameSchema,
        timestamp: z.number().int().positive(),
      })
    )
    .max(100, "Tap history cannot exceed 100 entries")
    .optional(),
  currentScreen: screenNameSchema.optional(),
  screenTime: z.number().int().min(0).max(86400).optional(), // Max 24 hours in seconds
  recentActions: z.array(actionNameSchema).max(50).optional(),
});

/** POST /api/context/override */
export const contextOverrideRequestSchema = z.object({
  context: contextSchema,
});

/** PATCH /api/context/settings */
export const contextSettingsUpdateRequestSchema = z.object({
  enabled: z.boolean().optional(),
  showIndicator: z.boolean().optional(),
  useLocation: z.boolean().optional(),
  useTimePatterns: z.boolean().optional(),
  learnPatterns: z.boolean().optional(),
});

/** POST /api/context/clear */
export const contextClearRequestSchema = z
  .object({
    // Empty schema for future extensibility
    // Currently accepts an empty JSON object {}
  })
  .strict();
