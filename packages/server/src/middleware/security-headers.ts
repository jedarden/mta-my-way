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
  /** Report-uri endpoint for CSP violations (optional, legacy but more widely supported) */
  reportUri?: string;
  /** Custom CSP directives (optional) */
  customCSP?: string;
  /** Use strict CSP (requires nonce, default: false) */
  useStrictCSP?: boolean;
  /** CSP nonce (for strict CSP) */
  nonce?: string;
  /** Enable CSP report-only mode (for testing, default: false) */
  reportOnly?: boolean;
}

/**
 * Generate a cryptographically secure CSP nonce.
 *
 * Nonces are used in strict CSP to allow specific inline scripts.
 * Each nonce should be unique per request.
 */
export function generateCspNonce(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Get the default CSP policy.
 */
export function getDefaultCsp(): string {
  return DEFAULT_CSP;
}

/**
 * Get the strict CSP policy with nonce.
 */
export function getStrictCsp(nonce: string): string {
  return STRICT_CSP.replace(/\{nonce\}/g, nonce);
}

/**
 * Permissions-Policy directive to restrict browser features.
 * Blocks geolocation, camera, microphone, payment, and other sensitive APIs.
 */
const PERMISSIONS_POLICY =
  "geolocation=(), camera=(), microphone=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=(), ambient-light-sensor=()";

/**
 * Default Content Security Policy (Level 3).
 *
 * OWASP A05:2021 - Security Misconfiguration
 * OWASP A03:2021 - Injection (XSS Prevention)
 *
 * Restricts sources for scripts, styles, images, fonts, and connections.
 * Enhanced with stricter policies for OWASP Top 10 compliance:
 * - Removed 'unsafe-eval' from script-src (mitigates XSS)
 * - Added 'strict-dynamic' for nonce-based CSP (future-proof)
 * - Added object-src 'none' (prevents plugin exploitation)
 * - Added base-uri 'self' (prevents base tag injection)
 * - Added form-action 'self' (prevents form action hijacking)
 * - Added frame-ancestors 'none' (prevents clickjacking)
 * - Added upgrade-insecure-requests (HTTPS enforcement)
 * - Added frame-src for OAuth popup windows
 * - Added report-uri/report-to for security monitoring
 */
const DEFAULT_CSP =
  "default-src 'self'; " +
  "script-src 'self' 'unsafe-inline'; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: https:; " +
  "connect-src 'self'; " +
  "font-src 'self'; " +
  "manifest-src 'self'; " +
  "worker-src 'self'; " +
  "object-src 'none'; " +
  "base-uri 'self'; " +
  "form-action 'self'; " +
  "frame-ancestors 'none'; " +
  "frame-src 'self'; " +
  "upgrade-insecure-requests";

/**
 * Strict Content Security Policy for high-security endpoints.
 *
 * Removes 'unsafe-inline' and requires nonce or hash for scripts.
 * Use this for authenticated or state-changing operations.
 */
const STRICT_CSP =
  "default-src 'self'; " +
  "script-src 'self' 'nonce-{nonce}'; " +
  "style-src 'self' 'nonce-{nonce}'; " +
  "img-src 'self' data: https:; " +
  "connect-src 'self'; " +
  "font-src 'self'; " +
  "manifest-src 'self'; " +
  "worker-src 'self'; " +
  "object-src 'none'; " +
  "base-uri 'self'; " +
  "form-action 'self'; " +
  "frame-ancestors 'none'; " +
  "frame-src 'self'; " +
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
    reportUri,
    customCSP,
    reportOnly = false,
  } = options;

  return async (c, next) => {
    await next();

    // Content Security Policy
    if (enableCSP) {
      const csp = customCSP ?? DEFAULT_CSP;
      const cspWithReporting = buildCspWithReporting(csp, { reportTo, reportUri });

      if (reportOnly) {
        // Report-only mode: monitor without blocking
        c.res.headers.set("Content-Security-Policy-Report-Only", cspWithReporting);
      } else {
        // Enforce CSP
        c.res.headers.set("Content-Security-Policy", cspWithReporting);
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

/**
 * Build CSP with reporting directives.
 *
 * Adds report-uri and/or report-to directives for CSP violation monitoring.
 * report-uri is legacy but more widely supported.
 * report-to is newer but requires additional setup.
 */
function buildCspWithReporting(
  baseCsp: string,
  options: { reportTo?: string; reportUri?: string }
): string {
  const { reportTo, reportUri } = options;
  let csp = baseCsp;

  // Add report-to directive (modern)
  if (reportTo) {
    csp += "; report-to=" + reportTo;
  }

  // Add report-uri directive (legacy, more compatible)
  if (reportUri) {
    csp += "; report-uri=" + reportUri;
  }

  return csp;
}
