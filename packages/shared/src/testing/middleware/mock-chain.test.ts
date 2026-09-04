/**
 * Tests for the Express-style mock request/response helpers and the chain
 * simulator in `mock-chain.ts`.
 *
 * Each builder is tested for its defaults and for how overrides land, and the
 * simulator for the three ways a chain can end: reaching the handler,
 * short-circuiting on a written response, and erroring with and without an
 * error handler.
 */

import {
  ERROR_HANDLER_NAME,
  type MiddlewareChainResult,
  type MockChainEntry,
  type MockExecutionContext,
  TERMINAL_HANDLER_NAME,
  assertChainOrder,
  assertChainReachedHandler,
  assertChainShortCircuited,
  assertResponseJson,
  assertResponseStatus,
  attachContext,
  createMockExecutionContext,
  createMockHttpRequest,
  createMockHttpResponse,
  runMiddlewareChain,
} from "@mta-my-way/shared/testing/middleware";
import { describe, expect, it, vi } from "vitest";

/** A named layer that only calls `next()`, for building a chain to assert on. */
const passing = (name: string): MockChainEntry => ({
  name,
  middleware: (_request, _response, next) => {
    next();
  },
});

describe("createMockHttpRequest", () => {
  it("defaults to a JSON GET against the standard test URL", () => {
    const request = createMockHttpRequest();

    expect(request.method).toBe("GET");
    expect(request.url).toBe("http://localhost:3001/api/test");
    expect(request.path).toBe("/api/test");
    expect(request.header("content-type")).toBe("application/json");
    expect(request.get("user-agent")).toBe("test-agent");
    expect(request.ip).toBe("127.0.0.1");
  });

  it("carries headers case-insensitively through both accessors", () => {
    const request = createMockHttpRequest({
      headers: { "X-Request-Id": "abc-123" },
    });

    expect(request.header("x-request-id")).toBe("abc-123");
    expect(request.get("X-REQUEST-ID")).toBe("abc-123");
  });

  it("reports an absent header as undefined", () => {
    expect(createMockHttpRequest().header("authorization")).toBeUndefined();
  });

  it("parses query parameters out of the URL", () => {
    const request = createMockHttpRequest({
      url: "http://localhost:3001/api/arrivals/725?limit=5&direction=north",
    });

    expect(request.query).toEqual({ limit: "5", direction: "north" });
  });

  it("lets an explicit query override one parsed from the URL", () => {
    const request = createMockHttpRequest({
      url: "http://localhost:3001/api/arrivals/725?limit=5",
      query: { limit: "50" },
    });

    expect(request.query).toEqual({ limit: "50" });
  });

  it("carries route params the router would have matched", () => {
    const request = createMockHttpRequest({
      url: "http://localhost:3001/api/arrivals/725",
      params: { stationId: "725" },
    });

    expect(request.params).toEqual({ stationId: "725" });
    expect(createMockHttpRequest().params).toEqual({});
  });

  it("serves an object body as both parsed JSON and text", async () => {
    const request = createMockHttpRequest({
      method: "POST",
      body: { stationId: "725" },
    });

    expect(request.body).toEqual({ stationId: "725" });
    await expect(request.json()).resolves.toEqual({ stationId: "725" });
    await expect(request.text()).resolves.toBe('{"stationId":"725"}');
  });

  it("parses a raw string body on demand", async () => {
    const request = createMockHttpRequest({
      method: "POST",
      body: '{"stationId":"725"}',
    });

    expect(request.body).toBe('{"stationId":"725"}');
    await expect(request.json()).resolves.toEqual({ stationId: "725" });
    await expect(request.text()).resolves.toBe('{"stationId":"725"}');
  });

  it("upper-cases the method", () => {
    expect(createMockHttpRequest({ method: "post" }).method).toBe("POST");
  });

  it("refuses a body on a method that cannot carry one", () => {
    expect(() => createMockHttpRequest({ method: "GET", body: { id: 1 } })).toThrow(
      /cannot carry a body/
    );
  });

  it("carries cookies", () => {
    const request = createMockHttpRequest({ cookies: { session: "abc" } });

    expect(request.cookies).toEqual({ session: "abc" });
  });

  it("carries an execution context when one is given", () => {
    const context = createMockExecutionContext();
    const request = createMockHttpRequest({ context });

    expect(request.context).toBe(context);
  });
});

