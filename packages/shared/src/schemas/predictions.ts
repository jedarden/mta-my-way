/**
 * Zod validation schemas for delay prediction API payloads.
 * Shared between server and frontend for consistent validation.
 */

import { z } from "zod";

/**
 * MTA line ID schema.
 * Validates NYC subway line identifiers.
 */
const lineIdSchema = z
  .string()
  .min(1)
  .max(10)
  .regex(/^[1-7ACEGHJLMNQRWYZ]{1,3}$|^[A-Z]{1,2}[0-9]$/, {
    message: "Line ID must be a valid MTA line identifier (e.g., 1, A, 123, FS, SI)",
  });

/**
 * Direction schema.
 * Validates northbound/southbound direction.
 */
const directionSchema = z.enum(["N", "S"], {
  message: "Direction must be 'N' or 'S'",
});

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
 * Scheduled minutes schema.
 * Validates scheduled trip duration in minutes.
 */
const scheduledMinutesSchema = z
  .number()
  .int()
  .min(1)
  .max(180, "Scheduled duration cannot exceed 180 minutes (3 hours)");

/** POST /api/predictions/predict */
export const delayPredictionRequestSchema = z
  .object({
    routeId: lineIdSchema,
    direction: directionSchema,
    fromStationId: stationIdSchema,
    toStationId: stationIdSchema,
    scheduledMinutes: scheduledMinutesSchema,
  })
  .refine((data) => data.fromStationId !== data.toStationId, {
    message: "Origin and destination stations must be different",
  });

/**
 * Query parameter schema for delay probability endpoint.
 */
export const delayProbabilityQuerySchema = z.object({
  routeId: lineIdSchema,
  direction: directionSchema.optional(),
});

/**
 * Query parameter schema for delay patterns endpoint.
 */
export const delayPatternsQuerySchema = z.object({
  direction: directionSchema.optional(),
});
