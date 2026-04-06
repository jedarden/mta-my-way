/**
 * Zod validation helper for Hono route handlers.
 *
 * Parses the request body and validates it against a Zod schema.
 * Returns 400 with structured error details on validation failure.
 */

import type { Context } from "hono";
import type { ZodError, ZodSchema } from "zod";
import { ZodIssueCode } from "zod";

interface ValidationErrorDetail {
  field: string;
  message: string;
}

interface ValidationErrorResponse {
  error: "Validation failed";
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
 */
export async function validateBody<T>(c: Context, schema: ZodSchema<T>): Promise<T | Response> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    const errorResponse: ValidationErrorResponse = {
      error: "Validation failed",
      details: [{ field: "", message: "Request body must be valid JSON" }],
    };
    return c.json(errorResponse, 400);
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    const errorResponse: ValidationErrorResponse = {
      error: "Validation failed",
      details: formatZodError(result.error),
    };
    return c.json(errorResponse, 400);
  }

  return result.data;
}
