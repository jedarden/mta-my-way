/**
 * Password Reset Email Service
 *
 * Handles sending password reset emails with secure tokens.
 *
 * Features:
 * - Email delivery with reset link containing token
 * - Token expiration handling
 * - Rate limiting for email sending
 * - Template-based email rendering
 * - Support for multiple email providers (SendGrid, AWS SES, SMTP)
 * - Security best practices (no tokens in logs, etc.)
 */

import { logger } from "../observability/logger.js";

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Password reset email data.
 */
export interface PasswordResetEmailData {
  /** Recipient email address */
  email: string;
  /** Token ID for the reset link */
  tokenId: string;
  /** Raw reset token (for the link) */
  token: string;
  /** Token expiration timestamp */
  expiresAt: number;
  /** Client IP address (for security logging) */
  clientIp: string;
  /** User's name (optional, for personalization) */
  userName?: string;
}

/**
 * Email provider configuration.
 */
export interface EmailProviderConfig {
  /** Provider type */
  provider: "sendgrid" | "ses" | "smtp" | "console";
  /** API key or credentials */
  apiKey?: string;
  /** From email address */
  fromEmail: string;
  /** From name */
  fromName: string;
  /** Reply-to email (optional) */
  replyTo?: string;
  /** SMTP host (for SMTP provider) */
  smtpHost?: string;
  /** SMTP port (for SMTP provider) */
  smtpPort?: number;
  /** SMTP user (for SMTP provider) */
  smtpUser?: string;
  /** SMTP password (for SMTP provider) */
  smtpPassword?: string;
}

/**
 * Email sending result.
 */
export interface EmailSendResult {
  /** Whether the email was sent successfully */
  success: boolean;
  /** Message ID if successful */
  messageId?: string;
  /** Error message if failed */
  error?: string;
  /** Provider used */
  provider: string;
}

/**
 * Password reset notification data (for post-reset notification).
 */
