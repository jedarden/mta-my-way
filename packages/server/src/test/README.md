# Writing server tests

Server tests use Vitest in Node. Put a `*.test.ts` file beside the code it tests. The root and server Vitest configs both load `src/test/setup.ts`, which resets shared server state and mocks for each test. Use a fresh database per test and close it in `afterEach` or `finally`.

The [test helper barrel](./index.ts) re-exports helpers for response assertions, HTTP mocks, databases, security, observability, rate limiting, and endpoint configuration. Each export has JSDoc at the barrel and at its implementation. Import from `./test/index.js` when the test is in `src/`, adjusting the relative path for deeper directories. For middleware database fixtures and GTFS feeds, see the [fixture guide](./fixtures/README.md); those helpers are imported from their own modules.

## Start with a real Hono response

For a test placed in `src/test/example.test.ts`:

```ts
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { expectErrorResponse, expectSuccessResponse } from "./index.js";

describe("example route", () => {
  const app = new Hono();
  app.get("/example", (c) => c.json({ status: "ok" }));
  app.get("/missing", (c) => c.json({ error: "missing" }, 404));

  it("returns the expected body", async () => {
    const body = await expectSuccessResponse<{ status: string }>(
      await app.request("/example")
    );
    expect(body.status).toBe("ok");
  });

  it("reports an error", async () => {
    const body = await expectErrorResponse(await app.request("/missing"), 404);
    expect(body.error).toBe("missing");
  });
});
```

Use `app.request()` for route behavior. `createMockRequest`, `createMockResponse`, and `createMockContext` are for units that require individual Hono request or context methods. `createFetchMock` is for code that calls `fetch`. Assert on a real `Response` with the `api-response-helpers` exports; the `http.ts` response assertions target a mocked Hono context and are not interchangeable.

## Isolate database state

`createInMemoryDatabase()` starts without application migrations or tables. Create the schema needed by a unit test before calling `seedTestData`. Use `createFreshTestDatabase()` when application migrations are required, or a scenario helper from `fixtures/middleware-helpers.ts` when testing security persistence.

```ts
import { expect, it } from "vitest";
import { createInMemoryDatabase, getRowCount, seedTestData } from "./index.js";

it("reads seeded stations", () => {
  const db = createInMemoryDatabase();
  try {
    db.exec("CREATE TABLE stations (id TEXT PRIMARY KEY)");
    seedTestData(db, { stations: [{ id: "101" }] });
    expect(getRowCount(db, "stations")).toBe(1);
  } finally {
    db.close();
  }
});
```

`createTestDatabase()` returns a file-backed database and a `cleanup()` function; call `cleanup()` in `finally` so the file and connection are removed. For tests that mutate singleton or global state, use the existing setup reset and also restore any state specific to the test.

## Pick a focused helper

| Need | Use |
| --- | --- |
| Assert JSON status and shape | `expectSuccessResponse`, `expectErrorResponse`, `assertArrayResponse`, or `assertHasProperties` |
| Inspect emitted logs, spans, or metrics | `MockLogger`, `MockTracer`, `MockMetricsRegistry` and their assertion helpers |
| Exercise malicious inputs | `securityTestScenarios` with the matching security assertion helper |
| Test middleware ordering or rate limits | `createStandardChainApp`, `createAuthCsrfChainApp`, `withRateLimiting` |
| Build environment-aware endpoint URLs | `API_ENDPOINTS`, `createTestContext`, `buildUrl` |
| Decode a feed edge case | `loadFixture("edge-rerouted")` from `fixtures/loader.ts` |

Run a focused test with `npx vitest run packages/server/src/path/to/file.test.ts`. Before delivery, run the repository's `npm test`, `npm run lint`, and `scripts/definition-of-done.sh --fast` gates as required by the workspace.
