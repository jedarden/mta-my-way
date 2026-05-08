# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: onboarding.e2e.ts >> Onboarding Flow >> Welcome Screen >> should display welcome screen for new users
- Location: onboarding.e2e.ts:30:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('role=heading[name="Welcome to MTA My Way"]')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('role=heading[name="Welcome to MTA My Way"]')

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
      - button "Toggle menu" [ref=e6] [cursor=pointer]: ☰
  - generic [ref=e8]:
    - link "🏠 Home" [ref=e9] [cursor=pointer]:
      - /url: "#/"
    - link "👀 Watch" [ref=e10] [cursor=pointer]:
      - /url: "#/watch"
    - link "⚔️ Compete" [ref=e11] [cursor=pointer]:
      - /url: "#/compete"
    - link "🏆 Board" [ref=e12] [cursor=pointer]:
      - /url: "#/leaderboard"
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
        - generic [ref=f2e2]:
          - generic [ref=f2e6]:
            - button "Play" [disabled] [ref=f2e7]
            - button "Reset" [disabled] [ref=f2e8]
            - generic [ref=f2e9]: 0 / 0
            - generic [ref=f2e10]:
              - generic [ref=f2e11]: "Speed:"
              - combobox [ref=f2e12]:
                - option "0.5x"
                - option "1x" [selected]
                - option "2x"
                - option "4x"
          - generic [ref=f2e13]:
            - generic [ref=f2e14]: Failed to fetch
            - button "Retry" [ref=f2e15] [cursor=pointer]
          - link "AI Code Battle" [ref=f2e16] [cursor=pointer]:
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
  2   |  * E2E tests for the Onboarding Flow.
  3   |  *
  4   |  * Tests cover:
  5   |  * - Welcome screen
  6   |  * - Location permission flow
  7   |  * - Nearby stations selection
  8   |  * - Search fallback when location denied
  9   |  * - Commute setup
  10  |  * - Push notifications permission
  11  |  * - Skip functionality at each step
  12  |  * - Data persistence after onboarding
  13  |  */
  14  | 
  15  | import { expect, test } from "@playwright/test";
  16  | 
  17  | test.describe("Onboarding Flow", () => {
  18  |   // Clear localStorage before each test to simulate fresh user
  19  |   test.beforeEach(async ({ page }) => {
  20  |     await page.goto("/");
  21  |     await page.evaluate(() => {
  22  |       localStorage.clear();
  23  |       sessionStorage.clear();
  24  |     });
  25  |     // Reload to trigger onboarding
  26  |     await page.reload();
  27  |   });
  28  | 
  29  |   test.describe("Welcome Screen", () => {
  30  |     test("should display welcome screen for new users", async ({ page }) => {
  31  |       // Should see welcome heading
> 32  |       await expect(page.locator('role=heading[name="Welcome to MTA My Way"]')).toBeVisible();
      |                                                                                ^ Error: expect(locator).toBeVisible() failed
  33  | 
  34  |       // Should see feature list
  35  |       await expect(page.locator("text=/Real-time Arrivals/i")).toBeVisible();
  36  |       await expect(page.locator("text=/Service Alerts/i")).toBeVisible();
  37  |       await expect(page.locator("text=/Commute Tracking/i")).toBeVisible();
  38  |       await expect(page.locator("text=/OMNY Fare Cap/i")).toBeVisible();
  39  |     });
  40  | 
  41  |     test("should have Get Started and Skip buttons", async ({ page }) => {
  42  |       const getStartedButton = page.locator('role=button:has-text("Get Started")');
  43  |       await expect(getStartedButton).toBeVisible();
  44  | 
  45  |       const skipButton = page.locator('role=button:has-text("Skip")');
  46  |       await expect(skipButton).toBeVisible();
  47  |     });
  48  | 
  49  |     test("should navigate to location step when Get Started is clicked", async ({ page }) => {
  50  |       await page.click('role=button:has-text("Get Started")');
  51  | 
  52  |       // Should show location permission screen
  53  |       await expect(page.locator('role=heading[name="Find nearby stations"]')).toBeVisible();
  54  |     });
  55  | 
  56  |     test("should complete onboarding when Skip is clicked", async ({ page }) => {
  57  |       // Click skip on welcome screen
  58  |       await page.click('role=button:has-text("Skip")');
  59  | 
  60  |       // Onboarding should be complete - should see home screen
  61  |       await expect(page.locator('role=heading[name="Your Stations"]')).toBeAttached();
  62  |     });
  63  |   });
  64  | 
  65  |   test.describe("Location Permission Step", () => {
  66  |     test.beforeEach(async ({ page }) => {
  67  |       await page.goto("/");
  68  |       await page.evaluate(() => localStorage.clear());
  69  |       await page.reload();
  70  |       await page.click('role=button:has-text("Get Started")');
  71  |     });
  72  | 
  73  |     test("should display location permission request", async ({ page }) => {
  74  |       await expect(page.locator('role=heading[name="Find nearby stations"]')).toBeVisible();
  75  |       await expect(page.locator("text=/We'll find the 3 closest subway stations/i")).toBeVisible();
  76  |     });
  77  | 
  78  |     test("should have Allow and Skip buttons", async ({ page }) => {
  79  |       const allowButton = page.locator('role=button:has-text("Allow Location Access")');
  80  |       await expect(allowButton).toBeVisible();
  81  | 
  82  |       const skipButton = page.locator('role=button:has-text("Skip")');
  83  |       await expect(skipButton).toBeVisible();
  84  |     });
  85  | 
  86  |     test("should show search fallback when location is denied", async ({ page }) => {
  87  |       // Deny location permission
  88  |       await page.context().grantPermissions([], { origin: page.url() });
  89  |       await page.click('role=button:has-text("Allow Location Access")');
  90  | 
  91  |       // Wait for denial to be processed and fallback to appear
  92  |       await page.waitForTimeout(500);
  93  | 
  94  |       // Should either show search fallback or stay on location step with denial message
  95  |       const url = page.url();
  96  |       const searchFallbackVisible = await page
  97  |         .locator('role=heading[name="Add Your First Station"]')
  98  |         .count();
  99  | 
  100 |       // Either navigated to search fallback or shows denial message
  101 |       expect(
  102 |         searchFallbackVisible + (await page.locator("text=/Location access was denied/i").count())
  103 |       ).toBeGreaterThan(0);
  104 |     });
  105 | 
  106 |     test("should advance to nearby stations when location is granted", async ({ page }) => {
  107 |       // Grant location permission with NYC coordinates
  108 |       await page.context().setGeolocation({ latitude: 40.7589, longitude: -73.9851 });
  109 |       await page.context().grantPermissions(["geolocation"], { origin: page.url() });
  110 | 
  111 |       await page.click('role=button:has-text("Allow Location Access")');
  112 | 
  113 |       // Should show nearby stations step
  114 |       await expect(page.locator('role=heading[name="Nearby Stations"]')).toBeVisible({
  115 |         timeout: 10000,
  116 |       });
  117 |     });
  118 |   });
  119 | 
  120 |   test.describe("Nearby Stations Step", () => {
  121 |     test.beforeEach(async ({ page }) => {
  122 |       await page.goto("/");
  123 |       await page.evaluate(() => localStorage.clear());
  124 |       await page.reload();
  125 | 
  126 |       // Set up geolocation before starting onboarding
  127 |       await page.context().setGeolocation({ latitude: 40.7589, longitude: -73.9851 });
  128 |       await page.context().grantPermissions(["geolocation"], { origin: page.url() });
  129 | 
  130 |       await page.click('role=button:has-text("Get Started")');
  131 |       await page.click('role=button:has-text("Allow Location Access")');
  132 | 
```