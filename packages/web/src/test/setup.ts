/**
 * Vitest setup file for testing utilities and matchers
 */

import * as matchers from "@testing-library/jest-dom/matchers";
import { cleanup } from "@testing-library/react";
import { afterEach, expect, vi } from "vitest";

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers);

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock virtual:pwa-register module
vi.mock("virtual:pwa-register", () => ({
  registerSW: vi.fn(() => ({
    update: vi.fn(),
  })),
}));
