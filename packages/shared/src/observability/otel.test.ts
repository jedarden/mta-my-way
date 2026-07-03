/**
 * Unit tests for OpenTelemetry configuration.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_BATCH_SPAN_PROCESSOR,
  RESOURCE_ATTRIBUTES,
  SpanStatusCode,
  detectOtlpProtocol,
  isOtelDisabled,
  parseHeaders,
  resolveOtelConfig,
} from "./otel.js";
import type { OtelConfig } from "./otel.js";

describe("otel", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // =========================================================================
  // Re-exports
  // =========================================================================

  describe("re-exports", () => {
    it("exports SpanStatusCode", () => {
      expect(SpanStatusCode).toBeDefined();
      expect(SpanStatusCode.ERROR).toBe(2);
      expect(SpanStatusCode.OK).toBe(1);
      expect(SpanStatusCode.UNSET).toBe(0);
    });
  });

  // =========================================================================
  // resolveOtelConfig
  // =========================================================================

  describe("resolveOtelConfig", () => {
    it("returns defaults when no env vars or overrides are set", () => {
      delete process.env.OTEL_SERVICE_NAME;
      delete process.env.OTEL_SERVICE_VERSION;
      delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
      delete process.env.OTEL_TRACES_SAMPLER;
      delete process.env.OTEL_TRACES_SAMPLER_ARG;
      delete process.env.NODE_ENV;
      delete process.env.OTEL_EXPORTER_OTLP_HEADERS;

      const config = resolveOtelConfig();

      expect(config.serviceName).toBe("mta-my-way");
      expect(config.serviceVersion).toBe("0.0.0");
      expect(config.otlpEndpoint).toBeUndefined();
      expect(config.otlpHeaders).toEqual({});
      expect(config.tracesSampler).toBe("parentbased_always_on");
      expect(config.tracesSamplerArg).toBe(1);
      expect(config.environment).toBe("development");
      expect(config.enabled).toBe(false);
    });

    it("reads env vars", () => {
      process.env.OTEL_SERVICE_NAME = "api-server";
      process.env.OTEL_SERVICE_VERSION = "1.2.3";
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://jaeger:4318";
      process.env.OTEL_TRACES_SAMPLER = "always_on";
      process.env.OTEL_TRACES_SAMPLER_ARG = "0.5";
      process.env.NODE_ENV = "production";

      const config = resolveOtelConfig();

      expect(config.serviceName).toBe("api-server");
      expect(config.serviceVersion).toBe("1.2.3");
      expect(config.otlpEndpoint).toBe("http://jaeger:4318");
      expect(config.tracesSampler).toBe("always_on");
      expect(config.tracesSamplerArg).toBe(0.5);
      expect(config.environment).toBe("production");
      expect(config.enabled).toBe(true);
    });

    it("overrides take precedence over env vars", () => {
      process.env.OTEL_SERVICE_NAME = "env-service";
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://env:4318";

      const config = resolveOtelConfig({
        serviceName: "override-service",
        otlpEndpoint: "http://override:4318",
      });

      expect(config.serviceName).toBe("override-service");
      expect(config.otlpEndpoint).toBe("http://override:4318");
    });

    it("enabled is true only when endpoint is set", () => {
      const withEndpoint = resolveOtelConfig({ otlpEndpoint: "http://jaeger:4317" });
      expect(withEndpoint.enabled).toBe(true);

      const withoutEndpoint = resolveOtelConfig({});
      expect(withoutEndpoint.enabled).toBe(false);
    });

    it("parses sampler arg as float", () => {
      process.env.OTEL_TRACES_SAMPLER_ARG = "0.75";
      const config = resolveOtelConfig();
      expect(config.tracesSamplerArg).toBe(0.75);
    });

    it("defaults sampler arg to 1 when env var is non-numeric", () => {
      process.env.OTEL_TRACES_SAMPLER_ARG = "not-a-number";
      const config = resolveOtelConfig();
      // parseFloat returns NaN for non-numeric, ?? falls back to 1
      expect(config.tracesSamplerArg).toBe(1);
    });

    it("uses explicit headers over env headers", () => {
      process.env.OTEL_EXPORTER_OTLP_HEADERS = "X-Env=yes";

      const config = resolveOtelConfig({
        otlpHeaders: { Authorization: "Bearer token" },
      });

      expect(config.otlpHeaders).toEqual({ Authorization: "Bearer token" });
    });
  });

  // =========================================================================
  // parseHeaders
  // =========================================================================

  describe("parseHeaders", () => {
    it("parses single header", () => {
      const result = parseHeaders("Authorization=Bearer token123");
      expect(result).toEqual({ Authorization: "Bearer token123" });
    });

    it("parses multiple headers separated by comma", () => {
      const result = parseHeaders("Authorization=Bearer tok,X-Custom=value");
      expect(result).toEqual({ Authorization: "Bearer tok", "X-Custom": "value" });
    });

    it("handles header value with equals sign", () => {
      const result = parseHeaders("Authorization=Bearer token=abc123");
      expect(result).toEqual({ Authorization: "Bearer token=abc123" });
    });

    it("trims whitespace from keys and values", () => {
      const result = parseHeaders("  Key  =  value  ");
      expect(result).toEqual({ Key: "value" });
    });

    it("returns empty object for undefined input", () => {
      expect(parseHeaders(undefined)).toEqual({});
    });

    it("returns empty object for empty string", () => {
      expect(parseHeaders("")).toEqual({});
    });

    it("skips malformed pairs (no value)", () => {
      const result = parseHeaders("GoodHeader=yes,BadHeader");
      expect(result).toEqual({ GoodHeader: "yes" });
    });
  });

  // =========================================================================
  // detectOtlpProtocol
  // =========================================================================

  describe("detectOtlpProtocol", () => {
    it("detects http/protobuf for http:// URLs", () => {
      expect(detectOtlpProtocol("http://jaeger:4318")).toBe("http/protobuf");
    });

    it("detects http/protobuf for https:// URLs", () => {
      expect(detectOtlpProtocol("https://jaeger:4318")).toBe("http/protobuf");
    });

    it("detects grpc for non-HTTP URLs", () => {
      expect(detectOtlpProtocol("jaeger:4317")).toBe("grpc");
    });

    it("detects grpc for localhost:port", () => {
      expect(detectOtlpProtocol("localhost:4317")).toBe("grpc");
    });
  });

  // =========================================================================
  // isOtelDisabled
  // =========================================================================

  describe("isOtelDisabled", () => {
    it("returns true when no endpoint env var is set", () => {
      delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
      expect(isOtelDisabled()).toBe(true);
    });

    it("returns false when endpoint env var is set", () => {
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://jaeger:4317";
      expect(isOtelDisabled()).toBe(false);
    });

    it("uses resolved config when provided", () => {
      expect(
        isOtelDisabled({
          enabled: false,
          serviceName: "",
          serviceVersion: "0.0.0",
          otlpEndpoint: undefined,
          otlpHeaders: {},
          tracesSampler: "",
          tracesSamplerArg: 1,
          environment: "",
        })
      ).toBe(true);
      expect(
        isOtelDisabled({
          enabled: true,
          serviceName: "",
          serviceVersion: "0.0.0",
          otlpEndpoint: "http://x",
          otlpHeaders: {},
          tracesSampler: "",
          tracesSamplerArg: 1,
          environment: "",
        })
      ).toBe(false);
    });
  });

  // =========================================================================
  // Constants
  // =========================================================================

  describe("constants", () => {
    it("DEFAULT_BATCH_SPAN_PROCESSOR has expected values", () => {
      expect(DEFAULT_BATCH_SPAN_PROCESSOR.maxQueueSize).toBe(2048);
      expect(DEFAULT_BATCH_SPAN_PROCESSOR.maxExportBatchSize).toBe(512);
      expect(DEFAULT_BATCH_SPAN_PROCESSOR.scheduledDelayMillis).toBe(5000);
      expect(DEFAULT_BATCH_SPAN_PROCESSOR.exportTimeoutMillis).toBe(30_000);
    });

    it("RESOURCE_ATTRIBUTES has standard keys", () => {
      expect(RESOURCE_ATTRIBUTES.SERVICE_NAME).toBe("service.name");
      expect(RESOURCE_ATTRIBUTES.SERVICE_VERSION).toBe("service.version");
      expect(RESOURCE_ATTRIBUTES.DEPLOYMENT_ENVIRONMENT).toBe("deployment.environment");
      expect(RESOURCE_ATTRIBUTES.PROCESS_PID).toBe("process.pid");
      expect(RESOURCE_ATTRIBUTES.PROCESS_COMMAND).toBe("process.command");
    });
  });
});
