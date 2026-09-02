/**
 * API Endpoint Test Configuration
 *
 * Centralized configuration for testing API endpoints across different environments.
 * Provides base URLs, endpoint path constants, timeout/retry settings, and environment-aware
 * configuration for comprehensive endpoint testing.
 *
 * @module test/api-endpoint-config
 */

// ============================================================================
// Environment Configuration
// ============================================================================

/**
 * Supported test environments
 */
export type TestEnvironment = "test" | "development" | "staging" | "production";

/**
 * Current test environment (read from NODE_ENV, defaults to 'test')
 */
export const currentEnvironment: TestEnvironment =
  (process.env.NODE_ENV as TestEnvironment) || "test";

/**
 * Check if running in a specific environment
 */
export function isEnvironment(env: TestEnvironment): boolean {
  return currentEnvironment === env;
}

/**
 * Check if running in test mode
 */
export function isTestMode(): boolean {
  return isEnvironment("test") || process.env.NODE_ENV === "test";
}

// ============================================================================
// Base URL Configuration
// ============================================================================

/**
 * API base URLs for different environments
 */
const BASE_URLS: Record<TestEnvironment, string> = {
  test: "http://localhost:8787",
  development: "http://localhost:8787",
  staging: "https://staging-api.mta-my-way.com",
  production: "https://api.mta-my-way.com",
};

/**
 * Get the base URL for the current environment
 */
export function getBaseUrl(env: TestEnvironment = currentEnvironment): string {
  return BASE_URLS[env];
}

/**
 * Get the base URL for a specific environment
 */
export function getBaseUrlForEnvironment(env: TestEnvironment): string {
  return BASE_URLS[env];
}

/**
 * Current base URL (based on current environment)
 */
export const BASE_URL = getBaseUrl();

// ============================================================================
// Endpoint Path Constants
// ============================================================================

/**
 * Public API endpoint paths
 * Organized by feature/domain for clarity
 */
export const API_ENDPOINTS = {
  // Health and Monitoring
  health: "/health",
  status: "/status",

  // API Health
  apiHealth: "/api/health",
  apiMetrics: "/api/metrics",

  // Security
  cspReport: "/api/security/csp-report",
  securityTxt: "/.well-known/security.txt",

  // Station Information
  stations: "/api/stations",
  stationById: (id: string) => `/api/stations/${id}`,
  stationSearch: "/api/stations/search",

  // Route Information
  routes: "/api/routes",
  routeById: (id: string) => `/api/routes/${id}`,

  // Static Data
  staticComplexes: "/api/static/complexes",
  staticComplexById: (id: string) => `/api/static/complexes/${id}`,

  // Real-time Data
  arrivals: (id: string) => `/api/arrivals/${id}`,
  positions: (lineId: string) => `/api/positions/${lineId}`,

  // Alerts
  alerts: "/api/alerts",
  alertsByLine: (lineId: string) => `/api/alerts/${lineId}`,

  // Equipment
  equipment: "/api/equipment",
  equipmentById: (id: string) => `/api/equipment/${id}`,

  // Commute Analysis
  commuteAnalyze: "/api/commute/analyze",

  // Trip Tracking
  tripById: (tripId: string) => `/api/trip/${tripId}`,

  // Push Notifications
  pushVapidPublicKey: "/api/push/vapid-public-key",
  pushSubscribe: "/api/push/subscribe",
  pushUnsubscribe: "/api/push/unsubscribe",
  pushSubscription: "/api/push/subscription",

  // Password Reset (if exposed via API)
  passwordResetRequest: "/api/password-reset/request",
  passwordResetVerify: "/api/password-reset/verify",
  passwordResetSubmit: "/api/password-reset/submit",

  // Preferences (if exposed via API)
  preferences: "/api/preferences",

  // Predictions (currently commented out in app.ts)
  // predictionsDelay: '/api/predictions/delay',
  // predictionsDelayByRoute: (routeId: string) => `/api/predictions/delay/${routeId}`,
  // predictionsDelaySummary: (routeId: string) => `/api/predictions/delay/${routeId}/summary`,
  // predictionsPredict: '/api/predictions/predict',
  // tripPredict: (tripId: string) => `/api/trip/${tripId}/predict`,
} as const;

