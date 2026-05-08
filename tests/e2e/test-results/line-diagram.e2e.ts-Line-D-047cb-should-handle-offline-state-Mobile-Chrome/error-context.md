# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: line-diagram.e2e.ts >> Line Diagram Screen >> Error Handling >> should handle offline state
- Location: line-diagram.e2e.ts:435:5

# Error details

```
Error: page.goto: net::ERR_INTERNET_DISCONNECTED at http://localhost:3001/diagram/1
Call log:
  - navigating to "http://localhost:3001/diagram/1", waiting until "load"

```

# Test source

```ts
  338 |       // Check if positions updated (content still loads)
  339 |       const diagram = page.locator("svg");
  340 |       await expect(diagram.first()).toBeVisible();
  341 |     });
  342 | 
  343 |     test("should show last updated time", async ({ page }) => {
  344 |       await page.waitForSelector("svg", { timeout: 5000 });
  345 | 
  346 |       const updatedTime = page.locator("text=/updated|refresh|ago/i");
  347 |       await expect(updatedTime).toBeAttached();
  348 |     });
  349 | 
  350 |     test("should have manual refresh button", async ({ page }) => {
  351 |       await page.waitForSelector("svg", { timeout: 5000 });
  352 | 
  353 |       const refreshButton = page.locator(
  354 |         'role=button[aria-label*="refresh" i], role=button:has-text("Refresh")'
  355 |       );
  356 |       const hasRefresh = await refreshButton.count();
  357 | 
  358 |       if (hasRefresh > 0) {
  359 |         await expect(refreshButton.first()).toBeVisible();
  360 |       }
  361 |     });
  362 | 
  363 |     test("should trigger refresh on button click", async ({ page }) => {
  364 |       await page.waitForSelector("svg", { timeout: 5000 });
  365 | 
  366 |       const refreshButton = page.locator(
  367 |         'role=button[aria-label*="refresh" i], role=button:has-text("Refresh")'
  368 |       );
  369 |       const hasRefresh = await refreshButton.count();
  370 | 
  371 |       if (hasRefresh > 0) {
  372 |         // Get loading state
  373 |         await refreshButton.first().click();
  374 | 
  375 |         // Should show loading indicator or update content
  376 |         const loading = page.locator("[aria-busy='true'], [class*='loading' i]");
  377 |         const hasLoading = await loading.count();
  378 | 
  379 |         // Diagram should remain visible
  380 |         const diagram = page.locator("svg");
  381 |         await expect(diagram.first()).toBeVisible();
  382 |       }
  383 |     });
  384 |   });
  385 | 
  386 |   test.describe("Navigation", () => {
  387 |     test("should navigate back to previous screen", async ({ page }) => {
  388 |       const backButton = page.locator(
  389 |         'role=link[aria-label*="back" i], role=button[aria-label*="back" i]'
  390 |       );
  391 | 
  392 |       await backButton.first().click();
  393 | 
  394 |       // Should navigate away
  395 |       const url = page.url();
  396 |       expect(url).not.toContain("/diagram/");
  397 |     });
  398 | 
  399 |     test("should navigate to station detail from diagram", async ({ page }) => {
  400 |       await page.waitForSelector("svg", { timeout: 5000 });
  401 | 
  402 |       const station = page.locator("circle, [role='button']").first();
  403 |       const hasStation = await station.count();
  404 | 
  405 |       if (hasStation > 0) {
  406 |         await station.click();
  407 | 
  408 |         const url = page.url();
  409 |         const navigated = /\/station\//.test(url);
  410 | 
  411 |         if (navigated) {
  412 |           expect(url).toMatch(/\/station\//);
  413 |         }
  414 |       }
  415 |     });
  416 |   });
  417 | 
  418 |   test.describe("Error Handling", () => {
  419 |     test("should handle invalid line ID gracefully", async ({ page }) => {
  420 |       await page.goto("/diagram/invalid-line-id");
  421 | 
  422 |       // Should show error or redirect
  423 |       const errorText = page.locator("text=/not found|error|invalid/i");
  424 |       const hasError = await errorText.count();
  425 | 
  426 |       if (hasError > 0) {
  427 |         await expect(errorText).toBeVisible();
  428 |       } else {
  429 |         // Might redirect to map or home
  430 |         const url = page.url();
  431 |         expect(url).not.toBe("/diagram/invalid-line-id");
  432 |       }
  433 |     });
  434 | 
  435 |     test("should handle offline state", async ({ page }) => {
  436 |       await page.context().setOffline(true);
  437 | 
> 438 |       await page.goto("/diagram/1");
      |                  ^ Error: page.goto: net::ERR_INTERNET_DISCONNECTED at http://localhost:3001/diagram/1
  439 | 
  440 |       // Should show offline banner
  441 |       const offlineBanner = page.locator("text=/offline|no connection/i");
  442 |       const hasOffline = await offlineBanner.count();
  443 | 
  444 |       if (hasOffline > 0) {
  445 |         await expect(offlineBanner.first()).toBeVisible();
  446 |       }
  447 | 
  448 |       // Cached diagram might still be visible
  449 |       const diagram = page.locator("svg");
  450 |       const hasDiagram = await diagram.count();
  451 | 
  452 |       if (hasDiagram > 0) {
  453 |         await expect(diagram).toBeAttached();
  454 |       }
  455 | 
  456 |       await page.context().setOffline(false);
  457 |     });
  458 | 
  459 |     test("should handle API failures gracefully", async ({ page }) => {
  460 |       // Intercept and fail API requests
  461 |       await page.route("**/api/positions/**", (route) => {
  462 |         route.abort();
  463 |       });
  464 | 
  465 |       await page.goto("/diagram/1");
  466 | 
  467 |       // Should still show diagram (stations) even without train data
  468 |       const diagram = page.locator("svg");
  469 |       await expect(diagram.first()).toBeAttached();
  470 |     });
  471 |   });
  472 | 
  473 |   test.describe("Accessibility", () => {
  474 |     test("should have proper heading structure", async ({ page }) => {
  475 |       const heading = page.locator(
  476 |         'role=heading[name="Line Diagram"], role=heading[name*="Train"]'
  477 |       );
  478 |       const hasHeading = await heading.count();
  479 | 
  480 |       if (hasHeading > 0) {
  481 |         await expect(heading.first()).toBeVisible();
  482 |       }
  483 |     });
  484 | 
  485 |     test("should have aria labels on interactive elements", async ({ page }) => {
  486 |       await page.waitForSelector("svg", { timeout: 5000 });
  487 | 
  488 |       // Check for aria labels on diagram elements
  489 |       const interactiveElements = page.locator("circle[aria-label], [role='button']");
  490 |       const hasElements = await interactiveElements.count();
  491 | 
  492 |       if (hasElements > 0) {
  493 |         const firstLabel = await interactiveElements.first().getAttribute("aria-label");
  494 |         expect(firstLabel || hasElements > 0).toBeTruthy();
  495 |       }
  496 |     });
  497 | 
  498 |     test("should announce train count and spacing", async ({ page }) => {
  499 |       await page.waitForSelector("svg", { timeout: 5000 });
  500 | 
  501 |       // Look for live region announcements
  502 |       const liveRegion = page.locator("[aria-live], [role='status']");
  503 |       await expect(liveRegion).toBeAttached();
  504 |     });
  505 | 
  506 |     test("should be keyboard navigable", async ({ page }) => {
  507 |       await page.waitForSelector("svg", { timeout: 5000 });
  508 | 
  509 |       // Tab through elements
  510 |       await page.keyboard.press("Tab");
  511 | 
  512 |       const focused = await page.evaluate(() => document.activeElement?.tagName);
  513 |       expect(["BUTTON", "A", "CIRCLE", "svg"].includes(focused || "")).toBe(true);
  514 |     });
  515 |   });
  516 | 
  517 |   test.describe("Performance", () => {
  518 |     test("should load diagram quickly", async ({ page }) => {
  519 |       const startTime = Date.now();
  520 | 
  521 |       await page.goto("/diagram/1");
  522 | 
  523 |       await page.waitForSelector("svg", { timeout: 5000 });
  524 | 
  525 |       const loadTime = Date.now() - startTime;
  526 | 
  527 |       expect(loadTime).toBeLessThan(5000);
  528 |     });
  529 | 
  530 |     test("should handle large number of stations efficiently", async ({ page }) => {
  531 |       await page.goto("/diagram/1");
  532 | 
  533 |       // Even with many stations, should be responsive
  534 |       await page.waitForSelector("svg", { timeout: 5000 });
  535 | 
  536 |       // Try interacting
  537 |       const diagram = page.locator("svg").first();
  538 |       await diagram.click();
```