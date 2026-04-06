/**
 * Unit tests for security event logging middleware.
 */

import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { securityLogging, SecurityEventLogger, securityLogger } from "./security-logging.js";

describe("SecurityEventLogger class", () => {
  let logger: SecurityEventLogger;
  let mockLogFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockLogFn = vi.fn();
    logger = new SecurityEventLogger({ logFn: mockLogFn });
  });

  it("logs security events with default severity threshold", () => {
    const app = new Hono();
    app.get("/test", (c) => {
      logger.logAuthFailure(c, "invalid_credentials");
      return c.json({ ok: true });
    });

    app.request("/test", {
      headers: { "CF-Connecting-IP": "1.2.3.4", "User-Agent": "test-agent" },
    });

    expect(mockLogFn).toHaveBeenCalled();
    const loggedEvent = mockLogFn.mock.calls[0]![0]!;
    expect(loggedEvent.event).toBe("auth_failure");
    expect(loggedEvent.severity).toBe("high");
    expect(loggedEvent.ip).toBe("1.2.3.4");
    expect(loggedEvent.userAgent).toBe("test-agent");
  });

  it("respects minimum severity threshold", () => {
    const lowLogger = new SecurityEventLogger({
      logFn: mockLogFn,
      minSeverity: "high",
    });

    const app = new Hono();
    app.get("/test", (c) => {
      lowLogger.logInputValidationFailure(c, "field", "invalid");
      return c.json({ ok: true });
    });

    app.request("/test");

    expect(mockLogFn).not.toHaveBeenCalled(); // low severity < high threshold
  });

  it("sanitizes PII from paths when enabled", () => {
    const piiLogger = new SecurityEventLogger({
      logFn: mockLogFn,
      sanitizePII: true,
    });

    const app = new Hono();
    app.get("/*", (c) => {
      piiLogger.logSuspiciousRequest(c, "pattern", "test");
      return c.json({ ok: true });
    });

    app.request("/api/users/123e4567-e89b-12d3-a456-426614174000");

    expect(mockLogFn).toHaveBeenCalled();
    const loggedEvent = mockLogFn.mock.calls[0]![0]!;
    expect(loggedEvent.path).toBe("/api/users/:id");
  });

  it("includes full path when sanitizePII is disabled", () => {
    const noSanitizeLogger = new SecurityEventLogger({
      logFn: mockLogFn,
      sanitizePII: false,
    });

    const app = new Hono();
    app.get("/*", (c) => {
      noSanitizeLogger.logSuspiciousRequest(c, "pattern", "test");
      return c.json({ ok: true });
    });

    const testPath = "/api/users/test@example.com";
    app.request(testPath);

    expect(mockLogFn).toHaveBeenCalled();
    const loggedEvent = mockLogFn.mock.calls[0]![0]!;
    expect(loggedEvent.path).toBe(testPath);
  });

  it("provides convenience methods for common events", () => {
    const app = new Hono();
    app.get("/test", (c) => {
      logger.logAuthFailure(c, "invalid_token");
      logger.logAuthzFailure(c, "resource", "read");
      logger.logRateLimitExceeded(c, 100, 60);
      logger.logInputValidationFailure(c, "email", "invalid_format");
      logger.logPathTraversalBlocked(c, "/etc/passwd");
      logger.logHPPBlocked(c, ["id", "name"]);
      logger.logSuspiciousRequest(c, "sql_injection", "detected pattern");
      logger.logBlockedAttack(c, "xss", "script tag detected");
      logger.logDataExfiltrationAttempt(c, "download", "database");
      logger.logUnusualActivity(c, "large_request", "unusual size");
      return c.json({ ok: true });
    });

    app.request("/test");

    expect(mockLogFn).toHaveBeenCalledTimes(10);
  });

  it("extracts IP from various headers", () => {
    const app = new Hono();
    app.get("/test", (c) => {
      logger.logAuthFailure(c, "test");
      return c.json({ ok: true });
    });

    // Test CF-Connecting-IP
    app.request("/test", { headers: { "CF-Connecting-IP": "1.2.3.4" } });
    expect(mockLogFn.mock.calls[0]![0]!.ip).toBe("1.2.3.4");
    mockLogFn.mockClear();

    // Test X-Forwarded-For
    app.request("/test", { headers: { "X-Forwarded-For": "5.6.7.8, 9.10.11.12" } });
    expect(mockLogFn.mock.calls[0]![0]!.ip).toBe("5.6.7.8");
    mockLogFn.mockClear();

    // Test X-Real-IP
    app.request("/test", { headers: { "X-Real-IP": "13.14.15.16" } });
    expect(mockLogFn.mock.calls[0]![0]!.ip).toBe("13.14.15.16");
    mockLogFn.mockClear();

    // Test unknown
    app.request("/test");
    expect(mockLogFn.mock.calls[0]![0]!.ip).toBe("unknown");
  });

  it("can disable user agent logging", () => {
    const noUaLogger = new SecurityEventLogger({
      logFn: mockLogFn,
      includeUserAgent: false,
    });

    const app = new Hono();
    app.get("/test", (c) => {
      noUaLogger.logAuthFailure(c, "test");
      return c.json({ ok: true });
    });

    app.request("/test", { headers: { "User-Agent": "test-agent" } });

    const loggedEvent = mockLogFn.mock.calls[0]![0]!;
    expect(loggedEvent.userAgent).toBeUndefined();
  });

  it("includes custom details in event logs", () => {
    const app = new Hono();
    app.get("/test", (c) => {
      logger.log("custom_event", "medium", c, { customField: "customValue", count: 42 });
      return c.json({ ok: true });
    });

    app.request("/test");

    const loggedEvent = mockLogFn.mock.calls[0]![0]!;
    expect(loggedEvent.details).toBeDefined();
    expect(loggedEvent.details?.customField).toBe("customValue");
    expect(loggedEvent.details?.count).toBe(42);
  });
});