/**
 * All endpoint paths as a flat array for easy iteration
 */
export const ALL_ENDPOINTS = Object.values(API_ENDPOINTS).filter(
  (value): value is string => typeof value === "string"
);

/**
 * All endpoint patterns (including parameterized ones)
 */
export const ENDPOINT_PATTERNS = [
  "/health",
  "/status",
  "/api/health",
  "/api/metrics",
  "/api/security/csp-report",
  "/.well-known/security.txt",
  "/api/stations",
  "/api/stations/:id",
  "/api/stations/search",
  "/api/routes",
  "/api/routes/:id",
  "/api/static/complexes",
  "/api/static/complexes/:id",
  "/api/arrivals/:id",
  "/api/positions/:lineId",
  "/api/alerts",
  "/api/alerts/:lineId",
  "/api/equipment",
  "/api/equipment/:id",
  "/api/commute/analyze",
  "/api/trip/:tripId",
  "/api/push/vapid-public-key",
  "/api/push/subscribe",
  "/api/push/unsubscribe",
  "/api/push/subscription",
  "/api/password-reset/request",
  "/api/password-reset/verify",
  "/api/password-reset/submit",
  "/api/preferences",
];

// ============================================================================
// Timeout Configuration
// ============================================================================

/**
 * Timeout configuration for different endpoint categories
 * Times are in milliseconds
 */
export const TIMEOUTS = {
  /**
   * Default timeout for most API calls
   */
  default: 5000,

  /**
   * Timeout for health checks (fast endpoints)
   */
  health: 1000,

  /**
   * Timeout for real-time data (arrivals, positions)
   */
  realtime: 8000,

  /**
   * Timeout for complex queries (commute analysis, predictions)
   */
  complex: 15000,

  /**
   * Timeout for static data (stations, routes)
   */
  static: 3000,

  /**
   * Timeout for POST operations (subscriptions, updates)
   */
  mutation: 10000,

  /**
   * Maximum timeout for any request
   */
  max: 30000,
} as const;

/**
 * Get timeout for a specific endpoint
 */
export function getTimeoutForEndpoint(endpoint: string): number {
  // Health endpoints
  if (endpoint === "/health" || endpoint === "/status" || endpoint === "/api/health") {
    return TIMEOUTS.health;
  }

  // Real-time data
  if (endpoint.includes("/arrivals/") || endpoint.includes("/positions/")) {
    return TIMEOUTS.realtime;
  }

  // Complex queries
  if (endpoint.includes("/commute/") || endpoint.includes("/predictions/")) {
    return TIMEOUTS.complex;
  }

  // Static data
  if (
    endpoint.includes("/stations") ||
    endpoint.includes("/routes") ||
    endpoint.includes("/static/")
  ) {
    return TIMEOUTS.static;
  }

  // Mutations (POST, PUT, DELETE, PATCH)
  if (
    endpoint.startsWith("/api/push/") ||
    endpoint.startsWith("/api/password-reset/") ||
    endpoint.startsWith("/api/preferences")
  ) {
    return TIMEOUTS.mutation;
  }

  // Default
  return TIMEOUTS.default;
}

// ============================================================================
// Retry Configuration
// ============================================================================

/**
 * Retry configuration for failed requests
 */
export const RETRY_CONFIG = {
  /**
   * Maximum number of retry attempts
   */
  maxRetries: 3,

  /**
   * Initial delay before retry (in milliseconds)
   */
  initialDelay: 1000,

  /**
   * Multiplier for exponential backoff
   */
  backoffMultiplier: 2,

  /**
   * Maximum delay between retries (in milliseconds)
   */
  maxDelay: 10000,

  /**
   * HTTP status codes that should trigger a retry
   */
  retryableStatusCodes: [408, 429, 500, 502, 503, 504],

  /**
   * Network errors that should trigger a retry
   */
  retryableErrors: ["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN"],

  /**
   * Whether to retry on timeout errors
   */
  retryOnTimeout: true,
} as const;

