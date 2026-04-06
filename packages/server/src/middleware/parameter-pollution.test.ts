/**
 * Unit tests for HTTP Parameter Pollution protection middleware.
 */

import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hppProtection, getCleanedQuery } from "./parameter-pollution.js";

describe("hppProtection middleware", () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.get("/api/test", (c) => {
      const cleaned = getCleanedQuery(c);
      return c.json({ ...cleaned });
    });
    app.post("/api/test", (c) => c.json({ message: "ok" }));
  });

  describe("strategy: 'first' (default)", () => {
    beforeEach(() => {
      app.use("*", hppProtection({ strategy: "first" }));
    });

    it("takes the first value when duplicates exist", async () => {
      const res = await app.request("/api/test?id=first&id=second&id=third");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe("first");
    });

    it("allows requests without duplicates", async () => {
      const res = await app.request("/api/test?name=test&value=123");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe("test");
      expect(body.value).toBe("123");
    });

    it("handles mixed duplicate and unique parameters", async () => {
      const res = await app.request("/api/test?id=first&id=second&name=test");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe("first");
      expect(body.name).toBe("test");
    });
  });

  describe("strategy: 'last'", () => {
    beforeEach(() => {
      app.use("*", hppProtection({ strategy: "last" }));
    });

    it("takes the last value when duplicates exist", async () => {
      const res = await app.request("/api/test?id=first&id=second&id=third");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe("third");
    });

    it("allows requests without duplicates", async () => {
      const res = await app.request("/api/test?name=test&value=123");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe("test");
      expect(body.value).toBe("123");
    });
  });

  describe("strategy: 'reject'", () => {
    beforeEach(() => {
      app.use("*", hppProtection({ strategy: "reject" }));
    });

    it("rejects requests with duplicate parameters", async () => {
      const res = await app.request("/api/test?id=first&id=second");
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Duplicate");
    });

    it("allows requests without duplicates", async () => {
      const res = await app.request("/api/test?name=test&value=123");
      expect(res.status).toBe(200);
    });

    it("includes duplicate parameter names in error response", async () => {
      const res = await app.request("/api/test?id=1&id=2&name=test");
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.duplicates).toContain("id");
      expect(body.duplicates).not.toContain("name");
    });
  });

  describe("whitelist", () => {
    it("allows duplicates for whitelisted parameters", async () => {
      app.use("*", hppProtection({ strategy: "first", whitelist: ["tags"] }));

      const res = await app.request("/api/test?tags=tag1&tags=tag2&tags=tag3");
      expect(res.status).toBe(200);
      const body = await res.json();
      // Should take first value (since strategy is first)
      expect(body.tags).toBe("tag1");
    });

    it("still blocks non-whitelisted duplicates", async () => {
      app.use("*", hppProtection({ strategy: "reject", whitelist: ["tags"] }));

      const res = await app.request("/api/test?tags=tag1&tags=tag2&id=1&id=2");
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.duplicates).toContain("id");
      expect(body.duplicates).not.toContain("tags");
    });
  });

  describe("request body protection", () => {
    beforeEach(() => {
      app.use("*", hppProtection({ strategy: "first", checkBody: true }));
    });

    it("handles JSON body with duplicate fields", async () => {
      const res = await app.request("/api/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "first", id: "second" }),
      });
      // Duplicate keys in JSON are handled by the parser (last wins)
      // but our middleware provides additional protection
      expect(res.status).toBe(200);
    });

    it("handles form data with duplicate fields", async () => {
      const formData = new FormData();
      formData.append("id", "first");
      formData.append("id", "second");

      const res = await app.request("/api/test", {
        method: "POST",
        body: formData,
      });
      expect(res.status).toBe(200);
    });
  });

  describe("configuration options", () => {
    it("can be configured to skip query checking", async () => {
      app.use("*", hppProtection({ checkQuery: false, strategy: "reject" }));

      const res = await app.request("/api/test?id=1&id=2");
      expect(res.status).toBe(200);
    });

    it("can be configured to skip body checking", async () => {
      app.use("*", hppProtection({ checkBody: false }));

      const formData = new FormData();
      formData.append("id", "first");
      formData.append("id", "second");

      const res = await app.request("/api/test", {
        method: "POST",
        body: formData,
      });
      expect(res.status).toBe(200);
    });

    it("accepts custom reject message", async () => {
      app.use("*", hppProtection({ strategy: "reject", rejectMessage: "Custom error" }));

      const res = await app.request("/api/test?id=1&id=2");
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Custom error");
    });
  });

  describe("security logging", () => {
    it("logs when rejecting duplicates", async () => {
      app.use("*", hppProtection({ strategy: "reject" }));

      const consoleWarnSpy = vi.spyOn(console, "warn");
      await app.request("/api/test?id=1&id=2");

      expect(consoleWarnSpy).toHaveBeenCalled();
      const logArg = JSON.parse(consoleWarnSpy.mock.calls[0]![0]!);
      expect(logArg.event).toBe("hpp_rejected");

      consoleWarnSpy.mockRestore();
    });

    it("includes IP address in security log", async () => {
      app.use("*", hppProtection({ strategy: "reject" }));

      const consoleWarnSpy = vi.spyOn(console, "warn");
      await app.request("/api/test?id=1&id=2", {
        headers: { "CF-Connecting-IP": "1.2.3.4" },
      });

      const logArg = JSON.parse(consoleWarnSpy.mock.calls[0]![0]!);
      expect(logArg.ip).toBe("1.2.3.4");

      consoleWarnSpy.mockRestore();
    });
  });

  describe("edge cases", () => {
    it("handles empty query string", async () => {
      app.use("*", hppProtection());

      const res = await app.request("/api/test");
      expect(res.status).toBe(200);
    });

    it("handles single parameter (no duplicates)", async () => {
      app.use("*", hppProtection());

      const res = await app.request("/api/test?name=test");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe("test");
    });

    it("handles parameters with empty values", async () => {
      app.use("*", hppProtection());

      const res = await app.request("/api/test?name=&id=123");
      expect(res.status).toBe(200);
    });

    it("handles parameters with special characters", async () => {
      app.use("*", hppProtection());

      const res = await app.request("/api/test?filter=value%20with%20spaces&sort=desc");
      expect(res.status).toBe(200);
    });
  });
});
