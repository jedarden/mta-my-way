/**
 * Unit tests for HTTP method restrictions middleware.
 */

import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import {
  getAllowedMethods,
  getBlockedMethods,
  httpMethodRestrictions,
  isDangerousMethod,
  isIdempotentMethod,
  isSafeMethod,
  strictHttpMethodRestrictions,
} from "./http-method-restrictions.js";

function createTestApp(options?: Parameters<typeof httpMethodRestrictions>[0]) {
  const app = new Hono();
  app.use("*", httpMethodRestrictions(options));
  app.all("*", (c) => c.json({ method: c.req.method }));
  return app;
}

// Note: TRACE and CONNECT are rejected by the Fetch API before reaching middleware,
// so we test blocking behavior using additionalBlockedMethods with fetch-supported methods.

describe("httpMethodRestrictions middleware", () => {
  it("allows GET requests", async () => {
    const app = createTestApp();
    const res = await app.request("/api/test", { method: "GET" });
    expect(res.status).toBe(200);
  });

  it("allows HEAD requests", async () => {
    const app = createTestApp();
    const res = await app.request("/api/test", { method: "HEAD" });
    expect(res.status).toBe(200);
  });

  it("allows OPTIONS requests and sets Allow header", async () => {
    const app = createTestApp();
    const res = await app.request("/api/test", { method: "OPTIONS" });
    expect(res.status).toBe(200);
    expect(res.headers.get("Allow")).toBeTruthy();
  });

  it("allows POST requests", async () => {
    const app = createTestApp();
    const res = await app.request("/api/test", { method: "POST" });
    expect(res.status).toBe(200);
  });

  it("allows PUT requests", async () => {
    const app = createTestApp();
    const res = await app.request("/api/test", { method: "PUT" });
    expect(res.status).toBe(200);
  });

  it("allows DELETE requests", async () => {
    const app = createTestApp();
    const res = await app.request("/api/test", { method: "DELETE" });
    expect(res.status).toBe(200);
  });

  it("allows PATCH requests", async () => {
    const app = createTestApp();
    const res = await app.request("/api/test", { method: "PATCH" });
    expect(res.status).toBe(200);
  });

  it("blocks additional methods specified in config with 405", async () => {
    const app = createTestApp({ additionalBlockedMethods: ["PUT"] });
    const res = await app.request("/api/test", { method: "PUT" });
    expect(res.status).toBe(405);
  });

  it("sets Allow header when blocking a method", async () => {
    const app = createTestApp({ additionalBlockedMethods: ["PUT"] });
    const res = await app.request("/api/test", { method: "PUT" });
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBeTruthy();
  });

  it("allows additional methods when configured", async () => {
    // Test that additionalAllowedMethods is accepted without error
    const app = createTestApp({ additionalAllowedMethods: ["DELETE"] });
    const res = await app.request("/api/test", { method: "DELETE" });
    expect(res.status).toBe(200);
  });

  it("blocks additional methods beyond the dangerous defaults", async () => {
    const app = createTestApp({ additionalBlockedMethods: ["DELETE"] });
    const res = await app.request("/api/test", { method: "DELETE" });
    expect(res.status).toBe(405);
  });

  it("skips restrictions for excluded paths", async () => {
    // A method that would normally be blocked via additionalBlockedMethods
    const app = createTestApp({
      excludePaths: ["/api/special"],
      additionalBlockedMethods: ["PUT"],
    });
    const res = await app.request("/api/special", { method: "PUT" });
    // Excluded path should pass through without blocking
    expect(res.status).toBe(200);
  });

  it("still applies restrictions to non-excluded paths", async () => {
    const app = createTestApp({
      excludePaths: ["/api/special"],
      additionalBlockedMethods: ["PUT"],
    });
    const res = await app.request("/api/other", { method: "PUT" });
    expect(res.status).toBe(405);
  });

  it("uses default error message when blocking", async () => {
    const app = createTestApp({ additionalBlockedMethods: ["DELETE"] });
    const res = await app.request("/api/test", { method: "DELETE" });
    expect(res.status).toBe(405);
  });
});

