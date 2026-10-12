import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelOAuthAuthorization,
  cleanupExpiredStates,
  createAuthorizationUrl,
  getOAuthStateForTesting,
  handleOAuthCallback,
  registerOAuthProvider,
  resetOAuthForTesting,
  unregisterOAuthProvider,
} from "./index.js";

const provider = {
  providerId: "google",
  displayName: "Google",
  authorizationEndpoint: "https://provider.example/authorize",
  tokenEndpoint: "https://provider.example/token",
  userInfoEndpoint: "https://provider.example/userinfo",
  clientId: "client-id",
  clientSecret: "client-secret",
  scope: ["openid", "email"],
  redirectUri: "https://app.example/auth/google/callback",
  active: true,
};

const session = vi.fn().mockResolvedValue({ sessionId: "session-1" });

async function authorizationState(): Promise<string> {
  const result = await createAuthorizationUrl("google");
  if ("error" in result) throw new Error(result.error);
  return result.stateId;
}

async function callback(state: string) {
  return handleOAuthCallback("google", state, "code", "198.51.100.2", "test-agent", session);
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("OAuth callback failure handling", () => {
  beforeEach(() => {
    resetOAuthForTesting();
    registerOAuthProvider(provider);
    session.mockReset().mockResolvedValue({ sessionId: "session-1" });
  });

  afterEach(() => {
    resetOAuthForTesting();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("rejects missing or inactive providers before creating state", async () => {
    expect(await createAuthorizationUrl("missing")).toEqual({ error: "Provider not found" });
    registerOAuthProvider({ ...provider, active: false });
    expect(await createAuthorizationUrl("google")).toEqual({ error: "Provider is not active" });
  });

  it("expires state after ten minutes and never exchanges an expired code", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const state = await authorizationState();
    vi.advanceTimersByTime(10 * 60 * 1000);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(await callback(state)).toEqual({
      success: false,
      error: "Invalid or expired OAuth state",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getOAuthStateForTesting(state)).toBeUndefined();

    const anotherState = await authorizationState();
    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(cleanupExpiredStates()).toBe(1);
    expect(getOAuthStateForTesting(anotherState)).toBeUndefined();
  });

  it("cancels only state belonging to the provider that began authorization", async () => {
    const state = await authorizationState();
    cancelOAuthAuthorization("github", state);
    expect(getOAuthStateForTesting(state)).toBeDefined();
    cancelOAuthAuthorization("google", state);
    expect(getOAuthStateForTesting(state)).toBeUndefined();
  });

  it("refuses a callback when its provider was disabled after authorization", async () => {
    const state = await authorizationState();
    unregisterOAuthProvider("google");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await callback(state)).toEqual({ success: false, error: "Provider not found" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getOAuthStateForTesting(state)).toBeUndefined();
  });

  it.each([
    ["rejected token response", response({ error: "invalid_grant" }, 400)],
    ["token response without a usable token", response({ access_token: "" })],
    ["non-object token response", response(["not-a-token"])],
  ])("does not fetch a profile for a %s", async (_name, tokenResponse) => {
    const state = await authorizationState();
    const fetchMock = vi.fn().mockResolvedValue(tokenResponse);
    vi.stubGlobal("fetch", fetchMock);

    expect(await callback(state)).toEqual({ success: false, error: "OAuth token exchange failed" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(session).not.toHaveBeenCalled();
    expect(await callback(state)).toEqual({
      success: false,
      error: "Invalid or expired OAuth state",
    });
  });

  it.each([
    ["rejected profile response", response({ error: "unauthorized" }, 401)],
    ["profile without provider subject", response({ email: "rider@example.test" })],
    ["array profile response", response([{ sub: "not-an-object" }])],
  ])("does not create a session for a %s", async (_name, profileResponse) => {
    const state = await authorizationState();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ access_token: "access-token" }))
      .mockResolvedValueOnce(profileResponse);
    vi.stubGlobal("fetch", fetchMock);

    expect(await callback(state)).toEqual({
      success: false,
      error: "Unable to retrieve OAuth profile",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(session).not.toHaveBeenCalled();
  });

  it("returns a session refusal without exposing a provider access token", async () => {
    const state = await authorizationState();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(response({ access_token: "access-token" }))
        .mockResolvedValueOnce(response({ sub: "subject-1", email: "rider@example.test" }))
    );
    session.mockResolvedValue({ error: "Session limit reached" });

    expect(await callback(state)).toEqual({ success: false, error: "Session limit reached" });
    expect(session).toHaveBeenCalledWith("oauth:google:subject-1", "198.51.100.2", "test-agent", {
      oauthProvider: "google",
      oauthUserId: "subject-1",
    });
  });

  it("contains network errors and consumes state before the token request", async () => {
    const state = await authorizationState();
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("provider unavailable"));
    vi.stubGlobal("fetch", fetchMock);

    expect(await callback(state)).toEqual({ success: false, error: "OAuth authentication failed" });
    expect(await callback(state)).toEqual({
      success: false,
      error: "Invalid or expired OAuth state",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(session).not.toHaveBeenCalled();
  });
});
