/**
 * API Response Validation Utilities
 *
 * Provides comprehensive validation functions for API responses in MTA My Way.
 * These utilities help ensure API responses meet expected structure, status codes,
 * and data type requirements with detailed error messages for debugging.
 *
 * @packageDocumentation
 */

import { expect } from "vitest";
import type {
  ArrivalTime,
  ComplexIndex,
  DelayPrediction,
  EquipmentStatus,
  Route,
  RouteIndex,
  Station,
  StationAlert,
  StationIndex,
  TripRecord,
} from "../types/index.js";

// ============================================================================
// Status Code Validation
// ============================================================================

/**
 * HTTP status code categories for validation messages
 */
const STATUS_CODE_MESSAGES: Record<number, string> = {
  200: "OK",
  201: "Created",
  204: "No Content",
  304: "Not Modified",
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  409: "Conflict",
  422: "Unprocessable Entity",
  429: "Too Many Requests",
  500: "Internal Server Error",
  503: "Service Unavailable",
  504: "Gateway Timeout",
};

/**
 * Validation result type
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate HTTP response status code
 *
 * @param response - Fetch API Response object
 * @param expectedStatus - Expected HTTP status code or array of acceptable codes
 * @returns Validation result with detailed error messages
 *
 * @example Validate successful response
 * ```typescript
 * const response = await fetch('/api/stations');
 * const result = validateStatusCode(response, 200);
 * if (!result.isValid) {
 *   console.error(result.errors);
 * }
 * ```
 *
 * @example Accept multiple status codes
 * ```typescript
 * const result = validateStatusCode(response, [200, 304]);
 * // Accepts both 200 OK and 304 Not Modified
 * ```
 */
