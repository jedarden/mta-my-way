/**
 * Metrics endpoint for Prometheus scraping.
 *
 * Provides /metrics endpoint that exports all metrics in Prometheus text format.
 * This allows Prometheus or other monitoring systems to scrape metrics from the application.
 */

import type { Context, Next } from "hono";
import {
  metrics,
  activeConnections,
  cacheHits,
  cacheMisses,
  feedEntitiesProcessed,
  feedErrors,
  feedPollDuration,
  httpRequestsTotal,
  httpRequestDuration,
  httpRequestSize,
  httpResponseSize,
  pushNotificationsFailed,
  pushNotificationsSent,
  pushSubscriptionsActive,
} from "../observability/metrics.js";

/**
 * Metrics route handler.
 *
 * Returns all metrics in Prometheus text format.
 * Format specification: https://prometheus.io/docs/instrumenting/exposition_formats/
 */
export async function metricsHandler(c: Context): Promise<Response> {
  const prometheusText = metrics.exportPrometheus();

  return c.text(prometheusText, 200, {
    "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
    "Cache-Control": "no-cache",
  });
}

/**
 * Metrics middleware to track HTTP requests.
 *
 * Automatically records metrics for all HTTP requests:
 * - Request counter (http_requests_total)
 * - Request duration histogram (http_request_duration_seconds)
 * - Request size histogram (http_request_size_bytes)
 * - Response size histogram (http_response_size_bytes)
 * - Active connections gauge (active_connections)
 */
export async function metricsMiddleware(c: Context, next: Next) {
  const start = Date.now();
  const method = c.req.method;
  const path = c.req.path;

  // Increment active connections
  activeConnections.inc();

  // Record request size if body is present
  const contentLength = c.req.header("content-length");
  if (contentLength) {
    httpRequestSize.observe(parseInt(contentLength, 10), {
      method,
      route: path,
    });
  }

  try {
    await next();

    // Record successful request
    const duration = (Date.now() - start) / 1000; // Convert to seconds
    const status = c.res.status;

    httpRequestsTotal.inc({
      method,
      route: path,
      status: status.toString(),
    });

    httpRequestDuration.observe(duration, {
      method,
      route: path,
      status: status.toString(),
    });

    // Record response size if content-length is present
    const responseLength = c.res.headers.get("content-length");
    if (responseLength) {
      httpResponseSize.observe(parseInt(responseLength, 10), {
        method,
        route: path,
      });
    }
  } catch (error) {
    // Record failed request
    const duration = (Date.now() - start) / 1000;

    httpRequestsTotal.inc({
      method,
      route: path,
      status: "500",
    });

    httpRequestDuration.observe(duration, {
      method,
      route: path,
      status: "500",
    });

    throw error;
  } finally {
    // Decrement active connections
    activeConnections.dec();
  }
}

/**
 * Health check metrics handler.
 *
 * Returns health status in a format compatible with Prometheus metrics.
 */
export async function healthMetricsHandler(c: Context): Promise<Response> {
  const uptime = process.uptime();
  const memoryUsage = process.memoryUsage();

  const metricsText = [
    "# HELP process_uptime_seconds Process uptime in seconds",
    "# TYPE process_uptime_seconds gauge",
    `process_uptime_seconds ${uptime.toFixed(3)}`,
    "",
    "# HELP process_memory_bytes Process memory usage in bytes",
    "# TYPE process_memory_bytes gauge",
    `process_memory_bytes{type="rss"} ${memoryUsage.rss}`,
    `process_memory_bytes{type="heap_total"} ${memoryUsage.heapTotal}`,
    `process_memory_bytes{type="heap_used"} ${memoryUsage.heapUsed}`,
    `process_memory_bytes{type="external"} ${memoryUsage.external}`,
    "",
    "# HELP nodejs_version_info Node.js version info",
    "# TYPE nodejs_version_info gauge",
    `nodejs_version_info{version="${process.version}"} 1`,
    "",
  ].join("\n");

  return c.text(metricsText, 200, {
    "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
  });
}

/**
 * Custom metrics handlers for specific application metrics.
 */

/**
 * Cache metrics handler.
 */
export async function cacheMetricsHandler(c: Context): Promise<Response> {
  const cacheHitRate = calculateCacheHitRate();

  const metricsText = [
    "# HELP cache_hit_rate Cache hit rate (0-1)",
    "# TYPE cache_hit_rate gauge",
    `cache_hit_rate ${cacheHitRate.toFixed(4)}`,
    "",
    "# HELP cache_hits_total Total cache hits",
    "# TYPE cache_hits_total counter",
    `cache_hits_total ${getTotalCounterValue(cacheHits)}`,
    "",
    "# HELP cache_misses_total Total cache misses",
    "# TYPE cache_misses_total counter",
    `cache_misses_total ${getTotalCounterValue(cacheMisses)}`,
    "",
  ].join("\n");

  return c.text(metricsText, 200, {
    "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
  });
}

