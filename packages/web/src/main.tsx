import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/globals.css";

// Register service worker for PWA functionality
import { registerServiceWorker } from "./lib/serviceWorkerRegistration";

// Register the service worker with update handling — but only after the load
// event. The worker's install step downloads the entire precache manifest
// (~860KB), which competes with the FCP/LCP critical path for bandwidth on a
// first visit; by load, the document and its chunks are already on the page.
// registerSW keeps immediate: true internally so this still registers without
// waiting once the load event has fired.
if (document.readyState === "complete") {
  registerServiceWorker();
} else {
  window.addEventListener("load", () => registerServiceWorker(), { once: true });
}

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element not found");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
