# Module-Level Mutable State Audit (bf-4dutr)

## Executive Summary

**Total state containers found:** 85+  
**Currently covered by cleanupAllState():** 14 modules  
**Gaps identified:** 30+ modules with unprotected mutable state

**Critical finding:** The `cleanupAllState()` function uses try-catch that silently skips modules when imports fail or reset functions don't exist. This can mask incomplete cleanup and lead to test pollution.

## State Inventory by Category

### ✅ COVERED: Modules with cleanup functions

| Module | State Containers | Cleanup Function | Status |
|--------|-----------------|------------------|---------|
| `cache.ts` | feedStates, arrivalsCache, positionsCache, positionsFetchedAt | resetAllCacheStateForTesting | ✓ |
| `alerts-poller.ts` | pollTimer, previousAlertIds, changeListeners | resetAlertsCacheForTesting | ✓ |
| `middleware/authentication.ts` | apiKeys, sessions, auditLog, refreshTokens, deviceFingerprints, oauthProviders, oauthStates, totpConfigs, authFailuresByIp, suspiciousIps | resetAuthenticationState | ✓ |
| `middleware/api-key-management.ts` | API_KEY_REGISTRY, API_KEY_LAST_USED, API_KEY_DESCRIPTIONS | clearAllApiKeys | ✓ |
| `middleware/rate-limiter.ts` | buckets, testMode, lastPrune | resetRateLimiter | ✓ |
| `middleware/auth-rate-limit.ts` | rateLimitStore, apiKeyRateLimitStore, trustedIps, unbannedIps | _clearAllRateLimits | ✓ |
| `middleware/authorization-security.ts` | accessPatterns | clearAccessPatterns | ✓ |
| `middleware/audit-log.ts` | AUDIT_LOG, eventIdCounter | resetAuditLog | ✓ |
| `middleware/token-encryption.ts` | oldKeys, encryptionConfig | resetEncryptionState | ✓ |
| `trip-tracking.ts` | db, stations | resetTripTrackingForTesting | ✓ |
| `shuttle-matcher.ts` | segments | resetShuttleCache | ✓ |
| `delay-detector.ts` | trackedTrips, activePredictedAlerts, alertListeners, config, travelTimes, routes, stations | resetDelayDetector | ✓ |
| `transformer.ts` | prevTripStops | resetTransformerState | ✓ |
| `context-service.ts` | db, stations, currentContext, currentSettings | resetContextService | ✓ |

### ❌ NOT COVERED: State without cleanup

#### Data Polling & Feeds

| Module | State Containers | Risk Level |
|--------|-----------------|------------|
| `poller.ts` | stopToStation, stations, routes, pollTimer | HIGH - Timer state leak |
| `equipment-poller.ts` | pollTimer, equipmentByStation, stationNameToIds | HIGH - Timer state leak |
| `gtfs-refresh.ts` | refreshTimer, isRefreshing | HIGH - Timer state leak |

#### Delay Detection & Prediction

| Module | State Containers | Risk Level |
|--------|-----------------|------------|
| `delay-predictor.ts` | delayRecords, aggregatedStats, weatherOverride, currentWeather, _travelTimes, stations | HIGH - Test pollution |

#### Session & Security Middleware

| Module | State Containers | Risk Level |
|--------|-----------------|------------|
| `middleware/csrf-protection.ts` | tokenStore | MEDIUM - CSRF bypass in tests |
| `middleware/concurrent-session-management.ts` | userSessionRegistry, deviceSessionRegistry, cleanupInterval | HIGH - Timer state leak |
| `middleware/session-security.ts` | sessionSecurityEvents, deviceTrustStorage | MEDIUM - Session pollution |
| `middleware/enhanced-jwt-security.ts` | tokenUsageRecords, _deviceFingerprints, tokenRevocations, suspectedCompromises | HIGH - JWT bypass in tests |
| `middleware/suspicious-activity-notifications.ts` | notificationPreferences, recentEvents, notificationHistory, notificationRateLimits, notificationTemplates | MEDIUM - Notification pollution |
| `middleware/password-management.ts` | passwordResetTokens, passwordHistory, passwordValidationAttempts, passwordResetAttempts, accountLockouts, breachedPasswordCache, tokenCleanupInterval, PASSWORD_PEPPER | HIGH - Auth bypass in tests |
| `middleware/jwt-validation.ts` | replayStore | MEDIUM - Replay protection bypass |
| `middleware/captcha.ts` | failedCaptchaAttempts, captchaConfigs, defaultCaptchaConfig | LOW - Captcha pollution |
| `middleware/structured-audit-log.ts` | auditLogStorage, stats | MEDIUM - Audit log pollution |
| `middleware/cookie-security.ts` | signingConfig | LOW - Cookie validation issues |
| `middleware/dynamic-rbac-cache.ts` | permissionCache, permissionOverrides, emergencyRevocations, cacheStats | HIGH - Authorization bypass |

