/**
 * Assertion utilities for audit trails: verify what a middleware recorded,
 * field by field, without depending on a test runner's matcher API.
 *
 * The server's audit middlewares (`audit-log.ts`, `structured-audit-log.ts`)
 * leave an event trail behind each request; a middleware test's job is to
 * prove the right events landed with the right attribution. Creation helpers
 * already exist — `createMockAuditEvent` and `createMockAuditLogEntry` — but
 * the asserting side had to hand-roll `expect(event.action).toBe(...)` chains
 * that repeat on every failure mode. These helpers centralize that:
 *
 * - {@link createAuditLogRecorder} is the sink a middleware under test writes
 *   to. Production code takes an injectable audit sink; a test passes the
 *   recorder and asserts on what arrived.
 * - {@link expectAuditEvent} asserts one event field by field, chainable.
 * - {@link expectAuditTrail} asserts over a sequence: ordering, attribution,
 *   per-action counts.
 *
 * Assertions throw plain `Error`s with the offending values in the message —
 * the same convention `test-patterns.ts` uses — so they work under vitest,
 * inside `expect(...).not.toThrow(...)` guards, and from any other runner.
 */

import type { MockAuditEvent } from "./middleware/execution-context";

// ============================================================================
// Types
// ============================================================================

/**
 * The audit event shape these assertions read.
 *
 * This is the flat `AuditEvent` the server's `audit-log.ts` middleware emits
 * (mirrored by `MockAuditEvent`); because assertion inputs are read-only and
 * structurally typed, the structured events from `structured-audit-log.ts`
 * can be projected onto it by picking the fields a test cares about.
 */
export type AuditedEvent = MockAuditEvent;

/** Severity ranking used by {@link AuditEventAssertion.withSeverityAtLeast}. */
export const AUDIT_SEVERITY_ORDER = {
  info: 0,
  warning: 1,
  error: 2,
  critical: 3,
} as const;

/** A severity level accepted by the ordering helpers. */
export type AuditSeverityLevel = keyof typeof AUDIT_SEVERITY_ORDER;

/** Sink a middleware under test records audit events into. */
export interface AuditLogRecorder {
  /** Record one event; returns it for fluent construction */
  record(event: AuditedEvent): AuditedEvent;
  /** Record several events, in order */
  recordAll(events: readonly AuditedEvent[]): void;
  /** Everything recorded since the last {@link AuditLogRecorder.clear}, oldest first */
  readonly events: readonly AuditedEvent[];
  /** Forget every recorded event, so a test or hook can start clean */
  clear(): void;
  /** Start a trail assertion over what has been recorded */
  expect(): AuditTrailAssertion;
}

// ============================================================================
// Recorder
// ============================================================================

/**
 * Create an in-memory audit sink for a middleware test.
 *
 * Production middlewares write to an injected sink; hand the test's middleware
 * under test a closure over `recorder.record`, then assert on
 * `recorder.expect()`. The recorder is inert by itself — it never validates
 * what it is given — so a middleware that records nothing simply produces an
 * empty trail, which `expectAuditTrail(...).hasCount(0)` (or `.containsAction`)
 * turns into a failure.
 *
 * @param seed - Events the trail starts with (defaults to none)
 * @returns A recorder whose trail assertions read everything recorded so far
 *
 * @example Wiring a middleware to a recorder
 * ```typescript
 * const recorder = createAuditLogRecorder();
 * const middleware = auditMiddleware(recorder.record);
 * await executeMiddleware([middleware], request, handler);
 * recorder.expect().containsAction("favorites:created");
 * ```
 */
export function createAuditLogRecorder(seed: readonly AuditedEvent[] = []): AuditLogRecorder {
  let recorded: AuditedEvent[] = [...seed];

  return {
    record(event: AuditedEvent): AuditedEvent {
      recorded.push(event);
      return event;
    },

    recordAll(events: readonly AuditedEvent[]): void {
      recorded.push(...events);
    },

    get events(): readonly AuditedEvent[] {
      return recorded;
    },

    clear(): void {
      recorded = [];
    },

    expect(): AuditTrailAssertion {
      return expectAuditTrail(recorded);
    },
  };
}

// ============================================================================
// Single-event assertions
// ============================================================================

