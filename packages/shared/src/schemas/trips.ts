/**
 * Zod validation schemas for trip tracking and journal API payloads.
 * Shared between server and frontend for consistent validation.
 */

import { z } from "zod";

/**
 * ISO 8601 date string format (YYYY-MM-DD).
 * Used for date validation in trip tracking.
 */
const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
  message: "Date must be in ISO 8601 format (YYYY-MM-DD)",
});

/**
 * Unix timestamp schema.
 * Accepts both seconds and milliseconds since epoch.
 */
const timestampSchema = z
  .number()
  .int()
  .positive()
  .refine((val) => val > 946_684_800, {
    // 2000-01-01 in seconds
    message: "Timestamp must be a valid date after 2000-01-01",
  });

/**
 * Trip source schema.
 * Tracks where trip data originated from.
 */
const tripSourceSchema = z.enum(["manual", "tracked", "inferred"], {
  message: "Source must be one of: manual, tracked, inferred",
});

/**
 * Notes schema with reasonable length limits.
 * Prevents abuse while allowing user notes.
 * Also strips HTML tags and event handlers.
 */
const notesSchema = z
  .string()
  .max(5000, {
    message: "Notes must be less than 5000 characters",
  })
  .refine((val) => !/<[^>]*>/.test(val), {
    message: "Notes cannot contain HTML tags",
  })
  .refine((val) => !/on\w+\s*=/i.test(val), {
    message: "Notes cannot contain event handlers",
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
 * Line ID schema.
 * Validates MTA line identifiers.
 */
const lineIdSchema = z
  .string()
  .min(1, "Line is required")
  .max(10, "Line ID must be 10 characters or less")
  .regex(/^[A-Z0-9]+$/, {
    message: "Line ID must contain only uppercase letters and numbers",
  });

/** POST /api/trips */
export const tripCreateRequestSchema = z
  .object({
    date: dateStringSchema.optional(),
    origin: stationIdSchema,
    destination: stationIdSchema,
    line: lineIdSchema,
    departureTime: timestampSchema,
    arrivalTime: timestampSchema,
    notes: notesSchema.optional(),
  })
  .refine((data) => data.arrivalTime > data.departureTime, {
    message: "Arrival time must be after departure time",
  })
  .refine((data) => data.origin !== data.destination, {
    message: "Origin and destination must be different",
  });

/** PATCH /api/trips/:tripId/notes */
export const tripNotesUpdateRequestSchema = z.object({
  notes: notesSchema,
});

/**
 * Query parameter validation schema for trip listing.
 */
export const tripQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50).optional(),
  offset: z.coerce.number().int().min(0).default(0).optional(),
  startDate: dateStringSchema.optional(),
  endDate: dateStringSchema.optional(),
  originId: stationIdSchema.optional(),
  destinationId: stationIdSchema.optional(),
  line: lineIdSchema.optional(),
  source: tripSourceSchema.optional(),
});
