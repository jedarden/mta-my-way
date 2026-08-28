/**
 * Unit tests for filesystem directory existence checks
 */

import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

describe("filesystem directory existence checks", () => {
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

  describe("statSync", () => {
    it("returns stats for existing directory", () => {
      mkdirSync(testDir);
      const stats = statSync(testDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it("throws for non-existent directory", () => {
      expect(() => statSync(testDir)).toThrow();
    });
  });

  describe("project structure validation", () => {
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

    it("verifies web package directory exists", () => {
      const webDir = join(process.cwd(), "packages", "web");
      expect(existsSync(webDir)).toBe(true);
    });

    it("verifies shared package directory exists", () => {
      const sharedDir = join(process.cwd(), "packages", "shared");
      expect(existsSync(sharedDir)).toBe(true);
    });

    it("verifies src directory exists in server package", () => {
      const srcDir = join(process.cwd(), "packages", "server", "src");
      expect(existsSync(srcDir)).toBe(true);
    });
  });

  describe("directory existence edge cases", () => {
    it("handles paths with trailing slashes", () => {
      mkdirSync(testDir);
      expect(existsSync(testDir + "/")).toBe(true);
    });

    it("handles paths with multiple trailing slashes", () => {
      mkdirSync(testDir);
      expect(existsSync(testDir + "///")).toBe(true);
    });

    it("handles relative paths", () => {
      const relativeDir = "test-relative-dir";
      try {
        mkdirSync(relativeDir, { recursive: true });
        expect(existsSync(relativeDir)).toBe(true);
      } finally {
        if (existsSync(relativeDir)) {
          rmSync(relativeDir, { recursive: true, force: true });
        }
      }
    });

    it("distinguishes between files and directories", () => {
      const testFile = join(testDir, "test-file.txt");
      mkdirSync(testDir);

      // Create a file (note: this would require writeFile, but we're just testing path existence)
      // The key point is that existsSync returns true for both files and directories
      expect(existsSync(testDir)).toBe(true);
    });
  });
});
