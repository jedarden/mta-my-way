/**
 * Tests for NYC Subway line metadata.
 */

import { describe, expect, it } from "vitest";
import {
  LINE_METADATA,
  getAllLineIds,
  getLineColor,
  getLineMetadata,
  getLineTextColor,
  getLinesByColorFamily,
  isADivision,
  isBDivision,
} from "./lines";

describe("constants/lines", () => {
  describe("LINE_METADATA", () => {
    it("contains all NYC subway lines", () => {
      const expectedLines = [
        "1",
        "2",
        "3",
        "4",
        "5",
        "6",
        "7",
        "7X",
        "S",
        "GS",
        "A",
        "B",
        "C",
        "D",
        "E",
        "F",
        "G",
        "J",
        "L",
        "M",
        "N",
        "Q",
        "R",
        "W",
        "Z",
        "SIR",
        "FS",
        "H",
      ];

      expectedLines.forEach((line) => {
        expect(LINE_METADATA[line]).toBeDefined();
      });
    });

    it("has valid hex colors for all lines", () => {
      Object.values(LINE_METADATA).forEach((meta) => {
        expect(meta.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
        expect(meta.textColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
      });
    });

    it("has all required fields for each line", () => {
      Object.values(LINE_METADATA).forEach((meta) => {
        expect(meta.id).toBeDefined();
        expect(meta.shortName).toBeDefined();
        expect(meta.longName).toBeDefined();
        expect(meta.color).toBeDefined();
        expect(meta.textColor).toBeDefined();
        expect(meta.division).toBeDefined();
        expect(meta.feedId).toBeDefined();
        expect(typeof meta.isExpress).toBe("boolean");
        expect(Array.isArray(meta.similarLines));
      });
    });

    it("has valid division values", () => {
      Object.values(LINE_METADATA).forEach((meta) => {
        expect(["A", "B"]).toContain(meta.division);
      });
    });

    it("has valid feed IDs", () => {
      const validFeedIds = [
        "gtfs",
        "gtfs-ace",
        "gtfs-bdfm",
        "gtfs-g",
        "gtfs-jz",
        "gtfs-l",
        "gtfs-nqrw",
        "gtfs-si",
      ];

      Object.values(LINE_METADATA).forEach((meta) => {
        expect(validFeedIds).toContain(meta.feedId);
      });
    });

    it("A Division lines are numbered", () => {
      const aDivisionLines = ["1", "2", "3", "4", "5", "6", "7", "7X", "S", "GS"];

      aDivisionLines.forEach((lineId) => {
        expect(LINE_METADATA[lineId].division).toBe("A");
      });
    });

    it("B Division lines are lettered (except shuttles and SIR)", () => {
      const bDivisionLines = [
        "A",
        "B",
        "C",
        "D",
        "E",
        "F",
        "G",
        "J",
        "L",
        "M",
        "N",
        "Q",
        "R",
        "W",
        "Z",
        "SIR",
        "FS",
        "H",
      ];

      bDivisionLines.forEach((lineId) => {
        expect(LINE_METADATA[lineId].division).toBe("B");
      });
    });

    it("express lines are marked correctly", () => {
      const expressLines = ["2", "3", "4", "5", "7X", "A", "B", "D", "Z", "N", "Q"];

      expressLines.forEach((lineId) => {
        if (LINE_METADATA[lineId]) {
          expect(LINE_METADATA[lineId].isExpress).toBe(true);
        }
      });
    });

    it("local lines are marked correctly", () => {
      const localLines = ["1", "6", "S", "GS", "C", "E", "F", "G", "L", "M", "R", "W"];

      localLines.forEach((lineId) => {
        if (LINE_METADATA[lineId]) {
          expect(LINE_METADATA[lineId].isExpress).toBe(false);
        }
      });
    });

    it("similar lines are bidirectional", () => {
      Object.entries(LINE_METADATA).forEach(([lineId, meta]) => {
        meta.similarLines.forEach((similarLine) => {
          const similarMeta = LINE_METADATA[similarLine];
          expect(similarMeta).toBeDefined();
          expect(similarMeta.similarLines).toContain(lineId);
        });
      });
    });

    it("has official MTA colors", () => {
      expect(LINE_METADATA["1"].color).toBe("#E12821"); // Red
      expect(LINE_METADATA["A"].color).toBe("#0039A6"); // Blue
      expect(LINE_METADATA["G"].color).toBe("#2C7E05"); // Green
      expect(LINE_METADATA["L"].color).toBe("#747679"); // Gray
      expect(LINE_METADATA["N"].color).toBe("#FCCC0A"); // Yellow
    });
  });

  describe("getLineMetadata", () => {
    it("returns metadata for valid line ID", () => {
      const meta = getLineMetadata("1");

      expect(meta).toBeDefined();
      expect(meta?.id).toBe("1");
      expect(meta?.shortName).toBe("1");
      expect(meta?.longName).toBe("Broadway-7th Ave Local");
    });

    it("returns undefined for invalid line ID", () => {
      expect(getLineMetadata("X")).toBeUndefined();
      expect(getLineMetadata("")).toBeUndefined();
      expect(getLineMetadata("999")).toBeUndefined();
    });

    it("returns complete metadata object", () => {
      const meta = getLineMetadata("A");

      expect(meta).toMatchObject({
        id: "A",
        shortName: "A",
        longName: "8th Ave Express",
        color: "#0039A6",
        textColor: "#FFFFFF",
        division: "B",
        feedId: "gtfs-ace",
        isExpress: true,
      });
      expect(Array.isArray(meta?.similarLines)).toBe(true);
    });
  });

  describe("getLineColor", () => {
    it("returns correct color for valid lines", () => {
      expect(getLineColor("1")).toBe("#E12821");
      expect(getLineColor("A")).toBe("#0039A6");
      expect(getLineColor("G")).toBe("#2C7E05");
    });

    it("returns fallback gray for invalid lines", () => {
      expect(getLineColor("X")).toBe("#737476");
      expect(getLineColor("")).toBe("#737476");
    });
  });

  describe("getLineTextColor", () => {
    it("returns correct text color for valid lines", () => {
      expect(getLineTextColor("1")).toBe("#FFFFFF"); // White on red
      expect(getLineTextColor("A")).toBe("#FFFFFF"); // White on blue
      expect(getLineTextColor("N")).toBe("#000000"); // Black on yellow
    });

    it("returns white fallback for invalid lines", () => {
      expect(getLineTextColor("X")).toBe("#FFFFFF");
      expect(getLineTextColor("")).toBe("#FFFFFF");
    });

    it("has high contrast colors", () => {
      // Lines with light backgrounds should have dark text
      const lightBackgroundLines = ["N", "Q", "R", "W"];
      lightBackgroundLines.forEach((line) => {
        expect(getLineTextColor(line)).toBe("#000000");
      });

      // Lines with dark backgrounds should have light text
      const darkBackgroundLines = [
        "1",
        "2",
        "3",
        "4",
        "5",
        "6",
        "A",
        "B",
        "C",
        "D",
        "E",
        "F",
        "G",
        "J",
        "L",
        "M",
        "Z",
      ];
      darkBackgroundLines.forEach((line) => {
        expect(getLineTextColor(line)).toBe("#FFFFFF");
      });
    });
  });

  describe("isADivision", () => {
    it("returns true for A Division lines", () => {
      expect(isADivision("1")).toBe(true);
      expect(isADivision("7")).toBe(true);
      expect(isADivision("S")).toBe(true);
    });

    it("returns false for B Division lines", () => {
      expect(isADivision("A")).toBe(false);
      expect(isADivision("L")).toBe(false);
      expect(isADivision("G")).toBe(false);
    });

    it("returns false for invalid lines", () => {
      expect(isADivision("X")).toBe(false);
      expect(isADivision("")).toBe(false);
    });
  });

  describe("isBDivision", () => {
    it("returns true for B Division lines", () => {
      expect(isBDivision("A")).toBe(true);
      expect(isBDivision("L")).toBe(true);
      expect(isBDivision("G")).toBe(true);
    });

    it("returns false for A Division lines", () => {
      expect(isBDivision("1")).toBe(false);
      expect(isBDivision("7")).toBe(false);
      expect(isBDivision("S")).toBe(false);
    });

    it("returns false for invalid lines", () => {
      expect(isBDivision("X")).toBe(false);
      expect(isBDivision("")).toBe(false);
    });
  });

  describe("getAllLineIds", () => {
    it("returns all line IDs", () => {
      const lineIds = getAllLineIds();

      expect(lineIds).toContain("1");
      expect(lineIds).toContain("A");
      expect(lineIds).toContain("L");
      expect(lineIds).toContain("SIR");
    });

    it("has at least 20 lines", () => {
      const lineIds = getAllLineIds();
      expect(lineIds.length).toBeGreaterThanOrEqual(20);
    });

    it("returns unique line IDs", () => {
      const lineIds = getAllLineIds();
      const uniqueIds = new Set(lineIds);
      expect(uniqueIds.size).toBe(lineIds.length);
    });
  });

  describe("getLinesByColorFamily", () => {
    it("groups lines by color", () => {
      const families = getLinesByColorFamily();

      // Red family (1, 2, 3)
      const redLines = families["#E12821"];
      expect(redLines).toContain("1");
      expect(redLines).toContain("2");
      expect(redLines).toContain("3");

      // Blue family (A, C, E)
      const blueLines = families["#0039A6"];
      expect(blueLines).toContain("A");
      expect(blueLines).toContain("C");
      expect(blueLines).toContain("E");
    });

    it("returns valid color family objects", () => {
      const families = getLinesByColorFamily();

      Object.entries(families).forEach(([color, lines]) => {
        // Color should be valid hex
        expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);

        // Lines should be an array
        expect(Array.isArray(lines)).toBe(true);

        // Each line should exist in metadata
        lines.forEach((line) => {
          expect(LINE_METADATA[line]).toBeDefined();
          expect(LINE_METADATA[line].color).toBe(color);
        });
      });
    });

    it("has multiple color families", () => {
      const families = getLinesByColorFamily();
      const familyCount = Object.keys(families).length;

      // Should have at least 10 different color families
      expect(familyCount).toBeGreaterThanOrEqual(10);
    });

    it("handles special cases correctly", () => {
      const families = getLinesByColorFamily();

      // S and GS should be in the same color family (gray)
      const grayLines = families["#737476"];
      expect(grayLines).toContain("S");
      expect(grayLines).toContain("GS");

      // N, Q, R, W should be in the same color family (yellow)
      const yellowLines = families["#FCCC0A"];
      expect(yellowLines).toContain("N");
      expect(yellowLines).toContain("Q");
      expect(yellowLines).toContain("R");
      expect(yellowLines).toContain("W");
    });
  });

  describe("edge cases", () => {
    it("handles case-sensitive line IDs", () => {
      expect(getLineMetadata("a")).toBeUndefined(); // lowercase should not match
      expect(getLineMetadata("A")).toBeDefined(); // uppercase should match
    });

    it("handles shuttle lines correctly", () => {
      expect(getLineMetadata("S")?.division).toBe("A");
      expect(getLineMetadata("GS")?.division).toBe("A");
      expect(getLineMetadata("FS")?.division).toBe("B");
      expect(getLineMetadata("H")?.division).toBe("B");
    });

    it("handles SIR correctly", () => {
      const sirMeta = getLineMetadata("SIR");
      expect(sirMeta).toBeDefined();
      expect(sirMeta?.division).toBe("B");
      expect(sirMeta?.feedId).toBe("gtfs-si");
    });
  });
});
