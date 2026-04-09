export { rateLimiter } from "./rate-limiter.js";
export {
  securityHeaders,
  generateCspNonce,
  getDefaultCsp,
  getStrictCsp,
} from "./security-headers.js";
export { validateBody, validateQuery, validateParams } from "./validation.js";
export { cors } from "./cors.js";
export { requestSizeLimits } from "./request-limits.js";
export { inputSanitization, getSanitizedQuery } from "./input-sanitization.js";
export { pathTraversalPrevention, isSafePath } from "./path-traversal.js";
export {
  hppProtection,
  getCleanedQuery,
  getCleanedBody,
  getCleanedForm,
} from "./parameter-pollution.js";
export { validateContentType, requireJson, requireFormData } from "./content-type.js";
export {
  headerValidation,
  strictHeaderValidation,
  type HeaderValidationOptions,
} from "./header-validation.js";
export {
  staticCache,
  semiStaticCache,
  realtimeCache,
  apiCache,
  healthCache,
  noCache,
  noStore,
  etagCache,
  conditionalGet,
  immutableCache,
} from "./cache.js";
export {
  apiKeyAuth,
  signedRequestAuth,
  optionalAuth,
  requireScope,
  getAuthContext,
  isAuthenticated,
  registerApiKey,
  createSession,
  invalidateSession,
  invalidateAllSessionsForKey,
  generateApiKey,
  hashApiKey,
  validatePassword,
  hashPassword,
  verifyPasswordHash,
  storePasswordInHistory,
  generatePasswordResetToken,
  validatePasswordResetToken,
  consumePasswordResetToken,
  invalidateResetTokensForKey,
  isPasswordExpired,
  getDaysUntilExpiration,
  shouldWarnPasswordExpiration,
  generateSecurePassword,
  getPasswordPolicyDescription,
  setPasswordPepper,
  clearBreachedPasswordCache,
  type ApiKey,
  type AuthContext,
  type ApiKeyScope,
  type AuthSession,
  type PasswordPolicy,
  type PasswordValidationResult,
  type PasswordHash,
  type PasswordResetToken,
  type PasswordHistoryEntry,
} from "./authentication.js";
export {
  csrfProtection,
  validateCsrf,
  generateCsrfToken,
  generateSessionCsrfToken,
  validateCsrfToken,
  markCsrfTokenUsed,
  revokeCsrfToken,
  getCsrfToken,
} from "./csrf-protection.js";
export {
  ssrfProtection,
  validateUrl,
  safeFetch,
  createMtaFeedAllowList,
  validateMtaFeedUrl,
  type SsrfProtectionOptions,
  type UrlValidationResult,
} from "./ssrf-protection.js";
export {
  hostHeaderProtection,
  validateHostHeader,
  getValidatedHost,
  type HostHeaderProtectionOptions,
  type HostValidationResult,
} from "./host-header-protection.js";
export {
  securityCheckOnStartup,
  auditDependencies,
  generateSecurityReport,
  isPackageSecure,
  getSecurityRecommendations,
  type SecurityReport,
  type Vulnerability,
  type DependencyInfo,
} from "./dependency-security.js";
export {
  generateSriHash,
  validateSriHash,
  generateSriAttributes,
  validateSriAttributes,
  type SriHashAlgorithm,
  type SriHash,
  type SriAttributes,
} from "./subresource-integrity.js";
export {
  requireResourceAccess,
  requireAdmin,
  requireWrite,
  enforceRateLimitTier,
  requireSameOrigin,
  validateDataAccess,
  checkAuthorization,
  requireMfa,
  auditLogAccess,
  type PermissionAction,
  type ResourceType,
  type ResourcePolicy,
  type AuthorizationResult,
} from "./authorization.js";
export {
  securityLogger,
  securityLogging,
  logAuthFailure,
  logAuthzFailure,
  logSuspiciousActivity,
  logSuspiciousRequest,
  logRateLimitExceeded,
} from "./security-logging.js";
export {
  massAssignmentProtection,
  validateMassAssignment,
  filterAllowedFields,
  removeSensitiveFields,
  PUSH_SUBSCRIPTION_FIELDS,
  TRIP_NOTES_FIELDS,
  CONTEXT_SETTINGS_FIELDS,
  COMMUTE_ANALYZE_FIELDS,
  getSanitizedBody,
} from "./mass-assignment.js";
export {
  openRedirectProtection,
  validateRedirectUrl,
  createSafeRedirect,
  OAUTH_ALLOWED_HOSTNAMES,
  SAFE_REDIRECT_TARGETS,
} from "./open-redirect.js";
