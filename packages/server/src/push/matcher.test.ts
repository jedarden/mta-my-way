/**
 * Tests for the alert-to-subscription matcher.
 *
 * matchAlertToSubscriptions:
 *   - filters info-severity alerts (not sent as push notifications)
 *   - skips subscriptions in quiet hours
 *   - matches subscriptions whose favorite lines overlap alert lines
 *   - builds correct push notification payloads
 */

import { describe, expect, it } from "vitest";
import type { AlertChange } from "../alerts-poller.js";
import { matchAlertToSubscriptions } from "./matcher.js";
import type { PushSubscriptionRecord, StationAlert } from "@mta-my-way/shared";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeAlert(overrides: Partial<StationAlert> = {}): StationAlert {
  return {
    id: "alert-1",
    severity: "warning",
    source: "official",
    headline: "F trains delayed",
    description: "Delays due to signal problems",
    affectedLines: ["F"],
    activePeriod: { start: Math.floor(Date.now() / 1000) },
    cause: "TECHNICAL_PROBLEM",
    effect: "SIGNIFICANT_DELAYS",
    isRaw: false,
    ...overrides,
  };
}

function makeSubscription(overrides: Partial<PushSubscriptionRecord> = {}): PushSubscriptionRecord {
  return {
    endpointHash: "abc123",
    endpoint: "https://push.example.com/sub/123",
    p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtZ34Tuqe",
    auth: "tBHItJI5svbpez7KI4CCXg==",
    favorites: JSON.stringify([{ stationId: "123", lines: ["F"], direction: "N" }]),
    quietHours: JSON.stringify({ enabled: false, startHour: 0, endHour: 5 }),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeChange(
  alert: StationAlert,
  type: "new" | "updated" | "resolved" = "new"
): AlertChange {
  return { type, alert, detectedAt: Date.now() };
}

// ---------------------------------------------------------------------------
// Line matching
// ---------------------------------------------------------------------------

describe("matchAlertToSubscriptions — line matching", () => {
  it("matches when subscription line overlaps alert lines", () => {
    const alert = makeAlert({ affectedLines: ["F"] });
    const results = matchAlertToSubscriptions(makeChange(alert), [makeSubscription()]);
    expect(results).toHaveLength(1);
  });

  it("does not match when subscription lines do not overlap", () => {
    const alert = makeAlert({ affectedLines: ["A", "C"] });
    const results = matchAlertToSubscriptions(makeChange(alert), [makeSubscription()]);
    expect(results).toHaveLength(0);
  });

  it("is case-insensitive for line comparison", () => {
    const alert = makeAlert({ severity: "severe", affectedLines: ["f"] });
    const sub = makeSubscription({
      favorites: JSON.stringify([{ stationId: "123", lines: ["F"], direction: "N" }]),
    });
    const results = matchAlertToSubscriptions(makeChange(alert), [sub]);
    expect(results).toHaveLength(1);
  });

  it("returns one result per matched subscription (not per line)", () => {
    const alert = makeAlert({ affectedLines: ["F", "G"] });
    const sub = makeSubscription({
      favorites: JSON.stringify([
        { stationId: "123", lines: ["F"], direction: "N" },
        { stationId: "456", lines: ["G"], direction: "S" },
      ]),
    });
    const results = matchAlertToSubscriptions(makeChange(alert), [sub]);
    expect(results).toHaveLength(1); // one subscription, not two
  });
});

// ---------------------------------------------------------------------------
// Severity filtering
// ---------------------------------------------------------------------------

describe("matchAlertToSubscriptions — severity filtering", () => {
  it("skips info-severity new alerts", () => {
    const alert = makeAlert({ severity: "info", affectedLines: ["F"] });
    const results = matchAlertToSubscriptions(makeChange(alert, "new"), [makeSubscription()]);
    expect(results).toHaveLength(0);
  });

  it("skips info-severity updated alerts", () => {
    const alert = makeAlert({ severity: "info", affectedLines: ["F"] });
    const results = matchAlertToSubscriptions(makeChange(alert, "updated"), [makeSubscription()]);
    expect(results).toHaveLength(0);
  });

  it("skips info-severity resolved alerts", () => {
    const alert = makeAlert({ severity: "info", affectedLines: ["F"] });
    const results = matchAlertToSubscriptions(makeChange(alert, "resolved"), [makeSubscription()]);
    expect(results).toHaveLength(0);
  });

  it("sends warning-severity new alerts", () => {
    const alert = makeAlert({ severity: "warning", affectedLines: ["F"] });
    const results = matchAlertToSubscriptions(makeChange(alert, "new"), [makeSubscription()]);
    expect(results).toHaveLength(1);
  });

  it("sends severe-severity resolved alerts (service restored)", () => {
    const alert = makeAlert({ severity: "severe", affectedLines: ["F"] });
    const results = matchAlertToSubscriptions(makeChange(alert, "resolved"), [makeSubscription()]);
    expect(results).toHaveLength(1);
  });

  it("sends warning-severity resolved alerts", () => {
    const alert = makeAlert({ severity: "warning", affectedLines: ["F"] });
    const results = matchAlertToSubscriptions(makeChange(alert, "resolved"), [makeSubscription()]);
    expect(results).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Quiet hours
// ---------------------------------------------------------------------------

describe("matchAlertToSubscriptions — quiet hours", () => {
  it("skips subscriptions when quiet hours cover the full day", () => {
    // start=0, end=23 means always in quiet hours
    const alert = makeAlert({ severity: "severe", affectedLines: ["F"] });
    const sub = makeSubscription({
      quietHours: JSON.stringify({ enabled: true, startHour: 0, endHour: 23 }),
    });
    const results = matchAlertToSubscriptions(makeChange(alert), [sub]);
    expect(results).toHaveLength(0);
  });

  it("sends when quiet hours are disabled regardless of hour range", () => {
    const alert = makeAlert({ severity: "severe", affectedLines: ["F"] });
    const sub = makeSubscription({
      quietHours: JSON.stringify({ enabled: false, startHour: 0, endHour: 23 }),
    });
    const results = matchAlertToSubscriptions(makeChange(alert), [sub]);
    expect(results).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe("matchAlertToSubscriptions — error handling", () => {
  it("skips subscriptions with malformed favorites JSON", () => {
    const alert = makeAlert({ affectedLines: ["F"] });
    const sub = makeSubscription({ favorites: "not-json" });
    const results = matchAlertToSubscriptions(makeChange(alert), [sub]);
    expect(results).toHaveLength(0);
  });

  it("uses safe defaults when quietHours JSON is malformed", () => {
    // Malformed quiet hours → defaults to disabled → alert should be sent
    const alert = makeAlert({ severity: "severe", affectedLines: ["F"] });
    const sub = makeSubscription({ quietHours: "invalid-json" });
    const results = matchAlertToSubscriptions(makeChange(alert), [sub]);
    expect(results).toHaveLength(1);
  });

  it("returns empty when subscriptions list is empty", () => {
    const alert = makeAlert({ affectedLines: ["F"] });
    expect(matchAlertToSubscriptions(makeChange(alert), [])).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Payload structure
// ---------------------------------------------------------------------------

describe("matchAlertToSubscriptions — payload content", () => {
  it("builds correct payload for a new warning alert", () => {
    const alert = makeAlert({ affectedLines: ["F"] });
    const results = matchAlertToSubscriptions(makeChange(alert, "new"), [makeSubscription()]);
    const { payload } = results[0]!;

    expect(payload.alertId).toBe("alert-1");
    expect(payload.changeType).toBe("new");
    expect(payload.severity).toBe("warning");
    expect(payload.lines).toEqual(["F"]);
    expect(payload.title).toContain("Delays");
    expect(payload.body).toBe("F trains delayed");
    expect(typeof payload.timestamp).toBe("number");
  });

  it("uses 'Service alert' title for new severe alerts", () => {
    const alert = makeAlert({ severity: "severe", affectedLines: ["F"] });
    const results = matchAlertToSubscriptions(makeChange(alert, "new"), [makeSubscription()]);
    expect(results[0]!.payload.title).toContain("Service alert");
  });

  it("uses 'Service restored' title for resolved alerts", () => {
    const alert = makeAlert({ severity: "severe", affectedLines: ["F"] });
    const results = matchAlertToSubscriptions(makeChange(alert, "resolved"), [makeSubscription()]);
    expect(results[0]!.payload.title).toContain("Service restored");
  });

  it("sets subscription reference on each result", () => {
    const alert = makeAlert({ affectedLines: ["F"] });
    const sub = makeSubscription();
    const results = matchAlertToSubscriptions(makeChange(alert), [sub]);
    expect(results[0]!.subscription.endpointHash).toBe("abc123");
  });
});
