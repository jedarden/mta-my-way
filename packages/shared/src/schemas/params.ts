/**
 * Zod validation schemas for path parameters.
 * Shared between server and frontend for consistent validation.
 */

import { z } from "zod";

/**
 * MTA line ID schema for path parameters.
 * Validates NYC subway line identifiers.
 */
export const lineIdParamSchema = z
  .string()
  .min(1)
  .max(10)
  .regex(/^[1-7ACEGHJLMNQRWYZ]{1,3}$|^[A-Z]{1,2}[0-9]$/, {
    message: "Line ID must be a valid MTA line identifier (e.g., 1, A, 123, FS, SI)",
  });

/**
 * Route ID schema for path parameters.
 * Validates GTFS route identifiers.
 */
export const routeIdParamSchema = z
  .string()
  .min(1)
  .max(10)
  .regex(/^[A-Za-z0-9]{1,5}$/, {
    message: "Route ID must be a valid route identifier",
  });

/**
 * Station ID schema for path parameters.
 * Validates GTFS station IDs.
 */
export const stationIdParamSchema = z
  .string()
  .min(1)
  .max(50)
  .regex(/^[A-Za-z0-9_-]+$/, {
    message: "Station ID must contain only alphanumeric characters, hyphens, and underscores",
  });

/**
 * Complex ID schema for path parameters.
 * Validates station complex identifiers.
 */
export const complexIdParamSchema = z
  .string()
  .min(1)
  .max(50)
  .regex(/^[A-Za-z0-9_-]+$/, {
    message: "Complex ID must contain only alphanumeric characters, hyphens, and underscores",
  });

/**
 * Trip ID schema for path parameters.
 * Validates GTFS trip identifiers.
 * Format: Usually RouteID_RunID_Date or similar
 */
export const tripIdParamSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9_.-]+$/, {
    message: "Trip ID must contain only alphanumeric characters, dots, hyphens, and underscores",
  });

/**
 * ISO 8601 date string schema for path parameters.
 * Used for date range endpoints.
 */
export const datePathParamSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
  message: "Date must be in ISO 8601 format (YYYY-MM-DD)",
});

/**
 * Combined path parameter schemas for common endpoints.
 */
export const lineIdParamsSchema = z.object({
  lineId: lineIdParamSchema,
});

export const routeIdParamsSchema = z.object({
  id: routeIdParamSchema,
});

export const stationIdParamsSchema = z.object({
  id: stationIdParamSchema,
});

export const complexIdParamsSchema = z.object({
  id: complexIdParamSchema,
});

export const tripIdParamsSchema = z.object({
  tripId: tripIdParamSchema,
});

export const dateRangeParamsSchema = z.object({
  startDate: datePathParamSchema,
  endDate: datePathParamSchema,
});

/**
 * Query parameter schema for station search.
 * Sanitizes and validates search queries to prevent injection.
 */
export const stationSearchQuerySchema = z.object({
  q: z
    .string()
    .min(1, "Search query is required")
    .max(100, "Search query must be less than 100 characters")
    .refine((val) => !/<[^>]*>/.test(val), {
      message: "Search query cannot contain HTML tags",
    })
    .refine((val) => !/on\w+\s*=/i.test(val), {
      message: "Search query cannot contain event handlers",
    }),
});

/**
 * Commute ID query parameter schema.
 * Validates commute identifiers for journal stats endpoints.
 */
export const commuteIdQuerySchema = z.object({
  commuteId: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-zA-Z0-9_-]+$/, {
      message: "Commute ID must contain only alphanumeric characters, hyphens, and underscores",
    })
    .optional(),
});

/**
 * Journal stats query parameter schema.
 * Extends commute ID with optional date filtering.
 */
export const journalStatsQuerySchema = z.object({
  commuteId: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-zA-Z0-9_-]+$/, {
      message: "Commute ID must contain only alphanumeric characters, hyphens, and underscores",
    })
    .optional(),
  startDate: datePathParamSchema.optional(),
  endDate: datePathParamSchema.optional(),
});

/**
 * Empty query parameter schema for endpoints that don't accept query parameters.
 * Validates that no unexpected query parameters are passed.
 */
export const emptyQuerySchema = z.object({}).strict();

/**
 * Optional limit/offset query parameter schema for pagination.
 * Used by endpoints that return lists.
 */
export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

/**
 * Alerts query parameter schema.
 * Optional filtering for alerts endpoint.
 */
export const alertsQuerySchema = z.object({
  lineId: lineIdParamSchema.optional(),
  activeOnly: z.coerce.boolean().optional(),
});

/**
 * Equipment query parameter schema.
 * Optional filtering for equipment endpoint.
 */
export const equipmentQuerySchema = z.object({
  stationId: stationIdParamSchema.optional(),
  type: z.enum(["elevator", "escalator", "all"]).optional(),
});

/**
 * Positions query parameter schema.
 * Optional filtering for positions endpoint.
 */
export const positionsQuerySchema = z.object({
  includeHistory: z.coerce.boolean().optional(),
});
