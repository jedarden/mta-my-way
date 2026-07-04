/**
 * JSON depth protection middleware for Hono.
 *
 * OWASP A01:2021 - Broken Access Control (DoS Prevention)
 * OWASP A03:2021 - Injection (JSON DoS Prevention)
 *
 * Protects against DoS attacks via deeply nested JSON structures
 * that could cause stack overflow or excessive memory usage.
 *
 * Attack scenarios:
 * - Malicious client sends deeply nested JSON to exhaust stack
 * - Large JSON payloads with excessive nesting cause parsing delays
 * - Recursive data structures that never terminate
 *
 * This middleware validates JSON structure depth before full parsing.
 */

import type { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { securityLogger } from "./security-logging.js";

/**
 * JSON depth protection options.
 */
export interface JsonDepthProtectionOptions {
  /** Maximum allowed nesting depth (default: 32) */
  maxDepth?: number;
  /** Maximum array length (default: 1000) */
  maxArrayLength?: number;
  /** Maximum object keys (default: 100) */
  maxObjectKeys?: number;
  /** Skip validation for these paths (default: []) */
  excludePaths?: string[];
}

/** Default options */
const DEFAULT_OPTIONS: Required<Omit<JsonDepthProtectionOptions, "excludePaths">> = {
  maxDepth: 32,
  maxArrayLength: 1000,
  maxObjectKeys: 100,
};

/**
 * Calculate the depth of a JSON value.
 *
 * Returns the maximum nesting depth of objects and arrays.
 * Primitives (strings, numbers, booleans, null) return 0.
 */
function calculateJsonDepth(value: unknown, currentDepth = 0, options = DEFAULT_OPTIONS): number {
  // Check if we've exceeded the maximum depth
  if (currentDepth > options.maxDepth) {
    return currentDepth;
  }

  if (Array.isArray(value)) {
    // Check array length
    if (value.length > options.maxArrayLength) {
      return currentDepth + options.maxArrayLength;
    }
    // Recursively check array elements
    let maxChildDepth = currentDepth;
    for (const item of value) {
      const childDepth = calculateJsonDepth(item, currentDepth + 1, options);
      maxChildDepth = Math.max(maxChildDepth, childDepth);
    }
    return maxChildDepth;
  }

  if (value !== null && typeof value === "object") {
    // Check object key count
    const keys = Object.keys(value);
    if (keys.length > options.maxObjectKeys) {
      return currentDepth + options.maxObjectKeys;
    }
    // Recursively check object values
    let maxChildDepth = currentDepth;
    for (const key of keys) {
      const childDepth = calculateJsonDepth(
        (value as Record<string, unknown>)[key],
        currentDepth + 1,
        options
      );
      maxChildDepth = Math.max(maxChildDepth, childDepth);
    }
    return maxChildDepth;
  }

  // Primitives don't increase depth
  return currentDepth;
}

/**
 * Validate JSON structure without full parsing.
 *
 * Uses a simple state machine to track nesting depth
 * while scanning the JSON string character by character.
 * This is more efficient than full parsing for rejection.
 */
function validateJsonStructure(
  jsonString: string,
  options: Required<Omit<JsonDepthProtectionOptions, "excludePaths">>
): {
  valid: boolean;
  reason?: string;
  depth?: number;
} {
  let depth = 0;
  let maxDepth = 0;
  let arrayLength = 0;
  let objectKeys = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < jsonString.length; i++) {
    const char = jsonString[i];

    // Handle escape sequences
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (char === "\\") {
      escapeNext = true;
      continue;
    }

    // Track string boundaries
    if (char === '"') {
      inString = !inString;
      continue;
    }

    // Skip content inside strings
    if (inString) {
      continue;
    }

    // Track nesting depth
    switch (char) {
      case "{":
        depth++;
        maxDepth = Math.max(maxDepth, depth);
        objectKeys = 0;
        if (depth > options.maxDepth) {
          return { valid: false, reason: "Maximum object depth exceeded", depth: maxDepth };
        }
        break;
      case "}":
        depth--;
        break;
      case "[":
        depth++;
        maxDepth = Math.max(maxDepth, depth);
        arrayLength = 0;
        if (depth > options.maxDepth) {
          return { valid: false, reason: "Maximum array depth exceeded", depth: maxDepth };
        }
        break;
      case "]":
        depth--;
        if (arrayLength > options.maxArrayLength) {
          return { valid: false, reason: "Maximum array length exceeded" };
        }
        break;
      case ":":
        // Transition from key to value in object
        break;
      case ",":
        // Increment counters for next element
        if (depth > 0) {
          const prevChar = jsonString[i - 1];
          if (prevChar === "]" || prevChar === "}") {
            // After an array element or object value
            if (jsonString[i + 1] === "{" || jsonString[i + 1] === "[") {
              // Next is a nested structure, increment appropriate counter
              const parentStart = jsonString.lastIndexOf("{", i);
              const arrayParentStart = jsonString.lastIndexOf("[", i);
              if (arrayParentStart > parentStart) {
                arrayLength++;
              } else {
                objectKeys++;
              }
            }
          }
        }
        break;
    }
  }

  // Check final counts
  if (objectKeys > options.maxObjectKeys) {
    return { valid: false, reason: "Maximum object keys exceeded" };
  }

  return { valid: true, depth: maxDepth };
}

