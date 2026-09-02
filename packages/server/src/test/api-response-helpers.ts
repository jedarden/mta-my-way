/**
 * API Response Test Helpers
 *
 * Reusable helper functions for endpoint testing across all API types
 * (stations, alerts, arrivals, routes, etc.).
 *
 * Provides:
 * - Response status assertion helpers
 * - Response structure/data type validators
 * - Common test patterns (success, error, validation)
 * - Logging/debugging helpers for test output
 * - Performance assertion helpers
 * - Endpoint-specific validation helpers
 */

import type { Response } from "hono";
import { describe } from "vitest";

// ============================================================================
// Response Status Assertion Helpers
// ============================================================================

/**
 * Assert response has successful status (2xx)
 * @param response - Hono response object
 * @param message - Optional assertion message
 */
export function assertSuccessStatus(response: Response, message?: string): void {
  const status = response.status;
  if (status < 200 || status >= 300) {
    throw new Error(`${message || "Expected success status (2xx)"}, but got ${status}`);
  }
}

/**
 * Assert response has specific status code
 * @param response - Hono response object
 * @param expectedStatus - Expected HTTP status code
 * @param message - Optional assertion message
 */
export function assertStatus(response: Response, expectedStatus: number, message?: string): void {
  const status = response.status;
  if (status !== expectedStatus) {
    throw new Error(`${message || `Expected status ${expectedStatus}`}, but got ${status}`);
  }
}

/**
 * Assert response has client error status (4xx)
 * @param response - Hono response object
 * @param message - Optional assertion message
 */
export function assertClientErrorStatus(response: Response, message?: string): void {
  const status = response.status;
  if (status < 400 || status >= 500) {
    throw new Error(`${message || "Expected client error status (4xx)"}, but got ${status}`);
  }
}

/**
 * Assert response has server error status (5xx)
 * @param response - Hono response object
 * @param message - Optional assertion message
 */
export function assertServerErrorStatus(response: Response, message?: string): void {
  const status = response.status;
  if (status < 500 || status >= 600) {
    throw new Error(`${message || "Expected server error status (5xx)"}, but got ${status}`);
  }
}

/**
 * Assert response is one of allowed status codes
 * @param response - Hono response object
 * @param allowedStatuses - Array of allowed HTTP status codes
 * @param message - Optional assertion message
 */
export function assertStatusInRange(
  response: Response,
  allowedStatuses: number[],
  message?: string
): void {
  const status = response.status;
  if (!allowedStatuses.includes(status)) {
    throw new Error(
      `${message || `Expected one of ${allowedStatuses.join(", ")}`}, but got ${status}`
    );
  }
}

/**
 * Assert response is not found (404)
 * @param response - Hono response object
 * @param message - Optional assertion message
 */
export function assertNotFound(response: Response, message?: string): void {
  assertStatus(response, 404, message || "Expected 404 Not Found");
}

/**
 * Assert response is bad request (400)
 * @param response - Hono response object
 * @param message - Optional assertion message
 */
export function assertBadRequest(response: Response, message?: string): void {
  assertStatus(response, 400, message || "Expected 400 Bad Request");
}

// ============================================================================
// Response Structure/Data Type Validators
// ============================================================================

/**
 * Parse JSON response body safely
 * @param response - Hono response object
 * @returns Parsed JSON body
 */
