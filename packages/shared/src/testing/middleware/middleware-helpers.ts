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
 *
 * `MIDDLEWARE_TEST_PRESETS`/`createMiddlewareTestConfig` hold the *options*: a
 * named, reusable request + security-header contract a test can spread and
 * adjust one field of. They are plain option sets with no lifecycle of their
 * own, so a config can be defined at module scope and shared across suites.
 *
 * `setupMiddlewareTest`/`teardownMiddlewareTest` are the middleware-scoped
 * counterpart of `setupTestEnvironment`/`cleanupTestEnvironment`: the root pair
 * only installs global mocks, while this one also builds a request + middleware
 * chain fixture to go with them. `resetMiddlewareTestState` sits between the
 * two: it clears the globals a test can leak without touching any fixture.
 */

import { vi } from "vitest";

import { cleanupTestEnvironment, setupTestEnvironment } from "../test-helpers";

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

/**
 * Request parts {@link createMiddlewareRequest} applies when a caller omits
 * them. The `default` preset in {@link MIDDLEWARE_TEST_PRESETS} is built from
 * this, so a baseline config and a bare `createMiddlewareRequest()` call always
 * agree.
 */
const DEFAULT_REQUEST_OPTIONS: Pick<MiddlewareRequestOptions, "method" | "url"> = {
  method: "GET",
  url: "http://localhost:3001/api/test",
};

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
  const method = (options.method ?? DEFAULT_REQUEST_OPTIONS.method).toUpperCase();
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

  return new Request(options.url ?? DEFAULT_REQUEST_OPTIONS.url, {
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

// ============================================================================
// Test Configuration
// ============================================================================

/**
 * A named, reusable set of middleware test options.
 *
 * A config is a {@link MiddlewareRequestOptions} bag plus the security headers a
 * response produced under it must carry, so one object drives both halves of a
 * middleware test: pass it to {@link createMiddlewareRequest} as-is, and hand
 * `securityHeaders` to {@link assertSecurityHeaders}.
 *
 * Configs are options only — no fixture, no mocks, no teardown — so they are
 * safe to define at module scope and share across suites. Both the configs and
 * the arrays they reference are frozen, which keeps a test from poisoning a
 * preset for the rest of the file.
 */
export interface MiddlewareTestConfig extends Readonly<MiddlewareRequestOptions> {
  /** Label for the config: the preset it derives from, or one passed as an override */
  readonly name: string;
  /**
   * Security headers a response produced under this config must carry, for
   * {@link assertSecurityHeaders}. The `default` preset requires none; the
   * `securityHeaders` preset requires every name in {@link SECURITY_HEADER_NAMES}.
   */
  readonly securityHeaders: readonly string[];
}

/**
 * Named middleware test configurations shipped with these helpers.
 *
 * @example Adjusting a preset for one test
 * ```typescript
 * const config = createMiddlewareTestConfig(
 *   { method: "POST", body: { stationId: "725" } },
 *   MIDDLEWARE_TEST_PRESETS.securityHeaders
 * );
 * const response = await executeMiddleware(chain, createMiddlewareRequest(config));
 * assertSecurityHeaders(response, config.securityHeaders);
 * ```
 */
export const MIDDLEWARE_TEST_PRESETS = Object.freeze({
  /**
   * Baseline: the standard request {@link createMiddlewareRequest} builds, and
   * no security-header requirement — for tests that exercise chain behaviour
   * rather than the security-header contract.
   */
  default: Object.freeze({
    name: "default",
    ...DEFAULT_REQUEST_OPTIONS,
    securityHeaders: Object.freeze([]),
  }),

  /**
   * The security-header contract: the baseline request plus every name in
   * {@link SECURITY_HEADER_NAMES}.
   */
  securityHeaders: Object.freeze({
    name: "securityHeaders",
    ...DEFAULT_REQUEST_OPTIONS,
    securityHeaders: SECURITY_HEADER_NAMES,
  }),
}) satisfies Record<string, MiddlewareTestConfig>;

/** Names of the presets in {@link MIDDLEWARE_TEST_PRESETS}. */
export type MiddlewareTestPresetName = keyof typeof MIDDLEWARE_TEST_PRESETS;

/** Per-test replacements for a preset's values; each omitted field falls back to the base preset. */
export type MiddlewareTestConfigOverrides = Partial<MiddlewareTestConfig>;

/** Look up a preset by name, failing loudly for a name the type system never saw. */
function middlewareTestPresetByName(name: string): MiddlewareTestConfig {
  const preset = (MIDDLEWARE_TEST_PRESETS as Record<string, MiddlewareTestConfig | undefined>)[
    name
  ];

  if (preset === undefined) {
    throw new Error(
      `Unknown middleware test preset ${JSON.stringify(name)} — expected one of: ${Object.keys(
        MIDDLEWARE_TEST_PRESETS
      ).join(", ")}`
    );
  }

  return preset;
}

/**
 * Build a middleware test configuration from a preset plus overrides.
 *
 * Merging is a flat, shallow replace — the same rule {@link createMiddlewareRequest}
 * applies to its own options and {@link setupMiddlewareTest}'s `createRequest`
 * applies to its fixture's — so a preset value is either kept or replaced whole.
 * In particular an overriding `headers` object does not merge with the preset's.
 *
 * The base preset is never modified, and the returned config is frozen.
 *
 * @param overrides - Fields to set on top of the preset (`name` included)
 * @param preset - Preset to derive from, by name or as a config (defaults to `"default"`)
 * @returns A frozen config combining the preset with the overrides
 *
 * @example Baseline config with one field adjusted
 * ```typescript
 * const config = createMiddlewareTestConfig({ url: "http://localhost:3001/api/favorites" });
 * const response = await executeMiddleware(chain, createMiddlewareRequest(config));
 * ```
 *
 * @example Narrowing the security-headers preset
 * ```typescript
 * const config = createMiddlewareTestConfig({ securityHeaders: ["X-Frame-Options"] }, "securityHeaders");
 * assertSecurityHeaders(response, config.securityHeaders);
 * ```
 */
export function createMiddlewareTestConfig(
  overrides: MiddlewareTestConfigOverrides = {},
  preset: MiddlewareTestPresetName | MiddlewareTestConfig = "default"
): MiddlewareTestConfig {
  const base = typeof preset === "string" ? middlewareTestPresetByName(preset) : preset;

  return Object.freeze({ ...base, ...overrides });
}

// ============================================================================
// Test Setup / Teardown
// ============================================================================

/** Options for {@link setupMiddlewareTest}. */
export interface MiddlewareTestOptions {
  /** Request parts for the fixture's standard request (forwarded to {@link createMiddlewareRequest}) */
  request?: MiddlewareRequestOptions;
  /** Middleware chain the fixture runs, in registration order (defaults to `[]`) */
  middleware?: MiddlewareLike | MiddlewareLike[];
  /** Terminal handler the chain ends at (defaults to an empty `200` response) */
  handler?: TerminalHandler;
  /** Install vitest fake timers, reverted by {@link teardownMiddlewareTest} (defaults to `false`) */
  fakeTimers?: boolean;
  /**
   * Also install the testing-root `setupTestEnvironment` mocks (console noise,
   * `performance`). Reverted by {@link teardownMiddlewareTest}. Defaults to `true`.
   */
  mockEnvironment?: boolean;
}

/** Per-call replacements for a fixture's parts; each omitted part falls back to the fixture's own. */
export interface MiddlewareTestRunOverrides {
  /** Request to run instead of the fixture's standard request */
  request?: Request;
  /** Chain to run instead of the fixture's chain */
  middleware?: MiddlewareLike | MiddlewareLike[];
  /** Handler to run instead of the fixture's terminal handler */
  handler?: TerminalHandler;
}

/** Fixture returned by {@link setupMiddlewareTest} and reset by {@link teardownMiddlewareTest}. */
export interface MiddlewareTestFixture {
  /** The standard request entering the chain */
  request: Request;
  /** The fixture's chain, in registration order */
  middleware: MiddlewareLike[];
  /** The terminal handler the chain ends at */
  handler: TerminalHandler;
  /**
   * Build a variant of the fixture's request. Overrides replace top-level
   * request parts and are merged over the options the fixture was created
   * with, so `{ method: "POST" }` keeps the fixture's URL and headers.
   */
  createRequest(overrides?: MiddlewareRequestOptions): Request;
  /**
   * Run the fixture's chain to its terminal handler. Per-call overrides
   * replace a part for that run only and do not change the fixture.
   */
  run(overrides?: MiddlewareTestRunOverrides): Promise<Response>;
}

/** Per-fixture bookkeeping teardown needs; kept out of the public fixture shape. */
interface MiddlewareFixtureState {
  /** Whether setup installed fake timers, and so owns reverting them */
  fakeTimers: boolean;
  /** Set on teardown so a stale fixture fails loudly instead of running */
  tornDown: boolean;
}

const fixtureStates = new WeakMap<MiddlewareTestFixture, MiddlewareFixtureState>();

const TORN_DOWN_MESSAGE =
  "This middleware fixture has been torn down — call setupMiddlewareTest() again";

/** Accept either a single middleware or a chain, without mutating the caller's array. */
function toMiddlewareChain(middleware?: MiddlewareLike | MiddlewareLike[]): MiddlewareLike[] {
  if (middleware === undefined) {
    return [];
  }
  return Array.isArray(middleware) ? [...middleware] : [middleware];
}

/**
 * Build a middleware test fixture and install its mocks.
 *
 * Pairs with {@link teardownMiddlewareTest}: call this in `beforeEach` and the
 * teardown in `afterEach`. Beyond the request + chain fixture, setup installs
 * the testing-root `setupTestEnvironment` mocks unless `mockEnvironment` is
 * `false`, and optionally vitest fake timers.
 *
 * @param options - Fixture parts and which mocks to install
 * @returns A fixture whose request, chain and handler can be run or overridden per test
 *
 * @example Fixture reused across a suite
 * ```typescript
 * let fixture: MiddlewareTestFixture;
 *
 * beforeEach(() => {
 *   fixture = setupMiddlewareTest({
 *     request: { url: "http://localhost:3001/api/favorites" },
 *     middleware: [requireAuth],
 *   });
 * });
 *
 * afterEach(() => {
 *   teardownMiddlewareTest(fixture);
 * });
 *
 * it("lets an authenticated request through", async () => {
 *   const response = await fixture.run({
 *     request: fixture.createRequest({ headers: { authorization: "Bearer token123" } }),
 *   });
 *   expect(response.status).toBe(200);
 * });
 * ```
 */
export function setupMiddlewareTest(options: MiddlewareTestOptions = {}): MiddlewareTestFixture {
  const baseRequest = options.request ?? {};

  const fixture: MiddlewareTestFixture = {
    request: createMiddlewareRequest(baseRequest),
    middleware: toMiddlewareChain(options.middleware),
    handler: options.handler ?? defaultTerminalHandler,

    createRequest(overrides: MiddlewareRequestOptions = {}) {
      return createMiddlewareRequest({ ...baseRequest, ...overrides });
    },

    async run(overrides: MiddlewareTestRunOverrides = {}) {
      if (fixtureStates.get(fixture)?.tornDown) {
        throw new Error(TORN_DOWN_MESSAGE);
      }
      return executeMiddleware(
        overrides.middleware === undefined
          ? fixture.middleware
          : toMiddlewareChain(overrides.middleware),
        overrides.request ?? fixture.request,
        overrides.handler ?? fixture.handler
      );
    },
  };

  fixtureStates.set(fixture, { fakeTimers: options.fakeTimers === true, tornDown: false });

  try {
    if (options.mockEnvironment !== false) {
      setupTestEnvironment();
    }
    if (options.fakeTimers) {
      vi.useFakeTimers();
    }
  } catch (error) {
    teardownMiddlewareTest(fixture);
    throw error;
  }

  return fixture;
}

/**
 * Reset the state {@link setupMiddlewareTest} created.
 *
 * Restores real timers when setup installed them, then applies the same reset
 * as the testing-root `cleanupTestEnvironment` — restoring every spy and
 * unstubbing every global, including ones the test body added on top of the
 * fixture. Safe to call with `null`/`undefined` or twice, so an `afterEach`
 * needs no guard around a `beforeEach` that failed partway.
 *
 * Timers a test body started on its own are only caught by
 * {@link resetMiddlewareTestState}, which looks at vitest's actual state
 * rather than at what this fixture remembers installing.
 *
 * @param fixture - Fixture returned by {@link setupMiddlewareTest}, if setup completed
 */
export function teardownMiddlewareTest(fixture?: MiddlewareTestFixture | null): void {
  const state = fixture ? fixtureStates.get(fixture) : undefined;

  if (state) {
    state.tornDown = true;
  }
  if (state?.fakeTimers) {
    vi.useRealTimers();
  }

  cleanupTestEnvironment();
}

/**
 * Former name of {@link teardownMiddlewareTest}.
 *
 * Kept as an alias so suites written against it keep working; new code should
 * pair `setupMiddlewareTest` with `teardownMiddlewareTest`.
 *
 * @deprecated Use {@link teardownMiddlewareTest}
 */
export const cleanupMiddlewareTest = teardownMiddlewareTest;

/**
 * What {@link resetMiddlewareTestState} found and reset. Each flag names a leak
 * the previous test left behind, so a suite can assert its own hygiene or log
 * which test is polluting the next one.
 */
export interface MiddlewareTestStateReset {
  /**
   * Whether fake timers were active and were restored to real ones. Teardown
   * only reverts the timers its own fixture installed, so `true` here means a
   * test body started fake timers directly and left them running.
   */
  restoredFakeTimers: boolean;
}

/**
 * Reset the global test state between tests, without needing a fixture.
 *
 * Restores real timers whenever vitest reports them active — covering timers a
 * test body started directly, which {@link teardownMiddlewareTest} cannot see —
 * then applies the same reset as the testing-root `cleanupTestEnvironment`:
 * restoring every spy and unstubbing every global.
 *
 * Fixtures are deliberately left alone: a suite-level fixture stays usable
 * across the reset, and tearing one down is {@link teardownMiddlewareTest}'s
 * job. Safe to call repeatedly and from an `afterEach` that runs after a
 * teardown already did part of this.
 *
 * @returns What was leaking, so a suite can tell a clean reset from a rescue
 */
export function resetMiddlewareTestState(): MiddlewareTestStateReset {
  const restoredFakeTimers = vi.isFakeTimers();

  if (restoredFakeTimers) {
    vi.useRealTimers();
  }

  cleanupTestEnvironment();

  return { restoredFakeTimers };
}
