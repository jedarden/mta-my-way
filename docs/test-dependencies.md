# Test Dependencies Inventory

## Overview
This document catalogs all test-related dependencies found in the MTA My Way project's package.json files.

## Summary
- **5 package.json files** analyzed (root + 3 packages + 1 e2e test suite)
- **12 unique test-related dependencies** identified
- **Primary test frameworks:** Vitest (unit/integration), Playwright (e2e), React Testing Library

---

## Test Dependencies by Package

### 1. Root Package (`/package.json`)
**Purpose:** Monorepo configuration and shared testing utilities

| Dependency | Type | Version | Purpose |
|------------|------|---------|---------|
| `@testing-library/jest-dom` | devDependencies | `^6.9.1` | Custom Jest matchers for DOM assertions |
| `@testing-library/react` | devDependencies | `^16.3.2` | React component testing utilities |
| `vitest` | devDependencies | `^4.1.11` | Unit/integration test runner |

**Test Scripts:**
- `test`: Run all tests with `vitest run`
- `test:watch`: Run tests in watch mode with `vitest`

---

### 2. Server Package (`/packages/server/package.json`)
**Purpose:** Backend API testing and code coverage

| Dependency | Type | Version | Purpose |
|------------|------|---------|---------|
| `@vitest/coverage-v8` | devDependencies | `^3.2.7` | Code coverage reporting with v8 |

**Test Scripts:**
- `test`: Run server tests with `vitest run`

**Note:** Server inherits root-level test dependencies (`vitest`, `@testing-library/react`, `@testing-library/jest-dom`)

---

### 3. Shared Package (`/packages/shared/package.json`)
**Purpose:** Shared utilities and domain logic testing

| Dependency | Type | Version | Purpose |
|------------|------|---------|---------|
| `vitest` | devDependencies | `^3.2.7` | Unit/integration test runner |

**Test Scripts:**
- `test`: Run shared tests with `vitest run`

**Testing Exports:**
- `./testing/security-helpers`: Security test utilities
- `./testing/observability-helpers`: Observability test utilities
- `./testing/test-helpers`: General test utilities

---

### 4. Web Package (`/packages/web/package.json`)
**Purpose:** Frontend React component testing

| Dependency | Type | Version | Purpose |
|------------|------|---------|---------|
| `@testing-library/user-event` | devDependencies | `^14.6.1` | Simulate user interactions in tests |
| `happy-dom` | devDependencies | `^20.8.9` | Lightweight DOM implementation for testing |
| `jsdom` | devDependencies | `^29.0.1` | DOM implementation for Node.js testing |
| `vitest` | devDependencies | `^3.2.7` | Unit/integration test runner |

**Test Scripts:**
- `test`: Run web tests with `vitest run`

---

### 5. E2E Test Package (`/tests/e2e/package.json`)
**Purpose:** End-to-end testing with Playwright

| Dependency | Type | Version | Purpose |
|------------|------|---------|---------|
| `@playwright/test` | devDependencies | `^1.50.0` | E2E test framework |

**Test Scripts:**
- `test`: Run E2E tests with `playwright test`
- `test:headed`: Run tests with visible browser
- `test:ui`: Run tests with Playwright UI
- `test:debug`: Run tests in debug mode
- `install-browser`: Install Chromium browser

---

## Unique Test Dependencies

### Test Runners
- `vitest` (root: ^4.1.11, server: inherited, shared: ^3.2.7, web: ^3.2.7)
- `@playwright/test` (^1.50.0)

### Testing Libraries
- `@testing-library/react` (^16.3.2)
- `@testing-library/jest-dom` (^6.9.1)
- `@testing-library/user-event` (^14.6.1)

### DOM Implementations
- `jsdom` (^29.0.1)
- `happy-dom` (^20.8.9)

### Coverage
- `@vitest/coverage-v8` (^3.2.7)

---

## Version Notes

### Vitest Version Inconsistency
- Root package uses `vitest@^4.1.11`
- Server, shared, and web packages use `vitest@^3.2.7`

This may cause minor compatibility issues. Consider standardizing to a single version across the monorepo.

---

## Test Organization

```
mta-my-way/
├── packages/
│   ├── server/          # Backend API tests (Vitest)
│   ├── shared/          # Shared utilities tests (Vitest)
│   └── web/             # Frontend component tests (Vitest + Testing Library)
└── tests/
    └── e2e/             # End-to-end tests (Playwright)
```

---

## Last Updated
2026-08-28
