/**
 * Unit tests for Content-Type validation middleware.
 */

import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { validateContentType, requireJson, requireFormData } from "./content-type.js";

describe("validateContentType middleware", () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
  });

  it("allows requests with valid JSON content type", async () => {
    app.use("*", validateContentType());
    app.post("/api/test", (c) => c.json({ message: "ok" }));

    const res = await app.request("/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });

    expect(res.status).toBe(200);
  });

  it("allows requests with form data content type", async () => {
    app.use("*", validateContentType());
    app.post("/api/test", (c) => c.json({ message: "ok" }));

    const formData = new FormData();
    formData.append("key", "value");

    const res = await app.request("/api/test", {
      method: "POST",
      body: formData,
    });

    expect(res.status).toBe(200);
  });

  it("allows GET requests without content type", async () => {
    app.use("*", validateContentType());
    app.get("/api/test", (c) => c.json({ message: "ok" }));

    const res = await app.request("/api/test");

    expect(res.status).toBe(200);
  });

  it("rejects requests with unsupported content type", async () => {
    app.use("*", validateContentType());
    app.post("/api/test", (c) => c.json({ message: "ok" }));

    const res = await app.request("/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/xml" },
      body: "<xml></xml>",
    });

    expect(res.status).toBe(415);
    const body = await res.json();
    expect(body.error).toContain("Unsupported Media Type");
  });

  it("rejects POST requests without content type when body is present", async () => {
    app.use("*", validateContentType({ requireForBody: true }));
    app.post("/api/test", (c) => c.json({ message: "ok" }));

    const res = await app.request("/api/test", {
      method: "POST",
      headers: {
        "Content-Length": "100",
      },
    });

    expect(res.status).toBe(415);
    const body = await res.json();
    expect(body.error).toContain("Content-Type header is required");
  });

  it("allows custom allowed types", async () => {
    app.use("*", validateContentType({ allowedTypes: ["text/plain"] }));
    app.post("/api/test", (c) => c.json({ message: "ok" }));

    const res = await app.request("/api/test", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "plain text",
    });

    expect(res.status).toBe(200);
  });

  it("blocks types not in custom allowed list", async () => {
    app.use("*", validateContentType({ allowedTypes: ["text/plain"] }));
    app.post("/api/test", (c) => c.json({ message: "ok" }));

    const res = await app.request("/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });

    expect(res.status).toBe(415);
  });

  it("handles content type with charset parameter", async () => {
    app.use("*", validateContentType());
    app.post("/api/test", (c) => c.json({ message: "ok" }));

    const res = await app.request("/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: "{}",
    });

    expect(res.status).toBe(200);
  });

  it("can skip validation for specific methods", async () => {
    app.use("*", validateContentType({ skipMethods: ["DELETE"] }));
    app.delete("/api/test", (c) => c.json({ message: "ok" }));

    const res = await app.request("/api/test", {
      method: "DELETE",
      headers: { "Content-Type": "text/xml" },
    });

    expect(res.status).toBe(200);
  });

  it("allows empty content type with zero content length", async () => {
    app.use("*", validateContentType({ requireForBody: true }));
    app.post("/api/test", (c) => c.json({ message: "ok" }));

    const res = await app.request("/api/test", {
      method: "POST",
      headers: { "Content-Length": "0" },
    });

    expect(res.status).toBe(200);
  });

  it("logs security events for invalid content types", async () => {
    app.use("*", validateContentType());
    app.post("/api/test", (c) => c.json({ message: "ok" }));

    const consoleWarnSpy = vi.spyOn(console, "warn");
    await app.request("/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/xml" },
      body: "<xml></xml>",
    });

    expect(consoleWarnSpy).toHaveBeenCalled();
    const logArg = JSON.parse(consoleWarnSpy.mock.calls[0]![0]!);
    expect(logArg.event).toBe("invalid_content_type");

    consoleWarnSpy.mockRestore();
  });

  it("includes supported types in error response", async () => {
    app.use("*", validateContentType());
    app.post("/api/test", (c) => c.json({ message: "ok" }));

    const res = await app.request("/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/xml" },
      body: "<xml></xml>",
    });

    const body = await res.json();
    expect(body.supportedTypes).toBeDefined();
    expect(Array.isArray(body.supportedTypes)).toBe(true);
  });
});

describe("requireJson helper", () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.use("*", requireJson());
    app.post("/api/test", (c) => c.json({ message: "ok" }));
  });

  it("allows JSON content type", async () => {
    const res = await app.request("/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });

    expect(res.status).toBe(200);
  });

  it("blocks form data", async () => {
    const formData = new FormData();
    formData.append("key", "value");

    const res = await app.request("/api/test", {
      method: "POST",
      body: formData,
    });

    expect(res.status).toBe(415);
    const body = await res.json();
    expect(body.error).toContain("JSON content type required");
  });
});

describe("requireFormData helper", () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.use("*", requireFormData());
    app.post("/api/test", (c) => c.json({ message: "ok" }));
  });

  it("allows form data", async () => {
    const formData = new FormData();
    formData.append("key", "value");

    const res = await app.request("/api/test", {
      method: "POST",
      body: formData,
    });

    expect(res.status).toBe(200);
  });

  it("blocks JSON", async () => {
    const res = await app.request("/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });

    expect(res.status).toBe(415);
    const body = await res.json();
    expect(body.error).toContain("Form data content type required");
  });

  it("allows URL-encoded form data", async () => {
    const params = new URLSearchParams();
    params.append("key", "value");

    const res = await app.request("/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });

    expect(res.status).toBe(200);
  });
});
