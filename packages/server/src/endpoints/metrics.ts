/**
 * Metrics export endpoint for Prometheus scraping.
 *
 * Provides a /metrics endpoint that exposes metrics in Prometheus text format.
 * This endpoint should be scraped by a Prometheus server or compatible monitoring system.
 */

import type { MiddlewareHandler } from "hono";
import { metrics } from "../observability/metrics.js";

/**
 * Metrics endpoint middleware.
 *
 * Returns metrics in Prometheus text format.
 * Suitable for scraping by Prometheus or other monitoring systems.
 */
export const metricsEndpoint: MiddlewareHandler = async (c) => {
  const prometheusMetrics = metrics.exportPrometheus();

  return c.text(prometheusMetrics, 200, {
    "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
};

/**
 * Create a metrics endpoint with optional authentication.
 *
 * @param options - Endpoint options
 * @returns Hono middleware
 */
export function createMetricsEndpoint(options: {
  /** Require API key authentication (default: false) */
  requireAuth?: boolean;
  /** Allow only from specific IPs (default: undefined) */
  allowedIps?: string[];
}): MiddlewareHandler {
  const { requireAuth = false, allowedIps } = options;

  return async (c, next) => {
    // Check IP whitelist if configured
    if (allowedIps) {
      const clientIp =
        c.req.header("CF-Connecting-IP") ||
        c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ||
        c.req.header("X-Real-IP") ||
        "";

      if (!allowedIps.includes(clientIp)) {
        return c.text("Forbidden", 403);
      }
    }

    // Check authentication if required
    if (requireAuth) {
      const authHeader = c.req.header("Authorization");
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return c.text("Unauthorized", 401);
      }
    }

    await next();
  };
}

/**
 * OpenMetrics format export (Prometheus exposition format 2.0).
 *
 * Provides a more efficient binary format alternative.
 */
export const openMetricsEndpoint: MiddlewareHandler = async (c) => {
  const prometheusMetrics = metrics.exportPrometheus();

  return c.text(prometheusMetrics, 200, {
    "Content-Type": "application/openmetrics-text; version=1.0.0; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
};

/**
 * Metrics endpoint with gzip compression support.
 *
 * Checks Accept-Encoding header and compresses response if client supports gzip.
 */
export const metricsEndpointCompressed: MiddlewareHandler = async (c) => {
  const prometheusMetrics = metrics.exportPrometheus();
  const acceptEncoding = c.req.header("Accept-Encoding") || "";
  const supportsGzip = acceptEncoding.includes("gzip");

  if (supportsGzip && prometheusMetrics.length > 1024) {
    // Only compress for larger payloads
    const zlib = await import("node:zlib");
    const compressed = zlib.gzipSync(Buffer.from(prometheusMetrics));

    return c.body(compressed, 200, {
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
      "Content-Encoding": "gzip",
      "X-Content-Type-Options": "nosniff",
    });
  }

  return c.text(prometheusMetrics, 200, {
    "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
};
