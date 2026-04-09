/**
 * HTTP metrics middleware for observability.
 *
 * Tracks request counts, duration, size, and active connections.
 * Integrates with the metrics registry for Prometheus export.
 * Supports comprehensive labeling for detailed monitoring and debugging.
 */

import type { MiddlewareHandler } from "hono";
import {
  activeConnections,
  alertsActive,
  alertsChanges,
  alertsMatchRate,
  cacheHits,
  cacheMisses,
  commuteAnalysisDuration,
  commuteAnalysisRequests,
  contextDetections,
  contextOverrides,
  contextTransitions,
  delayPredictionDuration,
  delayPredictionRequests,
  equipmentElevatorsOut,
  equipmentEscalatorsOut,
  equipmentOutages,
  feedEntitiesProcessed,
  feedErrors,
  feedPollDuration,
  httpRequestDuration,
  httpRequestSize,
  httpRequestsTotal,
  httpResponseSize,
  pushNotificationsFailed,
  pushNotificationsSent,
  pushSubscriptionsActive,
  stationSearchDuration,
  stationSearchRequests,
  stationSearchResults,
  tripQueryDuration,
  tripsActive,
  tripsCreated,
  tripsQueried,
} from "../observability/metrics.js";

interface MetricsMiddlewareOptions {
  /** Enable/disable request size tracking */
  trackRequestSize?: boolean;
  /** Enable/disable response size tracking */
  trackResponseSize?: boolean;
  /** Custom labels to add to all metrics */
  labels?: Record<string, string>;
}

/**
 * HTTP metrics middleware for Hono.
 *
 * Tracks:
 * - http_requests_total: Counter with labels for method, route, status, status_group
 * - http_request_duration_seconds: Histogram with labels for method, route, status
 * - http_request_size_bytes: Histogram for request body size with method, route
 * - http_response_size_bytes: Histogram for response body size with method, route
 * - active_connections: Gauge for concurrent requests
 */
export function httpMetrics(options: MetricsMiddlewareOptions = {}): MiddlewareHandler {
  const { trackRequestSize = true, trackResponseSize = true, labels = {} } = options;

  return async (c, next) => {
    const startTime = Date.now();
    const method = c.req.method;
    const route = c.req.routePath || c.req.path;

    // Track active connections
    activeConnections.inc(1, labels);

    // Track request size if enabled
    let requestSize = 0;
    if (trackRequestSize) {
      const contentLength = c.req.header("content-length");
      if (contentLength) {
        requestSize = parseInt(contentLength, 10);
        if (!isNaN(requestSize)) {
          httpRequestSize.observe(requestSize, { ...labels, method, route });
        }
      }
    }

    try {
      await next();

      const duration = (Date.now() - startTime) / 1000; // Convert to seconds
      const status = c.res.status;

      // Track request count with detailed labels
      httpRequestsTotal.inc(1, {
        ...labels,
        method,
        route,
        status: status.toString(),
        status_group: getStatusGroup(status),
      });

      // Track request duration
      httpRequestDuration.observe(duration, {
        ...labels,
        method,
        route,
        status: status.toString(),
      });

      // Track response size if enabled
      if (trackResponseSize) {
        const contentLength = c.res.headers.get("content-length");
        if (contentLength) {
          const responseSize = parseInt(contentLength, 10);
          if (!isNaN(responseSize)) {
            httpResponseSize.observe(responseSize, { ...labels, method, route });
          }
        }
      }
    } catch (error) {
      const duration = (Date.now() - startTime) / 1000;

      // Track error request
      httpRequestsTotal.inc(1, {
        ...labels,
        method,
        route,
        status: "500",
        status_group: "5xx",
      });

      httpRequestDuration.observe(duration, {
        ...labels,
        method,
        route,
        status: "500",
      });

      throw error;
    } finally {
      activeConnections.dec(1, labels);
    }
  };
}

/**
 * Get HTTP status group for metrics aggregation.
 */
function getStatusGroup(status: number): string {
  if (status < 200) return "1xx";
  if (status < 300) return "2xx";
  if (status < 400) return "3xx";
  if (status < 500) return "4xx";
  return "5xx";
}

// ============================================================================
// Cache Metrics
// ============================================================================

/**
 * Record a cache hit metric.
 * Call this when data is served from cache.
 */
export function recordCacheHitMetric(cacheType: string): void {
  cacheHits.inc(1, { cache_type: cacheType });
}

/**
 * Record a cache miss metric.
 * Call this when cache lookup fails and data must be fetched.
 */
export function recordCacheMissMetric(cacheType: string): void {
  cacheMisses.inc(1, { cache_type: cacheType });
}

// ============================================================================
// Feed Polling Metrics
// ============================================================================

/**
 * Record a feed poll duration metric.
 * Call this after each feed poll.
 */
export function recordFeedPollDuration(durationSeconds: number, feedId: string): void {
  feedPollDuration.observe(durationSeconds, { feed_id: feedId });
}

