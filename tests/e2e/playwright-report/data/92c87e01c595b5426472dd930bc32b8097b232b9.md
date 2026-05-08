# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: onboarding.e2e.ts >> Onboarding Flow >> Accessibility >> should announce step transitions to screen readers
- Location: onboarding.e2e.ts:604:5

# Error details

```
Error: expect(locator).toBeAttached() failed

Locator: locator('[aria-live="assertive"][aria-atomic="true"]')
Expected: attached
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeAttached" with timeout 5000ms
  - waiting for locator('[aria-live="assertive"][aria-atomic="true"]')

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
  511 |     test("should complete full onboarding flow with all options", async ({ page }) => {
  512 |       await page.goto("/");
  513 |       await page.evaluate(() => localStorage.clear());
  514 |       await page.reload();
  515 | 
  516 |       // Set up permissions
  517 |       await page.context().setGeolocation({ latitude: 40.7589, longitude: -73.9851 });
  518 |       await page.context().grantPermissions(["geolocation"], { origin: page.url() });
  519 |       await page.context().grantPermissions(["notifications"], { origin: page.url() });
  520 | 
  521 |       // Welcome
  522 |       await expect(page.locator('role=heading[name="Welcome to MTA My Way"]')).toBeVisible();
  523 |       await page.click('role=button:has-text("Get Started")');
  524 | 
  525 |       // Location
  526 |       await expect(page.locator('role=heading[name="Find nearby stations"]')).toBeVisible();
  527 |       await page.click('role=button:has-text("Allow Location Access")');
  528 | 
  529 |       // Nearby stations
  530 |       await expect(page.locator('role=heading[name="Nearby Stations"]')).toBeVisible({
  531 |         timeout: 10000,
  532 |       });
  533 |       await page.click('role=button:has-text("Continue")');
  534 | 
  535 |       // Commute
  536 |       await expect(page.locator('role=heading[name="Where do you commute to?"]')).toBeVisible();
  537 |       await page.click('role=button:has-text("Skip")');
  538 | 
  539 |       // Notifications
  540 |       await expect(page.locator('role=heading[name="Stay Informed"]')).toBeVisible();
  541 |       await page.click('role=button:has-text("Skip")');
  542 | 
  543 |       // Complete
  544 |       await expect(page.locator('role=heading[name="Your Stations"]')).toBeVisible({
  545 |         timeout: 5000,
  546 |       });
  547 |     });
  548 | 
  549 |     test("should save favorites after onboarding", async ({ page }) => {
  550 |       await page.goto("/");
  551 |       await page.evaluate(() => localStorage.clear());
  552 |       await page.reload();
  553 | 
  554 |       await page.context().setGeolocation({ latitude: 40.7589, longitude: -73.9851 });
  555 |       await page.context().grantPermissions(["geolocation"], { origin: page.url() });
  556 | 
  557 |       await page.click('role=button:has-text("Get Started")');
  558 |       await page.click('role=button:has-text("Allow Location Access")');
  559 | 
  560 |       await expect(page.locator('role=heading[name="Nearby Stations"]')).toBeVisible({
  561 |         timeout: 10000,
  562 |       });
  563 |       await page.click('role=button:has-text("Continue")');
  564 |       await page.click('role=button:has-text("Skip")');
  565 |       await page.click('role=button:has-text("Skip")');
  566 | 
  567 |       // Check that favorites were saved
  568 |       const favorites = await page.evaluate(() => {
  569 |         const data = localStorage.getItem("mta-favorites");
  570 |         return data ? JSON.parse(data) : { stations: [] };
  571 |       });
  572 | 
  573 |       expect(favorites.stations.length).toBeGreaterThan(0);
  574 |     });
  575 | 
  576 |     test("should not show onboarding again after completion", async ({ page }) => {
  577 |       await page.goto("/");
  578 |       await page.evaluate(() => localStorage.clear());
  579 |       await page.reload();
  580 | 
  581 |       await page.context().setGeolocation({ latitude: 40.7589, longitude: -73.9851 });
  582 |       await page.context().grantPermissions(["geolocation"], { origin: page.url() });
  583 | 
  584 |       // Complete onboarding
  585 |       await page.click('role=button:has-text("Get Started")');
  586 |       await page.click('role=button:has-text("Allow Location Access")');
  587 |       await expect(page.locator('role=heading[name="Nearby Stations"]')).toBeVisible({
  588 |         timeout: 10000,
  589 |       });
  590 |       await page.click('role=button:has-text("Continue")');
  591 |       await page.click('role=button:has-text("Skip")');
  592 |       await page.click('role=button:has-text("Skip")');
  593 | 
  594 |       await expect(page.locator('role=heading[name="Your Stations"]')).toBeVisible();
  595 | 
  596 |       // Reload - should not show onboarding again
  597 |       await page.reload();
  598 |       await expect(page.locator('role=heading[name="Your Stations"]')).toBeVisible();
  599 |       await expect(page.locator('role=heading[name="Welcome to MTA My Way"]')).not.toBeVisible();
  600 |     });
  601 |   });
  602 | 
  603 |   test.describe("Accessibility", () => {
  604 |     test("should announce step transitions to screen readers", async ({ page }) => {
  605 |       await page.goto("/");
  606 |       await page.evaluate(() => localStorage.clear());
  607 |       await page.reload();
  608 | 
  609 |       // Check for live region
  610 |       const liveRegion = page.locator('[aria-live="assertive"][aria-atomic="true"]');
> 611 |       await expect(liveRegion).toBeAttached();
      |                                ^ Error: expect(locator).toBeAttached() failed
  612 | 
  613 |       // Navigate to next step
  614 |       await page.click('role=button:has-text("Get Started")');
  615 | 
  616 |       // Live region should have updated content
  617 |       const announcement = await liveRegion.textContent();
  618 |       expect(announcement).toBeTruthy();
  619 |     });
  620 | 
  621 |     test("should have proper heading hierarchy", async ({ page }) => {
  622 |       await page.goto("/");
  623 |       await page.evaluate(() => localStorage.clear());
  624 |       await page.reload();
  625 | 
  626 |       // Welcome heading should be h1 or main heading
  627 |       const mainHeading = page.locator('role=heading[name="Welcome to MTA My Way"]');
  628 |       await expect(mainHeading).toBeVisible();
  629 |     });
  630 | 
  631 |     test("should have properly labeled form inputs", async ({ page }) => {
  632 |       await page.goto("/");
  633 |       await page.evaluate(() => localStorage.clear());
  634 |       await page.reload();
  635 | 
  636 |       await page.context().setGeolocation({ latitude: 40.7589, longitude: -73.9851 });
  637 |       await page.context().grantPermissions(["geolocation"], { origin: page.url() });
  638 | 
  639 |       await page.click('role=button:has-text("Get Started")');
  640 |       await page.click('role=button:has-text("Allow Location Access")');
  641 | 
  642 |       await expect(page.locator('role=heading[name="Nearby Stations"]')).toBeVisible({
  643 |         timeout: 10000,
  644 |       });
  645 | 
  646 |       // Station buttons should have accessible labels
  647 |       const stationButtons = page
  648 |         .locator("role=button")
  649 |         .filter({ hasText: /Times|Ferry|Chambers/i });
  650 |       const hasButtons = await stationButtons.count();
  651 | 
  652 |       if (hasButtons > 0) {
  653 |         const firstButton = stationButtons.first();
  654 |         await expect(firstButton).toBeVisible();
  655 | 
  656 |         // Check for accessible name
  657 |         const accessibleName = await firstButton.getAttribute("aria-label");
  658 |         const textContent = await firstButton.textContent();
  659 |         expect(accessibleName || textContent).toBeTruthy();
  660 |       }
  661 |     });
  662 |   });
  663 | });
  664 | 
```