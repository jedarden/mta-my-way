/**
 * Tests for confidence.ts from @mta-my-way/shared
 *
 * Covers all combinations of:
 * - A Division (numbered lines) + assigned/unassigned
 * - B Division (lettered lines) + assigned/unassigned
 * - L Line (CBTC, treated as A Division) + assigned/unassigned
 * - Rerouted trains (always low)
 * - Unknown lines
 * - Transfer buffer, journey confidence, acceptability
 */

import {
  calculateConfidence,
  calculateConfidenceWithReroute,
  calculateJourneyConfidence,
  getConfidenceDescription,
  getConfidenceStyleClass,
  getDivision,
  getTransferBufferMinutes,
  isConfidenceAcceptable,
} from "@mta-my-way/shared";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// calculateConfidence: A Division (numbered lines)
// ---------------------------------------------------------------------------

describe("calculateConfidence - A Division", () => {
  it("1 train assigned → high", () => {
    expect(calculateConfidence("1", true)).toBe("high");
  });

  it("2 train assigned → high", () => {
    expect(calculateConfidence("2", true)).toBe("high");
  });

  it("4 train assigned → high", () => {
    expect(calculateConfidence("4", true)).toBe("high");
  });

  it("7 train assigned → high", () => {
    expect(calculateConfidence("7", true)).toBe("high");
  });

  it("S shuttle assigned → high", () => {
    expect(calculateConfidence("S", true)).toBe("high");
  });

  it("1 train unassigned → medium", () => {
    expect(calculateConfidence("1", false)).toBe("medium");
  });

  it("6 train unassigned → medium", () => {
    expect(calculateConfidence("6", false)).toBe("medium");
  });
});

// ---------------------------------------------------------------------------
// calculateConfidence: B Division (lettered lines)
// ---------------------------------------------------------------------------

describe("calculateConfidence - B Division", () => {
  it("A train assigned → medium", () => {
    expect(calculateConfidence("A", true)).toBe("medium");
  });

  it("F train assigned → medium", () => {
    expect(calculateConfidence("F", true)).toBe("medium");
  });

  it("N train assigned → medium", () => {
    expect(calculateConfidence("N", true)).toBe("medium");
  });

  it("A train unassigned → low", () => {
    expect(calculateConfidence("A", false)).toBe("low");
  });

  it("F train unassigned → low", () => {
    expect(calculateConfidence("F", false)).toBe("low");
  });

  it("G train unassigned → low", () => {
    expect(calculateConfidence("G", false)).toBe("low");
  });

  it("J train unassigned → low", () => {
    expect(calculateConfidence("J", false)).toBe("low");
  });
});

// ---------------------------------------------------------------------------
// calculateConfidence: L Line (CBTC)
// ---------------------------------------------------------------------------

describe("calculateConfidence - L Line (CBTC)", () => {
  it("L train assigned → high (CBTC tracked)", () => {
    expect(calculateConfidence("L", true)).toBe("high");
  });

  it("L train unassigned → medium", () => {
    expect(calculateConfidence("L", false)).toBe("medium");
  });
});

// ---------------------------------------------------------------------------
// calculateConfidence: edge cases
// ---------------------------------------------------------------------------

describe("calculateConfidence - edge cases", () => {
  it("unknown line → low", () => {
    expect(calculateConfidence("X", true)).toBe("low");
  });

  it("empty string line → low", () => {
    expect(calculateConfidence("", true)).toBe("low");
  });
});

// ---------------------------------------------------------------------------
// calculateConfidenceWithReroute
// ---------------------------------------------------------------------------

describe("calculateConfidenceWithReroute", () => {
  it("A Division + assigned + rerouted → low", () => {
    expect(calculateConfidenceWithReroute("1", true, true)).toBe("low");
  });

  it("A Division + assigned + not rerouted → high", () => {
    expect(calculateConfidenceWithReroute("1", true, false)).toBe("high");
  });

  it("B Division + assigned + rerouted → low", () => {
    expect(calculateConfidenceWithReroute("A", true, true)).toBe("low");
  });

  it("L Line + assigned + rerouted → low", () => {
    expect(calculateConfidenceWithReroute("L", true, true)).toBe("low");
  });

  it("B Division + unassigned + rerouted → low", () => {
    expect(calculateConfidenceWithReroute("F", false, true)).toBe("low");
  });
});

