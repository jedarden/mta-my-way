/**
 * Express-style mock request/response objects and a middleware chain simulator.
 *
 * `middleware-helpers.ts` exercises middleware against real `Request` and
 * `Response` instances, which is what the Hono middleware in
 * `packages/server/src/middleware/` actually receive. Some contracts are easier
 * to test against the older handler shape, though: a request carrying route
 * `params` and a parsed `query` bag, a response whose `status`, `json` and
 * `send` calls are recorded, and a chain that runs until the response is
 * written rather than until someone returns one.
 *
 * That is what this module provides:
 *
 * - {@link createMockHttpRequest} builds the request half — headers, body,
 *   query and route params, plus the execution context a middleware may read.
 * - {@link createMockHttpResponse} builds the response half — every write goes
 *   through a vitest spy, so a test can assert on the calls as well as on the
 *   final state.
 * - {@link runMiddlewareChain} executes `(request, response, next)` middleware
 *   in registration order and reports what ran, in what order, and whether the
 *   chain reached its terminal handler.
 * - The `assertChain*` and `assertResponse*` helpers assert on that result.
 *
 * The names are deliberately not `createMockRequest`/`createMockResponse` —
 * those exist in `test-helpers.ts` with different shapes, and the testing
 * barrel `export *`s every module, so a collision would break the barrel.
 */

import { expect, vi } from "vitest";

import type { MockExecutionContext } from "./execution-context";

// ============================================================================
// Types
// ============================================================================

/** A vitest mock function, for asserting on the calls a middleware made. */
type MockFn = ReturnType<typeof vi.fn>;

/**
 * Wrap a function in a vitest spy without giving up its parameter types, so a
 * mock is both callable as itself and assertable with `toHaveBeenCalled*`.
 */
function asSpy<A extends unknown[], R>(implementation: (...args: A) => R) {
  return vi.fn(implementation) as unknown as ((...args: A) => R) & MockFn;
}

/** One write to a mock response, as recorded in {@link MockHttpResponse.calls}. */
export interface MockResponseCall {
  /** Response method that was called */
  method: "status" | "json" | "send" | "set" | "setHeader" | "end";
  /** Arguments the call was made with */
  args: unknown[];
}

/**
 * A mock request with the parts a handler-shaped middleware reads: headers,
 * body, query, route params, cookies, client IP and execution context.
 */
export interface MockHttpRequest {
  /** HTTP method, upper-cased (defaults to `"GET"`) */
  method: string;
  /** Request URL (defaults to `"http://localhost:3001/api/test"`) */
  url: string;
  /** URL path without the query string */
  path: string;
  /** Request headers */
  headers: Headers;
  /** Query parameters — explicit `query` wins over anything parsed from `url` */
  query: Record<string, string>;
  /** Route parameters, as a router would have matched them */
  params: Record<string, string>;
  /**
   * Request body as supplied: an object when the caller passed one, a raw
   * string when it did not. {@link MockHttpRequest.json} parses either.
   */
  body: unknown;
  /** Request cookies */
  cookies: Record<string, string>;
  /** Client IP address (defaults to `"127.0.0.1"`) */
  ip: string;
  /** Execution context a middleware may read (see `execution-context.ts`) */
  context?: MockExecutionContext;
  /** Case-insensitive single-header lookup (Express `req.header`) */
  header(name: string): string | undefined;
  /** Alias of {@link MockHttpRequest.header} (Express `req.get`) */
  get(name: string): string | undefined;
  /** The body parsed as JSON */
  json<T = unknown>(): Promise<T>;
  /** The body as text */
  text(): Promise<string>;
}

/** Options for {@link createMockHttpRequest}; every field is optional. */
export interface MockHttpRequestOptions {
  /** HTTP method (defaults to `"GET"`) */
  method?: string;
  /** Request URL — a query string on it is parsed into {@link MockHttpRequest.query} */
  url?: string;
  /** Headers to send (defaults to an `application/json` content type + a test user agent) */
  headers?: Record<string, string>;
  /** Query parameters to overlay on the URL's own */
  query?: Record<string, string>;
  /** Route parameters, as a router would have matched them */
  params?: Record<string, string>;
  /** Body — non-string values are treated as already-parsed JSON */
  body?: unknown;
  /** Request cookies */
  cookies?: Record<string, string>;
  /** Client IP address */
  ip?: string;
  /** Execution context a middleware may read */
  context?: MockExecutionContext;
}

