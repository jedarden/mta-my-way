# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: pwa-features.e2e.ts >> PWA Features >> App Manifest >> should have theme color
- Location: pwa-features.e2e.ts:173:5

# Error details

```
SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
```

# Test source

```ts
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
> 175 |       const manifest = await response.json();
      |                        ^ SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
  176 | 
  177 |       expect(manifest).toHaveProperty("theme_color");
  178 | 
  179 |       // Check that theme color is applied to page
  180 |       await page.goto("/");
  181 | 
  182 |       const themeColor = await page.evaluate(() => {
  183 |         const meta = document.querySelector('meta[name="theme-color"]');
  184 |         return meta?.getAttribute("content");
  185 |       });
  186 | 
  187 |       expect(themeColor).toBeTruthy();
  188 |     });
  189 | 
  190 |     test("should have app icons defined", async ({ page }) => {
  191 |       const response = await page.request.get("/manifest.webmanifest");
  192 |       const manifest = await response.json();
  193 | 
  194 |       expect(Array.isArray(manifest.icons)).toBe(true);
  195 |       expect(manifest.icons.length).toBeGreaterThan(0);
  196 | 
  197 |       // First icon should have src and sizes
  198 |       expect(manifest.icons[0]).toHaveProperty("src");
  199 |       expect(manifest.icons[0]).toHaveProperty("sizes");
  200 |     });
  201 |   });
  202 | 
  203 |   test.describe("Install Prompt", () => {
  204 |     test("should not show install prompt on first visit", async ({ page }) => {
  205 |       await page.goto("/");
  206 | 
  207 |       // Wait a bit for any delayed prompts
  208 |       await page.waitForTimeout(4000);
  209 | 
  210 |       // Install prompt should not be visible for new users
  211 |       const installPrompt = page.locator("text=/Install.*Add to home/i");
  212 |       const hasPrompt = await installPrompt.count();
  213 | 
  214 |       // Note: Install prompt only appears after certain conditions are met
  215 |       // This test just verifies it doesn't show immediately
  216 |       expect(hasPrompt).toBe(0);
  217 |     });
  218 | 
  219 |     test("should handle beforeinstallprompt event", async ({ page }) => {
  220 |       // Listen for the event
  221 |       let eventFired = false;
  222 | 
  223 |       await page.addInitScript(() => {
  224 |         window.addEventListener("beforeinstallprompt", () => {
  225 |           (window as any).beforeInstallPromptFired = true;
  226 |         });
  227 |       });
  228 | 
  229 |       await page.goto("/");
  230 | 
  231 |       // The event should be registered (may not fire depending on browser)
  232 |       const listenerExists = await page.evaluate(() => {
  233 |         return typeof (window as any).beforeInstallPromptFired !== "undefined";
  234 |       });
  235 | 
  236 |       expect(listenerExists).toBe(true);
  237 |     });
  238 |   });
  239 | 
  240 |   test.describe("Update Prompt", () => {
  241 |     test("should check for service worker updates", async ({ page }) => {
  242 |       await page.goto("/");
  243 | 
  244 |       // Wait for service worker registration
  245 |       await page.waitForTimeout(2000);
  246 | 
  247 |       // Service worker should be registered
  248 |       const swRegistered = await page.evaluate(async () => {
  249 |         if (!("serviceWorker" in navigator)) return false;
  250 |         const registration = await navigator.serviceWorker.getRegistration();
  251 |         return !!registration;
  252 |       });
  253 | 
  254 |       expect(swRegistered).toBe(true);
  255 |     });
  256 | 
  257 |     test("should handle update detection", async ({ page }) => {
  258 |       await page.goto("/");
  259 | 
  260 |       // The update check happens automatically via workbox
  261 |       // We just verify the service worker is set up correctly
  262 |       const hasUpdateLogic = await page.evaluate(() => {
  263 |         // Check if update-related code is loaded
  264 |         const scripts = Array.from(document.querySelectorAll("script"));
  265 |         return scripts.some(
  266 |           (s) => s.textContent?.includes("serviceWorker") || s.src.includes("sw")
  267 |         );
  268 |       });
  269 | 
  270 |       expect(hasUpdateLogic).toBe(true);
  271 |     });
  272 |   });
  273 | 
  274 |   test.describe("Background Sync", () => {
  275 |     test("should support background sync for push subscriptions", async ({ page }) => {
```