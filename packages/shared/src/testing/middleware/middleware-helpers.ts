/**
 * Middleware testing utilities for MTA My Way.
 *
 * Framework-agnostic helpers for exercising middleware without starting a
 * server. Middleware under test is modelled as a plain function that receives
 * a standard `Request` and either returns a `Response` (short-circuit) or
 * calls `next()` to continue the chain — the same shape Hono middleware
 * follows in `packages/server/src/middleware/`.
 *
 * These helpers complement `createMockRequest` in `test-helpers.ts`, which is
 * a plain object by design: middleware and the harness here operate on real
 * `Request`/`Response` instances.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Handler invoked when every middleware in the chain calls `next()`.
 */
export type TerminalHandler = (request: Request) => Response | Promise<Response>;

/**
 * A middleware function: inspect the request, return a `Response` to
 * short-circuit the chain, or call `next()` to run the rest of it.
 */
export type MiddlewareLike = (
  request: Request,
  next: () => Promise<Response>
) => Response | Promise<Response>;

// ============================================================================
// Request Builders
// ============================================================================

/**
 * Options for {@link createMiddlewareRequest}.
 */
export interface MiddlewareRequestOptions {
  /** HTTP method (defaults to `"GET"`) */
  method?: string;
  /** Absolute URL (defaults to `"http://localhost:3001/api/test"`) */
  url?: string;
  /** Headers to send (header names are case-insensitive) */
  headers?: Record<string, string>;
  /** Body — non-string values are JSON-serialized automatically */
  body?: unknown;
}

/** Methods the fetch spec forbids from carrying a request body. */
const BODYLESS_METHODS = new Set(["GET", "HEAD"]);

/**
 * Build a real `Request` for middleware input.
 *
 * Non-string bodies are JSON-serialized and sent with an
 * `application/json` content type unless one is already provided.
 *
 * @param options - Request parts to set (all optional)
 * @returns A standard `Request` instance
 * @throws When a body is supplied with a method that cannot carry one
 *
 * @example JSON POST with custom headers
 * ```typescript
 * const request = createMiddlewareRequest({
 *   method: "POST",
 *   url: "http://localhost:3001/api/favorites",
 *   headers: { authorization: "Bearer token123" },
 *   body: { stationId: "725" },
 * });
 * ```
 */
export function createMiddlewareRequest(options: MiddlewareRequestOptions = {}): Request {
  const method = (options.method ?? "GET").toUpperCase();
  const headers = new Headers(options.headers);

  let body: string | undefined;
  if (options.body !== undefined) {
    if (BODYLESS_METHODS.has(method)) {
      throw new Error(`${method} requests cannot carry a body — use POST, PUT or PATCH`);
    }
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
  }

  return new Request(options.url ?? "http://localhost:3001/api/test", {
    method,
    headers,
    body,
  });
}

// ============================================================================
// Middleware Execution
// ============================================================================

/** Handler used when the caller does not supply one: an empty `200` response. */
const defaultTerminalHandler: TerminalHandler = () => new Response(null, { status: 200 });

/**
 * Run middleware around a terminal handler and return the resulting response.
 *
 * Middleware compose like Hono's registration order: in `[a, b]`, `a` runs
 * first, then `b`, then the handler. Each middleware receives its own clone
 * of `request`, so a middleware that reads the body does not consume it for
 * downstream layers.
 *
 * @param middleware - A middleware, or a chain of them
 * @param request - The request entering the chain
 * @param handler - Terminal handler (defaults to an empty `200` response)
 * @returns The response produced by the chain
 *
 * @example Rate-limit style short-circuit
 * ```typescript
 * const limited: MiddlewareLike = (_request, next) =>
 *   isOverLimit() ? new Response("Too Many Requests", { status: 429 }) : next();
 *
 * const response = await executeMiddleware(limited, createMiddlewareRequest());
 * expect(response.status).toBe(429);
 * ```
 */
export async function executeMiddleware(
  middleware: MiddlewareLike | MiddlewareLike[],
  request: Request,
  handler: TerminalHandler = defaultTerminalHandler
): Promise<Response> {
  const chain = Array.isArray(middleware) ? [...middleware].reverse() : [middleware];

  return chain.reduce<() => Promise<Response>>(
    (next, layer) => () => Promise.resolve(layer(request.clone(), next)),
    () => Promise.resolve(handler(request))
  )();
}

// ============================================================================
// Response Assertions
// ============================================================================

/**
 * Security header names set by the server's `securityHeaders` middleware.
 *
 * Only the names are listed here — values (CSP directives, HSTS max-age, …)
 * are policy owned by the middleware and should be asserted explicitly where
 * they matter.
 */
export const SECURITY_HEADER_NAMES = [
  "Content-Security-Policy",
  "Strict-Transport-Security",
  "X-Content-Type-Options",
  "X-Frame-Options",
  "Referrer-Policy",
  "Permissions-Policy",
  "Cross-Origin-Opener-Policy",
  "Cross-Origin-Resource-Policy",
  "Cross-Origin-Embedder-Policy",
  "X-Permitted-Cross-Domain-Policies",
] as const;

/**
 * Assert that a response carries a header, and optionally that its value matches.
 *
 * @param response - Response to inspect
 * @param name - Header name (case-insensitive)
 * @param expected - Exact value to require (omit to only require presence)
 * @throws When the header is absent or does not equal `expected`
 */
export function assertHeader(response: Response, name: string, expected?: string): void {
  const actual = response.headers.get(name);

  if (actual === null) {
    throw new Error(`Expected response to include "${name}" header, but it was absent`);
  }
  if (expected !== undefined && actual !== expected) {
    throw new Error(
      `Expected "${name}" header to be ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

/**
 * Assert that a response omits a header.
 *
 * @param response - Response to inspect
 * @param name - Header name (case-insensitive)
 * @throws When the header is present
 */
export function assertNoHeader(response: Response, name: string): void {
  const actual = response.headers.get(name);

  if (actual !== null) {
    throw new Error(
      `Expected response to omit "${name}" header, but it was ${JSON.stringify(actual)}`
    );
  }
}

/**
 * Assert that a response carries the expected security headers.
 *
 * @param response - Response to inspect
 * @param required - Header names to require (defaults to {@link SECURITY_HEADER_NAMES})
 * @throws Listing the headers that are missing
 */
export function assertSecurityHeaders(
  response: Response,
  required: readonly string[] = SECURITY_HEADER_NAMES
): void {
  const missing = required.filter((name) => response.headers.get(name) === null);

  if (missing.length > 0) {
    throw new Error(`Response is missing security headers: ${missing.join(", ")}`);
  }
}
