/**
 * Tests for cookie security middleware and utilities.
 */

import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildCookieString,
  clearRefreshTokenCookie,
  clearSessionCookie,
  configureCookieSigning,
  cookieSecurityValidator,
  cookieSessionAuth,
  csrfCookie,
  deleteCookie,
  generateCsrfToken,
  getCsrfToken,
  getRefreshTokenCookie,
  getSessionCookie,
  getSignedCookie,
  setRefreshTokenCookie,
  setSecureCookie,
  setSessionCookie,
  signCookie,
  validateCookieSecurity,
  verifySignedCookie,
} from "./cookie-security.js";

describe("Cookie Security", () => {
  beforeEach(() => {
    // Reset cookie signing configuration before each test
    configureCookieSigning({ secret: "test-secret-key-for-unit-tests", algorithm: "SHA-256" });
  });

  describe("Cookie Signing", () => {
    it("should sign a cookie value", async () => {
      const value = "session-token-123";
      const signed = await signCookie(value);

      expect(signed).toBeDefined();
      expect(typeof signed).toBe("string");
      expect(signed).toContain(":");
    });

    it("should verify a signed cookie value", async () => {
      const value = "session-token-123";
      const signed = await signCookie(value);
      const verified = await verifySignedCookie(signed);

      expect(verified).toBe(value);
    });

    it("should reject tampered signed cookie", async () => {
      const value = "session-token-123";
      const signed = await signCookie(value);

      // Tamper with the signature by changing a character
      const parts = signed.split(":");
      const tamperedSignature = parts[2]!.slice(0, -1) + "0";
      const tampered = `${parts[0]}:${parts[1]}:${tamperedSignature}`;

      const verified = await verifySignedCookie(tampered);
      expect(verified).toBeNull();
    });

    it("should reject expired signed cookie", async () => {
      const value = "session-token-123";
      // Create a signed cookie with old timestamp
      const oldTimestamp = Date.now() - 25 * 60 * 60 * 1000; // 25 hours ago
      const message = `${oldTimestamp}:${value}`;

      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode("test-secret-key-for-unit-tests"),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );

      const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
      const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)));

      const expiredSigned = `${oldTimestamp}:${value}:${signatureB64}`;

      const verified = await verifySignedCookie(expiredSigned);
      expect(verified).toBeNull();
    });

    it("should reject malformed signed cookie", async () => {
      const malformed = "not-a-valid-signed-cookie";

      const verified = await verifySignedCookie(malformed);
      expect(verified).toBeNull();
    });
  });

  describe("Cookie String Building", () => {
    it("should build a secure cookie string with all attributes", () => {
      const cookie = buildCookieString("test", "value", {
        secure: true,
        httpOnly: true,
        sameSite: "strict",
        path: "/",
        domain: "example.com",
        maxAge: 3600,
      });

      expect(cookie).toContain("test=value");
      expect(cookie).toContain("Secure");
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("SameSite=Strict");
      expect(cookie).toContain("Path=/");
      expect(cookie).toContain("Domain=example.com");
      expect(cookie).toContain("Max-Age=3600");
    });

    it("should build a minimal cookie string", () => {
      const cookie = buildCookieString("test", "value");

      expect(cookie).toContain("test=value");
      expect(cookie).toContain("Secure");
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("SameSite=Strict");
    });

    it("should support different SameSite values", () => {
      const laxCookie = buildCookieString("test", "value", { sameSite: "lax" });
      const noneCookie = buildCookieString("test", "value", { sameSite: "none" });

      expect(laxCookie).toContain("SameSite=Lax");
      expect(noneCookie).toContain("SameSite=None");
    });
  });

  describe("CSRF Token Generation", () => {
    it("should generate a CSRF token of specified length", () => {
      const token = generateCsrfToken(32);

      expect(token).toBeDefined();
      expect(token.length).toBe(64); // 32 bytes = 64 hex chars
    });

    it("should generate different tokens each time", () => {
      const token1 = generateCsrfToken();
      const token2 = generateCsrfToken();

      expect(token1).not.toBe(token2);
    });
  });

  describe("Cookie Security Validation", () => {
    it("should validate secure cookies", () => {
      const cookies = [
        "session=abc123; Secure; HttpOnly; SameSite=Strict",
        "csrf_token=xyz789; Secure; SameSite=Strict",
      ];

      const validation = validateCookieSecurity(cookies);

      expect(validation.valid).toBe(true);
      expect(validation.issues).toHaveLength(0);
    });

    it("should detect missing Secure flag", () => {
      const cookies = ["session=abc123; HttpOnly; SameSite=Strict"];

      const validation = validateCookieSecurity(cookies);

      expect(validation.valid).toBe(false);
      expect(validation.issues).toContain("Cookie 'session' missing Secure flag");
    });

    it("should detect missing HttpOnly flag (non-CSRF cookies)", () => {
      const cookies = ["session=abc123; Secure; SameSite=Strict"];

      const validation = validateCookieSecurity(cookies);

      expect(validation.valid).toBe(false);
      expect(validation.issues).toContain("Cookie 'session' missing HttpOnly flag");
    });

    it("should allow missing HttpOnly for CSRF cookies", () => {
      const cookies = ["csrf_token=xyz789; Secure; SameSite=Strict"];

      const validation = validateCookieSecurity(cookies);

      expect(validation.valid).toBe(true);
    });

    it("should detect missing SameSite attribute", () => {
      const cookies = ["session=abc123; Secure; HttpOnly"];

      const validation = validateCookieSecurity(cookies);

      expect(validation.valid).toBe(false);
      expect(validation.issues).toContain("Cookie 'session' missing SameSite attribute");
    });
  });

  describe("CSRF Cookie Middleware", () => {
    it("should set CSRF cookie for safe methods", async () => {
      const app = new Hono();
      app.use("*", csrfCookie());
      app.get("/test", async (c) => c.json({ ok: true }));

      const res = await app.request("/test");

      expect(res.status).toBe(200);
      const setCookieHeaders = res.headers.getSetCookie();
      expect(setCookieHeaders.length).toBeGreaterThan(0);

      const csrfCookieHeader = setCookieHeaders.find((c) => c.startsWith("csrf_token="));
      expect(csrfCookieHeader).toBeDefined();
      expect(csrfCookieHeader).toContain("Secure");
      expect(csrfCookieHeader).toContain("SameSite=Strict");
    });

    it("should reject state-changing requests without CSRF token", async () => {
      const app = new Hono();
      app.use("*", csrfCookie());
      app.post("/test", (c) => c.json({ ok: true }));

      const res = await app.request("/test", { method: "POST" });

      expect(res.status).toBe(403);
    });

    it("should accept state-changing requests with valid CSRF token", async () => {
      const app = new Hono();
      app.use("*", csrfCookie());

      // Add both routes before making any requests
      app.get("/test", async (c) => c.json({ ok: true }));
      app.post("/test", (c) => c.json({ ok: true }));

      // First, get a CSRF token via GET
      const getRes = await app.request("/test");
      const setCookieHeaders = getRes.headers.getSetCookie();
      const csrfCookieHeader = setCookieHeaders.find((c) => c.startsWith("csrf_token="));

      expect(csrfCookieHeader).toBeDefined();
      const signedValue = csrfCookieHeader!.split("=")[1]!.split(";")[0];

      // Extract the actual token from the signed value (format: timestamp:token:signature)
      const parts = signedValue.split(":");
      expect(parts.length).toBe(3);
      const actualToken = parts[1]; // The token is the middle part

      // Now make POST request with CSRF token
      // The Cookie header should contain the signed value
      // The x-csrf-token header should contain the actual token
      const postRes = await app.request("/test", {
        method: "POST",
        headers: {
          Cookie: `csrf_token=${signedValue}`,
          "x-csrf-token": actualToken,
        },
      });

      expect(postRes.status).toBe(200);
    });

    it("should reject mismatched CSRF tokens", async () => {
      const app = new Hono();
      app.use("*", csrfCookie());
      app.post("/test", (c) => c.json({ ok: true }));

      const res = await app.request("/test", {
        method: "POST",
        headers: {
          Cookie: "csrf_token=token1",
          "x-csrf-token": "token2",
        },
      });

      expect(res.status).toBe(403);
    });
  });

  describe("Session Cookie Management", () => {
    it("should set session cookie with security attributes", async () => {
      const app = new Hono();
      app.get("/set", async (c) => {
        await setSessionCookie(c, "session-token-123");
        return c.json({ ok: true });
      });

      const res = await app.request("/set");

      expect(res.status).toBe(200);
      const setCookieHeaders = res.headers.getSetCookie();
      const sessionCookie = setCookieHeaders.find((c) => c.startsWith("session_token="));

      expect(sessionCookie).toBeDefined();
      expect(sessionCookie).toContain("Secure");
      expect(sessionCookie).toContain("HttpOnly");
      expect(sessionCookie).toContain("SameSite=Strict");
      expect(sessionCookie).toContain("Max-Age=86400"); // 24 hours
    });

    it("should get session token from request", async () => {
      const app = new Hono();
      app.get("/get", async (c) => {
        const token = await getSessionCookie(c);
        return c.json({ token });
      });

      const res = await app.request("/get", {
        headers: {
          Cookie: "session_token=my-session-token",
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.token).toBe("my-session-token");
    });

    it("should return null when session cookie not found", async () => {
      const app = new Hono();
      app.get("/get", async (c) => {
        const token = await getSessionCookie(c);
        return c.json({ token });
      });

      const res = await app.request("/get");

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.token).toBeNull();
    });

    it("should clear session cookie", async () => {
      const app = new Hono();
      app.get("/clear", (c) => {
        clearSessionCookie(c);
        return c.json({ ok: true });
      });

      const res = await app.request("/clear");

      expect(res.status).toBe(200);
      const setCookieHeaders = res.headers.getSetCookie();
      const clearedCookie = setCookieHeaders.find((c) => c.startsWith("session_token="));

      expect(clearedCookie).toBeDefined();
      expect(clearedCookie).toContain("Max-Age=0");
    });
  });

  describe("Refresh Token Cookie Management", () => {
    it("should set refresh token cookie", async () => {
      const app = new Hono();
      app.get("/set", async (c) => {
        await setRefreshTokenCookie(c, "refresh-token-123");
        return c.json({ ok: true });
      });

      const res = await app.request("/set");

      expect(res.status).toBe(200);
      const setCookieHeaders = res.headers.getSetCookie();
      const refreshCookie = setCookieHeaders.find((c) => c.startsWith("refresh_token="));

      expect(refreshCookie).toBeDefined();
      expect(refreshCookie).toContain("Secure");
      expect(refreshCookie).toContain("HttpOnly");
      expect(refreshCookie).toContain("Max-Age=2592000"); // 30 days
    });

    it("should get refresh token from request", async () => {
      const app = new Hono();
      app.get("/get", async (c) => {
        const token = await getRefreshTokenCookie(c);
        return c.json({ token });
      });

      const res = await app.request("/get", {
        headers: {
          Cookie: "refresh_token=my-refresh-token",
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.token).toBe("my-refresh-token");
    });

    it("should clear refresh token cookie", async () => {
      const app = new Hono();
      app.get("/clear", (c) => {
        clearRefreshTokenCookie(c);
        return c.json({ ok: true });
      });

      const res = await app.request("/clear");

      expect(res.status).toBe(200);
      const setCookieHeaders = res.headers.getSetCookie();
      const clearedCookie = setCookieHeaders.find((c) => c.startsWith("refresh_token="));

      expect(clearedCookie).toBeDefined();
      expect(clearedCookie).toContain("Max-Age=0");
    });
  });

  describe("Delete Cookie Utility", () => {
    it("should delete cookie by setting Max-Age=0", async () => {
      const app = new Hono();
      app.get("/delete", (c) => {
        deleteCookie(c, "test_cookie");
        return c.json({ ok: true });
      });

      const res = await app.request("/delete");

      expect(res.status).toBe(200);
      const setCookieHeaders = res.headers.getSetCookie();
      const deletedCookie = setCookieHeaders.find((c) => c.startsWith("test_cookie="));

      expect(deletedCookie).toBeDefined();
      expect(deletedCookie).toContain("Max-Age=0");
      expect(deletedCookie).toContain("test_cookie=");
    });
  });

  describe("Cookie Security Validator Middleware", () => {
    it("should not log issues for secure cookies in development", async () => {
      const app = new Hono();
      app.use("*", cookieSecurityValidator());
      app.get("/test", (c) => {
        setSecureCookie(c, "test", "value", { secure: true, httpOnly: true, sameSite: "strict" });
        return c.json({ ok: true });
      });

      // Should not throw
      const res = await app.request("/test");
      expect(res.status).toBe(200);
    });
  });

  describe("Cookie Session Auth Middleware", () => {
    it("should attach session token from cookie to context", async () => {
      const app = new Hono();
      app.use("*", cookieSessionAuth());
      app.get("/test", (c) => {
        const sessionToken = c.get("sessionToken");
        return c.json({ hasSessionToken: !!sessionToken, sessionToken });
      });

      const res = await app.request("/test", {
        headers: {
          Cookie: "session_token=my-session-token",
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.hasSessionToken).toBe(true);
      expect(json.sessionToken).toBe("my-session-token");
    });

    it("should attach CSRF token to context", async () => {
      const app = new Hono();
      app.use("*", csrfCookie());
      app.use("*", cookieSessionAuth());
      app.get("/test", (c) => {
        const csrfToken = c.get("csrfToken");
        return c.json({ hasCsrfToken: !!csrfToken });
      });

      // First request to set the cookie
      const res1 = await app.request("/test");
      const setCookieHeaders = res1.headers.getSetCookie();
      const csrfCookieHeader = setCookieHeaders.find((c) => c.startsWith("csrf_token="));

      // Second request with the cookie
      const cookieValue = csrfCookieHeader ? csrfCookieHeader.split(";")[0] : "";
      const res2 = await app.request("/test", {
        headers: {
          Cookie: cookieValue,
        },
      });

      expect(res2.status).toBe(200);
      const json = await res2.json();
      expect(json.hasCsrfToken).toBe(true);
    });
  });

  describe("Get Signed Cookie", () => {
    it("should retrieve and verify signed cookie", async () => {
      const app = new Hono();
      app.get("/set", async (c) => {
        await setSecureCookie(c, "test", "value", { signed: true });
        return c.json({ ok: true });
      });

      const setRes = await app.request("/set");
      const setCookieHeaders = setRes.headers.getSetCookie();
      const cookieHeader = setCookieHeaders.join("; ");

      const app2 = new Hono();
      app2.get("/get", async (c) => {
        const value = await getSignedCookie(c, "test");
        return c.json({ value });
      });

      const getRes = await app2.request("/get", {
        headers: {
          Cookie: cookieHeader,
        },
      });

      expect(getRes.status).toBe(200);
      const json = await getRes.json();
      expect(json.value).toBe("value");
    });

    it("should return null for missing cookie", async () => {
      const app = new Hono();
      app.get("/get", async (c) => {
        const value = await getSignedCookie(c, "nonexistent");
        return c.json({ value });
      });

      const res = await app.request("/get");

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.value).toBeNull();
    });
  });

  describe("Get CSRF Token Utility", () => {
    it("should retrieve CSRF token from cookies", async () => {
      const app = new Hono();
      app.use("*", csrfCookie());
      app.get("/get", async (c) => {
        const token = await getCsrfToken(c);
        return c.json({ token: !!token });
      });

      // First request sets the cookie
      const res1 = await app.request("/get");
      expect(res1.status).toBe(200);

      // Get the cookie from the response
      const setCookieHeaders = res1.headers.getSetCookie();
      const csrfCookieHeader = setCookieHeaders.find((c) => c.startsWith("csrf_token="));

      // Second request with the cookie should have the token
      const cookieValue = csrfCookieHeader ? csrfCookieHeader.split(";")[0] : "";
      const res2 = await app.request("/get", {
        headers: {
          Cookie: cookieValue,
        },
      });

      expect(res2.status).toBe(200);
      const json = await res2.json();
      expect(json.token).toBe(true);
    });
  });

  describe("Set Secure Cookie", () => {
    it("should set cookie with signing by default", async () => {
      const app = new Hono();
      app.get("/set", async (c) => {
        await setSecureCookie(c, "test", "value");
        return c.json({ ok: true });
      });

      const res = await app.request("/set");

      expect(res.status).toBe(200);
      const setCookieHeaders = res.headers.getSetCookie();
      const cookie = setCookieHeaders.find((c) => c.startsWith("test="));

      expect(cookie).toBeDefined();
      // Signed cookies have format: timestamp:value:signature
      const cookieValue = cookie!.split("=")[1]!.split(";")[0];
      expect(cookieValue).toContain(":");
    });

    it("should set unsigned cookie when signing disabled", async () => {
      const app = new Hono();
      app.get("/set", async (c) => {
        await setSecureCookie(c, "test", "value", { signed: false });
        return c.json({ ok: true });
      });

      const res = await app.request("/set");

      expect(res.status).toBe(200);
      const setCookieHeaders = res.headers.getSetCookie();
      const cookie = setCookieHeaders.find((c) => c.startsWith("test="));

      expect(cookie).toBeDefined();
      const cookieValue = cookie!.split("=")[1]!.split(";")[0];
      expect(cookieValue).toBe("value");
    });
  });
});
