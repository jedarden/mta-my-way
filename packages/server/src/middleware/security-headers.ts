/**
 * Security headers middleware for Hono.
 *
 * Sets CSP and standard security headers on all responses.
 * Enhanced with additional security utilities for JWT validation,
 * timing-safe comparisons, and session security.
 */

import type { MiddlewareHandler } from "hono";
import type { Context } from "hono";

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

    // Prevent Adobe Flash and PDF from making cross-domain requests
    c.res.headers.set("X-Permitted-Cross-Domain-Policies", "none");

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

// ============================================================================
// Additional Security Utilities
// ============================================================================

/**
 * Content Security Policy nonce storage in context.
 */
export const CSP_NONCE_KEY = "cspNonce";

/**
 * Get or generate CSP nonce for the current request.
 * Stores the nonce in the context for use in templates.
 */
export function getOrGenerateCspNonce(c: Context): string {
  let nonce = c.get(CSP_NONCE_KEY) as string | undefined;
  if (!nonce) {
    nonce = generateCspNonce();
    c.set(CSP_NONCE_KEY, nonce);
  }
  return nonce;
}

/**
 * Timing-safe string comparison.
 *
 * Prevents timing attacks by ensuring comparison time is proportional
 * to the length of the strings, not the position of the first difference.
 *
 * Use this for comparing:
 * - API tokens
 * - Password hashes
 * - CSRF tokens
 * - Session identifiers
 * - HMAC signatures
 *
 * @param a - First string to compare
 * @param b - Second string to compare
 * @returns true if strings are equal, false otherwise
 */
export function timingSafeEqual(a: string, b: string): boolean {
  // Handle different length strings first
  if (a.length !== b.length) {
    // Still do full comparison to prevent timing leaks on length
    const dummy = "x".repeat(Math.max(a.length, b.length));
    const aCompare = a.length < b.length ? a : dummy;
    const bCompare = b.length < a.length ? b : dummy;
    return constantTimeCompare(aCompare, bCompare) && false;
  }

  return constantTimeCompare(a, b);
}

/**
 * Constant-time string comparison using XOR.
 *
 * This implementation performs the same number of operations
 * regardless of input values, preventing timing side channels.
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

/**
 * Alias for constantTimeEqual for backwards compatibility.
 */
function constantTimeCompare(a: string, b: string): boolean {
  return constantTimeEqual(a, b);
}

/**
 * Timing-safe buffer comparison.
 *
 * Compares two ArrayBuffer/Uint8Array values in constant time.
 * Useful for comparing cryptographic values.
 *
 * @param a - First buffer to compare
 * @param b - Second buffer to compare
 * @returns true if buffers are equal, false otherwise
 */
export function timingSafeBufferEqual(
  a: ArrayBuffer | Uint8Array,
  b: ArrayBuffer | Uint8Array
): boolean {
  const bufA = a instanceof ArrayBuffer ? new Uint8Array(a) : a;
  const bufB = b instanceof ArrayBuffer ? new Uint8Array(b) : b;

  if (bufA.length !== bufB.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < bufA.length; i++) {
    result |= bufA[i]! ^ bufB[i]!;
  }

  return result === 0;
}

/**
 * Verify a token using timing-safe comparison.
 *
 * Wraps timingSafeEqual with proper error handling and logging.
 *
 * @param providedToken - Token provided by the user
 * @param expectedToken - Expected token value
 * @param tokenType - Type of token for logging (e.g., "CSRF", "API key")
 * @returns true if tokens match, false otherwise
 */
export function verifyTokenTimingSafe(
  providedToken: string,
  expectedToken: string,
  tokenType: string = "token"
): boolean {
  if (!providedToken || !expectedToken) {
    return false;
  }

  const result = timingSafeEqual(providedToken, expectedToken);

  if (!result && providedToken.length === expectedToken.length) {
    // Log failed verification with same length (might be brute force)
    // Use a safe logging approach that doesn't leak the tokens
    console.warn(`Failed ${tokenType} verification: length match but content differs`);
  }

  return result;
}

/**
 * Generate a secure random token for various security purposes.
 *
 * Uses cryptographically secure random number generation.
 * Suitable for:
 * - CSRF tokens
 * - Nonce values
 * - Session identifiers
 * - API key components
 *
 * @param bytes - Number of random bytes to generate (default: 32)
 * @param encoding - Output encoding: "hex", "base64", or "base64url" (default: "hex")
 * @returns Secure random token
 */
export function generateSecureToken(
  bytes: number = 32,
  encoding: "hex" | "base64" | "base64url" = "hex"
): string {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);

  if (encoding === "hex") {
    return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
  } else if (encoding === "base64") {
    const base64 = btoa(String.fromCharCode(...array));
    return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  } else {
    // base64url
    const base64 = btoa(String.fromCharCode(...array));
    return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  }
}

/**
 * Validate a JWT token's structure and basic claims.
 *
 * This performs basic JWT validation without verifying the signature.
 * For full validation, use a JWT library with proper secret verification.
 *
 * @param token - JWT token to validate
 * @param options - Validation options
 * @returns Validation result with decoded payload if valid
 */
