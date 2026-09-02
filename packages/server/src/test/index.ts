/**
 * Test utilities index.
 *
 * This module exports all test helpers and mocks for cross-cutting concerns.
 * Organized by functionality:
 *
 * **Observability** (./observability.js)
 * - MockLogger: Mock logger for testing with assertion methods
 * - MockTracer: Mock tracer for testing distributed tracing
 * - MockMetricsRegistry: Mock metrics registry for testing counters/gauges/histograms
 * - createMockSpan: Create a mock span for testing
 * - assertMetricIncremented: Assert a counter metric was incremented
 * - assertSpanCreated: Assert a span was created with specific attributes
 * - assertLogged: Assert a log entry was created
 * - waitForAssertion: Wait for async assertion to pass (with timeout)
 *
 * **Security** (./security.js)
 * - createMockContext: Create a mock Hono context for testing
 * - securityTestScenarios: Common security test payloads (XSS, SQL injection, path traversal, CSRF, rate limit, auth)
 * - assertSecurityHeaders: Assert response has required security headers
 * - assertCspHeaders: Assert CSP is configured correctly (returns errors if not)
 * - assertNoSensitiveDataLeak: Assert sensitive data is not leaked in response
 * - testXssSanitization: Test input sanitization for XSS payloads
 * - testSqlInjectionProtection: Test SQL injection protection
 * - testPathTraversalProtection: Test path traversal protection
 * - MockRateLimiter: Mock rate limiter for testing
 * - assertRateLimit: Assert rate limiting behavior (allows up to limit, blocks beyond)
 * - createMockAuthContext: Create a mock authentication context
 *
 * **Database** (./database.ts)
 * - createInMemoryDatabase: Create in-memory SQLite database for testing
 * - createTestDatabase: Create file-based test database in temporary directory (includes cleanup)
 * - seedTestData: Seed test data into database (accepts object mapping table names to row arrays)
 * - clearTestData: Clear test data from database (accepts array of table names)
 * - assertTableExists: Assert table exists in database
 * - assertColumnExists: Assert column exists in table
 * - assertRowCount: Assert row count in table
 * - getRowCount: Get row count for table
 * - assertValueExists: Assert value exists in table column
 * - getAllRows: Get all rows from table
 * - runMigrations: Run migrations on test database
 * - createFreshTestDatabase: Create fresh test database with migrations applied
 *
 * **HTTP** (./http.ts)
 * - createMockRequest: Create mock HTTP request (method, url, headers, query, body)
 * - createMockResponse: Create mock HTTP response (includes status, headers, body getters and mocks)
 * - assertResponseStatus: Assert response status code
 * - assertResponseHeader: Assert response header value (optionally check exact value)
 * - assertResponseBody: Assert response body contains text (simplified check)
 * - parseJsonBody: Parse JSON response body
 * - assertJsonBody: Assert JSON response body matches expected object
 * - assertRedirect: Assert response is redirect (3xx) with Location header
 * - assertContentType: Assert Content-Type header includes expected type
 * - createFetchMock: Create fetch mock for testing (accepts array of url/response pairs with optional method)
 * - assertFetchCalled: Assert fetch was called with specific url and options
 *
 * **API Response Helpers** (./api-response-helpers.ts)
 * - assertSuccessStatus: Assert response has successful status (2xx)
 * - assertStatus: Assert response has specific status code
 * - assertClientErrorStatus: Assert response has client error status (4xx)
 * - assertServerErrorStatus: Assert response has server error status (5xx)
 * - assertStatusInRange: Assert response is one of allowed status codes
 * - assertNotFound: Assert response is not found (404)
 * - assertBadRequest: Assert response is bad request (400)
 * - parseJson: Parse JSON response body safely
 * - assertJsonResponse: Assert response is valid JSON
 * - assertArrayResponse: Assert response body is an array
 * - assertObjectResponse: Assert response body is an object
 * - assertHasProperties: Assert object has required properties
 * - assertPropertyType: Assert property has specific type
 * - assertArrayItemsHaveProperties: Assert all items in array have required properties
 * - assertNonEmptyString: Assert string is non-empty
 * - assertNumberInRange: Assert number is within valid range
 * - assertNonEmptyArray: Assert array is non-empty
 * - expectSuccessResponse: Test successful API response pattern
 * - expectErrorResponse: Test error response pattern
 * - expectPaginatedResponse: Test paginated response pattern
 * - expectHealthResponse: Test health endpoint response pattern
 * - logApiResponse: Log request/response details for debugging
 * - logTestSection: Log test suite section headers
 * - createDebugLogger: Create a debug logger for a specific test context
 * - assertPerformance: Assert operation completed within maximum time
 * - measurePerformance: Measure execution time of an async function
 * - createPerformanceTester: Create a performance test helper
 * - validateStationStructure: Validate station response structure
 * - validateRouteStructure: Validate route response structure
 * - validateAlertStructure: Validate alert response structure
 * - validateArrivalStructure: Validate arrival response structure
 * - validateTransferStructure: Validate transfer connection structure
 * - runEndpointTests: Run assertions against multiple endpoints
 * - createEndpointTestSuite: Create a test suite builder for consistent endpoint testing
 *
 * **Rate Limiter Harness** (./rate-limiter-harness.ts)
 * - type AuthVars: Type for authentication test variables
 * - IP_A, IP_B: Test IP addresses (127.0.0.1, 127.0.0.2)
 * - mockOptionalAuth: Mock optional authentication middleware
 * - mockCsrfProtection: Mock CSRF protection middleware
 * - createStatusRecorder: Create middleware that records status codes
 * - createStandardChainApp: Create Hono app with standard middleware chain (auth → CSRF → rate limit)
 * - createReversedOrderApp: Create Hono app with reversed middleware order (rate limit → CSRF → auth)
 * - createAuthBeforeRateLimitApp: Create app with auth before rate limiting
 * - createAuthCsrfChainApp: Create app with auth and CSRF in chain
 * - enableRateLimiting: Enable rate limiting in tests
 * - disableRateLimiting: Disable rate limiting in tests
 * - withRateLimiting: Temporarily enable rate limiting for a test
 * - getRateLimiterTestMode: Get current rate limiter test mode
 * - rateLimiter: Get shared rate limiter instance
 * - resetRateLimiter: Reset rate limiter state
 * - setRateLimiterTestMode: Set rate limiter test mode
 *
 * **API Endpoint Configuration** (./api-endpoint-config.ts)
 * - API_ENDPOINTS: Object containing all API endpoint paths
 * - TIMEOUTS: Timeout configuration for different endpoint categories
 * - RETRY_CONFIG: Retry configuration for failed requests
 * - createTestContext: Create test context for API endpoint testing
 * - getBaseUrl: Get base URL for current environment
 * - buildUrl: Build full URL for an endpoint
 * - getTimeoutForEndpoint: Get timeout for a specific endpoint
 * - isTestMode: Check if running in test mode
 *
 * **Usage Example:**
 * ```ts
 * import { MockLogger, assertLogged, createInMemoryDatabase, seedTestData, createTestContext, API_ENDPOINTS, assertSuccessResponse, validateStationStructure } from './test';
 *
 * const logger = new MockLogger();
 * logger.info('test message', { key: 'value' });
 * assertLogged(logger, 'info', 'test message');
 *
 * const db = createInMemoryDatabase();
 * seedTestData(db, {
 *   users: [{ id: 1, name: 'Alice' }],
 * });
 *
 * const testContext = createTestContext();
 * const url = buildUrl(API_ENDPOINTS.stations, testContext.baseUrl);
 *
 * // Test an endpoint with new helpers
 * const response = await app.request('/api/stations/101');
 * const station = await expectSuccessResponse(response);
 * validateStationStructure(station);
 * ```
 */

