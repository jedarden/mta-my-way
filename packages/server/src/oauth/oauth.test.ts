import { createHash } from "node:crypto";
import type { ComplexIndex, RouteIndex } from "@mta-my-way/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { TEST_STATIONS } from "../integration/test-helpers.js";
import {
  createAuthorizationUrl,
  getOAuthStateForTesting,
  handleOAuthCallback,
  registerOAuthProvider,
  resetOAuthForTesting,
} from "./index.js";

const TEST_PROVIDER = {
  providerId: "google",
  displayName: "Google",
  authorizationEndpoint: "https://provider.example/authorize",
  tokenEndpoint: "https://provider.example/token",
  userInfoEndpoint: "https://provider.example/userinfo",
  clientId: "test-client-id",
  clientSecret: "test-client-secret",
  scope: ["openid", "email", "profile"],
  redirectUri: "https://app.example/auth/google/callback",
  active: true,
};

const TEST_ROUTES: RouteIndex = {
  "1": {
    id: "1",
    shortName: "1",
    longName: "Broadway-7th Ave Local",
    color: "#EE352E",
    textColor: "#FFFFFF",
    feedId: "gtfs",
    division: "A",
    stops: ["101", "102"],
    isExpress: false,
  },
};

const TEST_COMPLEXES: ComplexIndex = {};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("OAuth PKCE flow", () => {
  beforeEach(() => {
    resetOAuthForTesting();
  });

  afterEach(() => {
    resetOAuthForTesting();
    vi.unstubAllGlobals();
  });

  it("uses an opaque state and an RFC 7636 S256 PKCE challenge", async () => {
    registerOAuthProvider(TEST_PROVIDER);

    const result = await createAuthorizationUrl("google");
    expect("error" in result).toBe(false);
    if ("error" in result) return;

    const authorizationUrl = new URL(result.url);
    const state = getOAuthStateForTesting(result.stateId);
    expect(state).toBeDefined();
    expect(result.stateId).toMatch(/^[a-f0-9]{64}$/);
    expect(state?.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(authorizationUrl.searchParams.get("state")).toBe(result.stateId);
    expect(authorizationUrl.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authorizationUrl.searchParams.get("code_challenge")).toBe(
      createHash("sha256")
        .update(state?.codeVerifier || "", "ascii")
        .digest("base64url")
    );
  });

  it("rejects a state presented to a different provider before making network calls", async () => {
    registerOAuthProvider(TEST_PROVIDER);
    registerOAuthProvider({ ...TEST_PROVIDER, providerId: "github" });
    const authorization = await createAuthorizationUrl("google");
    if ("error" in authorization) throw new Error(authorization.error);

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await handleOAuthCallback(
      "github",
      authorization.stateId,
      "authorization-code",
      "198.51.100.10",
      "test-agent",
      vi.fn()
    );

    expect(result).toEqual({ success: false, error: "Invalid or expired OAuth state" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getOAuthStateForTesting(authorization.stateId)).toBeUndefined();
  });

  it("uses the stored verifier once and creates a provider-subject session", async () => {
    registerOAuthProvider(TEST_PROVIDER);
    const authorization = await createAuthorizationUrl("google");
    if ("error" in authorization) throw new Error(authorization.error);
    const state = getOAuthStateForTesting(authorization.stateId);

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "provider-access-token" }))
      .mockResolvedValueOnce(
        jsonResponse({ sub: "google-subject-123", email: "rider@example.test", name: "Rider" })
      );
    vi.stubGlobal("fetch", fetchMock);
    const createSession = vi.fn().mockResolvedValue({ sessionId: "session-id" });

    const result = await handleOAuthCallback(
      "google",
      authorization.stateId,
      "authorization-code",
      "198.51.100.10",
      "test-agent",
      createSession
    );

    expect(result).toMatchObject({
      success: true,
      sessionId: "session-id",
      profile: { providerId: "google", providerUserId: "google-subject-123" },
    });
    expect(createSession).toHaveBeenCalledWith(
      "oauth:google:google-subject-123",
      "198.51.100.10",
      "test-agent",
      { oauthProvider: "google", oauthUserId: "google-subject-123" }
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      body: expect.any(URLSearchParams),
    });
    expect((fetchMock.mock.calls[0]?.[1]?.body as URLSearchParams).get("code_verifier")).toBe(
      state?.codeVerifier
    );
    expect(getOAuthStateForTesting(authorization.stateId)).toBeUndefined();
  });

  it("creates a session from a GitHub callback", async () => {
    registerOAuthProvider({
      ...TEST_PROVIDER,
      providerId: "github",
      userInfoEndpoint: "https://provider.example/github-user",
    });
    const authorization = await createAuthorizationUrl("github");
    if ("error" in authorization) throw new Error(authorization.error);

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ access_token: "provider-access-token" }))
        .mockResolvedValueOnce(
          jsonResponse({ id: 42, login: "rider", avatar_url: "https://avatar.test" })
        )
    );
    const createSession = vi.fn().mockResolvedValue({ sessionId: "github-session-id" });
    const result = await handleOAuthCallback(
      "github",
      authorization.stateId,
      "authorization-code",
      "198.51.100.10",
      "test-agent",
      createSession
    );

    expect(result).toMatchObject({
      success: true,
      sessionId: "github-session-id",
      profile: { providerId: "github", providerUserId: "42", name: "rider" },
    });
    expect(createSession).toHaveBeenCalledWith("oauth:github:42", "198.51.100.10", "test-agent", {
      oauthProvider: "github",
      oauthUserId: "42",
    });
  });

  it("redirects through the browser routes and establishes a cookie-backed session", async () => {
    const originalEnvironment = {
      GOOGLE_OAUTH_CLIENT_ID: process.env["GOOGLE_OAUTH_CLIENT_ID"],
      GOOGLE_OAUTH_CLIENT_SECRET: process.env["GOOGLE_OAUTH_CLIENT_SECRET"],
      GITHUB_OAUTH_CLIENT_ID: process.env["GITHUB_OAUTH_CLIENT_ID"],
      GITHUB_OAUTH_CLIENT_SECRET: process.env["GITHUB_OAUTH_CLIENT_SECRET"],
      BASE_URL: process.env["BASE_URL"],
    };
    process.env["GOOGLE_OAUTH_CLIENT_ID"] = "test-google-client";
    process.env["GOOGLE_OAUTH_CLIENT_SECRET"] = "test-google-secret";
    process.env["GITHUB_OAUTH_CLIENT_ID"] = "test-github-client";
    process.env["GITHUB_OAUTH_CLIENT_SECRET"] = "test-github-secret";
    process.env["BASE_URL"] = "https://app.example";

    try {
      const app = createApp(TEST_STATIONS, TEST_ROUTES, TEST_COMPLEXES, {}, "/nonexistent/dist");
      const redirect = await app.request("/auth/google");
      expect(redirect.status).toBe(302);
      const location = redirect.headers.get("Location");
      expect(location).toBeTruthy();
      const state = new URL(location || "https://invalid.example").searchParams.get("state");
      expect(state).toBeTruthy();

      const githubRedirect = await app.request("/auth/github");
      expect(githubRedirect.status).toBe(302);
      const githubUrl = new URL(
        githubRedirect.headers.get("Location") || "https://invalid.example"
      );
      expect(githubUrl.origin).toBe("https://github.com");
      expect(githubUrl.searchParams.get("code_challenge_method")).toBe("S256");

      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValueOnce(jsonResponse({ access_token: "provider-access-token" }))
          .mockResolvedValueOnce(jsonResponse({ sub: "google-subject-456", name: "Rider" }))
      );
      const response = await app.request(
        `/auth/google/callback?state=${state}&code=authorization-code`,
        {
          headers: { "X-Forwarded-For": "198.51.100.11", "User-Agent": "test-agent" },
        }
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        success: true,
        profile: { provider: "google", name: "Rider" },
      });
      const cookie = response.headers.get("set-cookie");
      expect(cookie).toContain("session_id=");
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("SameSite=Lax");

      const sessionResponse = await app.request("/api/auth/session", {
        headers: {
          Cookie: cookie?.split(";")[0] || "",
          "X-Forwarded-For": "198.51.100.11",
          "User-Agent": "test-agent",
        },
      });
      expect(await sessionResponse.json()).toMatchObject({
        authenticated: true,
        profile: { userId: "oauth:google:google-subject-456", provider: "google" },
      });
    } finally {
      for (const [key, value] of Object.entries(originalEnvironment)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
