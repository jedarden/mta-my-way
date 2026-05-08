# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: pwa-features.e2e.ts >> PWA Features >> Offline Functionality >> should load cached resources when offline
- Location: pwa-features.e2e.ts:65:5

# Error details

```
Error: page.reload: net::ERR_INTERNET_DISCONNECTED
Call log:
  - waiting for navigation until "load"

```

# Test source

```ts
  1   | /**
  2   |  * E2E tests for PWA Features.
  3   |  *
  4   |  * Tests cover:
  5   |  * - Service worker registration
  6   |  * - Offline functionality
  7   |  * - Install prompt
  8   |  * - Update prompt
  9   |  * - App manifest
  10  |  * - Theme color
  11  |  * - Add to home screen
  12  |  * - Background sync
  13  |  */
  14  | 
  15  | import { expect, test } from "@playwright/test";
  16  | 
  17  | test.describe("PWA Features", () => {
  18  |   test.describe("Service Worker Registration", () => {
  19  |     test("should register service worker on load", async ({ page }) => {
  20  |       await page.goto("/");
  21  | 
  22  |       // Wait for service worker to register
  23  |       await page.waitForTimeout(2000);
  24  | 
  25  |       // Check if service worker is registered
  26  |       const swRegistered = await page.evaluate(async () => {
  27  |         if (!("serviceWorker" in navigator)) return false;
  28  |         const registration = await navigator.serviceWorker.getRegistration();
  29  |         return !!registration;
  30  |       });
  31  | 
  32  |       expect(swRegistered).toBe(true);
  33  |     });
  34  | 
  35  |     test("should have active service worker", async ({ page }) => {
  36  |       await page.goto("/");
  37  | 
  38  |       await page.waitForTimeout(2000);
  39  | 
  40  |       const swActive = await page.evaluate(async () => {
  41  |         if (!("serviceWorker" in navigator)) return false;
  42  |         const registration = await navigator.serviceWorker.getRegistration();
  43  |         return registration?.active?.state === "activated";
  44  |       });
  45  | 
  46  |       expect(swActive).toBe(true);
  47  |     });
  48  | 
  49  |     test("should service worker have correct scope", async ({ page }) => {
  50  |       await page.goto("/");
  51  | 
  52  |       await page.waitForTimeout(2000);
  53  | 
  54  |       const swScope = await page.evaluate(async () => {
  55  |         if (!("serviceWorker" in navigator)) return null;
  56  |         const registration = await navigator.serviceWorker.getRegistration();
  57  |         return registration?.scope;
  58  |       });
  59  | 
  60  |       expect(swScope).toBeTruthy();
  61  |     });
  62  |   });
  63  | 
  64  |   test.describe("Offline Functionality", () => {
  65  |     test("should load cached resources when offline", async ({ page }) => {
  66  |       // First load online to cache resources
  67  |       await page.goto("/");
  68  | 
  69  |       // Wait for service worker to cache
  70  |       await page.waitForTimeout(3000);
  71  | 
  72  |       // Go offline
  73  |       await page.context().setOffline(true);
> 74  |       await page.reload();
      |                  ^ Error: page.reload: net::ERR_INTERNET_DISCONNECTED
  75  | 
  76  |       // Should still show main content (from cache)
  77  |       await expect(page.locator('role=heading[name="Your Stations"]')).toBeAttached();
  78  | 
  79  |       // Restore online
  80  |       await page.context().setOffline(false);
  81  |     });
  82  | 
  83  |     test("should show offline banner when connection is lost", async ({ page }) => {
  84  |       await page.goto("/");
  85  | 
  86  |       // Go offline after initial load
  87  |       await page.context().setOffline(true);
  88  | 
  89  |       // Should show offline indicator
  90  |       const offlineBanner = page.locator("text=/offline|no connection/i");
  91  |       const hasOffline = await offlineBanner.count();
  92  | 
  93  |       if (hasOffline > 0) {
  94  |         await expect(offlineBanner.first()).toBeVisible();
  95  |       }
  96  | 
  97  |       await page.context().setOffline(false);
  98  |     });
  99  | 
  100 |     test("should hide offline banner when connection is restored", async ({ page }) => {
  101 |       await page.goto("/");
  102 | 
  103 |       // Go offline
  104 |       await page.context().setOffline(true);
  105 |       await page.waitForTimeout(1000);
  106 | 
  107 |       // Come back online
  108 |       await page.context().setOffline(false);
  109 |       await page.reload();
  110 | 
  111 |       // Offline banner should be gone
  112 |       const offlineBanner = page.locator("text=/offline|no connection/i").first();
  113 |       const isVisible = await offlineBanner.isVisible().catch(() => false);
  114 | 
  115 |       expect(isVisible).toBe(false);
  116 |     });
  117 | 
  118 |     test("should cache key routes for offline access", async ({ page }) => {
  119 |       const routes = ["/", "/search", "/alerts", "/map", "/commute"];
  120 | 
  121 |       for (const route of routes) {
  122 |         // Load route to cache it
  123 |         await page.goto(route);
  124 |         await page.waitForTimeout(500);
  125 |       }
  126 | 
  127 |       // Go offline
  128 |       await page.context().setOffline(true);
  129 | 
  130 |       // Try to access cached routes
  131 |       for (const route of routes) {
  132 |         await page.goto(route);
  133 | 
  134 |         // Should not show connection errors for cached routes
  135 |         const connectionError = page.locator("text=/no internet|connection failed/i");
  136 |         const hasError = await connectionError.count();
  137 | 
  138 |         // Either shows content (cached) or doesn't show connection error
  139 |         if (hasError > 0) {
  140 |           // If there's an error, verify it's not a fatal one
  141 |           const hasContent = await page.locator("role=main").count();
  142 |           expect(hasContent).toBeGreaterThan(0);
  143 |         }
  144 |       }
  145 | 
  146 |       await page.context().setOffline(false);
  147 |     });
  148 |   });
  149 | 
  150 |   test.describe("App Manifest", () => {
  151 |     test("should have valid web app manifest", async ({ page }) => {
  152 |       const response = await page.request.get("/manifest.webmanifest");
  153 | 
  154 |       expect(response.status()).toBe(200);
  155 | 
  156 |       const manifest = await response.json();
  157 | 
  158 |       // Should have required fields
  159 |       expect(manifest).toHaveProperty("name");
  160 |       expect(manifest).toHaveProperty("short_name");
  161 |       expect(manifest).toHaveProperty("start_url");
  162 |       expect(manifest).toHaveProperty("display");
  163 |       expect(manifest).toHaveProperty("icons");
  164 |     });
  165 | 
  166 |     test("should have PWA display mode", async ({ page }) => {
  167 |       const response = await page.request.get("/manifest.webmanifest");
  168 |       const manifest = await response.json();
  169 | 
  170 |       expect(manifest.display).toMatch(/standalone|fullscreen/);
  171 |     });
  172 | 
  173 |     test("should have theme color", async ({ page }) => {
  174 |       const response = await page.request.get("/manifest.webmanifest");
```