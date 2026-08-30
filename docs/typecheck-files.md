# Typecheck Errors by File

This document lists all files affected by TypeScript typecheck errors, sorted by file path with error counts.

## Summary

- **Total files with errors**: 51
- **Total errors**: 532

## Server Files

| File | Error Count |
|------|-------------|
| packages/server/src/app.ts | 3 |
| packages/server/src/middleware/cookie-security.ts | 2 |
| packages/server/src/middleware/dynamic-rbac-cache.ts | 2 |
| packages/server/src/middleware/enhanced-authentication.ts | 1 |
| packages/server/src/middleware/enhanced-jwt-security.ts | 1 |
| packages/server/src/middleware/http-request-smuggling.ts | 1 |
| packages/server/src/middleware/http-response-splitting.ts | 1 |
| packages/server/src/middleware/security-headers.ts | 1 |

**Server Subtotal**: 8 files, 12 errors

## Web Component Files

| File | Error Count |
|------|-------------|
| packages/web/src/components/alerts/AlertBanner.test.tsx | 24 |
| packages/web/src/components/alerts/AlertCard.test.tsx | 35 |
| packages/web/src/components/alerts/AlertList.test.tsx | 13 |
| packages/web/src/components/alerts/ShuttleInfo.test.tsx | 22 |
| packages/web/src/components/arrivals/ArrivalList.test.tsx | 35 |
| packages/web/src/components/arrivals/ArrivalRow.test.tsx | 28 |
| packages/web/src/components/common/DataState.test.tsx | 1 |
| packages/web/src/components/common/ErrorBoundary.test.tsx | 2 |
| packages/web/src/components/equipment/EquipmentBanner.test.tsx | 24 |
| packages/web/src/components/favorites/FavoritesList.test.tsx | 35 |
| packages/web/src/components/health/DataHealth.test.tsx | 19 |
| packages/web/src/components/health/LineStatusTile.test.tsx | 39 |
| packages/web/src/components/layout/Screen.test.tsx | 1 |
| packages/web/src/components/trip/TripTracker.test.tsx | 4 |

**Web Component Subtotal**: 14 files, 282 errors

## Web Hook Files

| File | Error Count |
|------|-------------|
| packages/web/src/hooks/useAlerts.test.ts | 9 |
| packages/web/src/hooks/useAlerts.ts | 1 |
| packages/web/src/hooks/useArrivals.test.ts | 1 |
| packages/web/src/hooks/useContextSort.test.ts | 42 |
| packages/web/src/hooks/useEquipment.test.ts | 1 |
| packages/web/src/hooks/useErrorHandler.test.ts | 1 |
| packages/web/src/hooks/useGeofence.test.ts | 1 |
| packages/web/src/hooks/useGeolocation.test.ts | 3 |
| packages/web/src/hooks/useInferredTrips.test.ts | 7 |
| packages/web/src/hooks/useIntersectionObserver.test.ts | 1 |
| packages/web/src/hooks/useMorningBriefing.test.ts | 15 |
| packages/web/src/hooks/useOfflineCountdown.test.ts | 6 |
| packages/web/src/hooks/usePositions.test.ts | 16 |
| packages/web/src/hooks/usePrefetch.test.ts | 5 |
| packages/web/src/hooks/usePushNotifications.test.ts | 5 |
| packages/web/src/hooks/useStaleness.test.ts | 1 |
| packages/web/src/hooks/useTripTracker.test.ts | 17 |
| packages/web/src/hooks/useTripTracker.ts | 3 |

**Web Hook Subtotal**: 18 files, 134 errors

## Web Library Files

| File | Error Count |
|------|-------------|
| packages/web/src/lib/api.test.ts | 17 |
| packages/web/src/lib/apiCached.test.ts | 1 |
| packages/web/src/lib/apiEnhanced.test.ts | 12 |
| packages/web/src/lib/backgroundSync.test.ts | 8 |
| packages/web/src/lib/backgroundSync.ts | 3 |
| packages/web/src/lib/prefetch.ts | 2 |
| packages/web/src/lib/serviceWorkerRegistration.test.ts | 7 |

**Web Library Subtotal**: 7 files, 50 errors

## Web Screen Files

| File | Error Count |
|------|-------------|
| packages/web/src/screens/HomeScreen.test.tsx | 11 |

**Web Screen Subtotal**: 1 file, 11 errors

## Web Store Files

| File | Error Count |
|------|-------------|
| packages/web/src/stores/fareStore.ts | 1 |

**Web Store Subtotal**: 1 file, 1 error

## Top 10 Files by Error Count

| Rank | File | Errors |
|------|------|--------|
| 1 | packages/web/src/components/health/LineStatusTile.test.tsx | 39 |
| 2 | packages/web/src/hooks/useContextSort.test.ts | 42 |
| 3 | packages/web/src/components/alerts/AlertCard.test.tsx | 35 |
| 4 | packages/web/src/components/favorites/FavoritesList.test.tsx | 35 |
| 5 | packages/web/src/components/arrivals/ArrivalList.test.tsx | 35 |
| 6 | packages/web/src/components/arrivals/ArrivalRow.test.tsx | 28 |
| 7 | packages/web/src/components/alerts/ShuttleInfo.test.tsx | 22 |
| 8 | packages/web/src/components/alerts/AlertBanner.test.tsx | 24 |
| 9 | packages/web/src/components/equipment/EquipmentBanner.test.tsx | 24 |
| 10 | packages/web/src/hooks/useTripTracker.test.ts | 17 |

---

**Generated**: 2026-08-30
**Source**: `docs/typecheck-raw-output.txt`