/**
 * A mock response whose writes are all vitest spies.
 *
 * Every method records into {@link MockHttpResponse.calls} and updates the
 * inspected state (`statusCode`, `body`, `headers`, `ended`), so a test can
 * either assert on the final state or on the exact calls that produced it.
 */
export interface MockHttpResponse {
  /** Status the response is sent with — `200` until `status()` says otherwise */
  statusCode: number;
  /** Headers set so far, keyed by the exact name passed to `set` */
  headers: Record<string, string>;
  /** Last body written, by `json` or `send` */
  body: unknown;
  /** Last payload written by `json` */
  jsonBody: unknown;
  /** Last body written by `send` */
  sentBody: unknown;
  /** Whether the response has been written and closed */
  ended: boolean;
  /** Every call made on this response, in order */
  calls: MockResponseCall[];
  /** Set the status; chainable (Express `res.status`) */
  status(code: number): MockHttpResponse;
  /** Write a JSON payload; chainable, closes the response (Express `res.json`) */
  json(payload?: unknown): MockHttpResponse;
  /** Write a body; chainable, closes the response (Express `res.send`) */
  send(body?: unknown): MockHttpResponse;
  /** Set a header; chainable (Express `res.set`) */
  set(name: string, value: string): MockHttpResponse;
  /** Alias of {@link MockHttpResponse.set} */
  setHeader(name: string, value: string): MockHttpResponse;
  /** Close the response without a body (Express `res.end`) */
  end(): MockHttpResponse;
  /** Case-insensitive single-header lookup over {@link MockHttpResponse.headers} */
  getHeader(name: string): string | undefined;
}

/** Continues the chain. Call with an error to skip ahead to the error handler. */
export type NextFunction = (error?: unknown) => Promise<void>;

/**
 * Handler-shaped middleware: inspect the request, write the response to
 * short-circuit, or call `next()` to continue the chain.
 */
export type MockMiddleware = (
  request: MockHttpRequest,
  response: MockHttpResponse,
  next: NextFunction
) => void | Promise<void>;

/** A chain entry with an explicit name, for readable {@link MiddlewareChainResult.order}. */
export interface NamedMockMiddleware {
  /** Name recorded in the result when this middleware runs */
  name: string;
  /** The middleware itself */
  middleware: MockMiddleware;
}

/** Anything {@link runMiddlewareChain} accepts as one layer of the chain. */
export type MockChainEntry = MockMiddleware | NamedMockMiddleware;

/** Writes the response when the whole chain called `next()`. */
export type MockTerminalHandler = (
  request: MockHttpRequest,
  response: MockHttpResponse
) => void | Promise<void>;

/** Receives an error passed to `next()`, in place of the remaining middleware. */
export type MockErrorHandler = (
  error: unknown,
  request: MockHttpRequest,
  response: MockHttpResponse,
  next: NextFunction
) => void | Promise<void>;

/** One middleware's record of its own run, from {@link MiddlewareChainResult.invocations}. */
export interface MiddlewareInvocation {
  /** Name the layer was recorded under */
  name: string;
  /** Position in the chain, `0`-based */
  index: number;
  /** Whether the layer called `next()` */
  calledNext: boolean;
}

/** What {@link runMiddlewareChain} reports about a run. */
export interface MiddlewareChainResult {
  /** The request the chain ran against */
  request: MockHttpRequest;
  /** The response the chain wrote to */
  response: MockHttpResponse;
  /** Names of the layers that ran, in order — the terminal handler is `"handler"` */
  order: string[];
  /** Per-layer records of whether each one called `next()` */
  invocations: MiddlewareInvocation[];
  /** Whether the chain reached its terminal handler */
  reachedHandler: boolean;
  /** Whether the chain stopped before its terminal handler */
  shortCircuited: boolean;
  /** Error that reached the end of the chain with no error handler to catch it */
  error?: unknown;
}

/** Options for {@link runMiddlewareChain}; every field except `middleware` is optional. */
export interface MiddlewareChainOptions {
  /** The chain to run, in registration order */
  middleware: MockChainEntry[];
  /** Request to run against (defaults to {@link createMockHttpRequest} with no options) */
  request?: MockHttpRequest;
  /** Terminal handler (defaults to writing an empty `200` JSON response) */
  handler?: MockTerminalHandler;
  /** Receives errors passed to `next()`; without one the error ends the run */
  errorHandler?: MockErrorHandler;
}

// ============================================================================
// Mock Request
// ============================================================================

const DEFAULT_REQUEST_METHOD = "GET";
const DEFAULT_REQUEST_URL = "http://localhost:3001/api/test";
const DEFAULT_CLIENT_IP = "127.0.0.1";

