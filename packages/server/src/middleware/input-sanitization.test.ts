/**
 * Unit tests for input sanitization middleware.
 */

import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import { getSanitizedQuery, inputSanitization } from "./input-sanitization.js";

describe("inputSanitization middleware", () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
  });

  it("strips HTML tags from query parameters", async () => {
    app.use("*", inputSanitization({ stripHtml: true }));
    app.get("/api/test", (c) => {
      const sanitized = getSanitizedQuery(c);
      return c.json(sanitized);
    });

    const res = await app.request("/api/test?name=<script>alert('xss')</script>Alice");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.name).not.toContain("<script>");
    expect(body.name).toContain("Alice");
  });

  it("strips dangerous HTML tags", async () => {
    app.use("*", inputSanitization({ stripHtml: true }));
    app.get("/api/test", (c) => {
      const sanitized = getSanitizedQuery(c);
      return c.json(sanitized);
    });

    const res = await app.request(
      "/api/test?content=<iframe src='evil.com'></iframe><img src=x onerror=alert(1)>"
    );

    const body = await res.json();
    expect(body.content).not.toContain("<iframe");
    expect(body.content).not.toContain("<img");
    expect(body.content).not.toContain("onerror");
  });

  it("detects SQL injection patterns", async () => {
    app.use("*", inputSanitization({ preventSqlInjection: true }));
    app.get("/api/test", (c) => {
      const sanitized = getSanitizedQuery(c);
      return c.json(sanitized);
    });

    const res = await app.request("/api/test?id=1' OR '1'='1");

    const body = await res.json();
    // SQL injection should be detected and string sanitized
    expect(body.id).toBe("");
  });

  it("normalizes whitespace", async () => {
    app.use("*", inputSanitization({ normalizeWhitespace: true }));
    app.get("/api/test", (c) => {
      const sanitized = getSanitizedQuery(c);
      return c.json(sanitized);
    });

    const res = await app.request("/api/test?name=John   Doe   ");

    const body = await res.json();
    expect(body.name).toBe("John Doe");
  });

  it("handles array parameters (takes first value)", async () => {
    app.use("*", inputSanitization());
    app.get("/api/test", (c) => {
      const sanitized = getSanitizedQuery(c);
      return c.json(sanitized);
    });

    const res = await app.request("/api/test?tags=tag1&tags=tag2");

    const body = await res.json();
    expect(body.tags).toBe("tag1");
  });

  it("handles empty query parameters", async () => {
    app.use("*", inputSanitization());
    app.get("/api/test", (c) => {
      const sanitized = getSanitizedQuery(c);
      return c.json(sanitized);
    });

    const res = await app.request("/api/test");

    const body = await res.json();
    expect(Object.keys(body)).toHaveLength(0);
  });

  it("sanitizes multiple parameters independently", async () => {
    app.use("*", inputSanitization({ stripHtml: true }));
    app.get("/api/test", (c) => {
      const sanitized = getSanitizedQuery(c);
      return c.json(sanitized);
    });

    const res = await app.request("/api/test?name=<b>Alice</b>&city=<script>evil()</script>NYC");

    const body = await res.json();
    expect(body.name).not.toContain("<b>");
    expect(body.city).not.toContain("<script>");
  });

  it("preserves safe HTML when only SQL injection prevention is enabled", async () => {
    app.use(
      "*",
      inputSanitization({
        stripHtml: false,
        preventSqlInjection: true,
      })
    );
    app.get("/api/test", (c) => {
      const sanitized = getSanitizedQuery(c);
      return c.json(sanitized);
    });

    const res = await app.request("/api/test?content=<b>Bold text</b>");

    const body = await res.json();
    expect(body.content).toContain("<b>");
  });

  it("uses default sanitization options when none specified", async () => {
    app.use("*", inputSanitization());
    app.get("/api/test", (c) => {
      const sanitized = getSanitizedQuery(c);
      return c.json(sanitized);
    });

    const res = await app.request("/api/test?name=<script>alert(1)</script>Test");

    const body = await res.json();
    expect(body.name).not.toContain("<script>");
  });
});
