# Test Dependencies Inventory

**Generated:** 2026-08-28  
**Project:** MTA My Way  
**Purpose:** Comprehensive inventory of all test-related dependencies across the monorepo

## Overview

The MTA My Way project uses a unified testing approach with **Vitest** as the primary test runner across all packages, supplemented by **Playwright** for end-to-end testing and **Testing Library** for React component testing.

## Test Dependencies by Package

### 1. Root Package (`/package.json`)

**Location:** `/home/coding/mta-my-way/package.json`

**Test Dependencies:**
- `@testing-library/jest-dom: ^6.9.1` - Custom Jest matchers for DOM assertions
- `@testing-library/react: ^16.3.2` - React testing utilities
- `vitest: ^4.1.11` - Primary test runner

**Test Scripts:**
- `test` - Run all tests: `vitest run`
- `test:watch` - Run tests in watch mode: `vitest`

---

### 2. E2E Tests (`/tests/e2e/package.json`)

**Location:** `/home/coding/mta-my-way/tests/e2e/package.json`

**Test Dependencies:**
- `@playwright/test: ^1.50.0` - End-to-end testing framework

**Test Scripts:**
- `test` - Run Playwright tests headless
- `test:headed` - Run Playwright tests with visible browser
- `test:ui` - Run Playwright tests with UI mode
- `test:debug` - Run Playwright tests in debug mode
- `install-browser` - Install Playwright browser: `playwright install chromium`

---

### 3. Server Package (`/packages/server/package.json`)

**Location:** `/home/coding/mta-my-way/packages/server/package.json`

**Test Dependencies:**
- `@vitest/coverage-v8: ^3.2.7` - Code coverage tool for Vitest using v8

**Test Scripts:**
- `test` - Run server tests: `vitest run`

---

### 4. Shared Package (`/packages/shared/package.json`)

**Location:** `/home/coding/mta-my-way/packages/shared/package.json`

**Test Dependencies:**
- `vitest: ^3.2.7` - Test runner

**Test Scripts:**
- `test` - Run shared package tests: `vitest run`

**Testing Utilities Exports:**
- `./testing/security-helpers` - Security testing utilities
- `./testing/observability-helpers` - Observability testing utilities
- `./testing/test-helpers` - General test helpers

---

### 5. Web Package (`/packages/web/package.json`)

**Location:** `/home/coding/mta-my-way/packages/web/package.json`

**Test Dependencies:**
- `@testing-library/user-event: ^14.6.1` - Simulate user interactions in tests
- `happy-dom: ^20.8.9` - Lightweight DOM implementation for testing
- `jsdom: ^29.0.1` - JavaScript DOM implementation
- `vitest: ^3.2.7` - Test runner

**Test Scripts:**
- `test` - Run web tests: `vitest run`

---

## Summary

### Total Test Dependencies: 9 unique packages

| Package | Version | Purpose | Used In |
|---------|---------|---------|---------|
| `@playwright/test` | ^1.50.0 | E2E testing | tests/e2e |
| `@testing-library/jest-dom` | ^6.9.1 | DOM assertions | Root |
| `@testing-library/react` | ^16.3.2 | React testing | Root |
| `@testing-library/user-event` | ^14.6.1 | User interaction simulation | packages/web |
| `@vitest/coverage-v8` | ^3.2.7 | Code coverage | packages/server |
| `happy-dom` | ^20.8.9 | Lightweight DOM | packages/web |
| `jsdom` | ^29.0.1 | JavaScript DOM | packages/web |
| `vitest` | ^3.2.7 - ^4.1.11 | Test runner | Root, packages/shared, packages/web |

### Testing Framework Stack

- **Unit Testing:** Vitest
- **Component Testing:** Testing Library (React) + Vitest
- **DOM Environment:** Happy DOM / jsdom
- **E2E Testing:** Playwright
- **Code Coverage:** Vitest Coverage (v8)

### Key Observations

1. **Vitest Version Inconsistency:** The root package uses `vitest@^4.1.11` while child packages use `vitest@^3.2.7`. This should be synchronized for consistency.

2. **Testing Library Distribution:** Testing Library packages are split between root (jest-dom, react) and web package (user-event). This is a good pattern for shared utilities.

3. **Dual DOM Implementations:** The web package includes both `happy-dom` and `jsdom`. Consider standardizing on one unless both are needed for different test scenarios.

4. **Coverage Tooling:** Only the server package explicitly declares `@vitest/coverage-v8`. Other packages may rely on root configuration or may not have coverage configured.

5. **Monorepo Test Command:** All packages have a `test` script that can be run from the root via `npm test` (which executes `vitest run` at the workspace level).
