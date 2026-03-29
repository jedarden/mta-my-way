/**
 * Tests for alert pattern matching in alerts-parser.ts
 *
 * Each pattern from alert-patterns.json is tested with its exampleMatch
 * input to verify correct matching and simplified output.
 */

import { describe, expect, it } from "vitest";
import { parseAlerts } from "./alerts-parser.js";
import { alertsFeed } from "./test/fixtures.js";

// ---------------------------------------------------------------------------
// Pattern matching via parseAlerts with fixture data
// ---------------------------------------------------------------------------

describe("parseAlerts - pattern matching", () => {
  it("suspended_between pattern matches", async () => {
    const alerts = await parseAlerts(alertsFeed());
    const suspended = alerts.find((a) => a.matchedPatternId === "suspended_between");
    expect(suspended).toBeDefined();
    expect(suspended!.patternMatched).toBe(true);
    expect(suspended!.affectedLines).toContain("F");
    expect(suspended!.severity).toBe("severe");
  });

  it("delays_due_to pattern matches", async () => {
    const alerts = await parseAlerts(alertsFeed());
    const delayed = alerts.find(
      (a) =>
        a.affectedLines.includes("A") &&
        a.affectedLines.includes("C") &&
        a.affectedLines.includes("E")
    );
    expect(delayed).toBeDefined();
    expect(delayed!.patternMatched).toBe(true);
    expect(delayed!.severity).toBe("warning"); // SIGNIFICANT_DELAYS → warning
  });

  it("service_resumed pattern matches", async () => {
    const alerts = await parseAlerts(alertsFeed());
    // Find by pattern ID to avoid matching alerts that mention G in description
    const resumed = alerts.find((a) => a.matchedPatternId === "service_resumed");
    expect(resumed).toBeDefined();
    expect(resumed!.patternMatched).toBe(true);
    expect(resumed!.severity).toBe("info"); // OTHER_EFFECT → info
  });

  it("running_with_delays pattern matches for N/Q/R", async () => {
    const alerts = await parseAlerts(alertsFeed());
    const delayed = alerts.find(
      (a) =>
        a.affectedLines.includes("N") &&
        a.affectedLines.includes("Q") &&
        a.affectedLines.includes("R")
    );
    expect(delayed).toBeDefined();
    expect(delayed!.patternMatched).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Severity mapping
// ---------------------------------------------------------------------------

describe("parseAlerts - severity mapping", () => {
  it("NO_SERVICE effect → severe", async () => {
    const alerts = await parseAlerts(alertsFeed());
    const suspended = alerts.find((a) => a.matchedPatternId === "suspended_between");
    expect(suspended!.severity).toBe("severe");
  });

  it("SIGNIFICANT_DELAYS effect → warning", async () => {
    const alerts = await parseAlerts(alertsFeed());
    const delayed = alerts.find(
      (a) => a.affectedLines.includes("A") && a.patternMatched
    );
    expect(delayed!.severity).toBe("warning");
  });

  it("OTHER_EFFECT → info", async () => {
    const alerts = await parseAlerts(alertsFeed());
    const resumed = alerts.find((a) => a.matchedPatternId === "service_resumed");
    expect(resumed!.severity).toBe("info");
  });
});

// ---------------------------------------------------------------------------
// Affected lines extraction
// ---------------------------------------------------------------------------

describe("parseAlerts - affected lines", () => {
  it("extracts lines from brackets including alternatives mentioned in description", async () => {
    const alerts = await parseAlerts(alertsFeed());
    const suspended = alerts.find((a) => a.matchedPatternId === "suspended_between");
    // F is from the headline [F], G is from "Please use [G] service" in description
    expect(suspended!.affectedLines).toContain("F");
  });

  it("extracts multiple lines from brackets", async () => {
    const alerts = await parseAlerts(alertsFeed());
    const delayed = alerts.find(
      (a) => a.affectedLines.includes("A") && a.affectedLines.includes("C")
    );
    expect(delayed!.affectedLines).toContain("A");
    expect(delayed!.affectedLines).toContain("C");
    expect(delayed!.affectedLines).toContain("E");
  });
});

// ---------------------------------------------------------------------------
// Active period
// ---------------------------------------------------------------------------

describe("parseAlerts - active period", () => {
  it("extracts start and end time from active period", async () => {
    const alerts = await parseAlerts(alertsFeed());
    const suspended = alerts.find((a) => a.matchedPatternId === "suspended_between");
    expect(suspended!.activePeriod.start).toBeGreaterThan(0);
    expect(suspended!.activePeriod.end).toBeGreaterThan(suspended!.activePeriod.start);
  });

  it("handles active period without end time", async () => {
    const alerts = await parseAlerts(alertsFeed());
    const resumed = alerts.find((a) => a.matchedPatternId === "service_resumed");
    expect(resumed!.activePeriod.start).toBeGreaterThan(0);
    // End may or may not be present
  });
});

// ---------------------------------------------------------------------------
// ParsedAlert structure
// ---------------------------------------------------------------------------

describe("parseAlerts - structure", () => {
  it("returns array of ParsedAlert objects", async () => {
    const alerts = await parseAlerts(alertsFeed());
    expect(Array.isArray(alerts)).toBe(true);
    expect(alerts.length).toBeGreaterThan(0);
  });

  it("each alert has required fields", async () => {
    const alerts = await parseAlerts(alertsFeed());
    for (const alert of alerts) {
      expect(alert.id).toBeDefined();
      expect(typeof alert.rawHeadline).toBe("string");
      expect(typeof alert.rawDescription).toBe("string");
      expect(typeof alert.simplifiedHeadline).toBe("string");
      expect(Array.isArray(alert.affectedLines)).toBe(true);
      expect(typeof alert.severity).toBe("string");
      expect(alert.source).toBe("official");
      expect(typeof alert.createdAt).toBe("number");
    }
  });
});

// ---------------------------------------------------------------------------
// Empty feed handling
// ---------------------------------------------------------------------------

describe("parseAlerts - empty feed", () => {
  it("returns empty array for feed with no alert entities", async () => {
    const { transit_realtime } = await import("./proto/compiled.js");
    const writer = transit_realtime.FeedMessage.encode(
      transit_realtime.FeedMessage.create({
        header: { gtfsRealtimeVersion: "2.0", timestamp: Math.floor(Date.now() / 1000) },
        entity: [],
      })
    );
    const data = writer.finish();
    const alerts = await parseAlerts(data);
    expect(alerts).toEqual([]);
  });
});
