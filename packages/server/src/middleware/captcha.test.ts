/**
 * Unit tests for CAPTCHA middleware.
 *
 * Tests:
 * - CAPTCHA token verification for multiple providers
 * - Turnstile verification
 * - reCAPTCHA verification
 * - hCaptcha verification
 * - Custom provider verification
 * - Score-based thresholding
 * - Failed attempt tracking
 * - Conditional CAPTCHA triggering
 * - CAPTCHA challenge generation
 * - Configuration management
 */

import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearFailedCaptchaAttempts,
  conditionalCaptcha,
  getCaptchaChallenge,
  getCaptchaConfig,
  getCaptchaStats,
  hasExceededCaptchaAttempts,
  registerCaptchaConfig,
  requireCaptcha,
  resetCaptchaTracking,
  setDefaultCaptchaConfig,
  verifyCaptcha,
} from "./captcha.js";

// Mock fetch for CAPTCHA verification
global.fetch = vi.fn();

describe("CAPTCHA middleware", () => {
  beforeEach(() => {
    resetCaptchaTracking();
    vi.mocked(global.fetch).mockClear();
  });

  describe("verifyCaptcha", () => {
    it("rejects empty token", async () => {
      const config = {
        provider: "turnstile" as const,
        siteKey: "test-site-key",
        secretKey: "test-secret-key",
      };

      const result = await verifyCaptcha("", config, "127.0.0.1");

      expect(result.success).toBe(false);
      expect(result.error).toBe("CAPTCHA token is required");
    });

    it("rejects whitespace-only token", async () => {
      const config = {
        provider: "turnstile" as const,
        siteKey: "test-site-key",
        secretKey: "test-secret-key",
      };

      const result = await verifyCaptcha("   ", config, "127.0.0.1");

      expect(result.success).toBe(false);
      expect(result.error).toBe("CAPTCHA token is required");
    });

    it("verifies Turnstile CAPTCHA successfully", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          challenge_ts: "2024-01-01T00:00:00Z",
          hostname: "example.com",
        }),
      } as Response);

      const config = {
        provider: "turnstile" as const,
        siteKey: "test-site-key",
        secretKey: "test-secret-key",
      };

      const result = await verifyCaptcha("valid-token", config, "127.0.0.1");

      expect(result.success).toBe(true);
      const fetchCall = vi.mocked(global.fetch).mock.calls[0];
      expect(fetchCall?.[0]).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
      expect(fetchCall?.[1]).toMatchObject({
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });
      expect(fetchCall?.[1]?.body).toBeInstanceOf(URLSearchParams);
    });

    it("rejects Turnstile with error codes", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          "error-codes": ["invalid-input-response", "timeout-or-duplicate"],
        }),
      } as Response);

      const config = {
        provider: "turnstile" as const,
        siteKey: "test-site-key",
        secretKey: "test-secret-key",
      };

      const result = await verifyCaptcha("invalid-token", config, "127.0.0.1");

      expect(result.success).toBe(false);
      // Error codes are joined with ", "
      expect(result.error).toBe("invalid-input-response, timeout-or-duplicate");
    });

    it("verifies reCAPTCHA successfully", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          challenge_ts: "2024-01-01T00:00:00Z",
          hostname: "example.com",
        }),
      } as Response);

      const config = {
        provider: "recaptcha" as const,
        siteKey: "test-site-key",
        secretKey: "test-secret-key",
      };

      const result = await verifyCaptcha("valid-token", config, "127.0.0.1");

      expect(result.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        "https://www.google.com/recaptcha/api/siteverify",
        expect.objectContaining({
          method: "POST",
        })
      );
    });

    it("verifies hCaptcha successfully", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          challenge_ts: "2024-01-01T00:00:00Z",
          hostname: "example.com",
        }),
      } as Response);

      const config = {
        provider: "hcaptcha" as const,
        siteKey: "test-site-key",
        secretKey: "test-secret-key",
      };

      const result = await verifyCaptcha("valid-token", config, "127.0.0.1");

      expect(result.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        "https://hcaptcha.com/siteverify",
        expect.objectContaining({
          method: "POST",
        })
      );
    });

    it("verifies custom provider successfully", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          challenge_ts: "2024-01-01T00:00:00Z",
          hostname: "example.com",
        }),
      } as Response);

      const config = {
        provider: "custom" as const,
        siteKey: "test-site-key",
        secretKey: "test-secret-key",
        verifyUrl: "https://example.com/captcha/verify",
      };

      const result = await verifyCaptcha("valid-token", config, "127.0.0.1");

      expect(result.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        "https://example.com/captcha/verify",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        })
      );
    });

    it("rejects custom provider without verifyUrl", async () => {
      const config = {
        provider: "custom" as const,
        siteKey: "test-site-key",
        secretKey: "test-secret-key",
      };

      const result = await verifyCaptcha("valid-token", config, "127.0.0.1");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Custom provider verifyUrl not configured");
    });

    it("enforces score threshold when configured", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, score: 0.3 }),
      } as Response);

      const config = {
        provider: "turnstile" as const,
        siteKey: "test-site-key",
        secretKey: "test-secret-key",
        minScore: 0.5,
      };

      const result = await verifyCaptcha("low-score-token", config, "127.0.0.1");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Score 0.3 below threshold 0.5");
      expect(result.score).toBe(0.3);
    });

    it("accepts token above score threshold", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, score: 0.8 }),
      } as Response);

      const config = {
        provider: "turnstile" as const,
        siteKey: "test-site-key",
        secretKey: "test-secret-key",
        minScore: 0.5,
      };

      const result = await verifyCaptcha("high-score-token", config, "127.0.0.1");

      expect(result.success).toBe(true);
      expect(result.score).toBe(0.8);
    });

    it("handles network errors gracefully", async () => {
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error("Network error"));

      const config = {
        provider: "turnstile" as const,
        siteKey: "test-site-key",
        secretKey: "test-secret-key",
      };

      const result = await verifyCaptcha("valid-token", config, "127.0.0.1");

      expect(result.success).toBe(false);
      expect(result.error).toBe("CAPTCHA verification failed");
    });

    it("handles timeout errors", async () => {
      vi.mocked(global.fetch).mockRejectedValueOnce(new DOMException("Aborted", "AbortError"));

      const config = {
        provider: "turnstile" as const,
        siteKey: "test-site-key",
        secretKey: "test-secret-key",
        timeout: 100,
      };

      const result = await verifyCaptcha("valid-token", config, "127.0.0.1");

      expect(result.success).toBe(false);
      expect(result.error).toBe("CAPTCHA verification failed");
    });
  });

  describe("failed attempt tracking", () => {
    it("tracks failed attempts per IP", async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ success: false, "error-codes": ["invalid-input"] }),
      } as Response);

      const config = {
        provider: "turnstile" as const,
        siteKey: "test-site-key",
        secretKey: "test-secret-key",
      };

      await verifyCaptcha("invalid1", config, "192.168.1.1");
      await verifyCaptcha("invalid2", config, "192.168.1.1");

      expect(hasExceededCaptchaAttempts("192.168.1.1", 5)).toBe(false);
      expect(hasExceededCaptchaAttempts("192.168.1.1", 2)).toBe(true);
    });

    it("resets failed attempts on success", async () => {
      vi.mocked(global.fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: false }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true }),
        } as Response);

      const config = {
        provider: "turnstile" as const,
        siteKey: "test-site-key",
        secretKey: "test-secret-key",
      };

      await verifyCaptcha("invalid", config, "192.168.1.2");
      expect(hasExceededCaptchaAttempts("192.168.1.2", 1)).toBe(true);

      await verifyCaptcha("valid", config, "192.168.1.2");
      expect(hasExceededCaptchaAttempts("192.168.1.2", 1)).toBe(false);
    });

    it("resets tracking after time window", async () => {
      vi.useFakeTimers();
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ success: false }),
      } as Response);

      const config = {
        provider: "turnstile" as const,
        siteKey: "test-site-key",
        secretKey: "test-secret-key",
      };

      await verifyCaptcha("invalid", config, "192.168.1.3");
      expect(hasExceededCaptchaAttempts("192.168.1.3", 1)).toBe(true);

      vi.advanceTimersByTime(61 * 60 * 1000); // 61 minutes
      expect(hasExceededCaptchaAttempts("192.168.1.3", 1)).toBe(false);

      vi.useRealTimers();
    });

    it("clears failed attempts for specific IP", async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ success: false }),
      } as Response);

      const config = {
        provider: "turnstile" as const,
        siteKey: "test-site-key",
        secretKey: "test-secret-key",
      };

      await verifyCaptcha("invalid", config, "192.168.1.4");
      expect(hasExceededCaptchaAttempts("192.168.1.4", 1)).toBe(true);

      clearFailedCaptchaAttempts("192.168.1.4");
      expect(hasExceededCaptchaAttempts("192.168.1.4", 1)).toBe(false);
    });
  });

  describe("requireCaptcha middleware", () => {
    it("rejects requests without token when always required", async () => {
      const app = new Hono();
      app.use(
        "*",
        requireCaptcha({
          alwaysRequired: true,
          config: { provider: "turnstile" as const, siteKey: "sk", secretKey: "ss" },
        })
      );
      app.post("/test", (c) => c.json({ ok: true }));

      const res = await app.request("/test", { method: "POST" });

      expect(res.status).toBe(400);
    });

    it("accepts requests with valid token", async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      } as Response);

      const app = new Hono();
      app.use(
        "*",
        requireCaptcha({
          alwaysRequired: true,
          config: { provider: "turnstile" as const, siteKey: "sk", secretKey: "ss" },
        })
      );
      app.post("/test", (c) => c.json({ ok: true }));

      const res = await app.request("/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ captchaToken: "valid-token" }),
      });

      expect(res.status).toBe(200);
    });

    it("skips when not required and no flag set", async () => {
      const app = new Hono();
      app.use(
        "*",
        requireCaptcha({
          alwaysRequired: false,
          config: { provider: "turnstile" as const, siteKey: "sk", secretKey: "ss" },
        })
      );
      app.post("/test", (c) => c.json({ ok: true }));

      const res = await app.request("/test", { method: "POST" });

      expect(res.status).toBe(200);
    });

    it("blocks when threshold exceeded", async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ success: false }),
      } as Response);

      const app = new Hono();
      app.use(
        "*",
        requireCaptcha({
          alwaysRequired: true,
          config: { provider: "turnstile" as const, siteKey: "sk", secretKey: "ss" },
        })
      );
      app.post("/test", (c) => c.json({ ok: true }));

      for (let i = 0; i < 10; i++) {
        await app.request("/test", {
          method: "POST",
          headers: { "CF-Connecting-IP": "10.0.0.1", "Content-Type": "application/json" },
          body: JSON.stringify({ captchaToken: `invalid-${i}` }),
        });
      }

      const res = await app.request("/test", {
        method: "POST",
        headers: { "CF-Connecting-IP": "10.0.0.1", "Content-Type": "application/json" },
        body: JSON.stringify({ captchaToken: "another-invalid" }),
      });

      expect(res.status).toBe(429);
    });

    it("skips below risk score threshold", async () => {
      const app = new Hono();
      app.use("*", async (c, next) => {
        c.set("sessionRiskAssessment", { riskScore: 30 });
        await next();
      });
      app.use(
        "*",
        requireCaptcha({
          alwaysRequired: false,
          skipBelowRiskScore: 50,
          config: { provider: "turnstile" as const, siteKey: "sk", secretKey: "ss" },
        })
      );
      app.post("/test", (c) => c.json({ ok: true }));

      const res = await app.request("/test", { method: "POST" });

      expect(res.status).toBe(200);
    });
  });

  describe("conditionalCaptcha", () => {
    it("always requires when configured", async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      } as Response);

      const app = new Hono();
      app.use(
        "*",
        conditionalCaptcha({
          captchaConfig: { provider: "turnstile" as const, siteKey: "sk", secretKey: "ss" },
          triggers: { alwaysRequire: true },
        })
      );
      app.post("/test", (c) => c.json({ ok: true }));

      const res = await app.request("/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ captchaToken: "valid" }),
      });

      expect(res.status).toBe(200);
    });

    it("triggers on high risk score", async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      } as Response);

      const app = new Hono();
      app.use("*", async (c, next) => {
        c.set("sessionRiskAssessment", { riskScore: 75 });
        await next();
      });
      app.use(
        "*",
        conditionalCaptcha({
          captchaConfig: { provider: "turnstile" as const, siteKey: "sk", secretKey: "ss" },
          triggers: { minRiskScore: 50 },
        })
      );
      app.post("/test", (c) => c.json({ ok: true }));

      const res = await app.request("/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ captchaToken: "valid" }),
      });

      expect(res.status).toBe(200);
    });

    it("skips on low risk score", async () => {
      const app = new Hono();
      app.use("*", async (c, next) => {
        c.set("sessionRiskAssessment", { riskScore: 25 });
        await next();
      });
      app.use(
        "*",
        conditionalCaptcha({
          captchaConfig: { provider: "turnstile" as const, siteKey: "sk", secretKey: "ss" },
          triggers: { minRiskScore: 50 },
        })
      );
      app.post("/test", (c) => c.json({ ok: true }));

      const res = await app.request("/test", { method: "POST" });

      expect(res.status).toBe(200);
    });

    it("triggers on failed auth attempts", async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      } as Response);

      const app = new Hono();
      app.use("*", async (c, next) => {
        c.set("failedAuthAttempts", 5);
        await next();
      });
      app.use(
        "*",
        conditionalCaptcha({
          captchaConfig: { provider: "turnstile" as const, siteKey: "sk", secretKey: "ss" },
          triggers: { failedAttemptsThreshold: 3 },
        })
      );
      app.post("/test", (c) => c.json({ ok: true }));

      const res = await app.request("/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ captchaToken: "valid" }),
      });

      expect(res.status).toBe(200);
    });
  });

  describe("configuration management", () => {
    it("sets default config", () => {
      setDefaultCaptchaConfig({
        provider: "turnstile",
        siteKey: "default-key",
        secretKey: "default-secret",
      });

      const challenge = getCaptchaChallenge();
      expect(challenge).toBeTruthy();
      expect(challenge?.siteKey).toBe("default-key");
    });

    it("registers named config", () => {
      registerCaptchaConfig("strict", {
        provider: "recaptcha",
        siteKey: "strict-key",
        secretKey: "strict-secret",
      });

      const config = getCaptchaConfig("strict");
      expect(config).toBeTruthy();
      expect(config?.provider).toBe("recaptcha");
    });

    it("gets challenge for named config", () => {
      registerCaptchaConfig("admin", {
        provider: "hcaptcha",
        siteKey: "admin-key",
        secretKey: "admin-secret",
        invisible: true,
        minScore: 0.7,
      });

      const challenge = getCaptchaChallenge("admin");
      expect(challenge?.provider).toBe("hcaptcha");
      expect(challenge?.invisible).toBe(true);
      expect(challenge?.minScore).toBe(0.7);
    });

    it("returns null for unknown config", () => {
      const challenge = getCaptchaChallenge("unknown");
      expect(challenge).toBeNull();
    });
  });

  describe("statistics", () => {
    it("returns stats", () => {
      setDefaultCaptchaConfig({ provider: "turnstile", siteKey: "k", secretKey: "s" });
      registerCaptchaConfig("test", { provider: "recaptcha", siteKey: "k", secretKey: "s" });

      const stats = getCaptchaStats();
      expect(stats.totalConfigs).toBe(2);
      expect(stats.uniqueIpsWithFailures).toBe(0);
    });

    it("tracks failed attempts in stats", async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ success: false }),
      } as Response);

      const config = { provider: "turnstile" as const, siteKey: "k", secretKey: "s" };
      await verifyCaptcha("invalid", config, "10.1.1.1");
      await verifyCaptcha("invalid", config, "10.1.1.2");

      const stats = getCaptchaStats();
      expect(stats.failedAttempts).toBe(2);
      expect(stats.uniqueIpsWithFailures).toBe(2);
    });
  });
});