#### Core Business Logic

| Module | State Containers | Risk Level |
|--------|-----------------|------------|
| `trip-lookup.ts` | tripFirstSeen, lastPrune | MEDIUM - Trip tracking pollution |
| `alerts-parser.ts` | patterns | LOW - Pattern caching |
| `push/briefing.ts` | lastCheckDate, sentToday | MEDIUM - Push notification pollution |
| `push/vapid.ts` | vapidKeys | LOW - VAPID key reuse |
| `push/subscriptions.ts` | db | LOW - DB reference |
| `migration/migration.ts` | constants, migrationLock | HIGH - Migration lock leak |
| `transfer/travel-times.ts` | travelTimesCache | LOW - Cache pollution |
| `observability/opentelemetry.ts` | tracerProvider | LOW - Tracer leak |
| `security/security-db.ts` | _db | LOW - DB reference |
| `services/password-reset.service.ts` | emailConfig, resetBaseUrl | LOW - Config pollution |
| `routes/password-reset.routes.ts` | users | MEDIUM - User record pollution |
| `middleware/enhanced-authorization.ts` | RESOURCE_TYPES | LOW - Resource type config |

## Risk Assessment

### Critical Risks (Timer Leaks)
- **poller.ts**, **equipment-poller.ts**, **gtfs-refresh.ts**, **concurrent-session-management.ts**: Uncleared timers can cause:
  - Callbacks firing in subsequent tests
  - Resource leaks
  - Unpredictable async behavior
  - Test timeouts

### High Risks (Security Bypass)
- **delay-predictor.ts**: Delay prediction state can cause flaky behavior
- **enhanced-jwt-security.ts**: JWT state can cause authentication bypass in tests
- **password-management.ts**: Password reset state can cause authentication bypass
- **dynamic-rbac-cache.ts**: Permission cache can cause authorization bypass

### Medium Risks (Test Pollution)
- **session-security.ts**, **suspicious-activity-notifications.ts**: Security event state can accumulate
- **structured-audit-log.ts**: Audit logs can grow unbounded
- **password-reset.routes.ts**: User records can leak between tests

## Recommendations

### Immediate Actions

1. **Fix the try-catch silent failure** in `cleanupAllState()`:
   - Log which modules failed to import
   - Log which reset functions don't exist
   - Consider throwing on failure rather than silently skipping

2. **Add cleanup functions for timer-owning modules**:
   - `poller.ts` - `stopPoller()` or `resetPoller()`
   - `equipment-poller.ts` - `stopEquipmentPoller()` or `resetEquipmentPoller()`
   - `gtfs-refresh.ts` - `stopGtfsRefresh()` or `resetGtfsRefresh()`
   - `middleware/concurrent-session-management.ts` - `stopSessionCleanup()` or `resetSessionCleanup()`

3. **Add cleanup functions for security-critical modules**:
   - `middleware/enhanced-jwt-security.ts` - `resetJwtSecurity()`
   - `middleware/password-management.ts` - `resetPasswordManagement()`
   - `middleware/dynamic-rbac-cache.ts` - `resetRbacCache()`
   - `delay-predictor.ts` - `resetDelayPredictor()`

### Long-term Improvements

1. **Standardize cleanup function naming**: All reset functions should follow `reset<ModuleName>()` convention

2. **Add cleanup verification**: After cleanupAllState(), verify that all known state containers are empty/reset

3. **Consider state container registration**: A pattern where modules register their cleanup functions on initialization

4. **Add tests for cleanup itself**: Verify that cleanupAllState() actually resets all state

## Methodology Notes

- This audit was conducted by searching for module-level `Map`, `Set`, and mutable `let` declarations
- Configuration constants and purely read-only exports were excluded
- Test files and spec files were excluded from the inventory
- The `cleanupAllState()` function lines 445-504 in `test-helpers.ts` were examined for current coverage
