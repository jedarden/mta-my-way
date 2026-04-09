/**
 * Unit tests for CSRF protection middleware.
 *
 * Tests:
 * - CSRF token generation for safe methods
 * - CSRF token validation for unsafe methods
 * - Token rotation after use
 * - Session-bound tokens
 * - Token expiration
 * - Single-use token enforcement
 * - Cookie-based token storage
 * - Header and form field token extraction
 * - Path exclusion support
 */

import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { beforeEach, describe, expect, it } from "vitest";
import {
  csrfProtection,
  generateCsrfToken,
  generateSessionCsrfToken,
  getCsrfToken,
  markCsrfTokenUsed,
  revokeCsrfToken,
  validateCsrfToken,
} from "./csrf-protection.js";

describe("CSRF protection middleware", () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.use("*", csrfProtection());
    app.get("/api/test", (c) => c.json({ message: "ok", csrfToken: getCsrfToken(c) }));
    app.post("/api/test", (c) => c.json({ message: "created" }));
    app.put("/api/test", (c) => c.json({ message: "updated" }));
    app.delete("/api/test", (c) => c.json({ message: "deleted" }));
    app.patch("/api/test", (c) => c.json({ message: "patched" }));
  });

  describe("safe methods (GET, HEAD, OPTIONS)", () => {
    it("generates and sets CSRF token for GET requests", async () => {
      const res = await app.request("/api/test");

      expect(res.status).toBe(200);

      // Check for Set-Cookie header
      const setCookie = res.headers.get("Set-Cookie");
      expect(setCookie).toBeTruthy();
      expect(setCookie).toContain("csrf_token=");
      expect(setCookie).toContain("SameSite=Strict");
      expect(setCookie).toContain("HttpOnly");
      expect(setCookie).toContain("Secure");

      // Check for token in response body
      const body = await res.json();
      expect(body.csrfToken).toBeTruthy();
      expect(typeof body.csrfToken).toBe("string");
      expect(body.csrfToken.length).toBeGreaterThan(0);
    });

    it("allows GET requests without CSRF token validation", async () => {
      const res = await app.request("/api/test");

      expect(res.status).toBe(200);
    });

    it("reuses existing valid token from cookie", async () => {
      // First request to get token
      const res1 = await app.request("/api/test");
      const body1 = await res1.json();
      const firstToken = body1.csrfToken;

      // Extract token from cookie
      const setCookie = res1.headers.get("Set-Cookie");
      const cookieMatch = setCookie?.match(/csrf_token=([^;]+)/);
      const cookieToken = cookieMatch ? cookieMatch[1] : null;

      // Second request with the cookie
      const res2 = await app.request("/api/test", {
        headers: { Cookie: `csrf_token=${cookieToken}` },
      });
      const body2 = await res2.json();

      // Should reuse the same token
      expect(body2.csrfToken).toBe(firstToken);
    });
  });

  describe("unsafe methods (POST, PUT, DELETE, PATCH)", () => {
    it("rejects POST requests without CSRF token", async () => {
      const res = await app.request("/api/test", {
        method: "POST",
      });

      expect(res.status).toBe(403);
      const bodyText = await res.text();
      expect(bodyText).toContain("CSRF");
    });

    it("rejects POST requests with invalid CSRF token", async () => {
      const res = await app.request("/api/test", {
        method: "POST",
        headers: { "X-CSRF-Token": "invalid-token-12345" },
      });

      expect(res.status).toBe(403);
    });

    it("accepts POST requests with valid CSRF token in header", async () => {
      // First, get a valid token via GET
      const getRes = await app.request("/api/test");
      const getBody = await getRes.json();
      const token = getBody.csrfToken;

      // Use the token in POST request
      const postRes = await app.request("/api/test", {
        method: "POST",
        headers: { "X-CSRF-Token": token },
      });

      expect(postRes.status).toBe(200);
      const postBody = await postRes.json();
      expect(postBody.message).toBe("created");
    });

    it("accepts POST requests with valid CSRF token in JSON body", async () => {
      // First, get a valid token via GET
      const getRes = await app.request("/api/test");
      const getBody = await getRes.json();
      const token = getBody.csrfToken;

      // Use the token in POST request body
      const postRes = await app.request("/api/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csrf_token: token }),
      });

      expect(postRes.status).toBe(200);
    });

    it("accepts PUT requests with valid CSRF token", async () => {
      const getRes = await app.request("/api/test");
      const getBody = await getRes.json();
      const token = getBody.csrfToken;

      const putRes = await app.request("/api/test", {
        method: "PUT",
        headers: { "X-CSRF-Token": token },
      });

      expect(putRes.status).toBe(200);
    });

    it("accepts DELETE requests with valid CSRF token", async () => {
      const getRes = await app.request("/api/test");
      const getBody = await getRes.json();
      const token = getBody.csrfToken;

      const deleteRes = await app.request("/api/test", {
        method: "DELETE",
        headers: { "X-CSRF-Token": token },
      });

      expect(deleteRes.status).toBe(200);
    });

    it("accepts PATCH requests with valid CSRF token", async () => {
      const getRes = await app.request("/api/test");
      const getBody = await getRes.json();
      const token = getBody.csrfToken;

      const patchRes = await app.request("/api/test", {
        method: "PATCH",
        headers: { "X-CSRF-Token": token },
      });

      expect(patchRes.status).toBe(200);
    });

    it("rotates token after successful state-changing request", async () => {
      // Get initial token
      const getRes = await app.request("/api/test");
      const getBody = await getRes.json();
      const initialToken = getBody.csrfToken;

      // Use token in POST request
      const postRes = await app.request("/api/test", {
        method: "POST",
        headers: { "X-CSRF-Token": initialToken },
      });

      expect(postRes.status).toBe(200);

      // Check that a new token was set
      const setCookie = postRes.headers.get("Set-Cookie");
      expect(setCookie).toBeTruthy();
      expect(setCookie).toContain("csrf_token=");

      // The old token should no longer work
      const postRes2 = await app.request("/api/test", {
        method: "POST",
        headers: { "X-CSRF-Token": initialToken },
      });

      expect(postRes2.status).toBe(403);
    });

    it("rejects reused tokens (single-use enforcement)", async () => {
      // Get initial token
      const getRes = await app.request("/api/test");
      const getBody = await getRes.json();
      const token = getBody.csrfToken;

      // Use token successfully
      const postRes1 = await app.request("/api/test", {
        method: "POST",
        headers: { "X-CSRF-Token": token },
      });
      expect(postRes1.status).toBe(200);

      // Try to reuse the same token
      const postRes2 = await app.request("/api/test", {
        method: "POST",
        headers: { "X-CSRF-Token": token },
      });
      expect(postRes2.status).toBe(403);
    });
  });

  describe("token extraction from various sources", () => {
    it("extracts token from X-CSRF-Token header", async () => {
      const getRes = await app.request("/api/test");
      const getBody = await getRes.json();
      const token = getBody.csrfToken;

      const postRes = await app.request("/api/test", {
        method: "POST",
        headers: { "X-CSRF-Token": token },
      });

      expect(postRes.status).toBe(200);
    });

    it("extracts token from JSON body", async () => {
      const getRes = await app.request("/api/test");
      const getBody = await getRes.json();
      const token = getBody.csrfToken;

      const postRes = await app.request("/api/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csrf_token: token }),
      });

      expect(postRes.status).toBe(200);
    });
  });

  describe("path exclusion", () => {
    it("excludes specified paths from CSRF protection", async () => {
      const excludeApp = new Hono();
      excludeApp.use("*", csrfProtection({ excludePaths: ["/api/public"] }));
      excludeApp.post("/api/public/data", (c) => c.json({ message: "ok" }));
      excludeApp.post("/api/protected/data", (c) => c.json({ message: "ok" }));

      // Public endpoint should work without token
      const publicRes = await excludeApp.request("/api/public/data", {
        method: "POST",
      });
      expect(publicRes.status).toBe(200);

      // Protected endpoint should require token
      const protectedRes = await excludeApp.request("/api/protected/data", {
        method: "POST",
      });
      expect(protectedRes.status).toBe(403);
    });
  });

  describe("token functions", () => {
    it("generates unique tokens", () => {
      const token1 = generateCsrfToken();
      const token2 = generateCsrfToken();

      expect(token1).toBeTruthy();
      expect(token2).toBeTruthy();
      expect(token1).not.toBe(token2);
      expect(token1.length).toBe(64); // 32 bytes = 64 hex chars
    });

    it("generates session-bound tokens", () => {
      const sessionId = "test-session-123";
      const token = generateSessionCsrfToken(sessionId);

      expect(token).toBeTruthy();
      expect(token.length).toBe(64);

      // Token should be valid for the session
      expect(validateCsrfToken(token, { sessionId })).toBe(true);

      // Token should not be valid for a different session
      expect(validateCsrfToken(token, { sessionId: "other-session" })).toBe(false);
    });

    it("validates tokens correctly", () => {
      const token = generateCsrfToken();

      expect(validateCsrfToken(token)).toBe(true);
      expect(validateCsrfToken("invalid-token")).toBe(false);
    });

    it("marks tokens as used", () => {
      const token = generateCsrfToken();

      expect(validateCsrfToken(token, { allowReuse: false })).toBe(true);

      markCsrfTokenUsed(token);

      // Token should no longer be valid for single-use
      expect(validateCsrfToken(token, { allowReuse: false })).toBe(false);

      // But should still be valid with reuse allowed
      expect(validateCsrfToken(token, { allowReuse: true })).toBe(true);
    });

    it("revokes tokens", () => {
      const token = generateCsrfToken();

      expect(validateCsrfToken(token)).toBe(true);

      revokeCsrfToken(token);

      expect(validateCsrfToken(token)).toBe(false);
    });
  });

  describe("custom options", () => {
    it("supports custom token header name", async () => {
      const customApp = new Hono();
      customApp.use("*", csrfProtection({ tokenHeader: "X-XSRF-Token" }));
      customApp.get("/test", (c) => c.json({ csrfToken: getCsrfToken(c) }));
      customApp.post("/test", (c) => c.json({ message: "ok" }));

      const getRes = await customApp.request("/test");
      const getBody = await getRes.json();
      const token = getBody.csrfToken;

      const postRes = await customApp.request("/test", {
        method: "POST",
        headers: { "X-XSRF-Token": token },
      });

      expect(postRes.status).toBe(200);
    });

    it("supports custom error message", async () => {
      const customApp = new Hono();
      customApp.use("*", csrfProtection({ errorMessage: "Custom CSRF error" }));
      customApp.post("/test", (c) => c.json({ message: "ok" }));

      const res = await customApp.request("/test", { method: "POST" });

      expect(res.status).toBe(403);
      const bodyText = await res.text();
      expect(bodyText).toBe("Custom CSRF error");
    });

    it("supports SameSite=Lax cookies", async () => {
      const laxApp = new Hono();
      laxApp.use("*", csrfProtection({ sameSiteStrict: false }));
      laxApp.get("/test", (c) => c.json({ ok: true }));

      const res = await laxApp.request("/test");

      const setCookie = res.headers.get("Set-Cookie");
      expect(setCookie).toContain("SameSite=Lax");
      expect(setCookie).not.toContain("SameSite=Strict");
    });
  });
});
