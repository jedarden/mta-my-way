/**
 * Integration coverage for the security middleware that depends on ordering.
 *
 * These tests intentionally mount the real authentication, authorization,
 * rate-limit, CSRF, cookie, host-validation, and response-header middleware on
 * small Hono applications.  Unit tests cover each primitive separately; this
 * suite verifies that context and state flow through the composed chains.
 */

import type { Context } from "hono";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { _clearAllRateLimits, authRateLimit } from "./auth-rate-limit.js";
import {
  type ApiKey,
  getAuthContext,
  hashApiKey,
  optionalAuth,
  registerApiKey,
  resetAuthenticationState,
} from "./authentication.js";
import { requireWrite } from "./authorization.js";
import {
  configureCookieSigning,
  cookieSecurityValidator,
  cookieSessionAuth,
  csrfCookie,
  setRefreshTokenCookie,
  setSessionCookie,
  validateCookieSecurity,
} from "./cookie-security.js";
import { clearCsrfTokenStore, csrfProtection } from "./csrf-protection.js";
import { hostHeaderProtection } from "./host-header-protection.js";
import { securityHeaders } from "./security-headers.js";

const ALLOWED_HOST = "api.example.com";

interface TestPrincipal {
  keyId: string;
  authorization: string;
}

async function registerPrincipal(
  keyId: string,
  secret: string,
  scope: ApiKey["scope"] = "write",
  role: ApiKey["role"] = "user"
): Promise<TestPrincipal> {
  const hashed = await hashApiKey(secret);
  await registerApiKey({
    keyId,
    keyHash: hashed.hash,
    keySalt: hashed.salt,
    scope,
    role,
    owner: keyId,
    rateLimitTier: 10,
    active: true,
    createdAt: Date.now(),
    expiresAt: 0,
    failedAttempts: 0,
  });

  return { keyId, authorization: `Bearer ${keyId}:${secret}` };
}

function principalKey(c: Context): string | null {
  return getAuthContext(c)?.keyId ?? null;
}

function endpointPrincipalKey(c: Context): string | null {
  const keyId = principalKey(c);
  return keyId ? `${c.req.path}:${keyId}` : null;
}

beforeEach(() => {
  resetAuthenticationState();
  _clearAllRateLimits();
  clearCsrfTokenStore();
  configureCookieSigning({
    secret: "integration-cookie-signing-secret",
    algorithm: "SHA-256",
  });
});

afterEach(() => {
  resetAuthenticationState();
  _clearAllRateLimits();
  clearCsrfTokenStore();
});

