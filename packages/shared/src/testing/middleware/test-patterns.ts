/**
 * Common middleware test patterns for MTA My Way.
 *
 * Where `middleware-helpers.ts` supplies the *mechanics* of a middleware test
 * (build a request, run a chain, look at one header) this module supplies the
 * *outcomes* the server's middleware actually produce, so a test states the
 * contract instead of reassembling it from parts:
 *
 * - `ERROR_SCENARIOS` / `createErrorScenario` — the standard error envelope the
 *   server's middleware emit (`{ error: string, … }` plus a status), as named,
 *   reusable fixtures
 * - `createJsonResponse` / `createErrorResponse` — response-side counterparts of
 *   `createMiddlewareRequest`, for stubbing what a downstream layer returns
 * - `assertJsonResponse` / `assertErrorResponse` / `assertRateLimited` —
 *   composite assertions over the whole response rather than one field
 * - `assertMiddlewarePassthrough` / `assertMiddlewareStatus` /
 *   `assertMiddlewareError` — the three outcomes a middleware test cares about:
 *   the request went through, it short-circuited with a status, or it
 *   short-circuited with the standard error envelope
 *
 * Assertions clone before reading the body, so a response stays readable for a
 * later assertion — the same rule `executeMiddleware` applies to requests.
 */

import { expect } from "vitest";

import {
  type MiddlewareLike,
  type TerminalHandler,
  assertHeader,
  executeMiddleware,
} from "./middleware-helpers";

// ============================================================================
// Error Scenarios
// ============================================================================

/**
 * A standard error response the server's middleware emit.
 *
 * The envelope follows the codebase convention — a JSON body carrying a
 * non-empty `error` message, plus whatever extras the middleware adds
 * (`retryAfter`, `code`, …) — so a scenario names one contract a test can
 * produce with {@link createErrorResponse} and assert with
 * {@link assertErrorResponse}.
 *
 * Like a {@link MiddlewareTestConfig} in `middleware-helpers.ts`, a scenario is
 * a frozen option set with no lifecycle of its own: safe to define at module
 * scope and share across suites.
 */
export interface MiddlewareErrorScenario {
  /** Label for the scenario, used in failure messages and as the default preset key */
  readonly name: string;
  /** HTTP status the middleware should short-circuit with */
  readonly status: number;
  /** JSON body, always carrying a non-empty `error` message */
  readonly body: Readonly<Record<string, unknown>>;
  /** Headers the error response must carry (e.g. `Retry-After` on a 429) */
  readonly headers: Readonly<Record<string, string>>;
}

/**
 * Status codes middleware tests reach for, in ascending order.
 *
 * Drives the autocomplete on {@link createErrorScenario} and the validation
 * behind {@link ERROR_SCENARIOS}; any other 4xx/5xx status is still accepted.
 */
export const ERROR_SCENARIO_STATUSES = [
  400, 401, 403, 404, 405, 409, 413, 415, 422, 429, 500, 502, 503, 504,
] as const;

/** A status {@link createErrorScenario} knows a default message for. */
export type ErrorScenarioStatus = (typeof ERROR_SCENARIO_STATUSES)[number];

/**
 * Default `error` message per status, used when a caller supplies none.
 *
 * Reason phrases except 429, which uses the server's own rate-limiter wording
 * ("Too many requests") so the default scenario is the one `rate-limiter.ts`
 * actually emits.
 */
const DEFAULT_ERROR_MESSAGES: Readonly<Record<number, string>> = Object.freeze({
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  409: "Conflict",
  413: "Payload Too Large",
  415: "Unsupported Media Type",
  422: "Unprocessable Entity",
  429: "Too many requests",
  500: "Internal Server Error",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout",
});

/** Fields to replace on an error scenario; each omitted field falls back to the base. */
export interface ErrorScenarioOverrides {
  /** Label for the scenario (defaults to the kebab-cased reason phrase) */
  readonly name?: string;
  /** Replacement body — replaces whole, it does not merge (default `{ error: <message> }`) */
  readonly body?: Record<string, unknown>;
  /** Replacement headers — replaces whole, it does not merge (default none) */
  readonly headers?: Record<string, string>;
}

