/**
 * Unit tests for header validation middleware.
 */

import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import { headerValidation, strictHeaderValidation } from "./header-validation.js";

describe("headerValidation middleware", () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
  });

  describe("User-Agent validation", () => {
    it("allows legitimate User-Agent headers", async () => {
      app.use("*", headerValidation());
      app.get("/api/test", (c) => c.json({ success: true }));

      const res = await app.request("/api/test", {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        },
      });

      expect(res.status).toBe(200);
    });

    it("blocks User-Agent with script tags", async () => {
      app.use("*", headerValidation());
      app.get("/api/test", (c) => c.json({ success: true }));

      const res = await app.request("/api/test", {
        headers: {
          "User-Agent": "<script>alert('xss')</script>",
        },
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("User-Agent");
    });

    it("blocks User-Agent with SQL injection tools", async () => {
      app.use("*", headerValidation());
      app.get("/api/test", (c) => c.json({ success: true }));

      const res = await app.request("/api/test", {
        headers: {
          "User-Agent": "sqlmap/1.0",
        },
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("User-Agent");
    });

    it("blocks User-Agent with javascript: protocol", async () => {
      app.use("*", headerValidation());
      app.get("/api/test", (c) => c.json({ success: true }));

      const res = await app.request("/api/test", {
        headers: {
          "User-Agent": "javascript:alert(1)",
        },
      });

      expect(res.status).toBe(400);
    });

    it("allows requests without User-Agent header", async () => {
      app.use("*", headerValidation());
      app.get("/api/test", (c) => c.json({ success: true }));

      const res = await app.request("/api/test");

      expect(res.status).toBe(200);
    });
  });

  describe("Referer validation", () => {
    it("allows legitimate Referer headers", async () => {
      app.use("*", headerValidation());
      app.get("/api/test", (c) => c.json({ success: true }));

      const res = await app.request("/api/test", {
        headers: {
          Referer: "https://example.com/page",
        },
      });

      expect(res.status).toBe(200);
    });

    it("blocks Referer with javascript: protocol", async () => {
      app.use("*", headerValidation());
      app.get("/api/test", (c) => c.json({ success: true }));

      const res = await app.request("/api/test", {
        headers: {
          Referer: "javascript:alert(1)",
        },
      });

      expect(res.status).toBe(400);
    });

    it("blocks Referer with HTML tags", async () => {
      app.use("*", headerValidation());
      app.get("/api/test", (c) => c.json({ success: true }));

      const res = await app.request("/api/test", {
        headers: {
          Referer: "<img src=x onerror=alert(1)>",
        },
      });

      expect(res.status).toBe(400);
    });

    it("blocks Referer with disallowed protocols", async () => {
      app.use("*", headerValidation());
      app.get("/api/test", (c) => c.json({ success: true }));

      const res = await app.request("/api/test", {
        headers: {
          Referer: "file:///etc/passwd",
        },
      });

      expect(res.status).toBe(400);
    });

    it("allows requests without Referer header", async () => {
      app.use("*", headerValidation());
      app.get("/api/test", (c) => c.json({ success: true }));

      const res = await app.request("/api/test");

      expect(res.status).toBe(200);
    });
  });

  describe("Host header validation", () => {
    it("allows valid Host headers", async () => {
      app.use("*", headerValidation());
      app.get("/api/test", (c) => c.json({ success: true }));

      const res = await app.request("/api/test", {
        headers: {
          Host: "example.com",
        },
      });

      expect(res.status).toBe(200);
    });

    it("blocks Host with path injection", async () => {
      app.use("*", headerValidation());
      app.get("/api/test", (c) => c.json({ success: true }));

      const res = await app.request("/api/test", {
        headers: {
          Host: "evil.com/path",
        },
      });

      expect(res.status).toBe(400);
    });

    it("blocks Host with backslash", async () => {
      app.use("*", headerValidation());
      app.get("/api/test", (c) => c.json({ success: true }));

      const res = await app.request("/api/test", {
        headers: {
          Host: "evil.com\\path",
        },
      });

      expect(res.status).toBe(400);
    });

    it("blocks Host with invalid characters", async () => {
      app.use("*", headerValidation());
      app.get("/api/test", (c) => c.json({ success: true }));

      const res = await app.request("/api/test", {
        headers: {
          Host: "evil.com\r\nX-Injected: true",
        },
      });

      expect(res.status).toBe(400);
    });
  });

  describe("Header length validation", () => {
    it("blocks headers exceeding maximum length", async () => {
      app.use("*", headerValidation({ maxLength: 100 }));
      app.get("/api/test", (c) => c.json({ success: true }));

      const longValue = "A".repeat(101);
      const res = await app.request("/api/test", {
        headers: {
          "X-Custom-Header": longValue,
        },
      });

      expect(res.status).toBe(400);
    });

    it("allows headers within maximum length", async () => {
      app.use("*", headerValidation({ maxLength: 100 }));
      app.get("/api/test", (c) => c.json({ success: true }));

      const validValue = "A".repeat(100);
      const res = await app.request("/api/test", {
        headers: {
          "X-Custom-Header": validValue,
        },
      });

      expect(res.status).toBe(200);
    });
  });

  describe("CRLF injection prevention", () => {
    it("blocks headers with CRLF injection", async () => {
      app.use("*", headerValidation());
      app.get("/api/test", (c) => c.json({ success: true }));

      const res = await app.request("/api/test", {
        headers: {
          "X-Custom-Header": "value\r\nX-Injected: malicious",
        },
      });

      expect(res.status).toBe(400);
    });

    it("blocks headers with LF injection", async () => {
      app.use("*", headerValidation());
      app.get("/api/test", (c) => c.json({ success: true }));

      const res = await app.request("/api/test", {
        headers: {
          "X-Custom-Header": "value\nX-Injected: malicious",
        },
      });

      expect(res.status).toBe(400);
    });

    it("blocks headers with CR injection", async () => {
      app.use("*", headerValidation());
      app.get("/api/test", (c) => c.json({ success: true }));

      const res = await app.request("/api/test", {
        headers: {
          "X-Custom-Header": "value\rInjected",
        },
      });

      expect(res.status).toBe(400);
    });
  });

  describe("Authorization header validation", () => {
    it("allows valid Authorization headers", async () => {
      app.use("*", headerValidation());
      app.get("/api/test", (c) => c.json({ success: true }));

      const res = await app.request("/api/test", {
        headers: {
          Authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
        },
      });

      expect(res.status).toBe(200);
    });

    it("blocks Authorization with CRLF injection", async () => {
      app.use("*", headerValidation());
      app.get("/api/test", (c) => c.json({ success: true }));

      const res = await app.request("/api/test", {
        headers: {
          Authorization: "Bearer token\r\nX-Injected: malicious",
        },
      });

      expect(res.status).toBe(400);
    });
  });

  describe("Content-Type validation", () => {
    it("allows valid Content-Type headers", async () => {
      app.use("*", headerValidation());
      app.post("/api/test", (c) => c.json({ success: true }));

      const res = await app.request("/api/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      expect(res.status).toBe(200);
    });

    it("blocks Content-Type with injection", async () => {
      app.use("*", headerValidation());
      app.post("/api/test", (c) => c.json({ success: true }));

      const res = await app.request("/api/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json\r\nX-Injected: malicious",
        },
      });

      expect(res.status).toBe(400);
    });
  });

  describe("Strict header validation", () => {
    it("uses shorter max length in strict mode", async () => {
      app.use("*", strictHeaderValidation());
      app.get("/api/test", (c) => c.json({ success: true }));

      // Strict mode has maxLength of 1024
      const longValue = "A".repeat(1025);
      const res = await app.request("/api/test", {
        headers: {
          "User-Agent": longValue,
        },
      });

      expect(res.status).toBe(400);
    });

    it("allows normal headers in strict mode", async () => {
      app.use("*", strictHeaderValidation());
      app.get("/api/test", (c) => c.json({ success: true }));

      const res = await app.request("/api/test", {
        headers: {
          "User-Agent": "Mozilla/5.0",
          Referer: "https://example.com",
          Host: "example.com",
        },
      });

      expect(res.status).toBe(200);
    });
  });

  describe("Options configuration", () => {
    it("can disable User-Agent validation", async () => {
      app.use("*", headerValidation({ validateUserAgent: false }));
      app.get("/api/test", (c) => c.json({ success: true }));

      const res = await app.request("/api/test", {
        headers: {
          "User-Agent": "<script>alert(1)</script>",
        },
      });

      // Should pass when User-Agent validation is disabled
      expect(res.status).toBe(200);
    });

    it("can disable Referer validation", async () => {
      app.use("*", headerValidation({ validateReferer: false }));
      app.get("/api/test", (c) => c.json({ success: true }));

      const res = await app.request("/api/test", {
        headers: {
          Referer: "javascript:alert(1)",
        },
      });

      // Should pass when Referer validation is disabled
      expect(res.status).toBe(200);
    });

    it("can disable CRLF injection check", async () => {
      app.use("*", headerValidation({ checkCRLFInjection: false }));
      app.get("/api/test", (c) => c.json({ success: true }));

      const res = await app.request("/api/test", {
        headers: {
          "X-Custom": "value\r\nInjected: true",
        },
      });

      // Should pass when CRLF check is disabled
      expect(res.status).toBe(200);
    });

    it("can disable Host validation", async () => {
      app.use("*", headerValidation({ validateHost: false }));
      app.get("/api/test", (c) => c.json({ success: true }));

      const res = await app.request("/api/test", {
        headers: {
          Host: "evil.com/path",
        },
      });

      // Should pass when Host validation is disabled
      expect(res.status).toBe(200);
    });
  });

  describe("Multiple header validation", () => {
    it("validates multiple headers simultaneously", async () => {
      app.use("*", headerValidation());
      app.get("/api/test", (c) => c.json({ success: true }));

      const res = await app.request("/api/test", {
        headers: {
          "User-Agent": "Mozilla/5.0",
          Referer: "https://example.com",
          Host: "example.com",
          Accept: "application/json",
          "X-Custom": "custom-value",
        },
      });

      expect(res.status).toBe(200);
    });

    it("fails on first malicious header", async () => {
      app.use("*", headerValidation());
      app.get("/api/test", (c) => c.json({ success: true }));

      const res = await app.request("/api/test", {
        headers: {
          "User-Agent": "<script>alert(1)</script>",
          Referer: "https://example.com",
        },
      });

      expect(res.status).toBe(400);
    });
  });
});
