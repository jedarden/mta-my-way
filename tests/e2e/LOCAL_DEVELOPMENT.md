# E2E Tests - Local Development Guide

This guide explains how to run E2E tests locally and handle common scenarios.

## Quick Start

```bash
# Run all E2E tests (starts server automatically)
npm run test:e2e

# Run a single test file
npx playwright test user-journeys.e2e.ts

# Run tests in headed mode (see browser)
npx playwright test --headed
```

## Server Management

### Automatic Server Startup (Default)

By default, Playwright automatically starts the dev server for you:

```bash
npx playwright test
```

- **Port conflict detection**: Before starting, Playwright checks if port 3001 is available
- **Server startup**: If port is free, Playwright starts the server automatically
- **Health checks**: Playwright waits for the `/health` endpoint to respond before running tests
- **Automatic cleanup**: Server stops when tests complete

### Reusing an Existing Dev Server

If you already have a dev server running, Playwright can reuse it:

```bash
# Terminal 1: Start your dev server
npm run dev

# Terminal 2: Run tests (will reuse the running server)
npx playwright test
```

**Benefits of reuse:**
- Faster test runs (no startup overhead)
- Better for iterative development
- Preserves server state between test runs

**When to reuse:**
- Active development on features
- Running tests frequently while coding
- Debugging flaky tests that might be timing-related

**When to start fresh:**
- CI environments (always fresh)
- Testing clean startup behavior
- Isolating state-dependent test failures
- Final verification before commits

### Forcing a Fresh Server Locally

To override `reuseExistingServer` and force a fresh server:

```bash
# Set CI=true to disable reuse
CI=true npx playwright test
```

## Port Conflicts

### What Causes Port Conflicts

The "port already in use" error occurs when:

1. A previous test run's server didn't shut down cleanly
2. You have a dev server already running on port 3001
3. Another process is using port 3001

### How Port Conflict Detection Works

Before starting the server, Playwright runs a port check script:

```bash
npx tsx helpers/check-port.ts
```

If port 3001 is busy, the script:
- Exits with code 1
- Shows clear error message
- Provides resolution options

### Resolving Port Conflicts

**Option 1: Stop the existing process**

```bash
# Find the process using port 3001
lsof -i :3001

# Kill the process (replace PID with actual process ID)
kill <PID>

# Now run tests again
npx playwright test
```

**Option 2: Let Playwright reuse the existing server**

If the existing server is your dev server, let Playwright reuse it:

```bash
# Just run tests - Playwright will detect and reuse
npx playwright test
```

**Option 3: Use a different port (Not Recommended)**

While possible, changing the port requires updates to multiple config files:

```typescript
// playwright.config.ts
baseURL: "http://localhost:3002",
webServer: {
  url: "http://localhost:3002/health",
  // ...
}
```

## Environment Variables

### `TEST_MODE`

Set to `"true"` when starting the server:

- Disables rate limiting
- Disables CSRF protection
- Uses test-friendly configurations
- Prevents interference from real feeds during testing

### `CI`

Controls `reuseExistingServer` behavior:

- `CI=true` (or `CI=1`): Always start a fresh server
- `CI` unset: Reuse existing server if available

## Troubleshooting

### "Port already in use" error

```bash
# Find and kill the process
lsof -i :3001
kill <PID>

# Or reuse the existing server
npx playwright test
```

### Server doesn't start within timeout

The health check might be failing:

```bash
# Check if the server is actually running
curl http://localhost:3001/health

# Manually start the server to see errors
cd ../.. && npx tsx packages/server/src/index.ts
```

### Tests fail with "connection refused"

The server might not be ready:

```bash
# Check server logs for startup errors
# Increase timeout in playwright.config.ts if needed
webServer: {
  timeout: 600 * 1000, // 10 minutes
}
```

## Common Workflows

### Iterative Development

```bash
# Terminal 1: Start dev server once
npm run dev

# Terminal 2: Run tests repeatedly (fast, reuses server)
npx playwright test user-journeys.e2e.ts
# ... make changes ...
npx playwright test user-journeys.e2e.ts
# ... make changes ...
npx playwright test user-journeys.e2e.ts
```

### Full Test Suite Verification

```bash
# Fresh server, clean state (slower but thorough)
CI=true npx playwright test
```

### Debugging a Single Test

```bash
# Run with UI mode for interactive debugging
npx playwright test --ui

# Run with headed browser
npx playwright test --headed user-journeys.e2e.ts
```

## CI vs Local Behavior Summary

| Aspect | CI (GitHub Actions, Argo) | Local Development |
|--------|---------------------------|-------------------|
| `reuseExistingServer` | `false` (always fresh) | `true` (reuse if available) |
| `workers` | 1 (sequential) | Parallel (CPU count) |
| `retries` | 2 | 0 |
| `forbidOnly` | `true` | `false` |
| Server startup | Every test run | Once, then reused |

## Related Files

- `playwright.config.ts` - Main test configuration
- `helpers/check-port.ts` - Port conflict detection
- `package.json` - Test scripts and dependencies
