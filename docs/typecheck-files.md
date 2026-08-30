# TypeScript Error Summary by File

Generated from `docs/typecheck-raw-output.txt` on 2026-08-30

## Summary

- **Total unique files affected:** 47
- **Total errors:** 680
- **Most affected file:** `packages/web/src/hooks/useContextSort.test.ts` (42 errors)

## Files by Error Count

### High Impact Files (20+ errors)

| Errors | File |
|--------|------|
| 42 | `packages/web/src/hooks/useContextSort.test.ts` |
| 39 | `packages/web/src/components/health/LineStatusTile.test.tsx` |
| 35 | `packages/web/src/components/favorites/FavoritesList.test.tsx` |
| 35 | `packages/web/src/components/arrivals/ArrivalList.test.tsx` |
| 35 | `packages/web/src/components/alerts/AlertCard.test.tsx` |
| 28 | `packages/web/src/components/arrivals/ArrivalRow.test.tsx` |
| 24 | `packages/web/src/components/equipment/EquipmentBanner.test.tsx` |
| 24 | `packages/web/src/components/alerts/AlertBanner.test.tsx` |
| 22 | `packages/web/src/components/alerts/ShuttleInfo.test.tsx` |
| 19 | `packages/web/src/components/health/DataHealth.test.tsx` |

### Medium Impact Files (10-19 errors)

| Errors | File |
|--------|------|
| 17 | `packages/web/src/lib/api.test.ts` |
| 17 | `packages/web/src/hooks/useTripTracker.test.ts` |
| 16 | `packages/web/src/hooks/usePositions.test.ts` |
| 15 | `packages/web/src/hooks/useMorningBriefing.test.ts` |
| 13 | `packages/web/src/components/alerts/AlertList.test.tsx` |
| 12 | `packages/web/src/lib/apiEnhanced.test.ts` |
| 11 | `packages/web/src/screens/HomeScreen.test.tsx` |

### Low Impact Files (1-9 errors)

| Errors | File |
|--------|------|
| 9 | `packages/web/src/hooks/useAlerts.test.ts` |
| 8 | `packages/web/src/lib/backgroundSync.test.ts` |
| 7 | `packages/web/src/lib/serviceWorkerRegistration.test.ts` |
| 7 | `packages/web/src/hooks/useInferredTrips.test.ts` |
| 6 | `packages/web/src/hooks/useOfflineCountdown.test.ts` |
| 5 | `packages/web/src/hooks/usePushNotifications.test.ts` |
| 5 | `packages/web/src/hooks/usePrefetch.test.ts` |
| 4 | `packages/web/src/components/trip/TripTracker.test.tsx` |
| 3 | `packages/web/src/lib/backgroundSync.ts` |
| 3 | `packages/web/src/hooks/useTripTracker.ts` |
| 3 | `packages/web/src/hooks/useGeolocation.test.ts` |
| 3 | `packages/server/src/app.ts` |
| 2 | `packages/web/src/lib/prefetch.ts` |
| 2 | `packages/web/src/components/common/ErrorBoundary.test.tsx` |
| 2 | `packages/server/src/middleware/dynamic-rbac-cache.ts` |
| 2 | `packages/server/src/middleware/cookie-security.ts` |
| 1 | `packages/web/src/stores/fareStore.ts` |
| 1 | `packages/web/src/lib/apiCached.test.ts` |
| 1 | `packages/web/src/hooks/useStaleness.test.ts` |
| 1 | `packages/web/src/hooks/useIntersectionObserver.test.ts` |
| 1 | `packages/web/src/hooks/useGeofence.test.ts` |
| 1 | `packages/web/src/hooks/useErrorHandler.test.ts` |
| 1 | `packages/web/src/hooks/useEquipment.test.ts` |
| 1 | `packages/web/src/hooks/useArrivals.test.ts` |
| 1 | `packages/web/src/hooks/useAlerts.ts` |
| 1 | `packages/web/src/components/layout/Screen.test.tsx` |
| 1 | `packages/web/src/components/common/DataState.test.tsx` |
| 1 | `packages/server/src/middleware/security-headers.ts` |
| 1 | `packages/server/src/middleware/http-response-splitting.ts` |
| 1 | `packages/server/src/middleware/http-request-smuggling.ts` |
| 1 | `packages/server/src/middleware/enhanced-jwt-security.ts` |
| 1 | `packages/server/src/middleware/enhanced-authentication.ts` |