/**
 * Build a standard error scenario for a status.
 *
 * The body defaults to `{ error: <default message for the status> }` and can be
 * replaced whole with `overrides.body` — merging is a flat replace, the same
 * rule {@link createMiddlewareTestConfig} applies to presets, so an override
 * carrying extras re-states the `error` message too.
 *
 * @param status - Error status; any 4xx/5xx, with autocomplete for {@link ERROR_SCENARIO_STATUSES}
 * @param overrides - Fields to replace on the scenario
 * @returns A frozen scenario, ready for {@link createErrorResponse} or {@link assertErrorResponse}
 * @throws When the status is not a 4xx or 5xx
 *
 * @example The server's rate-limit contract
 * ```typescript
 * const limited = createErrorScenario(429, {
 *   body: { error: "Too many requests", retryAfter: 60 },
 *   headers: { "Retry-After": "60" },
 * });
 * assertErrorResponse(response, limited);
 * ```
 *
 * @example A one-off scenario with extras on the envelope
 * ```typescript
 * const scenario = createErrorScenario(403, { body: { error: "Admin role required" } });
 * ```
 */
export function createErrorScenario(
  status: ErrorScenarioStatus | (number & {}),
  overrides: ErrorScenarioOverrides = {}
): MiddlewareErrorScenario {
  if (!Number.isInteger(status) || status < 400 || status > 599) {
    throw new Error(`Error scenarios need a 4xx or 5xx status, got ${JSON.stringify(status)}`);
  }

  const message = DEFAULT_ERROR_MESSAGES[status] ?? "Error";
  const name = overrides.name ?? kebabCase(message);

  return Object.freeze({
    name,
    status,
    body: Object.freeze(overrides.body ?? { error: message }),
    headers: Object.freeze(overrides.headers ?? {}),
  });
}

/** Lowercase-and-dash a phrase, for a scenario's default name. */
function kebabCase(phrase: string): string {
  return phrase
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Named error scenarios shipped with these helpers, covering the statuses
 * middleware tests assert on most often.
 *
 * `tooManyRequests` is the full `rate-limiter.ts` contract — its `Retry-After`
 * header, its `retryAfter` body field and its message — rather than a bare
 * status, so a rate-limit test can assert the whole thing in one call.
 *
 * @example Producing and asserting the same scenario
 * ```typescript
 * const middleware: MiddlewareLike = () => createErrorResponse(ERROR_SCENARIOS.unauthorized);
 * const response = await executeMiddleware(middleware, createMiddlewareRequest());
 * await assertErrorResponse(response, ERROR_SCENARIOS.unauthorized);
 * ```
 */
export const ERROR_SCENARIOS = Object.freeze({
  badRequest: createErrorScenario(400),
  unauthorized: createErrorScenario(401),
  forbidden: createErrorScenario(403),
  notFound: createErrorScenario(404),
  methodNotAllowed: createErrorScenario(405),
  conflict: createErrorScenario(409),
  payloadTooLarge: createErrorScenario(413),
  unsupportedMediaType: createErrorScenario(415),
  unprocessableEntity: createErrorScenario(422),
  tooManyRequests: createErrorScenario(429, {
    body: { error: "Too many requests", retryAfter: 60 },
    headers: { "Retry-After": "60" },
  }),
  internalServerError: createErrorScenario(500),
  badGateway: createErrorScenario(502),
  serviceUnavailable: createErrorScenario(503),
  gatewayTimeout: createErrorScenario(504),
}) satisfies Record<string, MiddlewareErrorScenario>;

/** Names of the scenarios in {@link ERROR_SCENARIOS}. */
export type ErrorScenarioName = keyof typeof ERROR_SCENARIOS;

// ============================================================================
// Response Generators
// ============================================================================

/** Options for {@link createJsonResponse}. */
export interface JsonResponseOptions {
  /** Status to send (defaults to `200`) */
  readonly status?: number;
  /** Headers to send — a `content-type` here wins over the JSON default */
  readonly headers?: Record<string, string>;
}

/**
 * Build a real `Response` carrying a JSON body.
 *
 * The response-side counterpart of {@link createMiddlewareRequest}: use it to
 * stub what a terminal handler or downstream service returns, so a middleware
 * under test exercises real `Response` semantics rather than a plain object.
 *
 * @param body - Value to serialize as the JSON body
 * @param options - Status and headers
 * @returns A standard `Response` with an `application/json` content type
 *
 * @example Stubbing a terminal handler
 * ```typescript
 * const handler: TerminalHandler = () => createJsonResponse({ ok: true });
 * const response = await executeMiddleware(chain, createMiddlewareRequest(), handler);
 * ```
 */
export function createJsonResponse(body: unknown, options: JsonResponseOptions = {}): Response {
  return new Response(JSON.stringify(body), {
    status: options.status ?? 200,
    headers: { "content-type": "application/json", ...options.headers },
  });
}

/**
 * Build a real `Response` carrying the standard error envelope.
 *
 * Accepts a scenario (from {@link ERROR_SCENARIOS} or {@link createErrorScenario})
 * or a bare status, which is shorthand for the default scenario for that status.
 * Overrides replace fields whole, per {@link createErrorScenario}.
 *
 * @param scenario - Scenario to render, or a bare 4xx/5xx status
 * @param overrides - Fields to replace when `scenario` is a status; ignored with a scenario
 * @returns A standard `Response` with the scenario's status, body and headers
 * @throws When a bare status is not a 4xx or 5xx
 *
 * @example Scenario-shaped and status-shaped calls agree
 * ```typescript
 * createErrorResponse(401);
 * createErrorResponse(ERROR_SCENARIOS.unauthorized); // the same response
 * ```
 *
 * @example Adjusting a scenario for one test
 * ```typescript
 * const response = createErrorResponse(429, { headers: { "Retry-After": "30" } });
 * ```
 */
export function createErrorResponse(
  scenario: MiddlewareErrorScenario | ErrorScenarioStatus | (number & {}),
  overrides: ErrorScenarioOverrides = {}
): Response {
  const resolved =
    typeof scenario === "number"
      ? createErrorScenario(scenario, overrides)
      : applyScenarioOverrides(scenario, overrides);

  return createJsonResponse(resolved.body, {
    status: resolved.status,
    headers: { ...resolved.headers },
  });
}

/** Apply overrides to a scenario without mutating it, for {@link createErrorResponse}. */
function applyScenarioOverrides(
  scenario: MiddlewareErrorScenario,
  overrides: ErrorScenarioOverrides
): MiddlewareErrorScenario {
  if (Object.keys(overrides).length === 0) {
    return scenario;
  }
  return createErrorScenario(scenario.status, {
    name: overrides.name ?? scenario.name,
    body: overrides.body ? { ...overrides.body } : { ...scenario.body },
    headers: overrides.headers ? { ...overrides.headers } : { ...scenario.headers },
  });
}

// ============================================================================
// Response Assertions
// ============================================================================

/**
 * Assert that a response is a JSON response, and optionally that its body matches.
 *
 * Checks the status, the `application/json` content type and — when
 * `expectedBody` is given — the parsed body via `toEqual`, so a mismatch diffs
 * rather than printing two objects.
 *
 * The response is cloned before the body is read, so it stays readable for a
 * later assertion.
 *
 * @param response - Response to inspect
 * @param expectedStatus - Status the response should carry
 * @param expectedBody - Body to require (omit to only require status + content type)
 * @throws Naming the status, content type or body that did not match
 *
 * @example Status and body in one assertion
 * ```typescript
 * const response = await executeMiddleware(chain, createMiddlewareRequest());
 * await assertJsonResponse(response, 200, { ok: true });
 * ```
 */
export async function assertJsonResponse(
  response: Response,
  expectedStatus: number,
  expectedBody?: unknown
): Promise<void> {
  assertStatus(response, expectedStatus, "JSON response");

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new Error(
      `Expected a JSON response, got content type ${JSON.stringify(contentType || "(none)")}`
    );
  }

  if (expectedBody === undefined) {
    return;
  }

  expect(await parseJsonBody(response, expectedStatus)).toEqual(expectedBody);
}