// ============================================================================
// Observability
// ============================================================================
export {
  MockLogger,
  MockTracer,
  MockMetricsRegistry,
  createMockSpan,
  assertMetricIncremented,
  assertSpanCreated,
  assertLogged,
  waitForAssertion,
} from "./observability.js";

// ============================================================================
// Security
// ============================================================================
export {
  createMockContext,
  securityTestScenarios,
  assertSecurityHeaders,
  assertCspHeaders,
  assertNoSensitiveDataLeak,
  testXssSanitization,
  testSqlInjectionProtection,
  testPathTraversalProtection,
  MockRateLimiter,
  assertRateLimit,
  createMockAuthContext,
} from "./security.js";

// ============================================================================
// Database
// ============================================================================
export {
  createInMemoryDatabase,
  createTestDatabase,
  seedTestData,
  clearTestData,
  assertTableExists,
  assertColumnExists,
  assertRowCount,
  getRowCount,
  assertValueExists,
  getAllRows,
  runMigrations,
  createFreshTestDatabase,
} from "./database.js";

// ============================================================================
// HTTP
// ============================================================================
export {
  createMockRequest,
  createMockResponse,
  assertResponseStatus,
  assertResponseHeader,
  assertResponseBody,
  parseJsonBody,
  assertJsonBody,
  assertRedirect,
  assertContentType,
  createFetchMock,
  assertFetchCalled,
} from "./http.js";

