# Testing Guide

This document describes the testing infrastructure and conventions for MTA My Way.

## Overview

MTA My Way uses a multi-tier testing strategy:

1. **Unit Tests**: Test individual functions and components in isolation
2. **Integration Tests**: Test interactions between modules and API endpoints
3. **E2E Tests**: Test complete user flows in a browser

## Test Frameworks

| Framework | Purpose | Location |
|-----------|---------|----------|
| Vitest | Unit/integration tests | All packages |
| Playwright | End-to-end tests | `tests/e2e/` |
| Testing Library | React component testing | `packages/web/` |

## Running Tests

### All Tests

```bash
npm run test              # Run all unit/integration tests
npm run test:watch        # Watch mode
```

### Package-Specific Tests

```bash
npm run test --workspace=packages/server
npm run test --workspace=packages/web
npm run test --workspace=packages/shared
```

### E2E Tests

```bash
cd tests/e2e
npm test                 # Headless mode
npm run test:headed      # Headed mode (see browser)
npm run test:ui          # Interactive UI mode
npm run test:debug       # Debug mode with inspector
```

### Linting and Type Checking

```bash
npm run lint             # Check code style
npm run lint:fix         # Fix auto-fixable issues
npm run typecheck        # TypeScript type checking
```

## Test Structure

### Server Tests (`packages/server/src/**/*.test.ts`)

Server tests use Vitest with Node environment. Test setup is in `packages/server/src/test/setup.ts`.

**Key test files:**
- `alerts.test.ts` - MTA alerts feed parsing
- `delay-detector.test.ts` - Delay detection algorithms
- `feed-parser.test.ts` - GTFS-RT feed parsing
- `middleware/*.test.ts` - Security middleware tests
- `migration/*.test.ts` - Database migration tests
- `observability/*.test.ts` - Logging, metrics, tracing tests

### Web Tests (`packages/web/src/**/*.test.ts`)

Web tests use Vitest with jsdom environment for React Testing Library. Test setup is in `packages/web/src/test/setup.ts`.

**Key test files:**
- `components/*.test.tsx` - React component tests
- `stores/*.test.ts` - Zustand state management tests
- `lib/*.test.ts` - Client-side utility tests

### Shared Tests (`packages/shared/src/**/*.test.ts`)

Shared tests cover utilities and schemas used by both server and web.

**Key test files:**
- `gtfs/*.test.ts` - GTFS data processing tests
- `schemas/*.test.ts` - Zod schema validation tests

### E2E Tests (`tests/e2e/*.e2e.ts`)

E2E tests use Playwright to test complete user journeys.

**Test suites:**
- `accessibility.e2e.ts` - ARIA labels, landmarks, announcements
- `api-validation.e2e.ts` - API request/response validation
- `commute-workflow.e2e.ts` - Commute creation and management
- `fare-tracking.e2e.ts` - OMNY fare cap tracking
- `journal.e2e.ts` - Trip journal functionality
- `map.e2e.ts` - Interactive map features
- `onboarding.e2e.ts` - First-run experience
- `pwa-features.e2e.ts` - PWA installation and updates
- `security.e2e.ts` - Security headers and CSRF
- `settings.e2e.ts` - Settings management
- `trip-tracking.e2e.ts` - Trip tracking and sharing
- `user-journeys.e2e.ts` - Critical user paths

## Test Conventions

### Unit Test Structure

```typescript
import { describe, it, expect, beforeEach } from "vitest";

describe("FeatureName", () => {
  beforeEach(() => {
    // Setup before each test
  });

  it("should do something specific", () => {
    // Arrange
    const input = { ... };

    // Act
    const result = functionUnderTest(input);

    // Assert
    expect(result).toEqual(expected);
  });
});
```

### Component Test Structure

```typescript
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MyComponent } from "./MyComponent";

describe("MyComponent", () => {
  it("should render correctly", () => {
    render(<MyComponent prop="value" />);
    expect(screen.getByText("value")).toBeInTheDocument();
  });
});
```

### E2E Test Structure

```typescript
import { test, expect } from "@playwright/test";

test.describe("Feature Name", () => {
  test("should complete user flow", async ({ page }) => {
    await page.goto("/");
    await page.click("text=Start");
    await expect(page.locator(".result")).toBeVisible();
  });
});
```

## Test Configuration

### Vitest Configuration

Root `vitest.config.ts` configures three project workspaces:

1. **Web**: jsdom environment for React components
2. **Server**: Node environment for backend tests
3. **Shared**: Node environment for shared utilities

### Playwright Configuration

`tests/e2e/playwright.config.ts` configures:
- Browser: Chromium (only)
- Timeout: 30s default
- Retries: 2 for CI, 0 for local
- Base URL: http://localhost:3001

## Coverage

Coverage reports are generated when tests run. Configure coverage thresholds in `vitest.config.ts`:

```typescript
coverage: {
  thresholds: {
    lines: 80,
    functions: 80,
    branches: 80,
    statements: 80,
  },
},
```

## CI/CD

GitHub Actions runs tests automatically on:
- Push to `main` branch
- Pull requests to `main` branch

See `.github/workflows/ci.yml` for the full CI configuration.

## Tips

### Debugging Tests

- Use `npm run test:watch` for faster iteration
- Use `.only` to run a single test: `it.only("should...")`
- Use `console.log` for debugging (output appears in test results)

### E2E Debugging

```bash
# Run with UI mode for step-by-step debugging
npm run test:ui

# Run with headed mode to see browser
npm run test:headed

# Run specific test file
npx playwright test accessibility.e2e.ts

# Run with debug breakpoint
npm run test:debug
```

### Mocking

Use Vitest's `vi.mock()` for mocking modules:

```typescript
import { vi } from "vitest";
import { myFunction } from "./myModule";

vi.mock("./myModule", () => ({
  myFunction: vi.fn(() => "mocked"),
}));
```

### Test Data

Store test fixtures in `__fixtures__/` directories next to test files:

```typescript
import mockFeed from "./__fixtures__/mock-feed.json";
```

## Best Practices

1. **Test behavior, not implementation** - Focus on what users see and do
2. **Keep tests independent** - Each test should run in isolation
3. **Use descriptive names** - Test names should explain what they test
4. **Mock external dependencies** - Don't make real API calls in unit tests
5. **Clean up side effects** - Use `afterEach` to reset state
6. **Test edge cases** - Include error conditions and boundary values
7. **Keep tests fast** - Unit tests should run in milliseconds