describe("attachContext", () => {
  it("stamps the context on the request in place", () => {
    const request = createMockHttpRequest({ params: { stationId: "725" } });
    const context = createMockExecutionContext();

    const returned = attachContext(request, context);

    expect(returned).toBe(request);
    expect(request.context).toBe(context);
    expect(request.params).toEqual({ stationId: "725" });
  });

  it("replaces a context that was already attached", () => {
    const request = createMockHttpRequest({ context: createMockExecutionContext() });
    const next = createMockExecutionContext();

    attachContext(request, next);

    expect(request.context).toBe(next);
  });
});

describe("createMockHttpResponse", () => {
  it("starts at status 200 with nothing written", () => {
    const response = createMockHttpResponse();

    expect(response.statusCode).toBe(200);
    expect(response.ended).toBe(false);
    expect(response.body).toBeUndefined();
    expect(response.calls).toEqual([]);
  });

  it("records the status and stays chainable", () => {
    const response = createMockHttpResponse();

    const returned = response.status(403).json({ error: "forbidden" });

    expect(returned).toBe(response);
    expect(response.statusCode).toBe(403);
    expect(response.status).toHaveBeenCalledWith(403);
  });

  it("records a JSON payload and closes the response", () => {
    const response = createMockHttpResponse();

    response.json({ favorites: [] });

    expect(response.json).toHaveBeenCalledTimes(1);
    expect(response.jsonBody).toEqual({ favorites: [] });
    expect(response.body).toEqual({ favorites: [] });
    expect(response.sentBody).toBeUndefined();
    expect(response.ended).toBe(true);
    expect(response.calls).toEqual([{ method: "json", args: [{ favorites: [] }] }]);
  });

  it("records a send body separately from a JSON payload", () => {
    const response = createMockHttpResponse();

    response.send("ok");

    expect(response.send).toHaveBeenCalledWith("ok");
    expect(response.sentBody).toBe("ok");
    expect(response.body).toBe("ok");
    expect(response.jsonBody).toBeUndefined();
  });

  it("records headers under both spellings", () => {
    const response = createMockHttpResponse();

    response.set("X-RateLimit-Remaining", "9").setHeader("Retry-After", "30");

    expect(response.headers).toEqual({ "X-RateLimit-Remaining": "9", "Retry-After": "30" });
    expect(response.set).toHaveBeenCalledWith("X-RateLimit-Remaining", "9");
    expect(response.setHeader).toHaveBeenCalledWith("Retry-After", "30");
  });

  it("looks headers up case-insensitively", () => {
    const response = createMockHttpResponse();

    response.set("Content-Type", "application/json");

    expect(response.getHeader("content-type")).toBe("application/json");
    expect(response.getHeader("CONTENT-TYPE")).toBe("application/json");
    expect(response.getHeader("absent")).toBeUndefined();
  });

  it("records end and closes the response", () => {
    const response = createMockHttpResponse();

    response.status(204).end();

    expect(response.end).toHaveBeenCalledTimes(1);
    expect(response.statusCode).toBe(204);
    expect(response.ended).toBe(true);
    expect(response.calls.map((call) => call.method)).toEqual(["status", "end"]);
  });

  it("reports every call in order", () => {
    const response = createMockHttpResponse();

    response.status(201).set("Location", "/api/trips/1").json({ id: "1" });

    expect(response.calls).toEqual([
      { method: "status", args: [201] },
      { method: "set", args: ["Location", "/api/trips/1"] },
      { method: "json", args: [{ id: "1" }] },
    ]);
  });
});