/**
 * Calculate delay for a specific retry attempt using exponential backoff
 */
export function calculateRetryDelay(attemptNumber: number): number {
  const delay = RETRY_CONFIG.initialDelay * Math.pow(RETRY_CONFIG.backoffMultiplier, attemptNumber);
  return Math.min(delay, RETRY_CONFIG.maxDelay);
}

/**
 * Check if a status code is retryable
 */
export function isRetryableStatusCode(statusCode: number): boolean {
  return RETRY_CONFIG.retryableStatusCodes.includes(statusCode as any);
}

/**
 * Check if an error code is retryable
 */
export function isRetryableError(errorCode: string): boolean {
  return RETRY_CONFIG.retryableErrors.includes(errorCode as any);
}

// ============================================================================
// Test Context Configuration
// ============================================================================

/**
 * Test context interface for API endpoint testing
 */
export interface ApiTestContext {
  /**
   * Base URL for API requests
   */
  baseUrl: string;

  /**
   * Current test environment
   */
  environment: TestEnvironment;

  /**
   * Timeout for requests
   */
  timeout: number;

  /**
   * Retry configuration
   */
  retry: {
    maxRetries: number;
    initialDelay: number;
    maxDelay: number;
  };

  /**
   * Authentication credentials (if needed)
   */
  auth?: {
    apiKey?: string;
    token?: string;
    username?: string;
    password?: string;
  };

  /**
   * Custom headers to include in requests
   */
  headers?: Record<string, string>;

  /**
   * Whether to validate response schemas
   */
  validateSchema: boolean;

  /**
   * Whether to log detailed request/response information
   */
  debug: boolean;
}

/**
 * Default test context configuration
 */
export function createTestContext(overrides: Partial<ApiTestContext> = {}): ApiTestContext {
  const defaults: ApiTestContext = {
    baseUrl: BASE_URL,
    environment: currentEnvironment,
    timeout: TIMEOUTS.default,
    retry: {
      maxRetries: RETRY_CONFIG.maxRetries,
      initialDelay: RETRY_CONFIG.initialDelay,
      maxDelay: RETRY_CONFIG.maxDelay,
    },
    validateSchema: true,
    debug: isTestMode(),
  };

  return { ...defaults, ...overrides };
}

/**
 * Create a test context for a specific environment
 */
export function createTestContextForEnvironment(
  env: TestEnvironment,
  overrides: Partial<ApiTestContext> = {}
): ApiTestContext {
  return createTestContext({
    ...overrides,
    environment: env,
    baseUrl: BASE_URLS[env],
  });
}

/**
 * Create a test context for health endpoint testing (fast timeouts)
 */
export function createHealthTestContext(overrides: Partial<ApiTestContext> = {}): ApiTestContext {
  return createTestContext({
    ...overrides,
    timeout: TIMEOUTS.health,
  });
}

/**
 * Create a test context for real-time endpoint testing (longer timeouts)
 */
export function createRealtimeTestContext(overrides: Partial<ApiTestContext> = {}): ApiTestContext {
  return createTestContext({
    ...overrides,
    timeout: TIMEOUTS.realtime,
  });
}

/**
 * Create a test context for complex endpoint testing (longest timeouts)
 */
export function createComplexTestContext(overrides: Partial<ApiTestContext> = {}): ApiTestContext {
  return createTestContext({
    ...overrides,
    timeout: TIMEOUTS.complex,
  });
}

// ============================================================================
// Environment-Aware Configuration
// ============================================================================

/**
 * Get environment-specific configuration
 */