// ============================================================================
// API Response Helpers
// ============================================================================
export {
  // Response Status Assertion Helpers
  assertSuccessStatus,
  assertStatus,
  assertClientErrorStatus,
  assertServerErrorStatus,
  assertStatusInRange,
  assertNotFound,
  assertBadRequest,
  // Response Structure/Data Type Validators
  parseJson,
  assertJsonResponse,
  assertArrayResponse,
  assertObjectResponse,
  assertHasProperties,
  assertPropertyType,
  assertArrayItemsHaveProperties,
  assertNonEmptyString,
  assertNumberInRange,
  assertNonEmptyArray,
  // Common Test Patterns
  expectSuccessResponse,
  expectErrorResponse,
  expectPaginatedResponse,
  expectHealthResponse,
  // Logging/Debugging Helpers
  logApiResponse,
  logTestSection,
  createDebugLogger,
  // Performance Assertion Helpers
  assertPerformance,
  measurePerformance,
  createPerformanceTester,
  // Endpoint-Specific Validation Helpers
  validateStationStructure,
  validateRouteStructure,
  validateAlertStructure,
  validateArrivalStructure,
  validateTransferStructure,
  // Batch Test Helpers
  runEndpointTests,
  createEndpointTestSuite,
} from "./api-response-helpers.js";

// ============================================================================
// Rate Limiter Harness
// ============================================================================
export {
  type AuthVars,
  IP_A,
  IP_B,
  mockOptionalAuth,
  mockCsrfProtection,
  createStatusRecorder,
  createStandardChainApp,
  createReversedOrderApp,
  createAuthBeforeRateLimitApp,
  createAuthCsrfChainApp,
  enableRateLimiting,
  disableRateLimiting,
  withRateLimiting,
  getRateLimiterTestMode,
  rateLimiter,
  resetRateLimiter,
  setRateLimiterTestMode,
} from "./rate-limiter-harness.js";

// ============================================================================
// API Endpoint Configuration
// ============================================================================
export {
  // Types
  type TestEnvironment,
  type ApiTestContext,
  // Environment
  currentEnvironment,
  isEnvironment,
  isTestMode,
  // Base URLs
  BASE_URL,
  BASE_URLS,
  getBaseUrl,
  getBaseUrlForEnvironment,
  // Endpoint paths
  API_ENDPOINTS,
  ALL_ENDPOINTS,
  ENDPOINT_PATTERNS,
  // Timeouts
  TIMEOUTS,
  getTimeoutForEndpoint,
  // Retry configuration
  RETRY_CONFIG,
  calculateRetryDelay,
  isRetryableStatusCode,
  isRetryableError,
  // Test context
  createTestContext,
  createTestContextForEnvironment,
  createHealthTestContext,
  createRealtimeTestContext,
  createComplexTestContext,
  // Environment configuration
  getEnvironmentConfig,
  // Endpoint categories
  ENDPOINT_CATEGORIES,
  getEndpointCategory,
  // Utilities
  buildUrl,
  buildUrlWithPathParams,
  buildUrlWithQueryParams,
  isValidEndpoint,
} from "./api-endpoint-config.js";
