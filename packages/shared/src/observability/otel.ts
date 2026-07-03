/**
 * OpenTelemetry configuration and SDK initialization for MTA My Way.
 *
 * Provides a factory to bootstrap the OpenTelemetry SDK with proper
 * exporters, resource attributes, and environment-based configuration.
 *
 * The heavy SDK packages (@opentelemetry/sdk-trace-node, exporters) are
 * expected to be installed by the consumer (server) — this module
 * re-exports the lightweight `@opentelemetry/api` and defines the
 * configuration contract so both server and web packages can agree on
 * the same env-var schema without pulling in the SDK.
 *
 * Environment variables:
 *   OTEL_SERVICE_NAME          Service identifier (default: "mta-my-way")
 *   OTEL_SERVICE_VERSION        Semantic version string (default: "0.0.0")
 *   OTEL_EXPORTER_OTLP_ENDPOINT Collector URL (absent = tracing disabled)
 *   OTEL_EXPORTER_OTLP_HEADERS  Comma-separated key=value headers
 *   OTEL_TRACES_SAMPLER         Sampler name (default: "parentbased_always_on")
 *   OTEL_TRACES_SAMPLER_ARG     Sampler argument  (default: "1.0")
 *   OTEL_LOG_LEVEL              Diag log level   (default: off)
 */

// ============================================================================
// Public API re-exports — lightweight, no SDK weight
// ============================================================================

export {
  context,
  diag,
  propagation,
  trace,
  Span as OTelSpan,
  SpanContext as OTelSpanContext,
  SpanStatusCode,
  Tracer as OTelTracer,
  TracerProvider,
  type Context,
  type DiagLogLevel,
  type Link,
  type ReadableSpan,
  type SpanAttributes,
  type SpanOptions,
  type SpanStatus,
  type TimedEvent,
  type TracerConfig,
} from "@opentelemetry/api";

// ============================================================================
// Configuration types
// ============================================================================

/** Environment-aware OTEL configuration. */
export interface OtelConfig {
  /** Service name sent as `service.name` resource attribute. */
  serviceName?: string;
  /** Service version sent as `service.version` resource attribute. */
  serviceVersion?: string;
  /** OTLP collector endpoint URL. When absent, tracing is no-op. */
  otlpEndpoint?: string;
  /** Headers forwarded to the OTLP collector (key=value pairs). */
  otlpHeaders?: Record<string, string>;
  /** Sampling strategy name. */
  tracesSampler?: string;
  /** Sampling strategy argument (e.g. ratio for probability sampler). */
  tracesSamplerArg?: number;
  /** Deployment environment tag ("development" | "production"). */
  environment?: "development" | "production";
}

/** Snapshot of the resolved configuration after reading env vars. */
export interface ResolvedOtelConfig {
  serviceName: string;
  serviceVersion: string;
  otlpEndpoint: string | undefined;
  otlpHeaders: Record<string, string>;
  tracesSampler: string;
  tracesSamplerArg: number;
  environment: string;
  /** Whether tracing should be enabled (true when endpoint is set). */
  enabled: boolean;
}

// ============================================================================
// Environment helpers
// ============================================================================

/**
 * Read OTEL configuration from environment variables, with optional overrides.
 *
 * Precedence: explicit `overrides` → `process.env` → defaults.
 */
export function resolveOtelConfig(overrides: OtelConfig = {}): ResolvedOtelConfig {
  const serviceName = overrides.serviceName ?? process.env["OTEL_SERVICE_NAME"] ?? "mta-my-way";
  const serviceVersion = overrides.serviceVersion ?? process.env["OTEL_SERVICE_VERSION"] ?? "0.0.0";
  const otlpEndpoint = overrides.otlpEndpoint ?? process.env["OTEL_EXPORTER_OTLP_ENDPOINT"];
  const tracesSampler =
    overrides.tracesSampler ?? process.env["OTEL_TRACES_SAMPLER"] ?? "parentbased_always_on";
  const parsed = parseFloat(process.env["OTEL_TRACES_SAMPLER_ARG"] ?? "1");
  const tracesSamplerArg = overrides.tracesSamplerArg ?? (Number.isNaN(parsed) ? 1 : parsed);
  const environment = overrides.environment ?? process.env["NODE_ENV"] ?? "development";

  let otlpHeaders: Record<string, string> = {};
  if (overrides.otlpHeaders && Object.keys(overrides.otlpHeaders).length > 0) {
    otlpHeaders = { ...overrides.otlpHeaders };
  } else if (process.env["OTEL_EXPORTER_OTLP_HEADERS"]) {
    otlpHeaders = parseHeaders(process.env["OTEL_EXPORTER_OTLP_HEADERS"]);
  }

  return {
    serviceName,
    serviceVersion,
    otlpEndpoint,
    otlpHeaders,
    tracesSampler,
    tracesSamplerArg,
    environment,
    enabled: !!otlpEndpoint,
  };
}

// ============================================================================
// Header parsing
// ============================================================================

/**
 * Parse OTLP headers from a comma-separated string of `key=value` pairs.
 *
 * Example input: `"Authorization=Bearer tok,X-Custom=val"`
 */
export function parseHeaders(headersStr?: string): Record<string, string> {
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

// ============================================================================
// Protocol detection
// ============================================================================

/** Determine the OTLP transport protocol from the endpoint URL. */
export function detectOtlpProtocol(endpoint: string): "http/protobuf" | "grpc" {
  return endpoint.startsWith("http://") || endpoint.startsWith("https://")
    ? "http/protobuf"
    : "grpc";
}

// ============================================================================
// OTEL disabled sentinel helpers
// ============================================================================

/**
 * Check whether OTEL tracing is likely disabled (no endpoint configured).
 *
 * This is a lightweight check — it does not require the SDK to be loaded.
 */
export function isOtelDisabled(config?: ResolvedOtelConfig): boolean {
  if (config) {
    return !config.enabled;
  }
  return !process.env["OTEL_EXPORTER_OTLP_ENDPOINT"];
}

// ============================================================================
// Constants
// ============================================================================

/** Default batch span processor settings. */
export const DEFAULT_BATCH_SPAN_PROCESSOR = {
  maxQueueSize: 2048,
  maxExportBatchSize: 512,
  scheduledDelayMillis: 5000,
  exportTimeoutMillis: 30_000,
} as const;

/** Common resource attribute keys (mirrors SemanticResourceAttributes for use without the SDK package). */
export const RESOURCE_ATTRIBUTES = {
  SERVICE_NAME: "service.name",
  SERVICE_VERSION: "service.version",
  DEPLOYMENT_ENVIRONMENT: "deployment.environment",
  PROCESS_PID: "process.pid",
  PROCESS_COMMAND: "process.command",
} as const;