// ---------------------------------------------------------------------------
// getTransferBufferMinutes
// ---------------------------------------------------------------------------

describe("getTransferBufferMinutes", () => {
  it("high → 0 minutes", () => {
    expect(getTransferBufferMinutes("high")).toBe(0);
  });

  it("medium → 2 minutes", () => {
    expect(getTransferBufferMinutes("medium")).toBe(2);
  });

  it("low → 5 minutes", () => {
    expect(getTransferBufferMinutes("low")).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// isConfidenceAcceptable
// ---------------------------------------------------------------------------

describe("isConfidenceAcceptable", () => {
  it("high is acceptable when minimum is high", () => {
    expect(isConfidenceAcceptable("high", "high")).toBe(true);
  });

  it("medium is not acceptable when minimum is high", () => {
    expect(isConfidenceAcceptable("medium", "high")).toBe(false);
  });

  it("low is not acceptable when minimum is high", () => {
    expect(isConfidenceAcceptable("low", "high")).toBe(false);
  });

  it("high is acceptable when minimum is medium", () => {
    expect(isConfidenceAcceptable("high", "medium")).toBe(true);
  });

  it("medium is acceptable when minimum is medium", () => {
    expect(isConfidenceAcceptable("medium", "medium")).toBe(true);
  });

  it("low is acceptable when minimum is low", () => {
    expect(isConfidenceAcceptable("low", "low")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// calculateJourneyConfidence
// ---------------------------------------------------------------------------

describe("calculateJourneyConfidence", () => {
  it("empty legs → low", () => {
    expect(calculateJourneyConfidence([])).toBe("low");
  });

  it("single high leg → high", () => {
    expect(calculateJourneyConfidence(["high"])).toBe("high");
  });

  it("high + high → high", () => {
    expect(calculateJourneyConfidence(["high", "high"])).toBe("high");
  });

  it("high + medium → medium (worst wins)", () => {
    expect(calculateJourneyConfidence(["high", "medium"])).toBe("medium");
  });

  it("high + low → low (worst wins)", () => {
    expect(calculateJourneyConfidence(["high", "low"])).toBe("low");
  });

  it("medium + low → low", () => {
    expect(calculateJourneyConfidence(["medium", "low"])).toBe("low");
  });
});

// ---------------------------------------------------------------------------
// getConfidenceDescription
// ---------------------------------------------------------------------------

describe("getConfidenceDescription", () => {
  it("high includes ATS/CBTC", () => {
    expect(getConfidenceDescription("high")).toContain("ATS/CBTC");
  });

  it("medium mentions 1-2 minute variance", () => {
    expect(getConfidenceDescription("medium")).toContain("1-2 minutes");
  });

  it("low mentions uncertain", () => {
    expect(getConfidenceDescription("low")).toContain("uncertain");
  });

  it("includes line name when provided", () => {
    expect(getConfidenceDescription("high", "1")).toContain("1 train");
  });
});

// ---------------------------------------------------------------------------
// getConfidenceStyleClass
// ---------------------------------------------------------------------------

describe("getConfidenceStyleClass", () => {
  it("high → confidence-high", () => {
    expect(getConfidenceStyleClass("high")).toBe("confidence-high");
  });

  it("medium → confidence-medium", () => {
    expect(getConfidenceStyleClass("medium")).toBe("confidence-medium");
  });

  it("low → confidence-low", () => {
    expect(getConfidenceStyleClass("low")).toBe("confidence-low");
  });
});

// ---------------------------------------------------------------------------
// getDivision
// ---------------------------------------------------------------------------

describe("getDivision", () => {
  it("A Division lines return 'A'", () => {
    expect(getDivision("1")).toBe("A");
    expect(getDivision("6")).toBe("A");
    expect(getDivision("S")).toBe("A");
  });

  it("B Division lines return 'B'", () => {
    expect(getDivision("A")).toBe("B");
    expect(getDivision("F")).toBe("B");
    expect(getDivision("SIR")).toBe("B");
  });

  it("unknown line returns undefined", () => {
    expect(getDivision("X")).toBeUndefined();
  });
});