/**
 * JSON depth protection middleware.
 *
 * Validates JSON request body structure depth and size limits
 * to prevent DoS attacks via malicious JSON payloads.
 */
export function jsonDepthProtection(options: JsonDepthProtectionOptions = {}): MiddlewareHandler {
  const {
    maxDepth,
    maxArrayLength,
    maxObjectKeys,
    excludePaths = [],
  } = { ...DEFAULT_OPTIONS, ...options };

  return async (c, next) => {
    // Skip if path is excluded
    if (excludePaths.some((path) => c.req.path.startsWith(path))) {
      return next();
    }

    // Only apply to requests with JSON body
    const contentType = c.req.header("Content-Type");
    if (!contentType?.includes("application/json")) {
      return next();
    }

    try {
      // Get raw body as text
      const rawBody = await c.req.text();

      // Skip validation for empty bodies (e.g., GET requests with json content-type)
      if (!rawBody || rawBody.trim() === "") {
        return next();
      }

      // Quick check for obvious attacks before parsing
      const structureCheck = validateJsonStructure(rawBody, {
        maxDepth,
        maxArrayLength,
        maxObjectKeys,
      });
      if (!structureCheck.valid) {
        securityLogger.logBlockedAttack(
          c,
          "json_depth_protection",
          `${structureCheck.reason} (depth: ${structureCheck.depth})`
        );
        return c.json({ error: `Invalid JSON structure: ${structureCheck.reason}` }, 413);
      }

      // Parse JSON to verify it's valid and do final depth check
      const parsed = JSON.parse(rawBody);
      const actualDepth = calculateJsonDepth(parsed, 0, {
        maxDepth,
        maxArrayLength,
        maxObjectKeys,
      });

      if (actualDepth > maxDepth) {
        securityLogger.logBlockedAttack(
          c,
          "json_depth_protection",
          `Maximum depth exceeded (actual: ${actualDepth}, max: ${maxDepth})`
        );
        return c.json({ error: `JSON depth exceeds maximum of ${maxDepth}` }, 413);
      }

      // Don't store the parsed body - let Hono's normal json() handle it
      // This avoids consuming the body stream before downstream handlers can read it
      await next();
    } catch (error) {
      // Re-throw HTTP exceptions (our own validation errors)
      if (error instanceof HTTPException) {
        throw error;
      }

      // Log parse failures as input validation (not blocked attacks) —
      // malformed JSON is typically a client bug, not an attack attempt.
      securityLogger.logInputValidationFailure(
        c,
        "body",
        `JSON parse error: ${error instanceof Error ? error.message : "Unknown error"}`
      );
      return c.json({ error: "Invalid JSON" }, 400);
    }
  };
}
