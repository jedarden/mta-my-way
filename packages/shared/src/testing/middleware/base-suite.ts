/**
 * Base middleware test suite: one object that wires every helper a middleware
 * test needs — role fixtures, seeded data, the request fixture, and an audit
 * recorder — and hands them to each test through a single context.
 *
 * The individual pieces (`setupMiddlewareTest`, the execution-context
 * builders, the seed helpers, the audit assertions) compose fine by hand, but
 * every middleware suite ends up re-wiring the same five things in the same
 * `beforeEach`/`afterEach` pair. {@link createMiddlewareSuite} is that wiring,
 * once: call `setup()` in `beforeEach`, read `current` inside a test, call
 * `teardown()` in `afterEach`.
 *
 * A fresh context is built per test — new fixtures, new seeds, an empty audit
 * recorder — so tests cannot leak state through the suite, which is the
 * property the shared `beforeEach`-per-test shape exists to guarantee.
 */

import {
  type AuditLogRecorder,
  type AuditTrailAssertion,
  createAuditLogRecorder,
  expectAuditTrail,
} from "../audit-assertions";
import { type SeedTestDataBundle, seedTestData } from "../seed-helpers";
import { type UserFixtureSet, createUserFixtures, userFixtureFor } from "../user-fixtures";
import { type MockUser, type MockUserRole } from "./execution-context";
import {
  type MiddlewareTestFixture,
  type MiddlewareTestOptions,
  setupMiddlewareTest,
  teardownMiddlewareTest,
} from "./middleware-helpers";

// ============================================================================
// Types
// ============================================================================

/** Everything one middleware test gets from the suite. */
export interface MiddlewareSuiteContext {
  /** The suite's name, for labels and assertion messages */
  name: string;
  /** All three role fixtures, fresh for this test */
  users: UserFixtureSet;
  /** The role-selected primary fixture (`users.admin`, `.regular` or `.guest`) */
  user: MockUser;
  /** A seeded, internally consistent slice of domain data for this test */
  data: SeedTestDataBundle;
  /** The request/chain/handler fixture, ready to `run()` */
  fixture: MiddlewareTestFixture;
  /** The audit sink the middleware under test records into */
  audit: AuditLogRecorder;
  /** Start a trail assertion over what {@link MiddlewareSuiteContext.audit} recorded */
  expectAuditTrail(): AuditTrailAssertion;
}

/** Options for {@link createMiddlewareSuite}. */
export interface MiddlewareSuiteOptions extends MiddlewareTestOptions {
  /**
   * Which role fixture {@link MiddlewareSuiteContext.user} holds
   * (defaults to `"user"`; the full set is always on `.users`)
   */
  userRole?: MockUserRole;
}

/** The object a middleware test file wires into its lifecycle hooks. */
export interface MiddlewareSuite {
  /** The suite's name, as given to {@link createMiddlewareSuite} */
  readonly name: string;
  /** Build the fresh per-test context; call from `beforeEach` */
  setup(): MiddlewareSuiteContext;
  /** The context {@link MiddlewareSuite.setup} built for the running test */
  readonly current: MiddlewareSuiteContext;
  /** Tear the current context down; call from `afterEach` (safe twice) */
  teardown(): void;
}

// ============================================================================
// Suite factory
// ============================================================================

const NOT_SET_UP =
  "This middleware suite has no current context — call suite.setup() in beforeEach first";

/**
 * Create a base middleware test suite.
 *
 * The suite does not register any hooks itself: the test file keeps its own
 * `describe`, and wires `setup`/`teardown` into its `beforeEach`/`afterEach`,
 * so the suite stays usable in any runner and a test can add its own hook
 * bodies alongside.
 *
 * @param name - A label for the suite, surfaced in context and assertions
 * @param options - Request, chain, handler and mock options, plus which role
 *   fixture is the suite's primary user
 * @returns The suite to wire into lifecycle hooks
 *
 * @example A complete suite over an auditing middleware
 * ```typescript
 * const suite = createMiddlewareSuite("requireAuth", {
 *   middleware: [requireAuth],
 *   userRole: "admin",
 * });
 *
 * beforeEach(() => suite.setup());
 * afterEach(() => suite.teardown());
 *
 * it("admits the primary role and records the event", async () => {
 *   const { fixture, user, audit } = suite.current;
 *   const response = await fixture.run({
 *     request: fixture.createRequest({ headers: { authorization: `Bearer ${user.id}` } }),
 *   });
 *   expect(response.status).toBe(200);
 *   audit.expect().attributedTo(user.id).allSucceeded();
 * });
 * ```
 */
export function createMiddlewareSuite(
  name: string,
  options: MiddlewareSuiteOptions = {}
): MiddlewareSuite {
  const { userRole = "user", ...fixtureOptions } = options;
  let current: MiddlewareSuiteContext | null = null;

  return {
    name,

    setup(): MiddlewareSuiteContext {
      // Teardown any context a failed prior test left behind, so a crashing
      // beforeEach cannot leak its fixture into the next test.
      if (current) {
        teardownMiddlewareTest(current.fixture);
      }

      const users = createUserFixtures();
      const audit = createAuditLogRecorder();
      const context: MiddlewareSuiteContext = {
        name,
        users,
        user: userFixtureFor(userRole),
        data: seedTestData(),
        fixture: setupMiddlewareTest(fixtureOptions),
        audit,
        expectAuditTrail: () => expectAuditTrail(audit),
      };
      current = context;
      return context;
    },

    get current(): MiddlewareSuiteContext {
      if (!current) {
        throw new Error(NOT_SET_UP);
      }
      return current;
    },

    teardown(): void {
      if (current) {
        teardownMiddlewareTest(current.fixture);
        current = null;
      }
    },
  };
}
