# Test Dependencies in MTA My Way

**Generated:** 2026-08-28  
**Purpose:** Inventory of all test-related dependencies across the monorepo

## Summary

The project uses **Vitest** as the primary testing framework for unit/integration tests across all packages, and **Playwright** for end-to-end testing. Testing is configured at both the root workspace level and individual package levels.

---

## Root Package.json (`/package.json`)

**Test Dependencies (devDependencies):**

| Package | Version | Purpose |
|---------|---------|---------|
| `@testing-library/jest-dom` | ^6.9.1 | Custom Jest matchers for DOM assertions |
| `@testing-library/react` | ^16.3.2 | React component testing utilities |
| `vitest` | ^4.1.11 | Main test runner (workspace-level) |

**Test Scripts:**
- `test`: Run all tests with `vitest run`
- `test:watch`: Run tests in watch mode with `vitest`

---

## Package: `@mta-my-way/server` (`packages/server/package.json`)

**Test Dependencies (devDependencies):**

| Package | Version | Purpose |
|---------|---------|---------|
| `@vitest/coverage-v8` | ^3.2.7 | Code coverage tool for Vitest |

**Test Scripts:**
- `test`: `vitest run`

**Notes:**
- Server uses Vitest for testing
- Coverage collection enabled via v8 integration
- No testing libraries for web frameworks (expected for Hono/Node server)

---

## Package: `@mta-my-way/shared` (`packages/shared/package.json`)

**Test Dependencies (devDependencies):**

| Package | Version | Purpose |
|---------|---------|---------|
| `vitest` | ^3.2.7 | Test runner |

**Test Scripts:**
- `test`: `vitest run`

**Testing Exports:**
The shared package exposes testing utilities via barrel exports:
- `./testing/security-helpers` - Security testing utilities
- `./testing/observability-helpers` - Observability/testing instrumentation
- `./testing/test-helpers` - General test helpers

**Notes:**
- Shared library provides test utilities for other packages to import
- Pure TypeScript/type library testing (no DOM or React)

---

## Package: `@mta-my-way/web` (`packages/web/package.json`)

**Test Dependencies (devDependencies):**

| Package | Version | Purpose |
|---------|---------|---------|
| `@testing-library/user-event` | ^14.6.1 | Simulate user interactions in tests |
| `happy-dom` | ^20.8.9 | Lightweight DOM implementation for testing |
| `jsdom` | ^29.0.1 | JavaScript DOM implementation (alternative to happy-dom) |
| `vitest` | ^3.2.7 | Test runner |

**Test Scripts:**
- `test`: `vitest run`

**Notes:**
- React + Vite frontend testing stack
- Both `happy-dom` and `jsdom` present (likely for different test environments or migration in progress)
- Testing Library ecosystem for component testing
- No `@testing-library/react` at package level (inherited from root)

---

## Package: `@mta-my-way/e2e` (`tests/e2e/package.json`)

**Test Dependencies (devDependencies):**

| Package | Version | Purpose |
|---------|---------|---------|
| `@playwright/test` | ^1.50.0 | End-to-end browser testing framework |

**Test Scripts:**
- `test`: `playwright test` - Run E2E tests
- `test:headed`: `playwright test --headed` - Run with visible browser
- `test:ui`: `playwright test --ui` - Run with Playwright UI
- `test:debug`: `playwright test --debug` - Run with debugger
- `install-browser`: `playwright install chromium` - Install browser binary

**Notes:**
- Dedicated E2E test workspace
- Uses Chromium browser for testing
- Rich debugging and UI mode support

---

## Consolidated Test Dependency Inventory

### Test Runners

| Package | Used In | Version |
|---------|---------|---------|
| `vitest` | root, shared, web | ^3.2.7 (packages), ^4.1.11 (root) |
| `@playwright/test` | tests/e2e | ^1.50.0 |

### DOM Environments

| Package | Used In | Version |
|---------|---------|---------|
| `happy-dom` | web | ^20.8.9 |
| `jsdom` | web | ^29.0.1 |

### Testing Libraries

| Package | Used In | Version | Purpose |
|---------|---------|---------|---------|
| `@testing-library/jest-dom` | root | ^6.9.1 | DOM matchers |
| `@testing-library/react` | root | ^16.3.2 | React testing utilities |
| `@testing-library/user-event` | web | ^14.6.1 | User interaction simulation |

### Coverage

| Package | Used In | Version |
|---------|---------|---------|
| `@vitest/coverage-v8` | server | ^3.2.7 |

---

## Test Framework Configuration

**Primary Framework:** Vitest (unified unit/integration testing)  
**E2E Framework:** Playwright (browser automation)  
**Approach:** Workspace monorepo with centralized test runner at root and package-level configuration

---

## Key Observations

1. **Vitest Version Inconsistency:** Root uses `^4.1.11` while packages use `^3.2.7` - may need alignment
2. **Dual DOM Implementations:** Both `happy-dom` and `jsdom` in web package - consider consolidating
3. **Testing Library at Root:** `@testing-library/react` and `@testing-library/jest-dom` defined at root level, available to all workspaces
4. **No Server-Side Testing Libraries:** Hono testing libraries not present (testing via direct request/imports)
5. **Comprehensive E2E Setup:** Dedicated Playwright workspace with debugging tooling
