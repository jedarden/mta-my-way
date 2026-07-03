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
 * **Usage Example:**
 * ```ts
 * import { MockLogger, assertLogged, createInMemoryDatabase, seedTestData } from './test';
 *
 * const logger = new MockLogger();
 * logger.info('test message', { key: 'value' });
 * assertLogged(logger, 'info', 'test message');
 *
 * const db = createInMemoryDatabase();
 * seedTestData(db, {
 *   users: [{ id: 1, name: 'Alice' }],
 * });
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