/** Chainable assertion over one audit event, created by {@link expectAuditEvent}. */
export interface AuditEventAssertion {
  /** Assert the event's `id` */
  withId(id: string): this;
  /** Assert the event's `action` */
  withAction(action: string): this;
  /** Assert the event's `category` */
  withCategory(category: AuditedEvent["category"]): this;
  /** Assert the event's `severity` exactly */
  withSeverity(severity: AuditSeverityLevel): this;
  /** Assert the event's `severity` is at least the given level */
  withSeverityAtLeast(severity: AuditSeverityLevel): this;
  /** Assert the event is attributed to the given user */
  performedBy(userId: string): this;
  /** Assert the event's resource type, and optionally its resource ID */
  forResource(resourceType: string, resourceId?: string): this;
  /** Assert the event records a success */
  succeeded(): this;
  /** Assert the event records a failure, optionally with an error message */
  failed(expectedError?: string): this;
  /** Assert the event's client IP */
  fromIp(ip: string): this;
  /** Assert `metadata[key]` exists, and equals `value` when given */
  withMetadata(key: string, value?: unknown): this;
  /** The event under assertion, for reading fields the chain does not cover */
  get(): AuditedEvent;
}

/**
 * Assert on a single audit event, field by field.
 *
 * Every assertion throws an `Error` naming the field and both values on
 * failure, and returns the same assertion so checks read as one sentence.
 * Nothing runs eagerly except the throw: an assertion chain that never
 * reaches a violating check never fails.
 *
 * @param event - The event to assert on
 * @returns A chainable assertion over `event`
 *
 * @example A failed login from one address
 * ```typescript
 * expectAuditEvent(recorded)
 *   .withAction("authentication:failed_login")
 *   .withSeverityAtLeast("warning")
 *   .failed()
 *   .fromIp("10.0.0.7");
 * ```
 */
export function expectAuditEvent(event: AuditedEvent): AuditEventAssertion {
  const assert = (condition: boolean, message: string): void => {
    if (!condition) {
      throw new Error(`Audit event assertion failed: ${message}`);
    }
  };
  const describe = (value: unknown): string => JSON.stringify(value) ?? String(value);

  const assertion: AuditEventAssertion = {
    withId(id: string) {
      assert(event.id === id, `expected id ${describe(id)}, got ${describe(event.id)}`);
      return assertion;
    },

    withAction(action: string) {
      assert(
        event.action === action,
        `expected action ${describe(action)}, got ${describe(event.action)}`
      );
      return assertion;
    },

    withCategory(category: AuditedEvent["category"]) {
      assert(
        event.category === category,
        `expected category ${describe(category)}, got ${describe(event.category)}`
      );
      return assertion;
    },

    withSeverity(severity: AuditSeverityLevel) {
      assert(
        event.severity === severity,
        `expected severity ${describe(severity)}, got ${describe(event.severity)}`
      );
      return assertion;
    },

    withSeverityAtLeast(severity: AuditSeverityLevel) {
      const actual = AUDIT_SEVERITY_ORDER[event.severity];
      const minimum = AUDIT_SEVERITY_ORDER[severity];
      assert(
        actual !== undefined && actual >= minimum,
        `expected severity at least ${describe(severity)}, got ${describe(event.severity)}`
      );
      return assertion;
    },

    performedBy(userId: string) {
      assert(
        event.performedBy === userId,
        `expected performedBy ${describe(userId)}, got ${describe(event.performedBy)}`
      );
      return assertion;
    },

    forResource(resourceType: string, resourceId?: string) {
      assert(
        event.resourceType === resourceType,
        `expected resourceType ${describe(resourceType)}, got ${describe(event.resourceType)}`
      );
      if (resourceId !== undefined) {
        assert(
          event.resourceId === resourceId,
          `expected resourceId ${describe(resourceId)}, got ${describe(event.resourceId)}`
        );
      }
      return assertion;
    },

    succeeded() {
      assert(event.success === true, "expected a successful event, got success=false");
      return assertion;
    },

    failed(expectedError?: string) {
      assert(event.success === false, "expected a failed event, got success=true");
      if (expectedError !== undefined) {
        assert(
          event.error === expectedError,
          `expected error ${describe(expectedError)}, got ${describe(event.error)}`
        );
      }
      return assertion;
    },

    fromIp(ip: string) {
      assert(
        event.clientIp === ip,
        `expected clientIp ${describe(ip)}, got ${describe(event.clientIp)}`
      );
      return assertion;
    },

    withMetadata(key: string, value?: unknown) {
      const metadata = event.metadata ?? {};
      assert(
        key in metadata,
        `expected metadata key ${describe(key)}, metadata has ${describe(Object.keys(metadata))}`
      );
      if (value !== undefined) {
        assert(
          metadata[key] === value,
          `expected metadata[${describe(key)}] to be ${describe(value)}, got ${describe(metadata[key])}`
        );
      }
      return assertion;
    },

    get() {
      return event;
    },
  };

  return assertion;
}

