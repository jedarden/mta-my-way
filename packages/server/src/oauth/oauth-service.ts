/**
 * OAuth 2.0 service for third-party authentication providers.
 *
 * Supports PKCE (Proof Key for Code Exchange) flow for secure OAuth
 * authorization without exposing client secrets to the browser.
 *
 * Provider support:
 * - Google OAuth 2.0
 * - GitHub OAuth (extensible)
 */

import { Buffer } from "node:buffer";
import { logger } from "../observability/logger.js";
import { securityLogger } from "../middleware/security-logging.js";
import type {
  AuthContext,
  AuthSession,
  OAuthProvider,
  OAuthState,
} from "../middleware/authentication.js";

// ============================================================================
// Types
// ============================================================================

/**
 * OAuth user profile from provider.
 */
export interface OAuthUserProfile {
  /** Provider ID */
  providerId: string;
  /** Unique user ID from provider */
  providerUserId: string;
  /** Email address */
  email?: string;
  /** Email verified status */
  emailVerified?: boolean;
  /** Display name */
  name?: string;
  /** Profile picture URL */
  picture?: string;
  /** Locale/language */
  locale?: string;
}

/**
 * Token response from OAuth provider.
 */
export interface OAuthTokenResponse {
  /** Access token */
  access_token: string;
  /** Token type (typically "Bearer") */
  token_type: string;
  /** Refresh token (optional) */
  refresh_token?: string;
  /** Expires in seconds */
  expires_in?: number;
  /** ID token (for OpenID Connect) */
  id_token?: string;
  /** Scope granted */
  scope?: string;
}

/**
 * Authorization URL result.
 */
export interface AuthorizationUrlResult {
  /** Full authorization URL to redirect user to */
  url: string;
  /** State ID for CSRF protection */
  stateId: string;
}

/**
 * Callback result from OAuth flow.
 */
export interface OAuthCallbackResult {
  /** Success status */
  success: boolean;
  /** User profile if successful */
  profile?: OAuthUserProfile;
  /** Session ID if session was created */
  sessionId?: string;
  /** Error message if failed */
  error?: string;
  /** Error description if failed */
  errorDescription?: string;
}

// ============================================================================
// In-Memory Storage (should be database in production)
// ============================================================================

const providers = new Map<string, OAuthProvider>();
const oauthStates = new Map<string, OAuthState>();

// ============================================================================
// Provider Registration
// ============================================================================

/**
 * Register an OAuth provider.
 */
export function registerOAuthProvider(provider: OAuthProvider): void {
  providers.set(provider.providerId, provider);
  logger.info("OAuth provider registered", {
    providerId: provider.providerId,
    displayName: provider.displayName,
    active: provider.active,
  });
}

/**
 * Get an OAuth provider by ID.
 */
export function getOAuthProvider(providerId: string): OAuthProvider | undefined {
  return providers.get(providerId);
}

/**
 * Get all active OAuth providers.
 */
export function getActiveOAuthProviders(): OAuthProvider[] {
  return Array.from(providers.values()).filter((p) => p.active);
}

/**
 * Unregister an OAuth provider.
 */
export function unregisterOAuthProvider(providerId: string): boolean {
  return providers.delete(providerId);
}

// ============================================================================
// PKCE Helper Functions
// ============================================================================

/**
 * Generate a cryptographically secure random string for state/code verifier.
 */
function generateRandomString(length: number): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Generate code challenge from code verifier for PKCE.
 * Uses SHA-256 as per RFC 7636.
 */
async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Buffer.from(new Uint8Array(digest))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/**
 * Create OAuth state for CSRF protection.
 */
function createOAuthState(
  providerId: string,
  redirectUrl?: string
): OAuthState {
  const stateId = generateRandomString(32);
  const codeVerifier = generateRandomString(64);
  const nonce = generateRandomString(32);
  const now = Date.now();

  const state: OAuthState = {
    stateId,
    providerId,
    codeVerifier,
    nonce,
    redirectUrl,
    createdAt: now,
    expiresAt: now + 10 * 60 * 1000, // 10 minutes
  };

  oauthStates.set(stateId, state);

  // Clean up expired states every hour
  setTimeout(() => {
    const s = oauthStates.get(stateId);
    if (s && s.expiresAt < Date.now()) {
      oauthStates.delete(stateId);
    }
  }, 60 * 60 * 1000);

  return state;
}

