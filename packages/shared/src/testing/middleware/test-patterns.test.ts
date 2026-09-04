/**
 * Unit tests for the common middleware test patterns.
 */

import {
  ERROR_SCENARIOS,
  ERROR_SCENARIO_STATUSES,
  type MiddlewareErrorScenario,
  type MiddlewareLike,
  assertErrorResponse,
  assertHeader,
  assertJsonResponse,
  assertMiddlewareError,
  assertMiddlewarePassthrough,
  assertMiddlewareStatus,
  assertRateLimited,
  createErrorResponse,
  createErrorScenario,
  createJsonResponse,
  createMiddlewareRequest,
} from "@mta-my-way/shared/testing/middleware";
import { describe, expect, it } from "vitest";

describe("createErrorScenario", () => {
  it("defaults the body to the reason phrase for the status", () => {
    const scenario = createErrorScenario(404);

    expect(scenario).toEqual({
      name: "not-found",
      status: 404,
      body: { error: "Not Found" },
      headers: {},
    });
  });

  it("uses the rate limiter's own wording for 429", () => {
    const scenario = createErrorScenario(429);

    expect(scenario.body).toEqual({ error: "Too many requests" });
  });

  it("accepts a status outside the shipped list", () => {
    expect(createErrorScenario(418).status).toBe(418);
  });

  it("replaces the body and headers whole rather than merging", () => {
    const scenario = createErrorScenario(403, {
      name: "admin-only",
      body: { error: "Admin role required" },
      headers: { "X-Reason": "rbac" },
    });

    expect(scenario.body).toEqual({ error: "Admin role required" });
    expect(scenario.headers).toEqual({ "X-Reason": "rbac" });
  });

  it("freezes the scenario and its nested objects", () => {
    const scenario = createErrorScenario(400);

    expect(Object.isFrozen(scenario)).toBe(true);
    expect(Object.isFrozen(scenario.body)).toBe(true);
    expect(Object.isFrozen(scenario.headers)).toBe(true);
  });

  it("rejects a status that is not an error status", () => {
    expect(() => createErrorScenario(200)).toThrow(/4xx or 5xx/);
    expect(() => createErrorScenario(399)).toThrow(/4xx or 5xx/);
    expect(() => createErrorScenario(600)).toThrow(/4xx or 5xx/);
    expect(() => createErrorScenario(Number.NaN)).toThrow(/4xx or 5xx/);
  });
});

describe("ERROR_SCENARIOS", () => {
  it("is frozen", () => {
    expect(Object.isFrozen(ERROR_SCENARIOS)).toBe(true);
  });

  it("covers the shipped statuses", () => {
    for (const status of ERROR_SCENARIO_STATUSES) {
      expect(
        Object.values(ERROR_SCENARIOS).some((scenario) => scenario.status === status),
        `no scenario for status ${status}`
      ).toBe(true);
    }
  });

  it("models the full rate-limiter contract on tooManyRequests", () => {
    const scenario = ERROR_SCENARIOS.tooManyRequests;

    expect(scenario.status).toBe(429);
    expect(scenario.body).toEqual({ error: "Too many requests", retryAfter: 60 });
    expect(scenario.headers).toEqual({ "Retry-After": "60" });
  });

  it("only ships valid error scenarios", () => {
    for (const scenario of Object.values(ERROR_SCENARIOS)) {
      expect(scenario.status).toBeGreaterThanOrEqual(400);
      expect(scenario.status).toBeLessThanOrEqual(599);
      expect(typeof scenario.body.error).toBe("string");
      expect((scenario.body.error as string).length).toBeGreaterThan(0);
    }
  });
});

describe("createJsonResponse", () => {
  it("serializes the body and defaults the status and content type", async () => {
    const response = createJsonResponse({ stationId: "725" });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    await expect(response.json()).resolves.toEqual({ stationId: "725" });
  });

  it("applies an explicit status and extra headers", () => {
    const response = createJsonResponse(
      { ok: true },
      { status: 201, headers: { "X-Cache": "MISS" } }
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("x-cache")).toBe("MISS");
  });

  it("lets a caller override the content type", () => {
    const response = createJsonResponse({}, { headers: { "content-type": "application/ld+json" } });

    expect(response.headers.get("content-type")).toBe("application/ld+json");
  });
});

