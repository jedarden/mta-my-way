/**
 * Tests for the audit trail assertions in `audit-assertions.ts`.
 *
 * The important properties are that a passing assertion chain stays silent,
 * that every violating check throws a message naming both the expected and
 * actual value, that the recorder is inert (it never validates, so an
 * unrecorded action shows up as an empty trail), and that trail assertions
 * narrow with `where` and `event` into single-event chains.
 */

import {
  AUDIT_SEVERITY_ORDER,
  createAuditLogRecorder,
  expectAuditEvent,
  expectAuditTrail,
} from "@mta-my-way/shared/testing/audit-assertions";
import { createMockAuditEvent } from "@mta-my-way/shared/testing/middleware";
import { describe, expect, it } from "vitest";

describe("AUDIT_SEVERITY_ORDER", () => {
  it("ranks info below critical", () => {
    expect(AUDIT_SEVERITY_ORDER.info).toBeLessThan(AUDIT_SEVERITY_ORDER.critical);
  });

  it("ranks the four levels without ties", () => {
    const ranks = Object.values(AUDIT_SEVERITY_ORDER);

    expect(new Set(ranks).size).toBe(ranks.length);
  });
});

describe("createAuditLogRecorder", () => {
  it("starts empty and records in order", () => {
    const recorder = createAuditLogRecorder();
    const first = createMockAuditEvent({ id: "e1" });
    const second = createMockAuditEvent({ id: "e2" });

    recorder.record(first);
    recorder.record(second);

    expect(recorder.events.map((e) => e.id)).toEqual(["e1", "e2"]);
  });

  it("records all seeded events before anything recorded later", () => {
    const seed = [createMockAuditEvent({ id: "seed-1" })];
    const recorder = createAuditLogRecorder(seed);

    recorder.record(createMockAuditEvent({ id: "live-1" }));

    expect(recorder.events.map((e) => e.id)).toEqual(["seed-1", "live-1"]);
  });

  it("clear forgets everything and keeps recording afterwards", () => {
    const recorder = createAuditLogRecorder();
    recorder.record(createMockAuditEvent());

    recorder.clear();
    recorder.record(createMockAuditEvent({ id: "after-clear" }));

    expect(recorder.events.map((e) => e.id)).toEqual(["after-clear"]);
  });

  it("record returns the event so construction can flow into recording", () => {
    const recorder = createAuditLogRecorder();
    const event = recorder.record(createMockAuditEvent({ action: "favorites:created" }));

    expect(event.action).toBe("favorites:created");
    expect(recorder.events).toHaveLength(1);
  });

  it("expect asserts over the recorded trail", () => {
    const recorder = createAuditLogRecorder();
    recorder.record(createMockAuditEvent({ action: "favorites:created" }));

    expect(() => recorder.expect().containsAction("favorites:created")).not.toThrow();
    expect(() => recorder.expect().containsAction("favorites:deleted")).toThrow(
      /favorites:deleted/
    );
  });

  it("is inert: recording nothing leaves an empty trail", () => {
    const recorder = createAuditLogRecorder();

    expect(recorder.events).toHaveLength(0);
  });
});

describe("expectAuditEvent", () => {
  it("passes silently through a full matching chain", () => {
    const event = createMockAuditEvent({
      action: "favorites:created",
      category: "data_access",
      severity: "warning",
      performedBy: "user-1",
      resourceType: "favorite",
      resourceId: "fav-9",
      success: true,
      clientIp: "10.0.0.7",
      metadata: { line: "7" },
    });

    expect(() =>
      expectAuditEvent(event)
        .withId(event.id)
        .withAction("favorites:created")
        .withCategory("data_access")
        .withSeverity("warning")
        .withSeverityAtLeast("info")
        .performedBy("user-1")
        .forResource("favorite", "fav-9")
        .succeeded()
        .fromIp("10.0.0.7")
        .withMetadata("line", "7")
        .withMetadata("line")
    ).not.toThrow();
  });

  it("names both values when the action differs", () => {
    const event = createMockAuditEvent({ action: "favorites:created" });

    expect(() => expectAuditEvent(event).withAction("favorites:deleted")).toThrow(
      /expected action "favorites:deleted", got "favorites:created"/
    );
  });

  it("treats severityAtLeast as a floor, not an exact match", () => {
    const event = createMockAuditEvent({ severity: "critical" });

    expect(() => expectAuditEvent(event).withSeverityAtLeast("warning")).not.toThrow();
    expect(() => expectAuditEvent(event).withSeverity("warning")).toThrow(
      /expected severity "warning", got "critical"/
    );
  });

  it("distinguishes succeeded from failed, including the error message", () => {
    const failure = createMockAuditEvent({ success: false, error: "insufficient_scope" });

    expect(() => expectAuditEvent(failure).failed("insufficient_scope")).not.toThrow();
    expect(() => expectAuditEvent(failure).succeeded()).toThrow(/expected a successful event/);
    expect(() => expectAuditEvent(failure).failed("token_expired")).toThrow(
      /expected error "token_expired", got "insufficient_scope"/
    );

    const success = createMockAuditEvent({ success: true });
    expect(() => expectAuditEvent(success).failed()).toThrow(/expected a failed event/);
  });

  it("asserts resource ID only when given", () => {
    const event = createMockAuditEvent({ resourceType: "station", resourceId: "725" });

    expect(() => expectAuditEvent(event).forResource("station")).not.toThrow();
    expect(() => expectAuditEvent(event).forResource("station", "726")).toThrow(
      /expected resourceId "726", got "725"/
    );
  });

  it("distinguishes a missing metadata key from a wrong metadata value", () => {
    const event = createMockAuditEvent({ metadata: { line: "7" } });

    expect(() => expectAuditEvent(event).withMetadata("direction")).toThrow(
      /expected metadata key "direction"/
    );
    expect(() => expectAuditEvent(event).withMetadata("line", "1")).toThrow(
      /expected metadata\["line"\] to be "1", got "7"/
    );
  });

  it("exposes the event for fields the chain does not cover", () => {
    const event = createMockAuditEvent({ userAgent: "seeded-agent" });

    expect(expectAuditEvent(event).get().userAgent).toBe("seeded-agent");
  });
});

