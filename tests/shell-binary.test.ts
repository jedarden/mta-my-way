/**
 * Unit tests for shell binary availability and functionality
 * Verifies that required shell binaries (bash, sh) are available on the system
 */

import { execSync } from "node:child_process";
import { constants, access } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Shell Binary Availability", () => {
  describe("bash availability", () => {
    it("should locate bash binary using which", () => {
      const bashPath = execSync("which bash", { encoding: "utf-8" }).trim();
      expect(bashPath).toBeTruthy();
      expect(bashPath.length).toBeGreaterThan(0);
      expect(bashPath.startsWith("/")).toBe(true);
    });

    it("should verify bash binary is executable", async () => {
      const bashPath = execSync("which bash", { encoding: "utf-8" }).trim();
      await access(bashPath, constants.X_OK);
      expect(true).toBe(true);
    });

    it("should verify bash is functional and returns version", () => {
      const version = execSync("bash --version", { encoding: "utf-8" });
      expect(version).toContain("GNU bash");
      expect(version).toContain("Free Software Foundation");
    });
  });

  describe("sh availability", () => {
    it("should locate sh binary using which", () => {
      const shPath = execSync("which sh", { encoding: "utf-8" }).trim();
      expect(shPath).toBeTruthy();
      expect(shPath.length).toBeGreaterThan(0);
      expect(shPath.startsWith("/")).toBe(true);
    });

    it("should verify sh binary is executable", async () => {
      const shPath = execSync("which sh", { encoding: "utf-8" }).trim();
      await access(shPath, constants.X_OK);
      expect(true).toBe(true);
    });

    it("should verify sh is functional and returns version", () => {
      const version = execSync("sh --version", { encoding: "utf-8" });
      expect(version).toContain("GNU bash");
      expect(version).toContain("Free Software Foundation");
    });
  });

  describe("shell binary path validation", () => {
    it("should verify bash path is valid absolute path", () => {
      const bashPath = execSync("which bash", { encoding: "utf-8" }).trim();

      // Should be absolute path
      expect(bashPath.startsWith("/")).toBe(true);

      // Should not contain null bytes
      expect(bashPath).not.toContain("\0");

      // Should end with 'bash'
      expect(bashPath.endsWith("bash")).toBe(true);
    });

    it("should verify sh path is valid absolute path", () => {
      const shPath = execSync("which sh", { encoding: "utf-8" }).trim();

      // Should be absolute path
      expect(shPath.startsWith("/")).toBe(true);

      // Should not contain null bytes
      expect(shPath).not.toContain("\0");

      // Should end with 'sh'
      expect(shPath.endsWith("sh")).toBe(true);
    });

    it("should provide confirmed shell binary locations for test execution", () => {
      const bashPath = execSync("which bash", { encoding: "utf-8" }).trim();
      const shPath = execSync("which sh", { encoding: "utf-8" }).trim();

      // Both paths should be valid
      expect(bashPath).toMatch(/^\/[a-zA-Z0-9\/_-]+bash$/);
      expect(shPath).toMatch(/^\/[a-zA-Z0-9\/_-]+sh$/);

      // Paths should be different (bash vs sh)
      expect(bashPath).not.toBe(shPath);
    });
  });

  describe("shell execution capability", () => {
    it("should execute bash -c echo successfully", () => {
      const output = execSync("bash -c 'printf test'", { encoding: "utf-8" }).trim();
      expect(output).toBe("test");
    });

    it("should execute sh -c echo successfully", () => {
      const output = execSync("sh -c 'printf test'", { encoding: "utf-8" }).trim();
      expect(output).toBe("test");
    });

    it("should execute commands with environment variables via bash", () => {
      const output = execSync("bash -c 'printf $HOME'", { encoding: "utf-8" }).trim();
      expect(output).toBeTruthy();
      expect(output.length).toBeGreaterThan(0);
      expect(output.startsWith("/")).toBe(true);
    });
  });
});
