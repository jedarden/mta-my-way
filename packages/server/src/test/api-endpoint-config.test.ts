/**
 * Tests for API endpoint configuration
 *
 * Validates that:
 * - Base URLs are correctly configured for all environments
 * - Endpoint paths cover all public API routes
 * - Timeout configurations are appropriate
 * - Retry configurations work correctly
 * - Test context creation works properly
 * - Environment-aware configuration functions correctly
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  ALL_ENDPOINTS,
  // Endpoints
  API_ENDPOINTS,
  type ApiTestContext,
  // Categories
  ENDPOINT_CATEGORIES,
  ENDPOINT_PATTERNS,
  // Retry
  RETRY_CONFIG,
  // Timeouts
  TIMEOUTS,
  type TestEnvironment,
  // Utilities
  buildUrl,
  buildUrlWithPathParams,
  buildUrlWithQueryParams,
  calculateRetryDelay,
  createComplexTestContext,
  createHealthTestContext,
  createRealtimeTestContext,
  // Test context
  createTestContext,
  createTestContextForEnvironment,
  // Environment
  currentEnvironment,
  getBaseUrl,
  getBaseUrlForEnvironment,
  getEndpointCategory,
  // Environment config
  getEnvironmentConfig,
  getTimeoutForEndpoint,
  isEnvironment,
  isRetryableError,
  isRetryableStatusCode,
  isTestMode,
  isValidEndpoint,
} from "./api-endpoint-config.js";

describe("API Endpoint Configuration", () => {
  describe("Environment Configuration", () => {
    it("should have current environment set", () => {
      expect(currentEnvironment).toBeDefined();
      expect(["test", "development", "staging", "production"]).toContain(currentEnvironment);
    });

    it("should correctly detect environment", () => {
      expect(isEnvironment(currentEnvironment as TestEnvironment)).toBe(true);
      expect(isEnvironment("production" as TestEnvironment)).toBe(
        currentEnvironment === "production"
      );
    });

    it("should detect test mode correctly", () => {
      expect(isTestMode()).toBe(true);
    });

    it("should provide base URLs for all environments", () => {
      const environments: TestEnvironment[] = ["test", "development", "staging", "production"];

      environments.forEach((env) => {
        const url = getBaseUrlForEnvironment(env);
        expect(url).toBeDefined();
        expect(typeof url).toBe("string");
        expect(url.length).toBeGreaterThan(0);
      });
    });

    it("should return correct base URL for current environment", () => {
      const baseUrl = getBaseUrl();
      expect(baseUrl).toBe(getBaseUrlForEnvironment(currentEnvironment as TestEnvironment));
    });
  });

  describe("Endpoint Paths", () => {
    it("should provide endpoints object with all routes", () => {
      expect(API_ENDPOINTS).toBeDefined();
      expect(Object.keys(API_ENDPOINTS).length).toBeGreaterThan(0);
    });

    it("should include health endpoints", () => {
      expect(API_ENDPOINTS.health).toBe("/health");
      expect(API_ENDPOINTS.status).toBe("/status");
      expect(API_ENDPOINTS.apiHealth).toBe("/api/health");
    });

    it("should include station endpoints", () => {
      expect(API_ENDPOINTS.stations).toBe("/api/stations");
      expect(API_ENDPOINTS.stationSearch).toBe("/api/stations/search");
      expect(API_ENDPOINTS.stationById("123")).toBe("/api/stations/123");
    });

    it("should include real-time endpoints", () => {
      expect(API_ENDPOINTS.arrivals("123")).toBe("/api/arrivals/123");
      expect(API_ENDPOINTS.alerts).toBe("/api/alerts");
      expect(API_ENDPOINTS.alertsByLine("A")).toBe("/api/alerts/A");
    });

    it("should include push notification endpoints", () => {
      expect(API_ENDPOINTS.pushVapidPublicKey).toBe("/api/push/vapid-public-key");
      expect(API_ENDPOINTS.pushSubscribe).toBe("/api/push/subscribe");
      expect(API_ENDPOINTS.pushUnsubscribe).toBe("/api/push/unsubscribe");
    });

    it("should provide all endpoints as array", () => {
      expect(ALL_ENDPOINTS).toBeDefined();
      expect(Array.isArray(ALL_ENDPOINTS)).toBe(true);
      expect(ALL_ENDPOINTS.length).toBeGreaterThan(0);
    });

    it("should provide endpoint patterns", () => {
      expect(ENDPOINT_PATTERNS).toBeDefined();
      expect(Array.isArray(ENDPOINT_PATTERNS)).toBe(true);
      expect(ENDPOINT_PATTERNS).toContain("/api/stations/:id");
      expect(ENDPOINT_PATTERNS).toContain("/api/arrivals/:id");
    });
  });

  describe("Timeout Configuration", () => {
    it("should define all timeout categories", () => {
      expect(TIMEOUTS.default).toBeDefined();
      expect(TIMEOUTS.health).toBeDefined();
      expect(TIMEOUTS.realtime).toBeDefined();
      expect(TIMEOUTS.complex).toBeDefined();
      expect(TIMEOUTS.static).toBeDefined();
      expect(TIMEOUTS.mutation).toBeDefined();
      expect(TIMEOUTS.max).toBeDefined();
    });

    it("should have appropriate timeout values", () => {
      expect(TIMEOUTS.health).toBeLessThan(TIMEOUTS.default);
      expect(TIMEOUTS.realtime).toBeGreaterThan(TIMEOUTS.default);
      expect(TIMEOUTS.complex).toBeGreaterThan(TIMEOUTS.realtime);
      expect(TIMEOUTS.max).toBeGreaterThan(TIMEOUTS.complex);
    });

    it("should return correct timeout for health endpoints", () => {
      expect(getTimeoutForEndpoint("/health")).toBe(TIMEOUTS.health);
      expect(getTimeoutForEndpoint("/status")).toBe(TIMEOUTS.health);
      expect(getTimeoutForEndpoint("/api/health")).toBe(TIMEOUTS.health);
    });

    it("should return correct timeout for realtime endpoints", () => {
      expect(getTimeoutForEndpoint("/api/arrivals/123")).toBe(TIMEOUTS.realtime);
      expect(getTimeoutForEndpoint("/api/positions/A")).toBe(TIMEOUTS.realtime);
    });

    it("should return correct timeout for static endpoints", () => {
      expect(getTimeoutForEndpoint("/api/stations")).toBe(TIMEOUTS.static);
      expect(getTimeoutForEndpoint("/api/routes")).toBe(TIMEOUTS.static);
    });

    it("should return correct timeout for complex endpoints", () => {
      expect(getTimeoutForEndpoint("/api/commute/analyze")).toBe(TIMEOUTS.complex);
    });

    it("should return default timeout for unknown endpoints", () => {
      expect(getTimeoutForEndpoint("/unknown/endpoint")).toBe(TIMEOUTS.default);
    });
  });

  describe("Retry Configuration", () => {
    it("should have retry configuration defined", () => {
      expect(RETRY_CONFIG.maxRetries).toBeDefined();
      expect(RETRY_CONFIG.initialDelay).toBeDefined();
      expect(RETRY_CONFIG.backoffMultiplier).toBeDefined();
      expect(RETRY_CONFIG.maxDelay).toBeDefined();
      expect(RETRY_CONFIG.retryableStatusCodes).toBeDefined();
      expect(RETRY_CONFIG.retryableErrors).toBeDefined();
    });

    it("should calculate retry delays with exponential backoff", () => {
      const delay1 = calculateRetryDelay(0);
      const delay2 = calculateRetryDelay(1);
      const delay3 = calculateRetryDelay(2);

      expect(delay1).toBe(RETRY_CONFIG.initialDelay);
      expect(delay2).toBe(RETRY_CONFIG.initialDelay * RETRY_CONFIG.backoffMultiplier);
      expect(delay3).toBe(RETRY_CONFIG.initialDelay * Math.pow(RETRY_CONFIG.backoffMultiplier, 2));
    });

    it("should cap retry delays at max delay", () => {
      const delay10 = calculateRetryDelay(10);
      expect(delay10).toBeLessThanOrEqual(RETRY_CONFIG.maxDelay);
    });

    it("should identify retryable status codes", () => {
      expect(isRetryableStatusCode(408)).toBe(true);
      expect(isRetryableStatusCode(429)).toBe(true);
      expect(isRetryableStatusCode(500)).toBe(true);
      expect(isRetryableStatusCode(502)).toBe(true);
      expect(isRetryableStatusCode(503)).toBe(true);
      expect(isRetryableStatusCode(504)).toBe(true);
      expect(isRetryableStatusCode(404)).toBe(false);
      expect(isRetryableStatusCode(400)).toBe(false);
    });

    it("should identify retryable errors", () => {
      expect(isRetryableError("ECONNRESET")).toBe(true);
      expect(isRetryableError("ECONNREFUSED")).toBe(true);
      expect(isRetryableError("ETIMEDOUT")).toBe(true);
      expect(isRetryableError("ENOTFOUND")).toBe(true);
      expect(isRetryableError("EAI_AGAIN")).toBe(true);
      expect(isRetryableError("ENOSPC")).toBe(false);
    });
  });

  describe("Test Context Creation", () => {
    it("should create default test context", () => {
      const context = createTestContext();

      expect(context.baseUrl).toBeDefined();
      expect(context.environment).toBeDefined();
      expect(context.timeout).toBeDefined();
      expect(context.retry).toBeDefined();
      expect(context.validateSchema).toBe(true);
    });

    it("should allow overriding default context values", () => {
      const customTimeout = 15000;
      const context = createTestContext({ timeout: customTimeout });

      expect(context.timeout).toBe(customTimeout);
    });

    it("should create context for specific environment", () => {
      const testContext = createTestContextForEnvironment("test");
      const prodContext = createTestContextForEnvironment("production");

      expect(testContext.environment).toBe("test");
      expect(testContext.baseUrl).toBe(getBaseUrlForEnvironment("test"));

      expect(prodContext.environment).toBe("production");
      expect(prodContext.baseUrl).toBe(getBaseUrlForEnvironment("production"));
    });

    it("should create health test context with fast timeout", () => {
      const context = createHealthTestContext();

      expect(context.timeout).toBe(TIMEOUTS.health);
    });

    it("should create realtime test context with longer timeout", () => {
      const context = createRealtimeTestContext();

      expect(context.timeout).toBe(TIMEOUTS.realtime);
    });

    it("should create complex test context with longest timeout", () => {
      const context = createComplexTestContext();

      expect(context.timeout).toBe(TIMEOUTS.complex);
    });

    it("should allow adding authentication to context", () => {
      const context = createTestContext({
        auth: {
          apiKey: "test-key",
          token: "test-token",
        },
      });

      expect(context.auth).toBeDefined();
      expect(context.auth?.apiKey).toBe("test-key");
      expect(context.auth?.token).toBe("test-token");
    });
  });

  describe("Environment-Aware Configuration", () => {
    it("should provide environment-specific configuration", () => {
      const testConfig = getEnvironmentConfig("test");
      const prodConfig = getEnvironmentConfig("production");

      expect(testConfig.environment).toBe("test");
      expect(prodConfig.environment).toBe("production");

      expect(testConfig.baseUrl).toBeDefined();
      expect(prodConfig.baseUrl).toBeDefined();

      expect(testConfig.debug).toBe(true);
      expect(prodConfig.debug).toBe(false);
    });

    it("should have fewer retries in production", () => {
      const testConfig = getEnvironmentConfig("test");
      const prodConfig = getEnvironmentConfig("production");

      expect(prodConfig.retry.maxRetries).toBeLessThanOrEqual(testConfig.retry.maxRetries);
    });
  });

  describe("Endpoint Categories", () => {
    it("should categorize health endpoints", () => {
      expect(getEndpointCategory("/health")).toBe("health");
      expect(getEndpointCategory("/status")).toBe("health");
      expect(getEndpointCategory("/api/health")).toBe("health");
    });

    it("should categorize static endpoints", () => {
      expect(getEndpointCategory("/api/stations")).toBe("static");
      expect(getEndpointCategory("/api/routes")).toBe("static");
    });

    it("should categorize realtime endpoints", () => {
      expect(getEndpointCategory("/api/arrivals/123")).toBe("realtime");
      expect(getEndpointCategory("/api/alerts")).toBe("realtime");
    });

    it("should categorize complex endpoints", () => {
      expect(getEndpointCategory("/api/commute/analyze")).toBe("complex");
      expect(getEndpointCategory("/api/trip/abc123")).toBe("complex");
    });

    it("should categorize mutation endpoints", () => {
      expect(getEndpointCategory("/api/push/subscribe")).toBe("mutation");
      expect(getEndpointCategory("/api/push/unsubscribe")).toBe("mutation");
    });

    it("should categorize unknown endpoints as 'other'", () => {
      expect(getEndpointCategory("/unknown/endpoint")).toBe("other");
    });
  });

  describe("URL Building Utilities", () => {
    it("should build full URL for endpoint", () => {
      const url = buildUrl("/api/stations");
      expect(url).toBe(`${getBaseUrl()}/api/stations`);
    });

    it("should build URL with custom base URL", () => {
      const customBase = "https://api.example.com";
      const url = buildUrl("/api/stations", customBase);
      expect(url).toBe(`${customBase}/api/stations`);
    });

    it("should build URL with path parameters", () => {
      const url = buildUrlWithPathParams("/api/stations/:id", { id: "123" });
      expect(url).toBe(`${getBaseUrl()}/api/stations/123`);
    });

    it("should build URL with multiple path parameters", () => {
      const url = buildUrlWithPathParams("/api/:version/stations/:id", {
        version: "v1",
        id: "456",
      });
      expect(url).toBe(`${getBaseUrl()}/api/v1/stations/456`);
    });

    it("should build URL with query parameters", () => {
      const url = buildUrlWithQueryParams("/api/stations/search", {
        query: "penn",
        limit: 10,
      });
      expect(url).toContain("/api/stations/search");
      expect(url).toContain("query=penn");
      expect(url).toContain("limit=10");
    });

    it("should validate known endpoints", () => {
      expect(isValidEndpoint("/api/stations")).toBe(true);
      expect(isValidEndpoint("/api/arrivals/123")).toBe(true);
      expect(isValidEndpoint("/health")).toBe(true);
    });

    it("should reject unknown endpoints", () => {
      expect(isValidEndpoint("/unknown/endpoint")).toBe(false);
      expect(isValidEndpoint("/api/bad/path")).toBe(false);
    });
  });

  describe("Configuration Validation", () => {
    it("should have all required configuration sections", () => {
      // Environment
      expect(currentEnvironment).toBeDefined();

      // Endpoints
      expect(API_ENDPOINTS).toBeDefined();
      expect(ALL_ENDPOINTS).toBeDefined();
      expect(ENDPOINT_PATTERNS).toBeDefined();

      // Timeouts
      expect(TIMEOUTS).toBeDefined();
      expect(getTimeoutForEndpoint).toBeDefined();

      // Retry
      expect(RETRY_CONFIG).toBeDefined();

      // Test context
      expect(createTestContext).toBeDefined();
    });

    it("should have consistent base URLs", () => {
      const baseUrl = getBaseUrl();
      const context = createTestContext();

      expect(context.baseUrl).toBe(baseUrl);
    });

    it("should handle all environment types", () => {
      const environments: TestEnvironment[] = ["test", "development", "staging", "production"];

      environments.forEach((env) => {
        expect(() => getBaseUrlForEnvironment(env)).not.toThrow();
        expect(() => getEnvironmentConfig(env)).not.toThrow();
        expect(() => createTestContextForEnvironment(env)).not.toThrow();
      });
    });
  });
});
