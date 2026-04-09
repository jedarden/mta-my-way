/**
 * Open redirect protection middleware tests.
 */

import { Hono } from "hono";
import { describe, expect, test } from "vitest";
import {
  OAUTH_ALLOWED_HOSTNAMES,
  SAFE_REDIRECT_TARGETS,
  createSafeRedirect,
  openRedirectProtection,
  validateRedirectUrl,
} from "./open-redirect.js";

describe("openRedirectProtection middleware", () => {
  test("allows relative redirects by default", async () => {
    const app = new Hono();
    app.get("/api/test", openRedirectProtection(), (c) => {
      return c.json({ success: true });
    });

    const res = await app.request("/api/test?redirect=/dashboard");

    expect(res.status).toBe(200);
  });

  test("blocks external redirects by default", async () => {
    const app = new Hono();
    app.get("/api/test", openRedirectProtection(), (c) => {
      return c.json({ success: true });
    });

    const res = await app.request("/api/test?redirect=https://evil.com");

    expect(res.status).toBe(400);
  });

  test("allows allowed hostnames when configured", async () => {
    const app = new Hono();
    app.get(
      "/api/test",
      openRedirectProtection({
        allowedHostnames: ["example.com"],
      }),
      (c) => {
        return c.json({ success: true });
      }
    );

    const res = await app.request("/api/test?redirect=https://example.com/path");

    expect(res.status).toBe(200);
  });

  test("blocks disallowed hostnames", async () => {
    const app = new Hono();
    app.get(
      "/api/test",
      openRedirectProtection({
        allowedHostnames: ["example.com"],
      }),
      (c) => {
        return c.json({ success: true });
      }
    );

    const res = await app.request("/api/test?redirect=https://evil.com/path");

    expect(res.status).toBe(400);
  });

  test("blocks JavaScript protocol URLs", async () => {
    const app = new Hono();
    app.get("/api/test", openRedirectProtection(), (c) => {
      return c.json({ success: true });
    });

    const res = await app.request("/api/test?redirect=javascript:alert(1)");

    expect(res.status).toBe(400);
  });

  test("blocks data protocol URLs", async () => {
    const app = new Hono();
    app.get("/api/test", openRedirectProtection(), (c) => {
      return c.json({ success: true });
    });

    const res = await app.request("/api/test?redirect=data:text/html,<script>alert(1)</script>");

    expect(res.status).toBe(400);
  });

  test("blocks relative URLs with path traversal", async () => {
    const app = new Hono();
    app.get("/api/test", openRedirectProtection(), (c) => {
      return c.json({ success: true });
    });

    const res = await app.request("/api/test?redirect=/../admin");

    expect(res.status).toBe(400);
  });

  test("checks request body for redirect URLs", async () => {
    const app = new Hono();
    app.post("/api/test", openRedirectProtection(), (c) => {
      return c.json({ success: true });
    });

    const res = await app.request("/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ redirect: "https://evil.com" }),
    });

    expect(res.status).toBe(400);
  });

  test("checks multiple redirect parameters", async () => {
    const app = new Hono();
    app.get(
      "/api/test",
      openRedirectProtection({
        redirectParams: ["redirect", "url", "return"],
      }),
      (c) => {
        return c.json({ success: true });
      }
    );

    const res1 = await app.request("/api/test?url=https://evil.com");
    expect(res1.status).toBe(400);

    const res2 = await app.request("/api/test?return=https://evil.com");
    expect(res2.status).toBe(400);
  });

  test("blocks phishing TLDs", async () => {
    const app = new Hono();
    app.get(
      "/api/test",
      openRedirectProtection({
        allowedHostnames: ["example.com"],
      }),
      (c) => {
        return c.json({ success: true });
      }
    );

    const res = await app.request("/api/test?redirect=https://phishing.tk");

    expect(res.status).toBe(400);
  });

  test("blocks URL encoding attacks", async () => {
    const app = new Hono();
    app.get("/api/test", openRedirectProtection(), (c) => {
      return c.json({ success: true });
    });

    // URL-encoded form of https://evil.com
    const res = await app.request("/api/test?redirect=https%3A%2F%2Fevil.com");

    // Should be blocked as external redirect
    expect(res.status).toBe(400);
  });
});

