/**
 * Host header injection protection middleware.
 *
 * OWASP A01:2021 - Broken Access Control
 *
 * Prevents host header injection attacks by:
 * - Validating the Host header against an allow-list
 * - Blocking malformed host headers
 * - Preventing cache poisoning via host header
 * - Protecting against password reset poisoning
 * - Protecting against web cache poisoning
 */

import type { MiddlewareHandler } from "hono";
import { securityLogger } from "./security-logging.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Host header protection options.
 */
export interface HostHeaderProtectionOptions {
  /** Allowed hostnames (allow-list) */
  allowedHosts?: string[];
  /** Block requests with no Host header (default: true) */
  blockMissingHost?: boolean;
  /** Block IP addresses in Host header (default: true) */
  blockIpAddresses?: boolean;
  /** Block private network IPs in Host header (default: true) */
  blockPrivateNetworks?: boolean;
  /** Block localhost (default: true) */
  blockLocalhost?: boolean;
  /** Allow subdomains of allowed hosts (default: true) */
  allowSubdomains?: boolean;
  /** Custom validation function */
  customValidator?: (host: string) => boolean;
}

/**
 * Host validation result.
 */
export interface HostValidationResult {
  /** Whether the host is valid */
  valid: boolean;
  /** Reason for rejection (if invalid) */
  reason?: string;
  /** Normalized hostname (if valid) */
  hostname?: string;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default options for host header protection.
 */
const DEFAULT_OPTIONS: Required<
  Omit<HostHeaderProtectionOptions, "allowedHosts" | "customValidator">
> = {
  blockMissingHost: true,
  blockIpAddresses: true,
  blockPrivateNetworks: true,
  blockLocalhost: true,
  allowSubdomains: true,
};

/**
 * Private network IP patterns.
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
];

/**
 * IPv4 pattern.
 */
const IPV4_PATTERN = /^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/;

/**
 * IPv6 pattern.
 */
const IPV6_PATTERN = /^\[?[0-9a-f:]+\]?(:\d+)?$/i;

/**
 * Localhost patterns.
 */
const LOCALHOST_PATTERNS = [
  /^localhost(?::\d+)?$/i,
  /^localhost\.localdomain(?::\d+)?$/i,
  /^.*\.localhost(?::\d+)?$/i,
  /^127\.0\.0\.1(?::\d+)?$/,
  /^::1(?::\d+)?$/,
];

// ============================================================================
// Host Validation
// ============================================================================

/**
 * Validate a hostname string.
 *
 * Checks:
 * - Hostname is not empty
 * - Hostname doesn't contain spaces
 * - Hostname doesn't contain control characters
 * - Hostname doesn't start/end with hyphen or dot
 * - Hostname doesn't contain consecutive dots
 */
function validateHostnameFormat(hostname: string): boolean {
  if (hostname.length === 0 || hostname.length > 253) {
    return false;
  }

  // Check for spaces
  if (/\s/.test(hostname)) {
    return false;
  }

  // Check for control characters
  if (/[\x00-\x1F\x7F]/.test(hostname)) {
    return false;
  }

  // Check for invalid characters
  if (!/^[a-zA-Z0-9._-]+$/.test(hostname)) {
    return false;
  }

  // Check for leading/trailing hyphen or dot
  if (/^[-.]|[-.]$/.test(hostname)) {
    return false;
  }

  // Check for consecutive dots
  if (/\.\./.test(hostname)) {
    return false;
  }

  return true;
}

/**
 * Validate a host header value.
 */
export function validateHostHeader(
  host: string | undefined,
  options: HostHeaderProtectionOptions = {}
): HostValidationResult {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };

  // Check for missing host
  if (!host) {
    if (mergedOptions.blockMissingHost) {
      return {
        valid: false,
        reason: "missing_host_header",
      };
    }
    return {
      valid: true,
      hostname: undefined,
    };
  }

  // Extract hostname (remove port if present)
  const hostname = host.split(":")[0]!.toLowerCase();

  // Validate hostname format
  if (!validateHostnameFormat(hostname)) {
    return {
      valid: false,
      reason: "invalid_hostname_format",
    };
  }

  // Check for IP addresses
  if (mergedOptions.blockIpAddresses) {
    if (IPV4_PATTERN.test(hostname) || IPV6_PATTERN.test(hostname)) {
      return {
        valid: false,
        reason: "ip_address_blocked",
      };
    }
  }

  // Check for localhost
  if (mergedOptions.blockLocalhost) {
    for (const pattern of LOCALHOST_PATTERNS) {
      if (pattern.test(hostname)) {
        return {
          valid: false,
          reason: "localhost_blocked",
        };
      }
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

  // Check allow-list
  if (mergedOptions.allowedHosts && mergedOptions.allowedHosts.length > 0) {
    let allowed = false;

    for (const allowedHost of mergedOptions.allowedHosts) {
      const normalizedAllowed = allowedHost.toLowerCase();

      if (mergedOptions.allowSubdomains) {
        // Check exact match or subdomain
        if (hostname === normalizedAllowed || hostname.endsWith(`.${normalizedAllowed}`)) {
          allowed = true;
          break;
        }
      } else {
        // Exact match only
        if (hostname === normalizedAllowed) {
          allowed = true;
          break;
        }
      }
    }

    if (!allowed) {
      return {
        valid: false,
        reason: "host_not_allowed",
      };
    }
  }

  // Custom validator
  if (mergedOptions.customValidator) {
    if (!mergedOptions.customValidator(hostname)) {
      return {
        valid: false,
        reason: "custom_validator_failed",
      };
    }
  }

  return {
    valid: true,
    hostname,
  };
}

// ============================================================================
// Middleware
// ============================================================================

/**
 * Host header protection middleware factory.
 *
 * Validates the Host header on every request to prevent:
 * - Cache poisoning
 * - Password reset poisoning
 * - XSS via host header
 * - Phishing attacks
 */
export function hostHeaderProtection(options: HostHeaderProtectionOptions = {}): MiddlewareHandler {
  return async (c, next) => {
    const host = c.req.header("Host");

    const result = validateHostHeader(host, options);

    if (!result.valid) {
      securityLogger.logSuspiciousRequest(
        c,
        "host_header_rejected",
        `Host header rejected: ${result.reason}`
      );

      return c.json(
        {
          error: "Invalid Host header",
          reason: result.reason,
        },
        400
      );
    }

    // Store validated hostname for use in responses
    if (result.hostname) {
      c.set("validatedHost", result.hostname);
    }

    await next();
  };
}

/**
 * Get the validated hostname from context.
 */
export function getValidatedHost(c: { get: (key: string) => unknown }): string | undefined {
  return c.get("validatedHost") as string | undefined;
}
