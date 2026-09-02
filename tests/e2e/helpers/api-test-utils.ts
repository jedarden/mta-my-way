/**
 * API Health Test Utilities
 *
 * Reusable helper functions for testing API endpoint health, response validation,
 * and data structure verification. These utilities are designed to work with
 * Playwright's API testing context and can be used across all endpoint tests.
 *
 * gitleaks:allow - test utilities only, no real credentials
 */

import { type APIResponse, expect } from "@playwright/test";

/**
 * Expected status codes for different response scenarios
 */
export const STATUS_CODES = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

/**
 * Common HTTP methods for API testing
 */
export const HTTP_METHODS = {
  GET: "GET",
  POST: "POST",
  PUT: "PUT",
  PATCH: "PATCH",
  DELETE: "DELETE",
} as const;

/**
 * Response validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * API endpoint configuration
 */
export interface EndpointConfig {
  path: string;
  method: keyof typeof HTTP_METHODS;
  description: string;
  expectedStatus?: number | number[];
  requiresAuth?: boolean;
  contentType?: string;
}

/**
 * Validate response status code
 */
export async function validateStatus(
  response: APIResponse,
  expected: number | number[]
): Promise<ValidationResult> {
  const result: ValidationResult = { valid: true, errors: [], warnings: [] };

  const actual = response.status();
  const expectedArray = Array.isArray(expected) ? expected : [expected];

  if (!expectedArray.includes(actual)) {
    result.valid = false;
    result.errors.push(`Expected status ${expectedArray.join(" or ")}, got ${actual}`);
  }

  return result;
}

/**
 * Validate response content type
 */
export async function validateContentType(
  response: APIResponse,
  expectedType: string
): Promise<ValidationResult> {
  const result: ValidationResult = { valid: true, errors: [], warnings: [] };

  const contentType = response.headers()["content-type"];

  if (!contentType) {
    result.valid = false;
    result.errors.push("Missing Content-Type header");
    return result;
  }

  if (!contentType.includes(expectedType)) {
    result.warnings.push(`Content-Type is ${contentType}, expected ${expectedType}`);
  }

  return result;
}

/**
 * Validate JSON response structure
 */
export async function validateJsonStructure(
  response: APIResponse,
  requiredFields: string[]
): Promise<ValidationResult> {
  const result: ValidationResult = { valid: true, errors: [], warnings: [] };

  try {
    const body = await response.json();

    for (const field of requiredFields) {
      if (!(field in body)) {
        result.valid = false;
        result.errors.push(`Missing required field: ${field}`);
      }
    }
  } catch (error) {
    result.valid = false;
    result.errors.push(`Failed to parse JSON: ${error}`);
  }

  return result;
}

/**
 * Validate array response
 */
export async function validateArrayResponse(
  response: APIResponse,
  options?: {
    minLength?: number;
    maxLength?: number;
    itemValidator?: (item: any) => ValidationResult;
  }
): Promise<ValidationResult> {
  const result: ValidationResult = { valid: true, errors: [], warnings: [] };

  try {
    const body = await response.json();

    if (!Array.isArray(body)) {
      result.valid = false;
      result.errors.push("Response is not an array");
      return result;
    }

    if (options?.minLength !== undefined && body.length < options.minLength) {
      result.valid = false;
      result.errors.push(`Array length ${body.length} is less than minimum ${options.minLength}`);
    }

    if (options?.maxLength !== undefined && body.length > options.maxLength) {
      result.warnings.push(`Array length ${body.length} exceeds maximum ${options.maxLength}`);
    }

    if (options?.itemValidator) {
      body.forEach((item, index) => {
        const itemResult = options.itemValidator!(item);
        if (!itemResult.valid) {
          result.valid = false;
          result.errors.push(...itemResult.errors.map((e) => `Item ${index}: ${e}`));
        }
        result.warnings.push(...itemResult.warnings);
      });
    }
  } catch (error) {
    result.valid = false;
    result.errors.push(`Failed to parse JSON array: ${error}`);
  }

  return result;
}

