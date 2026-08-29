/**
 * Unit tests for filesystem directory existence checks
 */

import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("filesystem directory existence", () => {
  const testDir = join(process.cwd(), "test-temp-directory");

  beforeEach(() => {
    // Clean up test directory before each test
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("existsSync", () => {
    it("returns false for non-existent directory", () => {
      expect(existsSync(testDir)).toBe(false);
    });

    it("returns true for existing directory", () => {
      mkdirSync(testDir, { recursive: true });
      expect(existsSync(testDir)).toBe(true);
    });

    it("returns false after directory deletion", () => {
      mkdirSync(testDir, { recursive: true });
      expect(existsSync(testDir)).toBe(true);

      rmSync(testDir, { recursive: true, force: true });
      expect(existsSync(testDir)).toBe(false);
    });
  });

  describe("mkdirSync", () => {
    it("creates a single directory", () => {
      mkdirSync(testDir);
      expect(existsSync(testDir)).toBe(true);
    });

    it("creates nested directories with recursive option", () => {
      const nestedDir = join(testDir, "level1", "level2", "level3");
      mkdirSync(nestedDir, { recursive: true });
      expect(existsSync(nestedDir)).toBe(true);
    });

    it("handles existing directory gracefully", () => {
      mkdirSync(testDir);
      expect(() => mkdirSync(testDir, { recursive: true })).not.toThrow();
    });
  });

  describe("readdirSync", () => {
    it("returns empty array for empty directory", () => {
      mkdirSync(testDir);
      const contents = readdirSync(testDir);
      expect(contents).toEqual([]);
    });

    it("lists directory contents", () => {
      mkdirSync(testDir);
      mkdirSync(join(testDir, "subdir1"));
      mkdirSync(join(testDir, "subdir2"));

      const contents = readdirSync(testDir);
      expect(contents).toHaveLength(2);
      expect(contents).toContain("subdir1");
      expect(contents).toContain("subdir2");
    });

    it("throws for non-existent directory", () => {
      expect(() => readdirSync(testDir)).toThrow();
    });
  });

  describe("rmSync", () => {
    it("removes empty directory", () => {
      mkdirSync(testDir);
      expect(existsSync(testDir)).toBe(true);

      rmSync(testDir, { recursive: true });
      expect(existsSync(testDir)).toBe(false);
    });

    it("removes nested directories with recursive option", () => {
      const nestedDir = join(testDir, "level1", "level2");
      mkdirSync(nestedDir, { recursive: true });

      rmSync(testDir, { recursive: true });
      expect(existsSync(testDir)).toBe(false);
    });

    it("does not throw with force option for non-existent directory", () => {
      expect(() => rmSync(testDir, { force: true })).not.toThrow();
    });
  });

  describe("project root directory", () => {
    it("verifies project root exists", () => {
      const projectRoot = process.cwd();
      expect(existsSync(projectRoot)).toBe(true);
    });

    it("verifies packages directory exists", () => {
      const packagesDir = join(process.cwd(), "packages");
      expect(existsSync(packagesDir)).toBe(true);
    });

    it("verifies server package directory exists", () => {
      const serverDir = join(process.cwd(), "packages", "server");
      expect(existsSync(serverDir)).toBe(true);
    });

    it("verifies src directory exists", () => {
      const srcDir = join(process.cwd(), "packages", "server", "src");
      expect(existsSync(srcDir)).toBe(true);
    });
  });

  describe("home directory resolution", () => {
    const homeDir = process.env.HOME || process.env.USERPROFILE;

    it("verifies home directory environment variable is set", () => {
      expect(homeDir).toBeDefined();
      expect(typeof homeDir).toBe("string");
      expect(homeDir?.length).toBeGreaterThan(0);
    });

    it("verifies home directory exists", () => {
      expect(homeDir).toBeDefined();
      if (homeDir) {
        expect(existsSync(homeDir)).toBe(true);
      }
    });

    it("verifies home directory is readable", () => {
      expect(homeDir).toBeDefined();
      if (homeDir && existsSync(homeDir)) {
        expect(() => readdirSync(homeDir)).not.toThrow();
      }
    });

    it("resolves home directory path consistently", () => {
      expect(homeDir).toBeDefined();
      if (homeDir) {
        // Test that we can construct paths relative to home directory
        const testPath = join(homeDir, ".test-path-resolution");
        expect(testPath).toContain(homeDir);
        expect(testPath.endsWith(".test-path-resolution")).toBe(true);
      }
    });

    it("handles home directory edge cases", () => {
      expect(homeDir).toBeDefined();
      if (homeDir) {
        // Test that home directory doesn't have trailing slashes
        expect(homeDir.endsWith("/")).toBe(false);
        expect(homeDir.endsWith("\\")).toBe(false);

        // Test that home directory is an absolute path (Unix or Windows)
        const isUnixPath = homeDir.startsWith("/");
        const isWindowsPath = /^[A-Z]:/.test(homeDir);
        expect(isUnixPath || isWindowsPath).toBe(true);
      }
    });
  });
});