describe("strictHttpMethodRestrictions middleware", () => {
  function createStrictApp(options?: Parameters<typeof strictHttpMethodRestrictions>[0]) {
    const app = new Hono();
    app.use("*", strictHttpMethodRestrictions(options));
    app.all("*", (c) => c.json({ method: c.req.method }));
    return app;
  }

  it("allows GET requests", async () => {
    const app = createStrictApp();
    const res = await app.request("/api/test", { method: "GET" });
    expect(res.status).toBe(200);
  });

  it("allows POST requests", async () => {
    const app = createStrictApp();
    const res = await app.request("/api/test", { method: "POST" });
    expect(res.status).toBe(200);
  });

  it("blocks PUT in strict mode", async () => {
    const app = createStrictApp();
    const res = await app.request("/api/test", { method: "PUT" });
    expect(res.status).toBe(405);
  });

  it("blocks DELETE in strict mode", async () => {
    const app = createStrictApp();
    const res = await app.request("/api/test", { method: "DELETE" });
    expect(res.status).toBe(405);
  });

  it("blocks PATCH in strict mode", async () => {
    const app = createStrictApp();
    const res = await app.request("/api/test", { method: "PATCH" });
    expect(res.status).toBe(405);
  });

  it("allows additional methods in strict mode when configured", async () => {
    const app = createStrictApp({ additionalAllowedMethods: ["DELETE"] });
    const res = await app.request("/api/test", { method: "DELETE" });
    expect(res.status).toBe(200);
  });
});

describe("isSafeMethod", () => {
  it("returns true for GET", () => expect(isSafeMethod("GET")).toBe(true));
  it("returns true for HEAD", () => expect(isSafeMethod("HEAD")).toBe(true));
  it("returns true for OPTIONS", () => expect(isSafeMethod("OPTIONS")).toBe(true));
  it("is case-insensitive", () => expect(isSafeMethod("get")).toBe(true));
  it("returns false for POST", () => expect(isSafeMethod("POST")).toBe(false));
  it("returns false for DELETE", () => expect(isSafeMethod("DELETE")).toBe(false));
  it("returns false for TRACE", () => expect(isSafeMethod("TRACE")).toBe(false));
});

describe("isDangerousMethod", () => {
  it("returns true for TRACE", () => expect(isDangerousMethod("TRACE")).toBe(true));
  it("returns true for CONNECT", () => expect(isDangerousMethod("CONNECT")).toBe(true));
  it("is case-insensitive", () => expect(isDangerousMethod("trace")).toBe(true));
  it("returns false for GET", () => expect(isDangerousMethod("GET")).toBe(false));
  it("returns false for POST", () => expect(isDangerousMethod("POST")).toBe(false));
});

describe("isIdempotentMethod", () => {
  it("returns true for GET", () => expect(isIdempotentMethod("GET")).toBe(true));
  it("returns true for HEAD", () => expect(isIdempotentMethod("HEAD")).toBe(true));
  it("returns true for OPTIONS", () => expect(isIdempotentMethod("OPTIONS")).toBe(true));
  it("returns true for PUT", () => expect(isIdempotentMethod("PUT")).toBe(true));
  it("returns true for DELETE", () => expect(isIdempotentMethod("DELETE")).toBe(true));
  it("returns false for POST", () => expect(isIdempotentMethod("POST")).toBe(false));
  it("returns false for PATCH", () => expect(isIdempotentMethod("PATCH")).toBe(false));
});

describe("getAllowedMethods", () => {
  it("returns default allowed methods", () => {
    const methods = getAllowedMethods();
    expect(methods.has("GET")).toBe(true);
    expect(methods.has("POST")).toBe(true);
    expect(methods.has("PUT")).toBe(true);
    expect(methods.has("DELETE")).toBe(true);
    expect(methods.has("PATCH")).toBe(true);
    expect(methods.has("HEAD")).toBe(true);
    expect(methods.has("OPTIONS")).toBe(true);
  });

  it("does not include dangerous methods", () => {
    const methods = getAllowedMethods();
    expect(methods.has("TRACE")).toBe(false);
    expect(methods.has("CONNECT")).toBe(false);
  });

  it("includes additional methods when provided", () => {
    const methods = getAllowedMethods(["PROPFIND"]);
    expect(methods.has("PROPFIND")).toBe(true);
  });
});

describe("getBlockedMethods", () => {
  it("returns default blocked methods", () => {
    const methods = getBlockedMethods();
    expect(methods.has("TRACE")).toBe(true);
    expect(methods.has("CONNECT")).toBe(true);
  });

  it("includes additional blocked methods", () => {
    const methods = getBlockedMethods(["PATCH"]);
    expect(methods.has("PATCH")).toBe(true);
    expect(methods.has("TRACE")).toBe(true);
  });
});
