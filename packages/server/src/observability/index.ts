/**
 * Observability module — single entry point for all observability concerns.
 *
 * Re-exports from logger, metrics, tracing, and opentelemetry sub-modules,
 * plus orchestration helpers for init/shutdown so callers never need to
 * import sub-modules directly.
 *
 * Usage in server entry point:
 *   import { initObservability, shutdownObservability } from './observability/index.js';
 *   await initObservability();
 *   // ... application runs ...
 *   await shutdownObservability();
 */

// ============================================================================
// Logger
// ============================================================================

export { logger, createLogger, LogLevel } from "./logger.js";

// ============================================================================
// Metrics (registry singleton + pre-registered metric handles)
// ============================================================================

export {
  metrics,
  httpRequestsTotal,
  httpRequestDuration,
  httpRequestSize,
  httpResponseSize,
  activeConnections,
  cacheHits,
  cacheMisses,
  feedPollDuration,
  feedErrors,
  feedEntitiesProcessed,
  pushNotificationsSent,
  pushNotificationsFailed,
  pushSubscriptionsActive,
  tripsCreated,
  tripsActive,
  tripsQueried,
  tripQueryDuration,
  commuteAnalysisRequests,
  commuteAnalysisDuration,
  stationSearchRequests,
  stationSearchDuration,
  stationSearchResults,
  delayPredictionRequests,
  delayPredictionDuration,
  delayPredictionAccuracy,
  contextDetections,
  contextTransitions,
  contextOverrides,
  alertsActive,
  alertsMatchRate,
  alertsChanges,
  equipmentOutages,
  equipmentElevatorsOut,
  equipmentEscalatorsOut,
} from "./metrics.js";

// ============================================================================
// Tracing
// ============================================================================

export {
  tracer,
  tracingMiddleware,
  tracedFetch,
  withChildSpan,
  recordEvent,
  setSpanAttribute,
  getCurrentTraceId,
} from "./tracing.js";

// ============================================================================
// OpenTelemetry (production distributed tracing)
// ============================================================================

export {
  initOpenTelemetry,
  shutdownOpenTelemetry,
  flushOpenTelemetry,
  isOpenTelemetryEnabled,
} from "./opentelemetry.js";

// ============================================================================
// Orchestration helpers
// ============================================================================

import { logger } from "./logger.js";
import {
  initOpenTelemetry as initOtel,
  shutdownOpenTelemetry as shutdownOtel,
  flushOpenTelemetry,
  isOpenTelemetryEnabled,
} from "./opentelemetry.js";

/**
 * Initialize all observability subsystems.
 *
 * Order matters:
 *  1. OpenTelemetry SDK (must be first so subsequent spans propagate to the
 *     collector from the very start of the process).
 *  2. Logger and metrics are already initialized at import time (module-level
 *     singletons), so nothing extra is needed.
 *
 * This function is safe to call more than once — subsequent calls are no-ops.
 */
export async function initObservability(): Promise<void> {
  await initOtel();
  logger.info("Observability initialized", {
    otel: isOpenTelemetryEnabled(),
  });
}

/**
 * Gracefully shut down all observability subsystems.
 *
 * Call this before process exit so in-flight data is flushed:
 *  1. Flush pending OpenTelemetry spans.
 *  2. Shut down the OTel SDK.
 *
 * Errors are logged but never thrown — the process should continue shutting
 * down regardless of telemetry flush failures.
 */
export async function shutdownObservability(): Promise<void> {
  logger.info("Shutting down observability…");

  try {
    await flushOpenTelemetry();
  } catch (err) {
    logger.error("Error flushing OpenTelemetry during shutdown", err as Error);
  }

  try {
    await shutdownOtel();
  } catch (err) {
    logger.error("Error shutting down OpenTelemetry", err as Error);
  }

  logger.info("Observability shutdown complete");
}
