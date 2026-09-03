/**
 * Unit tests for middleware testing helpers.
 */

import { describe, expect, it } from "vitest";
import {
  type MiddlewareLike,
  SECURITY_HEADER_NAMES,
  assertHeader,
  assertNoHeader,
  assertSecurityHeaders,
  createMiddlewareRequest,
  executeMiddleware,
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
