/**
 * Shared test utilities and helpers for MTA My Way.
 *
 * Provides common testing functionality used across all packages:
 * - Mock data generators
 * - Test fixtures
 * - Assertion helpers
 * - Test setup utilities
 */

import { vi } from "vitest";

// ============================================================================
// Mock Data Generators
// ============================================================================

/**
 * Generate a mock station object.
 */
export function createMockStation(overrides = {}) {
  return {
    id: "725",
    name: "Times Square-42 St",
    lat: 40.7589,
    lon: -73.9851,
    lines: ["1", "2", "3", "7", "N", "Q", "R", "W"],
    northStopId: "725N",
    southStopId: "725S",
    transfers: [],
    ada: true,
    borough: "manhattan",
    ...overrides,
  };
}

/**
 * Generate a mock route object.
 */
export function createMockRoute(overrides = {}) {
  return {
    id: "1",
    shortName: "1",
    longName: "Broadway-7th Ave Local",
    color: "#EE352E",
    textColor: "#FFFFFF",
    feedId: "gtfs",
    division: "A",
    stops: ["101", "102", "103"],
    isExpress: false,
    ...overrides,
  };
}

/**
 * Generate a mock arrival object.
 */
export function createMockArrival(overrides = {}) {
  return {
    line: "1",
    direction: "N" as const,
    arrivalTime: Date.now() + 120000, // 2 minutes from now
    minutesAway: 2,
    isAssigned: true,
    isRerouted: false,
    tripId: "trip_123",
    destination: "Van Cortlandt Park",
    confidence: "high" as const,
    feedName: "gtfs",
    feedAge: 8,
    ...overrides,
  };
}

/**
 * Generate a mock alert object.
 */
export function createMockAlert(overrides = {}) {
  return {
    id: "alert_123",
    severity: "warning" as const,
    headline: "Delays on 1 train",
    description: "1 trains running with delays due to signal problems",
    affectedLines: ["1"],
    activePeriod: {
      start: Date.now() - 3600000,
      end: Date.now() + 7200000,
    },
    cause: "SIGNAL_PROBLEM",
    effect: "DELAY",
    ...overrides,
  };
}

/**
 * Generate a mock favorite object.
 */
export function createMockFavorite(overrides = {}) {
  return {
    id: "fav_123",
    stationId: "725",
    stationName: "Times Square-42 St",
    lines: ["1", "2", "3"],
    direction: "both" as const,
    sortOrder: 0,
    label: "Work",
    ...overrides,
  };
}

/**
 * Generate a mock commute object.
 */
export function createMockCommute(overrides = {}) {
  return {
    id: "commute_123",
    name: "Work",
    origin: createMockStation({ id: "725", name: "Times Square-42 St" }),
    destination: createMockStation({ id: "726", name: "34 St-Penn Station" }),
    preferredLines: ["1", "2", "3"],
    enableTransferSuggestions: true,
    ...overrides,
  };
}

/**
 * Generate a mock trip record object.
 */
export function createMockTripRecord(overrides = {}) {
  return {
    id: "trip_123",
    date: new Date().toISOString().split("T")[0],
    origin: createMockStation({ id: "725" }),
    destination: createMockStation({ id: "726" }),
    line: "1",
    departureTime: Date.now() - 3600000,
    arrivalTime: Date.now() - 1800000,
    actualDurationMinutes: 30,
    source: "tracked" as const,
    ...overrides,
  };
}

/**
 * Generate a mock push subscription object.
 */
export function createMockPushSubscription(overrides = {}) {
  return {
    endpoint: "https://fcm.googleapis.com/fcm/send/test_endpoint",
    keys: {
      p256dh: "test_p256dh_key",
      auth: "test_auth_key",
    },
    expirationTime: null,
    ...overrides,
  };
}

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Complete test fixture set with related data.
 */