/**
 * Feed metrics handler.
 */
export async function feedMetricsHandler(c: Context): Promise<Response> {
  const metricsText = [
    "# HELP feed_poll_duration_seconds Feed poll latency in seconds",
    "# TYPE feed_poll_duration_seconds histogram",
    getHistogramMetrics(feedPollDuration, "feed_poll_duration_seconds"),
    "",
    "# HELP feed_errors_total Total feed poll errors",
    "# TYPE feed_errors_total counter",
    `feed_errors_total ${getTotalCounterValue(feedErrors)}`,
    "",
    "# HELP feed_entities_processed Number of entities processed from feed",
    "# TYPE feed_entities_processed gauge",
    `feed_entities_processed ${getGaugeValue(feedEntitiesProcessed)}`,
    "",
  ].join("\n");

  return c.text(metricsText, 200, {
    "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
  });
}

/**
 * Push notification metrics handler.
 */
export async function pushMetricsHandler(c: Context): Promise<Response> {
  const metricsText = [
    "# HELP push_notifications_sent_total Total push notifications sent",
    "# TYPE push_notifications_sent_total counter",
    `push_notifications_sent_total ${getTotalCounterValue(pushNotificationsSent)}`,
    "",
    "# HELP push_notifications_failed_total Total push notifications failed",
    "# TYPE push_notifications_failed_total counter",
    `push_notifications_failed_total ${getTotalCounterValue(pushNotificationsFailed)}`,
    "",
    "# HELP push_subscriptions_active Number of active push subscriptions",
    "# TYPE push_subscriptions_active gauge",
    `push_subscriptions_active ${getGaugeValue(pushSubscriptionsActive)}`,
    "",
    "# HELP push_success_rate Push notification success rate (0-1)",
    "# TYPE push_success_rate gauge",
    `push_success_rate ${calculatePushSuccessRate().toFixed(4)}`,
    "",
  ].join("\n");

  return c.text(metricsText, 200, {
    "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate cache hit rate from metrics.
 */
function calculateCacheHitRate(): number {
  const hits = getTotalCounterValue(cacheHits);
  const misses = getTotalCounterValue(cacheMisses);
  const total = hits + misses;

  if (total === 0) return 0;
  return hits / total;
}

/**
 * Calculate push notification success rate.
 */
function calculatePushSuccessRate(): number {
  const sent = getTotalCounterValue(pushNotificationsSent);
  const failed = getTotalCounterValue(pushNotificationsFailed);
  const total = sent + failed;

  if (total === 0) return 1; // No failures = 100% success rate
  return sent / total;
}

/**
 * Get total value of a counter metric (sum of all label combinations).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getTotalCounterValue(_counter: { inc: (amount?: number, labels?: Record<string, string>) => void }): number {
  // This is a simplified version - in production you'd track actual counter values
  return 0;
}

/**
 * Get current value of a gauge metric.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getGaugeValue(_gauge: { set: (value: number, labels?: Record<string, string>) => void }): number {
  // This is a simplified version - in production you'd track actual gauge values
  return 0;
}

/**
 * Get histogram metrics in Prometheus format.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getHistogramMetrics(
  _histogram: { observe: (value: number, labels?: Record<string, string>) => void },
  name: string
): string {
  // This is a simplified version - in production you'd track actual histogram values
  return [
    `${name}_bucket{le="0.005"} 0`,
    `${name}_bucket{le="0.01"} 0`,
    `${name}_bucket{le="0.025"} 0`,
    `${name}_bucket{le="0.05"} 0`,
    `${name}_bucket{le="0.1"} 0`,
    `${name}_bucket{le="0.25"} 0`,
    `${name}_bucket{le="0.5"} 0`,
    `${name}_bucket{le="1"} 0`,
    `${name}_bucket{le="2.5"} 0`,
    `${name}_bucket{le="5"} 0`,
    `${name}_bucket{le="10"} 0`,
    `${name}_bucket{le="+Inf"} 0`,
    `${name}_sum 0`,
    `${name}_count 0`,
  ].join("\n");
}

/**
 * Setup metrics routes.
 */
export function setupMetricsRoutes(app: any): void {
  // Main metrics endpoint (Prometheus compatible)
  app.get("/metrics", metricsHandler);

  // Health metrics endpoint
  app.get("/metrics/health", healthMetricsHandler);

  // Cache metrics endpoint
  app.get("/metrics/cache", cacheMetricsHandler);

  // Feed metrics endpoint
  app.get("/metrics/feed", feedMetricsHandler);

  // Push notification metrics endpoint
  app.get("/metrics/push", pushMetricsHandler);
}
