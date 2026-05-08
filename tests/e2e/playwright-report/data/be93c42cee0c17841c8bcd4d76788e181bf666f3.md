# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: pwa-features.e2e.ts >> PWA Features >> Install Prompt >> should handle beforeinstallprompt event
- Location: pwa-features.e2e.ts:219:5

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - link "Skip to main content" [ref=e2] [cursor=pointer]:
    - /url: "#app"
  - navigation [ref=e3]:
    - generic [ref=e4]:
      - link "⚔️ AI Code Battle" [ref=e5] [cursor=pointer]:
        - /url: "#/"
      - generic [ref=e6]:
        - link "Watch" [ref=e7] [cursor=pointer]:
          - /url: "#/watch"
        - link "Compete" [ref=e8] [cursor=pointer]:
          - /url: "#/compete"
        - link "Leaderboard" [ref=e9] [cursor=pointer]:
          - /url: "#/leaderboard"
        - link "Evolution" [ref=e10] [cursor=pointer]:
          - /url: "#/evolution"
        - link "Blog" [ref=e11] [cursor=pointer]:
          - /url: "#/blog"
        - link "Season 1" [ref=e12] [cursor=pointer]:
          - /url: "#/season/1"
  - generic [ref=e14]:
    - generic [ref=e15]:
      - heading "AI Code Battle" [level=1] [ref=e16]
      - paragraph [ref=e17]: Bots compete. Strategies evolve. You watch.
      - generic [ref=e18]:
        - link "Watch Battles" [ref=e19] [cursor=pointer]:
          - /url: "#/watch/replays"
        - link "Build a Bot" [ref=e20] [cursor=pointer]:
          - /url: "#/compete/register"
    - generic [ref=e21]:
      - iframe [ref=e23]:
        - generic [ref=f1e2]:
          - generic [ref=f1e6]:
            - button "Play" [disabled] [ref=f1e7]
            - button "Reset" [disabled] [ref=f1e8]
            - generic [ref=f1e9]: 0 / 0
            - generic [ref=f1e11]:
              - generic [ref=f1e12]: "Speed:"
              - combobox [ref=f1e13]:
                - option "0.5x"
                - option "1x" [selected]
                - option "2x"
                - option "4x"
          - generic [ref=f1e14]:
            - generic [ref=f1e15]: Failed to fetch
            - button "Retry" [ref=f1e16] [cursor=pointer]
          - link "AI Code Battle" [ref=f1e17] [cursor=pointer]:
            - /url: https://ai-code-battle.pages.dev
      - generic [ref=e24]:
        - paragraph [ref=e25]:
          - strong [ref=e26]: SwarmBot
          - text: vs
          - strong [ref=e27]: HunterBot
          - text: vs
          - strong [ref=e28]: GathererBot
          - text: vs
          - strong [ref=e29]: RusherBot
          - text: vs
          - strong [ref=e30]: GuardianBot
          - text: vs
          - strong [ref=e31]: RandomBot
          - text: "— Winner:"
          - strong [ref=e32]: SwarmBot
        - link "Watch Full Replay →" [ref=e33] [cursor=pointer]:
          - /url: "#/watch/replay?url=/replays/m_test_6p_v1.json.gz"
    - generic [ref=e34]:
      - generic [ref=e35]:
        - heading "Top 5 Bots" [level=2] [ref=e36]
        - generic [ref=e37]:
          - generic [ref=e38]:
            - generic [ref=e39]: "#1"
            - link "HunterBot" [ref=e40] [cursor=pointer]:
              - /url: "#/bot/b_457b876ca1c4"
            - generic [ref=e41]: "1710"
          - generic [ref=e42]:
            - generic [ref=e43]: "#2"
            - link "SwarmBot" [ref=e44] [cursor=pointer]:
              - /url: "#/bot/b_62beeb03c196"
            - generic [ref=e45]: "1680"
          - generic [ref=e46]:
            - generic [ref=e47]: "#3"
            - link "GathererBot" [ref=e48] [cursor=pointer]:
              - /url: "#/bot/b_2fa5681bf0ff"
            - generic [ref=e49]: "1640"
          - generic [ref=e50]:
            - generic [ref=e51]: "#4"
            - link "GuardianBot" [ref=e52] [cursor=pointer]:
              - /url: "#/bot/b_f3af8d6177eb"
            - generic [ref=e53]: "1590"
          - generic [ref=e54]:
            - generic [ref=e55]: "#5"
            - link "RusherBot" [ref=e56] [cursor=pointer]:
              - /url: "#/bot/b_ae1845729bbf"
            - generic [ref=e57]: "1520"
        - link "Full leaderboard →" [ref=e58] [cursor=pointer]:
          - /url: "#/leaderboard"
      - generic [ref=e59]:
        - heading "Latest Stories" [level=2] [ref=e60]
        - link "Week 13 Meta Report — Season 1 2026-03-29" [ref=e62] [cursor=pointer]:
          - /url: "#/blog/meta-week-13-season-1"
          - generic [ref=e63]: Week 13 Meta Report — Season 1
          - generic [ref=e64]: 2026-03-29
        - link "All stories →" [ref=e65] [cursor=pointer]:
          - /url: "#/blog"
