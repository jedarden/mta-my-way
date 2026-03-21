import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "icons/*.svg"],
      manifest: {
        name: "MTA My Way",
        short_name: "MTA My Way",
        description:
          "Mobile-first PWA for NYC subway commuters - real-time arrivals, transfer intelligence, and filtered alerts",
        theme_color: "#0039A6",
        background_color: "#FFFFFF",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        categories: ["navigation", "travel"],
        icons: [
          {
            src: "/icons/icon-192.svg",
            sizes: "192x192",
            type: "image/svg+xml",
          },
          {
            src: "/icons/icon-512.svg",
            sizes: "512x512",
            type: "image/svg+xml",
          },
          {
            src: "/icons/icon-maskable.svg",
            sizes: "512x512",
            type: "image/svg+xml",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        importScripts: ["/sw-push.js"],
        globPatterns: ["**/*.{js,css,html,svg,png,ico}"],
        runtimeCaching: [
          // Static station data: CacheFirst (rarely changes)
          {
            urlPattern: /^https:\/\/.*\/api\/stations/,
            handler: "CacheFirst",
            options: {
              cacheName: "stations-cache",
              expiration: {
                maxEntries: 1,
                maxAgeSeconds: 60 * 60 * 24, // 24 hours
              },
            },
          },
          // Static routes data: CacheFirst (rarely changes)
          {
            urlPattern: /^https:\/\/.*\/api\/routes/,
            handler: "CacheFirst",
            options: {
              cacheName: "routes-cache",
              expiration: {
                maxEntries: 1,
                maxAgeSeconds: 60 * 60 * 24, // 24 hours
              },
            },
          },
          // Static complexes data: CacheFirst (rarely changes)
          {
            urlPattern: /^https:\/\/.*\/api\/static/,
            handler: "CacheFirst",
            options: {
              cacheName: "static-cache",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
              },
            },
          },
          // Arrivals API: StaleWhileRevalidate (show cached, update in background)
          {
            urlPattern: /^https:\/\/.*\/api\/arrivals/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "arrivals-cache",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 5, // 5 minutes
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          // Alerts API: StaleWhileRevalidate
          {
            urlPattern: /^https:\/\/.*\/api\/alerts/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "alerts-cache",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 2, // 2 minutes
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
  build: {
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "react-router-dom"],
          state: ["zustand"],
        },
      },
    },
  },
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