## Complete List (Alphabetical by File Path)

```
packages/server/src/app.ts (3 errors)
packages/server/src/middleware/cookie-security.ts (2 errors)
packages/server/src/middleware/dynamic-rbac-cache.ts (2 errors)
packages/server/src/middleware/enhanced-authentication.ts (1 error)
packages/server/src/middleware/enhanced-jwt-security.ts (1 error)
packages/server/src/middleware/http-request-smuggling.ts (1 error)
packages/server/src/middleware/http-response-splitting.ts (1 error)
packages/server/src/middleware/security-headers.ts (1 error)
packages/web/src/components/alerts/AlertBanner.test.tsx (24 errors)
packages/web/src/components/alerts/AlertCard.test.tsx (35 errors)
packages/web/src/components/alerts/AlertList.test.tsx (13 errors)
packages/web/src/components/alerts/ShuttleInfo.test.tsx (22 errors)
packages/web/src/components/arrivals/ArrivalList.test.tsx (35 errors)
packages/web/src/components/arrivals/ArrivalRow.test.tsx (28 errors)
packages/web/src/components/common/DataState.test.tsx (1 error)
packages/web/src/components/common/ErrorBoundary.test.tsx (2 errors)
packages/web/src/components/equipment/EquipmentBanner.test.tsx (24 errors)
packages/web/src/components/health/DataHealth.test.tsx (19 errors)
packages/web/src/components/health/LineStatusTile.test.tsx (39 errors)
packages/web/src/components/favorites/FavoritesList.test.tsx (35 errors)
packages/web/src/components/layout/Screen.test.tsx (1 error)
packages/web/src/components/trip/TripTracker.test.tsx (4 errors)
packages/web/src/hooks/useAlerts.test.ts (9 errors)
packages/web/src/hooks/useAlerts.ts (1 error)
packages/web/src/hooks/useArrivals.test.ts (1 error)
packages/web/src/hooks/useContextSort.test.ts (42 errors)
packages/web/src/hooks/useEquipment.test.ts (1 error)
packages/web/src/hooks/useErrorHandler.test.ts (1 error)
packages/web/src/hooks/useGeofence.test.ts (1 error)
packages/web/src/hooks/useGeolocation.test.ts (3 errors)
packages/web/src/hooks/useInferredTrips.test.ts (7 errors)
packages/web/src/hooks/useIntersectionObserver.test.ts (1 error)
packages/web/src/hooks/useMorningBriefing.test.ts (15 errors)
packages/web/src/hooks/useOfflineCountdown.test.ts (6 errors)
packages/web/src/hooks/usePositions.test.ts (16 errors)
packages/web/src/hooks/usePrefetch.test.ts (5 errors)
packages/web/src/hooks/usePushNotifications.test.ts (5 errors)
packages/web/src/hooks/useStaleness.test.ts (1 error)
packages/web/src/hooks/useTripTracker.test.ts (17 errors)
packages/web/src/hooks/useTripTracker.ts (3 errors)
packages/web/src/lib/api.test.ts (17 errors)
packages/web/src/lib/apiCached.test.ts (1 error)
packages/web/src/lib/apiEnhanced.test.ts (12 errors)
packages/web/src/lib/backgroundSync.test.ts (8 errors)
packages/web/src/lib/backgroundSync.ts (3 errors)
packages/web/src/lib/prefetch.ts (2 errors)
packages/web/src/lib/serviceWorkerRegistration.test.ts (7 errors)
packages/web/src/screens/HomeScreen.test.tsx (11 errors)
packages/web/src/stores/fareStore.ts (1 error)
```

## Breakdown by Directory

| Directory | Files | Total Errors |
|----------|-------|--------------|
| `packages/web/src/components/` | 13 | 279 |
| `packages/web/src/hooks/` | 18 | 244 |
| `packages/web/src/lib/` | 8 | 50 |
| `packages/web/src/screens/` | 1 | 11 |
| `packages/web/src/stores/` | 1 | 1 |
| `packages/server/src/` | 8 | 13 |
| `packages/server/src/middleware/` | 7 | 10 |
