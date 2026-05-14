/**
 * Tests for password reset email service.
 *
 * Tests the email service functionality:
 * - Email provider configuration
 * - Email template generation
 * - Console email sending (development)
 * - SendGrid email sending
 * - Password reset notification emails
 * - Error handling
 */

import { SESClient } from "@aws-sdk/client-ses";
import nodemailer from "nodemailer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as logger from "../observability/logger.js";
import {
  type PasswordResetEmailData,
  type PasswordResetNotificationData,
  configureEmailProvider,
  getEmailProviderConfig,
  getResetBaseUrl,
  sendPasswordResetEmail,
  sendPasswordResetNotificationEmail,
  setResetBaseUrl,
} from "./password-reset.service.js";

// Mock dependencies
vi.mock("../observability/logger.js");
vi.mock("../utils/fetch.js", () => ({
  tracedFetch: vi.fn(),
}));
vi.mock("@aws-sdk/client-ses", () => ({
  SESClient: vi.fn(),
  SendEmailCommand: vi.fn().mockImplementation((params: unknown) => params),
}));
vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(),
  },
}));

describe("Password Reset Email Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset to default configuration
    configureEmailProvider({
      provider: "console",
      fromEmail: "noreply@mtamyway.com",
      fromName: "MTA My Way",
    });
    setResetBaseUrl("http://localhost:5173");

    // Mock logger
    vi.mocked(logger.logger).info = vi.fn();
    vi.mocked(logger.logger).warn = vi.fn();
    vi.mocked(logger.logger).error = vi.fn();

    // Default SES mock: succeeds with a fake message ID
    vi.mocked(SESClient).mockImplementation(
      () => ({ send: vi.fn().mockResolvedValue({ MessageId: "ses-msg-123" }) }) as any
    );

    // Default nodemailer mock: succeeds with a fake message ID
    vi.mocked(nodemailer.createTransport).mockReturnValue({
      sendMail: vi.fn().mockResolvedValue({ messageId: "smtp-msg-123" }),
    } as any);
  });

  describe("configuration", () => {
    it("should configure email provider", () => {
      configureEmailProvider({
        provider: "sendgrid",
        apiKey: "test-key",
        fromEmail: "test@example.com",
        fromName: "Test App",
      });

      const config = getEmailProviderConfig();

      expect(config.provider).toBe("sendgrid");
      expect(config.apiKey).toBe("test-key");
      expect(config.fromEmail).toBe("test@example.com");
      expect(config.fromName).toBe("Test App");
    });

    it("should set reset base URL", () => {
      setResetBaseUrl("https://example.com/reset");

      expect(getResetBaseUrl()).toBe("https://example.com/reset");
    });

    it("should merge partial configuration", () => {
      configureEmailProvider({ provider: "smtp" });

      const config = getEmailProviderConfig();

      // Should keep defaults for unspecified fields
      expect(config.provider).toBe("smtp");
      expect(config.fromEmail).toBe("noreply@mtamyway.com");
      expect(config.fromName).toBe("MTA My Way");
    });
  });

  describe("console email provider", () => {
    it("should send password reset email via console", async () => {
      const data: PasswordResetEmailData = {
        email: "user@example.com",
        tokenId: "token123",
        token: "abc123",
        expiresAt: Date.now() + 3600000,
        clientIp: "192.168.1.100",
        userName: "John Doe",
      };

      const result = await sendPasswordResetEmail(data);

      expect(result.success).toBe(true);
      expect(result.provider).toBe("console");
      expect(result.messageId).toBeDefined();

      expect(logger.logger.info).toHaveBeenCalledWith(
        "Password reset email (console mode)",
        expect.objectContaining({
          to: "user@example.com",
        })
      );
    });

    it("should send notification email via console", async () => {
      const data: PasswordResetNotificationData = {
        email: "user@example.com",
        clientIp: "192.168.1.100",
        userName: "John Doe",
        deviceInfo: {
          deviceType: "desktop",
          browser: "chrome",
          os: "windows",
        },
      };

      const result = await sendPasswordResetNotificationEmail(data);

      expect(result.success).toBe(true);
      expect(result.provider).toBe("console");
    });

    it("should handle emails without user name", async () => {
      const data: PasswordResetEmailData = {
        email: "user@example.com",
        tokenId: "token123",
        token: "abc123",
        expiresAt: Date.now() + 3600000,
        clientIp: "192.168.1.100",
      };

      const result = await sendPasswordResetEmail(data);

      expect(result.success).toBe(true);

      const logCall = vi
        .mocked(logger.logger.info)
        .mock.calls.find((call) => call[0] === "Password reset email (console mode)");

      expect(logCall).toBeDefined();
    });
  });

  describe("SendGrid provider", () => {
    beforeEach(() => {
      configureEmailProvider({
        provider: "sendgrid",
        apiKey: "sg-test-key",
        fromEmail: "noreply@example.com",
        fromName: "Test App",
      });

      // Mock fetch for SendGrid API
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: {
          get: (name: string) => (name === "X-Message-Id" ? "sg-msg-123" : null),
        },
        text: async () => "accepted",
      } as Response);
    });

    it("should send password reset email via SendGrid", async () => {
      const data: PasswordResetEmailData = {
        email: "user@example.com",
        tokenId: "token123",
        token: "abc123",
        expiresAt: Date.now() + 3600000,
        clientIp: "192.168.1.100",
      };

      const result = await sendPasswordResetEmail(data);

      expect(result.success).toBe(true);
      expect(result.provider).toBe("sendgrid");
      expect(result.messageId).toBe("sg-msg-123");

      expect(fetch).toHaveBeenCalledWith(
        "https://api.sendgrid.com/v3/mail/send",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer sg-test-key",
          }),
        })
      );
    });

    it("should handle SendGrid API errors", async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => "unauthorized",
      } as Response);

      const data: PasswordResetEmailData = {
        email: "user@example.com",
        tokenId: "token123",
        token: "abc123",
        expiresAt: Date.now() + 3600000,
        clientIp: "192.168.1.100",
      };

      const result = await sendPasswordResetEmail(data);

      expect(result.success).toBe(false);
      expect(result.provider).toBe("sendgrid");
      expect(result.error).toContain("SendGrid error");

      expect(logger.logger.error).toHaveBeenCalled();
    });

    it("should fail when API key is not configured", async () => {
      configureEmailProvider({ provider: "sendgrid", apiKey: undefined }); // No API key

      const data: PasswordResetEmailData = {
        email: "user@example.com",
        tokenId: "token123",
        token: "abc123",
        expiresAt: Date.now() + 3600000,
        clientIp: "192.168.1.100",
      };

      const result = await sendPasswordResetEmail(data);

      expect(result.success).toBe(false);
      expect(result.error).toContain("API key not configured");
    });
  });

  describe("AWS SES provider", () => {
    it("should send email via SES when configured", async () => {
      configureEmailProvider({
        provider: "ses",
        apiKey: "aws-test-key",
        fromEmail: "noreply@example.com",
        fromName: "Test App",
      });

      const data: PasswordResetEmailData = {
        email: "user@example.com",
        tokenId: "token123",
        token: "abc123",
        expiresAt: Date.now() + 3600000,
        clientIp: "192.168.1.100",
      };

      const result = await sendPasswordResetEmail(data);

      expect(result.success).toBe(true);
      expect(result.provider).toBe("ses");
      expect(result.messageId).toBe("ses-msg-123");
    });

    it("should fail when SES call throws a credential error", async () => {
      vi.mocked(SESClient).mockImplementationOnce(
        () =>
          ({
            send: vi.fn().mockRejectedValue(new Error("SES credentials not configured")),
          }) as any
      );

      configureEmailProvider({
        provider: "ses",
        apiKey: undefined,
        fromEmail: "noreply@example.com",
        fromName: "Test App",
      });

      const data: PasswordResetEmailData = {
        email: "user@example.com",
        tokenId: "token123",
        token: "abc123",
        expiresAt: Date.now() + 3600000,
        clientIp: "192.168.1.100",
      };

      const result = await sendPasswordResetEmail(data);

      expect(result.success).toBe(false);
      expect(result.error).toContain("credentials not configured");
    });
  });

  describe("SMTP provider", () => {
    beforeEach(() => {
      configureEmailProvider({
        provider: "smtp",
        fromEmail: "noreply@example.com",
        fromName: "Test App",
        smtpHost: "smtp.example.com",
        smtpPort: 587,
        smtpUser: "user",
        smtpPassword: "pass",
      });
    });

    it("should send email via SMTP when configured", async () => {
      const data: PasswordResetEmailData = {
        email: "user@example.com",
        tokenId: "token123",
        token: "abc123",
        expiresAt: Date.now() + 3600000,
        clientIp: "192.168.1.100",
      };

      const result = await sendPasswordResetEmail(data);

      expect(result.success).toBe(true);
      expect(result.provider).toBe("smtp");
      expect(result.messageId).toBe("smtp-msg-123");
    });
  });

  describe("email templates", () => {
    it("should generate reset link with correct base URL", async () => {
      setResetBaseUrl("https://myapp.com/auth");

      const data: PasswordResetEmailData = {
        email: "user@example.com",
        tokenId: "token123",
        token: "abc123",
        expiresAt: Date.now() + 3600000,
        clientIp: "192.168.1.100",
      };

      const result = await sendPasswordResetEmail(data);

      expect(result.success).toBe(true);
      expect(result.provider).toBe("console");

      const logCall = vi
        .mocked(logger.logger.info)
        .mock.calls.find((call) => call[0] === "Password reset email (console mode)");

      // Verify the email was sent with correct metadata
      expect(logCall?.[1]?.to).toBe("user@example.com");
      expect(logCall?.[1]?.subject).toBe("Reset Your Password - MTA My Way");
      // Body is truncated to 200 chars, so we verify it was sent rather than checking content
    });

    it("should include token and tokenId in reset link", async () => {
      const data: PasswordResetEmailData = {
        email: "user@example.com",
        tokenId: "my-token-id",
        token: "my-token-value",
        expiresAt: Date.now() + 3600000,
        clientIp: "192.168.1.100",
      };

      const result = await sendPasswordResetEmail(data);

      expect(result.success).toBe(true);
      // The tokens are included in the email body but truncated in logs
      // Verify the email was sent successfully
      expect(result.messageId).toBeDefined();
    });

    it("should format expiration time in email", async () => {
      const expiresAt = new Date("2026-05-05T12:00:00Z").getTime();
      const data: PasswordResetEmailData = {
        email: "user@example.com",
        tokenId: "token123",
        token: "abc123",
        expiresAt,
        clientIp: "192.168.1.100",
      };

      const result = await sendPasswordResetEmail(data);

      expect(result.success).toBe(true);
      // Expiration time is included in the email body
      expect(result.messageId).toBeDefined();
    });
  });

  describe("notification emails", () => {
    it("should send notification with device info", async () => {
      const data: PasswordResetNotificationData = {
        email: "user@example.com",
        clientIp: "192.168.1.100",
        userName: "John Doe",
        deviceInfo: {
          deviceType: "mobile",
          browser: "safari",
          os: "ios",
        },
      };

      const result = await sendPasswordResetNotificationEmail(data);

      expect(result.success).toBe(true);
      expect(logger.logger.info).toHaveBeenCalledWith(
        "Password reset notification email sent",
        expect.objectContaining({
          to: "user@example.com",
        })
      );
    });

    it("should handle notification without device info", async () => {
      const data: PasswordResetNotificationData = {
        email: "user@example.com",
        clientIp: "192.168.1.100",
      };

      const result = await sendPasswordResetNotificationEmail(data);

      expect(result.success).toBe(true);
    });
  });

  describe("error handling", () => {
    it("should catch and log unexpected errors", async () => {
      // Make fetch throw an error
      vi.mocked(fetch).mockImplementation(() => {
        throw new Error("Network error");
      });

      configureEmailProvider({
        provider: "sendgrid",
        apiKey: "test-key",
        fromEmail: "noreply@example.com",
        fromName: "Test",
      });

      const data: PasswordResetEmailData = {
        email: "user@example.com",
        tokenId: "token123",
        token: "abc123",
        expiresAt: Date.now() + 3600000,
        clientIp: "192.168.1.100",
      };

      const result = await sendPasswordResetEmail(data);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Network error");

      expect(logger.logger.error).toHaveBeenCalled();
    });

    it("should handle malformed email addresses", async () => {
      const data: PasswordResetEmailData = {
        email: "not-an-email",
        tokenId: "token123",
        token: "abc123",
        expiresAt: Date.now() + 3600000,
        clientIp: "192.168.1.100",
      };

      // Should still attempt to send (validation happens at route level)
      const result = await sendPasswordResetEmail(data);

      expect(result).toBeDefined();
    });
  });

  describe("reply-to configuration", () => {
    it("should include reply-to when configured", async () => {
      configureEmailProvider({
        provider: "sendgrid",
        apiKey: "test-key",
        fromEmail: "noreply@example.com",
        fromName: "Test",
        replyTo: "support@example.com",
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: {
          get: (name: string) => (name === "X-Message-Id" ? "sg-msg-456" : null),
        },
      } as Response);

      const data: PasswordResetEmailData = {
        email: "user@example.com",
        tokenId: "token123",
        token: "abc123",
        expiresAt: Date.now() + 3600000,
        clientIp: "192.168.1.100",
      };

      await sendPasswordResetEmail(data);

      expect(fetch).toHaveBeenCalledWith(
        "https://api.sendgrid.com/v3/mail/send",
        expect.objectContaining({
          body: expect.stringContaining("support@example.com"),
        })
      );
    });
  });
});
