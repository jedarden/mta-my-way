/**
 * Server test helpers, grouped by concern below.
 *
 * Import from this barrel for HTTP, database, security, observability, rate
 * limiter, and endpoint configuration helpers. See [README.md](./README.md)
 * for test setup, fixture selection, cleanup, and runnable examples.
 *
 * @example API response assertions
 * ```ts
 * import { Hono } from "hono";
 * import { expectSuccessResponse } from "./index.js";
 *
 * const app = new Hono();
 * app.get("/health", (c) => c.json({ status: "ok" }));
 * const response = await app.request("/health");
 * const body = await expectSuccessResponse<{ status: string }>(response);
 * expect(body.status).toBe("ok");
 * ```
 *
 * @example Isolated database
 * ```ts
 * import { createInMemoryDatabase, getRowCount, seedTestData } from "./index.js";
 *
 * const db = createInMemoryDatabase();
 * try {
 *   db.exec("CREATE TABLE stations (id TEXT PRIMARY KEY)");
 *   seedTestData(db, { stations: [{ id: "101" }] });
 *   expect(getRowCount(db, "stations")).toBe(1);
 * } finally {
 *   db.close();
 * }
 * ```
 */

// ============================================================================
// Observability
// ============================================================================
export {
  /** Mock logger for testing. */
  MockLogger,
  /** Mock tracer for testing. */
  MockTracer,
  /** Mock metrics registry for testing. */
  MockMetricsRegistry,
  /** Create a mock span for testing. */
  createMockSpan,
  /** Assert that a metric was incremented. */
  assertMetricIncremented,
  /** Assert that a span was created with specific attributes. */
  assertSpanCreated,
  /** Assert that a log entry was created. */
  assertLogged,
  /** Wait for an async assertion to pass. */
  waitForAssertion,
} from "./observability.js";

// ============================================================================
// Security
// ============================================================================
export {
  /** Create a mock Hono context for testing. */
  createMockContext,
  /** Security test scenarios for common vulnerabilities. */
  securityTestScenarios,
  /** Assert that a response has security headers. */
  assertSecurityHeaders,
  /** Assert that CSP is configured correctly. */
  assertCspHeaders,
  /** Assert that sensitive data is not leaked in response. */
  assertNoSensitiveDataLeak,
  /** Test input sanitization for XSS. */
  testXssSanitization,
  /** Test SQL injection protection. */
  testSqlInjectionProtection,
  /** Test path traversal protection. */
  testPathTraversalProtection,
  /** Create a mock rate limiter for testing. */
  MockRateLimiter,
  /** Assert rate limiting behavior. */
  assertRateLimit,
  /** Create a mock authentication context for testing. */
  createMockAuthContext,
} from "./security.js";

// ============================================================================
// Database
// ============================================================================
export {
  /** Create an in-memory database for testing. */
  createInMemoryDatabase,
  /** Create a file-based test database in a temporary directory. */
  createTestDatabase,
  /** Seed test data into a database. */
  seedTestData,
  /** Clear test data from a database. */
  clearTestData,
  /** Assert table exists in database. */
  assertTableExists,
  /** Assert column exists in table. */
  assertColumnExists,
  /** Assert row count in table. */
  assertRowCount,
  /** Get row count for a table. */
  getRowCount,
  /** Assert value exists in table. */
  assertValueExists,
  /** Get all rows from a table. */
  getAllRows,
  /** Run migrations on test database. */
  runMigrations,
  /** Create a fresh test database with migrations applied. */
  createFreshTestDatabase,
} from "./database.js";

// ============================================================================
// HTTP
// ============================================================================
export {
  /** Create a mock HTTP request. */
  createMockRequest,
  /** Create a mock HTTP response. */
  createMockResponse,
  /** Assert response status code. */
  assertResponseStatus,
  /** Assert response header value. */
  assertResponseHeader,
  /** Assert response body contains text. */
  assertResponseBody,
  /** Parse JSON response body. */
  parseJsonBody,
  /** Assert JSON response body. */
  assertJsonBody,
  /** Assert response is a redirect. */
  assertRedirect,
  /** Assert content type header. */
  assertContentType,
  /** Create a fetch mock for testing. */
  createFetchMock,
  /** Assert that fetch was called with specific options. */
  assertFetchCalled,
} from "./http.js";

// ============================================================================
// API Response Helpers
// ============================================================================
export {
  // Response Status Assertion Helpers
  /** Assert response has successful status (2xx). */
  assertSuccessStatus,
  /** Assert response has specific status code. */
  assertStatus,
  /** Assert response has client error status (4xx). */
  assertClientErrorStatus,
  /** Assert response has server error status (5xx). */
  assertServerErrorStatus,
  /** Assert response is one of allowed status codes. */
  assertStatusInRange,
  /** Assert response is not found (404). */
  assertNotFound,
  /** Assert response is bad request (400). */
  assertBadRequest,
  // Response Structure/Data Type Validators
  /** Parse JSON response body safely. */
  parseJson,
  /** Assert response is valid JSON. */
  assertJsonResponse,
  /** Assert response body is an array. */
  assertArrayResponse,
  /** Assert response body is an object. */
  assertObjectResponse,
  /** Assert object has required properties. */
  assertHasProperties,
  /** Assert property has specific type. */
  assertPropertyType,
  /** Assert all items in array have required properties. */
  assertArrayItemsHaveProperties,
  /** Assert string is non-empty. */
  assertNonEmptyString,
  /** Assert number is within valid range. */
  assertNumberInRange,
  /** Assert array is non-empty. */
  assertNonEmptyArray,
  // Common Test Patterns
  /** Test successful API response pattern. */
  expectSuccessResponse,
  /** Test error response pattern. */
  expectErrorResponse,
  /** Test paginated response pattern. */
  expectPaginatedResponse,
  /** Test health endpoint response pattern. */
  expectHealthResponse,
  // Logging/Debugging Helpers
  /** Log request/response details for debugging. */
  logApiResponse,
  /** Log test suite section headers. */
  logTestSection,
  /** Create a debug logger for a specific test context. */
  createDebugLogger,
  // Performance Assertion Helpers
  /** Assert operation completed within maximum time. */
  assertPerformance,
  /** Measure execution time of an async function. */
  measurePerformance,
  /** Create a performance test helper that measures and validates execution time. */
  createPerformanceTester,
  // Endpoint-Specific Validation Helpers
  /** Validate station response structure. */
  validateStationStructure,
  /** Validate route response structure. */
  validateRouteStructure,
  /** Validate alert response structure. */
  validateAlertStructure,
  /** Validate arrival response structure. */
  validateArrivalStructure,
  /** Validate transfer connection structure. */
  validateTransferStructure,
  // Batch Test Helpers
  /** Run assertions against multiple endpoints. */
  runEndpointTests,
  /** Create a test suite builder for consistent endpoint testing. */
  createEndpointTestSuite,
} from "./api-response-helpers.js";

