/**
 * Zod validation schemas for commute analysis API payloads.
 * Shared between server and frontend for consistent validation.
 */

import { z } from "zod";

/**
 * Station ID schema.
 * Validates GTFS station IDs with strict character set.
 */
const stationIdSchema = z
  .string()
  .min(1, "Station ID is required")
  .max(50, "Station ID must be less than 50 characters")
  .regex(/^[A-Za-z0-9_-]+$/, {
    message: "Station ID must contain only alphanumeric characters, hyphens, and underscores",
  });

/**
 * Line ID schema.
 * Validates MTA line identifiers.
 */
const lineIdSchema = z
  .string()
  .min(1)
  .max(10)
  .regex(/^[1-7ACEGHJLMNQRWYZ]{1,3}$|^[A-Z]{1,2}[0-9]$/, {
    message: "Line ID must be a valid MTA line identifier (e.g., 1, A, 123, FS, SI)",
  });

/**
 * Commute ID schema.
 * Validates commute identifiers.
 */
const commuteIdSchema = z
  .string()
  .min(1)
  .max(50)
  .regex(/^[a-zA-Z0-9_-]+$/, {
    message: "Commute ID must contain only alphanumeric characters, hyphens, and underscores",
  });

/** POST /api/commute/analyze */
export const commuteAnalyzeRequestSchema = z.object({
  originId: stationIdSchema,
  destinationId: stationIdSchema,
  preferredLines: z
    .array(lineIdSchema)
    .max(10, "Cannot specify more than 10 preferred lines")
    .optional(),
  commuteId: commuteIdSchema.optional(),
  accessibleMode: z.boolean().optional(),
});
