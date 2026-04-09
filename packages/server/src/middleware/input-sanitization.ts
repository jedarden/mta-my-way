/**
 * Input sanitization middleware for Hono.
 *
 * Sanitizes request inputs to prevent injection attacks:
 * - Removes potentially dangerous characters from query parameters
 * - Strips HTML tags from string inputs
 * - Normalizes whitespace
 * - Prevents SQL injection, command injection, and path traversal
 *
 * Uses shared sanitization utilities from sanitization.ts.
 */

import type { MiddlewareHandler } from "hono";
import { type SanitizationOptions, sanitizeParams } from "./sanitization.js";

/**
 * Input sanitization middleware.
 *
 * Attaches sanitized query parameters to the context for downstream handlers.
 * Sanitization is applied to all query parameters to prevent injection attacks.
 *
 * @param options - Sanitization options (defaults to full sanitization)
 * @returns Hono middleware handler
 */
export function inputSanitization(options: SanitizationOptions = {}): MiddlewareHandler {
  const {
    stripHtml = true,
    preventSqlInjection = true,
    preventCommandInjection = true,
    preventPathTraversal = true,
    normalizeWhitespace = true,
    maxLength = 1000, // Lower default for query params vs body
  } = options;

  const sanitizationOptions: SanitizationOptions = {
    stripHtml,
    preventSqlInjection,
    preventCommandInjection,
    preventPathTraversal,
    normalizeWhitespace,
    maxLength,
  };

  return async (c, next) => {
    // Sanitize query parameters
    const queryParams = c.req.query();
    const sanitizedQuery = sanitizeParams(queryParams, sanitizationOptions);

    // Attach sanitized data to context for downstream handlers
    c.set("sanitizedQuery", sanitizedQuery);

    await next();
  };
}

/**
 * Helper to get sanitized query parameters from context.
 * Returns the sanitized query parameters that were attached by the middleware.
 */
export function getSanitizedQuery(c: { get: (key: string) => unknown }): Record<string, string> {
  return (c.get("sanitizedQuery") as Record<string, string>) || {};
}