/** Expectations for {@link assertErrorResponse}. */
export interface ErrorResponseExpectation {
  /** Status to require (defaults to `400`) */
  readonly status?: number;
  /** Exact `error` message to require (omit to only require a non-empty one) */
  readonly error?: string;
  /** Extra body fields to require, matched partially against the parsed body */
  readonly body?: Readonly<Record<string, unknown>>;
  /** Headers to require, each checked for presence and exact value */
  readonly headers?: Readonly<Record<string, string>>;
}

/**
 * Assert that a response carries the standard error envelope.
 *
 * Checks the status, that the body parses as JSON, that it carries a non-empty
 * string `error` message, and — per expectation — the exact message, extra body
 * fields and headers. Accepts a bare status, a full scenario or a partial
 * expectation, so a test can tighten one field of a shipped scenario without
 * restating the rest.
 *
 * The response is cloned before the body is read, so it stays readable for a
 * later assertion.
 *
 * @param response - Response to inspect
 * @param expected - Scenario, bare status or partial expectation (defaults to status `400`)
 * @throws Naming the status, envelope or field that did not match
 *
 * @example Asserting a shipped scenario in full
 * ```typescript
 * await assertErrorResponse(response, ERROR_SCENARIOS.tooManyRequests);
 * ```
 *
 * @example One field of a scenario
 * ```typescript
 * await assertErrorResponse(response, { status: 403, error: "Admin role required" });
 * ```
 */
