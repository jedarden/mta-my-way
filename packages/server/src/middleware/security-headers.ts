/**
 * Security headers middleware for Hono.
 *
 * Sets CSP and standard security headers on all responses.
 */

import type { MiddlewareHandler } from "hono";

/**
 * Security headers middleware.
 *
 * CSP: default-src 'self', script-src 'self', style-src 'self' 'unsafe-inline'
 * Also sets X-Content-Type-Options, X-Frame-Options, Referrer-Policy.
 */
export function securityHeaders(): MiddlewareHandler {
  return async (c, next) => {
    await next();

    // Content Security Policy
    c.res.headers.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; manifest-src 'self'; worker-src 'self'"
    );

    // Prevent MIME type sniffing
    c.res.headers.set("X-Content-Type-Options", "nosniff");

    // Prevent clickjacking
    c.res.headers.set("X-Frame-Options", "DENY");

    // Control referrer information
    c.res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

    // HSTS (1 year, include subdomains)
    c.res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  };
}
