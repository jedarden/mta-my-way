/**
 * Vitest setup file for server package tests.
 *
 * This file runs before all tests and sets up:
 * - Rate limiter test mode (disabled rate limiting)
 * - Test utilities for resetting state between tests
 */

import { beforeEach, vi } from "vitest";

import { _clearAllRateLimits } from "../middleware/auth-rate-limit.js";
import {
  resetAuthFailureTracking,
  resetSuspiciousActivityTracking,
} from "../middleware/authentication.js";
// Import rate limiter and enable test mode
import { resetRateLimiter, setRateLimiterTestMode } from "../middleware/rate-limiter.js";
import { configureEncryption, generateMasterKey } from "../middleware/token-encryption.js";

// Enable test mode for rate limiter (disables rate limiting in tests)
setRateLimiterTestMode(true);

// Configure encryption for tests
const masterKey = generateMasterKey();
configureEncryption({ masterKey, version: 1 });

// Reset state before each test
beforeEach(() => {
  // Reset rate limiter state
  resetRateLimiter();

  // Clear auth rate limits
  _clearAllRateLimits();

  // Reset authentication tracking
  resetAuthFailureTracking();
  resetSuspiciousActivityTracking();

  // Clear any timers/mocks
  vi.clearAllTimers();
  vi.restoreAllMocks();
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