export function getEnvironmentConfig(env: TestEnvironment = currentEnvironment) {
  return {
    environment: env,
    baseUrl: BASE_URLS[env],
    // Test environments use shorter timeouts
    timeout: isTestMode() ? TIMEOUTS.default * 0.5 : TIMEOUTS.default,
    // Production uses fewer retries
    retry: {
      maxRetries: env === "production" ? 2 : RETRY_CONFIG.maxRetries,
      initialDelay: RETRY_CONFIG.initialDelay,
      maxDelay: RETRY_CONFIG.maxDelay,
    },
    // Production has debug disabled
    debug: env !== "production",
    // Schema validation always enabled
    validateSchema: true,
  };
}

// ============================================================================
// Endpoint Categories
// ============================================================================

/**
 * Categorize endpoints by their characteristics
 */
export const ENDPOINT_CATEGORIES = {
  /**
   * Health and monitoring endpoints (fast, no auth)
   */
  health: ["/health", "/status", "/api/health"],

  /**
   * Static data endpoints (cacheable, no auth)
   */
  static: [
    "/api/stations",
    "/api/stations/:id",
    "/api/stations/search",
    "/api/routes",
    "/api/routes/:id",
    "/api/static/complexes",
    "/api/static/complexes/:id",
  ],

  /**
   * Real-time data endpoints (may have rate limits)
   */
  realtime: [
    "/api/arrivals/:id",
    "/api/positions/:lineId",
    "/api/alerts",
    "/api/alerts/:lineId",
    "/api/equipment",
    "/api/equipment/:id",
  ],

  /**
   * Complex query endpoints (may require authentication)
   */
  complex: ["/api/commute/analyze", "/api/trip/:tripId"],

  /**
   * Mutation endpoints (require authentication)
   */
  mutation: [
    "/api/push/subscribe",
    "/api/push/unsubscribe",
    "/api/push/subscription",
    "/api/password-reset/request",
    "/api/password-reset/verify",
    "/api/password-reset/submit",
    "/api/preferences",
  ],

  /**
   * Security endpoints
   */
  security: ["/api/security/csp-report", "/.well-known/security.txt"],
} as const;

/**
 * Get the category for a specific endpoint
 */
export function getEndpointCategory(endpoint: string): keyof typeof ENDPOINT_CATEGORIES | "other" {
  for (const [category, endpoints] of Object.entries(ENDPOINT_CATEGORIES)) {
    if (endpoints.some((pattern) => endpointMatch(endpoint, pattern))) {
      return category as keyof typeof ENDPOINT_CATEGORIES;
    }
  }
  return "other";
}

/**
 * Check if an endpoint matches a pattern (supports :id parameters)
 */
function endpointMatch(endpoint: string, pattern: string): boolean {
  if (pattern === endpoint) return true;

  // Convert pattern to regex for parameter matching
  const regexPattern = pattern.replace(/:[^/]+/g, "[^/]+").replace(/\*/g, ".*");

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(endpoint);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Build a full URL for an endpoint
 */
export function buildUrl(endpoint: string, baseUrl: string = BASE_URL): string {
  return `${baseUrl}${endpoint}`;
}

/**
 * Build a URL with path parameters
 */
export function buildUrlWithPathParams(
  endpointTemplate: string,
  params: Record<string, string>,
  baseUrl: string = BASE_URL
): string {
  let endpoint = endpointTemplate;
  for (const [key, value] of Object.entries(params)) {
    endpoint = endpoint.replace(`:${key}`, value);
  }
  return buildUrl(endpoint, baseUrl);
}

/**
 * Build a URL with query parameters
 */
export function buildUrlWithQueryParams(
  endpoint: string,
  params: Record<string, string | number | boolean>,
  baseUrl: string = BASE_URL
): string {
  const url = new URL(buildUrl(endpoint, baseUrl));
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/**
 * Validate an endpoint path
 */
export function isValidEndpoint(endpoint: string): boolean {
  return ENDPOINT_PATTERNS.some((pattern) => endpointMatch(endpoint, pattern));
}
