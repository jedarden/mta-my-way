/**
 * HTTP metrics middleware for observability.
 *
 * Tracks request counts, duration, size, and active connections.
 * Integrates with the metrics registry for Prometheus export.
 */

import type { MiddlewareHandler } from "hono";
import {
  httpRequestsTotal,
  httpRequestDuration,
  httpRequestSize,
  httpResponseSize,
  activeConnections,
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
 * - http_requests_total: Counter with labels for method, route, status
 * - http_request_duration_seconds: Histogram with labels for method, route
 * - http_request_size_bytes: Histogram for request body size
 * - http_response_size_bytes: Histogram for response body size
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
          httpRequestSize.observe(requestSize / 1024, { ...labels, method, route });
        }
      }
    }

    try {
      await next();

      const duration = (Date.now() - startTime) / 1000; // Convert to seconds
      const status = c.res.status;

      // Track request count
      httpRequestsTotal.inc(1, {
        ...labels,
        method,
        route,
        status: status.toString(),
        statusGroup: getStatusGroup(status),
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
            httpResponseSize.observe(responseSize / 1024, { ...labels, method, route });
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
        statusGroup: "5xx",
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

/**
 * Record a cache hit metric.
 * Call this when data is served from cache.
 */
export function recordCacheHitMetric(): void {
  const { cacheHits } = require("../observability/metrics.js");
  cacheHits.inc(1);
}

/**
 * Record a cache miss metric.
 * Call this when cache lookup fails and data must be fetched.
 */
export function recordCacheMissMetric(): void {
  const { cacheMisses } = require("../observability/metrics.js");
  cacheMisses.inc(1);
}

/**
 * Record a feed poll duration metric.
 * Call this after each feed poll.
 */
export function recordFeedPollDuration(durationSeconds: number, feedId: string): void {
  const { feedPollDuration } = require("../observability/metrics.js");
  feedPollDuration.observe(durationSeconds, { feed: feedId });
}

/**
 * Record a feed error metric.
 * Call this when a feed poll fails.
 */
export function recordFeedError(feedId: string, errorType?: string): void {
  const { feedErrors } = require("../observability/metrics.js");
  const labels: Record<string, string> = { feed: feedId };
  if (errorType) {
    labels.error_type = errorType;
  }
  feedErrors.inc(1, labels);
}

/**
 * Record a push notification sent metric.
 */
export function recordPushNotificationSent(lines: string[]): void {
  const { pushNotificationsSent } = require("../observability/metrics.js");
  pushNotificationsSent.inc(1, { lines: lines.join(",") });
}

/**
 * Record a push notification failed metric.
 */
export function recordPushNotificationFailed(reason: string): void {
  const { pushNotificationsFailed } = require("../observability/metrics.js");
  pushNotificationsFailed.inc(1, { reason });
}
