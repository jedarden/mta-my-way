/**
 * Middleware execution order integration tests.
 *
 * Explicitly verifies that middleware executes in the correct order and
 * interacts properly through the request pipeline. These tests instrument
 * middleware execution to validate the sequence and dependencies.
 *
 * Tests verify:
 * - Middleware executes in the documented order from app.ts
 * - Each middleware passes control to the next correctly
 * - Short-circuit behavior (e.g., auth fails before authz runs)
 * - Context/state propagation between middleware
 * - Happy-path through the full chain
 */

import { beforeEach, describe, expect, it } from "vitest";
import { Hono } from "hono";
import type { Context, Next } from "hono";
import {
  securityHeaders,
  requestId,
  rateLimiter,
  inputSanitization,
  csrfProtection,
  optionalAuth,
  sessionSecurity,
  httpMethodRestrictions,
  httpRequestSmuggling,
  httpResponseSplitting,
  hostHeaderProtection,
  requestSizeLimits,
  pathTraversalPrevention,
  ssrfProtection,
  validateContentType,
  jsonDepthProtection,
  hppProtection,
  openRedirectProtection,
  responseSizeLimits,
} from "../middleware/index.js";
import { setRateLimiterTestMode } from "../test/setup.js";

// ---------------------------------------------------------------------------
// Test instrumentation
// ----------------------------------------------------------------------------

/** Execution log for tracking middleware order */
type ExecutionLogEntry = {
  middlewareName: string;
  timestamp: number;
  phase: "before" | "after" | "error";
  contextData?: Record<string, unknown>;
};

/** Global execution log for testing */
let executionLog: ExecutionLogEntry[] = [];

/** Clear the execution log */
function clearExecutionLog(): void {
  executionLog = [];
}

/** Get the execution log */
function getExecutionLog(): ExecutionLogEntry[] {
  return [...executionLog];
}

/**
 * Create an instrumented middleware wrapper that logs execution.
 *
 * @param name - Name of the middleware for logging
 * @param middleware - The actual middleware function
 * @returns Instrumented middleware
 */
