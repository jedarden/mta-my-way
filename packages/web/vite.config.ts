import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import type { Plugin, Rollup } from "rollup";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

/**
 * Bundle size budget plugin.
 * Fails the build if:
 * - Any individual chunk exceeds MAX_CHUNK_SIZE_KB gzipped
 * - Total JS exceeds MAX_TOTAL_JS_KB gzipped
 */
const MAX_CHUNK_SIZE_KB = 50; // 50KB per chunk max
const MAX_TOTAL_JS_KB = 170; // 170KB total JS max (includes lazy-loaded screens)
const MAX_INITIAL_BUNDLE_KB = 200; // 200KB initial bundle max (acceptance criteria)

// Per-chunk overrides for known large vendor dependencies
const CHUNK_SIZE_OVERRIDES: Record<string, number> = {
  "react-dom": 60, // React 19's react-dom is ~56KB gzip, cannot be reduced
  html2canvas: 50, // Loaded on-demand only when sharing
};

// Chunks excluded from total JS budget (loaded on-demand, not part of initial bundle)
const CHUNK_TOTAL_EXCLUSIONS = ["html2canvas"];

function bundleSizeBudget(): Plugin {
  return {
    name: "bundle-size-budget",
    enforce: "post",
    apply: "build",
    async writeBundle(_options, bundle) {
      // Use dynamic import for gzip-size (ESM only)
      const { gzipSize } = await import("gzip-size");
      const { basename } = await import("node:path");

      const jsChunks: { name: string; sizeKb: number }[] = [];
      let hasErrors = false;

      for (const [fileName, output] of Object.entries(bundle)) {
        if (fileName.endsWith(".js") && output.type === "chunk") {
          const chunk = output as Rollup.OutputChunk;
          const gzipped = await gzipSize(Buffer.from(chunk.code));
          const sizeKb = Math.round((gzipped / 1024) * 100) / 100;
          jsChunks.push({ name: basename(fileName), sizeKb });

          // Check per-chunk override, fall back to global limit
          const chunkLimit =
            Object.entries(CHUNK_SIZE_OVERRIDES).find(([name]) =>
              basename(fileName).startsWith(name)
            )?.[1] ?? MAX_CHUNK_SIZE_KB;

          if (sizeKb > chunkLimit) {
            console.error(
              `\x1b[31m✗ Bundle budget exceeded: ${basename(fileName)} is ${sizeKb}KB gzipped (max ${chunkLimit}KB)\x1b[0m`
            );
            hasErrors = true;
          }
        }
      }

      const totalJsKb =
        Math.round(
          jsChunks
            .filter((c) => !CHUNK_TOTAL_EXCLUSIONS.some((ex) => c.name.startsWith(ex)))
            .reduce((sum, c) => sum + c.sizeKb, 0) * 100
        ) / 100;
      if (totalJsKb > MAX_TOTAL_JS_KB) {
        console.error(
          `\x1b[31m✗ Total JS budget exceeded: ${totalJsKb}KB gzipped (max ${MAX_TOTAL_JS_KB}KB)\x1b[0m`
        );
        hasErrors = true;
      }

      // Print summary
      console.log("\n\x1b[36m📦 Bundle Size Summary (gzipped):\x1b[0m");
      for (const chunk of jsChunks.sort((a, b) => b.sizeKb - a.sizeKb)) {
        const chunkLimit =
          Object.entries(CHUNK_SIZE_OVERRIDES).find(([name]) => chunk.name.startsWith(name))?.[1] ??
          MAX_CHUNK_SIZE_KB;
        const status = chunk.sizeKb > chunkLimit ? "\x1b[31m" : "\x1b[32m";
        const limitNote = chunkLimit !== MAX_CHUNK_SIZE_KB ? ` (limit: ${chunkLimit}KB)` : "";
        console.log(`  ${status}${chunk.name}: ${chunk.sizeKb}KB${limitNote}\x1b[0m`);
      }
      const totalStatus = totalJsKb > MAX_TOTAL_JS_KB ? "\x1b[31m" : "\x1b[32m";
      console.log(`  ${totalStatus}Total JS: ${totalJsKb}KB\x1b[0m\n`);

      if (hasErrors) {
        throw new Error("Bundle size budget exceeded");
      }
    },
  };
}

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["favicon.svg", "icons/*.svg", "offline.html", "sw-push.js"],
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
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webp,jpg,jpeg}"],
        // Cleanup outdated caches
        cleanupOutdatedCaches: true,
        // Skip waiting for faster updates
        skipWaiting: true,
        // Clients claim to ensure all pages are controlled immediately
        clientsClaim: true,
        runtimeCaching: [
          // ---------------------------------------------------------------------------
          // Static reference data (rarely changes) - CacheFirst with long TTL
          // ---------------------------------------------------------------------------
          {
            urlPattern: /^https?:\/\/[^\/]+\/api\/stations$/,
            handler: "CacheFirst",
            options: {
              cacheName: "stations-static-cache",
              expiration: { maxEntries: 1, maxAgeSeconds: 60 * 60 * 24 * 7 }, // 7 days
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https?:\/\/[^\/]+\/api\/static\/complexes$/,
            handler: "CacheFirst",
            options: {
              cacheName: "complexes-static-cache",
              expiration: { maxEntries: 1, maxAgeSeconds: 60 * 60 * 24 * 7 }, // 7 days
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https?:\/\/[^\/]+\/api\/routes$/,
            handler: "CacheFirst",
            options: {
              cacheName: "routes-static-cache",
              expiration: { maxEntries: 1, maxAgeSeconds: 60 * 60 * 24 * 7 }, // 7 days
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // ---------------------------------------------------------------------------
          // Semi-static data (changes occasionally) - StaleWhileRevalidate
          // ---------------------------------------------------------------------------
          {
            urlPattern: /^https?:\/\/[^\/]+\/api\/equipment/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "equipment-cache",
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 30 }, // 30 minutes
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https?:\/\/[^\/]+\/api\/alerts/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "alerts-cache",
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 2 }, // 2 minutes
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // ---------------------------------------------------------------------------
          // Real-time data (changes frequently) - NetworkFirst with short cache
          // ---------------------------------------------------------------------------
          {
            urlPattern: /^https?:\/\/[^\/]+\/api\/arrivals/,
            handler: "NetworkFirst",
            options: {
              cacheName: "arrivals-cache",
              expiration: { maxEntries: 100, maxAgeSeconds: 30 }, // 30 seconds
              cacheableResponse: { statuses: [0, 200] },
              networkTimeoutSeconds: 3, // Fall back to cache after 3s
            },
          },
          {
            urlPattern: /^https?:\/\/[^\/]+\/api\/positions/,
            handler: "NetworkFirst",
            options: {
              cacheName: "positions-cache",
              expiration: { maxEntries: 25, maxAgeSeconds: 30 }, // 30 seconds
              cacheableResponse: { statuses: [0, 200] },
              networkTimeoutSeconds: 3,
            },
          },
          // ---------------------------------------------------------------------------
          // Health & status endpoints - balanced caching
          // ---------------------------------------------------------------------------
          {
            urlPattern: /^https?:\/\/[^\/]+\/api\/health/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "health-cache",
              expiration: { maxEntries: 5, maxAgeSeconds: 60 }, // 1 minute
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // ---------------------------------------------------------------------------
          // Push notification endpoints - no caching
          // ---------------------------------------------------------------------------
          {
            urlPattern: /^https?:\/\/[^\/]+\/api\/push/,
            handler: "NetworkFirst",
            options: {
              cacheName: "push-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // ---------------------------------------------------------------------------
          // Commute analysis - moderate caching
          // ---------------------------------------------------------------------------
          {
            urlPattern: /^https?:\/\/[^\/]+\/api\/commute/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "commute-cache",
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 5 }, // 5 minutes
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // ---------------------------------------------------------------------------
          // Trip tracking - real-time with cache fallback
          // ---------------------------------------------------------------------------
          {
            urlPattern: /^https?:\/\/[^\/]+\/api\/trip/,
            handler: "NetworkFirst",
            options: {
              cacheName: "trip-cache",
              expiration: { maxEntries: 50, maxAgeSeconds: 45 }, // 45 seconds
              cacheableResponse: { statuses: [0, 200] },
              networkTimeoutSeconds: 3,
            },
          },
          // ---------------------------------------------------------------------------
          // Static assets (CSS, JS) - CacheFirst for offline availability
          // ---------------------------------------------------------------------------
          {
            urlPattern: /\.(?:css|js)$/,
            handler: "CacheFirst",
            options: {
              cacheName: "static-resources-cache",
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 }, // 30 days
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // ---------------------------------------------------------------------------
          // Static assets (icons, images) - CacheFirst
          // ---------------------------------------------------------------------------
          {
            urlPattern: /\.(?:svg|png|jpg|jpeg|webp|ico)$/,
            handler: "CacheFirst",
            options: {
              cacheName: "images-cache",
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 30 }, // 30 days
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // ---------------------------------------------------------------------------
          // External fonts (if added later) - CacheFirst with long TTL
          // ---------------------------------------------------------------------------
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com/,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 }, // 1 year
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // ---------------------------------------------------------------------------
          // App shell - index.html and manifest for offline PWA functionality
          // ---------------------------------------------------------------------------
          {
            urlPattern: /\/(?:index\.html?|manifest\.webmanifest)$/,
            handler: "CacheFirst",
            options: {
              cacheName: "app-shell-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 7 }, // 7 days
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
        // Configure which requests to handle
        navigateFallback: "/offline.html",
        navigateFallbackDenylist: [/^\/api/, /^\/node_modules/],
        // Precache the manifest for offline PWA installation
        manifestTransforms: [
          async (entries) => {
            // Ensure manifest.webmanifest is precached with high priority
            const manifestEntry = entries.find((e) => e.url.endsWith("webmanifest"));
            if (manifestEntry) {
              manifestEntry.revision = `${Date.now()}`;
            }
            return { manifest: entries, warnings: [] };
          },
        ],
      },
    }),
    // Bundle analysis - generates stats.html in build output
    visualizer({
      filename: "dist/stats.html",
      open: false,
      gzipSize: true,
      brotliSize: false,
    }),
    // Bundle size budget enforcement
    bundleSizeBudget(),
  ],
  build: {
    outDir: "dist",
    sourcemap: true,
    // Use terser for smaller bundles
    minify: "terser",
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ["console.log", "console.info", "console.debug"],
        passes: 2,
        unsafe: true,
        unsafe_comps: true,
        unsafe_Function: true,
        unsafe_math: true,
        unsafe_proto: true,
        unsafe_regexp: true,
      },
      format: {
        comments: false,
      },
    },
    rollupOptions: {
      treeshake: {
        moduleSideEffects: false,
        propertyReadSideEffects: false,
        unknownGlobalSideEffects: false,
      },
      output: {
        // Fine-grained chunk splitting for optimal caching
        manualChunks(id) {
          // Split React and ReactDOM into separate chunks to stay under per-chunk budget
          if (id.includes("node_modules/react-dom/")) {
            return "react-dom";
          }
          if (id.includes("node_modules/react/") && !id.includes("node_modules/react-dom/")) {
            return "react";
          }
          if (id.includes("node_modules/react-router-dom/")) {
            return "router";
          }
          // State management
          if (id.includes("node_modules/zustand/")) {
            return "zustand";
          }
          // Shared types (small, can be inlined but explicit is clearer)
          if (id.includes("packages/shared/")) {
            return "shared";
          }
          // Screens are lazy-loaded by React.lazy() in App.tsx
          // Each screen becomes its own chunk automatically
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
