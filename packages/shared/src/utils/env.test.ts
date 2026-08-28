/**
 * Unit tests for environment variable parsing utilities
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type ShellEnvResult, parseEnvBool, readShellEnv } from "./env.js";

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

      it("returns false for undefined (unset env var)", () => {
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

      it("returns false for random strings", () => {
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

  describe("readShellEnv", () => {
    const originalShell = process.env.SHELL;

    afterEach(() => {
      // Restore original SHELL value after each test
      if (originalShell !== undefined) {
        process.env.SHELL = originalShell;
      } else {
        delete process.env.SHELL;
      }
    });

    describe("when SHELL is set to valid paths", () => {
      it("reads /bin/bash successfully", () => {
        process.env.SHELL = "/bin/bash";
        const result = readShellEnv();

        expect(result.exists).toBe(true);
        expect(result.value).toBe("/bin/bash");
        expect(result.isValid).toBe(true);
        expect(result.shellName).toBe("bash");
      });

      it("reads /usr/bin/zsh successfully", () => {
        process.env.SHELL = "/usr/bin/zsh";
        const result = readShellEnv();

        expect(result.exists).toBe(true);
        expect(result.value).toBe("/usr/bin/zsh");
        expect(result.isValid).toBe(true);
        expect(result.shellName).toBe("zsh");
      });

      it("reads /usr/local/bin/fish successfully", () => {
        process.env.SHELL = "/usr/local/bin/fish";
        const result = readShellEnv();

        expect(result.exists).toBe(true);
        expect(result.value).toBe("/usr/local/bin/fish");
        expect(result.isValid).toBe(true);
        expect(result.shellName).toBe("fish");
      });

      it("reads /run/current-system/sw/bin/bash (NixOS path)", () => {
        process.env.SHELL = "/run/current-system/sw/bin/bash";
        const result = readShellEnv();

        expect(result.exists).toBe(true);
        expect(result.value).toBe("/run/current-system/sw/bin/bash");
        expect(result.isValid).toBe(true);
        expect(result.shellName).toBe("bash");
      });

      it("handles paths with multiple directories", () => {
        process.env.SHELL = "/usr/local/custom/shells/myshell";
        const result = readShellEnv();

        expect(result.exists).toBe(true);
        expect(result.value).toBe("/usr/local/custom/shells/myshell");
        expect(result.isValid).toBe(true);
        expect(result.shellName).toBe("myshell");
      });
    });

    describe("when SHELL is unset or empty", () => {
      it("returns not exists when SHELL is undefined", () => {
        delete process.env.SHELL;
        const result = readShellEnv();

        expect(result.exists).toBe(false);
        expect(result.value).toBeUndefined();
        expect(result.isValid).toBe(false);
        expect(result.shellName).toBeUndefined();
      });

      it("returns not exists when SHELL is empty string", () => {
        process.env.SHELL = "";
        const result = readShellEnv();

        expect(result.exists).toBe(false);
        expect(result.value).toBe("");
        expect(result.isValid).toBe(false);
        expect(result.shellName).toBeUndefined();
      });

      it("returns not exists when SHELL is whitespace only", () => {
        process.env.SHELL = "   ";
        const result = readShellEnv();

        expect(result.exists).toBe(false);
        expect(result.value).toBe("   ");
        expect(result.isValid).toBe(false);
        expect(result.shellName).toBeUndefined();
      });
    });

    describe("when SHELL has invalid path formats", () => {
      it("marks as invalid when SHELL contains no slash", () => {
        process.env.SHELL = "bash";
        const result = readShellEnv();

        expect(result.exists).toBe(true);
        expect(result.value).toBe("bash");
        expect(result.isValid).toBe(false);
        expect(result.shellName).toBe("bash");
      });

      it("marks as invalid when SHELL is just a slash", () => {
        process.env.SHELL = "/";
        const result = readShellEnv();

        expect(result.exists).toBe(true);
        expect(result.value).toBe("/");
        expect(result.isValid).toBe(false);
        expect(result.shellName).toBeUndefined();
      });

      it("handles paths ending with slash", () => {
        process.env.SHELL = "/bin/bash/";
        const result = readShellEnv();

        expect(result.exists).toBe(true);
        expect(result.value).toBe("/bin/bash/");
        expect(result.isValid).toBe(true);
        expect(result.shellName).toBe("bash");
      });
    });

    describe("shell name extraction", () => {
      it("extracts bash from /bin/bash", () => {
        process.env.SHELL = "/bin/bash";
        expect(readShellEnv().shellName).toBe("bash");
      });

      it("extracts zsh from /usr/bin/zsh", () => {
        process.env.SHELL = "/usr/bin/zsh";
        expect(readShellEnv().shellName).toBe("zsh");
      });

      it("extracts fish from /usr/local/bin/fish", () => {
        process.env.SHELL = "/usr/local/bin/fish";
        expect(readShellEnv().shellName).toBe("fish");
      });

      it("extracts sh from /bin/sh", () => {
        process.env.SHELL = "/bin/sh";
        expect(readShellEnv().shellName).toBe("sh");
      });

      it("handles complex paths", () => {
        process.env.SHELL = "/nix/store/abcdef123456-bash/bin/bash";
        expect(readShellEnv().shellName).toBe("bash");
      });
    });
  });
});