/** Methods the fetch spec forbids from carrying a request body. */
const BODYLESS_METHODS = new Set(["GET", "HEAD"]);

const DEFAULT_HEADERS: Record<string, string> = {
  "content-type": "application/json",
  "user-agent": "test-agent",
};

/** Split a URL into its path and its query parameters, tolerating relative ones. */
function parseUrlParts(url: string): { path: string; query: Record<string, string> } {
  const parsed = new URL(url, "http://localhost");
  const query: Record<string, string> = {};

  for (const [key, value] of parsed.searchParams) {
    query[key] = value;
  }
  return { path: parsed.pathname, query };
}

/**
 * Build a mock request with headers, body, query and route params.
 *
 * Query parameters come from two places: a query string on `url`, and the
 * explicit `query` bag, which wins on conflict — so a test can point the
 * request at a realistic URL and still pin one parameter. `params` is
 * explicit-only, since route matching is the router's job and the mock
 * simulates its output.
 *
 * @param options - Request parts to set (all optional)
 * @returns A mock request
 *
 * @example Route params and query together
 * ```typescript
 * const request = createMockHttpRequest({
 *   method: "GET",
 *   url: "http://localhost:3001/api/arrivals/725?limit=5",
 *   params: { stationId: "725" },
 *   query: { limit: "5" },
 * });
 * expect(request.params.stationId).toBe("725");
 * expect(request.query.limit).toBe("5");
 * ```
 */
export function createMockHttpRequest(options: MockHttpRequestOptions = {}): MockHttpRequest {
  const method = (options.method ?? DEFAULT_REQUEST_METHOD).toUpperCase();
  const url = options.url ?? DEFAULT_REQUEST_URL;

  if (options.body !== undefined && BODYLESS_METHODS.has(method)) {
    throw new Error(`${method} requests cannot carry a body — use POST, PUT or PATCH`);
  }

  const headers = new Headers({ ...DEFAULT_HEADERS, ...options.headers });
  const { path, query: urlQuery } = parseUrlParts(url);
  const query = { ...urlQuery, ...options.query };
  const body = options.body;

  const request: MockHttpRequest = {
    method,
    url,
    path,
    headers,
    query,
    params: options.params ?? {},
    body,
    cookies: options.cookies ?? {},
    ip: options.ip ?? DEFAULT_CLIENT_IP,
    context: options.context,

    header(name: string) {
      return headers.get(name) ?? undefined;
    },
    get(name: string) {
      return headers.get(name) ?? undefined;
    },
    async json<T>(): Promise<T> {
      if (typeof body === "string") {
        return JSON.parse(body) as T;
      }
      return body as T;
    },
    async text(): Promise<string> {
      return typeof body === "string" ? body : JSON.stringify(body);
    },
  };

  return request;
}

/**
 * Stamp an execution context onto a mock request, in place.
 *
 * The same object is returned, so this reads as a statement rather than an
 * expression: build the request, then attach the context. Existing context is
 * replaced, not merged.
 *
 * @param request - Request to stamp
 * @param context - Execution context the request should carry
 * @returns The same request, now carrying `context`
 */
export function attachContext(
  request: MockHttpRequest,
  context: MockExecutionContext
): MockHttpRequest {
  request.context = context;
  return request;
}

// ============================================================================
// Mock Response
// ============================================================================

/**
 * Build a mock response with `status`, `json` and `send` spies.
 *
 * `status`, `json`, `send`, `set`, `setHeader` and `end` are all vitest spies
 * recording into {@link MockHttpResponse.calls}, and each one updates the
 * inspected state. `json` and `send` close the response, so a chain stops
 * after them whether or not the middleware called `next()`.
 *
 * @returns A mock response starting at status `200`, unwritten
 *
 * @example Asserting on the calls and on the final state
 * ```typescript
 * const response = createMockHttpResponse();
 * await runMiddlewareChain({ middleware: [listFavorites], request, response });
 *
 * expect(response.status).toHaveBeenCalledWith(200);
 * expect(response.jsonBody).toEqual({ favorites: [] });
 * ```
 */
