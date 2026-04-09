/**
 * Unit tests for validation middleware.
 *
 * Tests:
 * - Valid JSON bodies pass validation
 * - Invalid JSON bodies return 400 with error details
 * - Missing required fields are rejected
 * - Type mismatches are rejected
 */

import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { validateBody, validateParams, validateQuery } from "./validation.js";

describe("validateBody middleware", () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
  });

  it("validates and passes valid request bodies", async () => {
    const schema = z.object({
      name: z.string(),
      age: z.number().min(0),
    });

    app.post("/test", async (c, _next) => {
      const body = await validateBody(c, schema);
      if (body instanceof Response) return body;
      return c.json({ validated: true, data: body });
    });

    const res = await app.request("/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Alice", age: 30 }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.validated).toBe(true);
    expect(body.data).toEqual({ name: "Alice", age: 30 });
  });

  it("returns 400 for missing required fields", async () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
    });

    app.post("/test", async (c, _next) => {
      const body = await validateBody(c, schema);
      if (body instanceof Response) return body;
      return c.json({ validated: true });
    });

    const res = await app.request("/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Alice" }), // missing age
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("validation");
  });

  it("returns 400 for type mismatches", async () => {
    const schema = z.object({
      count: z.number(),
    });

    app.post("/test", async (c, _next) => {
      const body = await validateBody(c, schema);
      if (body instanceof Response) return body;
      return c.json({ validated: true });
    });

    const res = await app.request("/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ count: "not a number" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("validation");
  });

  it("returns 400 for malformed JSON", async () => {
    const schema = z.object({
      name: z.string(),
    });

    app.post("/test", async (c, _next) => {
      const body = await validateBody(c, schema);
      if (body instanceof Response) return body;
      return c.json({ validated: true });
    });

    const res = await app.request("/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "invalid json {",
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("handles empty request body", async () => {
    const schema = z.object({
      name: z.string(),
    });

    app.post("/test", async (c, _next) => {
      const body = await validateBody(c, schema);
      if (body instanceof Response) return body;
      return c.json({ validated: true });
    });

    const res = await app.request("/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "",
    });

    expect(res.status).toBe(400);
  });

  it("validates nested objects", async () => {
    const schema = z.object({
      user: z.object({
        name: z.string(),
        email: z.string().email(),
      }),
    });

    app.post("/test", async (c, _next) => {
      const body = await validateBody(c, schema);
      if (body instanceof Response) return body;
      return c.json({ validated: true, data: body });
    });

    const res = await app.request("/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user: { name: "Alice", email: "alice@example.com" },
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.user).toEqual({
      name: "Alice",
      email: "alice@example.com",
    });
  });

  it("validates arrays", async () => {
    const schema = z.object({
      items: z.array(z.number()),
    });

    app.post("/test", async (c, _next) => {
      const body = await validateBody(c, schema);
      if (body instanceof Response) return body;
      return c.json({ validated: true, data: body });
    });

    const res = await app.request("/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [1, 2, 3] }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toEqual([1, 2, 3]);
  });

  it("validates enum values", async () => {
    const schema = z.object({
      status: z.enum(["pending", "active", "complete"]),
    });

    app.post("/test", async (c, _next) => {
      const body = await validateBody(c, schema);
      if (body instanceof Response) return body;
      return c.json({ validated: true });
    });

    const res = await app.request("/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "invalid" }),
    });

    expect(res.status).toBe(400);
  });

  it("supports optional fields", async () => {
    const schema = z.object({
      name: z.string(),
      nickname: z.string().optional(),
    });

    app.post("/test", async (c, _next) => {
      const body = await validateBody(c, schema);
      if (body instanceof Response) return body;
      return c.json({ validated: true, data: body });
    });

    const res = await app.request("/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Alice" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.name).toBe("Alice");
    expect(body.data.nickname).toBeUndefined();
  });

  it("validates number ranges", async () => {
    const schema = z.object({
      age: z.number().min(0).max(150),
    });

    app.post("/test", async (c, _next) => {
      const body = await validateBody(c, schema);
      if (body instanceof Response) return body;
      return c.json({ validated: true });
    });

    const res = await app.request("/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ age: 200 }),
    });

    expect(res.status).toBe(400);
  });

  it("validates string formats with regex", async () => {
    const schema = z.object({
      postalCode: z.string().regex(/^\d{5}(-\d{4})?$/),
    });

    app.post("/test", async (c, _next) => {
      const body = await validateBody(c, schema);
      if (body instanceof Response) return body;
      return c.json({ validated: true });
    });

    const res = await app.request("/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postalCode: "ABC" }),
    });

    expect(res.status).toBe(400);
  });

  describe("Body sanitization", () => {
    it("sanitizes HTML tags in request body", async () => {
      const schema = z.object({
        comment: z.string(),
      });

      app.post("/test", async (c, _next) => {
        const body = await validateBody(c, schema);
        if (body instanceof Response) return body;
        return c.json({ validated: true, data: body });
      });

      const res = await app.request("/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: "<script>alert('xss')</script>Hello" }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.comment).not.toContain("<script>");
      expect(data.data.comment).toContain("Hello");
    });

    it("sanitizes SQL injection patterns in request body", async () => {
      const schema = z.object({
        search: z.string(),
      });

      app.post("/test", async (c, _next) => {
        const body = await validateBody(c, schema);
        if (body instanceof Response) return body;
        return c.json({ validated: true, data: body });
      });

      const res = await app.request("/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ search: "test' OR '1'='1" }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.search).not.toContain("'");
      expect(data.data.search).not.toContain("OR");
    });

    it("sanitizes nested objects", async () => {
      const schema = z.object({
        user: z.object({
          name: z.string(),
          bio: z.string(),
        }),
      });

      app.post("/test", async (c, _next) => {
        const body = await validateBody(c, schema);
        if (body instanceof Response) return body;
        return c.json({ validated: true, data: body });
      });

      const res = await app.request("/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user: {
            name: "John",
            bio: "<b>Bold</b> <script>evil()</script>",
          },
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.user.name).toBe("John");
      expect(data.data.user.bio).not.toContain("<script>");
    });

    it("sanitizes arrays in request body", async () => {
      const schema = z.object({
        tags: z.array(z.string()),
      });

      app.post("/test", async (c, _next) => {
        const body = await validateBody(c, schema);
        if (body instanceof Response) return body;
        return c.json({ validated: true, data: body });
      });

      const res = await app.request("/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tags: ["<script>alert(1)</script>tag1", "<b>tag2</b>"],
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.tags[0]).not.toContain("<script>");
      expect(data.data.tags[1]).not.toContain("<b>");
    });
  });
});

describe("validateQuery middleware", () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
  });

  it("validates query parameters", async () => {
    const schema = z.object({
      limit: z.coerce.number().min(1).max(100),
      offset: z.coerce.number().min(0).default(0),
    });

    app.get("/test", (c) => {
      const query = validateQuery(c, schema);
      if (query instanceof Response) return query;
      return c.json({ validated: true, data: query });
    });

    const res = await app.request("/test?limit=10&offset=5");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ limit: 10, offset: 5 });
  });

  it("returns 400 for invalid query parameters", async () => {
    const schema = z.object({
      limit: z.coerce.number().min(1).max(100),
    });

    app.get("/test", (c) => {
      const query = validateQuery(c, schema);
      if (query instanceof Response) return query;
      return c.json({ validated: true });
    });

    const res = await app.request("/test?limit=abc");

    expect(res.status).toBe(400);
  });
});

