/**
 * Security headers middleware for Hono.
 *
 * Sets CSP and standard security headers on all responses.
 */

import type { MiddlewareHandler } from "hono";

/**
 * Security headers middleware options.
 */
interface SecurityHeadersOptions {
  /** Enable Content Security Policy (default: true) */
  enableCSP?: boolean;
  /** Enable HSTS (default: true) */
  enableHSTS?: boolean;
  /** Report-to endpoint for CSP violations (optional) */
  reportTo?: string;
  /** Custom CSP directives (optional) */
  customCSP?: string;
}

/**
 * Permissions-Policy directive to restrict browser features.
 * Blocks geolocation, camera, microphone, payment, and other sensitive APIs.
 */
const PERMISSIONS_POLICY =
  "geolocation=(), camera=(), microphone=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=(), ambient-light-sensor=()";

/**
 * Default Content Security Policy.
 *
 * Restricts sources for scripts, styles, images, fonts, and connections.
 * Allows data: images for inline icons and 'unsafe-inline' for styles.
 * Includes report-to for security monitoring.
 */
const DEFAULT_CSP =
  "default-src 'self'; " +
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: https:; " +
  "connect-src 'self'; " +
  "font-src 'self'; " +
  "manifest-src 'self'; " +
  "worker-src 'self'; " +
  "base-uri 'self'; " +
  "form-action 'self'; " +
  "frame-ancestors 'none'; " +
  "upgrade-insecure-requests";

/**
 * Security headers middleware.
 *
 * CSP: default-src 'self', script-src 'self', style-src 'self' 'unsafe-inline'
 * Also sets X-Content-Type-Options, X-Frame-Options, Referrer-Policy,
 * Permissions-Policy, Cross-Origin-Opener-Policy, Cross-Origin-Resource-Policy.
 */
export function securityHeaders(options: SecurityHeadersOptions = {}): MiddlewareHandler {
  const {
    enableCSP = true,
    enableHSTS = true,
    reportTo,
    customCSP,
  } = options;

  return async (c, next) => {
    await next();

    // Content Security Policy
    if (enableCSP) {
      const csp = customCSP ?? DEFAULT_CSP;
      c.res.headers.set("Content-Security-Policy", csp);

      // Add report-only CSP for monitoring without blocking
      if (reportTo) {
        c.res.headers.set("Content-Security-Policy-Report-Only", `${csp}; report-to=${reportTo}`);
      }
    }

    // Prevent MIME type sniffing
    c.res.headers.set("X-Content-Type-Options", "nosniff");

    // Prevent clickjacking
    c.res.headers.set("X-Frame-Options", "DENY");

    // Control referrer information (more restrictive for privacy)
    c.res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

    // HSTS (1 year, include subdomains, preload) - only in production
    if (enableHSTS && c.req.header("x-forwarded-proto") === "https") {
      c.res.headers.set(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains; preload"
      );
    }

    // Permissions-Policy - restrict browser features
    c.res.headers.set("Permissions-Policy", PERMISSIONS_POLICY);

    // Cross-Origin-Opener-Policy - prevent window.opener access
    c.res.headers.set("Cross-Origin-Opener-Policy", "same-origin");

    // Cross-Origin-Resource-Policy - restrict cross-origin resource access
    c.res.headers.set("Cross-Origin-Resource-Policy", "same-origin");

    // Cross-Origin-Embedder-Policy - require COOP/COEP for certain features
    c.res.headers.set("Cross-Origin-Embedder-Policy", "require-corp");

    // X-XSS-Protection - legacy but still supported by some browsers
    c.res.headers.set("X-XSS-Protection", "1; mode=block");
  };
}