describe("runMiddlewareChain", () => {
  it("runs the chain in registration order to the terminal handler", async () => {
    const handler = vi.fn((_request, response) => {
      response.json({ ok: true });
    });

    const result = await runMiddlewareChain({
      middleware: [passing("first"), passing("second"), passing("third")],
      handler,
    });

    assertChainOrder(result, ["first", "second", "third", TERMINAL_HANDLER_NAME]);
    expect(handler).toHaveBeenCalledTimes(1);
    assertChainReachedHandler(result);
    assertResponseJson(result.response, { ok: true });
  });

  it("builds its own request and response when none are supplied", async () => {
    const result = await runMiddlewareChain({ middleware: [] });

    expect(result.request.method).toBe("GET");
    expect(result.response.statusCode).toBe(200);
    assertChainReachedHandler(result);
  });

  it("falls back to an empty JSON 200 handler", async () => {
    const result = await runMiddlewareChain({ middleware: [] });

    expect(result.response.jsonBody).toEqual({});
  });

  it("stops the chain when a middleware writes the response", async () => {
    const downstream = vi.fn((_request, _response, next) => {
      next();
    });

    const result = await runMiddlewareChain({
      middleware: [
        {
          name: "requireAdmin",
          middleware: (request, response, next) => {
            if (request.header("authorization") === undefined) {
              response.status(403).json({ error: "forbidden" });
              return;
            }
            next();
          },
        },
        { name: "downstream", middleware: downstream },
      ],
      handler: (_request, response) => response.json({ ok: true }),
    });

    assertChainShortCircuited(result, 403);
    assertResponseJson(result.response, { error: "forbidden" });
    expect(downstream).not.toHaveBeenCalled();
    expect(result.order).toEqual(["requireAdmin"]);
  });

  it("records which layers called next", async () => {
    const result = await runMiddlewareChain({
      middleware: [
        passing("passes"),
        {
          name: "writes",
          middleware: (_request, response) => {
            response.json({});
          },
        },
      ],
    });

    expect(result.invocations).toEqual([
      { name: "passes", index: 0, calledNext: true },
      { name: "writes", index: 1, calledNext: false },
    ]);
  });

  it("passes an error to the error handler, skipping the rest of the chain", async () => {
    const downstream = vi.fn((_request, _response, next) => {
      next();
    });
    const errorHandler = vi.fn((_error, _request, response) => {
      response.status(500).json({ error: "internal" });
    });

    const result = await runMiddlewareChain({
      middleware: [
        {
          name: "throws",
          middleware: (_request, _response, next) => {
            next(new Error("session expired"));
          },
        },
        { name: "downstream", middleware: downstream },
      ],
      handler: (_request, response) => response.json({ ok: true }),
      errorHandler,
    });

    expect(errorHandler).toHaveBeenCalledTimes(1);
    expect(downstream).not.toHaveBeenCalled();
    assertChainOrder(result, ["throws", ERROR_HANDLER_NAME]);
    assertChainShortCircuited(result, 500);
    expect(result.error).toBeUndefined();
  });

  it("reports an error that has no error handler instead of throwing", async () => {
    const result = await runMiddlewareChain({
      middleware: [
        {
          name: "throws",
          middleware: (_request, _response, next) => {
            next(new Error("session expired"));
          },
        },
      ],
    });

    expect(result.reachedHandler).toBe(false);
    expect(result.error).toBeInstanceOf(Error);
    expect((result.error as Error).message).toBe("session expired");
    expect(result.response.ended).toBe(false);
  });

  it("throws when a layer calls next more than once", async () => {
    const result = runMiddlewareChain({
      middleware: [
        {
          name: "double",
          middleware: async (_request, _response, next) => {
            await next();
            await next();
          },
        },
      ],
    });

    await expect(result).rejects.toThrow(/more than once/);
  });

  it("runs await-able middleware to completion before the handler", async () => {
    const steps: string[] = [];

    const result = await runMiddlewareChain({
      middleware: [
        {
          name: "async",
          middleware: async (_request, _response, next) => {
            await Promise.resolve();
            steps.push("async-done");
            next();
          },
        },
      ],
      handler: (_request, response) => {
        steps.push("handler");
        response.json({});
      },
    });

    expect(steps).toEqual(["async-done", "handler"]);
    assertChainReachedHandler(result);
  });

  it("names anonymous middleware by position", async () => {
    const result = await runMiddlewareChain({
      middleware: [
        (_request, _response, next) => {
          next();
        },
      ],
    });

    expect(result.order).toEqual(["middleware[0]", TERMINAL_HANDLER_NAME]);
  });

  it("accepts a request built by the mock builder", async () => {
    const seen: string[] = [];

    const result = await runMiddlewareChain({
      middleware: [
        {
          name: "read",
          middleware: (request, response, next) => {
            seen.push(`${request.params.stationId}:${request.query.limit}`);
            next();
          },
        },
      ],
      request: createMockHttpRequest({
        url: "http://localhost:3001/api/arrivals/725?limit=5",
        params: { stationId: "725" },
      }),
    });

    expect(seen).toEqual(["725:5"]);
    assertChainReachedHandler(result);
  });

  it("keeps the chain from running after a written response even when next is called", async () => {
    const downstream = vi.fn((_request, _response, next) => {
      next();
    });

    const result = await runMiddlewareChain({
      middleware: [
        {
          name: "writes-then-next",
          middleware: (_request, response, next) => {
            response.json({ cached: true });
            next();
          },
        },
        { name: "downstream", middleware: downstream },
      ],
    });

    expect(downstream).not.toHaveBeenCalled();
    assertChainShortCircuited(result);
    assertResponseJson(result.response, { cached: true });
  });
});