describe("securityLogging middleware", () => {
  let mockLogFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockLogFn = vi.fn();
  });

  it("automatically logs 4xx responses", async () => {
    const app = new Hono();
    app.use("*", securityLogging({ logFn: mockLogFn }));
    app.get("/test", (c) => c.json({ error: "bad request" }, 400));

    await app.request("/test");

    expect(mockLogFn).toHaveBeenCalled();
    const loggedEvent = mockLogFn.mock.calls[0]![0]!;
    expect(loggedEvent.event).toBe("input_validation_failed");
  });

  it("logs 401 as auth failure", async () => {
    const app = new Hono();
    app.use("*", securityLogging({ logFn: mockLogFn }));
    app.get("/test", (c) => c.json({ error: "unauthorized" }, 401));

    await app.request("/test");

    const loggedEvent = mockLogFn.mock.calls[0]![0]!;
    expect(loggedEvent.event).toBe("auth_failure");
    expect(loggedEvent.severity).toBe("high");
  });

  it("logs 403 as authz failure", async () => {
    const app = new Hono();
    app.use("*", securityLogging({ logFn: mockLogFn }));
    app.get("/test", (c) => c.json({ error: "forbidden" }, 403));

    await app.request("/test");

    const loggedEvent = mockLogFn.mock.calls[0]![0]!;
    expect(loggedEvent.event).toBe("auth_failure");
  });

  it("logs 429 as rate limit exceeded", async () => {
    const app = new Hono();
    app.use("*", securityLogging({ logFn: mockLogFn }));
    app.get("/test", (c) => c.json({ error: "too many requests" }, 429));

    await app.request("/test");

    const loggedEvent = mockLogFn.mock.calls[0]![0]!;
    expect(loggedEvent.event).toBe("rate_limit_exceeded");
  });

  it("logs 5xx as unusual activity", async () => {
    const app = new Hono();
    app.use("*", securityLogging({ logFn: mockLogFn }));
    app.get("/test", (c) => c.json({ error: "server error" }, 500));

    await app.request("/test");

    const loggedEvent = mockLogFn.mock.calls[0]![0]!;
    expect(loggedEvent.event).toBe("unusual_activity");
    expect(loggedEvent.severity).toBe("medium");
  });

  it("does not log successful 2xx responses", async () => {
    const app = new Hono();
    app.use("*", securityLogging({ logFn: mockLogFn }));
    app.get("/test", (c) => c.json({ ok: true }, 200));

    await app.request("/test");

    expect(mockLogFn).not.toHaveBeenCalled();
  });
});

describe("global securityLogger instance", () => {
  it("is available for direct use", () => {
    expect(securityLogger).toBeDefined();
    expect(securityLogger).toBeInstanceOf(SecurityEventLogger);
  });

  it("can be used to log events without creating a new instance", () => {
    const app = new Hono();
    app.get("/test", (c) => {
      securityLogger.logAuthFailure(c, "test");
      return c.json({ ok: true });
    });

    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    app.request("/test");

    expect(consoleWarnSpy).toHaveBeenCalled();
    // The global logger uses console.warn which does JSON.stringify internally
    const loggedEvent = JSON.parse(consoleWarnSpy.mock.calls[0]![0]!);
    expect(loggedEvent.event).toBe("auth_failure");

    consoleWarnSpy.mockRestore();
  });
});
