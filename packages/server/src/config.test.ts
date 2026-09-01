/**
 * Tests for environment configuration parsing
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  CORE_ONLY,
  SHELL,
  getShellEnv,
  hasShellEnv,
  isCoreOnlyMode,
  parseBooleanEnv,
} from "./config.js";

describe("config", () => {
  beforeEach(() => {
    // Reset environment before each test
    delete process.env["CORE_ONLY"];
    delete process.env["SHELL"];
  });

  describe("parseBooleanEnv", () => {
    it("should parse 'true' as truthy", () => {
      expect(parseBooleanEnv("true")).toBe(true);
      expect(parseBooleanEnv("TRUE")).toBe(true);
      expect(parseBooleanEnv("True")).toBe(true);
      expect(parseBooleanEnv("TrUe")).toBe(true);
    });

    it("should parse '1' as truthy", () => {
      expect(parseBooleanEnv("1")).toBe(true);
    });

    it("should parse 'false' as falsy", () => {
      expect(parseBooleanEnv("false")).toBe(false);
      expect(parseBooleanEnv("FALSE")).toBe(false);
      expect(parseBooleanEnv("False")).toBe(false);
      expect(parseBooleanEnv("FaLsE")).toBe(false);
    });

    it("should parse '0' as falsy", () => {
      expect(parseBooleanEnv("0")).toBe(false);
    });

    it("should return default value for undefined", () => {
      expect(parseBooleanEnv(undefined, false)).toBe(false);
      expect(parseBooleanEnv(undefined, true)).toBe(true);
    });

    it("should return default value for empty string", () => {
      expect(parseBooleanEnv("", false)).toBe(false);
      expect(parseBooleanEnv("", true)).toBe(true);
    });

    it("should trim whitespace", () => {
      expect(parseBooleanEnv(" true ")).toBe(true);
      expect(parseBooleanEnv(" false ")).toBe(false);
    });

    it("should return default for unknown values", () => {
      expect(parseBooleanEnv("yes", false)).toBe(false);
      expect(parseBooleanEnv("no", false)).toBe(false);
      expect(parseBooleanEnv("invalid", false)).toBe(false);
    });
  });

  describe("isCoreOnlyMode", () => {
    it("should return false when CORE_ONLY is unset", () => {
      expect(isCoreOnlyMode()).toBe(false);
    });

    it("should return true when CORE_ONLY='true'", () => {
      process.env["CORE_ONLY"] = "true";
      expect(isCoreOnlyMode()).toBe(true);
    });

    it("should return true when CORE_ONLY='TRUE'", () => {
      process.env["CORE_ONLY"] = "TRUE";
      expect(isCoreOnlyMode()).toBe(true);
    });

    it("should return true when CORE_ONLY='1'", () => {
      process.env["CORE_ONLY"] = "1";
      expect(isCoreOnlyMode()).toBe(true);
    });

    it("should return false when CORE_ONLY='false'", () => {
      process.env["CORE_ONLY"] = "false";
      expect(isCoreOnlyMode()).toBe(false);
    });

    it("should return false when CORE_ONLY='0'", () => {
      process.env["CORE_ONLY"] = "0";
      expect(isCoreOnlyMode()).toBe(false);
    });
  });

  describe("CORE_ONLY constant", () => {
    it("should export parsed value", () => {
      // The constant is evaluated at module load time
      expect(typeof CORE_ONLY).toBe("boolean");
    });
  });

  describe("getShellEnv", () => {
    it("should return SHELL value when set", () => {
      const originalShell = process.env["SHELL"];
      process.env["SHELL"] = "/bin/bash";
      expect(getShellEnv()).toBe("/bin/bash");
      // Restore original value
      if (originalShell !== undefined) {
        process.env["SHELL"] = originalShell;
      } else {
        delete process.env["SHELL"];
      }
    });

    it("should return default value when SHELL is unset", () => {
      const originalShell = process.env["SHELL"];
      delete process.env["SHELL"];
      expect(getShellEnv()).toBe("/bin/sh");
      // Restore original value
      if (originalShell !== undefined) {
        process.env["SHELL"] = originalShell;
      }
    });

    it("should return custom default value when SHELL is unset", () => {
      const originalShell = process.env["SHELL"];
      delete process.env["SHELL"];
      expect(getShellEnv("/usr/bin/zsh")).toBe("/usr/bin/zsh");
      // Restore original value
      if (originalShell !== undefined) {
        process.env["SHELL"] = originalShell;
      }
    });

    it("should return default value when SHELL is empty string", () => {
      const originalShell = process.env["SHELL"];
      process.env["SHELL"] = "";
      expect(getShellEnv()).toBe("/bin/sh");
      // Restore original value
      if (originalShell !== undefined) {
        process.env["SHELL"] = originalShell;
      } else {
        delete process.env["SHELL"];
      }
    });

    it("should return actual SHELL value for common shells", () => {
      const testShells = [
        "/bin/bash",
        "/bin/zsh",
        "/bin/sh",
        "/usr/bin/zsh",
        "/usr/local/bin/bash",
        "/bin/fish",
      ];

      for (const shell of testShells) {
        process.env["SHELL"] = shell;
        expect(getShellEnv()).toBe(shell);
      }
    });
  });

  describe("hasShellEnv", () => {
    it("should return false when SHELL is unset", () => {
      const originalShell = process.env["SHELL"];
      delete process.env["SHELL"];
      expect(hasShellEnv()).toBe(false);
      // Restore original value
      if (originalShell !== undefined) {
        process.env["SHELL"] = originalShell;
      }
    });

    it("should return false when SHELL is empty string", () => {
      const originalShell = process.env["SHELL"];
      process.env["SHELL"] = "";
      expect(hasShellEnv()).toBe(false);
      // Restore original value
      if (originalShell !== undefined) {
        process.env["SHELL"] = originalShell;
      } else {
        delete process.env["SHELL"];
      }
    });

    it("should return true when SHELL is set", () => {
      const originalShell = process.env["SHELL"];
      process.env["SHELL"] = "/bin/bash";
      expect(hasShellEnv()).toBe(true);
      // Restore original value
      if (originalShell !== undefined) {
        process.env["SHELL"] = originalShell;
      } else {
        delete process.env["SHELL"];
      }
    });

    it("should return true for various shell paths", () => {
      const testShells = [
        "/bin/bash",
        "/bin/zsh",
        "/bin/sh",
        "/usr/bin/zsh",
        "/usr/local/bin/bash",
        "/bin/fish",
      ];
      const originalShell = process.env["SHELL"];

      for (const shell of testShells) {
        process.env["SHELL"] = shell;
        expect(hasShellEnv()).toBe(true);
      }

      // Restore original value
      if (originalShell !== undefined) {
        process.env["SHELL"] = originalShell;
      } else {
        delete process.env["SHELL"];
      }
    });
  });

  describe("SHELL constant", () => {
    it("should export parsed value", () => {
      // The constant is evaluated at module load time
      expect(typeof SHELL).toBe("string");
    });

    it("should export a non-empty string or default", () => {
      // SHELL constant will be the actual shell or the default "/bin/sh"
      expect(SHELL.length).toBeGreaterThan(0);
    });
  });
});