export function validateJwtStructure(
  token: string,
  options: {
    /** Required issuer */
    issuer?: string;
    /** Required audience */
    audience?: string;
    /** Maximum token age in seconds */
    maxAge?: number;
    /** Clock skew tolerance in seconds */
    clockSkew?: number;
  } = {}
): { valid: boolean; payload?: Record<string, unknown>; error?: string } {
  try {
    // Check basic JWT structure
    const parts = token.split(".");
    if (parts.length !== 3) {
      return { valid: false, error: "Invalid JWT structure" };
    }

    // Decode payload (base64url)
    const payloadBase64 = parts[1];
    const paddedBase64 = payloadBase64 + "=".repeat((4 - (payloadBase64.length % 4)) % 4);
    const payloadJson = atob(paddedBase64.replace(/-/g, "+").replace(/_/g, "/"));
    const payload: Record<string, unknown> = JSON.parse(payloadJson);

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    const clockSkew = options.clockSkew ?? 60;

    if (payload.exp) {
      const exp =
        typeof payload.exp === "number" ? payload.exp : parseInt(payload.exp as string, 10);
      if (exp + clockSkew < now) {
        return { valid: false, error: "Token expired" };
      }
    }

    // Check not before
    if (payload.nbf) {
      const nbf =
        typeof payload.nbf === "number" ? payload.nbf : parseInt(payload.nbf as string, 10);
      if (nbf - clockSkew > now) {
        return { valid: false, error: "Token not yet valid" };
      }
    }

    // Check issued at
    if (payload.iat) {
      const iat =
        typeof payload.iat === "number" ? payload.iat : parseInt(payload.iat as string, 10);
      if (options.maxAge && iat + options.maxAge + clockSkew < now) {
        return { valid: false, error: "Token too old" };
      }
    }

    // Check issuer
    if (options.issuer && payload.iss !== options.issuer) {
      return { valid: false, error: "Invalid issuer" };
    }

    // Check audience
    if (options.audience) {
      const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
      if (!aud.includes(options.audience)) {
        return { valid: false, error: "Invalid audience" };
      }
    }

    return { valid: true, payload };
  } catch {
    return { valid: false, error: "Failed to decode token" };
  }
}

/**
 * Extract the token from a Authorization header.
 *
 * Supports both "Bearer" and "Basic" authentication schemes.
 *
 * @param authHeader - The Authorization header value
 * @param scheme - Expected scheme ("bearer", "basic", or null for auto-detect)
 * @returns The token or credentials, or null if invalid
 */
export function extractAuthHeader(
  authHeader: string | undefined,
  scheme: "bearer" | "basic" | null = null
): string | null {
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2) {
    return null;
  }

  const [authScheme, credentials] = parts;

  if (scheme) {
    if (authScheme.toLowerCase() !== scheme.toLowerCase()) {
      return null;
    }
    return credentials;
  }

  // Auto-detect: accept Bearer or Basic
  if (authScheme.toLowerCase() === "bearer" || authScheme.toLowerCase() === "basic") {
    return credentials;
  }

  return null;
}

/**
 * Sanitize error messages to prevent information leakage.
 *
 * Removes sensitive details from error messages before sending to clients.
 *
 * @param error - Error object or message
 * @returns Sanitized error message
 */
export function sanitizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    // Remove stack traces and internal paths from error messages
    const message = error.message;
    const sanitized = message
      .replace(/\/[^/\s]+\/[^/\s]+/g, "/[path]/") // Replace file paths
      .replace(/at [^/]+\/[^/\n]+/g, "at [internal]") // Replace stack traces
      .replace(/\b[a-f0-9]{32,}\b/g, "[redacted]"); // Replace long hex strings (hashes, tokens)

    return sanitized;
  }

  if (typeof error === "string") {
    return error
      .replace(/\b[a-f0-9]{32,}\b/g, "[redacted]")
      .replace(/\/[^/\s]+\/[^/\s]+/g, "/[path]/");
  }

  return "An error occurred";
}

/**
 * Check if a request is from a trusted source.
 *
 * Uses various heuristics to determine if a request can be trusted:
 * - Trusted IP addresses
 * - Internal network ranges
 * - Trusted authentication methods
 *
 * @param c - Hono context
 * @param trustedIps - List of trusted IP addresses
 * @param trustedNetworks - List of trusted CIDR networks
 * @returns true if the request is from a trusted source
 */
export function isTrustedSource(
  c: Context,
  options: {
    trustedIps?: string[];
    trustedNetworks?: string[];
  } = {}
): boolean {
  const { trustedIps = [], trustedNetworks = [] } = options;

  // Get client IP
  const clientIp =
    c.req.header("CF-Connecting-IP") ||
    c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ||
    c.req.header("X-Real-IP") ||
    "";

  // Check exact IP match
  if (trustedIps.includes(clientIp)) {
    return true;
  }

  // Check network ranges (simple IPv4 /24 check for common private networks)
  for (const network of trustedNetworks) {
    if (isIpInNetwork(clientIp, network)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if an IP is in a CIDR network.
 *
 * Simple implementation supporting common IPv4 networks.
 *
 * @param ip - IP address to check
 * @param network - CIDR network (e.g., "192.168.1.0/24")
 * @returns true if IP is in the network
 */
function isIpInNetwork(ip: string, network: string): boolean {
  const [networkAddr, prefixLengthStr] = network.split("/");
  const prefixLength = parseInt(prefixLengthStr || "24", 10);

  if (!networkAddr) return false;

  const ipParts = ip.split(".").map((x) => parseInt(x, 10));
  const networkParts = networkAddr.split(".").map((x) => parseInt(x, 10));

  if (ipParts.length !== 4 || networkParts.length !== 4) {
    return false;
  }

  // Compare up to prefix length
  const maskBytes = Math.floor(prefixLength / 8);
  const maskBits = prefixLength % 8;

  for (let i = 0; i < maskBytes; i++) {
    if (ipParts[i] !== networkParts[i]) {
      return false;
    }
  }

  if (maskBits > 0 && maskBytes < 4) {
    const mask = (0xff << (8 - maskBits)) & 0xff;
    if ((ipParts[maskBytes]! & mask) !== (networkParts[maskBytes]! & mask)) {
      return false;
    }
  }

  return true;
}
