import { Suspense, lazy, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import {
  ErrorBoundary,
  LiveRegion,
  OfflineBanner,
  ScreenErrorBoundary,
  useRouteChangeAnnouncer,
} from "./components/common";

// HomeScreen is eagerly loaded (initial route, critical for FCP)
import HomeScreen from "./screens/HomeScreen";

// Other screens are lazy-loaded for code splitting
const SearchScreen = lazy(() => import("./screens/SearchScreen"));
const CommuteScreen = lazy(() => import("./screens/CommuteScreen"));
const AlertsScreen = lazy(() => import("./screens/AlertsScreen"));
const StationScreen = lazy(() => import("./screens/StationScreen"));
const TripScreen = lazy(() => import("./screens/TripScreen"));
const MapScreen = lazy(() => import("./screens/MapScreen"));
const SettingsScreen = lazy(() => import("./screens/SettingsScreen"));
const HealthScreen = lazy(() => import("./screens/HealthScreen"));
const LineDiagramScreen = lazy(() => import("./screens/LineDiagramScreen"));
const JournalScreen = lazy(() => import("./screens/JournalScreen"));
const StatsScreen = lazy(() => import("./screens/StatsScreen"));

// PWA prompts are lazy-loaded (only shown conditionally)
const ServiceWorkerUpdatePrompt = lazy(() =>
  import("./components/common/ServiceWorkerUpdatePrompt").then((m) => ({
    default: m.ServiceWorkerUpdatePrompt,
  }))
);
const PWAInstallPrompt = lazy(() =>
  import("./components/common/ServiceWorkerUpdatePrompt").then((m) => ({
    default: m.PWAInstallPrompt,
  }))
);

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <OfflineBanner />
        <AppRoutes />
      </BrowserRouter>
      <Suspense fallback={null}>
        <ServiceWorkerUpdatePrompt />
        <PWAInstallPrompt />
      </Suspense>
    </ErrorBoundary>
  );
}

/** Inner component to use router context for announcements */
function AppRoutes() {
  // Announce route changes to screen readers
  useRouteChangeAnnouncer();

  // Prefetch likely next routes based on current location
  useRoutePrefetch();

  return (
    <>
      {/* Live region for screen reader announcements (route changes, etc.) */}
      <LiveRegion />
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route
            path="/"
            element={
              <ScreenErrorBoundary screenName="Home">
                <HomeScreen />
              </ScreenErrorBoundary>
            }
          />
          <Route
            path="/search"
            element={
              <ScreenErrorBoundary screenName="Search">
                <SearchScreen />
              </ScreenErrorBoundary>
            }
          />
          <Route
            path="/commute"
            element={
              <ScreenErrorBoundary screenName="Commute">
                <CommuteScreen />
              </ScreenErrorBoundary>
            }
          />
          <Route
            path="/commute/:commuteId"
            element={
              <ScreenErrorBoundary screenName="Commute">
                <CommuteScreen />
              </ScreenErrorBoundary>
            }
          />
          <Route
            path="/alerts"
            element={
              <ScreenErrorBoundary screenName="Alerts">
                <AlertsScreen />
              </ScreenErrorBoundary>
            }
          />
          <Route
            path="/map"
            element={
              <ScreenErrorBoundary screenName="Map">
                <MapScreen />
              </ScreenErrorBoundary>
            }
          />
          <Route
            path="/health"
            element={
              <ScreenErrorBoundary screenName="Health">
                <HealthScreen />
              </ScreenErrorBoundary>
            }
          />
          <Route
            path="/station/:stationId"
            element={
              <ScreenErrorBoundary screenName="Station">
                <StationScreen />
              </ScreenErrorBoundary>
            }
          />
          <Route
            path="/line/:lineId"
            element={
              <ScreenErrorBoundary screenName="Line Diagram">
                <LineDiagramScreen />
              </ScreenErrorBoundary>
            }
          />
          <Route
            path="/trip/:tripId"
            element={
              <ScreenErrorBoundary screenName="Trip">
                <TripScreen />
              </ScreenErrorBoundary>
            }
          />
          <Route
            path="/journal"
            element={
              <ScreenErrorBoundary screenName="Journal">
                <JournalScreen />
              </ScreenErrorBoundary>
            }
          />
          <Route
            path="/stats"
            element={
              <ScreenErrorBoundary screenName="Stats">
                <StatsScreen />
              </ScreenErrorBoundary>
            }
          />
          <Route
            path="/settings"
            element={
              <ScreenErrorBoundary screenName="Settings">
                <SettingsScreen />
              </ScreenErrorBoundary>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  );
}

function LoadingFallback() {
  return (
    <div
      className="flex items-center justify-center h-dvh"
      role="status"
      aria-live="polite"
      aria-label="Loading"
    >
      <div className="skeleton w-16 h-16 rounded-full" aria-hidden="true" />
      <span className="sr-only">Loading...</span>
    </div>
  );
}

/**
 * Prefetch route chunks based on current location.
 * On home screen, prefetch the most likely next screens.
 */
function useRoutePrefetch() {
  const location = useLocation();

  useEffect(() => {
    // Only prefetch on home screen to save bandwidth
    if (location.pathname !== "/") return;

    // Prefetch the most commonly accessed screens after home
    const prefetchTimer = setTimeout(() => {
      // SearchScreen (users often search after home)
      import("./screens/SearchScreen");
      // AlertsScreen (commuters check alerts frequently)
      import("./screens/AlertsScreen");
      // MapScreen (visual navigation is popular)
      import("./screens/MapScreen");
    }, 1500); // Delay 1.5s to prioritize initial render

    return () => clearTimeout(prefetchTimer);
  }, [location.pathname]);
}

export default App;
