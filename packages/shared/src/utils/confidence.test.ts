/**
 * Unit tests for confidence utilities
 */

import { describe, expect, it } from "vitest";
import {
  calculateConfidence,
  calculateConfidenceWithReroute,
  calculateJourneyConfidence,
  getConfidenceDescription,
  getConfidenceStyleClass,
  getDivision,
  getTransferBufferMinutes,
  isConfidenceAcceptable,
} from "./confidence.js";

describe("confidence utilities", () => {
  describe("calculateConfidence", () => {
    describe("A Division (numbered lines)", () => {
      it("returns 'high' for assigned trains", () => {
        expect(calculateConfidence("1", true)).toBe("high");
        expect(calculateConfidence("2", true)).toBe("high");
        expect(calculateConfidence("7", true)).toBe("high");
      });

      it("returns 'medium' for unassigned trains", () => {
        expect(calculateConfidence("1", false)).toBe("medium");
        expect(calculateConfidence("4", false)).toBe("medium");
      });
    });

    describe("L Line (CBTC tracking)", () => {
      it("returns 'high' for assigned trains", () => {
        expect(calculateConfidence("L", true)).toBe("high");
      });

      it("returns 'medium' for unassigned trains", () => {
        expect(calculateConfidence("L", false)).toBe("medium");
      });
    });

    describe("B Division (lettered lines)", () => {
      it("returns 'medium' for assigned trains", () => {
        expect(calculateConfidence("A", true)).toBe("medium");
        expect(calculateConfidence("F", true)).toBe("medium");
        expect(calculateConfidence("N", true)).toBe("medium");
      });

      it("returns 'low' for unassigned trains", () => {
        expect(calculateConfidence("A", false)).toBe("low");
        expect(calculateConfidence("B", false)).toBe("low");
      });
    });

    describe("Unknown lines", () => {
      it("returns 'low' for unknown line IDs", () => {
        expect(calculateConfidence("X", false)).toBe("low");
        expect(calculateConfidence("Y", true)).toBe("low");
      });
    });
  });

  describe("calculateConfidenceWithReroute", () => {
    it("returns 'low' for rerouted trains regardless of division", () => {
      expect(calculateConfidenceWithReroute("1", true, true)).toBe("low");
      expect(calculateConfidenceWithReroute("L", true, true)).toBe("low");
      expect(calculateConfidenceWithReroute("A", true, true)).toBe("low");
    });

    it("returns normal confidence when not rerouted", () => {
      expect(calculateConfidenceWithReroute("1", true, false)).toBe("high");
      expect(calculateConfidenceWithReroute("A", false, false)).toBe("low");
    });
  });

  describe("getConfidenceDescription", () => {
    it("returns description for high confidence", () => {
      expect(getConfidenceDescription("high")).toBe("High confidence: ATS/CBTC tracking with reliable predictions");
      expect(getConfidenceDescription("high", "1")).toBe("High confidence for the 1 train: ATS/CBTC tracking with reliable predictions");
    });

    it("returns description for medium confidence", () => {
      expect(getConfidenceDescription("medium")).toBe("Medium confidence: Predictions may vary by 1-2 minutes");
      expect(getConfidenceDescription("medium", "A")).toBe("Medium confidence for the A train: Predictions may vary by 1-2 minutes");
    });

    it("returns description for low confidence", () => {
      expect(getConfidenceDescription("low")).toBe("Low confidence: Prediction uncertain, may be delayed or cancelled");
      expect(getConfidenceDescription("low", "F")).toBe("Low confidence for the F train: Prediction uncertain, may be delayed or cancelled");
    });
  });

  describe("getTransferBufferMinutes", () => {
    it("returns 0 for high confidence", () => {
      expect(getTransferBufferMinutes("high")).toBe(0);
    });

    it("returns 2 for medium confidence", () => {
      expect(getTransferBufferMinutes("medium")).toBe(2);
    });

    it("returns 5 for low confidence", () => {
      expect(getTransferBufferMinutes("low")).toBe(5);
    });
  });

  describe("isConfidenceAcceptable", () => {
    it("returns true when confidence meets or exceeds minimum", () => {
      expect(isConfidenceAcceptable("high", "low")).toBe(true);
      expect(isConfidenceAcceptable("high", "medium")).toBe(true);
      expect(isConfidenceAcceptable("high", "high")).toBe(true);
      expect(isConfidenceAcceptable("medium", "medium")).toBe(true);
      expect(isConfidenceAcceptable("medium", "low")).toBe(true);
      expect(isConfidenceAcceptable("low", "low")).toBe(true);
    });

    it("returns false when confidence is below minimum", () => {
      expect(isConfidenceAcceptable("medium", "high")).toBe(false);
      expect(isConfidenceAcceptable("low", "medium")).toBe(false);
      expect(isConfidenceAcceptable("low", "high")).toBe(false);
    });
  });

  describe("getConfidenceStyleClass", () => {
    it("returns correct CSS class for each level", () => {
      expect(getConfidenceStyleClass("high")).toBe("confidence-high");
      expect(getConfidenceStyleClass("medium")).toBe("confidence-medium");
      expect(getConfidenceStyleClass("low")).toBe("confidence-low");
    });
  });

  describe("calculateJourneyConfidence", () => {
    it("returns 'low' for empty array", () => {
      expect(calculateJourneyConfidence([])).toBe("low");
    });

    it("returns lowest confidence when legs have different levels", () => {
      expect(calculateJourneyConfidence(["high", "medium", "low"])).toBe("low");
      expect(calculateJourneyConfidence(["high", "medium"])).toBe("medium");
    });

    it("returns 'high' when all legs are high", () => {
      expect(calculateJourneyConfidence(["high", "high", "high"])).toBe("high");
    });

    it("returns 'low' when any leg is low", () => {
      expect(calculateJourneyConfidence(["high", "low", "high"])).toBe("low");
    });
  });

  describe("getDivision", () => {
    it("returns 'A' for A Division lines", () => {
      expect(getDivision("1")).toBe("A");
      expect(getDivision("2")).toBe("A");
      expect(getDivision("7")).toBe("A");
    });

    it("returns 'B' for B Division lines", () => {
      expect(getDivision("A")).toBe("B");
      expect(getDivision("F")).toBe("B");
      expect(getDivision("N")).toBe("B");
    });

    it("returns undefined for unknown lines", () => {
      expect(getDivision("X")).toBeUndefined();
      expect(getDivision("Y")).toBeUndefined();
    });

    it("returns 'A' for L line (CBTC treated as A Division)", () => {
      expect(getDivision("L")).toBe("A");
    });
  });
});