export function createTestFixture() {
  const timesSquare = createMockStation({ id: "725", name: "Times Square-42 St" });
  const pennStation = createMockStation({ id: "726", name: "34 St-Penn Station" });
  const route1 = createMockRoute({ id: "1", shortName: "1" });

  return {
    stations: {
      timesSquare,
      pennStation,
    },
    routes: {
      "1": route1,
    },
    arrivals: {
      timesSquareNorth: [
        createMockArrival({ line: "1", direction: "N", minutesAway: 2 }),
        createMockArrival({ line: "1", direction: "N", minutesAway: 8 }),
        createMockArrival({ line: "2", direction: "N", minutesAway: 5 }),
      ],
      timesSquareSouth: [
        createMockArrival({ line: "1", direction: "S", minutesAway: 3 }),
        createMockArrival({ line: "2", direction: "S", minutesAway: 12 }),
      ],
    },
    alerts: [
      createMockAlert({
        id: "alert_1",
        severity: "warning",
        affectedLines: ["1"],
        headline: "1 train delays",
      }),
    ],
    favorites: [
      createMockFavorite({
        id: "fav_1",
        stationId: "725",
        stationName: "Times Square-42 St",
        label: "Work",
      }),
    ],
    commutes: [
      createMockCommute({
        id: "commute_1",
        name: "Work",
        origin: timesSquare,
        destination: pennStation,
      }),
    ],
  };
}

// ============================================================================
// Assertion Helpers
// ============================================================================

/**
 * Assert that an object has all required properties.
 */
export function assertHasProperties(obj: unknown, requiredProps: string[]): void {
  expect(obj).toBeDefined();
  expect(obj).not.toBeNull();

  const actualObj = obj as Record<string, unknown>;
  for (const prop of requiredProps) {
    expect(actualObj).toHaveProperty(prop);
  }
}

/**
 * Assert that a date is recent (within specified milliseconds).
 */
export function assertIsRecent(timestamp: number, maxAgeMs = 60000): void {
  const now = Date.now();
  const age = now - timestamp;
  expect(age).toBeGreaterThanOrEqual(0);
  expect(age).toBeLessThanOrEqual(maxAgeMs);
}

/**
 * Assert that a response has the correct structure.
 */
export function assertApiResponse(
  response: unknown,
  expectedStatus: number,
  expectedDataShape: Record<string, unknown>
): void {
  const resp = response as { status?: number; data?: unknown };
  expect(resp.status).toBe(expectedStatus);

  if (expectedDataShape) {
    expect(resp.data).toBeDefined();
    expect(resp.data).toMatchObject(expectedDataShape);
  }
}

/**
 * Assert that an array is sorted by a key.
 */
export function assertIsSorted<T>(array: T[], key: keyof T, order: "asc" | "desc" = "asc"): void {
  for (let i = 0; i < array.length - 1; i++) {
    const current = array[i][key];
    const next = array[i + 1][key];

    if (order === "asc") {
      expect(current).toBeLessThanOrEqual(next);
    } else {
      expect(current).toBeGreaterThanOrEqual(next);
    }
  }
}

// ============================================================================
// Mock Helpers
// ============================================================================

/**
 * Create a mock logger that can be used in tests.
 */
export function createMockLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => createMockLogger()),
  };
}

/**
 * Create a mock database connection.
 */
export function createMockDatabase() {
  const mockData = new Map<string, unknown[]>();

  return {
    prepare: vi.fn(() => ({
      all: vi.fn(() => []),
      get: vi.fn(() => null),
      run: vi.fn(() => ({ lastInsertRowid: 1, changes: 1 })),
    })),
    exec: vi.fn(),
    transaction: vi.fn((fn: () => void) => fn()),
    pragma: vi.fn(() => []),
    close: vi.fn(),

    // Helper methods for testing
    _setData: (table: string, data: unknown[]) => mockData.set(table, data),
    _getData: (table: string) => mockData.get(table) ?? [],
  };
}

/**
 * Create a mock fetch response.
 */
export function createMockResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
    headers: new Headers({
      "content-type": "application/json",
    }),
  };
}

/**
 * Create a mock fetch function.
 */