describe("expectAuditTrail", () => {
  const trail = [
    createMockAuditEvent({ id: "e1", action: "authentication:session_created", timestamp: 100 }),
    createMockAuditEvent({ id: "e2", action: "favorites:created", timestamp: 200 }),
    createMockAuditEvent({
      id: "e3",
      action: "favorites:created",
      timestamp: 300,
      success: false,
      performedBy: "someone-else",
    }),
  ];

  it("asserts exact counts and per-action counts", () => {
    expect(() => expectAuditTrail(trail).hasCount(3)).not.toThrow();
    expect(() => expectAuditTrail(trail).withActionCount("favorites:created", 2)).not.toThrow();
    expect(() => expectAuditTrail(trail).hasCount(2)).toThrow(
      /expected 2 event\(s\), trail holds 3/
    );
    expect(() => expectAuditTrail(trail).withActionCount("favorites:created", 1)).toThrow(
      /expected 1 occurrence\(s\) of "favorites:created", got 2/
    );
  });

  it("describes an empty trail in the failure message", () => {
    expect(() => expectAuditTrail([]).containsAction("anything")).toThrow(/an empty trail/);
  });

  it("summarizes the trail by action when a check fails", () => {
    expect(() => expectAuditTrail(trail).hasCount(99)).toThrow(
      /\[authentication:session_created, favorites:created, favorites:created\]/
    );
  });

  it("attributedTo rejects a trail where any event is someone else's", () => {
    expect(() =>
      expectAuditTrail(trail)
        .where((e) => e.success)
        .attributedTo("user-test-1")
    ).not.toThrow();
    expect(() => expectAuditTrail(trail).attributedTo("user-test-1")).toThrow(/1 of 3 were not/);
  });

  it("allSucceeded isolates the failures in its message", () => {
    expect(() => expectAuditTrail(trail).allSucceeded()).toThrow(
      /1 of 3 failed: \[favorites:created\]/
    );
  });

  it("inChronologicalOrder rejects out-of-order timestamps", () => {
    const outOfOrder = [
      createMockAuditEvent({ timestamp: 200 }),
      createMockAuditEvent({ timestamp: 100 }),
    ];

    expect(() => expectAuditTrail(trail).inChronologicalOrder()).not.toThrow();
    expect(() => expectAuditTrail(outOfOrder).inChronologicalOrder()).toThrow(
      /chronological order/
    );
  });

  it("event asserts on the first matching action and chains from there", () => {
    expect(() =>
      expectAuditTrail(trail).event("favorites:created").withId("e2").succeeded()
    ).not.toThrow();
    expect(() => expectAuditTrail(trail).event("favorites:deleted")).toThrow(
      /expected a\(n\) "favorites:deleted" event to assert on/
    );
  });

  it("where narrows the trail for downstream checks", () => {
    expect(() =>
      expectAuditTrail(trail)
        .where((e) => e.action === "favorites:created")
        .hasCount(2)
        .allSucceeded()
    ).toThrow(/1 of 2 failed/);
  });

  it("get exposes the events for inspection", () => {
    expect(expectAuditTrail(trail).get()).toHaveLength(3);
  });

  it("asserts against a recorder directly", () => {
    const recorder = createAuditLogRecorder(trail);

    expect(() =>
      expectAuditTrail(recorder).hasCount(3).containsAction("favorites:created")
    ).not.toThrow();
  });
});
