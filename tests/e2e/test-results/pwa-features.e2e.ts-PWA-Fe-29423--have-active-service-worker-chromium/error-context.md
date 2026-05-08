# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: pwa-features.e2e.ts >> PWA Features >> Service Worker Registration >> should have active service worker
- Location: pwa-features.e2e.ts:35:5

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
> 46  |       expect(swActive).toBe(true);
      |                        ^ Error: expect(received).toBe(expected) // Object.is equality
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
  74  |       await page.reload();
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
```