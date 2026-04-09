import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/globals.css";

// Register service worker for PWA functionality
import { registerServiceWorker } from "./lib/serviceWorkerRegistration";

// Register the service worker with update handling
registerServiceWorker();

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element not found");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
