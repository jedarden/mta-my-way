/**
 * Request size limits middleware for Hono.
 *
 * Protects against DoS attacks by limiting request body size.
 * Returns 413 Payload Too Large when limit is exceeded.
 */

import type { MiddlewareHandler } from "hono";

/**
 * Request size limits configuration.
 */
interface SizeLimitsOptions {
  /** Maximum request body size in bytes (default: 1MB) */
  maxBodySize?: number;
  /** Maximum URL length in characters (default: 2048) */
  maxUrlLength?: number;
  /** Maximum header size in bytes (default: 8KB) */
  maxHeaderSize?: number;
}

const DEFAULT_MAX_BODY_SIZE = 1024 * 1024; // 1MB
const DEFAULT_MAX_URL_LENGTH = 2048;
const DEFAULT_MAX_HEADER_SIZE = 8 * 1024; // 8KB

/**
 * Request size limits middleware.
 *
 * Checks request URL length, header size, and body size against limits.
 */
export function requestSizeLimits(options: SizeLimitsOptions = {}): MiddlewareHandler {
  const {
    maxBodySize = DEFAULT_MAX_BODY_SIZE,
    maxUrlLength = DEFAULT_MAX_URL_LENGTH,
    maxHeaderSize = DEFAULT_MAX_HEADER_SIZE,
  } = options;

  return async (c, next) => {
    // Check URL length
    const url = c.req.url;
    if (url.length > maxUrlLength) {
      return c.json(
        {
          error: "Request URL too large",
          maxSize: maxUrlLength,
          actualSize: url.length,
        },
        414 // URI Too Long
      );
    }

    // Estimate header size (rough calculation)
    let headerSize = 0;
    for (const [key, value] of c.req.header()) {
      headerSize += key.length + (value?.length ?? 0) + 4; // ": " + "\r\n"
    }
    if (headerSize > maxHeaderSize) {
      return c.json(
        {
          error: "Request headers too large",
          maxSize: maxHeaderSize,
          actualSize: headerSize,
        },
        431 // Request Header Fields Too Large
      );
    }

    // Check Content-Length for body size
    const contentLength = c.req.header("Content-Length");
    if (contentLength) {
      const length = parseInt(contentLength, 10);
      if (!isNaN(length) && length > maxBodySize) {
        return c.json(
          {
            error: "Request body too large",
            maxSize: maxBodySize,
            actualSize: length,
          },
          413 // Payload Too Large
        );
      }
    }

    await next();
  };
}