export function createMockFetch(
  responses: Array<{ url: string; response: ReturnType<typeof createMockResponse> }>
) {
  return vi.fn(async (url: string) => {
    const matched = responses.find((r) => r.url === url || url.includes(r.url));
    return matched?.response ?? createMockResponse({ error: "Not found" }, 404);
  });
}

// ============================================================================
// Test Setup Helpers
// ============================================================================

/**
 * Setup test environment with common mocks.
 */
export function setupTestEnvironment() {
  // Mock console methods to reduce noise in tests
  vi.spyOn(console, "debug").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});

  // Mock performance API
  vi.stubGlobal("performance", {
    now: vi.fn(() => Date.now()),
    mark: vi.fn(),
    measure: vi.fn(),
    getEntriesByName: vi.fn(() => []),
  });

  // Mock requestIdleCallback if not available
  if (!("requestIdleCallback" in globalThis)) {
    vi.stubGlobal(
      "requestIdleCallback",
      vi.fn((cb) => setTimeout(cb, 0))
    );
    vi.stubGlobal("cancelIdleCallback", vi.fn(clearTimeout));
  }
}

/**
 * Cleanup test environment.
 */
export function cleanupTestEnvironment() {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
}

/**
 * Create a test context object with common setup.
 */
export function createTestContext() {
  setupTestEnvironment();

  return {
    mockLogger: createMockLogger(),
    mockDb: createMockDatabase(),
    mockFetch: createMockFetch([]),
    fixture: createTestFixture(),
    cleanup: cleanupTestEnvironment,
  };
}

// ============================================================================
// Time Utilities
// ============================================================================

/**
 * Mock current time for consistent tests.
 */
export function mockCurrentTime(timestamp: number) {
  vi.spyOn(Date, "now").mockReturnValue(timestamp);
  vi.spyOn(Date, "parse").mockImplementation((iso) => {
    // Simple mock that returns the input timestamp for known ISO strings
    return timestamp;
  });
}

/**
 * Create a mock date string.
 */
export function createMockDateString(date = new Date()): string {
  return date.toISOString();
}

// ============================================================================
// Performance Testing Utilities
// ============================================================================

/**
 * Measure execution time of a function.
 */
export async function measureExecutionTime<T>(
  fn: () => T | Promise<T>
): Promise<{ result: T; durationMs: number }> {
  const start = performance.now();
  const result = await fn();
  const durationMs = performance.now() - start;

  return { result, durationMs };
}

/**
 * Assert that a function completes within a time limit.
 */
export async function assertCompletesWithin<T>(
  fn: () => T | Promise<T>,
  maxMs: number
): Promise<T> {
  const { result, durationMs } = await measureExecutionTime(fn);

  expect(durationMs).toBeLessThanOrEqual(maxMs);

  return result;
}

// ============================================================================
// HTTP Testing Utilities
// ============================================================================

/**
 * Create mock request headers.
 */
export function createMockHeaders(overrides: Record<string, string> = {}) {
  return new Headers({
    "content-type": "application/json",
    "user-agent": "test-agent",
    ...overrides,
  });
}

/**
 * Create a mock HTTP request.
 */
export function createMockRequest(
  overrides: {
    method?: string;
    url?: string;
    headers?: Headers;
    body?: unknown;
  } = {}
) {
  return {
    method: overrides.method ?? "GET",
    url: overrides.url ?? "http://localhost:3001/api/test",
    headers: overrides.headers ?? createMockHeaders(),
    body: overrides.body ?? null,
    json: async () => overrides.body,
    text: async () => JSON.stringify(overrides.body),
  };
}

// ============================================================================
// Async Testing Utilities
// ============================================================================

/**
 * Wait for a condition to be true.
 */
export async function waitFor(
  condition: () => boolean,
  timeout = 5000,
  interval = 50
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`Condition not met within ${timeout}ms`);
}

/**
 * Flush all pending promises.
 */
export async function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Wait for multiple async operations to complete.
 */
export async function waitForAll<T>(operations: Array<() => Promise<T>>): Promise<T[]> {
  return Promise.all(operations.map((op) => op()));
}
