/**
 * OAuth 2.0 authorization-code flow with PKCE.
 *
 * Provider credentials and the PKCE verifier stay on the server. The browser
 * only receives an opaque, single-use state value and is redirected directly
 * to the configured provider.
 */

import { createHash, randomBytes } from "node:crypto";
import type { OAuthProvider, OAuthState } from "../middleware/authentication.js";
import { logger } from "../observability/logger.js";

export interface OAuthUserProfile {
  providerId: string;
  providerUserId: string;
  email?: string;
  name?: string;
  picture?: string;
}

export interface AuthorizationUrlResult {
  url: string;
  stateId: string;
}

export interface OAuthCallbackResult {
  success: boolean;
  sessionId?: string;
  profile?: OAuthUserProfile;
  error?: string;
}

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

const providers = new Map<string, OAuthProvider>();
const oauthStates = new Map<string, OAuthState>();

function configuredRedirectUri(providerId: "google" | "github"): string {
  const baseUrl = process.env["BASE_URL"] || "http://localhost:3001";
  const providerOverride =
    providerId === "google"
      ? process.env["GOOGLE_OAUTH_REDIRECT_URI"]
      : process.env["GITHUB_OAUTH_REDIRECT_URI"];

  const bothProvidersConfigured =
    !!process.env["GOOGLE_OAUTH_CLIENT_ID"] &&
    !!process.env["GOOGLE_OAUTH_CLIENT_SECRET"] &&
    !!process.env["GITHUB_OAUTH_CLIENT_ID"] &&
    !!process.env["GITHUB_OAUTH_CLIENT_SECRET"];

  // OAUTH_REDIRECT_URI is retained for single-provider deployments that used
  // the previous route shape. A two-provider deployment must use the distinct
  // defaults or provider-specific values to prevent callback mix-up.
  return (
    providerOverride ||
    (!bothProvidersConfigured ? process.env["OAUTH_REDIRECT_URI"] : undefined) ||
    `${baseUrl}/auth/${providerId}/callback`
  );
}

/** Register the providers whose credentials are configured for this process. */
export function initializeDefaultProviders(): void {
  const googleClientId = process.env["GOOGLE_OAUTH_CLIENT_ID"];
  const googleClientSecret = process.env["GOOGLE_OAUTH_CLIENT_SECRET"];
  if (googleClientId && googleClientSecret) {
    registerOAuthProvider({
      providerId: "google",
      displayName: "Google",
      authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenEndpoint: "https://oauth2.googleapis.com/token",
      userInfoEndpoint: "https://www.googleapis.com/oauth2/v2/userinfo",
      clientId: googleClientId,
      clientSecret: googleClientSecret,
      scope: ["openid", "email", "profile"],
      redirectUri: configuredRedirectUri("google"),
      active: true,
    });
  } else {
    providers.delete("google");
  }

  const githubClientId = process.env["GITHUB_OAUTH_CLIENT_ID"];
  const githubClientSecret = process.env["GITHUB_OAUTH_CLIENT_SECRET"];
  if (githubClientId && githubClientSecret) {
    registerOAuthProvider({
      providerId: "github",
      displayName: "GitHub",
      authorizationEndpoint: "https://github.com/login/oauth/authorize",
      tokenEndpoint: "https://github.com/login/oauth/access_token",
      userInfoEndpoint: "https://api.github.com/user",
      clientId: githubClientId,
      clientSecret: githubClientSecret,
      scope: ["read:user", "user:email"],
      redirectUri: configuredRedirectUri("github"),
      active: true,
    });
  } else {
    providers.delete("github");
  }
}

export function registerOAuthProvider(provider: OAuthProvider): void {
  providers.set(provider.providerId, provider);
}

export function unregisterOAuthProvider(providerId: string): boolean {
  return providers.delete(providerId);
}

export function getActiveOAuthProviders(): Array<{ providerId: string; displayName: string }> {
  return Array.from(providers.values())
    .filter((provider) => provider.active)
    .map(({ providerId, displayName }) => ({ providerId, displayName }));
}

function createOAuthState(providerId: string): OAuthState {
  const now = Date.now();
  const state: OAuthState = {
    stateId: randomBytes(32).toString("hex"),
    // RFC 7636 permits 43-128 characters from the URL-safe alphabet.
    codeVerifier: randomBytes(32).toString("base64url"),
    providerId,
    createdAt: now,
    expiresAt: now + OAUTH_STATE_TTL_MS,
  };
  oauthStates.set(state.stateId, state);
  return state;
}

function createCodeChallenge(codeVerifier: string): string {
  return createHash("sha256").update(codeVerifier, "ascii").digest("base64url");
}

/**
 * Creates the provider authorization URL. State is generated server-side and
 * includes the S256 PKCE verifier needed later at the token endpoint.
 */
export async function createAuthorizationUrl(
  providerId: string
): Promise<AuthorizationUrlResult | { error: string }> {
  cleanupExpiredStates();
  const provider = providers.get(providerId);
  if (!provider) return { error: "Provider not found" };
  if (!provider.active) return { error: "Provider is not active" };

  const state = createOAuthState(providerId);
  const params = new URLSearchParams({
    client_id: provider.clientId,
    redirect_uri: provider.redirectUri,
    response_type: "code",
    scope: provider.scope.join(" "),
    state: state.stateId,
    code_challenge: createCodeChallenge(state.codeVerifier),
    code_challenge_method: "S256",
  });

  return { url: `${provider.authorizationEndpoint}?${params.toString()}`, stateId: state.stateId };
}

