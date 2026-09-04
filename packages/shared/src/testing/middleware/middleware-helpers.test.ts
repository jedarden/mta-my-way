/**
 * Unit tests for middleware testing helpers.
 */

import * as middlewareTesting from "@mta-my-way/shared/testing/middleware";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type MiddlewareLike,
  SECURITY_HEADER_NAMES,
  assertHeader,
  assertNoHeader,
  assertSecurityHeaders,
  cleanupMiddlewareTest,
  createMiddlewareRequest,
  executeMiddleware,
  setupMiddlewareTest,
} from "./middleware-helpers";

describe("createMiddlewareRequest", () => {
  it("applies defaults", () => {
    const request = createMiddlewareRequest();

    expect(request).toBeInstanceOf(Request);
    expect(request.method).toBe("GET");
    expect(request.url).toBe("http://localhost:3001/api/test");
  });

  it("uppercases the method", () => {
    const request = createMiddlewareRequest({ method: "post" });

    expect(request.method).toBe("POST");
  });

  it("sets headers case-insensitively", () => {
    const request = createMiddlewareRequest({
      headers: { Authorization: "Bearer token123" },
    });

    expect(request.headers.get("authorization")).toBe("Bearer token123");
  });

  it("JSON-serializes object bodies and defaults the content type", async () => {
    const request = createMiddlewareRequest({
      method: "POST",
      body: { stationId: "725" },
    });

    expect(request.headers.get("content-type")).toBe("application/json");
    await expect(request.json()).resolves.toEqual({ stationId: "725" });
  });

  it("preserves an explicitly provided content type", () => {
    const request = createMiddlewareRequest({
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "stationId=725",
    });

    expect(request.headers.get("content-type")).toBe("application/x-www-form-urlencoded");
  });

  it("rejects bodies on methods that cannot carry them", () => {
    expect(() => createMiddlewareRequest({ body: { stationId: "725" } })).toThrow(
      /GET requests cannot carry a body/
    );
    expect(() => createMiddlewareRequest({ method: "HEAD", body: "x" })).toThrow(
      /HEAD requests cannot carry a body/
    );
  });
});

describe("executeMiddleware", () => {
  it("returns the empty 200 response when no middleware short-circuits", async () => {
    const response = await executeMiddleware([], createMiddlewareRequest());

    expect(response.status).toBe(200);
  });

  it("passes a short-circuited response through", async () => {
    const blocked: MiddlewareLike = () => new Response("Forbidden", { status: 403 });

    const response = await executeMiddleware(blocked, createMiddlewareRequest());

    expect(response.status).toBe(403);
    expect(await response.text()).toBe("Forbidden");
  });

  it("runs a chain in registration order", async () => {
    const order: string[] = [];
    const first: MiddlewareLike = async (_request, next) => {
      order.push("first");
      return next();
    };
    const second: MiddlewareLike = async (_request, next) => {
      order.push("second");
      return next();
    };

    await executeMiddleware([first, second], createMiddlewareRequest(), (request) => {
      order.push("handler");
      return new Response(request.method);
    });

    expect(order).toEqual(["first", "second", "handler"]);
  });

  it("does not run downstream layers when a middleware short-circuits", async () => {
    let downstreamRan = false;
    const downstream: MiddlewareLike = async (_request, next) => {
      downstreamRan = true;
      return next();
    };
    const blocked: MiddlewareLike = () => new Response(null, { status: 429 });

    const response = await executeMiddleware([blocked, downstream], createMiddlewareRequest());

    expect(response.status).toBe(429);
    expect(downstreamRan).toBe(false);
  });

  it("gives each middleware its own clone of the request", async () => {
    let bodyFromMiddleware: unknown;
    const reader: MiddlewareLike = async (request, next) => {
      bodyFromMiddleware = await request.json();
      return next();
    };

    const request = createMiddlewareRequest({ method: "POST", body: { stationId: "725" } });
    await executeMiddleware([reader], request, async (handled) => {
      await expect(handled.json()).resolves.toEqual({ stationId: "725" });
      return new Response("ok");
    });

    expect(bodyFromMiddleware).toEqual({ stationId: "725" });
  });

  it("uses the caller-supplied terminal handler", async () => {
    const response = await executeMiddleware(
      [],
      createMiddlewareRequest({ url: "http://localhost:3001/api/stations/725" }),
      (request) => new Response(request.url, { status: 200 })
    );

    expect(await response.text()).toBe("http://localhost:3001/api/stations/725");
  });
});

