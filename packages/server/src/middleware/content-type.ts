/**
 * Content-Type validation middleware for Hono.
 *
 * Validates that requests with a body have the correct Content-Type header.
 * Prevents content-type confusion attacks and ensures proper request handling.
 */

import type { MiddlewareHandler } from "hono";
import { securityLogger } from "./security-logging.js";

/**
 * Supported content types.
 */
const SUPPORTED_CONTENT_TYPES = [
  "application/json",
  "application/json; charset=utf-8",
  "application/x-www-form-urlencoded",
  "multipart/form-data",
  "text/plain",
] as const;

/**
 * Check if a content type is supported.
 */
function isSupportedContentType(contentType: string | null): boolean {
  if (!contentType) return false;

  // Extract the base content type (before charset or other parameters)
  const baseContentType = contentType.split(";")[0]!.trim().toLowerCase();

  return SUPPORTED_CONTENT_TYPES.some((supported) => {
    const supportedBase = supported.split(";")[0]!.trim().toLowerCase();
    return baseContentType === supportedBase;
  });
}

/**
 * Content-Type validation options.
 */
interface ContentTypeOptions {
  /** Require Content-Type for requests with body (default: true) */
  requireForBody?: boolean;
  /** Allowed content types (default: all supported types) */
  allowedTypes?: string[];
  /** Skip validation for these methods (default: none) */
  skipMethods?: string[];
  /** Custom error message */
  errorMessage?: string;
}

/**
 * Content-Type validation middleware.
 *
 * Ensures that requests with a body specify a valid Content-Type header.
 * Returns 415 Unsupported Media Type when validation fails.
 *
 * This middleware prevents:
 * - Content-type confusion attacks
 * - Ambiguous request body parsing
 * - Unexpected content types in API endpoints
 */
export function validateContentType(options: ContentTypeOptions = {}): MiddlewareHandler {
  const {
    requireForBody = true,
    allowedTypes = [...SUPPORTED_CONTENT_TYPES],
    skipMethods = [],
    errorMessage = "Unsupported Media Type",
  } = options;

  const methodsRequiringBody = new Set(["POST", "PUT", "PATCH", "DELETE"]);
  const skipMethodsSet = new Set(skipMethods.map((m) => m.toUpperCase()));
  const allowedTypesLower = allowedTypes.map((t) => t.toLowerCase());

  return async (c, next) => {
    const method = c.req.method.toUpperCase();
    const contentType = c.req.header("Content-Type");

    // Skip validation for methods that don't typically have a body
    if (!methodsRequiringBody.has(method) || skipMethodsSet.has(method)) {
      await next();
      return;
    }

    // Check if content type is present when body is expected
    if (!contentType) {
      // Some methods may legitimately not have a body
      const contentLength = c.req.header("Content-Length");
      if (!contentLength || contentLength === "0") {
        await next();
        return;
      }

      if (requireForBody) {
        securityLogger.logSuspiciousRequest(
          c,
          "missing_content_type",
          "Content-Type header is required for this request"
        );

        return c.json(
          {
            error: errorMessage,
            message: "Content-Type header is required for this request",
          },
          415
        );
      }
    }

    // Validate content type if present
    if (contentType) {
      const baseContentType = contentType.split(";")[0]!.trim().toLowerCase();
      const isAllowed = allowedTypesLower.some((allowed) => {
        const allowedBase = allowed.split(";")[0]!.trim().toLowerCase();
        return baseContentType === allowedBase;
      });

      if (!isAllowed) {
        securityLogger.logSuspiciousRequest(
          c,
          "invalid_content_type",
          `Content-Type '${contentType}' is not supported`
        );

        return c.json(
          {
            error: errorMessage,
            message: `Content-Type '${contentType}' is not supported`,
            supportedTypes: allowedTypes,
          },
          415
        );
      }
    }

    await next();
  };
}

/**
 * Helper to create a JSON-only content type validator.
 *
 * Use this for API endpoints that only accept JSON requests.
 */
export function requireJson(): MiddlewareHandler {
  return validateContentType({
    allowedTypes: ["application/json", "application/json; charset=utf-8"],
    errorMessage: "JSON content type required",
  });
}

/**
 * Helper to create a form data content type validator.
 *
 * Use this for API endpoints that only accept form data.
 */
export function requireFormData(): MiddlewareHandler {
  return validateContentType({
    allowedTypes: ["application/x-www-form-urlencoded", "multipart/form-data"],
    errorMessage: "Form data content type required",
  });
}