// ============================================================================
// Trail assertions
// ============================================================================

/** Chainable assertion over a recorded audit trail, created by {@link expectAuditTrail}. */
export interface AuditTrailAssertion {
  /** Assert the trail holds exactly `count` events */
  hasCount(count: number): this;
  /** Assert at least one event carries `action` */
  containsAction(action: string): this;
  /** Assert exactly `expected` events carry `action` */
  withActionCount(action: string, expected: number): this;
  /** Assert every event's `performedBy` is `userId` */
  attributedTo(userId: string): this;
  /** Assert every event succeeded */
  allSucceeded(): this;
  /** Assert timestamps are non-decreasing (the trail reads oldest first) */
  inChronologicalOrder(): this;
  /** Narrow the trail to events matching `predicate`, keeping the labels out of messages */
  where(predicate: (event: AuditedEvent) => boolean): AuditTrailAssertion;
  /** Assert on the first event carrying `action` */
  event(action: string): AuditEventAssertion;
  /** The trail under assertion, for reading events the chain does not cover */
  get(): readonly AuditedEvent[];
}

/**
 * Assert on a recorded audit trail, or on a recorder's trail directly.
 *
 * @param trail - The events to assert over, oldest first, or a recorder whose
 *   recorded events are asserted instead
 * @returns A chainable assertion over the trail
 *
 * @example An admin action leaves one attributable, successful event
 * ```typescript
 * expectAuditTrail(recorder)
 *   .hasCount(1)
 *   .attributedTo(admin.id)
 *   .allSucceeded()
 *   .event("admin:purge_cache")
 *   .withSeverity("warning");
 * ```
 */
export function expectAuditTrail(
  trail: readonly AuditedEvent[] | AuditLogRecorder
): AuditTrailAssertion {
  // `in` rather than Array.isArray: the latter cannot narrow `readonly T[]`
  // out of the union's else branch, which breaks every assertion below.
  const events = "events" in trail ? trail.events : trail;

  const assert = (condition: boolean, message: string): void => {
    if (!condition) {
      throw new Error(`Audit trail assertion failed: ${message}`);
    }
  };

  const summarize = (list: readonly AuditedEvent[]): string =>
    list.length === 0 ? "an empty trail" : `[${list.map((e) => e.action).join(", ")}]`;

  const assertion: AuditTrailAssertion = {
    hasCount(count: number) {
      assert(
        events.length === count,
        `expected ${count} event(s), trail holds ${events.length}: ${summarize(events)}`
      );
      return assertion;
    },

    containsAction(action: string) {
      assert(
        events.some((e) => e.action === action),
        `expected the trail to contain action ${JSON.stringify(action)}, got ${summarize(events)}`
      );
      return assertion;
    },

    withActionCount(action: string, expected: number) {
      const actual = events.filter((e) => e.action === action).length;
      assert(
        actual === expected,
        `expected ${expected} occurrence(s) of ${JSON.stringify(action)}, got ${actual}: ${summarize(events)}`
      );
      return assertion;
    },

    attributedTo(userId: string) {
      const misattributed = events.filter((e) => e.performedBy !== userId);
      assert(
        misattributed.length === 0,
        `expected every event to be attributed to ${JSON.stringify(userId)}, ${misattributed.length} of ${events.length} were not`
      );
      return assertion;
    },

    allSucceeded() {
      const failed = events.filter((e) => !e.success);
      assert(
        failed.length === 0,
        `expected every event to succeed, ${failed.length} of ${events.length} failed: ${summarize(failed)}`
      );
      return assertion;
    },

    inChronologicalOrder() {
      for (let i = 1; i < events.length; i++) {
        const current = events[i];
        const prior = events[i - 1];
        // Both indexes are in bounds by the loop condition; the guard exists
        // for the type checker, which cannot see it.
        if (!current || !prior) {
          continue;
        }
        assert(
          current.timestamp >= prior.timestamp,
          `expected the trail in chronological order, event ${i} (${JSON.stringify(current.action)}) predates event ${i - 1} (${JSON.stringify(prior.action)})`
        );
      }
      return assertion;
    },

    where(predicate: (event: AuditedEvent) => boolean) {
      return expectAuditTrail(events.filter(predicate));
    },

    event(action: string) {
      const match = events.find((e) => e.action === action);
      if (!match) {
        throw new Error(
          `Audit trail assertion failed: expected a(n) ${JSON.stringify(action)} event to assert on, got ${summarize(events)}`
        );
      }
      return expectAuditEvent(match);
    },

    get() {
      return events;
    },
  };

  return assertion;
}