describe("assertHeader", () => {
  it("accepts a present header", () => {
    assertHeader(new Response(null, { headers: { "X-Frame-Options": "DENY" } }), "x-frame-options");
  });

  it("accepts a matching value", () => {
    assertHeader(
      new Response(null, { headers: { "X-Content-Type-Options": "nosniff" } }),
      "X-Content-Type-Options",
      "nosniff"
    );
  });

  it("rejects a mismatched value", () => {
    expect(() =>
      assertHeader(
        new Response(null, { headers: { "X-Frame-Options": "DENY" } }),
        "X-Frame-Options",
        "SAMEORIGIN"
      )
    ).toThrow(/to be "SAMEORIGIN", got "DENY"/);
  });

  it("rejects an absent header", () => {
    expect(() => assertHeader(new Response(), "Referrer-Policy")).toThrow(
      /include "Referrer-Policy" header, but it was absent/
    );
  });
});

describe("assertNoHeader", () => {
  it("accepts an absent header", () => {
    assertNoHeader(new Response(), "Set-Cookie");
  });

  it("rejects a present header", () => {
    expect(() =>
      assertNoHeader(new Response(null, { headers: { "Set-Cookie": "a=b" } }), "Set-Cookie")
    ).toThrow(/omit "Set-Cookie" header/);
  });
});

describe("assertSecurityHeaders", () => {
  it("accepts a response carrying every expected security header", () => {
    const headers = new Headers(SECURITY_HEADER_NAMES.map((name) => [name, "value"]));
    assertSecurityHeaders(new Response(null, { headers }));
  });

  it("reports every missing header", () => {
    const headers = new Headers({ "X-Frame-Options": "DENY" });

    expect(() => assertSecurityHeaders(new Response(null, { headers }))).toThrow(
      /missing security headers: Content-Security-Policy, Strict-Transport-Security/
    );
  });

  it("honours a custom required list", () => {
    const headers = new Headers({ "X-Frame-Options": "DENY" });

    assertSecurityHeaders(new Response(null, { headers }), ["X-Frame-Options"]);
    expect(() =>
      assertSecurityHeaders(new Response(null, { headers }), ["Referrer-Policy"])
    ).toThrow(/missing security headers: Referrer-Policy/);
  });
});

