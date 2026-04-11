/**
 * Zod validation schemas for API inputs.
 * Re-exported from @mta-my-way/shared for use by both server and frontend.
 */

export {
  pushFavoriteTupleSchema,
  pushSubscribeRequestSchema,
  pushUnsubscribeRequestSchema,
  pushUpdateRequestSchema,
} from "./push.js";

export { commuteAnalyzeRequestSchema } from "./commute.js";

export {
  delayPredictionRequestSchema,
  delayProbabilityQuerySchema,
  delayPatternsQuerySchema,
} from "./predictions.js";

export {
  tripCreateRequestSchema,
  tripNotesUpdateRequestSchema,
  tripQuerySchema,
} from "./trips.js";

export {
  contextClearRequestSchema,
  contextDetectRequestSchema,
  contextOverrideRequestSchema,
  contextSettingsUpdateRequestSchema,
  validContexts,
} from "./context.js";

export {
  alertsQuerySchema,
  complexIdParamSchema,
  complexIdParamsSchema,
  commuteIdQuerySchema,
  datePathParamSchema,
  dateRangeParamsSchema,
  emptyQuerySchema,
  equipmentQuerySchema,
  journalStatsQuerySchema,
  lineIdParamSchema,
  lineIdParamsSchema,
  paginationQuerySchema,
  positionsQuerySchema,
  routeIdParamSchema,
  routeIdParamsSchema,
  stationIdParamSchema,
  stationIdParamsSchema,
  stationSearchQuerySchema,
  tripIdParamSchema,
  tripIdParamsSchema,
} from "./params.js";

export {
  passwordChangeSchema,
  passwordPolicySchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
} from "./auth.js";
