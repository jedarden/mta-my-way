/**
 * Tests for cache middleware
 */

import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import {
  staticCache,
  semiStaticCache,
  realtimeCache,
  apiCache,
  healthCache,
  noCache,
  noStore,
  immutableCache,
} from "./cache";

describe("Cache Middleware", () => {
  describe("staticCache", () => {
    it("should add static cache headers for successful responses", async () => {
      const app = new Hono();
      app.get("/test", staticCache(), (c) => c.json({ data: "test" }));

      const res = await app.request("/test");

      expect(res.status).toBe(200);
      expect(res.headers.get("Cache-Control")).toContain("public");
      expect(res.headers.get("Cache-Control")).toContain("max-age=86400");
      expect(res.headers.get("Cache-Control")).toContain("stale-while-revalidate=604800");
    });

    it("should not add cache headers for error responses", async () => {
      const app = new Hono();
      app.get("/test", staticCache(), (c) => c.json({ error: "not found" }, 404));

      const res = await app.request("/test");

      expect(res.status).toBe(404);
      expect(res.headers.get("Cache-Control")).toBeNull();
    });
  });

  describe("semiStaticCache", () => {
    it("should add semi-static cache headers", async () => {
      const app = new Hono();
      app.get("/test", semiStaticCache(), (c) => c.json({ data: "test" }));

      const res = await app.request("/test");

      expect(res.headers.get("Cache-Control")).toContain("public");
      expect(res.headers.get("Cache-Control")).toContain("max-age=300");
      expect(res.headers.get("Cache-Control")).toContain("stale-while-revalidate=300");
    });
  });

  describe("realtimeCache", () => {
    it("should add real-time cache headers with short TTL", async () => {
      const app = new Hono();
      app.get("/test", realtimeCache(), (c) => c.json({ data: "test" }));

      const res = await app.request("/test");

      expect(res.headers.get("Cache-Control")).toContain("public");
      expect(res.headers.get("Cache-Control")).toContain("max-age=30");
      expect(res.headers.get("Cache-Control")).toContain("stale-while-revalidate=60");
    });
  });

  describe("apiCache", () => {
    it("should add API cache headers with moderate TTL", async () => {
      const app = new Hono();
      app.get("/test", apiCache(), (c) => c.json({ data: "test" }));

      const res = await app.request("/test");

      expect(res.headers.get("Cache-Control")).toContain("public");
      expect(res.headers.get("Cache-Control")).toContain("max-age=120");
      expect(res.headers.get("Cache-Control")).toContain("stale-while-revalidate=240");
    });
  });

  describe("healthCache", () => {
    it("should add health cache headers with short TTL", async () => {
      const app = new Hono();
      app.get("/test", healthCache(), (c) => c.json({ data: "test" }));

      const res = await app.request("/test");

      expect(res.headers.get("Cache-Control")).toContain("public");
      expect(res.headers.get("Cache-Control")).toContain("max-age=60");
      expect(res.headers.get("Cache-Control")).toContain("stale-while-revalidate=120");
    });
  });

  describe("noCache", () => {
    it("should add no-cache header", async () => {
      const app = new Hono();
      app.get("/test", noCache(), (c) => c.json({ data: "test" }));

      const res = await app.request("/test");

      expect(res.headers.get("Cache-Control")).toBe("no-cache");
    });
  });

  describe("noStore", () => {
    it("should add no-store header", async () => {
      const app = new Hono();
      app.get("/test", noStore(), (c) => c.json({ data: "test" }));

      const res = await app.request("/test");

      expect(res.headers.get("Cache-Control")).toBe("no-store");
    });
  });

  describe("immutableCache", () => {
    it("should add immutable cache header", async () => {
      const app = new Hono();
      app.get("/test", immutableCache(), (c) => c.json({ data: "test" }));

      const res = await app.request("/test");

      expect(res.headers.get("Cache-Control")).toContain("public");
      expect(res.headers.get("Cache-Control")).toContain("max-age=31536000");
      expect(res.headers.get("Cache-Control")).toContain("immutable");
    });
  });

  describe("cache header formats", () => {
    it("should produce valid cache-control header format", async () => {
      const app = new Hono();
      app.get("/static", staticCache(), (c) => c.json({ data: "test" }));
      app.get("/realtime", realtimeCache(), (c) => c.json({ data: "test" }));

      const staticRes = await app.request("/static");
      const realtimeRes = await app.request("/realtime");

      // Verify header format is valid (no malformed directives)
      const parseCacheControl = (header: string | null) => {
        if (!header) return {};
        return Object.fromEntries(
          header.split(", ").map((part) => {
            const [key, value] = part.split("=");
            return [key, value ?? true];
          })
        );
      };

      const staticCache = parseCacheControl(staticRes.headers.get("Cache-Control"));
      expect(staticCache).toHaveProperty("public");
      expect(staticCache).toHaveProperty("max-age");
      expect(staticCache).toHaveProperty("stale-while-revalidate");

      const realtimeCache = parseCacheControl(realtimeRes.headers.get("Cache-Control"));
      expect(realtimeCache).toHaveProperty("public");
      expect(realtimeCache).toHaveProperty("max-age");
      expect(realtimeCache).toHaveProperty("stale-while-revalidate");
    });
  });
});
