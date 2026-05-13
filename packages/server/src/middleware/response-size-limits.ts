/**
 * Response size limits middleware for Hono.
 *
 * OWASP A01:2021 - Broken Access Control (DoS Prevention)
 * OWASP A04:2021 - Insecure Design (Resource Limits)
 *
 * Protects against DoS attacks via large response payloads
 * that could exhaust bandwidth, memory, or cause client-side issues.
 *
 * Attack scenarios:
 * - Malicious backend or data source returns extremely large responses
 * - Accidentally large responses from bugs cause service degradation
 * - Memory exhaustion from buffering large responses
 * - Bandwidth exhaustion affecting other clients
 *
 * This middleware limits response body size and streams responses
 * when possible to avoid buffering large payloads in memory.
 */

import type { MiddlewareHandler } from "hono";
import { securityLogger } from "./security-logging.js";

/**
 * Response size limit options.
 */
export interface ResponseSizeLimitOptions {
  /** Maximum response body size in bytes (default: 10MB) */
  maxResponseSize?: number;
  /** Maximum response body size for JSON responses (default: 1MB) */
  maxJsonSize?: number;
  /** Stream responses larger than this threshold (default: 100KB) */
  streamThreshold?: number;
  /** Skip validation for these paths (default: []) */
  excludePaths?: string[];
  /** Whether to compress large responses (default: true) */
  compressLargeResponses?: boolean;
}

/** Default options */
const DEFAULT_OPTIONS: Required<Omit<ResponseSizeLimitOptions, "excludePaths">> = {
  maxResponseSize: 10 * 1024 * 1024, // 10MB
  maxJsonSize: 1024 * 1024, // 1MB
  streamThreshold: 100 * 1024, // 100KB
  compressLargeResponses: true,
};

/**
 * Estimate response size from headers.
 *
 * Checks Content-Length header if present.
 */
function estimateResponseSize(response: Response): number | undefined {
  const contentLength = response.headers.get("Content-Length");
  if (contentLength) {
    const size = parseInt(contentLength, 10);
    return isNaN(size) ? undefined : size;
  }
  return undefined;
}

/**
 * Check if response should be streamed based on content type and size.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function shouldStream(
  contentType: string | null,
  estimatedSize: number | undefined,
  options: Required<Omit<ResponseSizeLimitOptions, "excludePaths">>
): boolean {
  if (!estimatedSize) {
    return false;
  }

  // Stream if size exceeds threshold
  if (estimatedSize > options.streamThreshold) {
    return true;
  }

  // Stream certain content types regardless of size
  if (contentType) {
    const streamTypes = [
      "video/",
      "audio/",
      "application/octet-stream",
      "application/pdf",
      "application/zip",
    ];
    if (streamTypes.some((type) => contentType.startsWith(type))) {
      return true;
    }
  }

  return false;
}

/**
 * Response size limit middleware.
 *
 * Validates response body size and applies appropriate limits
 * based on content type. Streams large responses to avoid buffering.
 */
export function responseSizeLimits(options: ResponseSizeLimitOptions = {}): MiddlewareHandler {
  const {
    maxResponseSize,
    maxJsonSize,
    streamThreshold,
    excludePaths = [],
    compressLargeResponses,
  } = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  return async (c, next) => {
    // Skip if path is excluded
    if (excludePaths.some((path) => c.req.path.startsWith(path))) {
      return next();
    }

    // Store original json method
    const originalJson = c.json.bind(c);

    // Override json method to check response size
    c.json = (data: unknown, status = 200, headers = {}) => {
      const response = originalJson(data, status, headers);

      // Estimate JSON size
      const jsonString = JSON.stringify(data);
      const jsonSize = new TextEncoder().encode(jsonString).length;

      // Check JSON size limit
      if (jsonSize > maxJsonSize) {
        securityLogger.logBlockedAttack(c, "json_response_size_limit", {
          actualSize: jsonSize,
          maxSize: maxJsonSize,
        });
        return originalJson(
          {
            error: "Response too large",
            maxSize: maxJsonSize,
            actualSize: jsonSize,
          },
          413
        );
      }

      return response;
    };

    await next();

    // Check response size after handler executes
    const response = c.res;
    const contentType = response.headers.get("Content-Type");
    const estimatedSize = estimateResponseSize(response);

    // Determine appropriate size limit based on content type
    let maxSize = maxResponseSize;
    if (contentType?.includes("application/json")) {
      maxSize = maxJsonSize;
    }

    // Check if size limit is exceeded
    if (estimatedSize && estimatedSize > maxSize) {
      securityLogger.logBlockedAttack(c, "response_size_limit", {
        actualSize: estimatedSize,
        maxSize,
        contentType,
      });

      // Override response with error
      c.res = originalJson(
        {
          error: "Response too large",
          maxSize,
          actualSize: estimatedSize,
        },
        413
      );
      return;
    }

    // Add compression hint for large responses
    if (estimatedSize && estimatedSize > streamThreshold && compressLargeResponses) {
      const acceptEncoding = c.req.header("Accept-Encoding");
      if (acceptEncoding?.includes("br") || acceptEncoding?.includes("gzip")) {
        // Response will be compressed by compression middleware
        c.res.headers.set("X-Should-Compress", "true");
      }
    }

    // Log large responses for monitoring
    if (estimatedSize && estimatedSize > 1024 * 1024) {
      // Log responses > 1MB
      securityLogger.logSecurityEvent(c, "large_response", {
        size: estimatedSize,
        contentType: contentType || "unknown",
      });
    }
  };
}

/**
 * Create a streaming response handler.
 *
 * Use this for responses that should be streamed to avoid buffering.
 */
export function createStreamResponse(
  streamGenerator: () => ReadableStream<Uint8Array>,
  contentType: string,
  headers: Record<string, string> = {}
): Response {
  return new Response(streamGenerator(), {
    headers: {
      "Content-Type": contentType,
      "Transfer-Encoding": "chunked",
      "X-Content-Streamed": "true",
      ...headers,
    },
  });
}

/**
 * Paginated response helper.
 *
 * Helps break large responses into paginated chunks.
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    hasMore: boolean;
  };
}

/**
 * Create a paginated response from a large dataset.
 */
export function createPaginatedResponse<T>(
  data: T[],
  page: number,
  pageSize: number
): PaginatedResponse<T> {
  const offset = (page - 1) * pageSize;
  const paginatedData = data.slice(offset, offset + pageSize);
  const totalCount = data.length;
  const hasMore = offset + pageSize < totalCount;

  return {
    data: paginatedData,
    pagination: {
      page,
      pageSize,
      totalCount,
      hasMore,
    },
  };
}

/**
 * Response payload size estimator utility.
 *
 * Estimates the size of a data payload before sending it as JSON.
 */
export function estimatePayloadSize(data: unknown): number {
  if (data === null || data === undefined) {
    return 4; // "null"
  }

  if (typeof data === "string") {
    return new TextEncoder().encode(data).length;
  }

  if (typeof data === "number") {
    return data.toString().length;
  }

  if (typeof data === "boolean") {
    return data ? 4 : 5; // "true" or "false"
  }

  if (Array.isArray(data)) {
    return data.reduce((sum, item) => sum + estimatePayloadSize(item), 2); // 2 for brackets
  }

  if (typeof data === "object") {
    let size = 2; // 2 for braces
    const entries = Object.entries(data);
    entries.forEach(([key, value], index) => {
      size += new TextEncoder().encode(key).length + 3; // key + ":"
      size += estimatePayloadSize(value);
      if (index < entries.length - 1) {
        size += 1; // ","
      }
    });
    return size;
  }

  return 0;
}
