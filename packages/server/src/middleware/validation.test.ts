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
import { validateBody } from "./validation.js";

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
});
