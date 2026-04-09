/**
 * Tests for SSRF protection middleware.
 */

import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import {
  createMtaFeedAllowList,
  safeFetch,
  ssrfProtection,
  validateMtaFeedUrl,
  validateUrl,
} from "./ssrf-protection.js";

describe("SSRF Protection", () => {
  describe("validateUrl", () => {
    it("should reject invalid URLs", () => {
      const result = validateUrl("not-a-url");
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("invalid_url");
    });

    it("should reject URLs that are too long", () => {
      const longUrl = "https://example.com/" + "a".repeat(2000);
      const result = validateUrl(longUrl, { maxUrlLength: 100 });
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("url_too_long");
    });

    it("should reject non-HTTP/HTTPS protocols", () => {
      const result = validateUrl("file:///etc/passwd");
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("protocol_not_allowed");
    });

    it("should reject localhost", () => {
      const result = validateUrl("http://localhost:8080");
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("localhost_blocked");
    });

    it("should reject 127.0.0.1", () => {
      const result = validateUrl("http://127.0.0.1:8080");
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("private_ip_blocked");
    });

    it("should reject private network IPs", () => {
      const result = validateUrl("http://192.168.1.1");
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("private_ip_blocked");
    });

    it("should reject link-local addresses", () => {
      const result = validateUrl("http://169.254.169.254/latest/meta-data/");
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("link_local_blocked");
    });

    it("should reject blocked hostnames", () => {
      const result = validateUrl("http://metadata.google.internal/");
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("hostname_blocked");
    });

    it("should reject common infrastructure ports", () => {
      const result = validateUrl("http://example.com:22");
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("port_blocked");
    });

    it("should reject IPv6 zone identifiers", () => {
      const result = validateUrl("http://[fe80::1%25eth0]:8080");
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("ipv6_zone_id_blocked");
    });

    it("should allow valid HTTPS URLs", () => {
      const result = validateUrl("https://example.com/api");
      expect(result.valid).toBe(true);
      expect(result.url).toBeDefined();
      expect(result.url!.hostname).toBe("example.com");
    });

    it("should allow valid HTTP URLs", () => {
      const result = validateUrl("http://api.example.com/data");
      expect(result.valid).toBe(true);
      expect(result.url).toBeDefined();
    });

    it("should respect allow-list when configured", () => {
      const result = validateUrl("https://api.example.com/data", {
        allowedHostnames: ["api.example.com"],
      });
      expect(result.valid).toBe(true);
    });

    it("should reject URLs not in allow-list", () => {
      const result = validateUrl("https://evil.com/data", {
        allowedHostnames: ["api.example.com"],
      });
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("hostname_not_allowed");
    });

    it("should allow subdomains when configured", () => {
      const result = validateUrl("https://sub.example.com/data", {
        allowedHostnames: ["example.com"],
      });
      expect(result.valid).toBe(true);
    });
  });

  describe("validateMtaFeedUrl", () => {
    it("should allow valid MTA feed URLs", () => {
      const result = validateMtaFeedUrl("https://gtfsrt.prod.obanyc.com/tctrain");
      expect(result.valid).toBe(true);
    });

    it("should reject non-MTA URLs", () => {
      const result = validateMtaFeedUrl("https://evil.com/feed");
      expect(result.valid).toBe(false);
    });

    it("should reject private network URLs", () => {
      const result = validateMtaFeedUrl("http://192.168.1.1/feed");
      expect(result.valid).toBe(false);
    });
  });

  describe("createMtaFeedAllowList", () => {
    it("should return array of allowed MTA hosts", () => {
      const allowList = createMtaFeedAllowList();
      expect(Array.isArray(allowList)).toBe(true);
      expect(allowList.length).toBeGreaterThan(0);
      expect(allowList).toContain("gtfsrt.prod.obanyc.com");
    });
  });

  describe("ssrfProtection middleware", () => {
    it("should block requests with URLs in query parameters", async () => {
      const app = new Hono();
      app.use("*", ssrfProtection());
      app.get("/test", (c) => c.json({ ok: true }));

      const res = await app.request("/test?url=http://localhost:8080");
      expect(res.status).toBe(400);
    });

    it("should block requests with URLs in JSON body", async () => {
      const app = new Hono();
      app.use("*", ssrfProtection());
      app.post("/test", (c) => c.json({ ok: true }));

      const res = await app.request("/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "http://192.168.1.1" }),
      });
      expect(res.status).toBe(400);
    });

    it("should allow requests without URLs", async () => {
      const app = new Hono();
      app.use("*", ssrfProtection());
      app.get("/test", (c) => c.json({ ok: true }));

      const res = await app.request("/test?name=value");
      expect(res.status).toBe(200);
    });

    it("should allow requests with valid URLs when configured", async () => {
      const app = new Hono();
      app.use(
        "*",
        ssrfProtection({ allowUserProvidedUrls: true, allowedHostnames: ["example.com"] })
      );
      app.get("/test", (c) => c.json({ ok: true }));

      const res = await app.request("/test?url=https://example.com/data");
      expect(res.status).toBe(200);
    });
  });

  describe("safeFetch", () => {
    it("should reject invalid URLs", async () => {
      await expect(
        safeFetch("http://localhost:8080", {}, { allowUserProvidedUrls: true })
      ).rejects.toThrow();
    });

    it("should reject URLs when allowUserProvidedUrls is false", async () => {
      await expect(
        safeFetch("https://example.com", {}, { allowUserProvidedUrls: false })
      ).rejects.toThrow("User-provided URLs are not allowed");
    });

    it("should accept valid URLs when configured", async () => {
      // Note: This test would need a mock fetch or a real server
      // For now, we just test that the validation passes
      const result = validateUrl("https://example.com", { allowUserProvidedUrls: true });
      expect(result.valid).toBe(true);
    });
  });
});
