import { Suspense, lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ErrorBoundary, PWAInstallPrompt, ServiceWorkerUpdatePrompt } from "./components/common";

// HomeScreen is eagerly loaded (initial route, critical for FCP)
import HomeScreen from "./screens/HomeScreen";

// Other screens are lazy-loaded for code splitting
const SearchScreen = lazy(() => import("./screens/SearchScreen"));
const CommuteScreen = lazy(() => import("./screens/CommuteScreen"));
const AlertsScreen = lazy(() => import("./screens/AlertsScreen"));
const StationScreen = lazy(() => import("./screens/StationScreen"));
const TripScreen = lazy(() => import("./screens/TripScreen"));
const SettingsScreen = lazy(() => import("./screens/SettingsScreen"));
const HealthScreen = lazy(() => import("./screens/HealthScreen"));
const LineDiagramScreen = lazy(() => import("./screens/LineDiagramScreen"));
const JournalScreen = lazy(() => import("./screens/JournalScreen"));
const StatsScreen = lazy(() => import("./screens/StatsScreen"));

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Suspense fallback={<LoadingFallback />}>
          <Routes>
            <Route path="/" element={<HomeScreen />} />
            <Route path="/search" element={<SearchScreen />} />
            <Route path="/commute" element={<CommuteScreen />} />
            <Route path="/commute/:commuteId" element={<CommuteScreen />} />
            <Route path="/alerts" element={<AlertsScreen />} />
            <Route path="/health" element={<HealthScreen />} />
            <Route path="/station/:stationId" element={<StationScreen />} />
            <Route path="/line/:lineId" element={<LineDiagramScreen />} />
            <Route path="/trip/:tripId" element={<TripScreen />} />
            <Route path="/journal" element={<JournalScreen />} />
            <Route path="/stats" element={<StatsScreen />} />
            <Route path="/settings" element={<SettingsScreen />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
      <ServiceWorkerUpdatePrompt />
      <PWAInstallPrompt />
    </ErrorBoundary>
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