/**
 * Validate numeric field constraints
 */
export function validateNumberConstraints(
  value: number,
  fieldName: string,
  options?: {
    min?: number;
    max?: number;
    integer?: boolean;
  }
): ValidationResult {
  const result: ValidationResult = { valid: true, errors: [], warnings: [] };

  if (typeof value !== "number") {
    result.valid = false;
    result.errors.push(`${fieldName} is not a number: ${typeof value}`);
    return result;
  }

  if (options?.integer && !Number.isInteger(value)) {
    result.valid = false;
    result.errors.push(`${fieldName} must be an integer: ${value}`);
  }

  if (options?.min !== undefined && value < options.min) {
    result.valid = false;
    result.errors.push(`${fieldName} ${value} is less than minimum ${options.min}`);
  }

  if (options?.max !== undefined && value > options.max) {
    result.valid = false;
    result.errors.push(`${fieldName} ${value} exceeds maximum ${options.max}`);
  }

  return result;
}

/**
 * Validate string field constraints
 */
export function validateStringConstraints(
  value: string,
  fieldName: string,
  options?: {
    minLength?: number;
    maxLength?: number;
    pattern?: RegExp;
    allowedValues?: string[];
  }
): ValidationResult {
  const result: ValidationResult = { valid: true, errors: [], warnings: [] };

  if (typeof value !== "string") {
    result.valid = false;
    result.errors.push(`${fieldName} is not a string: ${typeof value}`);
    return result;
  }

  if (options?.minLength !== undefined && value.length < options.minLength) {
    result.valid = false;
    result.errors.push(
      `${fieldName} length ${value.length} is less than minimum ${options.minLength}`
    );
  }

  if (options?.maxLength !== undefined && value.length > options.maxLength) {
    result.valid = false;
    result.errors.push(`${fieldName} length ${value.length} exceeds maximum ${options.maxLength}`);
  }

  if (options?.pattern && !options.pattern.test(value)) {
    result.valid = false;
    result.errors.push(`${fieldName} does not match pattern ${options.pattern}`);
  }

  if (options?.allowedValues && !options.allowedValues.includes(value)) {
    result.valid = false;
    result.errors.push(
      `${fieldName} value "${value}" is not in allowed values: ${options.allowedValues.join(", ")}`
    );
  }

  return result;
}

/**
 * Comprehensive API response validation
 */
export async function validateApiResponse(
  response: APIResponse,
  options: {
    expectedStatus?: number | number[];
    contentType?: string;
    requiredFields?: string[];
    isArray?: boolean;
    arrayMinLength?: number;
    arrayMaxLength?: number;
  }
): Promise<ValidationResult> {
  const result: ValidationResult = { valid: true, errors: [], warnings: [] };
  const validations: Promise<ValidationResult>[] = [];

  // Validate status code
  if (options.expectedStatus) {
    validations.push(validateStatus(response, options.expectedStatus));
  }

  // Validate content type
  if (options.contentType) {
    validations.push(validateContentType(response, options.contentType));
  }

  // Wait for all validations to complete
  const results = await Promise.all(validations);
  results.forEach((r) => {
    if (!r.valid) {
      result.valid = false;
      result.errors.push(...r.errors);
    }
    result.warnings.push(...r.warnings);
  });

  // Validate JSON structure
  if (options.requiredFields) {
    const structureResult = await validateJsonStructure(response, options.requiredFields);
    if (!structureResult.valid) {
      result.valid = false;
      result.errors.push(...structureResult.errors);
    }
    result.warnings.push(...structureResult.warnings);
  }

  // Validate array response
  if (options.isArray) {
    const arrayResult = await validateArrayResponse(response, {
      minLength: options.arrayMinLength,
      maxLength: options.arrayMaxLength,
    });
    if (!arrayResult.valid) {
      result.valid = false;
      result.errors.push(...arrayResult.errors);
    }
    result.warnings.push(...arrayResult.warnings);
  }

  return result;
}

