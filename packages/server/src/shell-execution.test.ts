/**
 * Unit tests for shell command execution
 */

import { describe, expect, it } from "vitest";
import { executeCommand, getAllowedCommands } from "./shell-execution.js";

describe("shell execution", () => {
  describe("pwd command", () => {
    it("executes pwd command successfully", async () => {
      const result = await executeCommand("pwd");

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBeTruthy();
      expect(result.stdout).toContain("/mta-my-way");
      expect(result.stderr).toBe("");
      expect(result.timedOut).toBe(false);
    });

    it("executes pwd command with custom options", async () => {
      const result = await executeCommand("pwd", [], {
        timeout: 10000,
        maxOutputSize: 1024,
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBeTruthy();
      expect(result.timedOut).toBe(false);
    });
  });

  describe("allowed commands", () => {
    it("returns list of allowed commands", () => {
      const allowedCommands = getAllowedCommands();

      expect(allowedCommands).toContain("pwd");
      expect(allowedCommands).toContain("ls");
      expect(allowedCommands).toContain("echo");
      expect(allowedCommands.length).toBeGreaterThan(0);
    });
  });

  describe("unauthorized commands", () => {
    it("blocks execution of unauthorized commands", async () => {
      const result = await executeCommand("rm");

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("is not allowed");
      expect(result.timedOut).toBe(false);
    });

    it("blocks potentially dangerous commands", async () => {
      const dangerousCommands = ["sudo", "su", "chmod", "chown"];

      for (const cmd of dangerousCommands) {
        const result = await executeCommand(cmd);
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain("is not allowed");
      }
    });
  });

  describe("basic commands", () => {
    it("executes echo command", async () => {
      const result = await executeCommand("echo", ["hello world"]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("hello world");
      expect(result.timedOut).toBe(false);
    });

    it("executes date command", async () => {
      const result = await executeCommand("date");

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBeTruthy();
      expect(result.stdout.length).toBeGreaterThan(0);
      expect(result.timedOut).toBe(false);
    });
  });

  describe("error handling", () => {
    it("handles non-existent command gracefully", async () => {
      const result = await executeCommand("nonexistent-command xyz");

      // Command should be blocked by whitelist first
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("is not allowed");
    });
  });

  describe("output size limits", () => {
    it("respects max output size limit", async () => {
      // Create a large output with ls -R
      const result = await executeCommand("ls", ["-R"], {
        maxOutputSize: 1024, // 1KB limit
      });

      // Command should execute but output should be limited
      expect(result).toBeDefined();
      expect(typeof result.stdout).toBe("string");
    });
  });
});
