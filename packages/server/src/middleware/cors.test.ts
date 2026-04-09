/**
 * Unit tests for CORS middleware.
 */

import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cors } from "./cors.js";

describe("cors middleware", () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
  });

  it("allows same-origin requests by default", async () => {
    app.use("*", cors());
    app.get("/api/test", (c) => c.json({ message: "ok" }));

    const res = await app.request("/api/test", {
      headers: {
        Origin: "http://localhost:3001",
        Host: "localhost:3001",
      },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3001");
  });

  it("handles preflight OPTIONS requests", async () => {
    app.use("*", cors());
    app.get("/api/test", (c) => c.json({ message: "ok" }));

    const res = await app.request("/api/test", {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:3001",
        Host: "localhost:3001",
        "Access-Control-Request-Method": "POST",
      },
    });

    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Methods")).toBeTruthy();
    expect(res.headers.get("Access-Control-Allow-Headers")).toBeTruthy();
  });

  it("allows specific origins when configured", async () => {
    app.use("*", cors({ allowedOrigins: ["https://example.com"] }));
    app.get("/api/test", (c) => c.json({ message: "ok" }));

    const res = await app.request("/api/test", {
      headers: { Origin: "https://example.com" },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://example.com");
  });

  it("blocks origins not in allowed list", async () => {
    app.use("*", cors({ allowedOrigins: ["https://example.com"] }));
    app.get("/api/test", (c) => c.json({ message: "ok" }));

    const res = await app.request("/api/test", {
      headers: { Origin: "https://malicious.com" },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("allows all origins with wildcard", async () => {
    app.use("*", cors({ allowedOrigins: ["*"] }));
    app.get("/api/test", (c) => c.json({ message: "ok" }));

    const res = await app.request("/api/test", {
      headers: { Origin: "https://any-origin.com" },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("sets Access-Control-Max-Age header", async () => {
    app.use("*", cors({ maxAge: 3600 }));
    app.get("/api/test", (c) => c.json({ message: "ok" }));

    const res = await app.request("/api/test", {
      method: "OPTIONS",
      headers: { Origin: "http://localhost:3001", Host: "localhost:3001" },
    });

    expect(res.headers.get("Access-Control-Max-Age")).toBe("3600");
  });

  it("sets Access-Control-Allow-Credentials when enabled", async () => {
    app.use("*", cors({ allowCredentials: true }));
    app.get("/api/test", (c) => c.json({ message: "ok" }));

    const res = await app.request("/api/test", {
      headers: { Origin: "http://localhost:3001", Host: "localhost:3001" },
    });

    expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  });

  it("sets exposed headers when configured", async () => {
    app.use("*", cors({ exposedHeaders: ["X-Custom-Header", "X-Total-Count"] }));
    app.get("/api/test", (c) => c.json({ message: "ok" }));

    const res = await app.request("/api/test", {
      headers: {
        Origin: "http://localhost:3001",
        Host: "localhost:3001",
      },
    });

    const exposed = res.headers.get("Access-Control-Expose-Headers");
    expect(exposed).toContain("X-Custom-Header");
    expect(exposed).toContain("X-Total-Count");
  });

  describe("security features", () => {
    it("blocks null origin by default", async () => {
      app.use("*", cors({ blockNullOrigin: true }));
      app.get("/api/test", (c) => c.json({ message: "ok" }));

      const res = await app.request("/api/test", {
        headers: { Origin: "null" },
      });

      expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });

    it("allows null origin when blocking disabled", async () => {
      app.use("*", cors({ blockNullOrigin: false }));
      app.get("/api/test", (c) => c.json({ message: "ok" }));

      const res = await app.request("/api/test", {
        headers: { Origin: "null" },
      });

      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("null");
    });

    it("blocks localhost origin by default", async () => {
      app.use("*", cors({ blockPrivateNetworks: true }));
      app.get("/api/test", (c) => c.json({ message: "ok" }));

      const res = await app.request("/api/test", {
        headers: { Origin: "http://localhost:8080" },
      });

      expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });

    it("allows localhost origin when blocking disabled", async () => {
      app.use("*", cors({ blockPrivateNetworks: false }));
      app.get("/api/test", (c) => c.json({ message: "ok" }));

      const res = await app.request("/api/test", {
        headers: { Origin: "http://localhost:8080" },
      });

      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:8080");
    });

    it("blocks 127.0.0.1 origin by default", async () => {
      app.use("*", cors({ blockPrivateNetworks: true }));
      app.get("/api/test", (c) => c.json({ message: "ok" }));

      const res = await app.request("/api/test", {
        headers: { Origin: "http://127.0.0.1:3000" },
      });

      expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });

    it("blocks .local TLD by default", async () => {
      app.use("*", cors({ blockPrivateNetworks: true }));
      app.get("/api/test", (c) => c.json({ message: "ok" }));

      const res = await app.request("/api/test", {
        headers: { Origin: "http://my-computer.local:8080" },
      });

      expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });

    it("blocks file:// origin by default", async () => {
      app.use("*", cors({ blockPrivateNetworks: true }));
      app.get("/api/test", (c) => c.json({ message: "ok" }));

      const res = await app.request("/api/test", {
        headers: { Origin: "file:///path/to/file.html" },
      });

      expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });

    it("blocks 10.0.0.0/8 private network", async () => {
      app.use("*", cors({ blockPrivateNetworks: true }));
      app.get("/api/test", (c) => c.json({ message: "ok" }));

      const res = await app.request("/api/test", {
        headers: { Origin: "http://10.0.1.5:8080" },
      });

      expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });

    it("blocks 192.168.0.0/16 private network", async () => {
      app.use("*", cors({ blockPrivateNetworks: true }));
      app.get("/api/test", (c) => c.json({ message: "ok" }));

      const res = await app.request("/api/test", {
        headers: { Origin: "http://192.168.1.100:3000" },
      });

      expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });

    it("blocks 172.16.0.0/12 private network", async () => {
      app.use("*", cors({ blockPrivateNetworks: true }));
      app.get("/api/test", (c) => c.json({ message: "ok" }));

      const res = await app.request("/api/test", {
        headers: { Origin: "http://172.16.0.1:8080" },
      });

      expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });

    it("does not block 172.15.x.x (not in private range)", async () => {
      app.use("*", cors({ blockPrivateNetworks: true }));
      app.get("/api/test", (c) => c.json({ message: "ok" }));

      const res = await app.request("/api/test", {
        headers: { Origin: "http://172.15.0.1:8080", Host: "172.15.0.1" },
      });

      // Should allow since 172.15.x.x is not in the private range
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://172.15.0.1:8080");
    });

    it("uses custom origin validator", async () => {
      const customValidator = vi.fn((origin: string) => {
        return origin.endsWith(".trusted-domain.com");
      });

      app.use("*", cors({ originValidator: customValidator }));
      app.get("/api/test", (c) => c.json({ message: "ok" }));

      const res1 = await app.request("/api/test", {
        headers: { Origin: "https://app.trusted-domain.com" },
      });

      expect(res1.headers.get("Access-Control-Allow-Origin")).toBe(
        "https://app.trusted-domain.com"
      );

      const res2 = await app.request("/api/test", {
        headers: { Origin: "https://malicious.com" },
      });

      expect(res2.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });

    it("adds Vary: Origin header for specific origins", async () => {
      app.use("*", cors({ allowedOrigins: ["https://example.com"] }));
      app.get("/api/test", (c) => c.json({ message: "ok" }));

      const res = await app.request("/api/test", {
        headers: { Origin: "https://example.com" },
      });

      const vary = res.headers.get("Vary");
      expect(vary).toContain("Origin");
    });
  });
});
