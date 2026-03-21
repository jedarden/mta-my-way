/**
 * Tests for the alerts parser module.
 *
 * Tests the exported functions:
 *   - calculateMatchRate: computes ratio of pattern-matched alerts
 *   - toStationAlert: converts ParsedAlert to StationAlert API shape
 *   - getUnmatchedAlerts: returns the unmatched alert log
 */

import { describe, expect, it } from "vitest";
import type { ParsedAlert } from "./alerts-parser.js";
import { calculateMatchRate, getUnmatchedAlerts, toStationAlert } from "./alerts-parser.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeParsedAlert(overrides: Partial<ParsedAlert> = {}): ParsedAlert {
  return {
    id: "test-alert-1",
    rawHeadline: "[F] service has been suspended between Church Av and Jay St",
    rawDescription: "Service suspended due to track work.",
    simplifiedHeadline: "F suspended Church Av to Jay St",
    simplifiedDescription: "Service suspended due to track work.",
    patternMatched: true,
    matchedPatternId: "suspended_between",
    affectedLines: ["F"],
    affectedStations: [],
    activePeriod: { start: 1700000000 },
    cause: "MAINTENANCE",
    effect: "NO_SERVICE",
    severity: "severe",
    source: "official",
    createdAt: 1700000000,
    modifiedAt: 1700000000,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// calculateMatchRate
// ---------------------------------------------------------------------------

describe("calculateMatchRate", () => {
  it("returns 1 for an empty array", () => {
    expect(calculateMatchRate([])).toBe(1);
  });

  it("returns 1 when every alert matched a pattern", () => {
    const alerts = [
      makeParsedAlert({ patternMatched: true }),
      makeParsedAlert({ patternMatched: true }),
    ];
    expect(calculateMatchRate(alerts)).toBe(1);
  });

  it("returns 0 when no alert matched a pattern", () => {
    const alerts = [
      makeParsedAlert({ patternMatched: false }),
      makeParsedAlert({ patternMatched: false }),
    ];
    expect(calculateMatchRate(alerts)).toBe(0);
  });

  it("returns 0.5 when exactly half matched", () => {
    const alerts = [
      makeParsedAlert({ patternMatched: true }),
      makeParsedAlert({ patternMatched: false }),
    ];
    expect(calculateMatchRate(alerts)).toBe(0.5);
  });

  it("rounds correctly for large sets", () => {
    const alerts = Array.from({ length: 10 }, (_, i) =>
      makeParsedAlert({ patternMatched: i < 9 }) // 9 matched, 1 unmatched
    );
    expect(calculateMatchRate(alerts)).toBeCloseTo(0.9);
  });
});

// ---------------------------------------------------------------------------
// toStationAlert
// ---------------------------------------------------------------------------

describe("toStationAlert", () => {
  it("maps core fields from ParsedAlert to StationAlert", () => {
    const parsed = makeParsedAlert();
    const station = toStationAlert(parsed);

    expect(station.id).toBe("test-alert-1");
    expect(station.severity).toBe("severe");
    expect(station.source).toBe("official");
    expect(station.affectedLines).toEqual(["F"]);
    expect(station.cause).toBe("MAINTENANCE");
    expect(station.effect).toBe("NO_SERVICE");
  });

  it("uses simplifiedHeadline and simplifiedDescription", () => {
    const parsed = makeParsedAlert();
    const station = toStationAlert(parsed);

    expect(station.headline).toBe("F suspended Church Av to Jay St");
    expect(station.description).toBe("Service suspended due to track work.");
  });

  it("sets isRaw=false when the alert matched a pattern", () => {
    const parsed = makeParsedAlert({ patternMatched: true });
    expect(toStationAlert(parsed).isRaw).toBe(false);
  });

  it("sets isRaw=true when the alert did not match any pattern", () => {
    const parsed = makeParsedAlert({ patternMatched: false, matchedPatternId: null });
    expect(toStationAlert(parsed).isRaw).toBe(true);
  });

  it("maps activePeriod start and end", () => {
    const parsed = makeParsedAlert({
      activePeriod: { start: 1700000000, end: 1700003600 },
    });
    const station = toStationAlert(parsed);
    expect(station.activePeriod.start).toBe(1700000000);
    expect(station.activePeriod.end).toBe(1700003600);
  });

  it("omits activePeriod.end when not set", () => {
    const parsed = makeParsedAlert({ activePeriod: { start: 1700000000 } });
    const station = toStationAlert(parsed);
    expect(station.activePeriod.end).toBeUndefined();
  });

  it("correctly maps severity levels", () => {
    const severities = ["info", "warning", "severe"] as const;
    for (const severity of severities) {
      const station = toStationAlert(makeParsedAlert({ severity }));
      expect(station.severity).toBe(severity);
    }
  });
});

// ---------------------------------------------------------------------------
// getUnmatchedAlerts
// ---------------------------------------------------------------------------

describe("getUnmatchedAlerts", () => {
  it("returns an array", () => {
    const result = getUnmatchedAlerts();
    expect(Array.isArray(result)).toBe(true);
  });

  it("returns a copy (mutations do not affect the internal log)", () => {
    const first = getUnmatchedAlerts();
    const second = getUnmatchedAlerts();
    expect(first).not.toBe(second); // different references
  });
});