// ============================================================================
// Rate Limiter Harness
// ============================================================================
export {
  /** Shared Hono variables set by the mock auth middleware. */
  type AuthVars,
  /** First test IP — used as the primary identity in most tests. */
  IP_A,
  /** Second test IP — used to verify per-IP isolation. */
  IP_B,
  /** Middleware that simulates optional auth parsing. */
  mockOptionalAuth,
  /** Middleware that blocks POST/PUT/DELETE/PATCH without X-CSRF-Token. */
  mockCsrfProtection,
  /** Record downstream response status codes for middleware order tests. */
  createStatusRecorder,
  /** Standard middleware chain: requestId → rateLimiter → securityHeaders → securityLogging. */
  createStandardChainApp,
  /** Reversed order: rateLimiter BEFORE requestId. */
  createReversedOrderApp,
  /** Auth before rate limiter: requestId → securityHeaders → optionalAuth → rateLimiter. */
  createAuthBeforeRateLimitApp,
  /** Full auth + CSRF + rate limiter chain (production-like order). */
  createAuthCsrfChainApp,
  /** Activate rate limiting for a test and clear all buckets. */
  enableRateLimiting,
  /** Disable rate limiting (bypass) and clear all buckets. */
  disableRateLimiting,
  /** Convenience: run `fn` with rate limiting enabled, then disabled. */
  withRateLimiting,
  /** Read whether the shared rate limiter is in test mode. */
  getRateLimiterTestMode,
  /** Create the shared token bucket middleware for Hono tests. */
  rateLimiter,
  /** Clear shared rate limiter buckets and disable test mode. */
  resetRateLimiter,
  /** Enable or disable rate limiter test mode. */
  setRateLimiterTestMode,
} from "./rate-limiter-harness.js";

// ============================================================================
// API Endpoint Configuration
// ============================================================================
export {
  // Types
  /** Supported test environments. */
  type TestEnvironment,
  /** Test context interface for API endpoint testing. */
  type ApiTestContext,
  // Environment
  /** Current test environment (read from NODE_ENV, defaults to 'test'). */
  currentEnvironment,
  /** Check if running in a specific environment. */
  isEnvironment,
  /** Check if running in test mode. */
  isTestMode,
  // Base URLs
  /** Current base URL (based on current environment). */
  BASE_URL,
  /** API base URLs for different environments. */
  BASE_URLS,
  /** Get the base URL for the current environment. */
  getBaseUrl,
  /** Get the base URL for a specific environment. */
  getBaseUrlForEnvironment,
  // Endpoint paths
  /** Public API endpoint paths. */
  API_ENDPOINTS,
  /** All endpoint paths as a flat array for easy iteration. */
  ALL_ENDPOINTS,
  /** All endpoint patterns (including parameterized ones). */
  ENDPOINT_PATTERNS,
  // Timeouts
  /** Timeout configuration for different endpoint categories. */
  TIMEOUTS,
  /** Get timeout for a specific endpoint. */
  getTimeoutForEndpoint,
  // Retry configuration
  /** Retry configuration for failed requests. */
  RETRY_CONFIG,
  /** Calculate delay for a specific retry attempt using exponential backoff. */
  calculateRetryDelay,
  /** Check if a status code is retryable. */
  isRetryableStatusCode,
  /** Check if an error code is retryable. */
  isRetryableError,
  // Test context
  /** Default test context configuration. */
  createTestContext,
  /** Create a test context for a specific environment. */
  createTestContextForEnvironment,
  /** Create a test context for health endpoint testing (fast timeouts). */
  createHealthTestContext,
  /** Create a test context for real-time endpoint testing (longer timeouts). */
  createRealtimeTestContext,
  /** Create a test context for complex endpoint testing (longest timeouts). */
  createComplexTestContext,
  // Environment configuration
  /** Get environment-specific configuration. */
  getEnvironmentConfig,
  // Endpoint categories
  /** Categorize endpoints by their characteristics. */
  ENDPOINT_CATEGORIES,
  /** Get the category for a specific endpoint. */
  getEndpointCategory,
  // Utilities
  /** Build a full URL for an endpoint. */
  buildUrl,
  /** Build a URL with path parameters. */
  buildUrlWithPathParams,
  /** Build a URL with query parameters. */
  buildUrlWithQueryParams,
  /** Validate an endpoint path. */
  isValidEndpoint,
} from "./api-endpoint-config.js";