/**
 * Validate and consume OAuth state.
 */
function validateOAuthState(
  stateId: string
): OAuthState | { error: string } {
  const state = oauthStates.get(stateId);

  if (!state) {
    return { error: "Invalid or expired state" };
  }

  if (state.expiresAt < Date.now()) {
    oauthStates.delete(stateId);
    return { error: "State expired" };
  }

  // Consume the state (single-use)
  oauthStates.delete(stateId);
  return state;
}

// ============================================================================
// OAuth Flow Functions
// ============================================================================

/**
 * Generate authorization URL for OAuth flow.
 *
 * @param providerId - Provider ID (e.g., "google")
 * @param redirectUrl - Optional URL to redirect to after successful auth
 * @returns Authorization URL and state ID
 */
export async function createAuthorizationUrl(
  providerId: string,
  redirectUrl?: string
): Promise<AuthorizationUrlResult | { error: string }> {
  const provider = getOAuthProvider(providerId);

  if (!provider) {
    return { error: "Provider not found" };
  }

  if (!provider.active) {
    return { error: "Provider is not active" };
  }

  const state = createOAuthState(providerId, redirectUrl);
  const codeChallenge = await generateCodeChallenge(state.codeVerifier);

  // Build authorization URL
  const params = new URLSearchParams({
    client_id: provider.clientId,
    redirect_uri: provider.redirectUri,
    response_type: "code",
    scope: provider.scope.join(" "),
    state: state.stateId,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  const url = `${provider.authorizationEndpoint}?${params.toString()}`;

  logger.info("OAuth authorization initiated", {
    providerId,
    stateId: state.stateId,
  });

  return { url, stateId: state.stateId };
}

/**
 * Exchange authorization code for access token.
 *
 * @param provider - OAuth provider configuration
 * @param code - Authorization code from callback
 * @param codeVerifier - PKCE code verifier
 * @returns Token response or error
 */
async function exchangeCodeForToken(
  provider: OAuthProvider,
  code: string,
  codeVerifier: string
): Promise<OAuthTokenResponse | { error: string }> {
  try {
    const params = new URLSearchParams({
      client_id: provider.clientId,
      client_secret: provider.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: provider.redirectUri,
      code_verifier: codeVerifier,
    });

    const response = await fetch(provider.tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error("OAuth token exchange failed", {
        providerId: provider.providerId,
        status: response.status,
        error: errorText,
      });
      return { error: "Failed to exchange authorization code" };
    }

    const data = (await response.json()) as OAuthTokenResponse;
    return data;
  } catch (error) {
    logger.error("OAuth token exchange error", error as Error);
    return { error: "Network error during token exchange" };
  }
}

/**
 * Fetch user profile from provider using access token.
 *
 * @param provider - OAuth provider configuration
 * @param accessToken - Access token from provider
 * @returns User profile or error
 */
async function fetchUserProfile(
  provider: OAuthProvider,
  accessToken: string
): Promise<OAuthUserProfile | { error: string }> {
  try {
    const response = await fetch(provider.userInfoEndpoint, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error("OAuth user profile fetch failed", {
        providerId: provider.providerId,
        status: response.status,
        error: errorText,
      });
      return { error: "Failed to fetch user profile" };
    }

    const data = await response.json();

    // Normalize profile based on provider
    const profile: OAuthUserProfile = normalizeUserProfile(
      provider.providerId,
      data
    );

    return profile;
  } catch (error) {
    logger.error("OAuth user profile fetch error", error as Error);
    return { error: "Network error while fetching user profile" };
  }
}

/**
 * Normalize user profile from provider-specific format.
 */
function normalizeUserProfile(
  providerId: string,
  data: Record<string, unknown>
): OAuthUserProfile {
  const profile: OAuthUserProfile = {
    providerId,
    providerUserId: "",
  };

  switch (providerId) {
    case "google":
      profile.providerUserId = (data.sub as string) || "";
      profile.email = data.email as string;
      profile.emailVerified = data.email_verified as boolean;
      profile.name = data.name as string;
      profile.picture = data.picture as string;
      profile.locale = data.locale as string;
      break;

    case "github":
      profile.providerUserId = String(data.id || "");
      profile.email = data.email as string;
      profile.name = data.name as string;
      profile.picture = data.avatar_url as string;
      profile.emailVerified = !!data.email;
      break;

    default:
      // Generic OAuth 2.0 / OpenID Connect
      profile.providerUserId = (data.sub || data.id || data.user_id) as string;
      profile.email = data.email as string;
      profile.name = data.name as string;
      profile.picture = data.picture as string;
  }

  return profile;
}

// ============================================================================
// Session Creation (delegates to authentication module)
// ============================================================================

/**
 * Create or update user session from OAuth profile.
 * This function is called after successful OAuth authentication.
 *
 * In production, this should:
 * 1. Check if user exists in database by provider + providerUserId
 * 2. Create user if not exists
 * 3. Create session for user
 * 4. Return session ID
 *
 * For this implementation, we'll create a mock user session.
 */
export async function createOAuthSession(
  profile: OAuthUserProfile,
  clientIp: string,
  userAgent?: string,
  createSessionFn?: (
    keyId: string,
    clientIp: string,
    userAgent?: string,
    metadata?: Record<string, unknown>
  ) => Promise<{ sessionId: string; csrfToken: string } | { error: string }>
): Promise<{ sessionId: string; csrfToken: string } | { error: string }> {
  // In production, look up or create user in database
  // For now, create a mock keyId from provider profile
  const keyId = `${profile.providerId}_${profile.providerUserId}`;

  const metadata = {
    oauthProvider: profile.providerId,
    oauthUserId: profile.providerUserId,
    email: profile.email,
    name: profile.name,
  };

  if (createSessionFn) {
    return createSessionFn(keyId, clientIp, userAgent, metadata);
  }

  // Fallback: return mock session (should not happen in production)
  return {
    sessionId: `oauth_${keyId}_${Date.now()}`,
    csrfToken: generateRandomString(32),
  };
}

// ============================================================================
// OAuth Callback Handler
// ============================================================================

/**
 * Handle OAuth callback from provider.
 *
 * @param stateId - State ID from authorization request
 * @param code - Authorization code from provider
 * @param clientIp - Client IP address for logging
 * @param userAgent - User agent string
 * @param createSessionFn - Optional function to create session
 * @returns Callback result with session or error
 */
export async function handleOAuthCallback(
  stateId: string,
  code: string,
  clientIp: string,
  userAgent?: string,
  createSessionFn?: (
    keyId: string,
    clientIp: string,
    userAgent?: string,
    metadata?: Record<string, unknown>
  ) => Promise<{ sessionId: string; csrfToken: string } | { error: string }>
): Promise<OAuthCallbackResult> {
  // Validate state
  const stateValidation = validateOAuthState(stateId);
  if ("error" in stateValidation) {
    securityLogger.logAuthFailure(
      { ip: clientIp, userAgent: userAgent ?? "" },
      "oauth_invalid_state"
    );
    return {
      success: false,
      error: stateValidation.error,
    };
  }

  const state = stateValidation;
  const provider = getOAuthProvider(state.providerId);

  if (!provider) {
    securityLogger.logAuthFailure(
      { ip: clientIp, userAgent: userAgent ?? "" },
      "oauth_provider_not_found"
    );
    return {
      success: false,
      error: "Provider not found",
    };
  }

  // Exchange code for token
  const tokenResult = await exchangeCodeForToken(
    provider,
    code,
    state.codeVerifier
  );

  if ("error" in tokenResult) {
    securityLogger.logAuthFailure(
      { ip: clientIp, userAgent: userAgent ?? "" },
      "oauth_token_exchange_failed"
    );
    return {
      success: false,
      error: tokenResult.error,
    };
  }

  const token = tokenResult;

  // Fetch user profile
  const profileResult = await fetchUserProfile(provider, token.access_token);

  if ("error" in profileResult) {
    securityLogger.logAuthFailure(
      { ip: clientIp, userAgent: userAgent ?? "" },
      "oauth_profile_fetch_failed"
    );
    return {
      success: false,
      error: profileResult.error,
    };
  }

  const profile = profileResult;

  // Create session
  const sessionResult = await createOAuthSession(
    profile,
    clientIp,
    userAgent,
    createSessionFn
  );

  if ("error" in sessionResult) {
    securityLogger.logAuthFailure(
      { ip: clientIp, userAgent: userAgent ?? "" },
      "oauth_session_creation_failed"
    );
    return {
      success: false,
      error: sessionResult.error,
    };
  }

  logger.info("OAuth authentication successful", {
    providerId: profile.providerId,
    providerUserId: profile.providerUserId,
    email: profile.email,
    sessionId: sessionResult.sessionId,
  });

  return {
    success: true,
    profile,
    sessionId: sessionResult.sessionId,
  };
}

// ============================================================================
// Default Provider Initialization
// ============================================================================

/**
 * Initialize default OAuth providers from environment variables.
 * Call this during server startup to register configured providers.
 */
export function initializeDefaultProviders(): void {
  // Google OAuth 2.0
  const googleClientId = process.env["GOOGLE_OAUTH_CLIENT_ID"];
  const googleClientSecret = process.env["GOOGLE_OAUTH_CLIENT_SECRET"];

  if (googleClientId && googleClientSecret) {
    const baseUrl = process.env["BASE_URL"] || "http://localhost:3001";
    const redirectUri = `${baseUrl}/api/auth/oauth/callback/google`;

    registerOAuthProvider({
      providerId: "google",
      displayName: "Google",
      authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenEndpoint: "https://oauth2.googleapis.com/token",
      userInfoEndpoint: "https://www.googleapis.com/oauth2/v2/userinfo",
      clientId: googleClientId,
      clientSecret: googleClientSecret,
      scope: [
        "openid",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile",
      ],
      redirectUri,
      active: true,
    });

    logger.info("Google OAuth provider registered", {
      redirectUri,
      hasClientId: !!googleClientId,
      hasClientSecret: !!googleClientSecret,
    });
  }

  // GitHub OAuth (optional)
  const githubClientId = process.env["GITHUB_OAUTH_CLIENT_ID"];
  const githubClientSecret = process.env["GITHUB_OAUTH_CLIENT_SECRET"];

  if (githubClientId && githubClientSecret) {
    const baseUrl = process.env["BASE_URL"] || "http://localhost:3001";
    const redirectUri = `${baseUrl}/api/auth/oauth/callback/github`;

    registerOAuthProvider({
      providerId: "github",
      displayName: "GitHub",
      authorizationEndpoint: "https://github.com/login/oauth/authorize",
      tokenEndpoint: "https://github.com/login/oauth/access_token",
      userInfoEndpoint: "https://api.github.com/user",
      clientId: githubClientId,
      clientSecret: githubClientSecret,
      scope: ["read:user", "user:email"],
      redirectUri,
      active: true,
    });

    logger.info("GitHub OAuth provider registered", {
      redirectUri,
      hasClientId: !!githubClientId,
      hasClientSecret: !!githubClientSecret,
    });
  }

  if (!googleClientId && !githubClientId) {
    logger.warn("No OAuth providers configured. Set GOOGLE_OAUTH_CLIENT_ID/SECRET or GITHUB_OAUTH_CLIENT_ID/SECRET environment variables.");
  }
}

// ============================================================================
// Cleanup Functions
// ============================================================================

/**
 * Clean up expired OAuth states.
 * Call this periodically to maintain memory efficiency.
 */
export function cleanupExpiredStates(): number {
  const now = Date.now();
  let cleaned = 0;

  for (const [stateId, state] of oauthStates.entries()) {
    if (state.expiresAt < now) {
      oauthStates.delete(stateId);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    logger.debug("Cleaned up expired OAuth states", { count: cleaned });
  }

  return cleaned;
}

/**
 * Get OAuth state for testing/debugging.
 */
export function getOAuthState(stateId: string): OAuthState | undefined {
  return oauthStates.get(stateId);
}
