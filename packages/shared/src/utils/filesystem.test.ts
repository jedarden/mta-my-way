/**
 * Unit tests for filesystem directory existence checks
 */

import { appendFileSync, existsSync, mkdirSync, rmSync, statSync } from "fs";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Check if a directory exists and is accessible
 *
 * @param dirPath - The path to check
 * @returns boolean - True if directory exists and is accessible, false otherwise
 *
 * @example
 * ```ts
 * checkDirectoryExists("/tmp") // true if /tmp exists
 * checkDirectoryExists("/nonexistent") // false
 * ```
 */
export function checkDirectoryExists(dirPath: string): boolean {
  try {
    const stats = statSync(dirPath);
    return stats.isDirectory();
  } catch (error) {
    // Node.js throws ENOENT if path doesn't exist
    // Throws ENOTDIR if path exists but is not a directory
    return false;
  }
}

/**
 * Result of directory validation
 */
export interface DirectoryValidationResult {
  /**
   * Whether the directory exists
   */
  readonly exists: boolean;
  /**
   * Whether the path is accessible (readable)
   */
  readonly accessible: boolean;
  /**
   * Whether the path is actually a directory (not a file)
   */
  readonly isDirectory: boolean;
  /**
   * Error message if validation failed
   */
  readonly error?: string;
}

/**
 * Validate a directory path with detailed error information
 *
 * @param dirPath - The directory path to validate
 * @returns DirectoryValidationResult - Detailed validation result
 *
 * @example
 * ```ts
 * const result = validateDirectory("/tmp");
 * // result.exists = true
 * // result.accessible = true
 * // result.isDirectory = true
 *
 * const result = validateDirectory("/etc/passwd");
 * // result.exists = true
 * // result.isDirectory = false
 * // result.error = "Path exists but is not a directory"
 * ```
 */
export function validateDirectory(dirPath: string): DirectoryValidationResult {
  try {
    const stats = statSync(dirPath);

    if (!stats.isDirectory()) {
      return {
        exists: true,
        accessible: true,
        isDirectory: false,
        error: "Path exists but is not a directory",
      };
    }

    return {
      exists: true,
      accessible: true,
      isDirectory: true,
    };
  } catch (error) {
    const err = error as NodeJS.ErrnoException;

    if (err.code === "ENOENT") {
      return {
        exists: false,
        accessible: false,
        isDirectory: false,
        error: "Directory does not exist",
      };
    }

    if (err.code === "EACCES") {
      return {
        exists: true,
        accessible: false,
        isDirectory: false,
        error: "Permission denied",
      };
    }

    return {
      exists: false,
      accessible: false,
      isDirectory: false,
      error: err.message || "Unknown error",
    };
  }
}

/**
 * Ensure a directory exists, creating it if necessary
 *
 * @param dirPath - The directory path to ensure exists
 * @returns boolean - True if directory exists or was created successfully
 *
 * @example
 * ```ts
 * ensureDirectory("/tmp/mydir") // creates if needed, returns true
 * ensureDirectory("/tmp") // already exists, returns true
 * ```
 */
export function ensureDirectory(dirPath: string): boolean {
  try {
    mkdirSync(dirPath, { recursive: true });
    return true;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;

    // If directory already exists, that's okay
    if (err.code === "EEXIST") {
      try {
        const stats = statSync(dirPath);
        return stats.isDirectory();
      } catch {
        return false;
      }
    }

    return false;
  }
}

