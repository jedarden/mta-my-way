/**
 * Unit tests for JSON depth protection middleware.
 */

import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { jsonDepthProtection } from "./json-depth-protection.js";

function createTestApp(options?: Parameters<typeof jsonDepthProtection>[0]) {
  const app = new Hono();
  app.use("*", jsonDepthProtection(options));
  app.post("/api/test", async (c) => {
    const body = await c.req.json();
    return c.json({ received: true, keys: Object.keys(body) });
  });
  return app;
}

function jsonRequest(path: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function rawJsonRequest(path: string, rawBody: string) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: rawBody,
  });
}

describe("jsonDepthProtection middleware", () => {
  it("allows shallow JSON objects", async () => {
    const app = createTestApp();
    const res = await app.request(jsonRequest("/api/test", { name: "Alice", age: 30 }));
    expect(res.status).toBe(200);
  });

  it("allows nested objects within default depth limit", async () => {
    const app = createTestApp();
    const body = { a: { b: { c: { d: { e: "value" } } } } };
    const res = await app.request(jsonRequest("/api/test", body));
    expect(res.status).toBe(200);
  });

  it("blocks deeply nested objects exceeding maxDepth", async () => {
    const app = createTestApp({ maxDepth: 5 });

    // Build a deeply nested object (7 levels)
    let nested: unknown = "leaf";
    for (let i = 0; i < 7; i++) {
      nested = { child: nested };
    }

    const res = await app.request(jsonRequest("/api/test", nested));
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error).toMatch(/depth/i);
  });

  it("allows arrays within default length limit", async () => {
    const app = createTestApp();
    const body = { items: Array.from({ length: 10 }, (_, i) => i) };
    const res = await app.request(jsonRequest("/api/test", body));
    expect(res.status).toBe(200);
  });

  it("blocks deeply nested arrays exceeding maxDepth via string check", async () => {
    const app = createTestApp({ maxDepth: 3 });

    // Build a nested array structure that exceeds depth limit
    // [[[[["deep"]]]] = depth 5
    let raw = '"deep"';
    for (let i = 0; i < 5; i++) {
      raw = `[${raw}]`;
    }

    const res = await app.request(rawJsonRequest("/api/test", raw));
    expect(res.status).toBe(413);
  });

  it("skips validation for non-JSON content types", async () => {
    // Use a separate app with a text handler so the route doesn't fail on JSON parsing
    const app = new Hono();
    app.use("*", jsonDepthProtection());
    app.post("/api/text", async (c) => {
      const body = await c.req.text();
      return c.json({ received: body });
    });

    const res = await app.request(
      new Request("http://localhost/api/text", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "plain text",
      })
    );
    // Middleware skips, handler processes text normally
    expect(res.status).toBe(200);
  });

  it("skips validation for empty body", async () => {
    // Use a separate app that handles empty body gracefully
    const app = new Hono();
    app.use("*", jsonDepthProtection());
    app.post("/api/empty", async (c) => {
      return c.json({ received: true });
    });

    const res = await app.request(
      new Request("http://localhost/api/empty", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "",
      })
    );
    // Empty body should not trigger size limits (middleware skips empty)
    expect(res.status).not.toBe(413);
  });

  it("handles malformed JSON gracefully", async () => {
    const app = createTestApp();
    const res = await app.request(rawJsonRequest("/api/test", "{not valid json"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid json/i);
  });

  it("skips validation for excluded paths", async () => {
    const app = createTestApp({ maxDepth: 2, excludePaths: ["/api/test"] });
    // Build nested object beyond maxDepth=2
    const body = { a: { b: { c: "deep" } } };
    const res = await app.request(jsonRequest("/api/test", body));
    // Should not be blocked because path is excluded
    expect(res.status).toBe(200);
  });

  it("allows objects within maxObjectKeys limit", async () => {
    const app = createTestApp({ maxObjectKeys: 10 });
    const body: Record<string, string> = {};
    for (let i = 0; i < 8; i++) {
      body[`key${i}`] = `value${i}`;
    }
    const res = await app.request(jsonRequest("/api/test", body));
    expect(res.status).toBe(200);
  });

  it("uses custom options when provided", async () => {
    const app = createTestApp({ maxDepth: 1, maxArrayLength: 2, maxObjectKeys: 3 });

    // A flat object with 2 keys passes
    const res = await app.request(jsonRequest("/api/test", { a: "1", b: "2" }));
    expect(res.status).toBe(200);
  });

  it("blocks deeply nested JSON caught by structure check", async () => {
    const app = createTestApp({ maxDepth: 3 });

    // Build deeply nested JSON string directly (avoid auto-serializer depth limits)
    let raw = '"leaf"';
    for (let i = 0; i < 10; i++) {
      raw = `{"child":${raw}}`;
    }

    const res = await app.request(rawJsonRequest("/api/test", raw));
    expect(res.status).toBe(413);
  });

  it("passes GET requests through without processing", async () => {
    const app = new Hono();
    app.use("*", jsonDepthProtection());
    app.get("/api/data", (c) => c.json({ ok: true }));

    const res = await app.request("/api/data");
    expect(res.status).toBe(200);
  });
});
