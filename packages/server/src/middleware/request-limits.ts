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
  /** Maximum query string length (default: 512) */
  maxQueryStringLength?: number;
  /** Maximum number of query parameters (default: 20) */
  maxQueryParams?: number;
  /** Maximum length of individual query parameter value (default: 256) */
  maxQueryParamValueLength?: number;
}

const DEFAULT_MAX_BODY_SIZE = 1024 * 1024; // 1MB
const DEFAULT_MAX_URL_LENGTH = 2048;
const DEFAULT_MAX_HEADER_SIZE = 8 * 1024; // 8KB
const DEFAULT_MAX_QUERY_STRING_LENGTH = 512;
const DEFAULT_MAX_QUERY_PARAMS = 20;
const DEFAULT_MAX_QUERY_PARAM_VALUE_LENGTH = 256;

/**
 * Request size limits middleware.
 *
 * Checks request URL length, header size, body size, and query parameter limits.
 */
export function requestSizeLimits(options: SizeLimitsOptions = {}): MiddlewareHandler {
  const {
    maxBodySize = DEFAULT_MAX_BODY_SIZE,
    maxUrlLength = DEFAULT_MAX_URL_LENGTH,
    maxHeaderSize = DEFAULT_MAX_HEADER_SIZE,
    maxQueryStringLength = DEFAULT_MAX_QUERY_STRING_LENGTH,
    maxQueryParams = DEFAULT_MAX_QUERY_PARAMS,
    maxQueryParamValueLength = DEFAULT_MAX_QUERY_PARAM_VALUE_LENGTH,
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
    for (const [key, value] of c.req.raw.headers.entries()) {
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

    // Check query string length
    const queryString = c.req.query();
    const queryStringStr = new URLSearchParams(queryString as Record<string, string>).toString();
    if (queryStringStr.length > maxQueryStringLength) {
      return c.json(
        {
          error: "Query string too large",
          maxSize: maxQueryStringLength,
          actualSize: queryStringStr.length,
        },
        414 // URI Too Long
      );
    }

    // Check number of query parameters
    const queryParamCount = Object.keys(queryString).length;
    if (queryParamCount > maxQueryParams) {
      return c.json(
        {
          error: "Too many query parameters",
          maxSize: maxQueryParams,
          actualSize: queryParamCount,
        },
        413 // Payload Too Large
      );
    }

    // Check individual query parameter value lengths
    for (const [key, value] of Object.entries(queryString)) {
      if (value && value.length > maxQueryParamValueLength) {
        return c.json(
          {
            error: "Query parameter value too large",
            parameter: key,
            maxSize: maxQueryParamValueLength,
            actualSize: value.length,
          },
          413 // Payload Too Large
        );
      }
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
