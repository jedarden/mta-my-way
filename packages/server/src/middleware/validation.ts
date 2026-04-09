/**
 * Zod validation helpers for Hono route handlers.
 *
 * Provides validation for:
 * - Request bodies (JSON)
 * - Query parameters
 * - Path parameters
 *
 * Returns 400 with structured error details on validation failure.
 */

import type { Context } from "hono";
import type { ZodError, ZodSchema } from "zod";
import { ZodIssueCode } from "zod";
import { logger } from "../observability/logger.js";
import { sanitizeObject, sanitizeStringSimple } from "./sanitization.js";

interface ValidationErrorDetail {
  field: string;
  message: string;
}

interface ValidationErrorResponse {
  error: "validation failed";
  details: ValidationErrorDetail[];
}

function formatZodError(error: ZodError): ValidationErrorDetail[] {
  return error.issues.map((issue) => {
    // For nested objects, join the path with dots
    const field = issue.path.map((p) => (typeof p === "number" ? `[${p}]` : p)).join(".");

    if (issue.code === ZodIssueCode.invalid_enum_value) {
      return {
        field,
        message: `Must be one of: ${issue.options.join(", ")}`,
      };
    }

    if (issue.code === ZodIssueCode.too_small) {
      if (issue.type === "string") {
        return {
          field,
          message: issue.message || `String must be at least ${issue.minimum} character(s)`,
        };
      }
      if (issue.type === "array") {
        return {
          field,
          message: issue.message || `Array must contain at least ${issue.minimum} item(s)`,
        };
      }
      if (issue.type === "number") {
        return { field, message: issue.message || `Number must be at least ${issue.minimum}` };
      }
    }

    if (issue.code === ZodIssueCode.too_big) {
      if (issue.type === "string") {
        return {
          field,
          message: issue.message || `String must be at most ${issue.maximum} character(s)`,
        };
      }
      if (issue.type === "array") {
        return {
          field,
          message: issue.message || `Array must contain at most ${issue.maximum} item(s)`,
        };
      }
      if (issue.type === "number") {
        return { field, message: issue.message || `Number must be at most ${issue.maximum}` };
      }
    }

    return { field, message: issue.message || `Invalid value` };
  });
}

/**
 * Parse and validate a JSON request body against a Zod schema.
 * Returns the validated data on success, or a Response on failure.
 * Caller must check `if (body instanceof Response) return body;`
 *
 * Sanitizes all string inputs to prevent XSS, SQL injection, and other attacks.
 */
export async function validateBody<T>(c: Context, schema: ZodSchema<T>): Promise<T | Response> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    const errorResponse: ValidationErrorResponse = {
      error: "validation failed",
      details: [{ field: "", message: "Request body must be valid JSON" }],
    };
    logger.warn("Request body validation failed: invalid JSON", {
      path: c.req.path,
      method: c.req.method,
    });
    return c.json(errorResponse, 400);
  }

  // Sanitize string fields in the body before validation
  // This prevents XSS, SQL injection, and other injection attacks
  body = sanitizeObject(body);

  const result = schema.safeParse(body);
  if (!result.success) {
    const errorResponse: ValidationErrorResponse = {
      error: "validation failed",
      details: formatZodError(result.error),
    };
    logger.warn("Request body validation failed", {
      path: c.req.path,
      method: c.req.method,
      errors: formatZodError(result.error),
    });
    return c.json(errorResponse, 400);
  }

  return result.data;
}

/**
 * Sanitize path parameters to prevent injection attacks.
 *
 * Path parameters can be exploited for:
 * - Path traversal attacks (../../)
 * - Command injection
 * - XSS via reflected parameters
 *
 * This function sanitizes path parameter values before they reach
 * the route handler, providing defense in depth.
 */
function sanitizePathParams(params: Record<string, string>): Record<string, string> {
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    // Sanitize the key as well
    const sanitizedKey = sanitizeStringSimple(key, {
      normalizeWhitespace: false,
      maxLength: 100,
    });

    // Sanitize the value - focus on path traversal and command injection
    // for path params since they're typically IDs or enum values
    sanitized[sanitizedKey] = sanitizeStringSimple(value, {
      stripHtml: true,
      preventSqlInjection: true,
      preventCommandInjection: true,
      preventPathTraversal: true,
      normalizeWhitespace: false, // Preserve ID formatting
      maxLength: 200, // Generous limit for path params
    });
  }
  return sanitized;
}

/**
 * Validate query parameters against a Zod schema.
 * Returns the validated data on success, or a Response on failure.
 * Caller must check `if (query instanceof Response) return query;`
 *
 * Uses sanitized query parameters from the inputSanitization middleware
 * if available, providing defense in depth against injection attacks.
 */
export function validateQuery<T>(c: Context, schema: ZodSchema<T>): T | Response {
  // Prefer sanitized query parameters from the inputSanitization middleware
  // This provides defense in depth - sanitization happens before validation
  const sanitizedQuery = (c.get("sanitizedQuery") as Record<string, string>) || undefined;

  // Fall back to raw query params if sanitization hasn't run
  const queryParams = sanitizedQuery || c.req.query();

  const result = schema.safeParse(queryParams);
  if (!result.success) {
    const errorResponse: ValidationErrorResponse = {
      error: "validation failed",
      details: formatZodError(result.error),
    };
    logger.warn("Query parameter validation failed", {
      path: c.req.path,
      method: c.req.method,
      errors: formatZodError(result.error),
    });
    return c.json(errorResponse, 400);
  }
  return result.data;
}

/**
 * Validate path parameters against a Zod schema.
 * Returns the validated data on success, or a Response on failure.
 * Caller must check `if (params instanceof Response) return params;`
 *
 * Sanitizes path parameters to prevent injection attacks including
 * path traversal, command injection, and reflected XSS.
 */
export function validateParams<T>(c: Context, schema: ZodSchema<T>): T | Response {
  const pathParams = c.req.param();

  // Sanitize path parameters before validation
  const sanitizedParams = sanitizePathParams(pathParams);

  const result = schema.safeParse(sanitizedParams);
  if (!result.success) {
    const errorResponse: ValidationErrorResponse = {
      error: "validation failed",
      details: formatZodError(result.error),
    };
    logger.warn("Path parameter validation failed", {
      path: c.req.path,
      method: c.req.method,
      errors: formatZodError(result.error),
    });
    return c.json(errorResponse, 400);
  }
  return result.data;
}
