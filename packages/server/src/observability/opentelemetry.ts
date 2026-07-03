/**
 * OpenTelemetry integration for production distributed tracing.
 *
 * Provides OpenTelemetry SDK initialization with OTLP exporters for
 * compatibility with observability backends like Jaeger, Tempo, and
 * cloud providers (AWS X-Ray, Google Cloud Trace, Azure Monitor).
 *
 * Features:
 * - W3C trace context propagation (compatible with existing tracer)
 * - OTLP/HTTP and OTLP/gRPC exporters
 * - Batch span processor for efficient transmission
 * - Resource attributes (service.name, service.version)
 * - Semantic conventions for HTTP, database, and runtime metrics
 * - Environment-based configuration (OTEL_EXPORTER_OTLP_ENDPOINT, etc.)
 * - Graceful degradation when telemetry endpoint unavailable
 *
 * Usage:
 *   import { initOpenTelemetry, shutdownOpenTelemetry } from './opentelemetry.js';
 *   await initOpenTelemetry();
 *   // ... application runs ...
 *   await shutdownOpenTelemetry();
 *
 * Environment variables:
 *   OTEL_SERVICE_NAME: Service name (default: mta-my-way)
 *   OTEL_SERVICE_VERSION: Service version (default: from package.json)
 *   OTEL_EXPORTER_OTLP_ENDPOINT: OTLP endpoint (e.g., http://jaeger:4317)
 *   OTEL_EXPORTER_OTLP_HEADERS: Optional headers (e.g., Authorization=Bearer token)
 *   OTEL_TRACES_SAMPLER: Sampling strategy (default: parentbased_always_on)
 *   OTEL_TRACES_SAMPLER_ARG: Sampler argument (default: 1.0)
 */

import type { DiagLogLevel } from "@opentelemetry/api";
import { DiagConsoleLogger, diag } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { OTLPTraceExporter as OTLPTraceExporterHTTP } from "@opentelemetry/exporter-trace-otlp-proto";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { PinoInstrumentation } from "@opentelemetry/instrumentation-pino";
import { Resource } from "@opentelemetry/resources";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import { logger } from "./logger.js";

let tracerProvider: NodeTracerProvider | null = null;

/**
 * Initialize OpenTelemetry tracing.
 *
 * Reads configuration from environment variables:
 * - OTEL_SERVICE_NAME: Service identifier
 * - OTEL_EXPORTER_OTLP_ENDPOINT: Collector endpoint
 * - OTEL_EXPORTER_OTLP_HEADERS: Request headers
 * - OTEL_TRACES_SAMPLER: Sampling strategy
 * - OTEL_TRACES_SAMPLER_ARG: Sampling rate
 *
 * @returns Promise that resolves when initialization is complete
 */
export async function initOpenTelemetry(): Promise<void> {
  const serviceName = process.env.OTEL_SERVICE_NAME || "mta-my-way";
  const serviceVersion = process.env.OTEL_SERVICE_VERSION || getVersion();
  const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  const otlpHeaders = process.env.OTEL_EXPORTER_OTLP_HEADERS;

  // Enable debug logging if requested
  if (process.env.OTEL_LOG_LEVEL) {
    const logLevel = process.env.OTEL_LOG_LEVEL.toUpperCase() as unknown as DiagLogLevel;
    diag.setLogger(new DiagConsoleLogger(), logLevel);
  }

  // Skip initialization if no endpoint configured
  if (!otlpEndpoint) {
    logger.info("OpenTelemetry: No endpoint configured, tracing disabled");
    return;
  }

  try {
    // Create resource with service attributes
    const resource = Resource.default().merge(
      new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
        [SemanticResourceAttributes.SERVICE_VERSION]: serviceVersion,
        [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || "development",
        "process.pid": process.pid,
        "process.command": process.argv[1],
      })
    );

    // Initialize tracer provider
    tracerProvider = new NodeTracerProvider({ resource });

    // Configure exporter based on protocol (default to gRPC)
    const useHTTP = otlpEndpoint.startsWith("http://") || otlpEndpoint.startsWith("https://");

    let exporter;
    if (useHTTP) {
      exporter = new OTLPTraceExporterHTTP({
        url: otlpEndpoint,
        headers: parseHeaders(otlpHeaders),
      });
    } else {
      exporter = new OTLPTraceExporter({
        url: otlpEndpoint,
        headers: parseHeaders(otlpHeaders),
      });
    }

    // Add batch span processor for efficient transmission
    tracerProvider.addSpanProcessor(
      new BatchSpanProcessor(exporter, {
        maxQueueSize: 2048,
        maxExportBatchSize: 512,
        scheduledDelayMillis: 5000,
        exportTimeoutMillis: 30000,
      })
    );

    // Register the provider globally
    tracerProvider.register();

    // Auto-instrument HTTP and other libraries
    registerInstrumentations({
      instrumentations: [
        new HttpInstrumentation({
          ignoreIncomingRequestHook: (request) => {
            // Skip health check endpoints
            const url = typeof request === "string" ? request : String(request);
            return url.includes("/health") || url.includes("/metrics");
          },
          ignoreOutgoingRequestHook: (request) => {
            // Skip internal requests
            const url = typeof request === "string" ? request : String(request);
            return url.includes("localhost") || url.includes("127.0.0.1");
          },
        }),
        new PinoInstrumentation({
          enabled: true,
        }),
      ],
    });

    logger.info("OpenTelemetry initialized", {
      serviceName,
      serviceVersion,
      otlpEndpoint,
      protocol: useHTTP ? "http" : "grpc",
    });
  } catch (error) {
    logger.error("Failed to initialize OpenTelemetry", error instanceof Error ? error : undefined);
    // Don't throw - allow application to start without telemetry
  }
}

/**
 * Shutdown OpenTelemetry tracer provider.
 *
 * Ensures all pending spans are exported before shutdown.
 * Call this before process exit.
 *
 * @returns Promise that resolves when shutdown is complete
 */
export async function shutdownOpenTelemetry(): Promise<void> {
  if (tracerProvider) {
    try {
      await tracerProvider.shutdown();
      tracerProvider = null;
      logger.info("OpenTelemetry shutdown complete");
    } catch (error) {
      logger.error(
        "Error during OpenTelemetry shutdown",
        error instanceof Error ? error : undefined
      );
    }
  }
}

/**
 * Get service version from package.json.
 */
function getVersion(): string {
  try {
    const packageJson = require("../../../package.json");
    return packageJson.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/**
 * Parse OTLP headers from environment variable.
 *
 * Accepts comma-separated key=value pairs:
 *   Authorization=Bearer token,X-Custom=value
 */
function parseHeaders(headersStr?: string): Record<string, string> {
  const headers: Record<string, string> = {};

  if (!headersStr) {
    return headers;
  }

  for (const pair of headersStr.split(",")) {
    const [key, ...valueParts] = pair.split("=");
    if (key && valueParts.length > 0) {
      headers[key.trim()] = valueParts.join("=").trim();
    }
  }

  return headers;
}

/**
 * Force flush pending spans.
 *
 * Use this before graceful shutdown to ensure all spans are exported.
 *
 * @returns Promise that resolves when flush is complete
 */
export async function flushOpenTelemetry(): Promise<void> {
  if (tracerProvider) {
    try {
      await tracerProvider.forceFlush();
    } catch (error) {
      logger.error(
        "Error flushing OpenTelemetry spans",
        error instanceof Error ? error : undefined
      );
    }
  }
}

/**
 * Check if OpenTelemetry is initialized and active.
 */
export function isOpenTelemetryEnabled(): boolean {
  return tracerProvider !== null;
}