export function validateStatusCode(
  response: Response,
  expectedStatus: number | number[]
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const acceptableCodes = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
  const actualStatus = response.status;

  if (!acceptableCodes.includes(actualStatus)) {
    const expectedList = acceptableCodes
      .map((code) => `${code} (${STATUS_CODE_MESSAGES[code] || "Unknown"})`)
      .join(", ");
    const actualMessage = STATUS_CODE_MESSAGES[actualStatus] || "Unknown";

    errors.push(`Expected status ${expectedList}, but got ${actualStatus} (${actualMessage})`);

    // Add context based on status code category
    if (actualStatus >= 400 && actualStatus < 500) {
      warnings.push(
        `Client error ${actualStatus}: Check request parameters, authentication, or rate limits`
      );
    } else if (actualStatus >= 500) {
      warnings.push(
        `Server error ${actualStatus}: Service may be degraded or temporarily unavailable`
      );
    } else if (actualStatus >= 300 && actualStatus < 400) {
      warnings.push(`Redirect ${actualStatus}: Response is a redirect, not the final destination`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate response is successful (2xx status code)
 *
 * @param response - Fetch API Response object
 * @returns Validation result
 *
 * @example Check for any successful response
 * ```typescript
 * const result = validateSuccessfulResponse(response);
 * // Accepts 200-299 status codes
 * ```
 */
export function validateSuccessfulResponse(response: Response): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!response.ok) {
    errors.push(
      `Response not successful: got status ${response.status} (${STATUS_CODE_MESSAGES[response.status] || "Unknown"})`
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate response is a client error (4xx status code)
 *
 * @param response - Fetch API Response object
 * @param expectedStatus - Specific 4xx code to expect (optional)
 * @returns Validation result
 */
export function validateClientError(response: Response, expectedStatus?: number): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (response.status < 400 || response.status >= 500) {
    errors.push(`Expected client error (4xx), but got status ${response.status}`);
  }

  if (expectedStatus && response.status !== expectedStatus) {
    errors.push(`Expected client error ${expectedStatus}, but got ${response.status}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate response is a server error (5xx status code)
 *
 * @param response - Fetch API Response object
 * @param expectedStatus - Specific 5xx code to expect (optional)
 * @returns Validation result
 */
export function validateServerError(response: Response, expectedStatus?: number): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (response.status < 500) {
    errors.push(`Expected server error (5xx), but got status ${response.status}`);
  }

  if (expectedStatus && response.status !== expectedStatus) {
    errors.push(`Expected server error ${expectedStatus}, but got ${response.status}`);
  }

  // Service Unailable warnings
  if (response.status === 503) {
    warnings.push("Service Unavailable: Feature may be disabled or temporarily down");
  } else if (response.status === 504) {
    warnings.push("Gateway Timeout: Upstream service did not respond in time");
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// Response Structure Validation
// ============================================================================

/**
 * Validate response has required fields
 *
 * @param body - Parsed JSON response body
 * @param requiredFields - Array of required field names (supports dot notation)
 * @returns Validation result
 *
 * @example Basic field validation
 * ```typescript
 * const body = await response.json();
 * const result = validateRequiredFields(body, ['id', 'name', 'lines']);
 * ```
 *
 * @example Nested field validation with dot notation
 * ```typescript
 * const result = validateRequiredFields(body, [
 *   'user.id',
 *   'user.preferences.theme',
 *   'metadata.timestamp'
 * ]);
 * ```
 */
export function validateRequiredFields(body: unknown, requiredFields: string[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const field of requiredFields) {
    const value = getNestedValue(body, field);

    if (value === undefined) {
      errors.push(`Missing required field: '${field}'`);
    } else if (value === null) {
      warnings.push(`Required field '${field}' is null`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate response has at least one of specified fields
 *
 * @param body - Parsed JSON response body
 * @param fieldNames - Array of field names (at least one must be present)
 * @returns Validation result
 *
 * @example Validate mutually inclusive fields
 * ```typescript
 * const result = validateAtLeastOneField(body, ['userId', 'guestId']);
 * // One of these must be present
 * ```
 */
export function validateAtLeastOneField(body: unknown, fieldNames: string[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const hasField = fieldNames.some((field) => getNestedValue(body, field) !== undefined);

  if (!hasField) {
    errors.push(`Response must have at least one of these fields: ${fieldNames.join(", ")}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate response body type matches expected type
 *
 * @param body - Parsed JSON response body
 * @param expectedType - Expected type name
 * @returns Validation result
 */
export function validateBodyType(
  body: unknown,
  expectedType: "object" | "array" | "string" | "number" | "boolean" | "null"
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const actualType = Array.isArray(body) ? "array" : typeof body;

  if (actualType !== expectedType) {
    errors.push(`Expected body type '${expectedType}', but got '${actualType}'`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate array response has minimum length
 *
 * @param body - Parsed JSON response body (should be array)
 * @param minLength - Minimum expected array length
 * @returns Validation result
 */
export function validateArrayLength(body: unknown, minLength: number): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!Array.isArray(body)) {
    errors.push(`Expected array, but got ${typeof body}`);
    return { isValid: false, errors, warnings };
  }

  if (body.length < minLength) {
    warnings.push(`Array length ${body.length} is less than minimum ${minLength}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// MTA Data Type Validators
// ============================================================================

/**
 * Validate Station object structure
 *
 * @param data - Data to validate as Station
 * @returns Validation result
 *
 * @example Validate station response
 * ```typescript
 * const station = await response.json();
 * const result = validateStation(station);
 * ```
 */
export function validateStation(data: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (typeof data !== "object" || data === null) {
    errors.push("Station must be an object");
    return { isValid: false, errors, warnings };
  }

  const station = data as Partial<Station>;

  // Required fields
  const requiredFields: (keyof Station)[] = [
    "id",
    "name",
    "lat",
    "lon",
    "lines",
    "northStopId",
    "southStopId",
    "ada",
    "borough",
  ];

  for (const field of requiredFields) {
    if (!(field in station)) {
      errors.push(`Station missing required field: '${field}'`);
    }
  }

  // Type validation
  if (typeof station.id !== "string") {
    errors.push(`Station.id must be a string, got ${typeof station.id}`);
  }

  if (typeof station.name !== "string") {
    errors.push(`Station.name must be a string, got ${typeof station.name}`);
  }

  if (typeof station.lat !== "number") {
    errors.push(`Station.lat must be a number, got ${typeof station.lat}`);
  } else if (station.lat < -90 || station.lat > 90) {
    errors.push(`Station.lat must be between -90 and 90, got ${station.lat}`);
  }

  if (typeof station.lon !== "number") {
    errors.push(`Station.lon must be a number, got ${typeof station.lon}`);
  } else if (station.lon < -180 || station.lon > 180) {
    errors.push(`Station.lon must be between -180 and 180, got ${station.lon}`);
  }

  if (!Array.isArray(station.lines)) {
    errors.push(`Station.lines must be an array, got ${typeof station.lines}`);
  } else if (station.lines.length === 0) {
    warnings.push("Station.lines is empty - station serves no lines");
  }

  if (typeof station.ada !== "boolean") {
    errors.push(`Station.ada must be a boolean, got ${typeof station.ada}`);
  }

  if (typeof station.borough !== "string") {
    errors.push(`Station.borough must be a string, got ${typeof station.borough}`);
  } else {
    const validBoroughs = ["manhattan", "brooklyn", "queens", "bronx", "staten-island"];
    if (!validBoroughs.includes(station.borough)) {
      warnings.push(`Station.borough '${station.borough}' is not a recognized borough`);
    }
  }

  // Optional fields validation
  if ("transfers" in station && !Array.isArray(station.transfers)) {
    errors.push(`Station.transfers must be an array, got ${typeof station.transfers}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate Route object structure
 *
 * @param data - Data to validate as Route
 * @returns Validation result
 */
export function validateRoute(data: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (typeof data !== "object" || data === null) {
    errors.push("Route must be an object");
    return { isValid: false, errors, warnings };
  }

  const route = data as Partial<Route>;

  // Required fields
  const requiredFields: (keyof Route)[] = [
    "id",
    "shortName",
    "longName",
    "color",
    "textColor",
    "feedId",
    "division",
    "stops",
    "isExpress",
  ];

  for (const field of requiredFields) {
    if (!(field in route)) {
      errors.push(`Route missing required field: '${field}'`);
    }
  }

  // Type validation
  if (typeof route.id !== "string") {
    errors.push(`Route.id must be a string, got ${typeof route.id}`);
  }

  if (typeof route.shortName !== "string") {
    errors.push(`Route.shortName must be a string, got ${typeof route.shortName}`);
  }

  if (typeof route.longName !== "string") {
    errors.push(`Route.longName must be a string, got ${typeof route.longName}`);
  }

  if (typeof route.color !== "string") {
    errors.push(`Route.color must be a string, got ${typeof route.color}`);
  } else if (!/^#[0-9A-Fa-f]{6}$/.test(route.color)) {
    errors.push(`Route.color must be a hex color code (e.g., #EE352E), got '${route.color}'`);
  }

  if (typeof route.textColor !== "string") {
    errors.push(`Route.textColor must be a string, got ${typeof route.textColor}`);
  }

  if (typeof route.isExpress !== "boolean") {
    errors.push(`Route.isExpress must be a boolean, got ${typeof route.isExpress}`);
  }

  if (!Array.isArray(route.stops)) {
    errors.push(`Route.stops must be an array, got ${typeof route.stops}`);
  } else if (route.stops.length === 0) {
    warnings.push("Route.stops is empty - route serves no stations");
  }

  // Division validation
  if (typeof route.division !== "string") {
    errors.push(`Route.division must be a string, got ${typeof route.division}`);
  } else if (!["A", "B", "C"].includes(route.division)) {
    warnings.push(`Route.division '${route.division}' is not a recognized division (A, B, or C)`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate ArrivalTime object structure
 *
 * @param data - Data to validate as ArrivalTime
 * @returns Validation result
 */
export function validateArrival(data: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (typeof data !== "object" || data === null) {
    errors.push("Arrival must be an object");
    return { isValid: false, errors, warnings };
  }

  const arrival = data as Partial<ArrivalTime>;

  // Required fields
  const requiredFields: (keyof ArrivalTime)[] = ["line", "direction", "arrivalTime", "minutesAway"];

  for (const field of requiredFields) {
    if (!(field in arrival)) {
      errors.push(`Arrival missing required field: '${field}'`);
    }
  }

  // Type validation
  if (typeof arrival.line !== "string") {
    errors.push(`Arrival.line must be a string, got ${typeof arrival.line}`);
  } else if (!/^[A-Z0-9]+$/.test(arrival.line)) {
    warnings.push(
      `Arrival.line '${arrival.line}' doesn't match expected pattern (uppercase alphanumeric)`
    );
  }

  if (typeof arrival.direction !== "string") {
    errors.push(`Arrival.direction must be a string, got ${typeof arrival.direction}`);
  } else if (!["N", "S", "E", "W"].includes(arrival.direction)) {
    warnings.push(
      `Arrival.direction '${arrival.direction}' is not a recognized direction (N, S, E, or W)`
    );
  }

  if (typeof arrival.arrivalTime !== "number") {
    errors.push(
      `Arrival.arrivalTime must be a number (timestamp), got ${typeof arrival.arrivalTime}`
    );
  } else if (arrival.arrivalTime < 0) {
    errors.push(`Arrival.arrivalTime must be a positive timestamp, got ${arrival.arrivalTime}`);
  }

  if (typeof arrival.minutesAway !== "number") {
    errors.push(`Arrival.minutesAway must be a number, got ${typeof arrival.minutesAway}`);
  } else if (arrival.minutesAway < 0) {
    warnings.push(`Arrival.minutesAway is negative - train may have departed`);
  } else if (arrival.minutesAway > 30) {
    warnings.push(`Arrival.minutesAway is ${arrival.minutesAway} - data may be stale`);
  }

  // Confidence validation (if present)
  if ("confidence" in arrival && typeof arrival.confidence !== "string") {
    errors.push(`Arrival.confidence must be a string, got ${typeof arrival.confidence}`);
  } else if (
    "confidence" in arrival &&
    typeof arrival.confidence === "string" &&
    !["high", "medium", "low"].includes(arrival.confidence)
  ) {
    warnings.push(
      `Arrival.confidence '${arrival.confidence}' is not recognized (expected: high, medium, low)`
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate Alert object structure
 *
 * @param data - Data to validate as StationAlert
 * @returns Validation result
 */
export function validateAlert(data: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (typeof data !== "object" || data === null) {
    errors.push("Alert must be an object");
    return { isValid: false, errors, warnings };
  }

  const alert = data as Partial<StationAlert>;

  // Required fields
  const requiredFields: (keyof StationAlert)[] = ["id", "severity", "headline"];

  for (const field of requiredFields) {
    if (!(field in alert)) {
      errors.push(`Alert missing required field: '${field}'`);
    }
  }

  // Type validation
  if (typeof alert.id !== "string") {
    errors.push(`Alert.id must be a string, got ${typeof alert.id}`);
  }

  if (typeof alert.severity !== "string") {
    errors.push(`Alert.severity must be a string, got ${typeof alert.severity}`);
  } else if (!["info", "warning", "severe"].includes(alert.severity)) {
    warnings.push(
      `Alert.severity '${alert.severity}' is not recognized (expected: info, warning, severe)`
    );
  }

  if (typeof alert.headline !== "string") {
    errors.push(`Alert.headline must be a string, got ${typeof alert.headline}`);
  }

  // Affected lines validation
  if ("affectedLines" in alert && !Array.isArray(alert.affectedLines)) {
    errors.push(`Alert.affectedLines must be an array, got ${typeof alert.affectedLines}`);
  }

  // Active period validation
  if ("activePeriod" in alert) {
    const activePeriod = alert.activePeriod;
    if (typeof activePeriod !== "object" || activePeriod === null) {
      errors.push(`Alert.activePeriod must be an object`);
    } else {
      if (!("start" in activePeriod) || typeof activePeriod.start !== "number") {
        errors.push(`Alert.activePeriod.start must be a number (timestamp)`);
      }
      if (!("end" in activePeriod) || typeof activePeriod.end !== "number") {
        errors.push(`Alert.activePeriod.end must be a number (timestamp)`);
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate TripRecord object structure
 *
 * @param data - Data to validate as TripRecord
 * @returns Validation result
 */
export function validateTripRecord(data: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (typeof data !== "object" || data === null) {
    errors.push("TripRecord must be an object");
    return { isValid: false, errors, warnings };
  }

  const trip = data as Partial<TripRecord>;

  // Required fields
  const requiredFields: (keyof TripRecord)[] = ["id", "date", "line", "source"];

  for (const field of requiredFields) {
    if (!(field in trip)) {
      errors.push(`TripRecord missing required field: '${field}'`);
    }
  }

  // Type validation
  if (typeof trip.id !== "string") {
    errors.push(`TripRecord.id must be a string, got ${typeof trip.id}`);
  }

  if (typeof trip.date !== "string") {
    errors.push(`TripRecord.date must be a string (ISO date), got ${typeof trip.date}`);
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(trip.date)) {
    warnings.push(`TripRecord.date '${trip.date}' doesn't match expected format (YYYY-MM-DD)`);
  }

  if (typeof trip.line !== "string") {
    errors.push(`TripRecord.line must be a string, got ${typeof trip.line}`);
  }

  if ("departureTime" in trip && typeof trip.departureTime !== "number") {
    errors.push(
      `TripRecord.departureTime must be a number (timestamp), got ${typeof trip.departureTime}`
    );
  }

  if ("arrivalTime" in trip && typeof trip.arrivalTime !== "number") {
    errors.push(
      `TripRecord.arrivalTime must be a number (timestamp), got ${typeof trip.arrivalTime}`
    );
  }

  if ("actualDurationMinutes" in trip && typeof trip.actualDurationMinutes !== "number") {
    errors.push(
      `TripRecord.actualDurationMinutes must be a number, got ${typeof trip.actualDurationMinutes}`
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate EquipmentStatus object structure
 *
 * @param data - Data to validate as EquipmentStatus
 * @returns Validation result
 */
export function validateEquipmentStatus(data: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (typeof data !== "object" || data === null) {
    errors.push("EquipmentStatus must be an object");
    return { isValid: false, errors, warnings };
  }

  const equipment = data as Partial<EquipmentStatus>;

  // Required fields
  const requiredFields: (keyof EquipmentStatus)[] = ["stationId", "equipmentType", "status"];

  for (const field of requiredFields) {
    if (!(field in equipment)) {
      errors.push(`EquipmentStatus missing required field: '${field}'`);
    }
  }

  // Type validation
  if (typeof equipment.stationId !== "string") {
    errors.push(`EquipmentStatus.stationId must be a string, got ${typeof equipment.stationId}`);
  }

  if (typeof equipment.equipmentType !== "string") {
    errors.push(
      `EquipmentStatus.equipmentType must be a string, got ${typeof equipment.equipmentType}`
    );
  } else {
    const validTypes = ["escalator", "elevator", "stairs"];
    if (!validTypes.includes(equipment.equipmentType)) {
      warnings.push(`EquipmentStatus.equipmentType '${equipment.equipmentType}' is not recognized`);
    }
  }

  if (typeof equipment.status !== "string") {
    errors.push(`EquipmentStatus.status must be a string, got ${typeof equipment.status}`);
  } else {
    const validStatuses = ["operational", "maintenance", "outage", "unknown"];
    if (!validStatuses.includes(equipment.status)) {
      warnings.push(`EquipmentStatus.status '${equipment.status}' is not recognized`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate DelayPrediction object structure
 *
 * @param data - Data to validate as DelayPrediction
 * @returns Validation result
 */
export function validateDelayPrediction(data: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (typeof data !== "object" || data === null) {
    errors.push("DelayPrediction must be an object");
    return { isValid: false, errors, warnings };
  }

  const prediction = data as Partial<DelayPrediction>;

  // Required fields
  const requiredFields: (keyof DelayPrediction)[] = [
    "routeId",
    "predictedDelayMinutes",
    "confidence",
    "timestamp",
  ];

  for (const field of requiredFields) {
    if (!(field in prediction)) {
      errors.push(`DelayPrediction missing required field: '${field}'`);
    }
  }

  // Type validation
  if (typeof prediction.routeId !== "string") {
    errors.push(`DelayPrediction.routeId must be a string, got ${typeof prediction.routeId}`);
  }

  if (typeof prediction.predictedDelayMinutes !== "number") {
    errors.push(
      `DelayPrediction.predictedDelayMinutes must be a number, got ${typeof prediction.predictedDelayMinutes}`
    );
  } else if (prediction.predictedDelayMinutes < 0) {
    warnings.push(
      `DelayPrediction.predictedDelayMinutes is negative - unusual for delay prediction`
    );
  }

  if (typeof prediction.confidence !== "number") {
    errors.push(`DelayPrediction.confidence must be a number, got ${typeof prediction.confidence}`);
  } else if (prediction.confidence < 0 || prediction.confidence > 1) {
    errors.push(`DelayPrediction.confidence must be between 0 and 1, got ${prediction.confidence}`);
  }

  if (typeof prediction.timestamp !== "number") {
    errors.push(
      `DelayPrediction.timestamp must be a number (timestamp), got ${typeof prediction.timestamp}`
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// Composite Validators
// ============================================================================

/**
 * Validate station list response
 *
 * @param response - Fetch API Response object
 * @returns Validation result
 *
 * @example Validate station list endpoint
 * ```typescript
 * const response = await fetch('/api/stations');
 * const result = await validateStationListResponse(response);
 * ```
 */
export async function validateStationListResponse(response: Response): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate status code
  const statusResult = validateStatusCode(response, 200);
  errors.push(...statusResult.errors);
  warnings.push(...statusResult.warnings);

  if (!statusResult.isValid) {
    return { isValid: false, errors, warnings };
  }

  // Validate content type
  const contentType = response.headers.get("Content-Type");
  if (!contentType?.includes("application/json")) {
    errors.push(`Expected JSON response, but got Content-Type: ${contentType}`);
    return { isValid: false, errors, warnings };
  }

  // Parse and validate body
  try {
    const body = await response.json();

    if (!Array.isArray(body)) {
      errors.push(`Expected array of stations, but got ${typeof body}`);
      return { isValid: false, errors, warnings };
    }

    if (body.length === 0) {
      warnings.push("Station list is empty");
    }

    // Validate first station as sample
    if (body.length > 0) {
      const firstStationResult = validateStation(body[0]);
      if (!firstStationResult.isValid) {
        errors.push(
          `First station failed validation:`,
          ...firstStationResult.errors.map((e) => `  ${e}`)
        );
      }
      warnings.push(...firstStationResult.warnings.map((w) => `First station: ${w}`));
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  } catch (error) {
    errors.push(
      `Failed to parse JSON response: ${error instanceof Error ? error.message : String(error)}`
    );
    return { isValid: false, errors, warnings };
  }
}

/**
 * Validate arrival list response
 *
 * @param response - Fetch API Response object
 * @param stationId - Expected station ID for validation context
 * @returns Validation result
 */
export async function validateArrivalListResponse(
  response: Response,
  stationId?: string
): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate status code
  const statusResult = validateStatusCode(response, 200);
  errors.push(...statusResult.errors);
  warnings.push(...statusResult.warnings);

  if (!statusResult.isValid) {
    return { isValid: false, errors, warnings };
  }

  // Validate content type
  const contentType = response.headers.get("Content-Type");
  if (!contentType?.includes("application/json")) {
    errors.push(`Expected JSON response, but got Content-Type: ${contentType}`);
    return { isValid: false, errors, warnings };
  }

  // Parse and validate body
  try {
    const body = await response.json();

    if (!Array.isArray(body)) {
      errors.push(`Expected array of arrivals, but got ${typeof body}`);
      return { isValid: false, errors, warnings };
    }

    if (body.length === 0) {
      warnings.push("No arrivals available - service may be suspended or data is stale");
    }

    // Validate sample arrival
    if (body.length > 0) {
      const firstArrivalResult = validateArrival(body[0]);
      if (!firstArrivalResult.isValid) {
        errors.push(
          `First arrival failed validation:`,
          ...firstArrivalResult.errors.map((e) => `  ${e}`)
        );
      }
      warnings.push(...firstArrivalResult.warnings.map((w) => `First arrival: ${w}`));
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  } catch (error) {
    errors.push(
      `Failed to parse JSON response: ${error instanceof Error ? error.message : String(error)}`
    );
    return { isValid: false, errors, warnings };
  }
}

/**
 * Validate health check response
 *
 * @param response - Fetch API Response object
 * @returns Validation result
 */
export async function validateHealthResponse(response: Response): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate status code
  const statusResult = validateStatusCode(response, [200, 503]);
  errors.push(...statusResult.errors);
  warnings.push(...statusResult.warnings);

  if (!statusResult.isValid) {
    return { isValid: false, errors, warnings };
  }

  // Parse and validate body
  try {
    const body = await response.json();

    // Check for common health check fields
    const fieldResult = validateAtLeastOneField(body, ["status", "healthy", "ok", "uptime"]);
    errors.push(...fieldResult.errors);
    warnings.push(...fieldResult.warnings);

    // If service is unhealthy, that's a warning not an error (503 is valid)
    if (response.status === 503) {
      warnings.push("Service reported unhealthy status (degraded mode)");
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  } catch (error) {
    errors.push(
      `Failed to parse JSON response: ${error instanceof Error ? error.message : String(error)}`
    );
    return { isValid: false, errors, warnings };
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get nested value from object using dot notation
 *
 * @param obj - Object to traverse
 * @param path - Dot-notation path (e.g., 'user.preferences.theme')
 * @returns Value at path or undefined
 */
function getNestedValue(obj: unknown, path: string): unknown {
  const keys = path.split(".");
  let current: unknown = obj;

  for (const key of keys) {
    if (typeof current !== "object" || current === null) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }

  return current;
}

/**
 * Format validation result for display
 *
 * @param result - Validation result
 * @param context - Optional context description
 * @returns Formatted error/warning messages
 *
 * @example Format validation errors
 * ```typescript
 * const result = validateStation(data);
 * if (!result.isValid) {
 *   console.log(formatValidationResult(result, 'Station validation'));
 * }
 * ```
 */
export function formatValidationResult(result: ValidationResult, context = "Validation"): string {
  const lines: string[] = [];

  if (result.isValid) {
    lines.push(`✅ ${context} passed`);
  } else {
    lines.push(`❌ ${context} failed`);
  }

  if (result.errors.length > 0) {
    lines.push("\nErrors:");
    result.errors.forEach((error) => lines.push(`  - ${error}`));
  }

  if (result.warnings.length > 0) {
    lines.push("\nWarnings:");
    result.warnings.forEach((warning) => lines.push(`  ⚠️  ${warning}`));
  }

  return lines.join("\n");
}

/**
 * Assert validation result throws if invalid
 *
 * @param result - Validation result
 * @param message - Optional error message
 * @throws Error if validation failed
 *
 * @example Assert validation passes
 * ```typescript
 * const result = validateStation(data);
 * assertValidation(result, 'Station data validation');
 * ```
 */
export function assertValidation(result: ValidationResult, message = "Validation failed"): void {
  if (!result.isValid) {
    const errorMessages = result.errors.map((e) => `  - ${e}`).join("\n");
    throw new Error(`${message}:\n${errorMessages}`);
  }
}

/**
 * Validate with automatic assertion (convenience function)
 *
 * @param validator - Validation function that returns ValidationResult
 * @param data - Data to validate
 * @param context - Optional context for error messages
 * @throws Error if validation failed
 *
 * @example Validate and assert in one call
 * ```typescript
 * assertValid(validateStation, data, 'Station data');
 * ```
 */
export function assertValid<T>(
  validator: (data: T) => ValidationResult,
  data: T,
  context = "Validation"
): void {
  const result = validator(data);
  assertValidation(result, context);
}
