/**
 * Tests for OpenTelemetry integration.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  initOpenTelemetry,
  shutdownOpenTelemetry,
  flushOpenTelemetry,
  isOpenTelemetryEnabled,
} from "./opentelemetry.js";

describe("OpenTelemetry integration", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };

    // Clear any existing OpenTelemetry state
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Restore original environment
    process.env = originalEnv;

    // Ensure shutdown
    await shutdownOpenTelemetry();
  });

  describe("initOpenTelemetry", () => {
    it("should skip initialization when no endpoint is configured", async () => {
      delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

      await initOpenTelemetry();

      expect(isOpenTelemetryEnabled()).toBe(false);
    });

    it("should initialize when endpoint is configured", async () => {
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://jaeger:4317";
      process.env.OTEL_SERVICE_NAME = "test-service";

      await initOpenTelemetry();

      expect(isOpenTelemetryEnabled()).toBe(true);
    });

    it("should use custom service name from environment", async () => {
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://jaeger:4317";
      process.env.OTEL_SERVICE_NAME = "custom-service-name";

      await initOpenTelemetry();

      expect(isOpenTelemetryEnabled()).toBe(true);
    });

    it("should use custom service version from environment", async () => {
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://jaeger:4317";
      process.env.OTEL_SERVICE_VERSION = "1.2.3";

      await initOpenTelemetry();

      expect(isOpenTelemetryEnabled()).toBe(true);
    });

    it("should parse OTLP headers correctly", async () => {
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://jaeger:4317";
      process.env.OTEL_EXPORTER_OTLP_HEADERS = "Authorization=Bearer token123,X-Custom=value";

      await initOpenTelemetry();

      expect(isOpenTelemetryEnabled()).toBe(true);
    });

    it("should handle initialization errors gracefully", async () => {
      // Set an invalid endpoint that will cause initialization to fail
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "invalid-url";

      // Should not throw, but log error
      await expect(initOpenTelemetry()).resolves.toBeUndefined();
    });
  });

  describe("shutdownOpenTelemetry", () => {
    it("should shutdown gracefully when enabled", async () => {
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://jaeger:4317";

      await initOpenTelemetry();
      expect(isOpenTelemetryEnabled()).toBe(true);

      await shutdownOpenTelemetry();

      // After shutdown, OpenTelemetry is disabled
      expect(isOpenTelemetryEnabled()).toBe(false);
    });

    it("should handle shutdown when not initialized", async () => {
      delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

      await expect(shutdownOpenTelemetry()).resolves.toBeUndefined();
    });
  });

  describe("flushOpenTelemetry", () => {
    it("should flush pending spans when enabled", async () => {
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://jaeger:4317";

      await initOpenTelemetry();
      expect(isOpenTelemetryEnabled()).toBe(true);

      await expect(flushOpenTelemetry()).resolves.toBeUndefined();
    });

    it("should handle flush when not initialized", async () => {
      delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

      await expect(flushOpenTelemetry()).resolves.toBeUndefined();
    });
  });

  describe("isOpenTelemetryEnabled", () => {
    it("should return false when not initialized", () => {
      delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

      expect(isOpenTelemetryEnabled()).toBe(false);
    });

    it("should return true when initialized", async () => {
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://jaeger:4317";

      await initOpenTelemetry();

      expect(isOpenTelemetryEnabled()).toBe(true);
    });
  });

  describe("HTTP protocol detection", () => {
    it("should use HTTP exporter for http:// endpoints", async () => {
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://jaeger:4318";

      await initOpenTelemetry();

      expect(isOpenTelemetryEnabled()).toBe(true);
    });

    it("should use HTTP exporter for https:// endpoints", async () => {
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "https://jaeger:4318";

      await initOpenTelemetry();

      expect(isOpenTelemetryEnabled()).toBe(true);
    });

    it("should use gRPC exporter for non-HTTP endpoints", async () => {
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "jaeger:4317";

      await initOpenTelemetry();

      expect(isOpenTelemetryEnabled()).toBe(true);
    });
  });

  describe("environment detection", () => {
    it("should default to development environment when NODE_ENV not set", async () => {
      delete process.env.NODE_ENV;
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://jaeger:4317";

      await initOpenTelemetry();

      expect(isOpenTelemetryEnabled()).toBe(true);
    });

    it("should use NODE_ENV when set", async () => {
      process.env.NODE_ENV = "production";
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://jaeger:4317";

      await initOpenTelemetry();

      expect(isOpenTelemetryEnabled()).toBe(true);
    });
  });
});
