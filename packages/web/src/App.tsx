import { Suspense, lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import {
  ErrorBoundary,
  LiveRegion,
  OfflineBanner,
  PWAInstallPrompt,
  ScreenErrorBoundary,
  ServiceWorkerUpdatePrompt,
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

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <OfflineBanner />
        <AppRoutes />
      </BrowserRouter>
      <ServiceWorkerUpdatePrompt />
      <PWAInstallPrompt />
    </ErrorBoundary>
  );
}

/** Inner component to use router context for announcements */
function AppRoutes() {
  // Announce route changes to screen readers
  useRouteChangeAnnouncer();

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

export default App;
