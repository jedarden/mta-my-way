/**
 * Smoke test for the middleware testing module.
 *
 * This test validates that the middleware testing infrastructure is reachable
 * and working through its public entry point:
 * - The `@mta-my-way/shared/testing/middleware` barrel resolves and re-exports
 *   the helpers from `middleware-helpers.ts`
 * - The `executeMiddleware` chain runner composes middleware around a terminal
 *   handler in registration order
 * - The barrel's exports cooperate (request builder feeds the chain runner,
 *   assertion helpers inspect its response)
 *
 * Unit-level coverage lives in `middleware-helpers.test.ts`; this file only
 * proves the structure imports and runs.
 */

import {
  type MiddlewareLike,
  assertHeader,
  createMiddlewareRequest,
  executeMiddleware,
} from "@mta-my-way/shared/testing/middleware";
import { describe, expect, it } from "vitest";

describe("Middleware Testing Infrastructure Smoke Test", () => {
  it("exposes the middleware helpers through the barrel", () => {
    expect(typeof executeMiddleware).toBe("function");
    expect(typeof createMiddlewareRequest).toBe("function");
    expect(typeof assertHeader).toBe("function");
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
});