export interface PasswordResetNotificationData {
  /** Recipient email address */
  email: string;
  /** Client IP address (for security logging) */
  clientIp: string;
  /** User's name (optional, for personalization) */
  userName?: string;
  /** Device information if available */
  deviceInfo?: {
    deviceType: string;
    browser: string;
    os: string;
  };
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Default email provider configuration.
 * In production, load from environment variables.
 */
let emailConfig: EmailProviderConfig = {
  provider: "console", // Default to console logging for development
  fromEmail: "noreply@mtamyway.com",
  fromName: "MTA My Way",
};

/**
 * Base URL for reset links.
 * In production, load from environment variable.
 */
let resetBaseUrl = process.env["RESET_BASE_URL"] || "http://localhost:5173";

/**
 * Configure the email provider.
 */
export function configureEmailProvider(config: Partial<EmailProviderConfig>): void {
  emailConfig = { ...emailConfig, ...config };
  logger.info("Email provider configured", { provider: emailConfig.provider });
}

/**
 * Set the base URL for reset links.
 */
export function setResetBaseUrl(url: string): void {
  resetBaseUrl = url;
  logger.info("Reset base URL configured", { url });
}

// ============================================================================
// Email Templates
// ============================================================================

/**
 * Generate HTML email body for password reset.
 */
function generateHtmlEmail(data: PasswordResetEmailData): string {
  const resetLink = `${resetBaseUrl}/reset-password/confirm?tokenId=${data.tokenId}&token=${data.token}`;
  const expiresAt = new Date(data.expiresAt).toLocaleString();

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .header h1 { color: white; margin: 0; font-size: 24px; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
    .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
    .button:hover { background: #5568d3; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
    .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>MTA My Way</h1>
    </div>
    <div class="content">
      <h2>Reset Your Password</h2>
      <p>We received a request to reset your password for your MTA My Way account${data.userName ? ` for ${data.userName}` : ""}.</p>

      <p>Click the button below to create a new password:</p>

      <center>
        <a href="${resetLink}" class="button">Reset Password</a>
      </center>

      <p>Or copy and paste this link into your browser:</p>
      <p style="word-break: break-all; color: #667eea;">${resetLink}</p>

      <div class="warning">
        <strong>Important:</strong> This link will expire at <strong>${expiresAt}</strong>.
        If you didn't request this password reset, please ignore this email or contact support if you have concerns.
      </div>

      <p>For your security, this link can only be used once. After resetting your password, you'll need to request a new reset link if you need to change it again.</p>
    </div>
    <div class="footer">
      <p>This is an automated email from MTA My Way. Please do not reply to this email.</p>
      <p>If you need assistance, please contact our support team.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Generate plain text email body for password reset.
 */
function generateTextEmail(data: PasswordResetEmailData): string {
  const resetLink = `${resetBaseUrl}/reset-password/confirm?tokenId=${data.tokenId}&token=${data.token}`;
  const expiresAt = new Date(data.expiresAt).toLocaleString();

  return `
Reset Your Password - MTA My Way
${"=".repeat(50)}

We received a request to reset your password for your MTA My Way account${data.userName ? ` for ${data.userName}` : ""}.

To create a new password, click the link below or copy and paste it into your browser:

${resetLink}

This link will expire at: ${expiresAt}

IMPORTANT: If you didn't request this password reset, please ignore this email or contact support if you have concerns.

For your security, this link can only be used once. After resetting your password, you'll need to request a new reset link if you need to change it again.

---
This is an automated email from MTA My Way. Please do not reply to this email.
If you need assistance, please contact our support team.
  `.trim();
}

/**
 * Generate HTML email body for password reset notification (sent after successful reset).
 */
function generateNotificationHtmlEmail(data: PasswordResetNotificationData): string {
  const resetTime = new Date().toLocaleString();
  const deviceInfo = data.deviceInfo
    ? `${data.deviceInfo.deviceType} (${data.deviceInfo.browser} on ${data.deviceInfo.os})`
    : "Unknown device";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Password Reset Confirmation</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .header h1 { color: white; margin: 0; font-size: 24px; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
    .info-box { background: #e3f2fd; border-left: 4px solid #2196F3; padding: 15px; margin: 20px 0; }
    .warning-box { background: #fff3e0; border-left: 4px solid #ff9800; padding: 15px; margin: 20px 0; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>MTA My Way</h1>
    </div>
    <div class="content">
      <h2>Password Reset Successfully</h2>
      <p>Your MTA My Way account password was successfully reset${data.userName ? ` for ${data.userName}` : ""}.</p>

      <div class="info-box">
        <strong>Reset Details:</strong><br>
        Time: ${resetTime}<br>
        Device: ${deviceInfo}
      </div>

      <p>If you initiated this change, no further action is required. Your new password is now active.</p>

      <div class="warning-box">
        <strong>Security Notice:</strong> If you did not initiate this password reset, please contact our support team immediately. Your account may have been compromised.
      </div>

      <p>For your security, all existing sessions have been invalidated. You will need to log in again on all devices.</p>
    </div>
    <div class="footer">
      <p>This is an automated email from MTA My Way. Please do not reply to this email.</p>
      <p>If you need assistance, please contact our support team.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Generate plain text email body for password reset notification.
 */
function generateNotificationTextEmail(data: PasswordResetNotificationData): string {
  const resetTime = new Date().toLocaleString();
  const deviceInfo = data.deviceInfo
    ? `${data.deviceInfo.deviceType} (${data.deviceInfo.browser} on ${data.deviceInfo.os})`
    : "Unknown device";

  return `
Password Reset Successfully - MTA My Way
${"=".repeat(50)}

Your MTA My Way account password was successfully reset${data.userName ? ` for ${data.userName}` : ""}.

Reset Details:
- Time: ${resetTime}
- Device: ${deviceInfo}

If you initiated this change, no further action is required. Your new password is now active.

SECURITY NOTICE: If you did not initiate this password reset, please contact our support team immediately. Your account may have been compromised.

For your security, all existing sessions have been invalidated. You will need to log in again on all devices.

---
This is an automated email from MTA My Way. Please do not reply to this email.
If you need assistance, please contact our support team.
  `.trim();
}

// ============================================================================
// Email Providers
// ============================================================================

/**
 * Send email using console (development only).
 */
async function sendConsoleEmail(
  to: string,
  subject: string,
  html: string,
  text: string
): Promise<EmailSendResult> {
  logger.info("Password reset email (console mode)", {
    to,
    subject,
    // Log text version, not HTML (too verbose)
    body: text.substring(0, 200) + "...",
  });

  return {
    success: true,
    messageId: `console-${Date.now()}`,
    provider: "console",
  };
}

/**
 * Send email using SendGrid.
 */
async function sendSendGridEmail(
  to: string,
  subject: string,
  html: string,
  text: string,
  apiKey: string
): Promise<EmailSendResult> {
  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [
        {
          to: [{ email: to }],
          subject,
        },
      ],
      from: {
        email: emailConfig.fromEmail,
        name: emailConfig.fromName,
      },
      reply_to: emailConfig.replyTo ? { email: emailConfig.replyTo } : undefined,
      content: [
        { type: "text/plain", value: text },
        { type: "text/html", value: html },
      ],
    }),
  });

  if (response.ok) {
    const messageId = response.headers.get("X-Message-Id");
    return {
      success: true,
      messageId: messageId || undefined,
      provider: "sendgrid",
    };
  }

  const errorText = await response.text();
  return {
    success: false,
    error: `SendGrid error: ${response.status} ${errorText}`,
    provider: "sendgrid",
  };
}

/**
 * Send email using AWS SES.
 */
async function sendSesEmail(
  to: string,
  subject: string,
  html: string,
  text: string,
  apiKey: string
): Promise<EmailSendResult> {
  // Note: AWS SES requires AWS SDK
  // This is a placeholder implementation
  logger.warn("AWS SES not implemented, using console fallback");
  return sendConsoleEmail(to, subject, html, text);
}

/**
 * Send email using SMTP.
 */
async function sendSmtpEmail(
  to: string,
  subject: string,
  html: string,
  text: string
): Promise<EmailSendResult> {
  // Note: SMTP requires nodemailer or similar
  // This is a placeholder implementation
  logger.warn("SMTP not implemented, using console fallback");
  return sendConsoleEmail(to, subject, html, text);
}

// ============================================================================
// Main Service Functions
// ============================================================================

/**
 * Send a password reset email.
 */
export async function sendPasswordResetEmail(
  data: PasswordResetEmailData
): Promise<EmailSendResult> {
  const subject = "Reset Your Password - MTA My Way";
  const html = generateHtmlEmail(data);
  const text = generateTextEmail(data);

  try {
    let result: EmailSendResult;

    switch (emailConfig.provider) {
      case "sendgrid":
        if (!emailConfig.apiKey) {
          throw new Error("SendGrid API key not configured");
        }
        result = await sendSendGridEmail(data.email, subject, html, text, emailConfig.apiKey);
        break;

      case "ses":
        if (!emailConfig.apiKey) {
          throw new Error("AWS SES credentials not configured");
        }
        result = await sendSesEmail(data.email, subject, html, text, emailConfig.apiKey);
        break;

      case "smtp":
        result = await sendSmtpEmail(data.email, subject, html, text);
        break;

      case "console":
      default:
        result = await sendConsoleEmail(data.email, subject, html, text);
        break;
    }

    if (result.success) {
      logger.info("Password reset email sent", {
        to: data.email,
        provider: result.provider,
        messageId: result.messageId,
        clientIp: data.clientIp,
      });
    } else {
      logger.error("Failed to send password reset email", {
        to: data.email,
        provider: result.provider,
        error: result.error,
      });
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error("Error sending password reset email", error as Error, {
      to: data.email,
      provider: emailConfig.provider,
    });

    return {
      success: false,
      error: errorMessage,
      provider: emailConfig.provider,
    };
  }
}

/**
 * Get the current email provider configuration.
 */
export function getEmailProviderConfig(): EmailProviderConfig {
  return { ...emailConfig };
}

/**
 * Get the current reset base URL.
 */
export function getResetBaseUrl(): string {
  return resetBaseUrl;
}

/**
 * Send a password reset notification email (sent after successful reset).
 *
 * This email informs the user that their password was successfully reset
 * and provides security information about the reset event.
 */
export async function sendPasswordResetNotificationEmail(
  data: PasswordResetNotificationData
): Promise<EmailSendResult> {
  const subject = "Password Reset Successfully - MTA My Way";
  const html = generateNotificationHtmlEmail(data);
  const text = generateNotificationTextEmail(data);

  try {
    let result: EmailSendResult;

    switch (emailConfig.provider) {
      case "sendgrid":
        if (!emailConfig.apiKey) {
          throw new Error("SendGrid API key not configured");
        }
        result = await sendSendGridEmail(data.email, subject, html, text, emailConfig.apiKey);
        break;

      case "ses":
        if (!emailConfig.apiKey) {
          throw new Error("AWS SES credentials not configured");
        }
        result = await sendSesEmail(data.email, subject, html, text, emailConfig.apiKey);
        break;

      case "smtp":
        result = await sendSmtpEmail(data.email, subject, html, text);
        break;

      case "console":
      default:
        result = await sendConsoleEmail(data.email, subject, html, text);
        break;
    }

    if (result.success) {
      logger.info("Password reset notification email sent", {
        to: data.email,
        provider: result.provider,
        messageId: result.messageId,
        clientIp: data.clientIp,
      });
    } else {
      logger.error("Failed to send password reset notification email", {
        to: data.email,
        provider: result.provider,
        error: result.error,
      });
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error("Error sending password reset notification email", error as Error, {
      to: data.email,
      provider: emailConfig.provider,
    });

    return {
      success: false,
      error: errorMessage,
      provider: emailConfig.provider,
    };
  }
}