describe("setupMiddlewareTest / cleanupMiddlewareTest", () => {
  it("builds a standard request and an empty chain by default", async () => {
    const fixture = setupMiddlewareTest();

    expect(fixture.request).toBeInstanceOf(Request);
    expect(fixture.request.method).toBe("GET");
    expect(fixture.request.url).toBe("http://localhost:3001/api/test");
    expect(fixture.middleware).toEqual([]);

    await expect(fixture.run()).resolves.toMatchObject({ status: 200 });

    cleanupMiddlewareTest(fixture);
  });

  it("runs its chain in registration order to the terminal handler", async () => {
    const order: string[] = [];
    const first: MiddlewareLike = async (_request, next) => {
      order.push("first");
      return next();
    };
    const second: MiddlewareLike = async (_request, next) => {
      order.push("second");
      return next();
    };

    const fixture = setupMiddlewareTest({
      middleware: [first, second],
      handler: (request) => {
        order.push("handler");
        return new Response(request.url, { status: 201 });
      },
    });

    const response = await fixture.run();

    expect(order).toEqual(["first", "second", "handler"]);
    expect(response.status).toBe(201);
    expect(await response.text()).toBe("http://localhost:3001/api/test");

    cleanupMiddlewareTest(fixture);
  });

  it("merges createRequest overrides over the fixture's request options", () => {
    const fixture = setupMiddlewareTest({
      request: {
        url: "http://localhost:3001/api/favorites",
        headers: { authorization: "Bearer token123" },
      },
    });

    const variant = fixture.createRequest({ method: "POST", body: { stationId: "725" } });

    expect(variant.method).toBe("POST");
    expect(variant.url).toBe("http://localhost:3001/api/favorites");
    expect(variant.headers.get("authorization")).toBe("Bearer token123");
    expect(variant.headers.get("content-type")).toBe("application/json");

    // Building a variant never touches the fixture's own request
    expect(fixture.request.method).toBe("GET");

    cleanupMiddlewareTest(fixture);
  });

  it("scopes run overrides to a single run", async () => {
    const blocked: MiddlewareLike = () => new Response("Forbidden", { status: 403 });
    const fixture = setupMiddlewareTest();

    await expect(fixture.run({ middleware: blocked })).resolves.toMatchObject({ status: 403 });
    await expect(
      fixture.run({
        request: fixture.createRequest({ url: "http://localhost:3001/api/stations" }),
        handler: (request) => new Response(request.url),
      })
    ).resolves.toHaveProperty("status", 200);

    // Neither override became part of the fixture
    expect(fixture.middleware).toEqual([]);
    expect(fixture.request.url).toBe("http://localhost:3001/api/test");
    await expect(fixture.run()).resolves.toMatchObject({ status: 200 });

    cleanupMiddlewareTest(fixture);
  });

  it("installs the testing-root mocks and teardown restores them", () => {
    expect(vi.isMockFunction(console.log)).toBe(false);
    expect(vi.isMockFunction(performance.now)).toBe(false);

    const fixture = setupMiddlewareTest();

    expect(vi.isMockFunction(console.log)).toBe(true);
    expect(vi.isMockFunction(console.debug)).toBe(true);
    expect(vi.isMockFunction(performance.now)).toBe(true);

    cleanupMiddlewareTest(fixture);

    expect(vi.isMockFunction(console.log)).toBe(false);
    expect(vi.isMockFunction(performance.now)).toBe(false);
  });

  it("leaves globals alone when mockEnvironment is false", () => {
    const fixture = setupMiddlewareTest({ mockEnvironment: false });

    expect(vi.isMockFunction(console.log)).toBe(false);
    expect(vi.isMockFunction(performance.now)).toBe(false);

    cleanupMiddlewareTest(fixture);
  });

  it("installs fake timers and reverts them on teardown", () => {
    const fixture = setupMiddlewareTest({ fakeTimers: true });

    expect(vi.isFakeTimers()).toBe(true);

    let fired = false;
    setTimeout(() => {
      fired = true;
    }, 500);
    vi.advanceTimersByTime(500);
    expect(fired).toBe(true);

    cleanupMiddlewareTest(fixture);

    expect(vi.isFakeTimers()).toBe(false);
  });

  it("rejects a fixture that has already been torn down", async () => {
    const fixture = setupMiddlewareTest();

    cleanupMiddlewareTest(fixture);
    cleanupMiddlewareTest(fixture);

    await expect(fixture.run()).rejects.toThrow(/torn down/);
  });

  it("tolerates a missing fixture so afterEach needs no guard", () => {
    expect(() => cleanupMiddlewareTest(null)).not.toThrow();
    expect(() => cleanupMiddlewareTest(undefined)).not.toThrow();
  });

  it("re-exports the pair from the middleware barrel", () => {
    expect(middlewareTesting.setupMiddlewareTest).toBe(setupMiddlewareTest);
    expect(middlewareTesting.cleanupMiddlewareTest).toBe(cleanupMiddlewareTest);
  });
});

describe("middleware fixture pairing", () => {
  let fixture: ReturnType<typeof setupMiddlewareTest>;

  beforeEach(() => {
    fixture = setupMiddlewareTest({
      request: { url: "http://localhost:3001/api/arrivals/725" },
      middleware: [
        (_request, next) =>
          next().then((response) => {
            response.headers.set("X-Traced", "true");
            return response;
          }),
      ],
    });
  });

  afterEach(() => {
    cleanupMiddlewareTest(fixture);
  });

  it("installs the fixture in beforeEach and runs it inside the test", async () => {
    expect(vi.isMockFunction(console.log)).toBe(true);

    const response = await fixture.run();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-traced")).toBe("true");
    expect(vi.isMockFunction(performance.now)).toBe(true);
  });

  it("starts each test with real timers restored by the previous teardown", () => {
    expect(vi.isFakeTimers()).toBe(false);

    const timed = setupMiddlewareTest({ fakeTimers: true });
    expect(vi.isFakeTimers()).toBe(true);
    cleanupMiddlewareTest(timed);

    expect(vi.isFakeTimers()).toBe(false);
  });
});