/**
 * Measure response time
 */
export async function measureResponseTime(
  fn: () => Promise<APIResponse>
): Promise<{ response: APIResponse; duration: number }> {
  const startTime = Date.now();
  const response = await fn();
  const endTime = Date.now();

  return {
    response,
    duration: endTime - startTime,
  };
}

/**
 * Validate response time constraints
 */
export function validateResponseTime(
  duration: number,
  maxMs: number,
  endpoint?: string
): ValidationResult {
  const result: ValidationResult = { valid: true, errors: [], warnings: [] };

  if (duration > maxMs) {
    result.valid = false;
    result.errors.push(`${endpoint || "Endpoint"} took ${duration}ms, exceeds maximum ${maxMs}ms`);
  } else if (duration > maxMs * 0.8) {
    result.warnings.push(
      `${endpoint || "Endpoint"} took ${duration}ms, approaching maximum ${maxMs}ms`
    );
  }

  return result;
}

/**
 * Test suite builder for API endpoints
 */
export class ApiTestSuite {
  private endpoints: EndpointConfig[] = [];

  addEndpoint(config: EndpointConfig): void {
    this.endpoints.push(config);
  }

  getEndpoints(): EndpointConfig[] {
    return this.endpoints;
  }

  /**
   * Generate test cases for all registered endpoints
   */
  generateTests(): Array<{
    name: string;
    test: (request: any) => Promise<void>;
  }> {
    return this.endpoints.map((endpoint) => ({
      name: `${endpoint.method} ${endpoint.path} - ${endpoint.description}`,
      test: async ({ request }: any) => {
        const method = endpoint.method.toLowerCase() as "get" | "post" | "put" | "patch" | "delete";
        const response = await request[method](endpoint.path);

        // Validate status code
        if (endpoint.expectedStatus) {
          await expect(response.status()).toBe(
            Array.isArray(endpoint.expectedStatus)
              ? endpoint.expectedStatus[0]
              : endpoint.expectedStatus
          );
        }

        // Validate content type
        if (endpoint.contentType) {
          const contentType = response.headers()["content-type"];
          await expect(contentType).toContain(endpoint.contentType);
        }

        // For authenticated endpoints without auth, expect 401/403
        if (endpoint.requiresAuth) {
          await expect([401, 403]).toContain(response.status());
        }
      },
    }));
  }
}

/**
 * Common API endpoint templates
 */