describe("validateParams middleware", () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
  });

  it("validates path parameters", async () => {
    const schema = z.object({
      id: z.string().regex(/^\d+$/),
    });

    app.get("/test/:id", (c) => {
      const params = validateParams(c, schema);
      if (params instanceof Response) return params;
      return c.json({ validated: true, data: params });
    });

    const res = await app.request("/test/123");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ id: "123" });
  });

  it("sanitizes path parameters", async () => {
    const schema = z.object({
      id: z.string(),
    });

    app.get("/test/:id", (c) => {
      const params = validateParams(c, schema);
      if (params instanceof Response) return params;
      return c.json({ validated: true, data: params });
    });

    // Test with HTML tags that should be sanitized from path params
    // Note: we can't test path traversal easily because Hono's router
    // handles path segments separately
    const res = await app.request("/test/..%2Ftest");

    expect(res.status).toBe(200);
    const body = await res.json();
    // The sanitization should have removed the path traversal pattern
    expect(body.data.id).not.toContain("../");
  });

  it("returns 400 for invalid path parameters", async () => {
    const schema = z.object({
      id: z.string().regex(/^\d+$/, { message: "ID must be numeric" }),
    });

    app.get("/test/:id", (c) => {
      const params = validateParams(c, schema);
      if (params instanceof Response) return params;
      return c.json({ validated: true });
    });

    const res = await app.request("/test/abc");

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("validation");
  });

  it("sanitizes path traversal attempts", async () => {
    const schema = z.object({
      path: z.string(),
    });

    app.get("/files/:path", (c) => {
      const params = validateParams(c, schema);
      if (params instanceof Response) return params;
      return c.json({ validated: true, data: params });
    });

    // Use URL-encoded dot-dot-slash to test path traversal sanitization
    const res = await app.request("/files/..%2Fetc%2Fpasswd");

    expect(res.status).toBe(200);
    const body = await res.json();
    // The sanitized value should have the dangerous patterns removed
    expect(body.data.path).not.toContain("..");
  });
});
