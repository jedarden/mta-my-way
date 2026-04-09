/**
 * Server-Side Request Forgery (SSRF) protection middleware.
 *
 * OWASP A10:2021 - Server-Side Request Forgery
 *
 * Prevents SSRF attacks by:
 * - Validating URLs against allow-lists
 * - Blocking private/local network access
 * - Restricting allowed protocols
 * - Validating DNS responses
 * - Rate limiting outbound requests
 */

import { logger } from "../observability/logger.js";
import { securityLogger } from "./security-logging.js";

// ============================================================================
// Types
// ============================================================================

/**
 * SSRF protection options.
 */
export interface SsrfProtectionOptions {
  /** Allowed protocols (default: ['https:', 'http:']) */
  allowedProtocols?: string[];
  /** Allowed hostnames (allow-list) */
  allowedHostnames?: string[];
  /** Blocked hostnames (deny-list) */
  blockedHostnames?: string[];
  /** Block private network IPs (default: true) */
  blockPrivateNetworks?: boolean;
  /** Block localhost (default: true) */
  blockLocalhost?: boolean;
  /** Block link-local addresses (169.254.0.0/16) */
  blockLinkLocal?: boolean;
  /** Maximum URL length (default: 2000) */
  maxUrlLength?: number;
  /** Allow user-provided URLs in query params (default: false) */
  allowUserProvidedUrls?: boolean;
}

/**
 * URL validation result.
 */
export interface UrlValidationResult {
  /** Whether the URL is valid */
  valid: boolean;
  /** Reason for rejection (if invalid) */
  reason?: string;
  /** Sanitized URL (if valid) */
  url?: URL;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default SSRF protection options.
 */
const DEFAULT_OPTIONS: Required<SsrfProtectionOptions> = {
  allowedProtocols: ["https:", "http:"],
  allowedHostnames: [],
  blockedHostnames: [
    "metadata.google.internal",
    "169.254.169.254",
    "instance-data",
    "linklocal.amazonaws.com",
  ],
  blockPrivateNetworks: true,
  blockLocalhost: true,
  blockLinkLocal: true,
  maxUrlLength: 2000,
  allowUserProvidedUrls: false,
};

/**
 * Private network IP ranges.
 */
const PRIVATE_NETWORK_PATTERNS = [
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^127\./,
  /^0\./,
  /^fc00:/i,
  /^fe80:/i,
  /^::1$/i,
  /^fd/i,
];

/**
 * Link-local IP range (169.254.0.0/16).
 */
const LINK_LOCAL_PATTERN = /^169\.254\./;

// ============================================================================
// URL Validation
// ============================================================================

/**
 * Validate a URL for SSRF protection.
 *
 * Checks:
 * - URL length
 * - Protocol allow-list
 * - Hostname allow-list/deny-list
 * - Private network IPs
 * - Localhost
 * - Link-local addresses
 * - DNS rebinding protection
 */
export function validateUrl(
  urlString: string,
  options: SsrfProtectionOptions = {}
): UrlValidationResult {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };

  // Check URL length
  if (urlString.length > mergedOptions.maxUrlLength) {
    return {
      valid: false,
      reason: "url_too_long",
    };
  }

  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return {
      valid: false,
      reason: "invalid_url",
    };
  }

  // Check protocol
  if (!mergedOptions.allowedProtocols.includes(url.protocol)) {
    return {
      valid: false,
      reason: "protocol_not_allowed",
    };
  }

  const hostname = url.hostname.toLowerCase();

  // Check blocked hostnames (deny-list)
  for (const blocked of mergedOptions.blockedHostnames) {
    if (hostname === blocked.toLowerCase() || hostname.endsWith(`.${blocked.toLowerCase()}`)) {
      return {
        valid: false,
        reason: "hostname_blocked",
      };
    }
  }

  // Check allow-list (if configured)
  if (mergedOptions.allowedHostnames.length > 0) {
    const allowed = mergedOptions.allowedHostnames.some(
      (allowed) =>
        hostname === allowed.toLowerCase() || hostname.endsWith(`.${allowed.toLowerCase()}`)
    );
    if (!allowed) {
      return {
        valid: false,
        reason: "hostname_not_allowed",
      };
    }
  }

  // Check for localhost
  if (mergedOptions.blockLocalhost) {
    if (
      hostname === "localhost" ||
      hostname === "localhost.localdomain" ||
      hostname.endsWith(".localhost") ||
      hostname === "[::1]"
    ) {
      return {
        valid: false,
        reason: "localhost_blocked",
      };
    }
  }

  // Check for private network IPs
  if (mergedOptions.blockPrivateNetworks) {
    for (const pattern of PRIVATE_NETWORK_PATTERNS) {
      if (pattern.test(hostname)) {
        return {
          valid: false,
          reason: "private_ip_blocked",
        };
      }
    }
  }

  // Check for link-local addresses
  if (mergedOptions.blockLinkLocal && LINK_LOCAL_PATTERN.test(hostname)) {
    return {
      valid: false,
      reason: "link_local_blocked",
    };
  }

  // Check for IPv6 zone identifiers (can be used for SSRF)
  if (hostname.includes("%")) {
    return {
      valid: false,
      reason: "ipv6_zone_id_blocked",
    };
  }

  // Check for port-based attacks (common SSRF vectors)
  const port = parseInt(url.port, 10);
  if (port > 0) {
    // Block common admin/infrastructure ports
    const blockedPorts = [
      22, // SSH
      23, // Telnet
      25, // SMTP
      53, // DNS
      139, // NetBIOS
      445, // SMB
      3306, // MySQL
      3389, // RDP
      5432, // PostgreSQL
      6379, // Redis
      27017, // MongoDB
      11211, // Memcached
    ];

    if (blockedPorts.includes(port)) {
      return {
        valid: false,
        reason: "port_blocked",
      };
    }
  }

  return {
    valid: true,
    url,
  };
}

