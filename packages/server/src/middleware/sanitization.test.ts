/**
 * Unit tests for shared sanitization utilities.
 *
 * Tests:
 * - String sanitization (HTML tags, SQL injection, XSS patterns)
 * - Object sanitization (recursive)
 * - Parameter sanitization
 * - Output encoding (HTML, JavaScript, URL, CSS)
 * - Format validation (API keys, session tokens, signatures)
 * - Custom sanitization options
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  encodeCssOutput,
  encodeHtmlOutput,
  encodeJsOutput,
  encodeUrlOutput,
  sanitizeObject,
  sanitizeParams,
  sanitizeString,
  sanitizeStringSimple,
  validateApiKeyFormat,
  validateSessionTokenFormat,
  validateSignatureFormat,
} from "./sanitization.js";

// Mock the logger
vi.mock("../observability/logger.js", () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe("Shared sanitization utilities", () => {
  beforeEach(() => {
    // No setup needed
  });

  describe("sanitizeString", () => {
    it("strips HTML tags", () => {
      const result = sanitizeString("<script>alert('xss')</script>Hello");

      expect(result.value).toBe("Hello");
      expect(result.wasSanitized).toBe(true);
      expect(result.sanitizationType).toContain("html_tags");
    });

    it("removes event handlers", () => {
      const result = sanitizeString("onclick=doEvil()");

      expect(result.value).not.toContain("onclick");
      expect(result.wasSanitized).toBe(true);
    });

    it("removes javascript: protocol", () => {
      const result = sanitizeString("javascript:alert(1)");

      expect(result.value).not.toContain("javascript:");
      expect(result.wasSanitized).toBe(true);
    });

    it("detects SQL injection patterns", () => {
      const result = sanitizeString("1' OR '1'='1");

      expect(result.value).not.toContain("'");
      expect(result.value).not.toContain(/or/i);
      expect(result.wasSanitized).toBe(true);
      expect(result.sanitizationType).toContain("sql_injection");
    });

    it("detects UNION SELECT injection", () => {
      const result = sanitizeString("1 UNION SELECT * FROM users");

      expect(result.value).not.toContain(/union/i);
      expect(result.value).not.toContain(/select/i);
      expect(result.wasSanitized).toBe(true);
    });

    it("detects command injection patterns", () => {
      const result = sanitizeString("file.txt; rm -rf /");

      expect(result.value).not.toContain(";");
      expect(result.wasSanitized).toBe(true);
      expect(result.sanitizationType).toContain("command_injection");
    });

    it("detects path traversal patterns", () => {
      const result = sanitizeString("../../../etc/passwd");

      expect(result.value).not.toContain("..");
      expect(result.wasSanitized).toBe(true);
      expect(result.sanitizationType).toContain("path_traversal");
    });

    it("detects LDAP injection patterns", () => {
      const result = sanitizeString("*(|(mail=*))");

      expect(result.value).not.toContain("*");
      expect(result.value).not.toContain("|");
      expect(result.wasSanitized).toBe(true);
      expect(result.sanitizationType).toContain("ldap_injection");
    });

    it("detects NoSQL injection patterns", () => {
      const result = sanitizeString("{ $ne: null }");

      expect(result.value).not.toContain("$ne");
      expect(result.wasSanitized).toBe(true);
      expect(result.sanitizationType).toContain("nosql_injection");
    });

    it("detects XSS patterns including encoded variants", () => {
      const result = sanitizeString("&lt;script&gt;alert(1)&lt;/script&gt;");

      expect(result.value).not.toContain("&lt;");
      expect(result.value).not.toContain("&gt;");
      expect(result.wasSanitized).toBe(true);
      expect(result.sanitizationType).toContain("xss_pattern");
    });

    it("detects template injection patterns", () => {
      const result = sanitizeString("{{7*7}}");

      expect(result.value).not.toContain("{{");
      expect(result.wasSanitized).toBe(true);
      expect(result.sanitizationType).toContain("template_injection");
    });

    it("detects log injection patterns", () => {
      const result = sanitizeString("user\nERROR: admin logged in");

      expect(result.value).not.toContain("\n");
      expect(result.wasSanitized).toBe(true);
      expect(result.sanitizationType).toContain("log_injection");
    });

    it("normalizes whitespace", () => {
      const result = sanitizeString("John    Doe   ");

      expect(result.value).toBe("John Doe");
      expect(result.wasSanitized).toBe(true);
    });

    it("enforces maximum length", () => {
      const longInput = "a".repeat(20000);
      const result = sanitizeString(longInput, { maxLength: 100 });

      expect(result.value).toHaveLength(100);
      expect(result.wasSanitized).toBe(true);
      expect(result.sanitizationType).toContain("length_limit");
    });

    it("returns wasSanitized false for clean input", () => {
      const result = sanitizeString("safe input");

      expect(result.value).toBe("safe input");
      expect(result.wasSanitized).toBe(false);
      expect(result.sanitizationType).toBeUndefined();
    });

    it("supports disabling specific sanitizations", () => {
      const result = sanitizeString("<b>Bold</b>", {
        stripHtml: false,
        preventSqlInjection: false,
        preventCommandInjection: false,
        preventPathTraversal: false,
        preventLdapInjection: false,
        preventNosqlInjection: false,
        preventXss: false,
        preventTemplateInjection: false,
        preventLogInjection: false,
        normalizeWhitespace: false,
      });

      expect(result.value).toContain("<b>");
      expect(result.wasSanitized).toBe(false);
    });

    it("tracks multiple sanitization types", () => {
      const result = sanitizeString("<script>1' OR 1=1</script>");

      expect(result.wasSanitized).toBe(true);
      expect(result.sanitizationType).toContain("html_tags");
      expect(result.sanitizationType).toContain("sql_injection");
    });
  });

  describe("sanitizeStringSimple", () => {
    it("returns just the sanitized string", () => {
      const result = sanitizeStringSimple("<script>alert(1)</script>Hello");

      expect(result).toBe("Hello");
      expect(typeof result).toBe("string");
    });

    it("supports options", () => {
      const result = sanitizeStringSimple("test", { maxLength: 2 });

      expect(result).toBe("te");
    });
  });

  describe("sanitizeObject", () => {
    it("sanitizes string values in objects", () => {
      const obj = {
        name: "<b>John</b>",
        email: "john@example.com",
        bio: "javascript:alert(1)Bio",
      };

      const result = sanitizeObject(obj);

      expect(result).toEqual({
        name: "John",
        email: "john@example.com",
        bio: "Bio",
      });
    });

    it("recursively sanitizes nested objects", () => {
      const obj = {
        user: {
          name: "<script>alert(1)</script>Alice",
          address: {
            city: "NYC",
            notes: "../etc/passwd",
          },
        },
      };

      const result = sanitizeObject(obj);

      expect(result.user.name).toBe("Alice");
      expect(result.user.address.city).toBe("NYC");
      expect(result.user.address.notes).not.toContain("..");
    });

    it("sanitizes arrays", () => {
      const obj = {
        tags: ["<script>evil</script>tag1", "tag2", "<b>tag3</b>"],
      };

      const result = sanitizeObject(obj);

      expect(result.tags).toEqual(["tag1", "tag2", "tag3"]);
    });

    it("preserves non-string values", () => {
      const obj = {
        count: 42,
        active: true,
        value: null,
        empty: undefined,
      };

      const result = sanitizeObject(obj);

      expect(result.count).toBe(42);
      expect(result.active).toBe(true);
      expect(result.value).toBe(null);
      expect(result.empty).toBe(undefined);
    });

    it("sanitizes object keys", () => {
      const obj = {
        "<script>key</script>": "value",
        safe: "value",
      };

      const result = sanitizeObject(obj) as Record<string, unknown>;

      // Script tags with content are completely removed (empty key)
      // The object has the empty string key and the safe key
      expect(result).toHaveProperty("");
      expect(result).toHaveProperty("safe");
      expect(result).not.toHaveProperty("<script>key</script>");
      expect(result).not.toHaveProperty("key");
    });

    it("handles empty objects", () => {
      const result = sanitizeObject({});
      expect(result).toEqual({});
    });

    it("handles null input", () => {
      const result = sanitizeObject(null);
      expect(result).toBe(null);
    });
  });

  describe("sanitizeParams", () => {
    it("sanitizes query parameters", () => {
      const params = {
        name: "<b>Alice</b>",
        search: "test query",
        filter: "../etc",
      };

      const result = sanitizeParams(params);

      expect(result.name).toBe("Alice");
      expect(result.search).toBe("test query");
      expect(result.filter).not.toContain("..");
    });

    it("handles array parameters by taking first value", () => {
      const params = {
        tags: ["tag1", "tag2", "tag3"],
        single: "value",
      };

      const result = sanitizeParams(params);

      expect(result.tags).toBe("tag1");
      expect(result.single).toBe("value");
    });

    it("sanitizes parameter keys", () => {
      const params = {
        "normal-key": "value",
        "<bad>key</bad>": "value",
      };

      const result = sanitizeParams(params);

      expect(result).toHaveProperty("normal-key");
      expect(result).toHaveProperty("key");
      expect(result).not.toHaveProperty("<bad>key</bad>");
    });

    it("handles undefined values", () => {
      const params = {
        defined: "value",
        undefined: undefined,
      };

      const result = sanitizeParams(params);

      expect(result.defined).toBe("value");
      expect(result.undefined).toBe("");
    });

    it("handles empty arrays", () => {
      const params = {
        empty: [] as string[],
      };

      const result = sanitizeParams(params);

      expect(result.empty).toBe("");
    });
  });

  describe("validateApiKeyFormat", () => {
    it("accepts valid API key format", () => {
      expect(validateApiKeyFormat("abc123")).toBe(true);
      expect(validateApiKeyFormat("my_api_key_123")).toBe(true);
      expect(validateApiKeyFormat("A1b2C3d4E5f6G7h8i9J0k1L2m3N4o5P6")).toBe(true);
    });

    it("rejects invalid formats", () => {
      expect(validateApiKeyFormat("ab")).toBe(false); // Too short
      expect(validateApiKeyFormat("a".repeat(51))).toBe(false); // Too long
      expect(validateApiKeyFormat("key-with-dashes!")).toBe(false); // Invalid chars
      expect(validateApiKeyFormat("key with spaces")).toBe(false); // Spaces
      expect(validateApiKeyFormat("")).toBe(false); // Empty
    });
  });

  describe("validateSessionTokenFormat", () => {
    it("accepts valid UUID v4 format", () => {
      expect(validateSessionTokenFormat("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
      expect(validateSessionTokenFormat("6ba7b810-9dad-11d1-80b4-00c04fd430c8")).toBe(true);
    });

    it("rejects invalid UUID formats", () => {
      expect(validateSessionTokenFormat("not-a-uuid")).toBe(false);
      expect(validateSessionTokenFormat("550e8400-e29b-41d4-a716")).toBe(false); // Missing segment
      expect(validateSessionTokenFormat("550e8400-e29b-41d4-a716-44665544000g")).toBe(false); // Invalid hex
      expect(validateSessionTokenFormat("")).toBe(false);
    });

    it("accepts lowercase and uppercase", () => {
      expect(validateSessionTokenFormat("550e8400-e29b-41d4-a716-446655440000".toLowerCase())).toBe(
        true
      );
      expect(validateSessionTokenFormat("550e8400-e29b-41d4-a716-446655440000".toUpperCase())).toBe(
        true
      );
    });
  });

  describe("validateSignatureFormat", () => {
    it("accepts valid HMAC signature format", () => {
      expect(validateSignatureFormat("hmac_sha256:" + "a".repeat(64))).toBe(true);
      expect(validateSignatureFormat("hmac_sha256:" + "0123456789abcdef".repeat(4))).toBe(true);
    });

    it("rejects invalid signature formats", () => {
      expect(validateSignatureFormat("hmac_sha256:" + "a".repeat(63))).toBe(false); // Too short
      expect(validateSignatureFormat("hmac_sha256:" + "a".repeat(65))).toBe(false); // Too long
      expect(validateSignatureFormat("sha256:" + "a".repeat(64))).toBe(false); // Missing prefix
      expect(validateSignatureFormat("hmac_sha256:ghijklmnop")).toBe(false); // Invalid hex
      expect(validateSignatureFormat("")).toBe(false);
    });
  });

  describe("encodeHtmlOutput", () => {
    it("escapes HTML special characters", () => {
      const result = encodeHtmlOutput("<script>alert('xss')</script>");

      expect(result).toContain("&lt;");
      expect(result).toContain("&gt;");
      expect(result).toContain("&#39;");
      expect(result).not.toContain("<script>");
    });

    it("escapes ampersand first to prevent double-encoding", () => {
      const result = encodeHtmlOutput("&lt;");

      expect(result).toBe("&amp;lt;");
    });

    it("escapes quotes", () => {
      const result = encodeHtmlOutput("\"quoted\" and 'single'");

      expect(result).toContain("&quot;");
      expect(result).toContain("&#39;");
    });

    it("handles empty string", () => {
      expect(encodeHtmlOutput("")).toBe("");
    });
  });

  describe("encodeJsOutput", () => {
    it("escapes backslashes", () => {
      const result = encodeJsOutput("path\\to\\file");

      expect(result).toContain("\\\\");
    });

    it("escapes quotes", () => {
      const result = encodeJsOutput('He said "hello"');

      expect(result).toContain('\\"');
    });

    it("escapes newlines and tabs", () => {
      const result = encodeJsOutput("line1\nline2\ttabbed");

      expect(result).toContain("\\n");
      expect(result).toContain("\\t");
    });

    it("escapes null character", () => {
      const result = encodeJsOutput("\0null");

      expect(result).toContain("\\0");
    });

    it("handles complex string", () => {
      const result = encodeJsOutput("test\n\r\t\f\v'\"\\\0");

      expect(result).toContain("\\n");
      expect(result).toContain("\\r");
      expect(result).toContain("\\t");
      expect(result).toContain("\\f");
      expect(result).toContain("\\v");
      expect(result).toContain("\\'");
      expect(result).toContain('\\"');
      expect(result).toContain("\\\\");
    });
  });

  describe("encodeUrlOutput", () => {
    it("encodes URL parameters", () => {
      const result = encodeUrlOutput("hello world");

      expect(result).toBe("hello%20world");
    });

    it("encodes special characters", () => {
      const result = encodeUrlOutput("a+b=c&d=e");

      expect(result).toContain("%26");
      expect(result).toContain("%3D");
    });

    it("handles Unicode", () => {
      const result = encodeUrlOutput("café");

      expect(result).toContain("%");
    });

    it("preserves allowed characters", () => {
      const result = encodeUrlOutput("ABC-123_456.789");

      expect(result).toBe("ABC-123_456.789");
    });
  });

  describe("encodeCssOutput", () => {
    it("escapes CSS special characters", () => {
      const result = encodeCssOutput("<>\"'&\\");

      // Each character should be escaped as \\XX where XX is hex
      expect(result).toContain("\\3c ");
      expect(result).toContain("\\3e ");
      expect(result).toContain("\\22 ");
      expect(result).toContain("\\27 ");
      expect(result).toContain("\\26 ");
      expect(result).toContain("\\5c ");
    });

    it("handles empty string", () => {
      expect(encodeCssOutput("")).toBe("");
    });

    it("handles safe characters", () => {
      const result = encodeCssOutput("abc123");

      expect(result).toBe("abc123");
    });
  });

  describe("comprehensive sanitization scenarios", () => {
    it("handles complex XSS attack", () => {
      const attack = `<img src=x onerror="alert('xss')">`;
      const result = sanitizeString(attack);

      expect(result.value).not.toContain("<img");
      expect(result.value).not.toContain("onerror");
      expect(result.value).not.toContain("alert");
      expect(result.wasSanitized).toBe(true);
    });

    it("handles multi-vector attack", () => {
      const attack = `test' OR 1=1 -- <script>alert(1)</script> ../../../etc/passwd`;
      const result = sanitizeString(attack);

      expect(result.value).not.toContain("'");
      expect(result.value).not.toContain("or");
      expect(result.value).not.toContain("<script");
      expect(result.value).not.toContain("..");
      expect(result.wasSanitized).toBe(true);
    });

    it("preserves safe multi-language content", () => {
      const content = "Hello 世界 🚀 مرحبا";
      const result = sanitizeString(content);

      expect(result.value).toBe(content);
      expect(result.wasSanitized).toBe(false);
    });
  });
});
