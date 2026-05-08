# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: trip-tracking.e2e.ts >> Trip Tracking Screen >> Expired Trip >> should show ended state for expired trips
- Location: trip-tracking.e2e.ts:184:5

# Error details

```
Error: expect(locator).toBeAttached() failed

Locator: locator('text=/Ended|Completed|Finished/i')
Expected: attached
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeAttached" with timeout 5000ms
  - waiting for locator('text=/Ended|Completed|Finished/i')

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
  89  |     });
  90  |   });
  91  | 
  92  |   test.describe("Anomaly Detection", () => {
  93  |     test("should show anomaly banner for delayed trips", async ({ page }) => {
  94  |       // Navigate with a trip that's longer than usual
  95  |       await page.goto("/trip/mock-delayed-trip?origin=101&dest=725");
  96  | 
  97  |       // Anomaly banner might appear
  98  |       const anomalyBanner = page.locator("role=alert:has-text(/delay|longer than usual/i)");
  99  |       const hasBanner = await anomalyBanner.count();
  100 | 
  101 |       if (hasBanner > 0) {
  102 |         await expect(anomalyBanner).toBeVisible();
  103 | 
  104 |         // Should show baseline comparison
  105 |         const baselineText = await anomalyBanner.textContent();
  106 |         expect(baselineText).toMatch(/average|baseline|min/i);
  107 |       }
  108 |     });
  109 | 
  110 |     test("should display deviation from average", async ({ page }) => {
  111 |       await page.goto("/trip/mock-delayed-trip?origin=101&dest=725");
  112 | 
  113 |       const deviation = page.locator("text=/\\+\\d+ min|-\\d+ min/i");
  114 |       const hasDeviation = await deviation.count();
  115 | 
  116 |       if (hasDeviation > 0) {
  117 |         await expect(deviation).toBeVisible();
  118 |       }
  119 |     });
  120 |   });
  121 | 
  122 |   test.describe("Trip Actions", () => {
  123 |     test("should have stop tracking button", async ({ page }) => {
  124 |       await page.goto("/trip/mock-active-trip-123?origin=101&dest=725");
  125 | 
  126 |       const stopButton = page
  127 |         .locator('role=button:has-text("Stop Tracking")')
  128 |         .or(page.locator('role=button[aria-label*="stop" i]'));
  129 |       await expect(stopButton).toBeAttached();
  130 |     });
  131 | 
  132 |     test("should navigate back when stop tracking is clicked", async ({ page }) => {
  133 |       await page.goto("/trip/mock-active-trip-123?origin=101&dest=725");
  134 | 
  135 |       const stopButton = page
  136 |         .locator('role=button:has-text("Stop Tracking")')
  137 |         .or(page.locator('role=button[aria-label*="stop" i]'));
  138 |       const hasStopButton = await stopButton.count();
  139 | 
  140 |       if (hasStopButton > 0) {
  141 |         await stopButton.first().click();
  142 | 
  143 |         // Should navigate away from trip screen
  144 |         const url = page.url();
  145 |         expect(url).not.toContain("/trip/");
  146 |       }
  147 |     });
  148 | 
  149 |     test("should have share button", async ({ page }) => {
  150 |       await page.goto("/trip/mock-active-trip-123?origin=101&dest=725");
  151 | 
  152 |       const shareButton = page
  153 |         .locator('role=button[aria-label*="share" i]')
  154 |         .or(page.locator('role=button:has-text("Share")'));
  155 |       await expect(shareButton).toBeAttached();
  156 |     });
  157 | 
  158 |     test("should open share dialog when share is clicked", async ({ page }) => {
  159 |       await page.goto("/trip/mock-active-trip-123?origin=101&dest=725");
  160 | 
  161 |       const shareButton = page
  162 |         .locator('role=button[aria-label*="share" i]')
  163 |         .or(page.locator('role=button:has-text("Share")'));
  164 |       const hasShareButton = await shareButton.count();
  165 | 
  166 |       if (hasShareButton > 0) {
  167 |         // Mock the Web Share API
  168 |         await page.addInitScript(() => {
  169 |           (window as any).navigator.share = async () => {
  170 |             // Mock successful share
  171 |             return true;
  172 |           };
  173 |         });
  174 | 
  175 |         await shareButton.first().click();
  176 | 
  177 |         // Share was called (no error thrown)
  178 |         // The exact behavior depends on browser support
  179 |       }
  180 |     });
  181 |   });
  182 | 
  183 |   test.describe("Expired Trip", () => {
  184 |     test("should show ended state for expired trips", async ({ page }) => {
  185 |       await page.goto("/trip/mock-expired-trip");
  186 | 
  187 |       // Should show "Ended" or similar
  188 |       const endedText = page.locator("text=/Ended|Completed|Finished/i");
> 189 |       await expect(endedText).toBeAttached();
      |                               ^ Error: expect(locator).toBeAttached() failed
  190 |     });
  191 | 
  192 |     test("should display trip logged confirmation", async ({ page }) => {
  193 |       await page.goto("/trip/mock-expired-trip?origin=101&dest=725");
  194 | 
  195 |       // Should show "Trip logged" message if journaling worked
  196 |       const loggedMessage = page.locator("text=/logged|saved|recorded/i");
  197 |       const hasLogged = await loggedMessage.count();
  198 | 
  199 |       if (hasLogged > 0) {
  200 |         await expect(loggedMessage).toBeVisible();
  201 |       }
  202 |     });
  203 | 
  204 |     test("should not show stop tracking button for expired trips", async ({ page }) => {
  205 |       await page.goto("/trip/mock-expired-trip");
  206 | 
  207 |       const stopButton = page.locator('role=button:has-text("Stop Tracking")');
  208 |       const hasButton = await stopButton.count();
  209 | 
  210 |       // Stop tracking button should not be visible for expired trips
  211 |       if (hasButton > 0) {
  212 |         const isVisible = await stopButton.isVisible();
  213 |         expect(isVisible).toBe(false);
  214 |       }
  215 |     });
  216 |   });
  217 | 
  218 |   test.describe("Navigation", () => {
  219 |     test("should navigate back to previous screen", async ({ page }) => {
  220 |       await page.goto("/trip/mock-active-trip-123");
  221 | 
  222 |       const backButton = page.locator(
  223 |         'role=link[aria-label*="back" i], role=button[aria-label*="back" i]'
  224 |       );
  225 |       await backButton.first().click();
  226 | 
  227 |       // Should navigate away
  228 |       const url = page.url();
  229 |       expect(url).not.toContain("/trip/");
  230 |     });
  231 |   });
  232 | 
  233 |   test.describe("Error Handling", () => {
  234 |     test("should handle missing trip ID gracefully", async ({ page }) => {
  235 |       await page.goto("/trip/");
  236 | 
  237 |       // Should show error or redirect
  238 |       const errorText = page.locator("text=/not found|error|invalid/i");
  239 |       const hasError = await errorText.count();
  240 | 
  241 |       if (hasError > 0) {
  242 |         await expect(errorText).toBeVisible();
  243 |       } else {
  244 |         // Might redirect to home
  245 |         const url = page.url();
  246 |         expect(url).toBe("/");
  247 |       }
  248 |     });
  249 | 
  250 |     test("should handle offline state during tracking", async ({ page }) => {
  251 |       await page.goto("/trip/mock-active-trip-123?origin=101&dest=725");
  252 | 
  253 |       // Simulate offline
  254 |       await page.context().setOffline(true);
  255 | 
  256 |       // Should still show trip data (cached) with offline indicator
  257 |       const offlineBanner = page.locator("text=/offline|no connection/i");
  258 |       const hasOffline = await offlineBanner.count();
  259 | 
  260 |       // Trip details should still be visible
  261 |       const tripDetails = page.locator('role=heading[name="Live Trip"]');
  262 |       await expect(tripDetails).toBeAttached();
  263 | 
  264 |       await page.context().setOffline(false);
  265 |     });
  266 | 
  267 |     test("should show loading state while fetching trip data", async ({ page }) => {
  268 |       // Slow down the response
  269 |       await page.route("**/api/trip/**", async (route) => {
  270 |         await new Promise((resolve) => setTimeout(resolve, 1000));
  271 |         route.continue();
  272 |       });
  273 | 
  274 |       await page.goto("/trip/mock-active-trip-123?origin=101&dest=725");
  275 | 
  276 |       // Should see skeleton or loading indicator
  277 |       const loading = page.locator('[aria-busy="true"], [class*="skeleton"], [class*="loading"]');
  278 |       await expect(loading).toBeAttached();
  279 |     });
  280 |   });
  281 | 
  282 |   test.describe("Real-time Updates", () => {
  283 |     test("should update ETA countdown over time", async ({ page }) => {
  284 |       await page.goto("/trip/mock-active-trip-123?origin=101&dest=725");
  285 | 
  286 |       // Get initial ETA
  287 |       const initialEta = await page.locator("text=/\\d+ min/i").first().textContent();
  288 | 
  289 |       // Wait for update
```