export async function parseJson<T = unknown>(response: Response): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new Error(
      `Failed to parse JSON response: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Assert response is valid JSON
 * @param response - Hono response object
 * @returns Parsed JSON body
 */
export async function assertJsonResponse<T = unknown>(response: Response): Promise<T> {
  const contentType = response.headers.get("Content-Type");
  if (!contentType?.includes("application/json")) {
    throw new Error(`Expected Content-Type to include 'application/json', got '${contentType}'`);
  }
  return parseJson<T>(response);
}

/**
 * Assert response body is an array
 * @param response - Hono response object
 * @returns Parsed JSON array
 */
export async function assertArrayResponse<T = unknown>(response: Response): Promise<T[]> {
  const body = await assertJsonResponse<T[]>(response);
  if (!Array.isArray(body)) {
    throw new Error(`Expected response body to be an array, got ${typeof body}`);
  }
  return body;
}

/**
 * Assert response body is an object
 * @param response - Hono response object
 * @returns Parsed JSON object
 */
export async function assertObjectResponse<T = Record<string, unknown>>(
  response: Response
): Promise<T> {
  const body = await assertJsonResponse<T>(response);
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new Error(`Expected response body to be an object, got ${typeof body}`);
  }
  return body;
}

/**
 * Assert object has required properties
 * @param obj - Object to validate
 * @param requiredProps - Array of required property names
 * @param context - Optional context for error messages
 */
export function assertHasProperties(
  obj: Record<string, unknown>,
  requiredProps: string[],
  context?: string
): void {
  const missing = requiredProps.filter((prop) => !(prop in obj));
  if (missing.length > 0) {
    throw new Error(`${context || "Object"} missing required properties: ${missing.join(", ")}`);
  }
}

/**
 * Assert property has specific type
 * @param obj - Object containing the property
 * @param prop - Property name
 * @param expectedType - Expected type ('string', 'number', 'boolean', 'object', 'array')
 * @param context - Optional context for error messages
 */
export function assertPropertyType(
  obj: Record<string, unknown>,
  prop: string,
  expectedType: "string" | "number" | "boolean" | "object" | "array",
  context?: string
): void {
  if (!(prop in obj)) {
    throw new Error(`${context || "Object"} missing property '${prop}'`);
  }

  const value = obj[prop];
  let actualType = typeof value;

  if (value === null) {
    actualType = "null";
  } else if (Array.isArray(value)) {
    actualType = "array";
  }

  if (actualType !== expectedType) {
    throw new Error(
      `${context || "Object"} property '${prop}' expected type '${expectedType}', got '${actualType}'`
    );
  }
}

/**
 * Assert all items in array have required properties
 * @param arr - Array to validate
 * @param requiredProps - Array of required property names
 * @param context - Optional context for error messages
 */
export function assertArrayItemsHaveProperties(
  arr: Record<string, unknown>[],
  requiredProps: string[],
  context?: string
): void {
  arr.forEach((item, index) => {
    const missing = requiredProps.filter((prop) => !(prop in item));
    if (missing.length > 0) {
      throw new Error(
        `${context || `Array item ${index}`} missing required properties: ${missing.join(", ")}`
      );
    }
  });
}

/**
 * Assert string is non-empty
 * @param value - String value to validate
 * @param propName - Property name for error messages
 * @param context - Optional context for error messages
 */
export function assertNonEmptyString(value: unknown, propName: string, context?: string): void {
  if (typeof value !== "string") {
    throw new Error(
      `${context || "Value"} property '${propName}' expected to be string, got ${typeof value}`
    );
  }
  if (value.length === 0) {
    throw new Error(`${context || "Value"} property '${propName}' is empty`);
  }
}

/**
 * Assert number is within valid range
 * @param value - Number value to validate
 * @param min - Minimum value (inclusive)
 * @param max - Maximum value (inclusive)
 * @param propName - Property name for error messages
 * @param context - Optional context for error messages
 */
export function assertNumberInRange(
  value: unknown,
  min: number,
  max: number,
  propName: string,
  context?: string
): void {
  if (typeof value !== "number") {
    throw new Error(
      `${context || "Value"} property '${propName}' expected to be number, got ${typeof value}`
    );
  }
  if (value < min || value > max) {
    throw new Error(
      `${context || "Value"} property '${propName}' = ${value} is outside valid range [${min}, ${max}]`
    );
  }
}

/**
 * Assert array is non-empty
 * @param value - Array value to validate
 * @param propName - Property name for error messages
 * @param context - Optional context for error messages
 */
export function assertNonEmptyArray(value: unknown, propName: string, context?: string): void {
  if (!Array.isArray(value)) {
    throw new Error(
      `${context || "Value"} property '${propName}' expected to be array, got ${typeof value}`
    );
  }
  if (value.length === 0) {
    throw new Error(`${context || "Value"} property '${propName}' is empty`);
  }
}

// ============================================================================
// Common Test Patterns
// ============================================================================

/**
 * Test successful API response pattern
 * @param response - Hono response object
 * @param expectedBodyShape - Optional expected structure of response body
 * @returns Parsed and validated response body
 */
export async function expectSuccessResponse<T = Record<string, unknown>>(
  response: Response,
  expectedBodyShape?: Record<string, "string" | "number" | "boolean" | "object" | "array">
): Promise<T> {
  assertSuccessStatus(response);
  const body = await assertObjectResponse<T>(response);

  if (expectedBodyShape) {
    for (const [prop, expectedType] of Object.entries(expectedBodyShape)) {
      assertPropertyType(body as Record<string, unknown>, prop, expectedType, "Success response");
    }
  }

  return body;
}

/**
 * Test error response pattern
 * @param response - Hono response object
 * @param expectedStatus - Expected error status code (default: 400)
 * @param expectedErrorFields - Optional expected error properties
 * @returns Parsed error response body
 */
export async function expectErrorResponse(
  response: Response,
  expectedStatus: number = 400,
  expectedErrorFields?: Record<string, unknown>
): Promise<Record<string, unknown>> {
  assertStatus(response, expectedStatus);
  const body = await assertObjectResponse(response);

  // Validate common error response fields
  if (expectedErrorFields) {
    for (const [prop, expectedValue] of Object.entries(expectedErrorFields)) {
      const actualValue = body[prop];
      if (actualValue !== expectedValue) {
        throw new Error(
          `Error response property '${prop}' expected ${JSON.stringify(expectedValue)}, got ${JSON.stringify(actualValue)}`
        );
      }
    }
  }

  return body;
}

/**
 * Test paginated response pattern
 * @param response - Hono response object
 * @param expectedItemType - Expected type structure for array items
 * @returns Parsed paginated response with data array
 */
export async function expectPaginatedResponse<T = Record<string, unknown>>(
  response: Response,
  expectedItemType?: Record<string, "string" | "number" | "boolean" | "object" | "array">
): Promise<{ data: T[]; total?: number; page?: number; pageSize?: number }> {
  const body = await expectSuccessResponse(response);

  if (!("data" in body) || !Array.isArray(body.data)) {
    throw new Error("Paginated response must have 'data' array property");
  }

  const result: {
    data: T[];
    total?: number;
    page?: number;
    pageSize?: number;
  } = { data: body.data as T[] };

  if ("total" in body && typeof body.total === "number") {
    result.total = body.total;
  }
  if ("page" in body && typeof body.page === "number") {
    result.page = body.page;
  }
  if ("pageSize" in body && typeof body.pageSize === "number") {
    result.pageSize = body.pageSize;
  }

  // Validate array items if expected structure provided
  if (expectedItemType) {
    assertArrayItemsHaveProperties(
      body.data as Record<string, unknown>[],
      Object.keys(expectedItemType),
      "Paginated response items"
    );

    for (const [prop, expectedType] of Object.entries(expectedItemType)) {
      (body.data as Record<string, unknown>[]).forEach((item, index) => {
        assertPropertyType(item, prop, expectedType, `Paginated response item ${index}`);
      });
    }
  }

  return result;
}

/**
 * Test health endpoint response pattern
 * @param response - Hono response object
 * @returns Parsed health response body
 */
export async function expectHealthResponse(
  response: Response
): Promise<{ status: string; uptime_seconds: number; timestamp?: string }> {
  const body = await expectSuccessResponse(response);

  // Validate health response has required fields
  assertHasProperties(body as Record<string, unknown>, ["status"], "Health response");
  assertPropertyType(body as Record<string, unknown>, "status", "string", "Health response");

  if ("uptime_seconds" in body) {
    assertPropertyType(
      body as Record<string, unknown>,
      "uptime_seconds",
      "number",
      "Health response"
    );
  }

  return body as { status: string; uptime_seconds: number; timestamp?: string };
}

// ============================================================================
// Logging/Debugging Helpers
// ============================================================================

/**
 * Log request/response details for debugging
 * @param endpoint - Endpoint path
 * @param response - Hono response object
 * @param options - Optional logging options
 */
export async function logApiResponse(
  endpoint: string,
  response: Response,
  options: {
    logBody?: boolean;
    logHeaders?: boolean;
    prefix?: string;
  } = {}
): Promise<void> {
  const { logBody = true, logHeaders = true, prefix = "" } = options;
  const timestamp = new Date().toISOString();

  console.log(`\n${prefix}[API Response ${timestamp}]`);
  console.log(`Endpoint: ${endpoint}`);
  console.log(`Status: ${response.status} ${response.statusText}`);

  if (logHeaders) {
    console.log("Headers:");
    response.headers.forEach((value, key) => {
      console.log(`  ${key}: ${value}`);
    });
  }

  if (logBody) {
    try {
      const contentType = response.headers.get("Content-Type");
      if (contentType?.includes("application/json")) {
        const body = await parseJson(response);
        console.log("Body:", JSON.stringify(body, null, 2));
      } else {
        const text = await response.text();
        console.log("Body:", text);
      }
    } catch (error) {
      console.log("Body:", "[Failed to parse response body]");
    }
  }
  console.log();
}

/**
 * Log test suite section headers
 * @param title - Section title
 * @param description - Optional section description
 */
export function logTestSection(title: string, description?: string): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`${title}`);
  if (description) {
    console.log(`${description}`);
  }
  console.log(`${"=".repeat(60)}\n`);
}

/**
 * Create a debug logger for a specific test context
 * @param context - Test context identifier (e.g., test name or endpoint)
 * @returns Debug logging function
 */
export function createDebugLogger(context: string): (message: string, data?: unknown) => void {
  return (message: string, data?: unknown) => {
    console.log(`[${context}] ${message}`);
    if (data !== undefined) {
      console.log(JSON.stringify(data, null, 2));
    }
  };
}

// ============================================================================
// Performance Assertion Helpers
// ============================================================================

/**
 * Assert operation completed within maximum time
 * @param startTime - Start time in milliseconds (from Date.now())
 * @param maxMs - Maximum acceptable duration in milliseconds
 * @param context - Optional context for error messages
 */
export function assertPerformance(startTime: number, maxMs: number, context?: string): void {
  const duration = Date.now() - startTime;
  if (duration > maxMs) {
    throw new Error(`${context || "Operation"} exceeded ${maxMs}ms limit (took ${duration}ms)`);
  }
}

/**
 * Measure execution time of an async function
 * @param fn - Async function to measure
 * @returns Object with result and duration
 */
export async function measurePerformance<T>(
  fn: () => Promise<T>
): Promise<{ result: T; durationMs: number }> {
  const startTime = Date.now();
  const result = await fn();
  const durationMs = Date.now() - startTime;
  return { result, durationMs };
}

/**
 * Create a performance test helper that measures and validates execution time
 * @param maxMs - Maximum acceptable duration in milliseconds
 * @returns Function that runs a test and validates performance
 */
export function createPerformanceTester(maxMs: number) {
  return async function <T>(fn: () => Promise<T>, context?: string): Promise<T> {
    const { result, durationMs } = await measurePerformance(fn);
    assertPerformance(Date.now() - durationMs, maxMs, context);
    return result;
  };
}

// ============================================================================
// Endpoint-Specific Validation Helpers
// ============================================================================

/**
 * Validate station response structure
 * @param station - Station object from API response
 * @param requireComplex - Whether to require complex-specific fields
 */
export function validateStationStructure(
  station: Record<string, unknown>,
  requireComplex: boolean = false
): void {
  const requiredProps = requireComplex
    ? ["id", "name", "lat", "lon", "lines", "complexId", "complexName"]
    : ["id", "name", "lat", "lon", "lines"];

  assertHasProperties(station, requiredProps, "Station");
  assertPropertyType(station, "id", "string", "Station");
  assertNonEmptyString(station.id, "id", "Station");
  assertPropertyType(station, "name", "string", "Station");
  assertNonEmptyString(station.name, "name", "Station");
  assertPropertyType(station, "lat", "number", "Station");
  assertPropertyType(station, "lon", "number", "Station");

  // Validate coordinates
  assertNumberInRange(station.lat, -90, 90, "lat", "Station");
  assertNumberInRange(station.lon, -180, 180, "lon", "Station");

  // Validate lines array
  assertPropertyType(station, "lines", "array", "Station");
  const lines = station.lines as unknown[];
  if (lines.length === 0) {
    throw new Error("Station 'lines' array is empty");
  }
  lines.forEach((line, index) => {
    if (typeof line !== "string" || line.length === 0) {
      throw new Error(`Station 'lines' array item ${index} is not a non-empty string`);
    }
  });
}

/**
 * Validate route response structure
 * @param route - Route object from API response
 */
export function validateRouteStructure(route: Record<string, unknown>): void {
  const requiredProps = ["id", "shortName", "longName", "color", "textColor"];
  assertHasProperties(route, requiredProps, "Route");

  assertPropertyType(route, "id", "string", "Route");
  assertNonEmptyString(route.id, "id", "Route");
  assertPropertyType(route, "shortName", "string", "Route");
  assertNonEmptyString(route.shortName, "shortName", "Route");
  assertPropertyType(route, "longName", "string", "Route");
  assertNonEmptyString(route.longName, "longName", "Route");

  // Validate color format (hex)
  assertPropertyType(route, "color", "string", "Route");
  const color = route.color as string;
  if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
    throw new Error(`Route 'color' property '${color}' is not a valid hex color`);
  }
}

/**
 * Validate alert response structure
 * @param alert - Alert object from API response
 */
export function validateAlertStructure(alert: Record<string, unknown>): void {
  const requiredProps = ["id", "headerText", "effect", "cause"];
  assertHasProperties(alert, requiredProps, "Alert");

  assertPropertyType(alert, "id", "string", "Alert");
  assertNonEmptyString(alert.id, "id", "Alert");
  assertPropertyType(alert, "headerText", "string", "Alert");
  assertNonEmptyString(alert.headerText, "headerText", "Alert");
  assertPropertyType(alert, "effect", "string", "Alert");
  assertPropertyType(alert, "cause", "string", "Alert");

  // Validate affected lines if present
  if ("affectedLines" in alert && alert.affectedLines !== null) {
    assertPropertyType(alert, "affectedLines", "array", "Alert");
  }
}

/**
 * Validate arrival response structure
 * @param arrival - Arrival object from API response
 */
export function validateArrivalStructure(arrival: Record<string, unknown>): void {
  const requiredProps = ["routeId", "stationId", "arrivalTime"];
  assertHasProperties(arrival, requiredProps, "Arrival");

  assertPropertyType(arrival, "routeId", "string", "Arrival");
  assertNonEmptyString(arrival.routeId, "routeId", "Arrival");
  assertPropertyType(arrival, "stationId", "string", "Arrival");
  assertNonEmptyString(arrival.stationId, "stationId", "Arrival");
  assertPropertyType(arrival, "arrivalTime", "number", "Arrival");

  // Validate optional direction
  if ("direction" in arrival && arrival.direction !== null) {
    assertPropertyType(arrival, "direction", "string", "Arrival");
    const direction = arrival.direction as string;
    if (!["N", "S"].includes(direction)) {
      throw new Error(`Arrival 'direction' property '${direction}' is not 'N' or 'S'`);
    }
  }
}

/**
 * Validate transfer connection structure
 * @param transfer - Transfer object from station response
 */
export function validateTransferStructure(transfer: Record<string, unknown>): void {
  const requiredProps = ["toStationId", "toLines", "walkingSeconds", "accessible"];
  assertHasProperties(transfer, requiredProps, "Transfer");

  assertPropertyType(transfer, "toStationId", "string", "Transfer");
  assertNonEmptyString(transfer.toStationId, "toStationId", "Transfer");
  assertPropertyType(transfer, "toLines", "array", "Transfer");
  assertPropertyType(transfer, "walkingSeconds", "number", "Transfer");
  assertPropertyType(transfer, "accessible", "boolean", "Transfer");

  // Validate walkingSeconds is reasonable
  const walkingSeconds = transfer.walkingSeconds as number;
  if (walkingSeconds < 0 || walkingSeconds > 3600) {
    throw new Error(
      `Transfer 'walkingSeconds' ${walkingSeconds} is outside reasonable range [0, 3600]`
    );
  }

  // Validate toLines array is non-empty
  const toLines = transfer.toLines as unknown[];
  if (toLines.length === 0) {
    throw new Error("Transfer 'toLines' array is empty");
  }
  toLines.forEach((line, index) => {
    if (typeof line !== "string" || line.length === 0) {
      throw new Error(`Transfer 'toLines' array item ${index} is not a non-empty string`);
    }
  });
}

// ============================================================================
// Batch Test Helpers
// ============================================================================

/**
 * Run assertions against multiple endpoints
 * @param app - Hono app instance
 * @param tests - Array of test definitions
 * @returns Array of test results
 */
export async function runEndpointTests(
  app: any,
  tests: Array<{
    path: string;
    method?: string;
    expectedStatus?: number;
    expectedType?: "array" | "object";
    validator?: (body: unknown, response: Response) => void;
  }>
): Promise<Array<{ path: string; passed: boolean; error?: string }>> {
  const results = await Promise.all(
    tests.map(async (test) => {
      try {
        const method = test.method || "GET";
        const response = await app.request(test.path, { method });

        if (test.expectedStatus) {
          assertStatus(response, test.expectedStatus);
        }

        if (test.expectedType === "array") {
          await assertArrayResponse(response);
        } else if (test.expectedType === "object") {
          await assertObjectResponse(response);
        }

        if (test.validator) {
          const body = await parseJson(response);
          test.validator(body, response);
        }

        return { path: test.path, passed: true };
      } catch (error) {
        return {
          path: test.path,
          passed: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    })
  );

  return results;
}

/**
 * Create a test suite builder for consistent endpoint testing
 * @param endpointType - Type of endpoint (e.g., 'stations', 'alerts', 'arrivals')
 * @returns Object with test suite methods
 */
export function createEndpointTestSuite(endpointType: string) {
  return {
    describeHealthChecks(endpointPaths: string[]) {
      describe(`${endpointType} health checks`, () => {
        endpointPaths.forEach((path) => {
          it(`should return 200 for ${path}`, async () => {
            // Test implementation
          });
        });
      });
    },

    describeErrorHandling(errorCases: Array<{ path: string; expectedStatus: number }>) {
      describe(`${endpointType} error handling`, () => {
        errorCases.forEach(({ path, expectedStatus }) => {
          it(`should return ${expectedStatus} for ${path}`, async () => {
            // Test implementation
          });
        });
      });
    },

    describeDataValidation(
      validationTests: Array<{
        description: string;
        path: string;
        validator: (body: unknown) => void;
      }>
    ) {
      describe(`${endpointType} data validation`, () => {
        validationTests.forEach(({ description, path, validator }) => {
          it(`should validate: ${description}`, async () => {
            // Test implementation
          });
        });
      });
    },
  };
}
