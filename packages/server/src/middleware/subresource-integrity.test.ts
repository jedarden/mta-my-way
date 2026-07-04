/**
 * Unit tests for Subresource Integrity (SRI) utilities.
 *
 * Tests:
 * - SRI hash generation for files
 * - SRI hash generation for buffers
 * - SRI hash generation for URLs
 * - Hash formatting (integrity attribute)
 * - Hash validation
 * - Integrity attribute parsing
 * - HTML attribute generation
 * - Multiple hash fallback support
 * - SHA-256, SHA-384, and SHA-512 algorithms
 */

import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatMultipleSriHashes,
  formatSriHash,
  generateSriAttributes,
  generateSriHash,
  generateSriHashForBuffer,
  generateSriHashForUrl,
  generateSriManifest,
  getLibrarySriHash,
  parseIntegrityAttribute,
  validateIntegrityAttribute,
  validateSriAttributes,
  validateSriHash,
  validateSriHashForBuffer,
} from "./subresource-integrity.js";

// Mock fs module
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
}));

describe("Subresource Integrity utilities", () => {
  describe("generateSriHashForBuffer", () => {
    it("generates SHA-384 hash by default", () => {
      const buffer = Buffer.from("hello world");
      const hash = generateSriHashForBuffer(buffer);

      expect(hash.algorithm).toBe("sha384");
      expect(hash.value).toBeTruthy();
      expect(typeof hash.value).toBe("string");
      expect(hash.value.length).toBeGreaterThan(0);
    });

    it("generates SHA-256 hash", () => {
      const buffer = Buffer.from("hello world");
      const hash = generateSriHashForBuffer(buffer, "sha256");

      expect(hash.algorithm).toBe("sha256");
      expect(hash.value).toBeTruthy();
    });

    it("generates SHA-512 hash", () => {
      const buffer = Buffer.from("hello world");
      const hash = generateSriHashForBuffer(buffer, "sha512");

      expect(hash.algorithm).toBe("sha512");
      expect(hash.value).toBeTruthy();
    });

    it("generates consistent hashes for same input", () => {
      const buffer = Buffer.from("consistent content");
      const hash1 = generateSriHashForBuffer(buffer);
      const hash2 = generateSriHashForBuffer(buffer);

      expect(hash1.algorithm).toBe(hash2.algorithm);
      expect(hash1.value).toBe(hash2.value);
    });

    it("generates different hashes for different inputs", () => {
      const buffer1 = Buffer.from("content one");
      const buffer2 = Buffer.from("content two");
      const hash1 = generateSriHashForBuffer(buffer1);
      const hash2 = generateSriHashForBuffer(buffer2);

      expect(hash1.value).not.toBe(hash2.value);
    });

    it("handles string input", () => {
      const hash = generateSriHashForBuffer("test string");

      expect(hash.algorithm).toBe("sha384");
      expect(hash.value).toBeTruthy();
    });
  });

  describe("generateSriHash", () => {
    it("generates hash for file content", async () => {
      const fileContent = Buffer.from("file content here");
      vi.mocked(readFile).mockResolvedValueOnce(fileContent);

      const hash = await generateSriHash("/path/to/file.js");

      expect(hash.algorithm).toBe("sha384");
      expect(hash.value).toBeTruthy();
      expect(readFile).toHaveBeenCalledWith("/path/to/file.js");
    });

    it("supports different algorithms", async () => {
      const fileContent = Buffer.from("file content");
      vi.mocked(readFile).mockResolvedValueOnce(fileContent);

      const hash = await generateSriHash("/path/to/file.js", "sha256");

      expect(hash.algorithm).toBe("sha256");
    });
  });

  describe("generateSriHashForUrl", () => {
    it("fetches URL and generates hash", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => Buffer.from("remote content").buffer,
      });

      const hash = await generateSriHashForUrl("https://example.com/script.js");

      expect(hash.algorithm).toBe("sha384");
      expect(hash.value).toBeTruthy();
      expect(global.fetch).toHaveBeenCalledWith(
        "https://example.com/script.js",
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });

    it("handles HTTP errors", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      await expect(generateSriHashForUrl("https://example.com/missing.js")).rejects.toThrow(
        "HTTP 404"
      );
    });

    it("respects timeout", async () => {
      global.fetch = vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise((_, reject) =>
              setTimeout(() => reject(new DOMException("Aborted", "AbortError")), 100)
            )
        );

      await expect(
        generateSriHashForUrl("https://example.com/slow.js", "sha384", 50)
      ).rejects.toThrow();
    });
  });

  describe("formatSriHash", () => {
    it("formats hash as integrity attribute", () => {
      const hash = { algorithm: "sha384", value: "abc123def456" };
      const formatted = formatSriHash(hash);

      expect(formatted).toBe("sha384-abc123def456");
    });

    it("handles SHA-256", () => {
      const hash = { algorithm: "sha256", value: "xyz789" };
      const formatted = formatSriHash(hash);

      expect(formatted).toBe("sha256-xyz789");
    });

    it("handles SHA-512", () => {
      const hash = { algorithm: "sha512", value: "ghi012" };
      const formatted = formatSriHash(hash);

      expect(formatted).toBe("sha512-ghi012");
    });
  });

  describe("formatMultipleSriHashes", () => {
    it("formats multiple hashes", () => {
      const hashes = [
        { algorithm: "sha384" as const, value: "abc123" },
        { algorithm: "sha256" as const, value: "def456" },
      ];
      const formatted = formatMultipleSriHashes(hashes);

      expect(formatted).toBe("sha384-abc123 sha256-def456");
    });

    it("handles single hash", () => {
      const hashes = [{ algorithm: "sha384" as const, value: "single" }];
      const formatted = formatMultipleSriHashes(hashes);

      expect(formatted).toBe("sha384-single");
    });

    it("handles empty array", () => {
      const formatted = formatMultipleSriHashes([]);
      expect(formatted).toBe("");
    });
  });

  describe("validateSriHash", () => {
    it("validates matching hash", async () => {
      const content = Buffer.from("test content");
      const expectedHash = generateSriHashForBuffer(content);

      vi.mocked(readFile).mockResolvedValueOnce(content);

      const isValid = await validateSriHash("/path/to/file.js", expectedHash);

      expect(isValid).toBe(true);
    });

    it("rejects mismatched hash", async () => {
      const content = Buffer.from("original content");
      const wrongHash = { algorithm: "sha384" as const, value: "wronghashvalue" };

      vi.mocked(readFile).mockResolvedValueOnce(content);

      const isValid = await validateSriHash("/path/to/file.js", wrongHash);

      expect(isValid).toBe(false);
    });

    it("validates with same algorithm", async () => {
      const content = Buffer.from("content");
      const expectedHash = generateSriHashForBuffer(content, "sha256");

      vi.mocked(readFile).mockResolvedValueOnce(content);

      const isValid = await validateSriHash("/path/to/file.js", expectedHash);

      expect(isValid).toBe(true);
    });
  });

  describe("validateSriHashForBuffer", () => {
    it("validates buffer against hash", () => {
      const buffer = Buffer.from("buffer content");
      const expectedHash = generateSriHashForBuffer(buffer);

      const isValid = validateSriHashForBuffer(buffer, expectedHash);

      expect(isValid).toBe(true);
    });

    it("validates string against hash", () => {
      const content = "string content";
      const expectedHash = generateSriHashForBuffer(content);

      const isValid = validateSriHashForBuffer(content, expectedHash);

      expect(isValid).toBe(true);
    });

    it("rejects mismatched content", () => {
      const buffer = Buffer.from("actual content");
      const wrongHash = { algorithm: "sha384" as const, value: "wrong" };

      const isValid = validateSriHashForBuffer(buffer, wrongHash);

      expect(isValid).toBe(false);
    });
  });

  describe("parseIntegrityAttribute", () => {
    it("parses single hash", () => {
      const integrity = "sha384-abc123def456";
      const hashes = parseIntegrityAttribute(integrity);

      expect(hashes).toHaveLength(1);
      expect(hashes[0]).toEqual({ algorithm: "sha384", value: "abc123def456" });
    });

    it("parses multiple hashes", () => {
      const integrity = "sha384-abc123 sha256-def456";
      const hashes = parseIntegrityAttribute(integrity);

      expect(hashes).toHaveLength(2);
      expect(hashes[0]).toEqual({ algorithm: "sha384", value: "abc123" });
      expect(hashes[1]).toEqual({ algorithm: "sha256", value: "def456" });
    });

    it("handles various algorithms", () => {
      const integrity = "sha256-abc sha384-def sha512-ghi";
      const hashes = parseIntegrityAttribute(integrity);

      expect(hashes).toHaveLength(3);
      expect(hashes[0].algorithm).toBe("sha256");
      expect(hashes[1].algorithm).toBe("sha384");
      expect(hashes[2].algorithm).toBe("sha512");
    });

    it("handles empty string", () => {
      const hashes = parseIntegrityAttribute("");
      expect(hashes).toHaveLength(0);
    });

    it("ignores malformed parts", () => {
      const integrity = "sha384-valid not-a-hash sha256-also-valid";
      const hashes = parseIntegrityAttribute(integrity);

      expect(hashes).toHaveLength(2);
      expect(hashes[0]).toEqual({ algorithm: "sha384", value: "valid" });
      expect(hashes[1]).toEqual({ algorithm: "sha256", value: "also-valid" });
    });
  });

  describe("validateIntegrityAttribute", () => {
    it("validates against any hash in integrity attribute", () => {
      const buffer = Buffer.from("content");
      const hash = generateSriHashForBuffer(buffer);
      const integrity = formatSriHash(hash);

      const isValid = validateIntegrityAttribute(buffer, integrity);

      expect(isValid).toBe(true);
    });

    it("validates against multiple hashes", () => {
      const buffer = Buffer.from("content");
      const hash1 = generateSriHashForBuffer(buffer, "sha384");
      const hash2 = generateSriHashForBuffer(buffer, "sha256");
      const integrity = `${formatSriHash(hash1)} ${formatSriHash(hash2)}`;

      const isValid = validateIntegrityAttribute(buffer, integrity);

      expect(isValid).toBe(true);
    });

    it("rejects when no hashes match", () => {
      const buffer = Buffer.from("content");
      const integrity = "sha384-wronghash sha256-also_wrong";

      const isValid = validateIntegrityAttribute(buffer, integrity);

      expect(isValid).toBe(false);
    });
  });

  describe("generateSriAttributes", () => {
    it("generates attributes for single hash", () => {
      const hash = { algorithm: "sha384" as const, value: "abc123" };
      const attrs = generateSriAttributes(hash);

      expect(attrs.integrity).toBe("sha384-abc123");
      expect(attrs.crossorigin).toBeUndefined();
    });

    it("generates attributes for multiple hashes", () => {
      const hashes = [
        { algorithm: "sha384" as const, value: "abc" },
        { algorithm: "sha256" as const, value: "def" },
      ];
      const attrs = generateSriAttributes(hashes);

      expect(attrs.integrity).toBe("sha384-abc sha256-def");
    });

    it("includes crossorigin when specified", () => {
      const hash = { algorithm: "sha384" as const, value: "abc" };
      const attrs = generateSriAttributes(hash, "anonymous");

      expect(attrs.integrity).toBe("sha384-abc");
      expect(attrs.crossorigin).toBe("anonymous");
    });

    it("supports use-credentials crossorigin", () => {
      const hash = { algorithm: "sha384" as const, value: "abc" };
      const attrs = generateSriAttributes(hash, "use-credentials");

      expect(attrs.crossorigin).toBe("use-credentials");
    });
  });

  describe("validateSriAttributes", () => {
    it("validates buffer against attributes", () => {
      const buffer = Buffer.from("content");
      const hash = generateSriHashForBuffer(buffer);
      const attrs = generateSriAttributes(hash);

      const isValid = validateSriAttributes(buffer, attrs);

      expect(isValid).toBe(true);
    });

    it("rejects invalid attributes", () => {
      const buffer = Buffer.from("content");
      const attrs = { integrity: "sha384-wrong" };

      const isValid = validateSriAttributes(buffer, attrs);

      expect(isValid).toBe(false);
    });

    it("rejects attributes without integrity", () => {
      const buffer = Buffer.from("content");
      const attrs = {};

      const isValid = validateSriAttributes(buffer, attrs);

      expect(isValid).toBe(false);
    });
  });

  describe("getLibrarySriHash", () => {
    it("returns hash for known library", () => {
      const hash = getLibrarySriHash("react", "18.2.0");

      expect(hash).toBeDefined();
      expect(Array.isArray(hash)).toBe(true);
    });

    it("returns undefined for unknown library", () => {
      const hash = getLibrarySriHash("unknown-lib", "1.0.0");

      expect(hash).toBeUndefined();
    });

    it("returns undefined for unknown version", () => {
      const hash = getLibrarySriHash("react", "99.0.0");

      expect(hash).toBeUndefined();
    });
  });

  describe("generateSriManifest", () => {
    it("generates manifest for multiple files", async () => {
      const files = {
        "app.js": "/path/to/app.js",
        "vendor.js": "/path/to/vendor.js",
      };

      vi.mocked(readFile)
        .mockResolvedValueOnce(Buffer.from("app content"))
        .mockResolvedValueOnce(Buffer.from("vendor content"));

      const manifest = await generateSriManifest(files, "sha256");

      expect(manifest["app.js"]).toMatch(/^sha256-/);
      expect(manifest["vendor.js"]).toMatch(/^sha256-/);
      expect(manifest["app.js"]).not.toBe(manifest["vendor.js"]);
    });

    it("uses SHA-384 by default", async () => {
      const files = { "script.js": "/path/to/script.js" };
      vi.mocked(readFile).mockResolvedValueOnce(Buffer.from("content"));

      const manifest = await generateSriManifest(files);

      expect(manifest["script.js"]).toMatch(/^sha384-/);
    });
  });
});