function instrumentMiddleware(
  name: string,
  middleware: (c: Context, next: Next) => Promise<void> | void
): (c: Context, next: Next) => Promise<void> {
  return async (c: Context, next: Next) => {
    const startTime = Date.now();
    executionLog.push({
      middlewareName: name,
      timestamp: startTime,
      phase: "before",
    });

    try {
      await middleware(c, next);

      executionLog.push({
        middlewareName: name,
        timestamp: Date.now(),
        phase: "after",
      });
    } catch (error) {
      executionLog.push({
        middlewareName: name,
        timestamp: Date.now(),
        phase: "error",
        contextData: { error: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  };
}

/**
 * Verify the execution order matches expectations.
 *
 * @param expectedOrder - Array of middleware names in expected order
 * @param actualLog - Actual execution log
 * @param phase - Which phase to check ("before" or "after")
 */
function verifyExecutionOrder(
  expectedOrder: string[],
  actualLog: ExecutionLogEntry[],
  phase: "before" | "after" = "before"
): void {
  const phaseLog = actualLog.filter((entry) => entry.phase === phase);
  const actualOrder = phaseLog.map((entry) => entry.middlewareName);

  // Check that all expected middleware ran
  expectedOrder.forEach((expectedName) => {
    expect(actualOrder).toContain(expectedName);
  });

  // Check that the order matches
  expectedOrder.forEach((expectedName, index) => {
    const actualIndex = actualOrder.indexOf(expectedName);
    expect(actualIndex).toBeGreaterThanOrEqual(0);

    // Verify this middleware ran after the previous one in the sequence
    if (index > 0) {
      const previousName = expectedOrder[index - 1];
      const previousIndex = actualOrder.indexOf(previousName);
      expect(actualIndex).toBeGreaterThan(previousIndex);
    }
  });
}

// ---------------------------------------------------------------------------
// Test suites
// ----------------------------------------------------------------------------

describe("Middleware Execution Order", () => {
  beforeEach(() => {
    clearExecutionLog();
    setRateLimiterTestMode(true);
  });

  describe("Global Infrastructure Middleware Order", () => {
    it("should execute global middleware in the correct order", async () => {
      const app = new Hono();

      // Register middleware in the documented order from app.ts
      app.use("*", instrumentMiddleware("requestId", requestId));
      app.use("*", instrumentMiddleware("securityHeaders", securityHeaders({ reportUri: "/api/security/csp-report" })));
      app.use("*", instrumentMiddleware("httpMethodRestrictions", httpMethodRestrictions()));
      app.use("*", instrumentMiddleware("httpRequestSmuggling", httpRequestSmuggling()));
      app.use("*", instrumentMiddleware("httpResponseSplitting", httpResponseSplitting()));
      app.use("*", instrumentMiddleware("hostHeaderProtection", hostHeaderProtection({ allowedHosts: ["localhost", "example.com"] })));
      app.use("*", instrumentMiddleware("requestSizeLimits", requestSizeLimits()));
      app.use("*", instrumentMiddleware("pathTraversalPrevention", pathTraversalPrevention()));

      // Add a simple handler
      app.get("/test", (c) => c.json({ status: "ok" }));

      // Make a request
      const response = await app.request("/test");

      expect(response.status).toBe(200);

      // Verify execution order
      const expectedOrder = [
        "requestId",
        "securityHeaders",
        "httpMethodRestrictions",
        "httpRequestSmuggling",
        "httpResponseSplitting",
        "hostHeaderProtection",
        "requestSizeLimits",
        "pathTraversalPrevention",
      ];

      verifyExecutionOrder(expectedOrder, getExecutionLog(), "before");

      // Verify all middleware completed successfully (after phase)
      verifyExecutionOrder(expectedOrder, getExecutionLog(), "after");
    });

    it("should pass control from each middleware to the next", async () => {
      const app = new Hono();
      let executionCount = 0;

      app.use("*", instrumentMiddleware("middleware1", async (_c, next) => {
        executionCount++;
        await next();
      }));

      app.use("*", instrumentMiddleware("middleware2", async (_c, next) => {
        executionCount++;
        await next();
      }));

      app.use("*", instrumentMiddleware("middleware3", async (_c, next) => {
        executionCount++;
        await next();
      }));

      app.get("/test", (c) => c.json({ count: executionCount }));

      const response = await app.request("/test");

      expect(response.status).toBe(200);
      expect(executionCount).toBe(3);

      const body = await response.json();
      expect(body.count).toBe(3);
    });
  });

  describe("API-Specific Middleware Order", () => {
    it("should execute API middleware in the correct order", async () => {
      const app = new Hono();

      // Global middleware first
      app.use("*", instrumentMiddleware("requestId", requestId));

      // API-specific middleware in documented order
      app.use("/api/*", instrumentMiddleware("inputSanitization", inputSanitization()));
      app.use("/api/*", instrumentMiddleware("ssrfProtection", ssrfProtection()));
      app.use("/api/*", instrumentMiddleware("validateContentType", validateContentType()));
      app.use("/api/*", instrumentMiddleware("jsonDepthProtection", jsonDepthProtection()));
      app.use("/api/*", instrumentMiddleware("hppProtection", hppProtection({ strategy: "first" })));
      app.use("/api/*", instrumentMiddleware("openRedirectProtection", openRedirectProtection()));
      app.use("/api/*", instrumentMiddleware("responseSizeLimits", responseSizeLimits()));

      // Add a simple handler
      app.get("/api/test", (c) => c.json({ status: "ok" }));

      // Make a request
      const response = await app.request("/api/test");

      expect(response.status).toBe(200);

      // Verify execution order for API middleware
      const expectedOrder = [
        "requestId",
        "inputSanitization",
        "ssrfProtection",
        "validateContentType",
        "jsonDepthProtection",
        "hppProtection",
        "openRedirectProtection",
        "responseSizeLimits",
      ];

      verifyExecutionOrder(expectedOrder, getExecutionLog(), "before");
    });
  });

  describe("Authentication to Authorization Flow", () => {
    it("should execute authentication before authorization", async () => {
      const app = new Hono();

      let authRan = false;
      let authzRan = false;

      app.use("/api/*", instrumentMiddleware("authentication", async (c, next) => {
        authRan = true;
        // Set auth context
        c.set("authContext", { userId: "test-user" });
        await next();
      }));

      app.use("/api/*", instrumentMiddleware("authorization", async (c, next) => {
        authzRan = true;
        // Check auth context exists
        const authContext = c.get("authContext");
        if (!authContext) {
          return c.json({ error: "Unauthorized" }, 401);
        }
        await next();
      }));

      app.get("/api/test", (c) => c.json({ status: "ok" }));

      const response = await app.request("/api/test");

      expect(response.status).toBe(200);
      expect(authRan).toBe(true);
      expect(authzRan).toBe(true);

      // Verify execution order
      const log = getExecutionLog();
      const authIndex = log.findIndex((e) => e.middlewareName === "authentication" && e.phase === "before");
      const authzIndex = log.findIndex((e) => e.middlewareName === "authorization" && e.phase === "before");

      expect(authIndex).toBeGreaterThanOrEqual(0);
      expect(authzIndex).toBeGreaterThanOrEqual(0);
      expect(authzIndex).toBeGreaterThan(authIndex);
    });

    it("should short-circuit when authentication fails", async () => {
      const app = new Hono();

      let authRan = false;
      let authzRan = false;

      app.use("/api/*", instrumentMiddleware("authentication", async (c, next) => {
        authRan = true;
        // Simulate authentication failure
        return c.json({ error: "Invalid credentials" }, 401);
      }));

      app.use("/api/*", instrumentMiddleware("authorization", async (_c, next) => {
        authzRan = true;
        await next();
      }));

      app.get("/api/test", (c) => c.json({ status: "ok" }));

      const response = await app.request("/api/test");

      expect(response.status).toBe(401);
      expect(authRan).toBe(true);
      expect(authzRan).toBe(false); // Authorization should not run

      // Verify authentication ran but authorization did not
      const log = getExecutionLog();
      expect(log.some((e) => e.middlewareName === "authentication" && e.phase === "before")).toBe(true);
      expect(log.some((e) => e.middlewareName === "authorization" && e.phase === "before")).toBe(false);
    });
  });

  describe("Context Propagation Between Middleware", () => {
    it("should allow middleware to share context via request state", async () => {
      const app = new Hono();

      app.use("*", instrumentMiddleware("setContext", async (c, next) => {
        c.set("testValue", "middleware-data");
        c.set("requestId", "test-123");
        await next();
      }));

      app.use("*", instrumentMiddleware("readContext", async (c, next) => {
        const testValue = c.get("testValue");
        const requestId = c.get("requestId");

        if (testValue && requestId) {
          c.set("contextRead", true);
          c.set("readValues", { testValue, requestId });
        }
        await next();
      }));

      app.get("/test", (c) => {
        const contextRead = c.get("contextRead");
        const readValues = c.get("readValues");
        return c.json({ contextRead, readValues });
      });

      const response = await app.request("/test");

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.contextRead).toBe(true);
      expect(body.readValues).toEqual({
        testValue: "middleware-data",
        requestId: "test-123",
      });
    });

    it("should propagate context through the full middleware chain", async () => {
      const app = new Hono();

      app.use("*", instrumentMiddleware("middleware1", async (c, next) => {
        c.set("middleware1Data", { value: "data1" });
        await next();
      }));

      app.use("*", instrumentMiddleware("middleware2", async (c, next) => {
        const data1 = c.get("middleware1Data");
        c.set("middleware2Data", { value: "data2", previous: data1 });
        await next();
      }));

      app.use("*", instrumentMiddleware("middleware3", async (c, next) => {
        const data1 = c.get("middleware1Data");
        const data2 = c.get("middleware2Data");
        c.set("middleware3Data", { value: "data3", chain: [data1, data2] });
        await next();
      }));

      app.get("/test", (c) => {
        const data1 = c.get("middleware1Data");
        const data2 = c.get("middleware2Data");
        const data3 = c.get("middleware3Data");
        return c.json({ data1, data2, data3 });
      });

      const response = await app.request("/test");

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.data1).toEqual({ value: "data1" });
      expect(body.data2).toEqual({ value: "data2", previous: { value: "data1" } });
      expect(body.data3).toEqual({
        value: "data3",
        chain: [{ value: "data1" }, { value: "data2", previous: { value: "data1" } }],
      });
    });
  });

  describe("Security Headers Position in Pipeline", () => {
    it("should apply security headers before rate limiting", async () => {
      const app = new Hono();

      app.use("*", instrumentMiddleware("securityHeaders", securityHeaders({ reportUri: "/api/security/csp-report" })));
      app.use("*", instrumentMiddleware("rateLimiter", rateLimiter()));

      app.get("/test", (c) => c.json({ status: "ok" }));

      const response = await app.request("/test");

      expect(response.status).toBe(200);

      // Verify security headers are present
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("x-frame-options")).toBe("DENY");
      expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");

      // Verify execution order
      const log = getExecutionLog();
      const securityIndex = log.findIndex((e) => e.middlewareName === "securityHeaders" && e.phase === "before");
      const rateLimitIndex = log.findIndex((e) => e.middlewareName === "rateLimiter" && e.phase === "before");

      expect(securityIndex).toBeGreaterThanOrEqual(0);
      expect(rateLimitIndex).toBeGreaterThanOrEqual(0);
      expect(rateLimitIndex).toBeGreaterThan(securityIndex);
    });
  });

  describe("Input Sanitization Position in Pipeline", () => {
    it("should apply input sanitization before business logic", async () => {
      const app = new Hono();

      let sanitizationRan = false;
      let businessLogicRan = false;

      app.use("/api/*", instrumentMiddleware("inputSanitization", async (c, next) => {
        sanitizationRan = true;
        // Sanitize input
        const query = c.req.query();
        if (query.q) {
          // Store sanitized value
          c.set("sanitizedQuery", query.q.replace(/[<>]/g, ""));
        }
        await next();
      }));

      app.get("/api/test", (c) => {
        businessLogicRan = true;
        const sanitizedQuery = c.get("sanitizedQuery");
        return c.json({ sanitizedQuery });
      });

      const response = await app.request("/api/test?q=<script>alert('xss')</script>");

      expect(response.status).toBe(200);
      expect(sanitizationRan).toBe(true);
      expect(businessLogicRan).toBe(true);

      const body = await response.json();
      // Verify sanitization occurred
      expect(body.sanitizedQuery).not.toContain("<");
      expect(body.sanitizedQuery).not.toContain(">");

      // Verify execution order
      const log = getExecutionLog();
      const sanitizationIndex = log.findIndex((e) => e.middlewareName === "inputSanitization" && e.phase === "before");
      expect(sanitizationIndex).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Happy Path Through Full Chain", () => {
    it("should successfully process request through complete middleware chain", async () => {
      const app = new Hono();

      // Simulate the full middleware chain from app.ts
      app.use("*", instrumentMiddleware("requestId", requestId));
      app.use("*", instrumentMiddleware("securityHeaders", securityHeaders({ reportUri: "/api/security/csp-report" })));
      app.use("*", instrumentMiddleware("httpMethodRestrictions", httpMethodRestrictions()));
      app.use("*", instrumentMiddleware("requestSizeLimits", requestSizeLimits()));
      app.use("*", instrumentMiddleware("pathTraversalPrevention", pathTraversalPrevention()));
      app.use("/api/*", instrumentMiddleware("inputSanitization", inputSanitization()));
      app.use("/api/*", instrumentMiddleware("ssrfProtection", ssrfProtection()));
      app.use("/api/*", instrumentMiddleware("validateContentType", validateContentType()));
      app.use("/api/*", instrumentMiddleware("jsonDepthProtection", jsonDepthProtection()));
      app.use("/api/*", instrumentMiddleware("hppProtection", hppProtection({ strategy: "first" })));
      app.use("/api/*", instrumentMiddleware("openRedirectProtection", openRedirectProtection()));
      app.use("/api/*", instrumentMiddleware("responseSizeLimits", responseSizeLimits()));

      app.get("/api/test", (c) => c.json({ status: "ok", message: "Success" }));

      const response = await app.request("/api/test");

      expect(response.status).toBe(200);

      // Verify all middleware ran
      const log = getExecutionLog();
      const beforePhases = log.filter((e) => e.phase === "before");
      const afterPhases = log.filter((e) => e.phase === "after");

      // All middleware should have before and after phases (no errors)
      expect(beforePhases.length).toBe(afterPhases.length);
      expect(log.some((e) => e.phase === "error")).toBe(false);

      // Verify security headers in response
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("x-frame-options")).toBe("DENY");
    });

    it("should maintain request context through entire chain", async () => {
      const app = new Hono();

      let requestIdValue: string | undefined;

      app.use("*", instrumentMiddleware("requestId", async (c, next) => {
        const requestId = c.get("requestId");
        if (requestId) {
          requestIdValue = requestId;
          c.set("originalRequestId", requestId);
        }
        await next();
      }));

      app.use("*", instrumentMiddleware("securityHeaders", async (c, next) => {
        const originalId = c.get("originalRequestId");
        expect(originalId).toBeDefined();
        await next();
      }));

      app.use("*", instrumentMiddleware("httpMethodRestrictions", async (c, next) => {
        const originalId = c.get("originalRequestId");
        expect(originalId).toBeDefined();
        await next();
      }));

      app.get("/test", (c) => {
        const originalId = c.get("originalRequestId");
        return c.json({ originalRequestId: originalId });
      });

      const response = await app.request("/test");

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.originalRequestId).toBeDefined();
      expect(requestIdValue).toBeDefined();
    });
  });

  describe("Error Handling and Short-Circuit Scenarios", () => {
    it("should stop middleware chain on early rejection", async () => {
      const app = new Hono();

      let middleware1Ran = false;
      let middleware2Ran = false;
      let middleware3Ran = false;

      app.use("*", instrumentMiddleware("middleware1", async (_c, next) => {
        middleware1Ran = true;
        await next();
      }));

      app.use("*", instrumentMiddleware("middleware2", async (_c, _next) => {
        middleware2Ran = true;
        // Short-circuit: don't call next()
        return new Response("Stopped at middleware2", { status: 403 });
      }));

      app.use("*", instrumentMiddleware("middleware3", async (_c, next) => {
        middleware3Ran = true;
        await next();
      }));

      app.get("/test", (c) => c.json({ status: "ok" }));

      const response = await app.request("/test");

      expect(response.status).toBe(403);
      expect(middleware1Ran).toBe(true);
      expect(middleware2Ran).toBe(true);
      expect(middleware3Ran).toBe(false); // Should not run
    });

    it("should handle middleware errors gracefully", async () => {
      const app = new Hono();

      let middleware1Ran = false;
      let middleware2Ran = false;
      let middleware3Ran = false;

      app.use("*", instrumentMiddleware("middleware1", async (_c, next) => {
        middleware1Ran = true;
        await next();
      }));

      app.use("*", instrumentMiddleware("middleware2", async (_c, _next) => {
        middleware2Ran = true;
        throw new Error("Middleware error");
      }));

      app.use("*", instrumentMiddleware("middleware3", async (_c, next) => {
        middleware3Ran = true;
        await next();
      }));

      app.get("/test", (c) => c.json({ status: "ok" }));

      const response = await app.request("/test");

      // Response should be an error (500 or similar)
      expect([500, 502]).toContain(response.status);
      expect(middleware1Ran).toBe(true);
      expect(middleware2Ran).toBe(true);
      expect(middleware3Ran).toBe(false); // Should not run after error

      // Verify error was logged
      const log = getExecutionLog();
      expect(log.some((e) => e.middlewareName === "middleware2" && e.phase === "error")).toBe(true);
    });
  });

  describe("Middleware Dependencies and Ordering", () => {
    it("should ensure requestId runs before logging middleware", async () => {
      const app = new Hono();

      let requestIdSet = false;
      let loggingRan = false;

      app.use("*", instrumentMiddleware("requestId", async (c, next) => {
        requestIdSet = !!c.get("requestId");
        await next();
      }));

      app.use("*", instrumentMiddleware("logging", async (c, next) => {
        loggingRan = true;
        // Logging should have requestId available
        expect(requestIdSet).toBe(true);
        await next();
      }));

      app.get("/test", (c) => c.json({ status: "ok" }));

      const response = await app.request("/test");

      expect(response.status).toBe(200);
      expect(requestIdSet).toBe(true);
      expect(loggingRan).toBe(true);
    });

    it("should ensure input sanitization runs before validation", async () => {
      const app = new Hono();

      let sanitizationRan = false;
      let validationRan = false;

      app.use("/api/*", instrumentMiddleware("inputSanitization", async (c, next) => {
        sanitizationRan = true;
        const query = c.req.query();
        if (query.q) {
          c.set("sanitizedQuery", query.q.trim());
        }
        await next();
      }));

      app.use("/api/*", instrumentMiddleware("validation", async (c, next) => {
        validationRan = true;
        const sanitizedQuery = c.get("sanitizedQuery");
        expect(sanitizedQuery).toBeDefined();
        await next();
      }));

      app.get("/api/test", (c) => c.json({ status: "ok" }));

      const response = await app.request("/api/test?q=test");

      expect(response.status).toBe(200);
      expect(sanitizationRan).toBe(true);
      expect(validationRan).toBe(true);
    });
  });
});