describe("authentication rate limits across the middleware chain", () => {
  it("counts requests that reach authorization even when authorization rejects them", async () => {
    const alice = await registerPrincipal("rate_alice", "alice-secret");
    const app = new Hono();

    app.use("/api/*", optionalAuth({ allowSessions: false }));
    app.use(
      "/api/*",
      authRateLimit("standard", {
        config: {
          requests: 2,
          windowMs: 60_000,
          skipSuccessfulRequests: false,
          skipTrustedIps: false,
          banThreshold: 0,
        },
        keyExtractor: principalKey,
      })
    );
    app.get("/api/protected", requireWrite(), (c) => c.json({ keyId: getAuthContext(c)?.keyId }));

    const first = await app.request("/api/protected", {
      headers: { "CF-Connecting-IP": "198.51.100.10" },
    });
    expect(first.status).toBe(401);
    expect(first.headers.get("X-RateLimit-Remaining")).toBe("1");

    const second = await app.request("/api/protected", {
      headers: {
        Authorization: alice.authorization,
        "CF-Connecting-IP": "198.51.100.10",
      },
    });
    expect(second.status).toBe(200);
    expect(second.headers.get("X-RateLimit-Remaining")).toBe("0");

    const blocked = await app.request("/api/protected", {
      headers: {
        Authorization: alice.authorization,
        "CF-Connecting-IP": "198.51.100.10",
      },
    });
    expect(blocked.status).toBe(429);
  });

  it("enforces a principal limit across IP changes without affecting another user", async () => {
    const alice = await registerPrincipal("principal_alice", "alice-secret");
    const bob = await registerPrincipal("principal_bob", "bob-secret");
    const app = new Hono();

    app.use("/api/*", optionalAuth({ allowSessions: false }));
    app.use(
      "/api/*",
      authRateLimit("standard", {
        config: {
          requests: 2,
          windowMs: 60_000,
          skipSuccessfulRequests: false,
          skipTrustedIps: false,
          banThreshold: 0,
        },
        keyExtractor: principalKey,
      })
    );
    app.get("/api/profile", requireWrite(), (c) => c.json({ keyId: getAuthContext(c)?.keyId }));

    for (const ip of ["198.51.100.21", "198.51.100.22"]) {
      const response = await app.request("/api/profile", {
        headers: { Authorization: alice.authorization, "CF-Connecting-IP": ip },
      });
      expect(response.status).toBe(200);
    }

    const aliceBlocked = await app.request("/api/profile", {
      headers: {
        Authorization: alice.authorization,
        "CF-Connecting-IP": "198.51.100.23",
      },
    });
    expect(aliceBlocked.status).toBe(429);

    const bobAllowed = await app.request("/api/profile", {
      headers: {
        Authorization: bob.authorization,
        "CF-Connecting-IP": "198.51.100.24",
      },
    });
    expect(bobAllowed.status).toBe(200);
    expect(await bobAllowed.json()).toEqual({ keyId: bob.keyId });
  });

  it("applies independent endpoint policies to the same authenticated principal", async () => {
    const alice = await registerPrincipal("endpoint_alice", "alice-secret");
    const app = new Hono();

    app.use("/api/*", optionalAuth({ allowSessions: false }));
    app.use(
      "/api/login",
      authRateLimit("standard", {
        config: {
          requests: 2,
          skipSuccessfulRequests: false,
          skipTrustedIps: false,
          banThreshold: 0,
        },
        keyExtractor: endpointPrincipalKey,
      })
    );
    app.use(
      "/api/export",
      authRateLimit("strict", {
        config: {
          requests: 1,
          skipSuccessfulRequests: false,
          skipTrustedIps: false,
          banThreshold: 0,
        },
        keyExtractor: endpointPrincipalKey,
      })
    );
    app.get("/api/login", requireWrite(), (c) => c.json({ endpoint: "login" }));
    app.get("/api/export", requireWrite(), (c) => c.json({ endpoint: "export" }));

    for (const ip of ["198.51.100.31", "198.51.100.32"]) {
      const response = await app.request("/api/login", {
        headers: { Authorization: alice.authorization, "CF-Connecting-IP": ip },
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("X-RateLimit-Limit")).toBe("2");
    }

    const loginBlocked = await app.request("/api/login", {
      headers: {
        Authorization: alice.authorization,
        "CF-Connecting-IP": "198.51.100.33",
      },
    });
    expect(loginBlocked.status).toBe(429);

    const exportAllowed = await app.request("/api/export", {
      headers: {
        Authorization: alice.authorization,
        "CF-Connecting-IP": "198.51.100.34",
      },
    });
    expect(exportAllowed.status).toBe(200);
    expect(exportAllowed.headers.get("X-RateLimit-Limit")).toBe("1");

    const exportBlocked = await app.request("/api/export", {
      headers: {
        Authorization: alice.authorization,
        "CF-Connecting-IP": "198.51.100.35",
      },
    });
    expect(exportBlocked.status).toBe(429);
  });
});

describe("CSRF, authentication, and authorization integration", () => {
  async function createProtectedApp(): Promise<{
    app: Hono;
    principal: TestPrincipal;
  }> {
    const principal = await registerPrincipal("csrf_alice", "alice-secret");
    const app = new Hono();

    app.use(
      "/api/*",
      hostHeaderProtection({
        allowedHosts: [ALLOWED_HOST],
        allowSubdomains: false,
      })
    );
    app.use("/api/*", securityHeaders());
    app.use("/api/*", optionalAuth({ allowSessions: false }));
    app.use("/api/*", csrfProtection());

    app.get("/api/csrf-token", requireWrite(), (c) => c.json({ token: c.get("csrfToken") }));
    app.post("/api/preferences", requireWrite(), (c) =>
      c.json({ savedBy: getAuthContext(c)?.keyId })
    );

    return { app, principal };
  }

  it("requires both valid authentication and a valid CSRF token", async () => {
    const { app, principal } = await createProtectedApp();
    const commonHeaders = {
      Host: ALLOWED_HOST,
      Authorization: principal.authorization,
    };

    const tokenResponse = await app.request("/api/csrf-token", {
      headers: commonHeaders,
    });
    expect(tokenResponse.status).toBe(200);
    const { token } = (await tokenResponse.json()) as { token: string };

    const missingCsrf = await app.request("/api/preferences", {
      method: "POST",
      headers: commonHeaders,
    });
    expect(missingCsrf.status).toBe(403);

    const missingAuth = await app.request("/api/preferences", {
      method: "POST",
      headers: {
        Host: ALLOWED_HOST,
        "X-CSRF-Token": token,
        Cookie: `csrf_token=${token}`,
      },
    });
    expect(missingAuth.status).toBe(401);
  });

  it("rotates accepted tokens and rejects replay through the authenticated chain", async () => {
    const { app, principal } = await createProtectedApp();
    const commonHeaders = {
      Host: ALLOWED_HOST,
      Authorization: principal.authorization,
    };
    const tokenResponse = await app.request("/api/csrf-token", {
      headers: commonHeaders,
    });
    const { token } = (await tokenResponse.json()) as { token: string };

    const accepted = await app.request("/api/preferences", {
      method: "POST",
      headers: {
        ...commonHeaders,
        "X-CSRF-Token": token,
        Cookie: `csrf_token=${token}`,
      },
    });
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toEqual({ savedBy: principal.keyId });

    const rotatedCookie = accepted.headers
      .getSetCookie()
      .find((cookie) => cookie.startsWith("csrf_token="));
    expect(rotatedCookie).toMatch(/; Path=\/; SameSite=Strict; HttpOnly; Secure$/);
    expect(rotatedCookie).not.toContain(`csrf_token=${token};`);

    const replayed = await app.request("/api/preferences", {
      method: "POST",
      headers: {
        ...commonHeaders,
        "X-CSRF-Token": token,
        Cookie: `csrf_token=${token}`,
      },
    });
    expect(replayed.status).toBe(403);
  });
});

describe("host validation and browser security headers with authentication", () => {
  async function createHeaderApp(): Promise<{
    app: Hono;
    principal: TestPrincipal;
  }> {
    const principal = await registerPrincipal("headers_alice", "alice-secret");
    const app = new Hono();

    app.use(
      "/api/*",
      hostHeaderProtection({
        allowedHosts: [ALLOWED_HOST],
        allowSubdomains: false,
      })
    );
    app.use("/api/*", securityHeaders());
    app.use("/api/*", optionalAuth({ allowSessions: false }));
    app.get("/api/account", requireWrite(), (c) => c.json({ keyId: getAuthContext(c)?.keyId }));

    return { app, principal };
  }

  it("rejects an injected host before authenticated route handling", async () => {
    const { app, principal } = await createHeaderApp();
    const response = await app.request("/api/account", {
      headers: {
        Host: `${ALLOWED_HOST}.attacker.invalid`,
        Authorization: principal.authorization,
      },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Invalid Host header",
      reason: "host_not_allowed",
    });
  });

  it("sets HSTS, CSP, clickjacking, MIME, and cross-origin headers over HTTPS", async () => {
    const { app, principal } = await createHeaderApp();
    const response = await app.request("/api/account", {
      headers: {
        Host: ALLOWED_HOST,
        Authorization: principal.authorization,
        "X-Forwarded-Proto": "https",
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Strict-Transport-Security")).toBe(
      "max-age=31536000; includeSubDomains; preload"
    );
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(response.headers.get("Cross-Origin-Opener-Policy")).toBe("same-origin");
    expect(response.headers.get("Cross-Origin-Resource-Policy")).toBe("same-origin");
    expect(response.headers.get("Cross-Origin-Embedder-Policy")).toBe("require-corp");
    expect(response.headers.get("X-Permitted-Cross-Domain-Policies")).toBe("none");
    expect(response.headers.get("Permissions-Policy")).toContain("geolocation=()");

    const csp = response.headers.get("Content-Security-Policy");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("does not emit HSTS when the request was not forwarded over HTTPS", async () => {
    const { app, principal } = await createHeaderApp();
    const response = await app.request("/api/account", {
      headers: {
        Host: ALLOWED_HOST,
        Authorization: principal.authorization,
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Strict-Transport-Security")).toBeNull();
  });
});

describe("secure cookies in the composed session/CSRF chain", () => {
  it("emits secure defaults for session, refresh, and browser-readable CSRF cookies", async () => {
    const app = new Hono();

    app.use("/api/*", securityHeaders());
    app.use("/api/*", csrfCookie({ signed: false }));
    app.use("/api/*", cookieSecurityValidator());
    app.use("/api/*", cookieSessionAuth());
    app.get("/api/login-complete", async (c) => {
      await setSessionCookie(c, "session-token");
      await setRefreshTokenCookie(c, "refresh-token");
      return c.json({ ok: true });
    });

    const response = await app.request("/api/login-complete", {
      headers: { "X-Forwarded-Proto": "https" },
    });
    expect(response.status).toBe(200);

    const cookies = response.headers.getSetCookie();
    const csrf = cookies.find((cookie) => cookie.startsWith("csrf_token="));
    const session = cookies.find((cookie) => cookie.startsWith("session_token="));
    const refresh = cookies.find((cookie) => cookie.startsWith("refresh_token="));

    expect(csrf).toContain("; Secure");
    expect(csrf).toContain("; SameSite=Strict");
    expect(csrf).not.toContain("; HttpOnly");

    for (const cookie of [session, refresh]) {
      expect(cookie).toContain("; Secure");
      expect(cookie).toContain("; HttpOnly");
      expect(cookie).toContain("; SameSite=Strict");
      expect(cookie).toContain("; Path=/");
    }

    expect(validateCookieSecurity(cookies)).toEqual({ valid: true, issues: [] });
  });
});
