# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: settings.e2e.ts >> Settings Screen >> Display Preferences >> should show show/hide unassigned trips option
- Location: settings.e2e.ts:115:5

# Error details

```
Error: expect(locator).toBeAttached() failed

Locator: locator('text=/unassigned|show all trips/i')
Expected: attached
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeAttached" with timeout 5000ms
  - waiting for locator('text=/unassigned|show all trips/i')

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
        - generic [ref=f1e2]:
          - generic [ref=f1e6]:
            - button "Play" [disabled] [ref=f1e7]
            - button "Reset" [disabled] [ref=f1e8]
            - generic [ref=f1e9]: 0 / 0
            - generic [ref=f1e10]:
              - generic [ref=f1e11]: "Speed:"
              - combobox [ref=f1e12]:
                - option "0.5x"
                - option "1x" [selected]
                - option "2x"
                - option "4x"
          - generic [ref=f1e13]:
            - generic [ref=f1e14]: Failed to fetch
            - button "Retry" [ref=f1e15] [cursor=pointer]
          - link "AI Code Battle" [ref=f1e16] [cursor=pointer]:
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
  19  | 
  20  |   test.describe("Settings Loading", () => {
  21  |     test("should load settings screen successfully", async ({ page }) => {
  22  |       // Should see settings heading
  23  |       await expect(page.locator('role=heading[name="Settings"]')).toBeVisible();
  24  |     });
  25  | 
  26  |     test("should have back button", async ({ page }) => {
  27  |       const backButton = page.locator(
  28  |         'role=link[aria-label*="back" i], role=button[aria-label*="back" i]'
  29  |       );
  30  |       await expect(backButton.first()).toBeAttached();
  31  |     });
  32  | 
  33  |     test("should navigate back when back button is clicked", async ({ page }) => {
  34  |       const backButton = page.locator(
  35  |         'role=link[aria-label*="back" i], role=button[aria-label*="back" i]'
  36  |       );
  37  |       await backButton.first().click();
  38  | 
  39  |       // Should navigate away from settings
  40  |       const url = page.url();
  41  |       expect(url).not.toContain("/settings");
  42  |     });
  43  |   });
  44  | 
  45  |   test.describe("Theme Settings", () => {
  46  |     test("should display theme options", async ({ page }) => {
  47  |       await page.goto("/settings");
  48  | 
  49  |       // Look for theme section
  50  |       const themeSection = page.locator("text=/Theme|Appearance|Display/i");
  51  |       await expect(themeSection).toBeAttached();
  52  |     });
  53  | 
  54  |     test("should show light/dark/system theme options", async ({ page }) => {
  55  |       await page.goto("/settings");
  56  | 
  57  |       // Look for theme options
  58  |       const themeOptions = page.locator("text=/Light|Dark|System|Auto/i");
  59  |       await expect(themeOptions.first()).toBeAttached();
  60  |     });
  61  | 
  62  |     test("should allow changing theme", async ({ page }) => {
  63  |       await page.goto("/settings");
  64  | 
  65  |       // Find theme selector
  66  |       const themeOption = page
  67  |         .locator('role=button:has-text("Dark")')
  68  |         .or(page.locator('[role="radiogroup"] > *'));
  69  |       const hasOption = await themeOption.count();
  70  | 
  71  |       if (hasOption > 0) {
  72  |         await themeOption.first().click();
  73  | 
  74  |         // Check that theme preference is saved
  75  |         const themePref = await page.evaluate(() => {
  76  |           const settings = JSON.parse(localStorage.getItem("mta-settings") || "{}");
  77  |           return settings.theme;
  78  |         });
  79  | 
  80  |         expect(["light", "dark", "system"]).toContain(themePref);
  81  |       }
  82  |     });
  83  | 
  84  |     test("should apply theme change immediately", async ({ page }) => {
  85  |       await page.goto("/settings");
  86  | 
  87  |       // Get initial background color
  88  |       const initialBg = await page.evaluate(() => {
  89  |         return getComputedStyle(document.body).backgroundColor;
  90  |       });
  91  | 
  92  |       // Toggle to dark mode
  93  |       const darkOption = page
  94  |         .locator('role=button:has-text("Dark")')
  95  |         .or(page.locator('[value="dark"], [data-theme="dark"]'));
  96  |       const hasDark = await darkOption.count();
  97  | 
  98  |       if (hasDark > 0) {
  99  |         await darkOption.first().click();
  100 | 
  101 |         // Wait for theme to apply
  102 |         await page.waitForTimeout(100);
  103 | 
  104 |         const newBg = await page.evaluate(() => {
  105 |           return getComputedStyle(document.body).backgroundColor;
  106 |         });
  107 | 
  108 |         // Background should have changed (or at least be different)
  109 |         expect(newBg).toBeTruthy();
  110 |       }
  111 |     });
  112 |   });
  113 | 
  114 |   test.describe("Display Preferences", () => {
  115 |     test("should show show/hide unassigned trips option", async ({ page }) => {
  116 |       await page.goto("/settings");
  117 | 
  118 |       const unassignedOption = page.locator("text=/unassigned|show all trips/i");
> 119 |       await expect(unassignedOption).toBeAttached();
      |                                      ^ Error: expect(locator).toBeAttached() failed
  120 |     });
  121 | 
  122 |     test("should toggle unassigned trips preference", async ({ page }) => {
  123 |       await page.goto("/settings");
  124 | 
  125 |       const toggle = page.locator('[role="switch"], [type="checkbox"]').first();
  126 |       const hasToggle = await toggle.count();
  127 | 
  128 |       if (hasToggle > 0) {
  129 |         const initialState = await toggle.isChecked();
  130 | 
  131 |         await toggle.click();
  132 | 
  133 |         const newState = await toggle.isChecked();
  134 | 
  135 |         expect(newState).not.toBe(initialState);
  136 |       }
  137 |     });
  138 | 
  139 |     test("should show refresh interval setting", async ({ page }) => {
  140 |       await page.goto("/settings");
  141 | 
  142 |       const refreshOption = page.locator("text=/refresh|update|interval/i");
  143 |       await expect(refreshOption).toBeAttached();
  144 |     });
  145 | 
  146 |     test("should allow adjusting refresh interval", async ({ page }) => {
  147 |       await page.goto("/settings");
  148 | 
  149 |       // Look for interval selector (buttons, dropdown, or slider)
  150 |       const intervalControl = page.locator(
  151 |         'role=button:has-text(/\\d+ sec/), [role="combobox"], input[type="range"]'
  152 |       );
  153 |       const hasControl = await intervalControl.count();
  154 | 
  155 |       if (hasControl > 0) {
  156 |         await intervalControl.first().click();
  157 | 
  158 |         // Settings should be updated
  159 |         const settings = await page.evaluate(() => {
  160 |           return JSON.parse(localStorage.getItem("mta-settings") || "{}");
  161 |         });
  162 | 
  163 |         expect(settings.refreshInterval).toBeGreaterThanOrEqual(15);
  164 |       }
  165 |     });
  166 |   });
  167 | 
  168 |   test.describe("Notification Settings", () => {
  169 |     test("should show push notification section", async ({ page }) => {
  170 |       await page.goto("/settings");
  171 | 
  172 |       const pushSection = page.locator("text=/push notification|alerts|notify/i");
  173 |       await expect(pushSection).toBeAttached();
  174 |     });
  175 | 
  176 |     test("should show notification permission status", async ({ page }) => {
  177 |       await page.goto("/settings");
  178 | 
  179 |       // Look for permission indicator
  180 |       const permissionStatus = page.locator("text=/enabled|disabled|permission/i");
  181 |       await expect(permissionStatus).toBeAttached();
  182 |     });
  183 | 
  184 |     test("should allow enabling push notifications", async ({ page }) => {
  185 |       await page.goto("/settings");
  186 | 
  187 |       const enableButton = page
  188 |         .locator('role=button:has-text("Enable")')
  189 |         .or(page.locator('role=button:has-text("Subscribe")'));
  190 |       const hasButton = await enableButton.count();
  191 | 
  192 |       if (hasButton > 0) {
  193 |         // Mock the permission request
  194 |         await page.addInitScript(() => {
  195 |           (Notification as any).permission = "granted";
  196 |         });
  197 | 
  198 |         await enableButton.first().click();
  199 | 
  200 |         // Check if subscription was attempted
  201 |         // (exact behavior depends on browser support)
  202 |       }
  203 |     });
  204 | 
  205 |     test("should show quiet hours setting", async ({ page }) => {
  206 |       await page.goto("/settings");
  207 | 
  208 |       const quietHours = page.locator("text=/quiet hours|do not disturb/i");
  209 |       await expect(quietHours).toBeAttached();
  210 |     });
  211 | 
  212 |     test("should allow configuring quiet hours", async ({ page }) => {
  213 |       await page.goto("/settings");
  214 | 
  215 |       const timeInput = page.locator('input[type="time"], input[type="number"]').first();
  216 |       const hasInput = await timeInput.count();
  217 | 
  218 |       if (hasInput > 0) {
  219 |         await timeInput.fill("22:00");
```