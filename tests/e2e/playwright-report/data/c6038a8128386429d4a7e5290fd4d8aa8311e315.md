# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: user-journeys.e2e.ts >> Error Handling >> should handle offline state gracefully
- Location: user-journeys.e2e.ts:438:3

# Error details

```
Error: page.goto: net::ERR_INTERNET_DISCONNECTED at http://localhost:3001/station/725
Call log:
  - navigating to "http://localhost:3001/station/725", waiting until "load"

```

# Test source

```ts
  342 |   });
  343 | 
  344 |   test("should navigate to commute details", async ({ page }) => {
  345 |     await page.goto("/");
  346 | 
  347 |     // Look for commute cards
  348 |     const commuteCards = page.locator('role=article:has-text("commute")');
  349 |     const hasCommutes = await commuteCards.count();
  350 | 
  351 |     if (hasCommutes > 0) {
  352 |       await commuteCards.first().click();
  353 |       await expect(page).toHaveURL(/\/commute\//);
  354 |     }
  355 |   });
  356 | 
  357 |   test("should navigate to commute screen", async ({ page }) => {
  358 |     // Direct navigation to commute screen
  359 |     await page.goto("/commute");
  360 | 
  361 |     // Should see commute screen
  362 |     await expect(page.locator("role=heading[name=/commute/i]")).toBeVisible();
  363 |   });
  364 | });
  365 | 
  366 | test.describe("Full Stack Workflows", () => {
  367 |   test("complete workflow: search → view station → add favorite", async ({ page }) => {
  368 |     // Start at home
  369 |     await page.goto("/");
  370 | 
  371 |     // Navigate to search
  372 |     await page.click('role=link[name="Search"]');
  373 |     await expect(page).toHaveURL(/\/search/);
  374 | 
  375 |     // Search for Times Square
  376 |     const searchInput = page.locator('role=searchbox[name="Search stations"]');
  377 |     await searchInput.fill("Times");
  378 |     await page.waitForTimeout(250);
  379 | 
  380 |     // Click result
  381 |     await page.click("role=link[name=/Times Sq-42 St/i]");
  382 |     await expect(page).toHaveURL(/\/station\//);
  383 | 
  384 |     // Add to favorite
  385 |     const favoriteButton = page.locator('role=button[aria-pressed="false"]').first();
  386 |     const hasButton = await favoriteButton.count();
  387 | 
  388 |     if (hasButton > 0) {
  389 |       await favoriteButton.click();
  390 | 
  391 |       // Verify favorited state
  392 |       await expect(page.locator('role=button[aria-pressed="true"]')).toBeVisible();
  393 |     }
  394 | 
  395 |     // Navigate back to home
  396 |     await page.click('role=link[name="Go back"]');
  397 |     await expect(page).toHaveURL("/");
  398 | 
  399 |     // Verify favorite appears in home favorites
  400 |     const hasFavorites = await page.locator("role=article").count();
  401 |     expect(hasFavorites).toBeGreaterThan(0);
  402 |   });
  403 | 
  404 |   test("complete workflow: home → station → refresh arrivals", async ({ page }) => {
  405 |     await page.goto("/");
  406 | 
  407 |     // Navigate to a station (direct URL for test reliability)
  408 |     await page.goto("/station/725");
  409 | 
  410 |     // Wait for arrivals to load
  411 |     await page.waitForSelector('role=heading[name="Arrivals"]', { timeout: 10000 });
  412 | 
  413 |     // Refresh arrivals
  414 |     await page.click('role=button[name="Refresh arrivals"]');
  415 | 
  416 |     // Verify refresh indicator appears
  417 |     const refreshButton = page.locator('role=button[name="Refresh arrivals"] svg');
  418 |     await expect(refreshButton).toHaveAttribute("class", /animate-spin/);
  419 |   });
  420 | 
  421 |   test("complete workflow: view health status", async ({ page }) => {
  422 |     await page.goto("/health");
  423 | 
  424 |     // Should see health status
  425 |     await expect(page.locator("text=/status|uptime|feeds/i")).toBeVisible();
  426 | 
  427 |     // Health endpoint via API
  428 |     const response = await page.request.get("/api/health");
  429 |     expect(response.status()).toBe(200);
  430 | 
  431 |     const body = await response.json();
  432 |     expect(body).toHaveProperty("status");
  433 |     expect(body).toHaveProperty("feeds");
  434 |   });
  435 | });
  436 | 
  437 | test.describe("Error Handling", () => {
  438 |   test("should handle offline state gracefully", async ({ page }) => {
  439 |     // Simulate offline mode
  440 |     await page.context().setOffline(true);
  441 | 
> 442 |     await page.goto("/station/725");
      |                ^ Error: page.goto: net::ERR_INTERNET_DISCONNECTED at http://localhost:3001/station/725
  443 | 
  444 |     // Should show offline banner
  445 |     await expect(page.locator('role=region[name="offline"]')).toBeVisible();
  446 | 
  447 |     // Restore online
  448 |     await page.context().setOffline(false);
  449 |   });
  450 | 
  451 |   test("should handle API errors gracefully", async ({ page }) => {
  452 |     // Navigate to a non-existent station
  453 |     await page.goto("/station/999999");
  454 | 
  455 |     // Should show error state
  456 |     await expect(page.locator("text=/not found|error/i")).toBeVisible();
  457 |   });
  458 | 
  459 |   test("should handle malformed URLs gracefully", async ({ page }) => {
  460 |     // Navigate to invalid URL
  461 |     await page.goto("/invalid-route");
  462 | 
  463 |     // Should redirect to home or show 404
  464 |     await expect(page).toHaveURL(/\//);
  465 |   });
  466 | });
  467 | 
  468 | test.describe("Performance", () => {
  469 |   test("should load home screen quickly", async ({ page }) => {
  470 |     const startTime = Date.now();
  471 | 
  472 |     await page.goto("/");
  473 | 
  474 |     // Wait for main content
  475 |     await page.waitForSelector("role=main", { timeout: 5000 });
  476 | 
  477 |     const loadTime = Date.now() - startTime;
  478 | 
  479 |     // Should load in under 3 seconds (core value prop)
  480 |     expect(loadTime).toBeLessThan(3000);
  481 |   });
  482 | 
  483 |   test("should have fast time to interactive", async ({ page }) => {
  484 |     const metrics = await page.goto("/");
  485 | 
  486 |     if (metrics) {
  487 |       // Check that page loaded
  488 |       await page.waitForSelector("role=main");
  489 | 
  490 |       // Verify page is responsive
  491 |       const isResponsive = await page.evaluate(() => {
  492 |         return document.readyState === "complete";
  493 |       });
  494 | 
  495 |       expect(isResponsive).toBe(true);
  496 |     }
  497 |   });
  498 | });
  499 | 
```