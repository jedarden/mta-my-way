/**
 * HTTP Parameter Pollution protection middleware for Hono.
 *
 * Protects against HTTP Parameter Pollution (HPP) attacks where an attacker
 * injects multiple query or body parameters with the same name to bypass
 * validation or manipulate application logic.
 *
 * This middleware handles duplicate parameters by:
 * 1. Taking the first value (default, safest for most cases)
 * 2. Optionally taking the last value (useful for some frameworks)
 * 3. Optionally rejecting requests with duplicates entirely
 */

import type { MiddlewareHandler } from "hono";

/**
 * HPP protection strategy.
 */
type HppStrategy = "first" | "last" | "reject";

/**
 * Options for HPP protection.
 */
interface HppProtectionOptions {
  /** Strategy for handling duplicate parameters (default: "first") */
  strategy?: HppStrategy;
  /** Check query parameters (default: true) */
  checkQuery?: boolean;
  /** Check request body (default: true) */
  checkBody?: boolean;
  /** Parameters to whitelist (allow duplicates for these keys) */
  whitelist?: string[];
  /** Custom error message for reject strategy */
  rejectMessage?: string;
}

/**
 * HTTP Parameter Pollution protection middleware.
 *
 * Detects and handles duplicate query parameters and body fields that
 * could be used in parameter pollution attacks.
 *
 * Default strategy: "first" - takes the first occurrence of each parameter,
 * ignoring subsequent duplicates. This is the safest approach for most
 * applications as it ignores attacker-supplied values.
 *
 * Strategy "last": takes the last occurrence of each parameter. Use this
 * if your framework conventionally uses the last value.
 *
 * Strategy "reject": returns 400 Bad Request when duplicates are detected.
 * Use this for strict security environments.
 */
export function hppProtection(options: HppProtectionOptions = {}): MiddlewareHandler {
  const {
    strategy = "first",
    checkQuery = true,
    checkBody = true,
    whitelist = [],
    rejectMessage = "Duplicate parameters detected",
  } = options;

  const whitelistSet = new Set(whitelist);

  /**
   * Process a record of parameters, removing or handling duplicates.
   */
  function processParams(params: Record<string, string | string[] | undefined>): {
    cleaned: Record<string, string>;
    hasDuplicates: boolean;
  } {
    const cleaned: Record<string, string> = {};
    const seen = new Set<string>();
    let hasDuplicates = false;

    for (const [key, value] of Object.entries(params)) {
      if (value === undefined) continue;

      // Skip whitelisted parameters
      if (whitelistSet.has(key)) {
        cleaned[key] = Array.isArray(value) ? value[0]! : value;
        continue;
      }

      if (Array.isArray(value)) {
        hasDuplicates = true;

        if (seen.has(key)) {
          // Already processed this key, skip based on strategy
          if (strategy === "last") {
            cleaned[key] = value[value.length - 1]!;
          }
          // For "first" strategy, we keep the first value, so skip
          // For "reject" strategy, we just mark hasDuplicates = true
        } else {
          seen.add(key);
          if (strategy === "first") {
            cleaned[key] = value[0]!;
          } else if (strategy === "last") {
            cleaned[key] = value[value.length - 1]!;
          }
        }
      } else {
        cleaned[key] = value;
      }
    }

    return { cleaned, hasDuplicates };
  }

  return async (c, next) => {
    // Process query parameters
    if (checkQuery) {
      // Parse raw query string to detect duplicates
      // Hono's c.req.query() only returns the last value for duplicate keys
      const rawUrl = c.req.raw.url;
      const urlObj = new URL(rawUrl);
      const rawParams = new URLSearchParams(urlObj.search);

      // Convert to record with arrays to detect duplicates
      const queryParamsWithArrays: Record<string, string[]> = {};
      for (const [key, value] of rawParams.entries()) {
        if (!queryParamsWithArrays[key]) {
          queryParamsWithArrays[key] = [];
        }
        queryParamsWithArrays[key].push(value);
      }

      // For non-duplicate params, use single string value
      const queryParams: Record<string, string | string[]> = {};
      for (const [key, values] of Object.entries(queryParamsWithArrays)) {
        queryParams[key] = values.length > 1 ? values : values[0]!;
      }

      const { cleaned, hasDuplicates } = processParams(queryParams);

      if (strategy === "reject" && hasDuplicates) {
        // Find which parameters have duplicates for the error message
        const duplicates: string[] = [];
        for (const [key, value] of Object.entries(queryParams)) {
          if (Array.isArray(value) && !whitelistSet.has(key)) {
            duplicates.push(key);
          }
        }

        console.warn(
          JSON.stringify({
            event: "hpp_rejected",
            timestamp: new Date().toISOString(),
            duplicates,
            ip: c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For") || "unknown",
          })
        );

        return c.json(
          {
            error: rejectMessage,
            duplicates,
          },
          400
        );
      }

      // Attach cleaned query parameters to context
      c.set("cleanedQuery", cleaned);
    }

    // Process request body (for JSON and form data)
    if (
      checkBody &&
      (c.req.method === "POST" || c.req.method === "PUT" || c.req.method === "PATCH")
    ) {
      const contentType = c.req.header("Content-Type");

      if (contentType?.includes("application/json")) {
        try {
          const body = await c.req.json().catch(() => ({}));
          const { cleaned, hasDuplicates } = processParams(body);

          if (strategy === "reject" && hasDuplicates) {
            console.warn(
              JSON.stringify({
                event: "hpp_rejected",
                timestamp: new Date().toISOString(),
                location: "body",
                ip:
                  c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For") || "unknown",
              })
            );

            return c.json({ error: rejectMessage }, 400);
          }

          // Attach cleaned body to context
          c.set("cleanedBody", cleaned);
        } catch {
          // Body parse failed, let it be handled by other middleware
        }
      }

      if (contentType?.includes("application/x-www-form-urlencoded")) {
        try {
          const formData = await c.req.formData().catch(() => new FormData());
          const params: Record<string, string | string[]> = {};

          for (const [key, value] of formData.entries()) {
            if (params[key]) {
              if (Array.isArray(params[key])) {
                (params[key] as string[]).push(value.toString());
              } else {
                params[key] = [params[key] as string, value.toString()];
              }
            } else {
              params[key] = value.toString();
            }
          }

          const { cleaned, hasDuplicates } = processParams(params);

          if (strategy === "reject" && hasDuplicates) {
            console.warn(
              JSON.stringify({
                event: "hpp_rejected",
                timestamp: new Date().toISOString(),
                location: "form",
                ip:
                  c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For") || "unknown",
              })
            );

            return c.json({ error: rejectMessage }, 400);
          }

          // Attach cleaned form data to context
          c.set("cleanedForm", cleaned);
        } catch {
          // Form parse failed, let it be handled by other middleware
        }
      }
    }

    await next();
  };
}

/**
 * Helper to get cleaned query parameters from context.
 * Returns the query parameters with HPP protection applied.
 */
export function getCleanedQuery(c: { get: (key: string) => unknown }): Record<string, string> {
  return (c.get("cleanedQuery") as Record<string, string>) || {};
}

/**
 * Helper to get cleaned request body from context.
 * Returns the body with HPP protection applied.
 */
export function getCleanedBody(c: { get: (key: string) => unknown }): Record<string, string> {
  return (c.get("cleanedBody") as Record<string, string>) || {};
}

/**
 * Helper to get cleaned form data from context.
 * Returns the form data with HPP protection applied.
 */
export function getCleanedForm(c: { get: (key: string) => unknown }): Record<string, string> {
  return (c.get("cleanedForm") as Record<string, string>) || {};
}