export function createMockHttpResponse(): MockHttpResponse {
  const calls: MockResponseCall[] = [];
  const state = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    jsonBody: undefined as unknown,
    sentBody: undefined as unknown,
    ended: false,
  };

  const record = (method: MockResponseCall["method"], args: unknown[]): void => {
    calls.push({ method, args });
  };

  const status = asSpy((code: number) => {
    record("status", [code]);
    state.statusCode = code;
    return response;
  });

  const json = asSpy((payload?: unknown) => {
    record("json", [payload]);
    state.jsonBody = payload;
    state.body = payload;
    state.ended = true;
    return response;
  });

  const send = asSpy((body?: unknown) => {
    record("send", [body]);
    state.sentBody = body;
    state.body = body;
    state.ended = true;
    return response;
  });

  const set = asSpy((name: string, value: string) => {
    record("set", [name, value]);
    state.headers[name] = value;
    return response;
  });

  const setHeader = asSpy((name: string, value: string) => {
    record("setHeader", [name, value]);
    state.headers[name] = value;
    return response;
  });

  const end = asSpy(() => {
    record("end", []);
    state.ended = true;
    return response;
  });

  const response: MockHttpResponse = {
    get statusCode() {
      return state.statusCode;
    },
    get headers() {
      return state.headers;
    },
    get body() {
      return state.body;
    },
    get jsonBody() {
      return state.jsonBody;
    },
    get sentBody() {
      return state.sentBody;
    },
    get ended() {
      return state.ended;
    },
    get calls() {
      return calls;
    },
    status,
    json,
    send,
    set,
    setHeader,
    end,

    getHeader(name: string) {
      const direct = state.headers[name];
      if (direct !== undefined) {
        return direct;
      }
      const lower = name.toLowerCase();
      const match = Object.keys(state.headers).find((key) => key.toLowerCase() === lower);
      return match === undefined ? undefined : state.headers[match];
    },
  };

  return response;
}

// ============================================================================
// Chain Execution
// ============================================================================

/** Name the terminal handler is recorded under in {@link MiddlewareChainResult.order}. */
export const TERMINAL_HANDLER_NAME = "handler";

/** Name the error handler is recorded under in {@link MiddlewareChainResult.order}. */
export const ERROR_HANDLER_NAME = "errorHandler";

const defaultTerminalHandler: MockTerminalHandler = (_request, response) => {
  response.json({});
};

/** Accept either a bare middleware or a named entry, without mutating the caller's array. */
function toChainEntries(
  middleware: MockChainEntry[]
): Array<{ name: string; middleware: MockMiddleware }> {
  return middleware.map((entry, index) => {
    if (typeof entry === "function") {
      return { name: entry.name || `middleware[${index}]`, middleware: entry };
    }
    return { name: entry.name, middleware: entry.middleware };
  });
}

/**
 * Run a `(request, response, next)` chain over a mock request/response pair.
 *
 * Layers run in registration order. A layer that writes the response stops the
 * chain even if it does call `next()`, matching how a written response behaves.
 * `next(error)` skips the remaining layers to `errorHandler` — which receives a
 * no-op `next`, since there is nothing left to resume — and with no error
 * handler the error is reported on the result instead of thrown.
 *
 * Calling `next()` twice from one layer throws: a chain that does that is
 * calling downstream layers twice, which should fail the test loudly rather
 * than produce a response built twice.
 *
 * @param options - The chain, its request, terminal handler and error handler
 * @returns What ran, in what order, and where the chain stopped
 *
 * @example A chain that authorizes before the handler
 * ```typescript
 * const result = await runMiddlewareChain({
 *   middleware: [
 *     { name: "authenticate", middleware: authenticate },
 *     { name: "requireAdmin", middleware: requireAdmin },
 *   ],
 *   request: createMockHttpRequest({ headers: { authorization: "Bearer token" } }),
 *   handler: (_request, response) => response.json({ ok: true }),
 * });
 *
 * assertChainOrder(result, ["authenticate", "requireAdmin", "handler"]);
 * assertResponseJson(result.response, { ok: true });
 * ```
 */
