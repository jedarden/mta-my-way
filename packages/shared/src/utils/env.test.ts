/**
 * Unit tests for environment variable parsing utilities
 */

import { describe, expect, it } from "vitest";
import { parseEnvBool } from "./env.js";

describe("env utilities", () => {
  describe("parseEnvBool", () => {
    describe("truthy values", () => {
      it('returns true for "true"', () => {
        expect(parseEnvBool("true")).toBe(true);
      });

      it('returns true for "TRUE" (uppercase)', () => {
        expect(parseEnvBool("TRUE")).toBe(true);
      });

      it('returns true for "True" (mixed case)', () => {
        expect(parseEnvBool("True")).toBe(true);
      });

      it('returns true for "tRuE" (mixed case)', () => {
        expect(parseEnvBool("tRuE")).toBe(true);
      });

      it('returns true for "1"', () => {
        expect(parseEnvBool("1")).toBe(true);
      });

      it('returns true for "true" with whitespace', () => {
        expect(parseEnvBool(" true ")).toBe(true);
      });

      it('returns true for "TRUE" with whitespace', () => {
        expect(parseEnvBool("  TRUE  ")).toBe(true);
      });
    });

    describe("falsy values", () => {
      it('returns false for "false"', () => {
        expect(parseEnvBool("false")).toBe(false);
      });

      it('returns false for "FALSE" (uppercase)', () => {
        expect(parseEnvBool("FALSE")).toBe(false);
      });

      it('returns false for "False" (mixed case)', () => {
        expect(parseEnvBool("False")).toBe(false);
      });

      it('returns false for "0"', () => {
        expect(parseEnvBool("0")).toBe(false);
      });

      it('returns false for "" (empty string)', () => {
        expect(parseEnvBool("")).toBe(false);
      });

      it('returns false for undefined (unset env var)', () => {
        expect(parseEnvBool(undefined)).toBe(false);
      });

      it('returns false for "   " (whitespace only)', () => {
        expect(parseEnvBool("   ")).toBe(false);
      });
    });

    describe("edge cases and invalid values", () => {
      it('returns false for "yes"', () => {
        expect(parseEnvBool("yes")).toBe(false);
      });

      it('returns false for "no"', () => {
        expect(parseEnvBool("no")).toBe(false);
      });

      it('returns false for "on"', () => {
        expect(parseEnvBool("on")).toBe(false);
      });

      it('returns false for "off"', () => {
        expect(parseEnvBool("off")).toBe(false);
      });

      it('returns false for "2" (numbers other than 0 and 1)', () => {
        expect(parseEnvBool("2")).toBe(false);
      });

      it('returns false for "-1"', () => {
        expect(parseEnvBool("-1")).toBe(false);
      });

      it('returns false for random strings', () => {
        expect(parseEnvBool("foobar")).toBe(false);
      });

      it('returns false for "enabled"', () => {
        expect(parseEnvBool("enabled")).toBe(false);
      });

      it('returns false for "disabled"', () => {
        expect(parseEnvBool("disabled")).toBe(false);
      });
    });
  });
});