```

# Test source

```ts
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
  175 |       const manifest = await response.json();
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
> 236 |       expect(listenerExists).toBe(true);
      |                              ^ Error: expect(received).toBe(expected) // Object.is equality
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
  276 |       await page.goto("/");
  277 | 
  278 |       // Check if service worker supports sync
  279 |       const syncSupported = await page.evaluate(async () => {
  280 |         if (!("serviceWorker" in navigator)) return false;
  281 |         const registration = await navigator.serviceWorker.getRegistration();
  282 |         return "sync" in registration!;
  283 |       });
  284 | 
  285 |       // Sync API might not be available in all test environments
  286 |       if (syncSupported) {
  287 |         expect(syncSupported).toBe(true);
  288 |       }
  289 |     });
  290 | 
  291 |     test("should register sync tag for push subscription", async ({ page }) => {
  292 |       // This test verifies that the sync registration logic is in place
  293 |       await page.goto("/");
  294 | 
  295 |       // Check for push subscription sync logic
  296 |       const hasSyncLogic = await page.evaluate(() => {
  297 |         return window.localStorage.getItem("mta-push-pending");
  298 |       });
  299 | 
  300 |       // The sync logic uses localStorage to queue operations
  301 |       // We just verify the mechanism exists
  302 |       expect(hasSyncLogic === null || typeof hasSyncLogic === "string").toBe(true);
  303 |     });
  304 |   });
  305 | 
  306 |   test.describe("PWA Metadata", () => {
  307 |     test("should have apple-touch-icon link", async ({ page }) => {
  308 |       await page.goto("/");
  309 | 
  310 |       const appleIcon = await page.evaluate(() => {
  311 |         const link = document.querySelector('link[rel="apple-touch-icon"]');
  312 |         return link?.getAttribute("href");
  313 |       });
  314 | 
  315 |       expect(appleIcon).toBeTruthy();
  316 |     });
  317 | 
  318 |     test("should have mobile optimized meta tags", async ({ page }) => {
  319 |       await page.goto("/");
  320 | 
  321 |       const viewport = await page.evaluate(() => {
  322 |         const meta = document.querySelector('meta[name="viewport"]');
  323 |         return meta?.getAttribute("content");
  324 |       });
  325 | 
  326 |       expect(viewport).toContain("width=device-width");
  327 |     });
  328 | 
  329 |     test("should have apple-mobile-web-app-capable meta", async ({ page }) => {
  330 |       await page.goto("/");
  331 | 
  332 |       const capable = await page.evaluate(() => {
  333 |         const meta = document.querySelector('meta[name="apple-mobile-web-app-capable"]');
  334 |         return meta?.getAttribute("content");
  335 |       });
  336 | 
```