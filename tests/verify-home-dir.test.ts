import { execSync } from "node:child_process";
import { constants, access } from "node:fs/promises";
import { homedir } from "node:os";
import { describe, expect, it } from "vitest";

describe("Home Directory Accessibility", () => {
  it("should resolve home directory path", () => {
    const homePath = homedir();
    expect(homePath).toBeTruthy();
    expect(typeof homePath).toBe("string");
    expect(homePath.length).toBeGreaterThan(0);
  });

  it("should verify home directory exists and is readable", async () => {
    const homePath = homedir();

    try {
      await access(homePath, constants.R_OK | constants.X_OK);
      expect(true).toBe(true);
    } catch (error) {
      throw new Error(`Home directory ${homePath} is not accessible: ${error}`);
    }
  });

  it("should verify home directory is writable", async () => {
    const homePath = homedir();

    try {
      await access(homePath, constants.W_OK);
      expect(true).toBe(true);
    } catch (error) {
      throw new Error(`Home directory ${homePath} is not writable: ${error}`);
    }
  });

  describe("Shell expansion tests", () => {
    it("should execute echo ~ and capture output", () => {
      const output = execSync("echo ~", { encoding: "utf-8" }).trim();
      expect(output).toBeTruthy();
      expect(typeof output).toBe("string");
    });

    it("should verify echo ~ output is a valid absolute path", () => {
      const output = execSync("echo ~", { encoding: "utf-8" }).trim();

      // Should start with / (Unix absolute path)
      expect(output.startsWith("/")).toBe(true);

      // Should not be empty
      expect(output.length).toBeGreaterThan(0);

      // Should not contain spaces (valid path)
      expect(output.match(/\s/)).toBeNull();
    });

    it("should verify echo ~ output matches Node.js homedir()", () => {
      const shellHome = execSync("echo ~", { encoding: "utf-8" }).trim();
      const nodeHome = homedir();

      expect(shellHome).toBe(nodeHome);
    });

    it("should verify echo ~ output is accessible", async () => {
      const homePath = execSync("echo ~", { encoding: "utf-8" }).trim();

      try {
        await access(homePath, constants.R_OK | constants.X_OK);
        expect(true).toBe(true);
      } catch (error) {
        throw new Error(
          `Home directory from shell expansion ${homePath} is not accessible: ${error}`
        );
      }
    });
  });

  describe("Home directory consistency and validation", () => {
    it("should return consistent home directory across multiple calls", () => {
      const home1 = homedir();
      const home2 = homedir();
      const home3 = homedir();

      expect(home1).toBe(home2);
      expect(home2).toBe(home3);
      expect(home1).toBe(home3);
    });

    it("should resolve home directory and verify basic properties", () => {
      const homePath = homedir();

      // Test function: verify home directory resolution
      expect(homePath).toBeDefined();
      expect(typeof homePath).toBe("string");
      expect(homePath.length).toBeGreaterThan(0);

      // Should be absolute path
      expect(homePath.startsWith("/")).toBe(true);

      // Should not contain null bytes
      expect(homePath).not.toContain("\0");

      // Should be a valid path format
      expect(homePath).toMatch(/^\/[a-zA-Z0-9\/_-]*$/);
    });

    it("should verify home directory path structure", () => {
      const homePath = homedir();

      // Should be an absolute path
      expect(homePath.startsWith("/")).toBe(true);

      // Should not end with slash (except root)
      if (homePath !== "/") {
        expect(homePath.endsWith("/")).toBe(false);
      }

      // Should not contain consecutive slashes
      expect(homePath).not.toMatch("//");

      // Should not contain backslashes (Unix path)
      expect(homePath).not.toContain("\\");
    });

    it("should verify home directory environment variables consistency", () => {
      const homePath = homedir();
      const envHome = process.env.HOME;

      if (envHome) {
        expect(homePath).toBe(envHome);
      }
    });

    it("should verify home directory contains expected subdirectories", async () => {
      const homePath = homedir();
      const { readdir } = await import("node:fs/promises");

      try {
        const entries = await readdir(homePath, { withFileTypes: true });

        // Should have at least some entries
        expect(entries.length).toBeGreaterThan(0);

        // Common home directory entries that might exist
        const entryNames = entries.map((entry) => entry.name);

        // At minimum, home directory should be readable and listable
        expect(entries).toBeDefined();
        expect(Array.isArray(entries)).toBe(true);
      } catch (error) {
        throw new Error(`Failed to read home directory ${homePath}: ${error}`);
      }
    });
  });
});
