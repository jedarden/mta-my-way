/**
 * Shared sanitization utilities for input validation.
 *
 * Provides centralized sanitization functions to prevent:
 * - XSS attacks (HTML tags, event handlers)
 * - SQL injection attacks
 * - Path traversal attacks
 * - Command injection attacks
 */

import { logger } from "../observability/logger.js";

/**
 * Script and style tag pattern - removes these tags AND their content.
 * This prevents XSS by removing JavaScript and CSS entirely.
 */
const SCRIPT_STYLE_PATTERN = /<(script|style)[^>]*>.*?<\/\1[^>]*>/gi;

/**
 * HTML tag pattern for stripping (without content).
 * Matches HTML tags but preserves the content between them.
 */
const HTML_TAG_PATTERN = /<[^>]*>/gi;

/**
 * Self-closing HTML tag pattern.
 * Matches self-closing tags like <br />, <img />, etc.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const SELFCLOSING_TAG_PATTERN = /<[^>]*\/>/gi;

/**
 * JavaScript event handler pattern.
 * Matches on* attributes that could execute JavaScript.
 */
const EVENT_HANDLER_PATTERN = /on\w+\s*=/gi;

/**
 * JavaScript protocol pattern for URLs.
 * Matches javascript: pseudo-protocol that can execute code.
 */
const JAVASCRIPT_PROTOCOL_PATTERN = /javascript:/gi;

/**
 * JavaScript function call pattern.
 * Matches common JavaScript function calls that could execute code.
 * Captures the function name, opening paren, content, and closing paren.
 * Excludes "script" as a keyword to avoid false positives with HTML encoded entities
 */
const JAVASCRIPT_FUNCTION_PATTERN =
  /\b(alert|confirm|prompt|eval|exec|setTimeout|setInterval|Function|document\.write|location\.|window\.|\.innerHTML|\.outerHTML)\s*\([^)]*\)/gi;

/**
 * SQL injection pattern - more specific to avoid false positives.
 *
 * Detects:
 * - Tautological conditions (1=1, 'a'='a')
 * - Comment sequences (--, slash-star, star-slash)
 * - UNION-based injections
 * - Stacked queries (semicolon)
 * - Boolean-based injection with quoted strings
 * - Time-based injection patterns
 *
 * Uses word boundaries and more specific patterns to reduce false positives
 * on legitimate text containing "and", "or", etc.
 */