export const API_ENDPOINTS = {
  // Health and status endpoints
  HEALTH: {
    path: "/health",
    method: HTTP_METHODS.GET,
    description: "Basic health check",
    expectedStatus: STATUS_CODES.OK,
    contentType: "application/json",
  },
  API_HEALTH: {
    path: "/api/health",
    method: HTTP_METHODS.GET,
    description: "Detailed system health",
    expectedStatus: [STATUS_CODES.OK, STATUS_CODES.SERVICE_UNAVAILABLE],
    contentType: "application/json",
  },

  // Station endpoints
  STATIONS: {
    path: "/api/stations",
    method: HTTP_METHODS.GET,
    description: "Get all stations",
    expectedStatus: STATUS_CODES.OK,
    contentType: "application/json",
  },
  STATION_SEARCH: {
    path: "/api/stations/search",
    method: HTTP_METHODS.GET,
    description: "Search stations",
    expectedStatus: STATUS_CODES.OK,
    contentType: "application/json",
  },
  STATION_DETAIL: (id: string) => ({
    path: `/api/stations/${id}`,
    method: HTTP_METHODS.GET,
    description: `Get station ${id}`,
    expectedStatus: [STATUS_CODES.OK, STATUS_CODES.NOT_FOUND],
    contentType: "application/json",
  }),

  // Route endpoints
  ROUTES: {
    path: "/api/routes",
    method: HTTP_METHODS.GET,
    description: "Get all routes",
    expectedStatus: STATUS_CODES.OK,
    contentType: "application/json",
  },
  ROUTE_DETAIL: (id: string) => ({
    path: `/api/routes/${id}`,
    method: HTTP_METHODS.GET,
    description: `Get route ${id}`,
    expectedStatus: [STATUS_CODES.OK, STATUS_CODES.NOT_FOUND],
    contentType: "application/json",
  }),

  // Alert endpoints
  ALERTS: {
    path: "/api/alerts",
    method: HTTP_METHODS.GET,
    description: "Get all alerts",
    expectedStatus: STATUS_CODES.OK,
    contentType: "application/json",
  },
  ALERTS_BY_LINE: (lineId: string) => ({
    path: `/api/alerts/${lineId}`,
    method: HTTP_METHODS.GET,
    description: `Get alerts for line ${lineId}`,
    expectedStatus: STATUS_CODES.OK,
    contentType: "application/json",
  }),

  // Real-time endpoints
  ARRIVALS: (stationId: string) => ({
    path: `/api/arrivals/${stationId}`,
    method: HTTP_METHODS.GET,
    description: `Get arrivals for station ${stationId}`,
    expectedStatus: [STATUS_CODES.OK, STATUS_CODES.NOT_FOUND],
    contentType: "application/json",
  }),

  // Static data endpoints
  COMPLEXES: {
    path: "/api/static/complexes",
    method: HTTP_METHODS.GET,
    description: "Get station complexes",
    expectedStatus: STATUS_CODES.OK,
    contentType: "application/json",
  },
  EQUIPMENT: {
    path: "/api/equipment",
    method: HTTP_METHODS.GET,
    description: "Get equipment status",
    expectedStatus: STATUS_CODES.OK,
    contentType: "application/json",
  },
} as const;

/**
 * Performance thresholds for different endpoint types
 */
export const PERFORMANCE_THRESHOLDS = {
  // Health endpoints should be very fast
  HEALTH_CHECK: 100, // ms
  API_HEALTH: 500, // ms

  // Static data endpoints
  STATIC_DATA: 500, // ms
  STATIONS_LIST: 1000, // ms
  ROUTES_LIST: 500, // ms

  // Real-time endpoints
  ARRIVALS: 500, // ms
  ALERTS: 500, // ms

  // Search endpoints
  STATION_SEARCH: 300, // ms

  // Default timeout
  DEFAULT: 2000, // ms
} as const;

/**
 * Cache header validation helpers
 */
export const CACHE_HEADERS = {
  validateNoCache: (response: APIResponse): ValidationResult => {
    const result: ValidationResult = { valid: true, errors: [], warnings: [] };
    const cacheControl = response.headers()["cache-control"];

    if (cacheControl && (cacheControl.includes("max-age") || cacheControl.includes("public"))) {
      result.warnings.push("Response has cache directives when none expected");
    }

    return result;
  },

  validatePublicCache: (response: APIResponse, maxAge?: number): ValidationResult => {
    const result: ValidationResult = { valid: true, errors: [], warnings: [] };
    const cacheControl = response.headers()["cache-control"];

    if (!cacheControl || !cacheControl.includes("public")) {
      result.warnings.push("Response missing public cache directive");
    }

    if (maxAge && !cacheControl?.includes(`max-age=${maxAge}`)) {
      result.warnings.push(`Cache age doesn't match expected ${maxAge}s`);
    }

    return result;
  },
} as const;

/**
 * Common test data fixtures
 */
export const TEST_FIXTURES = {
  STATION_IDS: {
    TIMES_SQUARE: "127",
    SOUTH_FERRY: "101",
    PORT_AUTHORITY: "726",
  },
  LINE_IDS: {
    LINE_1: "1",
    LINE_A: "A",
    LINE_L: "L",
  },
  COMPLEX_IDS: {
    TIMES_SQUARE: "725-726",
  },
} as const;
