/**
 * Smoke test for the middleware testing module.
 *
 * This test validates that the middleware testing infrastructure is reachable
 * and working through its public entry point:
 * - The `@mta-my-way/shared/testing/middleware` barrel resolves and re-exports
 *   the helpers from every module in the directory
 * - The `executeMiddleware` chain runner composes middleware around a terminal
 *   handler in registration order
 * - The barrel's exports cooperate (request builder feeds the chain runner,
 *   assertion helpers inspect its response), for both the real-`Request` style
 *   and the mock `request`/`response` style
 *
 * Unit-level coverage lives in `middleware-helpers.test.ts`,
 * `mock-chain.test.ts` and `execution-context.test.ts`; this file only proves
 * the structure imports and runs.
 */

import {
  MIDDLEWARE_TEST_PRESETS,
  type MiddlewareLike,
  assertChainOrder,
  assertHeader,
  assertResponseJson,
  assertSecurityHeaders,
  cleanupMiddlewareTest,
  createMiddlewareRequest,
  createMiddlewareTestConfig,
  createMockExecutionContext,
  createMockHttpRequest,
  createMockHttpResponse,
  executeMiddleware,
  runMiddlewareChain,
  setupMiddlewareTest,
} from "@mta-my-way/shared/testing/middleware";
import { describe, expect, it } from "vitest";

describe("Middleware Testing Infrastructure Smoke Test", () => {
  it("exposes the middleware helpers through the barrel", () => {
    expect(typeof executeMiddleware).toBe("function");
    expect(typeof createMiddlewareRequest).toBe("function");
    expect(typeof assertHeader).toBe("function");
    expect(typeof setupMiddlewareTest).toBe("function");
    expect(typeof cleanupMiddlewareTest).toBe("function");
    expect(typeof createMiddlewareTestConfig).toBe("function");
    expect(MIDDLEWARE_TEST_PRESETS.default).toBeDefined();
    expect(MIDDLEWARE_TEST_PRESETS.securityHeaders).toBeDefined();
  });

  it("exposes the mock chain and execution context helpers through the barrel", () => {
    expect(typeof createMockHttpRequest).toBe("function");
    expect(typeof createMockHttpResponse).toBe("function");
    expect(typeof runMiddlewareChain).toBe("function");
    expect(typeof assertChainOrder).toBe("function");
    expect(typeof assertResponseJson).toBe("function");
    expect(typeof createMockExecutionContext).toBe("function");
  });

  it("runs the mock request, response and context builders through the chain", async () => {
    const context = createMockExecutionContext();

    const result = await runMiddlewareChain({
      middleware: [
        {
          name: "readContext",
          middleware: (request, response, next) => {
            response.set("X-Acting-User", request.context?.user.id ?? "anonymous");
            next();
          },
        },
      ],
      request: createMockHttpRequest({
        url: "http://localhost:3001/api/favorites?limit=5",
        params: { stationId: "725" },
        context,
      }),
      handler: (_request, response) => response.status(200).json({ ok: true }),
    });

    assertChainOrder(result, ["readContext", "handler"]);
    assertResponseJson(result.response, { ok: true });
    expect(result.response.getHeader("x-acting-user")).toBe(context.user.id);
    expect(createMockHttpResponse().statusCode).toBe(200);
  });

  it("pairs setup and teardown around a fixture", async () => {
    const fixture = setupMiddlewareTest({
      request: { url: "http://localhost:3001/api/arrivals/725" },
    });

    expect(fixture.request.url).toBe("http://localhost:3001/api/arrivals/725");
    await expect(fixture.run()).resolves.toMatchObject({ status: 200 });

    cleanupMiddlewareTest(fixture);
    await expect(fixture.run()).rejects.toThrow(/torn down/);
  });

  it("runs a middleware chain through the runner to the terminal handler", async () => {
    const order: string[] = [];
    const first: MiddlewareLike = async (_request, next) => {
      order.push("first");
      return next();
    };
    const second: MiddlewareLike = async (_request, next) => {
      order.push("second");
      return next();
    };

    const response = await executeMiddleware([first, second], createMiddlewareRequest(), () => {
      order.push("handler");
      return Promise.resolve(new Response("ok", { headers: { "X-Frame-Options": "DENY" } }));
    });

    expect(order).toEqual(["first", "second", "handler"]);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
  });

  it("supports a short-circuiting middleware built from the barrel's request", async () => {
    const blocked: MiddlewareLike = () => new Response("Forbidden", { status: 403 });

    const response = await executeMiddleware(blocked, createMiddlewareRequest());

    expect(response.status).toBe(403);
    expect(await response.text()).toBe("Forbidden");
  });

  it("assertion helpers accept a response produced by the chain", async () => {
    const checking: MiddlewareLike = (_request, next) =>
      next().then((response) => {
        assertHeader(response, "x-frame-options", "DENY");
        return response;
      });

    const response = await executeMiddleware(checking, createMiddlewareRequest(), () =>
      Promise.resolve(new Response(null, { headers: { "X-Frame-Options": "DENY" } }))
    );

    expect(response.status).toBe(200);
  });

  it("a preset config drives the request builder and the security-header assertion", async () => {
    const config = createMiddlewareTestConfig({}, MIDDLEWARE_TEST_PRESETS.securityHeaders);
    const responding: MiddlewareLike = () =>
      Promise.resolve(
        new Response(null, {
          headers: new Headers(config.securityHeaders.map((name) => [name, "value"])),
        })
      );

    const response = await executeMiddleware(responding, createMiddlewareRequest(config));

    assertSecurityHeaders(response, config.securityHeaders);
    expect(response.status).toBe(200);
  });
});