export async function assertErrorResponse(
  response: Response,
  expected: MiddlewareErrorScenario | ErrorResponseExpectation | (number & {}) = 400
): Promise<void> {
  const expectation = toErrorResponseExpectation(expected);
  const status = expectation.status ?? 400;

  assertStatus(response, status, "error response");

  const body = await parseJsonBody(response, status);

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new Error(
      `Expected an error envelope object from the ${status} response, got ${JSON.stringify(body)}`
    );
  }

  const message = (body as Record<string, unknown>).error;
  if (typeof message !== "string" || message.length === 0) {
    throw new Error(
      `Expected a non-empty "error" message in the ${status} body, got ${JSON.stringify(message)}`
    );
  }
  if (expectation.error !== undefined && message !== expectation.error) {
    throw new Error(
      `Expected the ${status} error message to be ${JSON.stringify(expectation.error)}, got ${JSON.stringify(message)}`
    );
  }

  if (expectation.body !== undefined) {
    expect(body).toMatchObject(expectation.body);
  }

  for (const [name, value] of Object.entries(expectation.headers ?? {})) {
    assertHeader(response, name, value);
  }
}

/** Expectations for {@link assertRateLimited}. */
export interface RateLimitExpectation {
  /** Exact `Retry-After` value, in seconds */
  readonly retryAfter?: number;
  /**
   * Also require the `X-RateLimit-Limit`, `X-RateLimit-Remaining` (as `"0"`) and
   * `X-RateLimit-Reset` headers `rate-limiter.ts` sets. Defaults to `true`; set
   * `false` for a 429 from a middleware that does not send the trio.
   */
  readonly headers?: boolean;
  /** Exact `error` message to require */
  readonly error?: string;
}

/**
 * Assert that a response is the server's rate-limit response.
 *
 * Checks the 429 status, a numeric `Retry-After` header, the
 * `{ error, retryAfter }` envelope `rate-limiter.ts` writes and — by default —
 * the `X-RateLimit-*` trio. `assertErrorResponse` covers a bare 429; this one
 * asserts the rate-limit contract on top of it.
 *
 * The response is cloned before the body is read, so it stays readable for a
 * later assertion.
 *
 * @param response - Response to inspect
 * @param expected - Rate-limit fields to require (all optional)
 * @throws Naming the status, header or body field that did not match
 *
 * @example Full rate-limit contract
 * ```typescript
 * await assertRateLimited(response, { retryAfter: 60 });
 * ```
 *
 * @example A 429 without the X-RateLimit headers
 * ```typescript
 * await assertRateLimited(response, { headers: false });
 * ```
 */
export async function assertRateLimited(
  response: Response,
  expected: RateLimitExpectation = {}
): Promise<void> {
  assertStatus(response, 429, "rate-limited response");

  const retryAfter = response.headers.get("Retry-After");
  if (retryAfter === null) {
    throw new Error('Expected a rate-limited response to carry a "Retry-After" header');
  }
  if (!/^\d+$/.test(retryAfter)) {
    throw new Error(
      `Expected "Retry-After" to be a whole number of seconds, got ${JSON.stringify(retryAfter)}`
    );
  }
  if (expected.retryAfter !== undefined && Number(retryAfter) !== expected.retryAfter) {
    throw new Error(
      `Expected "Retry-After" to be ${expected.retryAfter}, got ${Number(retryAfter)}`
    );
  }

  if (expected.headers !== false) {
    assertHeader(response, "X-RateLimit-Limit");
    assertHeader(response, "X-RateLimit-Remaining", "0");
    assertHeader(response, "X-RateLimit-Reset");
  }

  await assertErrorResponse(response, {
    status: 429,
    error: expected.error,
    body: expected.retryAfter === undefined ? undefined : { retryAfter: expected.retryAfter },
  });
}

// ============================================================================
// Middleware Outcome Assertions
// ============================================================================

/** Handler used when the caller does not supply one: an empty `200` response. */
const emptyOkHandler: TerminalHandler = () => new Response(null, { status: 200 });

/**
 * Assert that a middleware chain let the request through to the terminal handler.
 *
 * Runs the chain and fails when the handler was never reached — i.e. some layer
 * short-circuited. This is the most common middleware assertion: the negative
 * of "it blocked the request".
 *
 * @param middleware - A middleware, or a chain of them
 * @param request - The request entering the chain
 * @param handler - Terminal handler to run (defaults to an empty `200` response)
 * @returns The handler's response, for further assertions
 *
 * @example The happy path of an auth middleware
 * ```typescript
 * const response = await assertMiddlewarePassthrough(
 *   requireAuth,
 *   createMiddlewareRequest({ headers: { authorization: "Bearer token123" } })
 * );
 * await assertJsonResponse(response, 200);
 * ```
 */
