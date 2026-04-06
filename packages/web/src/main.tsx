import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/globals.css";

// Register service worker for PWA functionality
// The virtual module is provided by vite-plugin-pwa
import { registerSW } from "virtual:pwa-register";

// Register the service worker with update handling
registerSW({
  immediate: true, // Register immediately on app load
  onRegistered(registration) {
    // Service worker successfully registered
    console.log("Service Worker registered:", registration);
  },
  onRegisterError(error) {
    console.error("Service Worker registration failed:", error);
  },
});

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element not found");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
