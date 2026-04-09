/**
 * Mass Assignment protection middleware.
 *
 * OWASP A01:2021 - Broken Access Control
 *
 * Prevents mass assignment attacks by:
 * - Filtering request bodies to only allow specified fields
 * - Blocking nested object modifications when not expected
 * - Validating allowed field names against patterns
 * - Providing explicit allow-lists for each endpoint
 *
 * Mass assignment occurs when an application automatically binds request
 * parameters to object fields without filtering, allowing attackers to modify
 * sensitive fields (e.g., isAdmin, role, credits) by including them in requests.
 */

import type { Context, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { logger } from "../observability/logger.js";
import { securityLogger } from "./security-logging.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Mass assignment protection options.
 */
export interface MassAssignmentOptions {
  /** Allowed field names (allow-list) */
  allowedFields?: string[];
  /** Blocked field names (deny-list) */
  blockedFields?: string[];
  /** Allow nested objects (default: false) */
  allowNested?: boolean;
  /** Maximum depth for nested objects (default: 1) */
  maxDepth?: number;
  /** Field name validation pattern (default: alphanumeric, underscore, hyphen) */
  fieldPattern?: RegExp;
  /** Strip unknown fields instead of rejecting (default: false) */
  stripUnknown?: boolean;
}

/**
 * Mass assignment violation details.
 */
interface MassAssignmentViolation {
  /** Type of violation */
  type: "blocked_field" | "unknown_field" | "nested_object" | "invalid_field_name";
  /** The field that caused the violation */
  field: string;
  /** The value that was rejected */
  value?: unknown;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default field name pattern.
 * Allows alphanumeric characters, underscores, and hyphens.
 */
const DEFAULT_FIELD_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * Common sensitive field names that should always be blocked.
 */
const SENSITIVE_FIELDS = [
  "id",
  "isAdmin",
  "is_admin",
  "admin",
  "role",
  "roles",
  "permissions",
  "credits",
  "balance",
  "verified",
  "active",
  "status",
  "createdAt",
  "updated_at",
  "deletedAt",
  "deleted_at",
  "owner",
  "userId",
  "user_id",
  "organizationId",
  "organization_id",
  "apiKey",
  "api_key",
  "token",
  "password",
  "passwordHash",
  "password_hash",
  "email",
  "emailVerified",
  "email_verified",
  "phoneNumber",
  "phone_number",
];

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate a field name against a pattern.
 */
function isValidFieldName(fieldName: string, pattern: RegExp): boolean {
  return pattern.test(fieldName);
}

/**
 * Check if a field is in the sensitive fields list.
 */
function isSensitiveField(fieldName: string): boolean {
  const lowerFieldName = fieldName.toLowerCase();
  return SENSITIVE_FIELDS.some((sensitive) => sensitive.toLowerCase() === lowerFieldName);
}

/**
 * Validate an object structure for mass assignment vulnerabilities.
 *
 * Checks:
 * - Field names are valid
 * - No sensitive fields are present
 * - No nested objects (if not allowed)
 * - Maximum depth is not exceeded
 */
export function validateMassAssignment(
  data: Record<string, unknown>,
  options: MassAssignmentOptions = {}
): { valid: boolean; violations: MassAssignmentViolation[]; sanitized?: Record<string, unknown> } {
  const {
    allowedFields = [],
    blockedFields = [],
    allowNested = false,
    maxDepth = 1,
    fieldPattern = DEFAULT_FIELD_PATTERN,
    stripUnknown = false,
  } = options;

  const violations: MassAssignmentViolation[] = [];
  const sanitized: Record<string, unknown> = {};

  /**
   * Recursively validate an object.
   */
  function validateObject(
    obj: Record<string, unknown>,
    depth: number,
    path = ""
  ): { valid: boolean; violations: MassAssignmentViolation[] } {
    let valid = true;
    const objViolations: MassAssignmentViolation[] = [];

    for (const [fieldName, value] of Object.entries(obj)) {
      const fullPath = path ? `${path}.${fieldName}` : fieldName;

      // Check field name pattern
      if (!isValidFieldName(fieldName, fieldPattern)) {
        objViolations.push({
          type: "invalid_field_name",
          field: fullPath,
          value,
        });
        valid = false;
        continue;
      }

      // Check for sensitive fields
      if (isSensitiveField(fieldName)) {
        objViolations.push({
          type: "blocked_field",
          field: fullPath,
          value,
        });
        valid = false;
        continue;
      }

      // Check explicit block list
      if (blockedFields.includes(fieldName)) {
        objViolations.push({
          type: "blocked_field",
          field: fullPath,
          value,
        });
        valid = false;
        continue;
      }

      // Check allow list (if configured)
      if (allowedFields.length > 0 && !allowedFields.includes(fieldName)) {
        objViolations.push({
          type: "unknown_field",
          field: fullPath,
          value,
        });
        if (!stripUnknown) {
          valid = false;
        }
        continue;
      }

      // Check for nested objects
      if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        // For nested objects, check if the parent field name is allowed
        if (allowedFields.length > 0 && !allowedFields.includes(fieldName)) {
          objViolations.push({
            type: "unknown_field",
            field: fullPath,
            value,
          });
          if (!stripUnknown) {
            valid = false;
          }
          continue;
        }

        if (!allowNested) {
          objViolations.push({
            type: "nested_object",
            field: fullPath,
            value,
          });
          valid = false;
          continue;
        }

        // Check depth limit
        if (depth >= maxDepth) {
          objViolations.push({
            type: "nested_object",
            field: fullPath,
            value,
          });
          valid = false;
          continue;
        }

        // Recursively validate nested object
        const nestedResult = validateObject(value as Record<string, unknown>, depth + 1, fullPath);
        if (!nestedResult.valid) {
          valid = false;
        }
        objViolations.push(...nestedResult.violations);
      }

      // Add to sanitized if valid
      if (stripUnknown || valid) {
        sanitized[fieldName] = value;
      }
    }

    return { valid, violations: objViolations };
  }

  const result = validateObject(data, 0);

  // Add violations from nested validation
  violations.push(...result.violations);

  // Determine if validation passed
  // When stripUnknown is true, unknown_field violations don't cause failure
  const hasBlockingViolation = violations.some((v) => v.type !== "unknown_field" || !stripUnknown);

  return {
    valid: result.valid && !hasBlockingViolation,
    violations,
    sanitized: stripUnknown ? sanitized : undefined,
  };
}

/**
 * Filter an object to only include allowed fields.
 *
 * This is a helper function that returns a new object with only the
 * specified fields. Useful for explicitly selecting fields from user input.
 */
export function filterAllowedFields<T extends Record<string, unknown>>(
  data: T,
  allowedFields: (string & keyof T)[]
): Partial<T> {
  const filtered = {} as Partial<T>;

  for (const field of allowedFields) {
    if (field in data) {
      filtered[field] = data[field];
    }
  }

  return filtered;
}

/**
 * Remove sensitive fields from an object.
 *
 * This is a helper function that returns a new object with sensitive
 * fields removed. Useful for sanitizing data before sending to clients.
 */
export function removeSensitiveFields<T extends Record<string, unknown>>(
  data: T,
  additionalFields?: string[]
): Partial<T> {
  const sensitiveSet = new Set(SENSITIVE_FIELDS);
  if (additionalFields) {
    for (const field of additionalFields) {
      sensitiveSet.add(field);
    }
  }

  const sanitized = {} as Partial<T>;

  for (const [key, value] of Object.entries(data)) {
    if (!sensitiveSet.has(key)) {
      // Use type assertion to bypass the index signature constraint
      (sanitized as Record<string, unknown>)[key] = value;
    }
  }

  return sanitized;
}

// ============================================================================
// Middleware
// ============================================================================

/**
 * Mass assignment protection middleware factory.
 *
 * Validates request bodies against allow-lists to prevent mass assignment
 * attacks. Can be configured to strip unknown fields or reject the request.
 *
 * @example
 * ```ts
 * // Strip unknown fields from user updates
 * app.patch('/api/users/:id', massAssignmentProtection({
 *   allowedFields: ['name', 'preferences'],
 *   stripUnknown: true,
 * }));
 *
 * // Reject requests with blocked fields
 * app.post('/api/admin/users', massAssignmentProtection({
 *   blockedFields: ['role', 'isAdmin'],
 *   stripUnknown: false,
 * }));
 * ```
 */
export function massAssignmentProtection(options: MassAssignmentOptions = {}): MiddlewareHandler {
  return async (c, next) => {
    // Only process requests with JSON body
    const contentType = c.req.header("Content-Type");
    if (!contentType?.includes("application/json")) {
      return next();
    }

    try {
      const body = await c.req.json().catch(() => null);

      if (!body || typeof body !== "object") {
        return next();
      }

      const result = validateMassAssignment(body as Record<string, unknown>, options);

      if (!result.valid && !options.stripUnknown) {
        // Log the mass assignment attempt
        securityLogger.logSuspiciousActivity(
          c,
          "mass_assignment_attempt",
          `Mass assignment attempt blocked: ${result.violations.map((v) => v.field).join(", ")}`
        );

        throw new HTTPException(400, {
          message: "Invalid request fields",
        });
      }

      if (result.violations.length > 0 && options.stripUnknown) {
        // Replace body with sanitized version
        logger.info("Stripped unknown fields from request", {
          violations: result.violations,
          sanitized: result.sanitized,
        });

        // Store sanitized body for downstream handlers
        c.set("sanitizedBody", result.sanitized);
      }

      return next();
    } catch (error) {
      // If JSON parsing failed, let validation middleware handle it
      if (error instanceof SyntaxError) {
        return next();
      }
      throw error;
    }
  };
}

/**
 * Get the sanitized body from the context.
 *
 * This helper retrieves the sanitized body that was created by the
 * mass assignment middleware when stripUnknown is enabled.
 */
export function getSanitizedBody<T = Record<string, unknown>>(c: Context): T | undefined {
  return c.get("sanitizedBody") as T | undefined;
}

// ============================================================================
// Common Field Allow-Lists
// ============================================================================

/**
 * Allowed fields for push subscription updates.
 */
export const PUSH_SUBSCRIPTION_FIELDS = [
  "endpoint",
  "keys",
  "favorites",
  "quietHours",
  "morningScores",
] as const;

/**
 * Allowed fields for trip notes updates.
 */
export const TRIP_NOTES_FIELDS = ["notes"] as const;

/**
 * Allowed fields for context settings updates.
 */
export const CONTEXT_SETTINGS_FIELDS = ["enabled", "autoSwitch", "confidenceThreshold"] as const;

/**
 * Allowed fields for commute analysis requests.
 */
export const COMMUTE_ANALYZE_FIELDS = [
  "originId",
  "destinationId",
  "preferredLines",
  "commuteId",
  "accessibleMode",
] as const;
