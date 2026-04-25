/**
 * Tests for security utilities (OWASP XSS prevention).
 */

import { describe, expect, test } from "vitest";
import {
  containsDangerousContent,
  encodeCss,
  encodeHtml,
  encodeHtmlAttribute,
  encodeJs,
  encodeUrl,
  sanitizeHtml,
  sanitizeUrl,
  stripControlCharacters,
  truncate,
} from "./security.js";

describe("encodeHtml", () => {
  test("escapes ampersands", () => {
    expect(encodeHtml("AT&T")).toBe("AT&amp;T");
    expect(encodeHtml("a & b")).toBe("a &amp; b");
  });

  test("escapes less than and greater than", () => {
    expect(encodeHtml("<script>")).toBe("&lt;script&gt;");
    expect(encodeHtml("a < b > c")).toBe("a &lt; b &gt; c");
  });

  test("escapes quotes", () => {
    expect(encodeHtml('"hello"')).toBe("&quot;hello&quot;");
    expect(encodeHtml("'world'")).toBe("&#39;world&#39;");
  });

  test("escapes mixed dangerous content", () => {
    expect(encodeHtml("<script>alert('XSS')</script>")).toBe(
      "&lt;script&gt;alert(&#39;XSS&#39;)&lt;/script&gt;"
    );
  });

  test("handles empty string", () => {
    expect(encodeHtml("")).toBe("");
  });

  test("handles already safe content", () => {
    expect(encodeHtml("Hello, World!")).toBe("Hello, World!");
  });
});

describe("encodeHtmlAttribute", () => {
  test("escapes HTML entities", () => {
    expect(encodeHtmlAttribute('"><script>')).toBe("&quot;&gt;&lt;script&gt;");
  });

  test("escapes single quotes", () => {
    expect(encodeHtmlAttribute("' onclick='alert(1)")).toBe("&#39; onclick=&#39;alert(1)");
  });

  test("removes null bytes", () => {
    expect(encodeHtmlAttribute("test\x00")).toBe("test");
  });

  test("escapes newlines and carriage returns", () => {
    expect(encodeHtmlAttribute("test\n\r")).toBe("test&#10;&#13;");
  });
});

describe("encodeJs", () => {
  test("escapes backslashes", () => {
    expect(encodeJs("C:\\Users\\Test")).toBe("C:\\\\Users\\\\Test");
  });

  test("escapes quotes", () => {
    expect(encodeJs(`It's "test"`)).toBe(`It\\'s \\"test\\"`);
  });

  test("escapes newlines", () => {
    expect(encodeJs("line1\nline2")).toBe("line1\\nline2");
  });

  test("escapes special unicode characters", () => {
    expect(encodeJs("  ")).toBe("\\u2028\\u2029");
  });

  test("escapes tab characters", () => {
    expect(encodeJs("a\tb")).toBe("a\\tb");
  });
});

describe("encodeUrl", () => {
  test("encodes special characters", () => {
    expect(encodeUrl("hello world")).toBe("hello%20world");
    expect(encodeUrl("a&b=c")).toBe("a%26b%3Dc");
  });

  test("encodes unicode characters", () => {
    expect(encodeUrl("café")).toBe("caf%C3%A9");
  });

  test("preserves safe URL characters", () => {
    expect(encodeUrl("abc123-_.~")).toBe("abc123-_.~");
  });
});

describe("encodeCss", () => {
  test("escapes HTML special characters", () => {
    expect(encodeCss("<>\"'&")).toBe("\\3c \\3e \\22 \\27 \\26 ");
  });

  test("escapes backslash", () => {
    expect(encodeCss("test\\")).toBe("test\\5c ");
  });
});

describe("sanitizeHtml", () => {
  test("removes script tags", () => {
    expect(sanitizeHtml("<script>alert('xss')</script>hello")).toBe("hello");
  });

  test("removes all HTML tags", () => {
    expect(sanitizeHtml("<b>bold</b> and <i>italic</i>")).toBe("bold and italic");
  });

  test("removes event handlers", () => {
    expect(sanitizeHtml("onclick=alert(1)")).toBe("alert(1)");
  });

  test("handles plain text", () => {
    expect(sanitizeHtml("plain text")).toBe("plain text");
  });
});

