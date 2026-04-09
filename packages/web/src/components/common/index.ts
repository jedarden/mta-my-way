/**
 * Common components barrel export.
 *
 * This file is marked with sideEffects: false in package.json to enable tree-shaking.
 * Only import what you need - unused exports will be eliminated from the bundle.
 */

// Data state components
export { DataState } from "./DataState";

// Offline/network status
export { OfflineBanner } from "./OfflineBanner";
export { NetworkStatusIndicator } from "./NetworkStatusIndicator";

// Image components
export { default as LazyImage } from "./LazyImage";

// Empty state components
export {
  EmptyFavorites,
  EmptyCommutes,
  EmptyArrivals,
  EmptyAlerts,
  EmptySearchResults,
  EmptyJournal,
} from "./EmptyState";

// Skeleton loading components
export {
  FavoriteCardSkeleton,
  ArrivalListSkeleton,
  ArrivalRowSkeleton,
  AlertListSkeleton,
  AlertCardSkeleton,
  CommuteCardSkeleton,
  CommuteListSkeleton,
  FavoritesListSkeleton,
  Skeleton,
} from "./Skeleton";

// Error boundaries
export { ErrorBoundary } from "./ErrorBoundary";
export { ScreenErrorBoundary } from "./ScreenErrorBoundary";
export { ComponentErrorBoundary } from "./ComponentErrorBoundary";

// API error display
export { ApiErrorDisplay } from "./ApiErrorDisplay";

// Focus trap
export { FocusTrap, useFocusTrap } from "./FocusTrap";

// Live region announcers
export { LiveRegion, useLiveAnnouncer, useRouteChangeAnnouncer } from "./LiveAnnouncer";

// PWA prompts (lazy-load these in App.tsx for better code splitting)
export {
  ServiceWorkerUpdatePrompt,
  PWAInstallPrompt,
} from "./ServiceWorkerUpdatePrompt";

// Fallback UI components
export {
  NetworkRetryState,
  CompactNetworkRetry,
} from "./NetworkRetryState";

export {
  ImageErrorFallback,
  SafeImage,
} from "./ImageErrorFallback";

export {
  GeolocationPermissionFallback,
  GeolocationPermissionBanner,
} from "./GeolocationPermissionFallback";

export {
  FullScreenLoadingState,
  InlineLoadingState,
} from "./FullScreenLoadingState";
