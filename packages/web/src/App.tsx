import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

// Lazy load screens for code splitting
const HomeScreen = lazy(() => import("./screens/HomeScreen"));
const SearchScreen = lazy(() => import("./screens/SearchScreen"));
const CommuteScreen = lazy(() => import("./screens/CommuteScreen"));
const AlertsScreen = lazy(() => import("./screens/AlertsScreen"));
const StationScreen = lazy(() => import("./screens/StationScreen"));
const SettingsScreen = lazy(() => import("./screens/SettingsScreen"));

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/search" element={<SearchScreen />} />
          <Route path="/commute" element={<CommuteScreen />} />
          <Route path="/alerts" element={<AlertsScreen />} />
          <Route path="/station/:stationId" element={<StationScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center h-dvh">
      <div className="skeleton w-16 h-16 rounded-full" />
    </div>
  );
}

export default App;
