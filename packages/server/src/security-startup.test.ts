/**
 * Unit tests for security startup validation
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validateSecurityConfiguration, validateSecurityOrThrow } from "./security-startup.js";

// Mock logger
vi.mock("./observability/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("security-startup", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore environment
    process.env = originalEnv;
  });

  describe("validateSecurityConfiguration", () => {
    describe("in test mode", () => {
      beforeEach(() => {
        process.env.TEST_MODE = "true";
      });

      it("should skip validation in test mode", () => {
        delete process.env.ALLOWED_HOSTS;
        delete process.env.PASSWORD_PEPPER;

        const result = validateSecurityConfiguration();

        expect(result.passed).toBe(true);
        expect(result.warnings).toHaveLength(0);
        expect(result.errors).toHaveLength(0);
      });
    });

    describe("in development mode", () => {
      beforeEach(() => {
        process.env.NODE_ENV = "development";
        process.env.TEST_MODE = "false";
      });

      it("should warn about missing ALLOWED_HOSTS", () => {
        delete process.env.ALLOWED_HOSTS;

        const result = validateSecurityConfiguration();

        expect(result.passed).toBe(true);
        expect(result.warnings.length).toBeGreaterThan(0);
        expect(result.warnings.some((w) => w.includes("ALLOWED_HOSTS"))).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it("should warn about short PASSWORD_PEPPER", () => {
        process.env.ALLOWED_HOSTS = "localhost";
        process.env.PASSWORD_PEPPER = "short";

        const result = validateSecurityConfiguration();

        expect(result.passed).toBe(true);
        expect(result.warnings.some((w) => w.includes("PASSWORD_PEPPER"))).toBe(true);
      });

      it("should warn about missing VAPID keys", () => {
        process.env.ALLOWED_HOSTS = "localhost";
        delete process.env.VAPID_PUBLIC_KEY;
        delete process.env.VAPID_PRIVATE_KEY;

        const result = validateSecurityConfiguration();

        expect(result.passed).toBe(true);
        expect(result.warnings.some((w) => w.includes("VAPID"))).toBe(true);
      });

      it("should pass with all security settings configured", () => {
        process.env.ALLOWED_HOSTS = "localhost,127.0.0.1";
        process.env.PASSWORD_PEPPER = "a".repeat(64);
        process.env.VAPID_PUBLIC_KEY = "public-key";
        process.env.VAPID_PRIVATE_KEY = "private-key";

        const result = validateSecurityConfiguration();

        expect(result.passed).toBe(true);
        expect(result.warnings).toHaveLength(0);
        expect(result.errors).toHaveLength(0);
      });

      it("should handle empty ALLOWED_HOSTS as missing", () => {
        process.env.ALLOWED_HOSTS = "";

        const result = validateSecurityConfiguration();

        expect(result.warnings.some((w) => w.includes("ALLOWED_HOSTS"))).toBe(true);
      });

      it("should handle whitespace-only ALLOWED_HOSTS as missing", () => {
        process.env.ALLOWED_HOSTS = "   ";

        const result = validateSecurityConfiguration();

        expect(result.warnings.some((w) => w.includes("ALLOWED_HOSTS"))).toBe(true);
      });
    });

    describe("in production mode", () => {
      beforeEach(() => {
        process.env.NODE_ENV = "production";
        process.env.TEST_MODE = "false";
      });

      it("should fail with missing ALLOWED_HOSTS", () => {
        delete process.env.ALLOWED_HOSTS;

        const result = validateSecurityConfiguration();

        expect(result.passed).toBe(false);
        expect(result.errors.some((e) => e.includes("ALLOWED_HOSTS"))).toBe(true);
      });

      it("should fail with empty ALLOWED_HOSTS", () => {
        process.env.ALLOWED_HOSTS = "";

        const result = validateSecurityConfiguration();

        expect(result.passed).toBe(false);
        expect(result.errors.some((e) => e.includes("ALLOWED_HOSTS"))).toBe(true);
      });

      it("should warn but not fail for missing PASSWORD_PEPPER", () => {
        process.env.ALLOWED_HOSTS = "example.com";
        delete process.env.PASSWORD_PEPPER;

        const result = validateSecurityConfiguration();

        expect(result.passed).toBe(true);
        expect(result.warnings.some((w) => w.includes("PASSWORD_PEPPER"))).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it("should warn for short PASSWORD_PEPPER", () => {
        process.env.ALLOWED_HOSTS = "example.com";
        process.env.PASSWORD_PEPPER = "too-short";

        const result = validateSecurityConfiguration();

        expect(result.passed).toBe(true);
        expect(result.warnings.some((w) => w.includes("PASSWORD_PEPPER"))).toBe(true);
      });

      it("should warn for PASSWORD_PEPPER under 32 bytes", () => {
        process.env.ALLOWED_HOSTS = "example.com";
        process.env.PASSWORD_PEPPER = "a".repeat(31);

        const result = validateSecurityConfiguration();

        expect(result.passed).toBe(true);
        expect(result.warnings.some((w) => w.includes("PASSWORD_PEPPER"))).toBe(true);
      });

      it("should pass with 64-char PASSWORD_PEPPER", () => {
        process.env.ALLOWED_HOSTS = "example.com";
        process.env.PASSWORD_PEPPER = "a".repeat(64);

        const result = validateSecurityConfiguration();

        expect(result.passed).toBe(true);
        expect(result.warnings.filter((w) => w.includes("PASSWORD_PEPPER"))).toHaveLength(0);
      });

      it("should warn but not fail for missing VAPID keys", () => {
        process.env.ALLOWED_HOSTS = "example.com";
        delete process.env.VAPID_PUBLIC_KEY;
        delete process.env.VAPID_PRIVATE_KEY;

        const result = validateSecurityConfiguration();

        expect(result.passed).toBe(true);
        expect(result.warnings.filter((w) => w.includes("VAPID")).length).toBeGreaterThanOrEqual(2);
      });

      it("should pass with all required security settings", () => {
        process.env.ALLOWED_HOSTS = "example.com,www.example.com";
        process.env.PASSWORD_PEPPER = "a".repeat(64);
        process.env.VAPID_PUBLIC_KEY = "public-key";
        process.env.VAPID_PRIVATE_KEY = "private-key";

        const result = validateSecurityConfiguration();

        expect(result.passed).toBe(true);
        expect(result.warnings).toHaveLength(0);
        expect(result.errors).toHaveLength(0);
      });
    });

    describe("edge cases", () => {
      beforeEach(() => {
        process.env.NODE_ENV = "development";
        process.env.TEST_MODE = "false";
      });

      it("should handle environment without NODE_ENV set", () => {
        delete process.env.NODE_ENV;
        process.env.ALLOWED_HOSTS = "localhost";

        const result = validateSecurityConfiguration();

        // Should treat missing NODE_ENV as non-production
        expect(result.passed).toBe(true);
      });

      it("should handle multiple security issues", () => {
        delete process.env.ALLOWED_HOSTS;
        delete process.env.PASSWORD_PEPPER;
        delete process.env.VAPID_PUBLIC_KEY;
        delete process.env.VAPID_PRIVATE_KEY;

        const result = validateSecurityConfiguration();

        expect(result.warnings.length).toBeGreaterThan(2);
      });
    });
  });

  describe("validateSecurityOrThrow", () => {
    describe("in development mode", () => {
      beforeEach(() => {
        process.env.NODE_ENV = "development";
        process.env.TEST_MODE = "false";
      });

      it("should not throw even with missing ALLOWED_HOSTS", () => {
        delete process.env.ALLOWED_HOSTS;

        expect(() => validateSecurityOrThrow()).not.toThrow();
      });

      it("should not throw with warnings", () => {
        delete process.env.PASSWORD_PEPPER;
        process.env.ALLOWED_HOSTS = "localhost";

        expect(() => validateSecurityOrThrow()).not.toThrow();
      });

      it("should not throw when all is well", () => {
        process.env.ALLOWED_HOSTS = "localhost";
        process.env.PASSWORD_PEPPER = "a".repeat(64);

        expect(() => validateSecurityOrThrow()).not.toThrow();
      });
    });

    describe("in production mode", () => {
      beforeEach(() => {
        process.env.NODE_ENV = "production";
        process.env.TEST_MODE = "false";
      });

      it("should throw when ALLOWED_HOSTS is missing", () => {
        delete process.env.ALLOWED_HOSTS;

        expect(() => validateSecurityOrThrow()).toThrow();
        expect(() => validateSecurityOrThrow()).toThrow("Security validation failed");
      });

      it("should throw when ALLOWED_HOSTS is empty", () => {
        process.env.ALLOWED_HOSTS = "";

        expect(() => validateSecurityOrThrow()).toThrow();
      });

      it("should not throw when ALLOWED_HOSTS is set", () => {
        process.env.ALLOWED_HOSTS = "example.com";

        expect(() => validateSecurityOrThrow()).not.toThrow();
      });

      it("should include error details in thrown error", () => {
        delete process.env.ALLOWED_HOSTS;

        try {
          validateSecurityOrThrow();
          expect.fail("Should have thrown");
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          const message = (error as Error).message;
          expect(message).toContain("ALLOWED_HOSTS");
        }
      });
    });

    describe("in test mode", () => {
      beforeEach(() => {
        process.env.TEST_MODE = "true";
      });

      it("should never throw in test mode", () => {
        delete process.env.ALLOWED_HOSTS;
        delete process.env.PASSWORD_PEPPER;

        expect(() => validateSecurityOrThrow()).not.toThrow();
      });
    });
  });

  describe("VAPID key validation", () => {
    beforeEach(() => {
      process.env.NODE_ENV = "development";
      process.env.TEST_MODE = "false";
      process.env.ALLOWED_HOSTS = "localhost";
    });

    it("should warn when only VAPID_PUBLIC_KEY is missing", () => {
      process.env.VAPID_PRIVATE_KEY = "private-key";
      delete process.env.VAPID_PUBLIC_KEY;

      const result = validateSecurityConfiguration();

      expect(result.warnings.some((w) => w.includes("VAPID_PUBLIC_KEY"))).toBe(true);
      expect(result.warnings.some((w) => w.includes("VAPID_PRIVATE_KEY"))).toBe(false);
    });

    it("should warn when only VAPID_PRIVATE_KEY is missing", () => {
      process.env.VAPID_PUBLIC_KEY = "public-key";
      delete process.env.VAPID_PRIVATE_KEY;

      const result = validateSecurityConfiguration();

      expect(result.warnings.some((w) => w.includes("VAPID_PUBLIC_KEY"))).toBe(false);
      expect(result.warnings.some((w) => w.includes("VAPID_PRIVATE_KEY"))).toBe(true);
    });

    it("should warn when both VAPID keys are missing", () => {
      delete process.env.VAPID_PUBLIC_KEY;
      delete process.env.VAPID_PRIVATE_KEY;

      const result = validateSecurityConfiguration();

      expect(result.warnings.filter((w) => w.includes("VAPID")).length).toBeGreaterThanOrEqual(2);
    });

    it("should pass with both VAPID keys set", () => {
      process.env.VAPID_PUBLIC_KEY = "public-key";
      process.env.VAPID_PRIVATE_KEY = "private-key";

      const result = validateSecurityConfiguration();

      expect(result.warnings.filter((w) => w.includes("VAPID"))).toHaveLength(0);
    });

    it("should treat empty VAPID keys as missing", () => {
      process.env.VAPID_PUBLIC_KEY = "";
      process.env.VAPID_PRIVATE_KEY = "   ";

      const result = validateSecurityConfiguration();

      expect(result.warnings.filter((w) => w.includes("VAPID")).length).toBeGreaterThanOrEqual(2);
    });
  });
});