describe("createErrorResponse", () => {
  it("renders a bare status as the default scenario", async () => {
    const response = createErrorResponse(404);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Not Found" });
  });

  it("renders a scenario's status, body and headers", async () => {
    const response = createErrorResponse(ERROR_SCENARIOS.tooManyRequests);

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    await expect(response.json()).resolves.toEqual({
      error: "Too many requests",
      retryAfter: 60,
    });
  });

  it("applies overrides to a bare status", async () => {
    const response = createErrorResponse(403, { body: { error: "Admin role required" } });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Admin role required" });
  });

  it("does not mutate the scenario it renders", () => {
    const before = structuredClone(ERROR_SCENARIOS.forbidden);

    createErrorResponse(ERROR_SCENARIOS.forbidden, { body: { error: "changed" } });

    expect(ERROR_SCENARIOS.forbidden).toEqual(before);
  });
});

describe("assertJsonResponse", () => {
  it("accepts a matching status and body", async () => {
    await assertJsonResponse(createJsonResponse({ ok: true }), 200, { ok: true });
  });

  it("accepts a body-only-by-content-type check when no body is expected", async () => {
    await assertJsonResponse(createJsonResponse({ anything: true }, { status: 201 }), 201);
  });

  it("rejects a wrong status", async () => {
    await expect(assertJsonResponse(createJsonResponse({}), 201, {})).rejects.toThrow(
      /status 201, got 200/
    );
  });

  it("rejects a non-JSON content type", async () => {
    const response = new Response("plain", {
      status: 200,
      headers: { "content-type": "text/plain" },
    });

    await expect(assertJsonResponse(response, 200)).rejects.toThrow(/content type "text\/plain"/);
  });

  it("rejects a body that is not valid JSON", async () => {
    const response = new Response("{not json", {
      status: 200,
      headers: { "content-type": "application/json" },
    });

    await expect(assertJsonResponse(response, 200, {})).rejects.toThrow(/could not be parsed/);
  });

  it("rejects a mismatched body", async () => {
    await expect(
      assertJsonResponse(createJsonResponse({ ok: false }), 200, { ok: true })
    ).rejects.toThrow();
  });

  it("leaves the response readable for a later assertion", async () => {
    const response = createJsonResponse({ ok: true });

    await assertJsonResponse(response, 200, { ok: true });
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});

describe("assertErrorResponse", () => {
  it("defaults to requiring a 400 envelope", async () => {
    await assertErrorResponse(createErrorResponse(400));
  });

  it("accepts a bare status", async () => {
    await assertErrorResponse(createErrorResponse(404), 404);
  });

  it("accepts a full scenario, asserting its headers too", async () => {
    await assertErrorResponse(
      createErrorResponse(ERROR_SCENARIOS.tooManyRequests),
      ERROR_SCENARIOS.tooManyRequests
    );
  });

  it("accepts a partial expectation over a shipped scenario", async () => {
    await assertErrorResponse(createErrorResponse(ERROR_SCENARIOS.tooManyRequests), {
      status: 429,
      error: "Too many requests",
    });
  });

  it("requires extra body fields via partial matching", async () => {
    await assertErrorResponse(
      createErrorResponse(429, { body: { error: "Too many requests", retryAfter: 60 } }),
      { status: 429, body: { retryAfter: 60 } }
    );
  });

  it("rejects a status mismatch", async () => {
    await expect(assertErrorResponse(createErrorResponse(400), 401)).rejects.toThrow(
      /status 401, got 400/
    );
  });

  it("rejects a body without an error message", async () => {
    await expect(
      assertErrorResponse(createJsonResponse({ message: "nope" }, { status: 400 }), 400)
    ).rejects.toThrow(/non-empty "error" message/);
  });

  it("rejects an empty error message", async () => {
    await expect(
      assertErrorResponse(createJsonResponse({ error: "" }, { status: 400 }), 400)
    ).rejects.toThrow(/non-empty "error" message/);
  });

  it("rejects a non-object body", async () => {
    await expect(
      assertErrorResponse(createJsonResponse(["nope"], { status: 400 }), 400)
    ).rejects.toThrow(/error envelope object/);
  });

  it("rejects a wrong error message", async () => {
    await expect(
      assertErrorResponse(createErrorResponse(403), { status: 403, error: "Admin role required" })
    ).rejects.toThrow(/to be "Admin role required"/);
  });

  it("rejects a body that is not JSON at all", async () => {
    const response = new Response("gateway timeout", {
      status: 504,
      headers: { "content-type": "text/plain" },
    });

    await expect(assertErrorResponse(response, 504)).rejects.toThrow(/to be JSON/);
  });

  it("leaves the response readable for a later assertion", async () => {
    const response = createErrorResponse(401);

    await assertErrorResponse(response, 401);
    await assertErrorResponse(response, 401);
  });
});

describe("assertRateLimited", () => {
  /** Build a 429 carrying the full `rate-limiter.ts` contract. */
  function rateLimitedResponse(): Response {
    const response = createErrorResponse(ERROR_SCENARIOS.tooManyRequests);
    response.headers.set("X-RateLimit-Limit", "60");
    response.headers.set("X-RateLimit-Remaining", "0");
    response.headers.set("X-RateLimit-Reset", "1700000000");
    return response;
  }

  it("accepts the full rate-limiter contract", async () => {
    await assertRateLimited(rateLimitedResponse(), { retryAfter: 60 });
  });

  it("defaults to requiring the X-RateLimit headers", async () => {
    await expect(
      assertRateLimited(createErrorResponse(ERROR_SCENARIOS.tooManyRequests))
    ).rejects.toThrow(/X-RateLimit-Limit/);
  });

  it("skips the X-RateLimit headers when asked to", async () => {
    await assertRateLimited(createErrorResponse(ERROR_SCENARIOS.tooManyRequests), {
      headers: false,
    });
  });

  it("rejects a non-429", async () => {
    await expect(assertRateLimited(createErrorResponse(500))).rejects.toThrow(
      /rate-limited response with status 429, got 500/
    );
  });

  it("rejects a missing Retry-After header", async () => {
    const response = createErrorResponse(429, { body: { error: "Too many requests" } });

    await expect(assertRateLimited(response, { headers: false })).rejects.toThrow(/Retry-After/);
  });

  it("rejects a non-numeric Retry-After", async () => {
    const response = createErrorResponse(429, {
      body: { error: "Too many requests" },
      headers: { "Retry-After": "soon" },
    });

    await expect(assertRateLimited(response, { headers: false })).rejects.toThrow(
      /whole number of seconds/
    );
  });

  it("rejects a wrong Retry-After value", async () => {
    await expect(assertRateLimited(rateLimitedResponse(), { retryAfter: 30 })).rejects.toThrow(
      /"Retry-After" to be 30, got 60/
    );
  });

  it("requires the retryAfter body field to agree with the header", async () => {
    const response = createErrorResponse(429, {
      body: { error: "Too many requests", retryAfter: 30 },
      headers: { "Retry-After": "60" },
    });

    await expect(assertRateLimited(response, { retryAfter: 60, headers: false })).rejects.toThrow();
  });

  it("rejects a wrong error message", async () => {
    await expect(assertRateLimited(rateLimitedResponse(), { error: "Slow down" })).rejects.toThrow(
      /to be "Slow down"/
    );
  });
});

describe("assertMiddlewarePassthrough", () => {
  const passthrough: MiddlewareLike = (_request, next) => next();

  it("returns the handler's response when no layer short-circuits", async () => {
    const response = await assertMiddlewarePassthrough(passthrough, createMiddlewareRequest());

    expect(response.status).toBe(200);
    expect(response.body).toBeNull();
  });

  it("returns a custom handler's response", async () => {
    const response = await assertMiddlewarePassthrough(passthrough, createMiddlewareRequest(), () =>
      createJsonResponse({ reached: true })
    );

    await assertJsonResponse(response, 200, { reached: true });
  });

  it("runs a whole chain before the handler", async () => {
    const order: string[] = [];
    const chain: MiddlewareLike[] = [
      (_request, next) => {
        order.push("first");
        return next();
      },
      (_request, next) => {
        order.push("second");
        return next();
      },
    ];

    await assertMiddlewarePassthrough(chain, createMiddlewareRequest());

    expect(order).toEqual(["first", "second"]);
  });

  it("fails when a layer short-circuits", async () => {
    const blocking: MiddlewareLike = () => createErrorResponse(401);

    await expect(assertMiddlewarePassthrough(blocking, createMiddlewareRequest())).rejects.toThrow(
      /short-circuited with 401/
    );
  });
});

describe("assertMiddlewareStatus", () => {
  it("accepts a matching short-circuit status", async () => {
    const response = await assertMiddlewareStatus(
      () => createJsonResponse({ cached: true }, { status: 200 }),
      createMiddlewareRequest(),
      200
    );

    await assertJsonResponse(response, 200, { cached: true });
  });

  it("rejects a different short-circuit status", async () => {
    await expect(
      assertMiddlewareStatus(() => createErrorResponse(404), createMiddlewareRequest(), 500)
    ).rejects.toThrow(/status 500, got 404/);
  });
});

describe("assertMiddlewareError", () => {
  it("asserts a bare status", async () => {
    const response = await assertMiddlewareError(
      () => createErrorResponse(401),
      createMiddlewareRequest(),
      401
    );

    expect(response.status).toBe(401);
  });

  it("asserts a full scenario including headers", async () => {
    const response = await assertMiddlewareError(
      () => createErrorResponse(ERROR_SCENARIOS.tooManyRequests),
      createMiddlewareRequest(),
      ERROR_SCENARIOS.tooManyRequests
    );

    assertHeader(response, "Retry-After", "60");
  });

  it("asserts a partial expectation", async () => {
    await assertMiddlewareError(
      () => createErrorResponse(403, { body: { error: "Admin role required" } }),
      createMiddlewareRequest(),
      { status: 403, error: "Admin role required" }
    );
  });

  it("fails when the middleware passes through instead", async () => {
    await expect(
      assertMiddlewareError((_request, next) => next(), createMiddlewareRequest(), 401)
    ).rejects.toThrow(/status 401, got 200/);
  });
});

describe("pattern helpers cooperating with the rest of the module", () => {
  /** A validation-style middleware: reject a body without a station, else continue. */
  const requireStation: MiddlewareLike = async (request, next) => {
    const body = (await request.json()) as { stationId?: string };

    return typeof body.stationId === "string" && body.stationId.length > 0
      ? next()
      : createErrorResponse(422, { body: { error: "Invalid station", field: "stationId" } });
  };

  it("drives a whole middleware test with only the pattern helpers", async () => {
    const accepted = await assertMiddlewarePassthrough(
      requireStation,
      createMiddlewareRequest({ method: "POST", body: { stationId: "725" } }),
      () => createJsonResponse({ ok: true })
    );
    await assertJsonResponse(accepted, 200, { ok: true });

    await assertMiddlewareError(
      requireStation,
      createMiddlewareRequest({ method: "POST", body: {} }),
      { status: 422, error: "Invalid station" }
    );
  });

  it("round-trips a scenario through create and assert", async () => {
    const scenario: MiddlewareErrorScenario = createErrorScenario(422, {
      body: { error: "Invalid station", field: "stationId" },
    });

    await assertErrorResponse(createErrorResponse(scenario), scenario);
  });

  it("exposes the shipped statuses as a readonly tuple", () => {
    expect(ERROR_SCENARIO_STATUSES).toContain(429);
    expect(ERROR_SCENARIO_STATUSES.length).toBeGreaterThan(10);
  });
});
