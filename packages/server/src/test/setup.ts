/**
 * Vitest setup file for server package tests.
 *
 * This file runs before all tests and sets up:
 * - Rate limiter test mode (disabled rate limiting)
 * - Test utilities for resetting state between tests
 * - Standardized mock cleanup strategy
 *
 * Mock cleanup strategy:
 * - beforeEach: vi.clearAllMocks() - clears mock call counts/data but keeps implementations
 * - afterEach: vi.restoreAllMocks() - restores all mocks to original implementations
 * - This order ensures fresh mock state at test start and clean restoration after test completes
 * - Individual test files should NOT add their own mock cleanup hooks
 */

import { afterEach, beforeEach, vi } from "vitest";

import { cleanupAllState } from "../integration/test-helpers.js";

// Enable test mode for rate limiter (disables rate limiting in tests)
const { setRateLimiterTestMode } = await import("../middleware/rate-limiter.js");
setRateLimiterTestMode(true);

// Reset ALL shared mutable state before each test.
// This single call replaces the previous piecemeal resets and guarantees
// that no module-level Map/Set/array leaks between test files.
beforeEach(async () => {
  // Clear all mocks to prevent state leakage
  // This resets mock call counts and return values but keeps mock implementations
  vi.clearAllMocks();
  vi.clearAllTimers();

  await cleanupAllState();
});

// Restore mocks after each test
// This restores all mocked functions to their original implementations
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllTimers();
});

// Mock console methods to reduce noise in test output
const originalError = console.error;
const originalWarn = console.warn;

console.error = (...args) => {
  // Suppress expected errors in tests
  const msg = args[0];
  if (
    typeof msg === "string" &&
    (msg.includes("serveStatic") ||
      msg.includes("401") ||
      msg.includes("429") ||
      msg.includes("auth_failure") ||
      msg.includes("authz_failure"))
  ) {
    return;
  }
  originalError.call(console, ...args);
};

console.warn = (...args) => {
  // Suppress certain warnings in tests
  const msg = args[0];
  if (typeof msg === "string" && msg.includes("Audit log cleared")) {
    return;
  }
  originalWarn.call(console, ...args);
};