export async function runMiddlewareChain(
  options: MiddlewareChainOptions
): Promise<MiddlewareChainResult> {
  const request = options.request ?? createMockHttpRequest();
  const response = createMockHttpResponse();
  const entries = toChainEntries(options.middleware);
  const invocations: MiddlewareInvocation[] = [];
  const order: string[] = [];

  let reachedHandler = false;
  let reportedError: unknown;

  const runLayer = async (index: number, error?: unknown): Promise<void> => {
    if (error !== undefined) {
      if (options.errorHandler === undefined) {
        reportedError = error;
        return;
      }
      order.push(ERROR_HANDLER_NAME);
      await options.errorHandler(error, request, response, () => Promise.resolve());
      return;
    }

    if (response.ended) {
      return;
    }

    const entry = entries[index];
    if (entry === undefined) {
      order.push(TERMINAL_HANDLER_NAME);
      await (options.handler ?? defaultTerminalHandler)(request, response);
      reachedHandler = true;
      return;
    }

    const invocation: MiddlewareInvocation = { name: entry.name, index, calledNext: false };
    invocations.push(invocation);
    order.push(entry.name);

    let nextCallCount = 0;
    const next: NextFunction = (nextError) => {
      nextCallCount += 1;
      if (nextCallCount > 1) {
        throw new Error(`${entry.name} called next() more than once`);
      }
      invocation.calledNext = true;
      return runLayer(index + 1, nextError);
    };

    await entry.middleware(request, response, next);
  };

  await runLayer(0);

  return {
    request,
    response,
    order,
    invocations,
    reachedHandler,
    shortCircuited: !reachedHandler,
    ...(reportedError !== undefined ? { error: reportedError } : {}),
  };
}

// ============================================================================
// Assertions
// ============================================================================

/**
 * Assert the order a chain ran in.
 *
 * @param result - Result from {@link runMiddlewareChain}
 * @param expected - Expected layer names in order, `"handler"` for the terminal handler
 * @throws Naming the first position where the order differs
 *
 * @example
 * ```typescript
 * assertChainOrder(result, ["authenticate", "requireAdmin", "handler"]);
 * ```
 */
export function assertChainOrder(result: MiddlewareChainResult, expected: readonly string[]): void {
  const actual = result.order;

  for (let index = 0; index < Math.min(actual.length, expected.length); index += 1) {
    if (actual[index] !== expected[index]) {
      throw new Error(
        `Expected middleware at position ${index} to be ${JSON.stringify(
          expected[index]
        )}, got ${JSON.stringify(actual[index])} (ran: ${actual.join(" → ")})`
      );
    }
  }

  if (actual.length !== expected.length) {
    throw new Error(
      `Expected ${expected.length} layers to run (${expected.join(" → ")}), ${
        actual.length
      } did (${actual.join(" → ")})`
    );
  }
}

/**
 * Assert that a chain reached its terminal handler.
 *
 * @param result - Result from {@link runMiddlewareChain}
 * @throws Naming what stopped the chain instead
 */
export function assertChainReachedHandler(result: MiddlewareChainResult): void {
  if (!result.reachedHandler) {
    throw new Error(
      `Expected the chain to reach its terminal handler, but it stopped after: ${
        result.order.join(" → ") || "(nothing ran)"
      }${result.error === undefined ? "" : ` — with error ${String(result.error)}`}`
    );
  }
}

/**
 * Assert that a chain stopped before its terminal handler, optionally with a status.
 *
 * @param result - Result from {@link runMiddlewareChain}
 * @param expectedStatus - Status the short-circuit should have written (omit to allow any)
 * @throws When the handler ran, or the status does not match
 */
export function assertChainShortCircuited(
  result: MiddlewareChainResult,
  expectedStatus?: number
): void {
  if (result.reachedHandler) {
    throw new Error(
      `Expected the chain to short-circuit, but it reached its terminal handler (ran: ${result.order.join(
        " → "
      )})`
    );
  }
  if (expectedStatus === undefined) {
    return;
  }

  const { response } = result;
  if (!response.ended) {
    throw new Error(
      `Expected the short-circuit to write a ${expectedStatus} response, but nothing was written`
    );
  }
  if (response.statusCode !== expectedStatus) {
    throw new Error(
      `Expected the short-circuit to respond ${expectedStatus}, got ${response.statusCode}`
    );
  }
}

/**
 * Assert that a response carries a status.
 *
 * @param response - Response to inspect
 * @param expected - Expected status code
 * @throws Naming the actual status
 */
export function assertResponseStatus(response: MockHttpResponse, expected: number): void {
  if (response.statusCode !== expected) {
    throw new Error(
      `Expected the response to be ${expected}, got ${response.statusCode}${
        response.ended ? "" : " (response not yet written)"
      }`
    );
  }
}

/**
 * Assert that a response wrote a JSON payload.
 *
 * Uses vitest's `toEqual`, so the failure output is a diff rather than a
 * message — deep equality is not worth a worse error report.
 *
 * @param response - Response to inspect
 * @param expected - Payload the middleware should have written
 * @throws Via `expect().toEqual()` when the payload differs
 */
export function assertResponseJson(response: MockHttpResponse, expected: unknown): void {
  expect(response.jsonBody).toEqual(expected);
}
