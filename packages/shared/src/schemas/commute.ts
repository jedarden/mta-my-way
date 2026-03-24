/**
 * Zod validation schemas for commute analysis API payloads.
 * Shared between server and frontend for consistent validation.
 */

import { z } from "zod";

/** POST /api/commute/analyze */
export const commuteAnalyzeRequestSchema = z.object({
  originId: z.string().min(1),
  destinationId: z.string().min(1),
  preferredLines: z.array(z.string()).optional(),
  commuteId: z.string().optional(),
  accessibleMode: z.boolean().optional(),
});
