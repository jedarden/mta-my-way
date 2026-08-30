# Integration Tests

This directory contains integration tests for the MTA My Way server.

## Overview

Integration tests validate that different components of the system work together correctly. They use in-memory databases and test fixtures to simulate a production environment without requiring external dependencies.

## Running the Tests

```bash
# Run all integration tests
npm test

# Run only smoke tests
npm test -- smoke.test.ts

# Run with coverage
npm test -- --coverage
```

## Test Files

### Smoke Test (`smoke.test.ts`)

**Purpose:** Basic smoke test that validates the entire test infrastructure works.

**What it tests:**
- Test helpers and fixtures load correctly
- Integration test database can be created and used
- Basic app operations work end-to-end
- Test isolation mechanisms function properly
- Authentication infrastructure works
- Error handling and performance baselines

**When to run:** First in any test suite to ensure the test infrastructure itself is functional.

**Coverage:** 16 test cases covering:
- Test Infrastructure (3 tests)
- Basic Operations (3 tests)
- Database Operations (2 tests)
- Authentication Infrastructure (2 tests)
- Test Isolation (2 tests)
- Error Handling (2 tests)
- Performance Smoke (2 tests)

### OAuth Integration Tests (`oauth-comprehensive.test.ts`)

**Purpose:** Comprehensive OAuth 2.0 with PKCE integration tests.

**What it tests:**
- Provider discovery endpoint
- Authorization URL generation with PKCE
- Callback handling (success and error cases)
- Session creation and security
- CSRF protection
- Rate limiting
- Error scenarios

## Test Helpers

The `test-helpers.ts` file provides:

### Database Helpers
- `createIntegrationTestDatabase()` - Creates an in-memory database with all schemas
- `createTripTrackingDatabase()` - Database with trip tracking schema only
- `createPushDatabase()` - Database with push subscriptions schema only
- `closeDatabase(db)` - Cleanup helper

### Data Factory Functions
- `createTestTrip(overrides)` - Create test trip records with default values
- `createTestSubscription(overrides)` - Create test push subscriptions

### Authentication Helpers
- `createTestApiKey(scope, role)` - Create test API key with specified permissions
- `createTestAdminCredentials()` - Admin credentials for testing
- `createTestUserCredentials()` - Regular user credentials
- `createTestReadCredentials()` - Read-only credentials

### State Management
- `cleanupAllState()` - Comprehensive cleanup of ALL shared mutable state
- `clearAllTrips(db)` - Clear trip records
- `clearCommuteStatsCache(db)` - Clear commute stats

### CSRF Helpers
- `getCsrfToken(app)` - Get CSRF token from test app
- `requestWithCsrf(app, path, options)` - Make request with CSRF protection
- `requestWithAuthAndCsrf(app, path, authHeaders, options)` - Authenticated request with CSRF

## Test Fixtures

### Station Index (`TEST_STATIONS`)
Minimal station data for testing:
- `101` - South Ferry (1 line)
- `102` - Rector St (1 line)
- `725` - Times Sq-42 St (multiple lines with transfers)
- `726` - 42 St-Port Authority (A/C/E lines)
- `727` - 50 St (A/C/E lines)

### Route Index (`TEST_ROUTES`)
Minimal route data for testing:
- `1` - Broadway-7th Ave Local

### Complex Index (`TEST_COMPLEXES`)
Empty complex index for basic testing (can be extended as needed)

## Test Isolation

Each test should:
1. Call `cleanupAllState()` in `beforeEach` to reset module-level state
2. Create a fresh database instance
3. Clean up resources in `afterEach`

This ensures tests don't pollute each other's state.

## Best Practices

1. **Use test helpers** - Don't duplicate database setup code
2. **Test isolation** - Always clean up state in beforeEach/afterEach
3. **Minimal fixtures** - Use minimal test data to keep tests fast
4. **Test behavior, not implementation** - Focus on what the system does, not how
5. **Assert on public APIs** - Test through HTTP endpoints where possible
6. **Handle async correctly** - Use async/await consistently

## Adding New Tests

When adding new integration tests:

1. Choose an appropriate test file or create a new one
2. Use existing test helpers and fixtures
3. Follow the test isolation pattern (beforeEach/afterEach)
4. Test both success and failure cases
5. Add descriptive test names
6. Update this README if adding new test categories

## Troubleshooting

### Tests fail with "database is locked"
- Ensure each test creates its own database instance
- Check that afterEach properly closes connections

### State pollution between tests
- Verify `cleanupAllState()` is called in beforeEach
- Check for missing afterEach cleanup

### Slow tests
- Use minimal fixtures (don't load entire GTFS data)
- Limit database operations
- Consider unit tests instead of integration tests for isolated logic

### Authentication failures in tests
- Use `createTestApiKey()` to create test credentials
- Include CSRF tokens for state-changing operations
- Check that authentication middleware isn't blocking test requests
