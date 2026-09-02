# API Health Test Framework

Reusable test utilities and helpers for MTA My Way API endpoint testing.

## Overview

This framework provides a comprehensive set of utilities for testing API endpoints, including:
- Response validation (status codes, content types, JSON structure)
- Performance measurement and validation
- Cache header validation
- Test data fixtures
- Endpoint templates
- Reusable test suite builders

## Usage

### Basic Response Validation

```typescript
import { validateApiResponse, STATUS_CODES } from "./helpers/api-test-utils.js";

test("my endpoint works", async ({ request }) => {
  const response = await request.get("/api/endpoint");

  const validation = await validateApiResponse(response, {
    expectedStatus: STATUS_CODES.OK,
    contentType: "application/json",
    requiredFields: ["status", "data"],
  });

  expect(validation.valid).toBe(true);
  // Handle validation.errors and validation.warnings if needed
});
```

### Performance Testing

```typescript
import { measureResponseTime, validateResponseTime, PERFORMANCE_THRESHOLDS } from "./helpers/api-test-utils.js";

test("endpoint responds quickly", async ({ request }) => {
  const { response, duration } = await measureResponseTime(() =>
    request.get("/api/endpoint")
  );

  const timeValidation = validateResponseTime(
    duration,
    PERFORMANCE_THRESHOLDS.ARRIVALS,
    "GET /api/endpoint"
  );

  expect(timeValidation.valid).toBe(true);
});
```

### Using Endpoint Templates

```typescript
import { API_ENDPOINTS } from "./helpers/api-test-utils.js";

test("use endpoint templates", async ({ request }) => {
  const response = await request.get(API_ENDPOINTS.STATIONS.path);
  expect(response.status()).toBe(API_ENDPOINTS.STATIONS.expectedStatus);
});
```

### Test Fixtures

```typescript
import { TEST_FIXTURES } from "./helpers/api-test-utils.js";

// Use predefined test data
const timesSquare = await request.get(
  `/api/stations/${TEST_FIXTURES.STATION_IDS.TIMES_SQUARE}`
);
```

## Available Utilities

### Response Validation

- `validateApiResponse()` - Comprehensive response validation
- `validateStatus()` - Status code validation
- `validateContentType()` - Content type validation
- `validateJsonStructure()` - JSON structure validation
- `validateArrayResponse()` - Array response validation
- `validateNumberConstraints()` - Number field validation
- `validateStringConstraints()` - String field validation

### Performance Testing

- `measureResponseTime()` - Measure API call duration
- `validateResponseTime()` - Validate response time constraints
- `PERFORMANCE_THRESHOLDS` - Predefined performance thresholds

### Cache Headers

- `CACHE_HEADERS.validateNoCache()` - Validate no-cache directives
- `CACHE_HEADERS.validatePublicCache()` - Validate public cache directives

### Constants

- `STATUS_CODES` - HTTP status code constants
- `HTTP_METHODS` - HTTP method constants
- `API_ENDPOINTS` - Predefined endpoint configurations
- `TEST_FIXTURES` - Test data fixtures (station IDs, line IDs, etc.)
- `PERFORMANCE_THRESHOLDS` - Performance timing thresholds

## Best Practices

1. **Always validate responses** - Use `validateApiResponse()` for comprehensive validation
2. **Measure performance** - Use `measureResponseTime()` for performance-critical endpoints
3. **Use constants** - Reference `STATUS_CODES`, `API_ENDPOINTS`, and `TEST_FIXTURES`
4. **Handle warnings** - Check `validation.warnings` for non-critical issues
5. **Custom thresholds** - Define custom performance thresholds for new endpoints

## Examples

See `public-api-health.e2e.ts` for comprehensive examples of using these utilities.

## Adding New Endpoints

1. Add endpoint configuration to `API_ENDPOINTS` if it's a core endpoint
2. Add test fixtures to `TEST_FIXTURES` if needed
3. Add performance threshold to `PERFORMANCE_THRESHOLDS` if applicable
4. Write tests using the utilities provided
