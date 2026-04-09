/**
 * Tests for output encoding utilities.
 */

import { describe, expect, it } from "vitest";
import {
  encodeHTML,
  encodeHTMLAttribute,
  encodeJSString,
  encodeURLComponent,
  sanitizeUserInput,
  truncateEncoded,
} from "./outputEncoding";

describe("encodeHTML", () => {
  it("encodes HTML special characters", () => {
    expect(encodeHTML("<script>alert('xss')</script>")).toBe(
      "&lt;script&gt;alert(&#x27;xss&#x27;)&lt;&#x2F;script&gt;"
    );
  });

  it("encodes ampersands", () => {
    expect(encodeHTML("Tom & Jerry")).toBe("Tom &amp; Jerry");
  });

  it("encodes quotes", () => {
    expect(encodeHTML('"quoted"')).toBe("&quot;quoted&quot;");
  });

  it("encodes single quotes", () => {
    expect(encodeHTML("'single'")).toBe("&#x27;single&#x27;");
  });

  it("encodes forward slashes", () => {
    expect(encodeHTML("</script>")).toBe("&lt;&#x2F;script&gt;");
  });

  it("handles mixed special characters", () => {
    expect(encodeHTML('<img src=x onerror="alert(1)">')).toBe(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"
    );
  });

  it("passes through safe strings unchanged", () => {
    expect(encodeHTML("Hello, world!")).toBe("Hello, world!");
  });

  it("converts non-string input to string", () => {
    expect(encodeHTML(123 as unknown as string)).toBe("123");
  });
});

describe("encodeHTMLAttribute", () => {
  it("encodes quotes for attributes", () => {
    expect(encodeHTMLAttribute('" onclick="alert(1)')).toContain("&quot;");
  });

  it("encodes backticks", () => {
    expect(encodeHTMLAttribute("` malicious `")).toContain("&#96;");
  });

  it("encodes all HTML special characters", () => {
    expect(encodeHTMLAttribute("<>\"&'")).toBe("&lt;&gt;&quot;&amp;&#x27;");
  });

  it("handles null bytes", () => {
    // Null bytes are passed through but would be filtered by sanitizeUserInput
    const result = encodeHTMLAttribute("test\x00");
    expect(result.length).toBeGreaterThan(0);
  });
});

describe("encodeURLComponent", () => {
  it("encodes spaces as %20", () => {
    expect(encodeURLComponent("hello world")).toBe("hello%20world");
  });

  it("encodes special characters", () => {
    expect(encodeURLComponent("?query=test&foo=bar")).toBe("%3Fquery%3Dtest%26foo%3Dbar");
  });

  it("handles unicode characters", () => {
    expect(encodeURLComponent("café")).toBe("caf%C3%A9");
  });
});

describe("encodeJSString", () => {
  it("encodes single quotes", () => {
    expect(encodeJSString("'; alert(1); //")).toContain("\\x27");
  });

  it("encodes semicolons", () => {
    expect(encodeJSString(";")).toContain("\\x3b");
  });

  it("encodes control characters", () => {
    expect(encodeJSString("\n")).toContain("\\x0a");
  });
});

describe("sanitizeUserInput", () => {
  it("removes null bytes", () => {
    expect(sanitizeUserInput("test\x00string")).toBe("teststring");
  });

  it("removes control characters except whitespace", () => {
    expect(sanitizeUserInput("test\x01\x02string")).toBe("teststring");
  });

  it("encodes HTML tags", () => {
    expect(sanitizeUserInput("<script>alert(1)</script>")).toBe(
      "&lt;script&gt;alert(1)&lt;&#x2F;script&gt;"
    );
  });

  it("normalizes whitespace", () => {
    expect(sanitizeUserInput("hello     world")).toBe("hello world");
  });

  it("trims leading and trailing whitespace", () => {
    expect(sanitizeUserInput("  hello  ")).toBe("hello");
  });

  it("handles XSS attack vectors", () => {
    const xss = '<img src=x onerror="alert(1)">';
    const sanitized = sanitizeUserInput(xss);
    expect(sanitized).not.toContain("<img");
    // After encoding, "onerror" becomes part of the encoded text
    // The important thing is that the <img> tag is neutralized
    expect(sanitized).toContain("&lt;");
  });
});

describe("truncateEncoded", () => {
  it("truncates long strings", () => {
    const result = truncateEncoded("very long string", 10);
    expect(result).toHaveLength(10);
    expect(result.endsWith("...")).toBe(true);
  });

  it("encodes before truncating", () => {
    const result = truncateEncoded("<script>", 20);
    expect(result).toContain("&lt;");
  });

  it("does not truncate short strings", () => {
    const result = truncateEncoded("short", 20);
    expect(result).toBe("short");
  });

  it("accounts for ellipsis in length", () => {
    const result = truncateEncoded("1234567890", 8);
    expect(result).toBe("12345...");
  });
});