describe("sanitizeUrl", () => {
  test("allows http URLs", () => {
    expect(sanitizeUrl("http://example.com")).toBe("http://example.com");
  });

  test("allows https URLs", () => {
    expect(sanitizeUrl("https://example.com")).toBe("https://example.com");
  });

  test("allows mailto URLs", () => {
    expect(sanitizeUrl("mailto:test@example.com")).toBe("mailto:test@example.com");
  });

  test("allows tel URLs", () => {
    expect(sanitizeUrl("tel:+1234567890")).toBe("tel:+1234567890");
  });

  test("allows relative URLs", () => {
    expect(sanitizeUrl("/path/to/page")).toBe("/path/to/page");
  });

  test("blocks javascript URLs", () => {
    expect(sanitizeUrl("javascript:alert(1)")).toBeNull();
  });

  test("blocks data URLs", () => {
    expect(sanitizeUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
  });

  test("blocks vbscript URLs", () => {
    expect(sanitizeUrl("vbscript:msgbox(1)")).toBeNull();
  });

  test("trims whitespace", () => {
    expect(sanitizeUrl("  https://example.com  ")).toBe("https://example.com");
  });
});

describe("containsDangerousContent", () => {
  test("detects script tags", () => {
    expect(containsDangerousContent("<script>alert(1)</script>")).toBe(true);
  });

  test("detects javascript protocol", () => {
    expect(containsDangerousContent("javascript:void(0)")).toBe(true);
  });

  test("detects event handlers", () => {
    expect(containsDangerousContent("onclick=alert(1)")).toBe(true);
  });

  test("detects iframe tags", () => {
    expect(containsDangerousContent("<iframe src='evil.com'>")).toBe(true);
  });

  test("detects object tags", () => {
    expect(containsDangerousContent("<object data='evil.swf'>")).toBe(true);
  });

  test("detects embed tags", () => {
    expect(containsDangerousContent("<embed src='evil.swf'>")).toBe(true);
  });

  test("detects link tags", () => {
    expect(containsDangerousContent("<link rel='stylesheet' href='evil.css'>")).toBe(true);
  });

  test("detects meta tags", () => {
    expect(containsDangerousContent("<meta http-equiv='refresh'>")).toBe(true);
  });

  test("detects CSS @import", () => {
    expect(containsDangerousContent("@import url('evil.css')")).toBe(true);
  });

  test("detects CSS expression", () => {
    expect(containsDangerousContent("expression(alert(1))")).toBe(true);
  });

  test("returns false for safe content", () => {
    expect(containsDangerousContent("Hello, World!")).toBe(false);
    expect(containsDangerousContent("Safe text with numbers 123")).toBe(false);
  });
});

describe("truncate", () => {
  test("truncates long strings", () => {
    expect(truncate("a".repeat(100), 50)).toBe("a".repeat(50) + "...");
  });

  test("does not truncate short strings", () => {
    expect(truncate("short", 50)).toBe("short");
  });

  test("uses default max length of 1000", () => {
    expect(truncate("a".repeat(1001))).toBe("a".repeat(1000) + "...");
  });

  test("handles empty string", () => {
    expect(truncate("", 10)).toBe("");
  });

  test("handles string at exact max length", () => {
    expect(truncate("abc", 3)).toBe("abc");
  });
});

describe("stripControlCharacters", () => {
  test("removes null bytes", () => {
    expect(stripControlCharacters("test\x00")).toBe("test");
  });

  test("removes various control characters", () => {
    expect(stripControlCharacters("test\x01\x02\x03")).toBe("test");
  });

  test("preserves newlines and tabs", () => {
    expect(stripControlCharacters("test\n\t")).toBe("test\n\t");
  });

  test("handles empty string", () => {
    expect(stripControlCharacters("")).toBe("");
  });

  test("removes DEL character", () => {
    expect(stripControlCharacters("test\x7F")).toBe("test");
  });
});