/**
 * Obtains and consumes a state value. A matching provider is required to
 * prevent provider mix-up; deletion before the token exchange makes state
 * values one-time even when the exchange fails.
 */
function consumeOAuthState(providerId: string, stateId: string): OAuthState | null {
  const state = oauthStates.get(stateId);
  if (!state || state.providerId !== providerId || state.expiresAt <= Date.now()) {
    if (state) oauthStates.delete(stateId);
    return null;
  }

  oauthStates.delete(stateId);
  return state;
}

/** Discards an authorization that the provider denied or cancelled. */
export function cancelOAuthAuthorization(providerId: string, stateId?: string): void {
  if (!stateId) return;
  const state = oauthStates.get(stateId);
  if (state?.providerId === providerId) oauthStates.delete(stateId);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function providerUserId(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
  return undefined;
}

function normalizeProfile(providerId: string, value: unknown): OAuthUserProfile | null {
  const data = asRecord(value);
  if (!data) return null;

  const userId =
    providerId === "google"
      ? providerUserId(data["sub"]) || providerUserId(data["id"])
      : providerId === "github"
        ? providerUserId(data["id"]) || providerUserId(data["login"])
        : undefined;
  if (!userId) return null;

  return {
    providerId,
    providerUserId: userId,
    email: optionalString(data["email"]),
    name:
      optionalString(data["name"]) ||
      (providerId === "github" ? optionalString(data["login"]) : undefined),
    picture: optionalString(providerId === "github" ? data["avatar_url"] : data["picture"]),
  };
}

async function exchangeCodeForToken(
  provider: OAuthProvider,
  code: string,
  codeVerifier: string
): Promise<string | null> {
  const response = await fetch(provider.tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      client_id: provider.clientId,
      client_secret: provider.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: provider.redirectUri,
      code_verifier: codeVerifier,
    }),
  });

  if (!response.ok) {
    logger.warn("OAuth token exchange failed", {
      providerId: provider.providerId,
      status: response.status,
    });
    return null;
  }

  const data = asRecord(await response.json());
  return optionalString(data?.["access_token"]) ?? null;
}

async function fetchProfile(
  provider: OAuthProvider,
  accessToken: string
): Promise<OAuthUserProfile | null> {
  const response = await fetch(provider.userInfoEndpoint, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!response.ok) {
    logger.warn("OAuth profile request failed", {
      providerId: provider.providerId,
      status: response.status,
    });
    return null;
  }

  return normalizeProfile(provider.providerId, await response.json());
}

/**
 * Validates the callback state, exchanges the code with the original PKCE
 * verifier, fetches the provider profile, and delegates session creation.
 */
export async function handleOAuthCallback(
  providerId: string,
  stateId: string,
  code: string,
  clientIp: string,
  userAgent: string | undefined,
  createSession: (
    keyId: string,
    ip: string,
    userAgent: string | undefined,
    metadata: Record<string, unknown>
  ) => Promise<{ sessionId?: string; error?: string }>
): Promise<OAuthCallbackResult> {
  const state = consumeOAuthState(providerId, stateId);
  if (!state) return { success: false, error: "Invalid or expired OAuth state" };

  const provider = providers.get(providerId);
  if (!provider || !provider.active) return { success: false, error: "Provider not found" };

  try {
    const accessToken = await exchangeCodeForToken(provider, code, state.codeVerifier);
    if (!accessToken) return { success: false, error: "OAuth token exchange failed" };

    const profile = await fetchProfile(provider, accessToken);
    if (!profile) return { success: false, error: "Unable to retrieve OAuth profile" };

    // Provider subject, rather than email, is the durable and non-PII account key.
    const keyId = `oauth:${providerId}:${profile.providerUserId}`;
    const session = await createSession(keyId, clientIp, userAgent, {
      oauthProvider: providerId,
      oauthUserId: profile.providerUserId,
    });
    if (!session.sessionId)
      return { success: false, error: session.error || "Unable to create session" };

    logger.info("OAuth authentication succeeded", { providerId });
    return { success: true, sessionId: session.sessionId, profile };
  } catch (error) {
    logger.error("OAuth callback failed", error as Error, { providerId });
    return { success: false, error: "OAuth authentication failed" };
  }
}

/** Removes expired state entries and returns the number removed. */
export function cleanupExpiredStates(): number {
  const now = Date.now();
  let removed = 0;
  for (const [stateId, state] of oauthStates) {
    if (state.expiresAt <= now) {
      oauthStates.delete(stateId);
      removed++;
    }
  }
  return removed;
}

/** Test-only visibility for asserting PKCE parameters without exposing them over HTTP. */
export function getOAuthStateForTesting(stateId: string): OAuthState | undefined {
  return oauthStates.get(stateId);
}

/** Test-only cleanup for this module's process-local state. */
export function resetOAuthForTesting(): void {
  providers.clear();
  oauthStates.clear();
}
