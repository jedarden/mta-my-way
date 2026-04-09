/**
 * OAuth 2.0 authentication module.
 *
 * Provides third-party authentication using OAuth 2.0 with PKCE flow.
 * Supports Google, GitHub, and other OAuth 2.0 / OpenID Connect providers.
 */

export {
  registerOAuthProvider,
  getOAuthProvider,
  getActiveOAuthProviders,
  unregisterOAuthProvider,
  createAuthorizationUrl,
  handleOAuthCallback,
  createOAuthSession,
  initializeDefaultProviders,
  cleanupExpiredStates,
  getOAuthState,
  type OAuthUserProfile,
  type OAuthTokenResponse,
  type AuthorizationUrlResult,
  type OAuthCallbackResult,
} from "./oauth-service.js";