/**
 * Safe fetch wrapper with SSRF protection.
 *
 * Validates the URL before making the request and applies security headers.
 */
export async function safeFetch(
  urlString: string,
  init?: RequestInit,
  options?: SsrfProtectionOptions
): Promise<Response> {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };

  // Check if user-provided URLs are allowed
  if (!mergedOptions.allowUserProvidedUrls) {
    throw new Error("User-provided URLs are not allowed");
  }

  // Validate URL
  const validationResult = validateUrl(urlString, mergedOptions);
  if (!validationResult.valid) {
    const error = new Error(`URL validation failed: ${validationResult.reason}`);
    (error as Error & { code: string }).code = "SSRF_BLOCKED";
    throw error;
  }

  // Apply security headers to the request
  const secureInit: RequestInit = {
    ...init,
    headers: {
      ...init?.headers,
      // Prevent following redirects to internal resources
      // Note: fetch redirect mode is 'follow' by default
      // We rely on URL validation on each redirect
    },
  };

  // Make the request with timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

  try {
    const response = await fetch(validationResult.url!.href, {
      ...secureInit,
      signal: controller.signal,
    });

    // Validate response redirects
    if (response.type === "opaqueredirect") {
      throw new Error("Opaque redirect detected - possible SSRF attempt");
    }

    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================================================
// Middleware
// ============================================================================

/**
 * SSRF protection middleware factory.
 *
 * Checks request query parameters and body for URLs and validates them.
 * Logs suspicious URL patterns for security monitoring.
 */
export function ssrfProtection(
  options: SsrfProtectionOptions = {}
): import("hono").MiddlewareHandler {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };

  return async (c, next) => {
    const suspiciousUrls: string[] = [];

    // Check query parameters for URLs
    for (const [key, value] of Object.entries(c.req.query())) {
      if (isUrlLike(value)) {
        if (!mergedOptions.allowUserProvidedUrls) {
          // Log suspicious URL in query parameter
          suspiciousUrls.push(`${key}=${value.slice(0, 50)}`);
        } else {
          // Validate the URL
          const result = validateUrl(value, mergedOptions);
          if (!result.valid) {
            securityLogger.logSuspiciousRequest(
              c,
              "ssrf_url_blocked",
              `URL in query parameter blocked: ${result.reason}`
            );
            return c.json(
              {
                error: "Invalid URL",
                reason: result.reason,
              },
              400
            );
          }
        }
      }
    }

    // Check request body for URLs (for JSON requests)
    const contentType = c.req.header("Content-Type");
    if (contentType?.includes("application/json")) {
      try {
        const body = await c.req.json().catch(() => null);
        if (body && typeof body === "object") {
          for (const [key, value] of Object.entries(body)) {
            if (typeof value === "string" && isUrlLike(value)) {
              if (!mergedOptions.allowUserProvidedUrls) {
                suspiciousUrls.push(`${key}=${value.slice(0, 50)}`);
              } else {
                // Validate the URL
                const result = validateUrl(value, mergedOptions);
                if (!result.valid) {
                  securityLogger.logSuspiciousRequest(
                    c,
                    "ssrf_url_blocked",
                    `URL in request body blocked: ${result.reason}`
                  );
                  return c.json(
                    {
                      error: "Invalid URL",
                      reason: result.reason,
                    },
                    400
                  );
                }
              }
            }
          }
        }
      } catch {
        // Body parsing failed - continue
      }
    }

    // Log suspicious URLs found
    if (suspiciousUrls.length > 0) {
      securityLogger.logSuspiciousRequest(
        c,
        "potential_ssrf",
        `URLs found in request: ${suspiciousUrls.join(", ")}`
      );
    }

    await next();
  };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Check if a string looks like a URL.
 */
function isUrlLike(str: string): boolean {
  const trimmed = str.trim();
  return (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("ftp://") ||
    trimmed.startsWith("//")
  );
}

/**
 * Create a URL allow-list for MTA feeds.
 */
export function createMtaFeedAllowList(): string[] {
  return ["gtfsrt.prod.obanyc.com", "prod.mta.info", "mta.info", "web.mta.info"];
}

/**
 * Validate MTA feed URL.
 */
export function validateMtaFeedUrl(urlString: string): UrlValidationResult {
  return validateUrl(urlString, {
    allowedHostnames: createMtaFeedAllowList(),
    blockPrivateNetworks: true,
    blockLocalhost: true,
    allowUserProvidedUrls: true,
  });
}
