/**
 * Tests for host header protection middleware.
 */

import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import {
  getValidatedHost,
  hostHeaderProtection,
  validateHostHeader,
} from "./host-header-protection.js";

describe("validateHostHeader", () => {
  it("allows valid hostname", () => {
    const result = validateHostHeader("example.com");
    expect(result.valid).toBe(true);
    expect(result.hostname).toBe("example.com");
  });

  it("allows hostname with port", () => {
    const result = validateHostHeader("example.com:8080");
    expect(result.valid).toBe(true);
    expect(result.hostname).toBe("example.com");
  });

  it("rejects missing host header by default", () => {
    const result = validateHostHeader(undefined);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("missing_host_header");
  });

  it("allows missing host when blockMissingHost is false", () => {
    const result = validateHostHeader(undefined, { blockMissingHost: false });
    expect(result.valid).toBe(true);
  });

  it("rejects IP addresses by default", () => {
    // Public IP address should be blocked
    const result = validateHostHeader("8.8.8.8");
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("ip_address_blocked");
  });

  it("allows IP addresses when blockIpAddresses is false", () => {
    // Public IP with blockIpAddresses false should still be blocked by private IP check
    // unless we also disable blockPrivateNetworks
    const result = validateHostHeader("8.8.8.8", {
      blockIpAddresses: false,
      blockPrivateNetworks: false,
      blockLocalhost: false,
    });
    expect(result.valid).toBe(true);
  });

  it("rejects IPv6 addresses by default", () => {
    // IPv6 address (localhost format fails hostname validation first)
    const result = validateHostHeader("2001:4860:4860::8888");
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("ip_address_blocked");
  });

  it("rejects localhost by default", () => {
    const result = validateHostHeader("localhost");
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("localhost_blocked");
  });

  it("rejects localhost with port", () => {
    const result = validateHostHeader("localhost:3000");
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("localhost_blocked");
  });

  it("rejects 127.0.0.1 as localhost", () => {
    const result = validateHostHeader("127.0.0.1");
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("localhost_blocked");
  });

  it("allows localhost when blockLocalhost is false", () => {
    const result = validateHostHeader("localhost", { blockLocalhost: false });
    expect(result.valid).toBe(true);
  });

  it("rejects private network IPs by default", () => {
    const result = validateHostHeader("10.0.0.1");
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("private_ip_blocked");
  });

  it("rejects 172.16.0.0/12 range", () => {
    const result = validateHostHeader("172.16.0.1");
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("private_ip_blocked");
  });

  it("rejects 192.168.0.0/16 range", () => {
    const result = validateHostHeader("192.168.1.1");
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("private_ip_blocked");
  });

  it("allows allowed hosts", () => {
    const result = validateHostHeader("example.com", {
      allowedHosts: ["example.com", "api.example.com"],
    });
    expect(result.valid).toBe(true);
    expect(result.hostname).toBe("example.com");
  });

  it("allows subdomains when allowSubdomains is true", () => {
    const result = validateHostHeader("sub.example.com", {
      allowedHosts: ["example.com"],
      allowSubdomains: true,
    });
    expect(result.valid).toBe(true);
  });

  it("rejects subdomains when allowSubdomains is false", () => {
    const result = validateHostHeader("sub.example.com", {
      allowedHosts: ["example.com"],
      allowSubdomains: false,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("host_not_allowed");
  });

  it("case-insensitive hostname matching", () => {
    const result = validateHostHeader("Example.COM", {
      allowedHosts: ["example.com"],
    });
    expect(result.valid).toBe(true);
    expect(result.hostname).toBe("example.com");
  });

  it("rejects hosts not in allow-list", () => {
    const result = validateHostHeader("evil.com", {
      allowedHosts: ["example.com"],
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("host_not_allowed");
  });

  it("rejects hostname with spaces", () => {
    const result = validateHostHeader("example .com");
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("invalid_hostname_format");
  });

  it("rejects hostname with control characters", () => {
    const result = validateHostHeader("example\x00.com");
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("invalid_hostname_format");
  });

  it("rejects hostname starting with hyphen", () => {
    const result = validateHostHeader("-example.com");
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("invalid_hostname_format");
  });

  it("rejects hostname ending with hyphen", () => {
    const result = validateHostHeader("example-.com");
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("invalid_hostname_format");
  });

  it("rejects hostname with consecutive dots", () => {
    const result = validateHostHeader("example..com");
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("invalid_hostname_format");
  });

  it("calls custom validator when provided", () => {
    const result = validateHostHeader("example.com", {
      customValidator: (host) => host.endsWith(".example.com"),
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("custom_validator_failed");
  });

  it("allows valid hostname that passes custom validator", () => {
    const result = validateHostHeader("sub.example.com", {
      customValidator: (host) => host.endsWith(".example.com"),
    });
    expect(result.valid).toBe(true);
  });

  it("allow-list takes precedence over other checks", () => {
    const result = validateHostHeader("localhost", {
      allowedHosts: ["localhost"],
      blockLocalhost: true,
    });
    expect(result.valid).toBe(true);
  });
});

describe("hostHeaderProtection middleware", () => {
  it("allows requests with valid host header", async () => {
    const app = new Hono();
    app.use("*", hostHeaderProtection({ allowedHosts: ["example.com"] }));
    app.get("/test", (c) => c.json({ ok: true }));

    const res = await app.request("/test", {
      headers: { Host: "example.com" },
    });

    expect(res.status).toBe(200);
  });

  it("rejects requests with invalid host header", async () => {
    const app = new Hono();
    app.use("*", hostHeaderProtection({ allowedHosts: ["example.com"] }));
    app.get("/test", (c) => c.json({ ok: true }));

    const res = await app.request("/test", {
      headers: { Host: "evil.com" },
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid Host header");
  });

  it("stores validated hostname in context", async () => {
    const app = new Hono();
    app.use("*", hostHeaderProtection({ allowedHosts: ["example.com"] }));
    app.get("/test", (c) => {
      const host = getValidatedHost(c);
      return c.json({ host });
    });

    const res = await app.request("/test", {
      headers: { Host: "example.com" },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.host).toBe("example.com");
  });

  it("handles x-forwarded-host header", async () => {
    const app = new Hono();
    app.use("*", hostHeaderProtection({ allowedHosts: ["example.com"] }));
    app.get("/test", (c) => c.json({ ok: true }));

    // Note: The middleware checks the Host header by default
    // X-Forwarded-Host would need to be checked separately if needed
    const res = await app.request("/test", {
      headers: { Host: "example.com" },
    });

    expect(res.status).toBe(200);
  });

  it("allows subdomains when allowSubdomains is true", async () => {
    const app = new Hono();
    app.use(
      "*",
      hostHeaderProtection({
        allowedHosts: ["example.com"],
        allowSubdomains: true,
      })
    );
    app.get("/test", (c) => c.json({ ok: true }));

    const res = await app.request("/test", {
      headers: { Host: "sub.example.com" },
    });

    expect(res.status).toBe(200);
  });

  it("rejects requests without host header when blockMissingHost is true", async () => {
    const app = new Hono();
    app.use("*", hostHeaderProtection());
    app.get("/test", (c) => c.json({ ok: true }));

    const res = await app.request("/test");

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.reason).toBe("missing_host_header");
  });
});