describe("validateRedirectUrl", () => {
  test("validates relative URLs", () => {
    const result = validateRedirectUrl("/dashboard");
    expect(result.valid).toBe(true);
    expect(result.url).toBe("/dashboard");
  });

  test("rejects empty URLs", () => {
    const result = validateRedirectUrl("");
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("empty_url");
  });

  test("rejects invalid URL format", () => {
    const result = validateRedirectUrl("not-a-url");
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("invalid_url_format");
  });

  test("rejects dangerous protocols", () => {
    const jsResult = validateRedirectUrl("javascript:alert(1)");
    expect(jsResult.valid).toBe(false);
    expect(jsResult.reason).toBe("unsafe_protocol");

    const dataResult = validateRedirectUrl("data:text/html,<script>alert(1)</script>");
    expect(dataResult.valid).toBe(false);
    expect(dataResult.reason).toBe("unsafe_protocol");
  });

  test("blocks external redirects when blockExternal is true", () => {
    const result = validateRedirectUrl("https://evil.com", {
      blockExternal: true,
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("external_redirect_blocked");
  });

  test("allows allowed hostnames", () => {
    const result = validateRedirectUrl("https://example.com/path", {
      allowedHostnames: ["example.com"],
    });

    expect(result.valid).toBe(true);
    expect(result.url).toBe("https://example.com/path");
  });

  test("allows subdomains of allowed hostnames", () => {
    const result = validateRedirectUrl("https://sub.example.com/path", {
      allowedHostnames: ["example.com"],
    });

    expect(result.valid).toBe(true);
  });

  test("blocks path traversal in relative URLs", () => {
    const result = validateRedirectUrl("/../admin");

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("path_traversal");
  });

  test("blocks protocol in relative URLs", () => {
    const result = validateRedirectUrl("//evil.com");

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("protocol_in_relative_url");
  });

  test("handles whitespace trimming", () => {
    const result = validateRedirectUrl("  /dashboard  ");

    expect(result.valid).toBe(true);
    expect(result.url).toBe("/dashboard");
  });
});

describe("createSafeRedirect", () => {
  test("creates redirect to valid URL", async () => {
    const app = new Hono();

    const req = new Request("http://localhost/test");
    const c = new Hono().request;
    // Mock context with redirect method
    const mockContext = {
      req: { header: () => undefined, path: "/test", method: "GET" },
      res: { status: 200 },
      redirect: (url: string) => new Response(null, { status: 302, headers: { Location: url } }),
    } as unknown as Context;

    const response = await createSafeRedirect(mockContext, "/dashboard", {
      allowRelative: true,
    });

    expect(response.status).toBe(302); // Redirect status
  });

  test("falls back to default URL for invalid redirect", async () => {
    const app = new Hono();

    // Mock context with redirect method
    const mockContext = {
      req: { header: () => undefined, path: "/test", method: "GET" },
      res: { status: 200 },
      redirect: (url: string) => new Response(null, { status: 302, headers: { Location: url } }),
    } as unknown as Context;

    const response = await createSafeRedirect(
      mockContext,
      "javascript:alert(1)",
      {},
      "/default"
    );

    expect(response.status).toBe(302);
  });

  test("validates against allowed hostnames", async () => {
    const app = new Hono();

    // Mock context with redirect method
    const mockContext = {
      req: { header: () => undefined, path: "/test", method: "GET" },
      res: { status: 200 },
      redirect: (url: string) => new Response(null, { status: 302, headers: { Location: url } }),
    } as unknown as Context;

    const response = await createSafeRedirect(
      mockContext,
      "https://example.com/path",
      { allowedHostnames: ["example.com"] },
      "/default"
    );

    expect(response.status).toBe(302);
  });
});

describe("Common allow-lists", () => {
  test("OAUTH_ALLOWED_HOSTNAMES contains expected hosts", () => {
    expect(OAUTH_ALLOWED_HOSTNAMES).toContain("localhost");
    expect(OAUTH_ALLOWED_HOSTNAMES).toContain("mtamyway.com");
  });

  test("SAFE_REDIRECT_TARGETS contains expected paths", () => {
    expect(SAFE_REDIRECT_TARGETS).toContain("/");
    expect(SAFE_REDIRECT_TARGETS).toContain("/settings");
  });
});