export async function assertMiddlewarePassthrough(
  middleware: MiddlewareLike | MiddlewareLike[],
  request: Request,
  handler: TerminalHandler = emptyOkHandler
): Promise<Response> {
  let reached = false;

  const response = await executeMiddleware(middleware, request, (probe) => {
    reached = true;
    return handler(probe);
  });

  if (!reached) {
    throw new Error(
      `Expected the middleware to pass the request through to the handler, but it short-circuited with ${response.status}`
    );
  }

  return response;
}

/**
 * Assert that a middleware chain short-circuits with a status, and return the response.
 *
 * @param middleware - A middleware, or a chain of them
 * @param request - The request entering the chain
 * @param expectedStatus - Status the chain should short-circuit with
 * @returns The short-circuit response, for further assertions
 * @throws Naming the status that came back, or reporting that no short-circuit was needed
 *
 * @example A cache middleware answering from its store
 * ```typescript
 * const response = await assertMiddlewareStatus(cacheMiddleware, request, 200);
 * assertHeader(response, "X-Cache", "HIT");
 * ```
 */
export async function assertMiddlewareStatus(
  middleware: MiddlewareLike | MiddlewareLike[],
  request: Request,
  expectedStatus: number
): Promise<Response> {
  const response = await executeMiddleware(middleware, request);

  assertStatus(response, expectedStatus, "short-circuited response");

  return response;
}

/**
 * Assert that a middleware chain short-circuits with the standard error envelope.
 *
 * Runs the chain and applies {@link assertErrorResponse} to the result — the
 * "blocked request" counterpart of {@link assertMiddlewarePassthrough}.
 *
 * @param middleware - A middleware, or a chain of them
 * @param request - The request entering the chain
 * @param expected - Scenario, bare status or partial expectation (defaults to status `400`)
 * @returns The short-circuit response, for further assertions
 *
 * @example A middleware rejecting a malformed header
 * ```typescript
 * await assertMiddlewareError(
 *   headerValidation,
 *   createMiddlewareRequest({ headers: { "user-agent": "" } }),
 *   { status: 400, error: "Invalid User-Agent header" }
 * );
 * ```
 *
 * @example Each scenario a middleware is meant to emit
 * ```typescript
 * it.each([ERROR_SCENARIOS.unauthorized, ERROR_SCENARIOS.forbidden])(
 *   "rejects a request with %s",
 *   async (scenario) => {
 *     await assertMiddlewareError(requireRole("admin"), requestFor(scenario), scenario);
 *   }
 * );
 * ```
 */
export async function assertMiddlewareError(
  middleware: MiddlewareLike | MiddlewareLike[],
  request: Request,
  expected: MiddlewareErrorScenario | ErrorResponseExpectation | (number & {}) = 400
): Promise<Response> {
  const response = await executeMiddleware(middleware, request);

  await assertErrorResponse(response, expected);

  return response;
}

// ============================================================================
// Internals
// ============================================================================

/**
 * Assert a response's status, phrasing the failure around what the caller was
 * testing for (`"error response"`, `"short-circuited response"`, …).
 */
function assertStatus(response: Response, expectedStatus: number, label: string): void {
  if (response.status !== expectedStatus) {
    throw new Error(`Expected ${label} with status ${expectedStatus}, got ${response.status}`);
  }
}

/** Read a response's JSON body, via a clone so the original stays readable. */
async function parseJsonBody(response: Response, status: number): Promise<unknown> {
  try {
    return await response.clone().json();
  } catch (error) {
    throw new Error(
      `Expected the ${status} response body to be JSON, but it could not be parsed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/** Normalize {@link assertErrorResponse}'s accepted shapes into one expectation. */
function toErrorResponseExpectation(
  expected: MiddlewareErrorScenario | ErrorResponseExpectation | (number & {})
): ErrorResponseExpectation {
  if (typeof expected === "number") {
    return { status: expected };
  }
  // `name` only exists on a scenario — an expectation carries no label.
  if ("name" in expected) {
    const scenario = expected as MiddlewareErrorScenario;
    return {
      status: scenario.status,
      error: messageOf(scenario),
      body: scenario.body,
      headers: scenario.headers,
    };
  }
  return expected as ErrorResponseExpectation;
}

/** A scenario's `error` message, when its body carries exactly one. */
function messageOf(scenario: MiddlewareErrorScenario): string | undefined {
  const message = scenario.body.error;
  return typeof message === "string" ? message : undefined;
}
