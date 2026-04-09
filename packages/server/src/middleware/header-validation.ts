/**
 * Header validation middleware for Hono.
 *
 * Validates and sanitizes HTTP request headers to prevent:
 * - Header injection attacks (CRLF injection)
 * - XSS via reflected headers
 * - Excessively long header values (DoS)
 * - Malicious User-Agent strings
 * - Suspicious Referer headers
 *
 * This middleware provides defense in depth by validating headers
 * before they reach application logic.
 */

import type { MiddlewareHandler } from "hono";
import { logger } from "../observability/logger.js";

/**
 * Maximum allowed length for header values.
 * Prevents DoS via excessively long headers.
 */
const MAX_HEADER_LENGTH = 2048;

/**
 * CRLF injection pattern.
 * Detects attempts to inject new headers or split HTTP messages.
 */
const CRLF_PATTERN = /\r\n|\n|\r/;

/**
 * Common malicious patterns in User-Agent strings.
 * Detects known exploit tools, SQL injection attempts, and script fragments.
 */
const MALICIOUS_USER_AGENT_PATTERN =
  /(sqlmap|nikto|nmap|metasploit|burp|owasp|w3af|acunetix|nessus|openvas|<script|javascript:|onerror=|onload=|eval\(|document\.cookie|alert\()/i;

/**
 * Suspicious patterns in Referer headers.
 * Detects potential XSS or redirect attempts.
 */
const SUSPICIOUS_REFERER_PATTERN = /(javascript:|data:|<[^>]*>|on\w+\s*=)/i;

/**
 * Patterns for detecting potential header-based attacks.
 */
const HOST_INJECTION_PATTERN = /[^\w\-.:]/;
const AUTHORIZATION_PATTERN = /[^\w\-\.~=+/]/;

/**
 * Header validation options.
 */
export interface HeaderValidationOptions {
  /** Maximum length for header values (default: 2048) */
  maxLength?: number;
  /** Whether to validate User-Agent for malicious patterns (default: true) */
  validateUserAgent?: boolean;
  /** Whether to validate Referer for suspicious patterns (default: true) */
  validateReferer?: boolean;
  /** Whether to check for CRLF injection (default: true) */
  checkCRLFInjection?: boolean;
  /** Whether to validate Host header format (default: true) */
  validateHost?: boolean;
}

/**
 * Default header validation options.
 */
const DEFAULT_OPTIONS: Required<HeaderValidationOptions> = {
  maxLength: MAX_HEADER_LENGTH,
  validateUserAgent: true,
  validateReferer: true,
  checkCRLFInjection: true,
  validateHost: true,
};

/**
 * Validates a single header value.
 *
 * Returns true if the header value is safe, false otherwise.
 */
function validateHeaderValue(value: string, options: Required<HeaderValidationOptions>): boolean {
  // Check length
  if (value.length > options.maxLength) {
    logger.warn("Header value exceeds maximum length", {
      length: value.length,
      maxLength: options.maxLength,
      preview: value.slice(0, 50),
    });
    return false;
  }

  // Check for CRLF injection
  if (options.checkCRLFInjection && CRLF_PATTERN.test(value)) {
    logger.warn("CRLF injection pattern detected in header", {
      preview: value.slice(0, 50),
    });
    return false;
  }

  return true;
}

/**
 * Validates User-Agent header for malicious patterns.
 */
function validateUserAgent(userAgent: string): boolean {
  if (MALICIOUS_USER_AGENT_PATTERN.test(userAgent)) {
    logger.warn("Malicious User-Agent pattern detected", {
      userAgent: userAgent.slice(0, 100),
    });
    return false;
  }
  return true;
}

/**
 * Validates Referer header for suspicious patterns.
 */
function validateReferer(referer: string): boolean {
  if (SUSPICIOUS_REFERER_PATTERN.test(referer)) {
    logger.warn("Suspicious Referer pattern detected", {
      referer: referer.slice(0, 100),
    });
    return false;
  }

  // If it looks like a URL, validate it's properly formed
  if (referer.includes("://")) {
    try {
      const url = new URL(referer);
      // Only allow http and https protocols
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        logger.warn("Referer uses disallowed protocol", {
          protocol: url.protocol,
        });
        return false;
      }
    } catch {
      logger.warn("Invalid URL format in Referer", {
        referer: referer.slice(0, 100),
      });
      return false;
    }
  }

  return true;
}

/**
 * Validates Host header format.
 */
function validateHost(host: string): boolean {
  if (HOST_INJECTION_PATTERN.test(host)) {
    logger.warn("Invalid characters in Host header", {
      host: host.slice(0, 50),
    });
    return false;
  }

  // Check for host header injection attempts
  if (host.includes("/") || host.includes("\\")) {
    logger.warn("Path-like characters in Host header", {
      host: host.slice(0, 50),
    });
    return false;
  }

  return true;
}

/**
 * Header validation middleware.
 *
 * Validates and sanitizes HTTP request headers to prevent injection attacks.
 * Rejects requests with malicious or malformed headers with a 400 response.
 *
 * @param options - Validation options (defaults to full validation)
 * @returns Hono middleware handler
 */
export function headerValidation(options: HeaderValidationOptions = {}): MiddlewareHandler {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };

  return async (c, next) => {
    // Validate User-Agent if present
    if (mergedOptions.validateUserAgent) {
      const userAgent = c.req.header("User-Agent");
      if (userAgent && !validateHeaderValue(userAgent, mergedOptions)) {
        return c.json({ error: "Invalid User-Agent header" }, 400);
      }
      if (userAgent && !validateUserAgent(userAgent)) {
        return c.json({ error: "Malicious User-Agent detected" }, 400);
      }
    }

    // Validate Referer if present
    if (mergedOptions.validateReferer) {
      const referer = c.req.header("Referer");
      if (referer && !validateHeaderValue(referer, mergedOptions)) {
        return c.json({ error: "Invalid Referer header" }, 400);
      }
      if (referer && !validateReferer(referer)) {
        return c.json({ error: "Suspicious Referer header detected" }, 400);
      }
    }

    // Validate Host header
    if (mergedOptions.validateHost) {
      const host = c.req.header("Host");
      if (host && !validateHeaderValue(host, mergedOptions)) {
        return c.json({ error: "Invalid Host header" }, 400);
      }
      if (host && !validateHost(host)) {
        return c.json({ error: "Invalid Host header format" }, 400);
      }
    }

    // Validate Authorization header format
    const authorization = c.req.header("Authorization");
    if (authorization && !validateHeaderValue(authorization, mergedOptions)) {
      return c.json({ error: "Invalid Authorization header" }, 400);
    }

    // Validate Content-Type if present
    const contentType = c.req.header("Content-Type");
    if (contentType && !validateHeaderValue(contentType, mergedOptions)) {
      return c.json({ error: "Invalid Content-Type header" }, 400);
    }

    // Validate Accept header if present
    const accept = c.req.header("Accept");
    if (accept && !validateHeaderValue(accept, mergedOptions)) {
      return c.json({ error: "Invalid Accept header" }, 400);
    }

    // Validate all other headers for length and CRLF injection
    const headers = c.req.header();
    for (const [name, value] of Object.entries(headers)) {
      if (value && !validateHeaderValue(value, mergedOptions)) {
        logger.warn("Header validation failed", {
          header: name,
          length: value.length,
        });
        return c.json({ error: `Invalid ${name} header` }, 400);
      }
    }

    await next();
  };
}

/**
 * Strict header validation for sensitive endpoints.
 *
 * Applies more stringent validation rules for endpoints that handle
 * authentication, payment processing, or other sensitive operations.
 *
 * @returns Hono middleware handler with strict validation
 */
export function strictHeaderValidation(): MiddlewareHandler {
  return headerValidation({
    maxLength: 1024, // Shorter max length
    validateUserAgent: true,
    validateReferer: true,
    checkCRLFInjection: true,
    validateHost: true,
  });
}
