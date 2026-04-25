/**
 * Security utilities for OWASP Top 10 protection.
 *
 * Provides output encoding functions for XSS prevention and other
 * security-related utilities shared between client and server.
 *
 * OWASP A03:2021 - Injection (XSS Prevention)
 * These functions help prevent Cross-Site Scripting (XSS) attacks by
 * properly encoding user-generated content for different output contexts.
 */

/**
 * Encode output for HTML context to prevent XSS.
 *
 * Use this when inserting user-generated content into HTML body content.
 * Escapes: &, <, >, ", and '
 *
 * @example
 * ```tsx
 * <div>{encodeHtml(userInput)}</div>
 * ```
 *
 * @param unsafe - The potentially unsafe user input
 * @returns HTML-encoded string safe for use in HTML context
 */
export function encodeHtml(unsafe: string): string {
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Encode output for HTML attribute context to prevent XSS.
 *
 * Use this when inserting user-generated content into HTML attribute values.
 * Escapes: &, <, >, ", ', and control characters
 *
 * @example
 * ```tsx
 * <div title={encodeHtmlAttribute(userInput)}>...</div>
 * ```
 *
 * @param unsafe - The potentially unsafe user input
 * @returns HTML-encoded string safe for use in attribute context
 */
export function encodeHtmlAttribute(unsafe: string): string {
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/\x00/g, "")
    .replace(/\x0A/g, "&#10;")
    .replace(/\x0D/g, "&#13;");
}

/**
 * Encode output for JavaScript string context to prevent XSS.
 *
 * Use this when inserting user-generated content into JavaScript strings.
 * Escapes: backslashes, quotes, and control characters
 *
 * @example
 * ```tsx
 * <script>const value = '{encodeJs(userInput)}';</script>
 * ```
 *
 * @param unsafe - The potentially unsafe user input
 * @returns JavaScript-encoded string safe for use in JS context
 */
export function encodeJs(unsafe: string): string {
  return String(unsafe)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")
    .replace(/\f/g, "\\f")
    .replace(/\v/g, "\\v")
    .replace(/\0/g, "\\0")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/**
 * Encode output for URL parameter context to prevent XSS.
 *
 * Use this when inserting user-generated content into URL parameters.
 * This is a wrapper around encodeURIComponent.
 *
 * @example
 * ```tsx
 * <a href={`/search?q=${encodeUrl(userInput)}`}>Search</a>
 * ```
 *
 * @param unsafe - The potentially unsafe user input
 * @returns URL-encoded string safe for use in URL context
 */
export function encodeUrl(unsafe: string): string {
  return encodeURIComponent(String(unsafe));
}

/**
 * Encode output for CSS context to prevent XSS.
 *
 * Use this when inserting user-generated content into CSS string values.
 * Escapes special characters with CSS hex escapes.
 *
 * @example
 * ```css
 * .my-class::before {
 *   content: "{encodeCss(userInput)}";
 * }
 * ```
 *
 * @param unsafe - The potentially unsafe user input
 * @returns CSS-encoded string safe for use in CSS context
 */
export function encodeCss(unsafe: string): string {
  return String(unsafe).replace(/[<>"'&\\]/g, (char) => `\\${char.charCodeAt(0).toString(16)} `);
}

/**
 * Sanitize HTML by removing all tags and attributes.
 *
 * Use this when you want to display user-generated content as plain text.
 * This is more aggressive than encoding - it removes all HTML.
 *
 * @example
 * ```tsx
 * <div>{sanitizeHtml(userInput)}</div>
 * ```
 *
 * @param unsafe - The potentially unsafe user input that may contain HTML
 * @returns Plain text with all HTML tags removed
 */
export function sanitizeHtml(unsafe: string): string {
  return String(unsafe)
    .replace(/<script[^>]*>.*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/on\w+\s*=/gi, "");
}

/**
 * Validate and sanitize a URL to prevent javascript: and data: URL attacks.
 *
 * Use this when allowing users to input URLs that will be used in href/src attributes.
 * Returns null if the URL is unsafe.
 *
 * @example
 * ```tsx
 * const safeUrl = sanitizeUrl(userInput);
 * return safeUrl ? <a href={safeUrl}>Link</a> : null;
 * ```
 *
 * @param url - The URL to validate
 * @returns A sanitized URL string or null if unsafe
 */
export function sanitizeUrl(url: string): string | null {
  const trimmed = String(url).trim();

  // Block javascript: and data: protocols
  if (/^(javascript|data|vbscript):/i.test(trimmed)) {
    return null;
  }

  // Allow http:, https:, mailto:, tel:, and relative URLs
  if (/^(https?:|mailto:|tel:|\/)/i.test(trimmed)) {
    return trimmed;
  }

  // Return null for unknown protocols
  return null;
}

/**
 * Check if a string contains potentially dangerous content.
 *
 * This is a heuristic check for common XSS patterns. It can be used
 * for validation before accepting user input.
 *
 * @param input - The input to check
 * @returns true if the input contains potentially dangerous content
 */
export function containsDangerousContent(input: string): boolean {
  const dangerousPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i,
    /<iframe/i,
    /<object/i,
    /<embed/i,
    /<link/i,
    /<meta/i,
    /@import/i,
    /expression\s*\(/i,
  ];

  return dangerousPatterns.some((pattern) => pattern.test(input));
}

/**
 * Truncate a string to a maximum length, adding ellipsis if truncated.
 *
 * Use this to prevent excessive memory usage or display issues with
 * very long user-generated content.
 *
 * @param str - The string to truncate
 * @param maxLength - Maximum length (default: 1000)
 * @returns Truncated string with ellipsis if needed
 */
export function truncate(str: string, maxLength = 1000): string {
  const input = String(str);
  if (input.length <= maxLength) {
    return input;
  }
  return input.slice(0, maxLength) + "...";
}

/**
 * Strip null bytes and other control characters from a string.
 *
 * Control characters can cause issues with logging, storage, and display.
 *
 * @param str - The string to sanitize
 * @returns String with control characters removed
 */
export function stripControlCharacters(str: string): string {
  return String(str).replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, "");
}
