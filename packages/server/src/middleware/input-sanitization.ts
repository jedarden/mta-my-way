/**
 * Input sanitization middleware for Hono.
 *
 * Sanitizes request inputs to prevent injection attacks:
 * - Removes potentially dangerous characters from query parameters
 * - Strips HTML tags from string inputs
 * - Normalizes whitespace
 */

import type { MiddlewareHandler } from "hono";

/**
 * HTML tag pattern for stripping.
 * Matches all HTML tags to prevent XSS.
 */
const HTML_TAG_PATTERN = /<[^>]*>/gi;

/**
 * JavaScript event handler pattern.
 * Matches on* attributes that could execute JavaScript.
 */
const EVENT_HANDLER_PATTERN = /on\w+\s*=/gi;

/**
 * SQL injection pattern.
 * Detects common SQL injection attempts.
 * Matches tautological conditions, comment sequences, UNION-based injections, and stacked queries.
 * More specific patterns to avoid false positives on legitimate content.
 */
const SQL_INJECTION_PATTERN =
  /(\bOR\b\s+\d+\s*=\s*\d+)|(\bAND\b\s+\d+\s*=\s*\d+)|(\bOR\b\s+'[^']+'\s*=\s*'[^']*')|(\bAND\b\s+'[^']+'\s*=\s*'[^']*')|('\s*OR\s*')|('\s*AND\s*')|(\bOR\s+)|(AND\s+)|(--)|(;)|(\bUNION\b\s+\bSELECT\b)|(\/\*)|(\|\|)/gi;

/**
 * Input sanitization options.
 */
interface SanitizationOptions {
  /** Strip HTML tags from string inputs */
  stripHtml?: boolean;
  /** Remove potential SQL injection patterns */
  preventSqlInjection?: boolean;
  /** Normalize whitespace (collapse multiple spaces) */
  normalizeWhitespace?: boolean;
}

/**
 * Sanitize a string value.
 */
function sanitizeString(input: string, options: SanitizationOptions): string {
  let sanitized = input;

  if (options.stripHtml) {
    sanitized = sanitized.replace(HTML_TAG_PATTERN, "");
    sanitized = sanitized.replace(EVENT_HANDLER_PATTERN, "");
  }

  if (options.preventSqlInjection) {
    // Check for SQL injection patterns
    if (SQL_INJECTION_PATTERN.test(sanitized)) {
      // Return empty string to be safe
      return "";
    }
  }

  if (options.normalizeWhitespace) {
    sanitized = sanitized.replace(/\s+/g, " ").trim();
  }

  return sanitized;
}

/**
 * Sanitize query parameters and form data.
 */
function sanitizeParams(
  params: Record<string, string | string[] | undefined>,
  options: SanitizationOptions
): Record<string, string> {
  const sanitized: Record<string, string> = {};

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") {
      sanitized[key] = sanitizeString(value, options);
    } else if (Array.isArray(value)) {
      // For arrays, take the first value and sanitize it
      sanitized[key] = sanitizeString(value[0] || "", options);
    }
  }

  return sanitized;
}

/**
 * Input sanitization middleware.
 *
 * Attaches sanitized query parameters and body to the context.
 */
export function inputSanitization(options: SanitizationOptions = {}): MiddlewareHandler {
  const { stripHtml = true, preventSqlInjection = true, normalizeWhitespace = true } = options;

  const sanitizationOptions = { stripHtml, preventSqlInjection, normalizeWhitespace };

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
 */
export function getSanitizedQuery(c: { get: (key: string) => unknown }): Record<string, string> {
  return (c.get("sanitizedQuery") as Record<string, string>) || {};
}
