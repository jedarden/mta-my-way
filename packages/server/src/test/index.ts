/**
 * Test utilities index.
 *
 * Exports all test helpers and mocks for cross-cutting concerns.
 */

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

export {
  createInMemoryDatabase,
  createTestDatabase,
  seedTestData,
  clearTestData,
} from "./database.js";

export {
  createMockRequest,
  createMockResponse,
  assertResponseStatus,
  assertResponseHeader,
  assertResponseBody,
} from "./http.js";

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