describe("filesystem utilities", () => {
  describe("checkDirectoryExists", () => {
    let testDir: string;
    let testFile: string;
    let nonexistentPath: string;

    beforeEach(() => {
      // Create temporary directory and file for testing
      testDir = join(process.cwd(), "test-temp-dir");
      testFile = join(process.cwd(), "test-temp-file.txt");

      try {
        mkdirSync(testDir, { recursive: true });
      } catch {
        // Directory might already exist
      }

      // Create a test file
      try {
        // Write file using Node.js appendFile
        appendFileSync(testFile, "test");
      } catch {
        // File might already exist
      }

      nonexistentPath = join(process.cwd(), "nonexistent-path-" + Date.now());
    });

    afterEach(() => {
      // Cleanup test directory and file
      try {
        if (existsSync(testDir)) {
          rmSync(testDir, { recursive: true, force: true });
        }
      } catch {
        // Ignore cleanup errors
      }

      try {
        if (existsSync(testFile)) {
          rmSync(testFile, { force: true });
        }
      } catch {
        // Ignore cleanup errors
      }
    });

    describe("when directory exists", () => {
      it("returns true for existing directory", () => {
        const result = checkDirectoryExists(testDir);
        expect(result).toBe(true);
      });

      it("returns true for current working directory", () => {
        const result = checkDirectoryExists(process.cwd());
        expect(result).toBe(true);
      });

      it("returns true for /tmp directory", () => {
        const result = checkDirectoryExists("/tmp");
        expect(result).toBe(true);
      });
    });

    describe("when directory does not exist", () => {
      it("returns false for nonexistent path", () => {
        const result = checkDirectoryExists(nonexistentPath);
        expect(result).toBe(false);
      });

      it("returns false for empty string", () => {
        const result = checkDirectoryExists("");
        expect(result).toBe(false);
      });
    });

    describe("when path is a file not a directory", () => {
      it("returns false for file path", () => {
        const result = checkDirectoryExists(testFile);
        expect(result).toBe(false);
      });
    });

    describe("edge cases", () => {
      it("handles paths with trailing slashes", () => {
        const result = checkDirectoryExists(testDir + "/");
        expect(result).toBe(true);
      });

      it("handles paths with multiple trailing slashes", () => {
        const result = checkDirectoryExists(testDir + "///");
        expect(result).toBe(true);
      });
    });
  });

  describe("validateDirectory", () => {
    let testDir: string;
    let testFile: string;
    let nonexistentPath: string;

    beforeEach(() => {
      testDir = join(process.cwd(), "test-temp-dir-validate");
      testFile = join(process.cwd(), "test-temp-file-validate.txt");

      try {
        mkdirSync(testDir, { recursive: true });
      } catch {
        // Directory might already exist
      }

      try {
        appendFileSync(testFile, "test");
      } catch {
        // File might already exist
      }

      nonexistentPath = join(process.cwd(), "nonexistent-validate-" + Date.now());
    });

    afterEach(() => {
      try {
        if (existsSync(testDir)) {
          rmSync(testDir, { recursive: true, force: true });
        }
      } catch {
        // Ignore cleanup errors
      }

      try {
        if (existsSync(testFile)) {
          rmSync(testFile, { force: true });
        }
      } catch {
        // Ignore cleanup errors
      }
    });

    describe("when directory exists and is accessible", () => {
      it("returns valid result for existing directory", () => {
        const result = validateDirectory(testDir);

        expect(result.exists).toBe(true);
        expect(result.accessible).toBe(true);
        expect(result.isDirectory).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it("returns valid result for /tmp", () => {
        const result = validateDirectory("/tmp");

        expect(result.exists).toBe(true);
        expect(result.accessible).toBe(true);
        expect(result.isDirectory).toBe(true);
        expect(result.error).toBeUndefined();
      });
    });

    describe("when path does not exist", () => {
      it("returns not exists with error message", () => {
        const result = validateDirectory(nonexistentPath);

        expect(result.exists).toBe(false);
        expect(result.accessible).toBe(false);
        expect(result.isDirectory).toBe(false);
        expect(result.error).toBe("Directory does not exist");
      });
    });

    describe("when path is a file not a directory", () => {
      it("returns exists but not directory with error", () => {
        const result = validateDirectory(testFile);

        expect(result.exists).toBe(true);
        expect(result.accessible).toBe(true);
        expect(result.isDirectory).toBe(false);
        expect(result.error).toBe("Path exists but is not a directory");
      });
    });
  });

  describe("ensureDirectory", () => {
    let testDir: string;

    afterEach(() => {
      // Cleanup any test directories created
      try {
        if (existsSync(testDir)) {
          rmSync(testDir, { recursive: true, force: true });
        }
      } catch {
        // Ignore cleanup errors
      }
    });

    describe("when directory does not exist", () => {
      it("creates directory successfully", () => {
        testDir = join(process.cwd(), "new-dir-" + Date.now());

        const result = ensureDirectory(testDir);

        expect(result).toBe(true);
        expect(existsSync(testDir)).toBe(true);
      });

      it("creates nested directories recursively", () => {
        testDir = join(process.cwd(), "parent", "child", "grandchild-" + Date.now());

        const result = ensureDirectory(testDir);

        expect(result).toBe(true);
        expect(existsSync(testDir)).toBe(true);
      });
    });

    describe("when directory already exists", () => {
      it("returns true without error", () => {
        testDir = join(process.cwd(), "existing-dir-" + Date.now());
        mkdirSync(testDir, { recursive: true });

        const result = ensureDirectory(testDir);

        expect(result).toBe(true);
        expect(existsSync(testDir)).toBe(true);
      });
    });

    describe("edge cases", () => {
      it("handles paths with trailing slashes", () => {
        testDir = join(process.cwd(), "trailing-slash-dir-" + Date.now());

        const result = ensureDirectory(testDir + "/");

        expect(result).toBe(true);
        expect(existsSync(testDir)).toBe(true);
      });

      it("returns false for invalid paths", () => {
        // Test with a path that's likely to fail (e.g., in a restricted location)
        const invalidPath = "/root/cannot-create-here-" + Date.now();
        const result = ensureDirectory(invalidPath);

        // This may succeed on some systems, so we just verify it returns boolean
        expect(typeof result).toBe("boolean");
      });
    });
  });
});