/**
 * Record a feed error metric.
 * Call this when a feed poll fails.
 */
export function recordFeedError(feedId: string, errorType: string): void {
  feedErrors.inc(1, { feed_id: feedId, error_type: errorType });
}

/**
 * Record the number of entities processed from a feed.
 */
export function recordFeedEntitiesProcessed(feedId: string, entityCount: number): void {
  feedEntitiesProcessed.set(entityCount, { feed_id: feedId });
}

// ============================================================================
// Push Notification Metrics
// ============================================================================

/**
 * Record a push notification sent metric.
 */
export function recordPushNotificationSent(lines: string[]): void {
  const linesLabel = lines.length > 0 ? lines.join(",") : "none";
  pushNotificationsSent.inc(1, { lines: linesLabel });
}

/**
 * Record a push notification failed metric.
 */
export function recordPushNotificationFailed(reason: string): void {
  pushNotificationsFailed.inc(1, { reason });
}

/**
 * Set the number of active push subscriptions.
 */
export function setPushSubscriptionsActive(count: number): void {
  pushSubscriptionsActive.set(count);
}

// ============================================================================
// Trip Tracking Metrics
// ============================================================================

/**
 * Record a trip created metric.
 */
export function recordTripCreated(source: string, line?: string): void {
  const labels: Record<string, string> = { source };
  if (line) {
    labels.line = line;
  }
  tripsCreated.inc(1, labels);
}

/**
 * Set the number of active trips being tracked.
 */
export function setActiveTripsCount(count: number): void {
  tripsActive.set(count);
}

/**
 * Record a trip query metric.
 */
export function recordTripQueried(success: boolean): void {
  tripsQueried.inc(1, { success: success.toString() });
}

/**
 * Record a trip query duration metric.
 */
export function recordTripQueryDuration(durationSeconds: number): void {
  tripQueryDuration.observe(durationSeconds);
}

// ============================================================================
// Commute Analysis Metrics
// ============================================================================

/**
 * Record a commute analysis request metric.
 */
export function recordCommuteAnalysisRequest(
  success: boolean,
  hasTransfers: boolean,
  accessibleMode: boolean
): void {
  commuteAnalysisRequests.inc(1, {
    success: success.toString(),
    has_transfers: hasTransfers.toString(),
    accessible: accessibleMode.toString(),
  });
}

/**
 * Record a commute analysis duration metric.
 */
export function recordCommuteAnalysisDuration(durationSeconds: number): void {
  commuteAnalysisDuration.observe(durationSeconds);
}

// ============================================================================
// Station Search Metrics
// ============================================================================

/**
 * Record a station search request metric.
 */
export function recordStationSearchRequest(resultCount: number): void {
  stationSearchRequests.inc(1);
  stationSearchResults.observe(resultCount);
}

/**
 * Record a station search duration metric.
 */
export function recordStationSearchDuration(durationSeconds: number): void {
  stationSearchDuration.observe(durationSeconds);
}

// ============================================================================
// Delay Prediction Metrics
// ============================================================================

/**
 * Record a delay prediction request metric.
 */
export function recordDelayPredictionRequest(success: boolean, hasData: boolean): void {
  delayPredictionRequests.inc(1, {
    success: success.toString(),
    has_data: hasData.toString(),
  });
}

/**
 * Record a delay prediction duration metric.
 */
export function recordDelayPredictionDuration(durationSeconds: number): void {
  delayPredictionDuration.observe(durationSeconds);
}

// ============================================================================
// Context Detection Metrics
// ============================================================================

/**
 * Record a context detection metric.
 */
export function recordContextDetection(context: string, confidence: string): void {
  contextDetections.inc(1, { context, confidence });
}

/**
 * Record a context transition metric.
 */
export function recordContextTransition(fromContext: string, toContext: string): void {
  contextTransitions.inc(1, { from: fromContext, to: toContext });
}

/**
 * Record a context override metric.
 */
export function recordContextOverride(context: string): void {
  contextOverrides.inc(1, { context });
}

// ============================================================================
// Alert Metrics
// ============================================================================

/**
 * Set the number of active alerts.
 */
export function setAlertsActive(count: number): void {
  alertsActive.set(count);
}

/**
 * Set the alert pattern match rate.
 */
export function setAlertsMatchRate(rate: number): void {
  alertsMatchRate.set(rate);
}

/**
 * Record an alert change metric.
 */
export function recordAlertsChange(changeType: string): void {
  alertsChanges.inc(1, { change_type: changeType });
}

// ============================================================================
// Equipment Metrics
// ============================================================================

/**
 * Set the number of equipment outages.
 */
export function setEquipmentOutages(total: number, elevators: number, escalators: number): void {
  equipmentOutages.set(total);
  equipmentElevatorsOut.set(elevators);
  equipmentEscalatorsOut.set(escalators);
}