describe("assertion helpers", () => {
  const passingChain = (): Promise<MiddlewareChainResult> =>
    runMiddlewareChain({
      middleware: [(_request, _response, next) => next()],
      handler: (_request, response) => response.status(200).json({ ok: true }),
    });

  it("assertChainOrder names the first position that differs", async () => {
    const result = await runMiddlewareChain({ middleware: [passing("first"), passing("second")] });

    expect(() => assertChainOrder(result, ["second", "first", "handler"])).toThrow(
      /position 0.*"second".*"first"/
    );
  });

  it("assertChainOrder reports a longer chain than ran", async () => {
    const result = await runMiddlewareChain({ middleware: [passing("only")] });

    expect(() => assertChainOrder(result, ["only", "handler", "never-ran"])).toThrow(
      /Expected 3 layers.*2 did/
    );
  });

  it("assertChainOrder reports a shorter chain than expected", async () => {
    const result = await runMiddlewareChain({ middleware: [passing("only"), passing("extra")] });

    expect(() => assertChainOrder(result, ["only"])).toThrow(/Expected 1 layers.*3 did/);
  });

  it("assertChainReachedHandler names what stopped the chain", async () => {
    const result = await runMiddlewareChain({
      middleware: [
        {
          name: "blocker",
          middleware: (_request, response) => {
            response.status(429).send("slow down");
          },
        },
      ],
    });

    expect(() => assertChainReachedHandler(result)).toThrow(/blocker/);
  });

  it("assertChainShortCircuited rejects a chain that reached the handler", async () => {
    const result = await passingChain();

    expect(() => assertChainShortCircuited(result)).toThrow(/reached its terminal handler/);
  });

  it("assertChainShortCircuited checks the status when one is expected", async () => {
    const result = await runMiddlewareChain({
      middleware: [
        {
          name: "blocker",
          middleware: (_request, response) => {
            response.status(401).json({ error: "unauthorized" });
          },
        },
      ],
    });

    expect(() => assertChainShortCircuited(result, 403)).toThrow(/respond 403, got 401/);
    expect(() => assertChainShortCircuited(result, 401)).not.toThrow();
  });

  it("assertChainShortCircuited requires a written response when checking a status", async () => {
    const result = await runMiddlewareChain({
      middleware: [
        {
          name: "errors",
          middleware: (_request, _response, next) => {
            next(new Error("no handler for this"));
          },
        },
      ],
    });

    expect(() => assertChainShortCircuited(result, 500)).toThrow(/nothing was written/);
  });

  it("assertResponseStatus reports the actual status", async () => {
    const result = await passingChain();

    expect(() => assertResponseStatus(result.response, 500)).toThrow(/got 200/);
    assertResponseStatus(result.response, 200);
  });

  it("assertResponseJson diffs the payload", async () => {
    const result = await passingChain();

    expect(() => assertResponseJson(result.response, { ok: false })).toThrow();
    assertResponseJson(result.response, { ok: true });
  });
});

describe("barrel integration", () => {
  it("composes the request, response, context builders and the chain runner", async () => {
    const context: MockExecutionContext = createMockExecutionContext({
      user: { role: "admin", roles: ["admin"] },
      audit: { action: "admin:purge_cache", category: "admin" },
    });
    const auditWrite = vi.fn((request) => request.context?.audit.action);

    const result = await runMiddlewareChain({
      middleware: [
        {
          name: "audit",
          middleware: (request, response, next) => {
            auditWrite(request);
            response.set("X-Acting-User", request.context?.user.id ?? "anonymous");
            next();
          },
        },
      ],
      request: createMockHttpRequest({ method: "POST", context }),
      handler: (_request, response) => response.status(201).json({ purged: true }),
    });

    expect(auditWrite).toHaveReturnedWith("admin:purge_cache");
    assertChainOrder(result, ["audit", TERMINAL_HANDLER_NAME]);
    assertResponseStatus(result.response, 201);
    assertResponseJson(result.response, { purged: true });
    expect(result.response.getHeader("x-acting-user")).toBe(context.user.id);
  });
});