const SQL_INJECTION_PATTERN =
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  // eslint-disable-next-line no-useless-escape
  /(\bOR\b\s+\d+\s*=\s*\d+)|(\bAND\b\s+\d+\s*=\s*\d+)|('\s*\|\|?\s*')|('\s*(OR|AND)\s+'[^']+'\s*=\s*'[^']*')|('\s*;)|(\bor\s+\d+\s*=\s*\d+\b)|(\band\s+\d+\s*=\s*\d+\b)|(\bunion\b\s+\bselect\b)|(\/\*)|(\*\/)|(\-\-)|(;)|(waitfor\s+delay)|(\bsleep\s*\()/gi;

/**
 * Command injection patterns.
 * Detects shell metacharacters and command chaining.
 * Note: $ is excluded here to avoid false positives with NoSQL operators like $ne
 */
const COMMAND_INJECTION_PATTERN = /[;&|`()<>]/g;

/**
 * Path traversal patterns.
 * Detects attempts to access parent directories.
 */
const PATH_TRAVERSAL_PATTERN = /\.\.[/\\]/g;

/**
 * LDAP injection patterns.
 * Detects attempts to inject LDAP queries.
 */
const LDAP_INJECTION_PATTERN = /(\(|\)|\*|\||&|\||!=|>=|<=|=\*|\()/gi;

/**
 * NoSQL injection patterns.
 * Detects attempts to inject NoSQL queries (MongoDB, etc.).
 */
const NOSQL_INJECTION_PATTERN = /(\$where|\$ne|\$gt|\$lt|\$in|\$or|\$and|\$regex|\$expr)/gi;

/**
 * XSS patterns beyond HTML tags.
 * Detects encoded and obfuscated XSS attempts.
 */
const XSS_PATTERN =
  /(%3C|&lt;|&#60;|&#x3C;|%3E|&gt;|&#62;|&#x3E;|%22|&quot;|&#34;|&#x22;|%27|&apos;|&#39;|&#x27;)/gi;

/**
 * Template injection patterns.
 * Detects attempts to inject template engine syntax.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
// eslint-disable-next-line no-useless-escape
const TEMPLATE_INJECTION_PATTERN = /(\{\{|\}\}|\$\{|\#{|@{{)/gi;

/**
 * Log injection / log forging patterns.
 * Detects attempts to inject log entries with CRLF sequences.
 */
const LOG_INJECTION_PATTERN = /[\r\n]\s*(ERROR|WARN|INFO|DEBUG|TRACE)/gi;

/**
 * Sanitization options.
 */
export interface SanitizationOptions {
  /** Strip HTML tags from string inputs */
  stripHtml?: boolean;
  /** Remove potential SQL injection patterns */
  preventSqlInjection?: boolean;
  /** Normalize whitespace (collapse multiple spaces) */
  normalizeWhitespace?: boolean;
  /** Remove command injection patterns */
  preventCommandInjection?: boolean;
  /** Remove path traversal patterns */
  preventPathTraversal?: boolean;
  /** Maximum string length (0 = no limit) */
  maxLength?: number;
  /** Remove LDAP injection patterns */
  preventLdapInjection?: boolean;
  /** Remove NoSQL injection patterns */
  preventNosqlInjection?: boolean;
  /** Remove XSS patterns including encoded variants */
  preventXss?: boolean;
  /** Remove template injection patterns */
  preventTemplateInjection?: boolean;
  /** Remove log injection patterns */
  preventLogInjection?: boolean;
  /** Preserve case (default: false - converts to lowercase) */
  preserveCase?: boolean;
  /** Preserve whitespace (default: false - normalizes) */
  preserveWhitespace?: boolean;
}

/**
 * Default sanitization options.
 */
const DEFAULT_OPTIONS: SanitizationOptions = {
  stripHtml: true,
  preventSqlInjection: true,
  preventCommandInjection: true,
  preventPathTraversal: true,
  normalizeWhitespace: true,
  maxLength: 10000,
  preventLdapInjection: true,
  preventNosqlInjection: true,
  preventXss: true,
  preventTemplateInjection: true,
  preventLogInjection: true,
  preserveCase: false,
  preserveWhitespace: false,
};

/**
 * Sanitization result with metadata.
 */
export interface SanitizationResult {
  /** The sanitized value */
  value: string;
  /** Whether any sanitization was performed */
  wasSanitized: boolean;
  /** The type of sanitization performed (if any) */
  sanitizationType?: string[];
}

/**
 * Sanitize a string value.
 *
 * Returns both the sanitized value and metadata about what was sanitized.
 * This is useful for logging and security monitoring.
 *
 * IMPORTANT: Pattern detection happens on the CURRENT value at each step,
 * which means patterns detected earlier may be removed by later sanitizations.
 * This is intentional to log all threats present in the original input.
 */
export function sanitizeString(
  input: string,
  options: SanitizationOptions = {}
): SanitizationResult {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
  const sanitizationTypes: string[] = [];
  let sanitized = input;

  // Apply length limit first
  if (mergedOptions.maxLength && mergedOptions.maxLength > 0) {
    if (sanitized.length > mergedOptions.maxLength) {
      sanitizationTypes.push("length_limit");
      sanitized = sanitized.slice(0, mergedOptions.maxLength);
      logger.warn("Input exceeded maximum length, truncated", {
        originalLength: input.length,
        maxLength: mergedOptions.maxLength,
        preview: input.slice(0, 50),
      });
    }
  }

  // IMPORTANT: Detect ALL patterns first on the current sanitized value
  // BEFORE any replacements that might remove the patterns.
  // This ensures we log all threats present in the input.

  // Detect SQL injection patterns
  if (mergedOptions.preventSqlInjection && SQL_INJECTION_PATTERN.test(sanitized)) {
    sanitizationTypes.push("sql_injection");
    logger.warn("SQL injection pattern detected in input", {
      preview: sanitized.slice(0, 50),
    });
  }

  // Detect command injection patterns
  if (mergedOptions.preventCommandInjection && COMMAND_INJECTION_PATTERN.test(sanitized)) {
    sanitizationTypes.push("command_injection");
    logger.warn("Command injection pattern detected in input", {
      preview: sanitized.slice(0, 50),
    });
  }

  // Detect path traversal patterns
  if (mergedOptions.preventPathTraversal && PATH_TRAVERSAL_PATTERN.test(sanitized)) {
    sanitizationTypes.push("path_traversal");
    logger.warn("Path traversal pattern detected in input", {
      preview: sanitized.slice(0, 50),
    });
  }

  // Detect LDAP injection patterns
  if (mergedOptions.preventLdapInjection && LDAP_INJECTION_PATTERN.test(sanitized)) {
    sanitizationTypes.push("ldap_injection");
    logger.warn("LDAP injection pattern detected in input", {
      preview: sanitized.slice(0, 50),
    });
  }

  // Detect NoSQL injection patterns
  if (mergedOptions.preventNosqlInjection && NOSQL_INJECTION_PATTERN.test(sanitized)) {
    sanitizationTypes.push("nosql_injection");
    logger.warn("NoSQL injection pattern detected in input", {
      preview: sanitized.slice(0, 50),
    });
  }

  // Detect XSS patterns (encoded and obfuscated)
  if (mergedOptions.preventXss && XSS_PATTERN.test(sanitized)) {
    sanitizationTypes.push("xss_pattern");
    logger.warn("XSS pattern detected in input", {
      preview: sanitized.slice(0, 50),
    });
  }

  // Detect template injection patterns
  if (mergedOptions.preventTemplateInjection && TEMPLATE_INJECTION_PATTERN.test(sanitized)) {
    sanitizationTypes.push("template_injection");
    logger.warn("Template injection pattern detected in input", {
      preview: sanitized.slice(0, 50),
    });
  }

  // Detect log injection patterns
  if (mergedOptions.preventLogInjection && LOG_INJECTION_PATTERN.test(sanitized)) {
    sanitizationTypes.push("log_injection");
    logger.warn("Log injection pattern detected in input", {
      preview: sanitized.slice(0, 50),
    });
  }

  // Now apply the actual sanitization replacements

  // Strip HTML tags
  if (mergedOptions.stripHtml) {
    // First, remove script and style tags WITH their content
    const scriptStyleMatch = sanitized.match(SCRIPT_STYLE_PATTERN);
    if (scriptStyleMatch) {
      if (!sanitizationTypes.includes("html_tags")) {
        sanitizationTypes.push("html_tags");
      }
      logger.warn("Script/style tags detected and removed from input", {
        pattern: scriptStyleMatch[0],
        preview: sanitized.slice(0, 50),
      });
    }
    sanitized = sanitized.replace(SCRIPT_STYLE_PATTERN, " ");

    // Then remove remaining HTML tags
    const htmlMatch = sanitized.match(HTML_TAG_PATTERN);
    if (htmlMatch) {
      if (!sanitizationTypes.includes("html_tags")) {
        sanitizationTypes.push("html_tags");
      }
      logger.warn("HTML tags detected and removed from input", {
        pattern: htmlMatch[0],
        preview: sanitized.slice(0, 50),
      });
    }
    sanitized = sanitized.replace(HTML_TAG_PATTERN, "");

    // Remove event handlers
    const eventHandlerMatch = sanitized.match(EVENT_HANDLER_PATTERN);
    if (eventHandlerMatch) {
      if (!sanitizationTypes.includes("html_tags")) {
        sanitizationTypes.push("event_handlers");
      }
      logger.warn("Event handlers detected and removed from input", {
        pattern: eventHandlerMatch[0],
        preview: sanitized.slice(0, 50),
      });
    }
    sanitized = sanitized.replace(EVENT_HANDLER_PATTERN, "");

    // Remove javascript: protocol
    const jsProtocolMatch = sanitized.match(JAVASCRIPT_PROTOCOL_PATTERN);
    if (jsProtocolMatch) {
      if (!sanitizationTypes.includes("html_tags")) {
        sanitizationTypes.push("javascript_protocol");
      }
      logger.warn("JavaScript protocol detected and removed from input", {
        preview: sanitized.slice(0, 50),
      });
    }
    sanitized = sanitized.replace(JAVASCRIPT_PROTOCOL_PATTERN, "");

    // Remove JavaScript function calls
    const jsFunctionMatch = sanitized.match(JAVASCRIPT_FUNCTION_PATTERN);
    if (jsFunctionMatch) {
      if (!sanitizationTypes.includes("html_tags")) {
        sanitizationTypes.push("javascript_function");
      }
      logger.warn("JavaScript function call detected and removed from input", {
        pattern: jsFunctionMatch[0],
        preview: sanitized.slice(0, 50),
      });
    }
    sanitized = sanitized.replace(JAVASCRIPT_FUNCTION_PATTERN, "");
  }

  // Apply SQL injection sanitization
  if (mergedOptions.preventSqlInjection) {
    const beforeSqlSanitization = sanitized;
    // Always remove dangerous SQL characters and keywords when SQL injection prevention is enabled
    sanitized = sanitized.replace(/[;'"]/g, "");
    sanitized = sanitized.replace(/\bor\b/gi, "");
    sanitized = sanitized.replace(/\band\b/gi, "");
    sanitized = sanitized.replace(/\bunion\b/gi, "");
    sanitized = sanitized.replace(/\bselect\b/gi, "");
    // Check if sanitization actually changed anything
    if (sanitized !== beforeSqlSanitization && !sanitizationTypes.includes("sql_injection")) {
      sanitizationTypes.push("sql_injection");
    }
  }

  // Apply command injection sanitization
  if (mergedOptions.preventCommandInjection) {
    sanitized = sanitized.replace(COMMAND_INJECTION_PATTERN, "");
  }

  // Apply path traversal sanitization
  if (mergedOptions.preventPathTraversal) {
    sanitized = sanitized.replace(PATH_TRAVERSAL_PATTERN, "");
  }

  // Apply LDAP injection sanitization
  if (mergedOptions.preventLdapInjection) {
    sanitized = sanitized.replace(/[()|&*!=]/g, "");
  }

  // Apply NoSQL injection sanitization
  if (mergedOptions.preventNosqlInjection) {
    sanitized = sanitized.replace(/\$[a-zA-Z]+/g, "");
  }

  // Apply XSS pattern sanitization
  if (mergedOptions.preventXss) {
    sanitized = sanitized.replace(/%3C|%3E|%22|%27|%3D|%3B/gi, "");
    sanitized = sanitized.replace(/&lt;|&gt;|&quot;|&apos;/gi, "");
    sanitized = sanitized.replace(/&#\d+;/gi, "");
    sanitized = sanitized.replace(/&#x[0-9a-fA-F]+;/gi, "");
  }

  // Apply template injection sanitization
  if (mergedOptions.preventTemplateInjection) {
    sanitized = sanitized.replace(/\{\{|\}\}|\$\{|#\{/g, "");
  }

  // Apply log injection sanitization
  if (mergedOptions.preventLogInjection) {
    // Remove log level prefixes after newlines
    sanitized = sanitized.replace(/[\r\n]+\s*(ERROR|WARN|INFO|DEBUG|TRACE)/gi, " ");
  }

  // Normalize whitespace
  if (mergedOptions.normalizeWhitespace) {
    const normalized = sanitized.replace(/\s+/g, " ").trim();
    if (normalized !== sanitized) {
      sanitizationTypes.push("whitespace_normalization");
    }
    sanitized = normalized;
  }

  return {
    value: sanitized,
    wasSanitized: sanitizationTypes.length > 0,
    sanitizationType: sanitizationTypes.length > 0 ? sanitizationTypes : undefined,
  };
}

/**
 * Sanitize a string value (simplified version, returns just the string).
 * Use this when you don't need the metadata.
 */
export function sanitizeStringSimple(input: string, options: SanitizationOptions = {}): string {
  return sanitizeString(input, options).value;
}

/**
 * Sanitize a string value for use as an object key.
 *
 * Preserves content between tags while removing the tags themselves.
 * This is more appropriate for keys where we want to keep the readable text.
 */
function sanitizeKey(key: string, options: SanitizationOptions = {}): string {
  let sanitized = key;

  // Strip only the tags, not the content
  // Default to stripHtml: true for keys to prevent tag-based injection
  const shouldStripHtml = options.stripHtml !== false;

  if (shouldStripHtml) {
    // First remove script/style tags with content (for security)
    sanitized = sanitized.replace(SCRIPT_STYLE_PATTERN, " ");
    // Then remove remaining HTML tags (preserving content)
    sanitized = sanitized.replace(HTML_TAG_PATTERN, "");
  }

  // Apply other sanitizations
  if (options.preventCommandInjection !== false) {
    sanitized = sanitized.replace(COMMAND_INJECTION_PATTERN, "");
  }
  if (options.preventPathTraversal !== false) {
    sanitized = sanitized.replace(PATH_TRAVERSAL_PATTERN, "");
  }
  if (options.preventSqlInjection !== false) {
    sanitized = sanitized.replace(/[;'"]/g, "");
  }

  // Normalize whitespace
  if (options.normalizeWhitespace !== false) {
    sanitized = sanitized.replace(/\s+/g, " ").trim();
  }

  return sanitized;
}

/**
 * Recursively sanitize string values in an object.
 *
 * Handles:
 * - Primitive strings
 * - Nested objects
 * - Arrays
 * - null and undefined values
 */
export function sanitizeObject(obj: unknown, options: SanitizationOptions = {}): unknown {
  if (typeof obj === "string") {
    return sanitizeStringSimple(obj, options);
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item, options));
  }

  if (obj !== null && typeof obj === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      // Also sanitize object keys to prevent key-based injection
      // Use key sanitization which preserves content between tags
      const sanitizedKey = sanitizeKey(key, options);
      // Debug: check if key was modified
      if (sanitizedKey !== key) {
        console.log(`DEBUG sanitizeObject: key "${key}" -> "${sanitizedKey}"`);
      }
      // Check if value type is preserved
      const sanitizedValue = sanitizeObject(value, options);
      if (typeof sanitizedValue !== typeof value && value !== null) {
        console.log(
          `DEBUG sanitizeObject: value type changed for key "${key}": ${typeof value} -> ${typeof sanitizedValue}`
        );
      }
      sanitized[sanitizedKey] = sanitizedValue;
    }
    return sanitized;
  }

  return obj;
}

/**
 * Sanitize query parameters.
 *
 * Handles both single values and arrays.
 */
export function sanitizeParams(
  params: Record<string, string | string[] | undefined>,
  options: SanitizationOptions = {}
): Record<string, string> {
  const sanitized: Record<string, string> = {};

  for (const [key, value] of Object.entries(params)) {
    // Sanitize the key as well
    const sanitizedKey = sanitizeStringSimple(key, {
      ...options,
      normalizeWhitespace: false,
    });

    if (typeof value === "string") {
      sanitized[sanitizedKey] = sanitizeStringSimple(value, options);
    } else if (Array.isArray(value)) {
      // For arrays, take the first value and sanitize it
      sanitized[sanitizedKey] = sanitizeStringSimple(value[0] || "", options);
    } else {
      // undefined or null - use empty string
      sanitized[sanitizedKey] = "";
    }
  }

  return sanitized;
}

/**
 * Validate and sanitize an API key ID format.
 *
 * API key IDs should be alphanumeric with underscores, 3-50 chars.
 */
export function validateApiKeyFormat(keyId: string): boolean {
  return /^[A-Za-z0-9_]{3,50}$/.test(keyId);
}

/**
 * Validate and sanitize a session token format.
 *
 * Session tokens should be UUID v4 format.
 */
export function validateSessionTokenFormat(token: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token);
}

/**
 * Validate and sanitize an HMAC signature format.
 *
 * Signatures should be in format: hmac_sha256:<64_hex_chars>
 */
export function validateSignatureFormat(signature: string): boolean {
  return /^hmac_sha256:[a-f0-9]{64}$/i.test(signature);
}

/**
 * Encode output for HTML context to prevent XSS.
 * Escapes <, >, &, ", and ' characters.
 */
export function encodeHtmlOutput(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Encode output for JavaScript string context to prevent XSS.
 * Escapes backslashes, quotes, and other special characters.
 */
export function encodeJsOutput(unsafe: string): string {
  return unsafe
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")
    .replace(/\f/g, "\\f")
    .replace(/\v/g, "\\v")
    .replace(/\0/g, "\\0");
}

/**
 * Encode output for URL parameter context.
 */
export function encodeUrlOutput(unsafe: string): string {
  return encodeURIComponent(unsafe);
}

/**
 * Encode output for CSS context.
 * Escapes special characters that could break out of CSS strings.
 */
export function encodeCssOutput(unsafe: string): string {
  return unsafe.replace(/[<>"'&\\]/g, (char) => `\\${char.charCodeAt(0).toString(16)} `);
}
