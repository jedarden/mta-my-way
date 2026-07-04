/**
 * Unit tests for X-Request-ID middleware.
 */

import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestId } from "./request-id.js";

describe("requestId middleware", () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.use("*", requestId);
    app.get("/test", (c) => c.json({ requestId: c.get("requestId") }));
  });

  describe("UUID generation", () => {
    it("generates a UUID when no X-Request-ID header is provided", async () => {
      const res = await app.request("/test");
      expect(res.status).toBe(200);

      const header = res.headers.get("X-Request-ID");
      expect(header).toBeTruthy();
      // UUID v4 format
      expect(header).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it("generates a new UUID for each request", async () => {
      const res1 = await app.request("/test");
      const res2 = await app.request("/test");

      const id1 = res1.headers.get("X-Request-ID");
      const id2 = res2.headers.get("X-Request-ID");

      expect(id1).toBeTruthy();
      expect(id2).toBeTruthy();
      expect(id1).not.toBe(id2);
    });
  });

  describe("context propagation", () => {
    it("sets requestId on the Hono context", async () => {
      const res = await app.request("/test");
      const body = (await res.json()) as { requestId: string };
      const header = res.headers.get("X-Request-ID");

      expect(body.requestId).toBeTruthy();
      expect(body.requestId).toBe(header);
    });

    it("sets X-Request-ID response header", async () => {
      const res = await app.request("/test");
      expect(res.headers.get("X-Request-ID")).toBeTruthy();
    });

    it("response header matches context value", async () => {
      const res = await app.request("/test");
      const body = (await res.json()) as { requestId: string };
      expect(body.requestId).toBe(res.headers.get("X-Request-ID"));
    });
  });

  describe("incoming X-Request-ID passthrough", () => {
    it("passes through a valid alphanumeric ID", async () => {
      const incomingId = "abc123";
      const res = await app.request("/test", {
        headers: { "X-Request-ID": incomingId },
      });

      expect(res.headers.get("X-Request-ID")).toBe(incomingId);
      const body = (await res.json()) as { requestId: string };
      expect(body.requestId).toBe(incomingId);
    });

    it("passes through an ID with hyphens", async () => {
      const incomingId = "req-abc-123";
      const res = await app.request("/test", {
        headers: { "X-Request-ID": incomingId },
      });

      expect(res.headers.get("X-Request-ID")).toBe(incomingId);
    });

    it("passes through an ID with underscores", async () => {
      const incomingId = "req_abc_123";
      const res = await app.request("/test", {
        headers: { "X-Request-ID": incomingId },
      });

      expect(res.headers.get("X-Request-ID")).toBe(incomingId);
    });

    it("passes through an ID with dots", async () => {
      const incomingId = "req.abc.123";
      const res = await app.request("/test", {
        headers: { "X-Request-ID": incomingId },
      });

      expect(res.headers.get("X-Request-ID")).toBe(incomingId);
    });

    it("passes through a UUID-format incoming ID", async () => {
      const incomingId = "550e8400-e29b-41d4-a716-446655440000";
      const res = await app.request("/test", {
        headers: { "X-Request-ID": incomingId },
      });

      expect(res.headers.get("X-Request-ID")).toBe(incomingId);
    });

    it("passes through a 64-character ID (maximum length)", async () => {
      const incomingId = "a".repeat(64);
      const res = await app.request("/test", {
        headers: { "X-Request-ID": incomingId },
      });

      expect(res.headers.get("X-Request-ID")).toBe(incomingId);
    });
  });

  describe("header injection prevention", () => {
    it("replaces an ID with spaces (potential header injection)", async () => {
      const res = await app.request("/test", {
        headers: { "X-Request-ID": "valid id with spaces" },
      });

      const returnedId = res.headers.get("X-Request-ID");
      expect(returnedId).not.toBe("valid id with spaces");
      // Should be a generated UUID instead
      expect(returnedId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/i);
    });

    it("replaces an ID with percent-encoded characters", async () => {
      // %0d%0a is CRLF — the regex guard should reject this as it contains %
      const res = await app.request("/test", {
        headers: { "X-Request-ID": "id%0d%0aX-Evil:1" },
      });

      const returnedId = res.headers.get("X-Request-ID");
      expect(returnedId).not.toContain("%");
      expect(returnedId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/i);
    });

    it("replaces an ID with special chars (shell/script injection attempt)", async () => {
      const res = await app.request("/test", {
        headers: { "X-Request-ID": "<script>alert(1)</script>" },
      });

      const returnedId = res.headers.get("X-Request-ID");
      expect(returnedId).not.toContain("<");
      expect(returnedId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/i);
    });

    it("replaces a 65-character ID (exceeds maximum length)", async () => {
      const longId = "a".repeat(65);
      const res = await app.request("/test", {
        headers: { "X-Request-ID": longId },
      });

      const returnedId = res.headers.get("X-Request-ID");
      expect(returnedId).not.toBe(longId);
      // Should be a UUID
      expect(returnedId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/i);
    });

    it("replaces an ID with semicolons", async () => {
      const res = await app.request("/test", {
        headers: { "X-Request-ID": "id;injected=value" },
      });

      const returnedId = res.headers.get("X-Request-ID");
      expect(returnedId).not.toContain(";");
      expect(returnedId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/i);
    });

    it("replaces an empty ID string", async () => {
      const res = await app.request("/test", {
        headers: { "X-Request-ID": "" },
      });

      const returnedId = res.headers.get("X-Request-ID");
      // Empty string fails SAFE_ID_RE (requires 1-64 chars), so a UUID is generated
      expect(returnedId).toBeTruthy();
      expect(returnedId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/i);
    });
  });

  describe("middleware ordering", () => {
    it("runs before route handlers so context is available", async () => {
      // The route handler reads c.get("requestId") set by the middleware
      const res = await app.request("/test");
      const body = (await res.json()) as { requestId: string };
      expect(typeof body.requestId).toBe("string");
      expect(body.requestId.length).toBeGreaterThan(0);
    });

    it("consistent ID between context and response header", async () => {
      // Verifies middleware sets both correctly in the same request
      const res = await app.request("/test");
      const body = (await res.json()) as { requestId: string };
      const header = res.headers.get("X-Request-ID");

      expect(body.requestId).toBe(header);
    });
  });
});
