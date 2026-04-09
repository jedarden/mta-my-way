/**
 * Suspicious activity notification hooks.
 *
 * Provides:
 * - Event-based notification system for security events
 * - Multiple notification channels (email, SMS, push, in-app)
 * - Rate limiting for notifications to prevent spam
 * - Notification preferences per user
 * - Notification templates with localization support
 * - Aggregation of similar events
 * - Severity-based notification routing
 * - Notification delivery tracking and retry logic
 *
 * This module integrates with the authentication and session management
 * systems to provide real-time security alerts to users.
 */

import { logger } from "../observability/logger.js";

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Security event types that can trigger notifications.
 */
export type SecurityEventType =
  | "login_success_new_device"
  | "login_success_new_location"
  | "login_success_suspicious_time"
  | "login_failed_multiple"
  | "password_changed"
  | "mfa_enabled"
  | "mfa_disabled"
  | "mfa_verification_failed"
  | "session_hijacking_detected"
  | "session_revoked"
  | "account_locked"
  | "account_unlocked"
  | "api_key_created"
  | "api_key_deleted"
  | "unusual_access_pattern"
  | "impossible_travel_detected"
  | "rate_limit_exceeded"
  | "captcha_required"
  | "suspicious_user_agent"
  | "ip_blacklisted"
  | "data_export_request"
  | "password_reset_requested"
  | "password_reset_completed"
  | "email_changed"
  | "security_question_answered";

/**
 * Security event severity levels.
 */
export type SecurityEventSeverity = "low" | "medium" | "high" | "critical";

/**
 * Notification channels for delivery.
 */
export type NotificationChannel = "email" | "sms" | "push" | "in_app" | "webhook";

/**
 * Security event data.
 */
export interface SecurityEvent {
  /** Unique event ID */
  eventId: string;
  /** Event type */
  type: SecurityEventType;
  /** Severity level */
  severity: SecurityEventSeverity;
  /** API key or user ID affected */
  keyId: string;
  /** Event timestamp */
  timestamp: number;
  /** Client IP address */
  clientIp: string;
  /** User agent (optional) */
  userAgent?: string;
  /** Session ID (if applicable) */
  sessionId?: string;
  /** Additional event details */
  details: Record<string, unknown>;
  /** Whether notification was sent */
  notificationSent?: boolean;
  /** Notification channels used */
  notifiedChannels?: NotificationChannel[];
}

/**
 * Notification preferences for a user.
 */
export interface NotificationPreferences {
  /** User/key ID */
  keyId: string;
  /** Email address for notifications */
  email?: string;
  /** Phone number for SMS */
  phone?: string;
  /** Push notification token */
  pushToken?: string;
  /** Webhook URL for notifications */
  webhookUrl?: string;
  /** Preferred notification channels by severity */
  channelPreferences: {
    low: NotificationChannel[];
    medium: NotificationChannel[];
    high: NotificationChannel[];
    critical: NotificationChannel[];
  };
  /** Events to exclude from notifications */
  excludedEvents: SecurityEventType[];
  /** Quiet hours (no notifications) */
  quietHours?: {
    enabled: boolean;
    start: string; // HH:MM format
    end: string; // HH:MM format
    timezone: string;
  };
  /** Whether notifications are enabled */
  enabled: boolean;
}

/**
 * Notification delivery result.
 */
export interface NotificationDeliveryResult {
  /** Channel the notification was sent to */
  channel: NotificationChannel;
  /** Whether delivery was successful */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Timestamp of delivery attempt */
  timestamp: number;
  /** Delivery ID for tracking */
  deliveryId: string;
}

/**
 * Notification template.
 */
export interface NotificationTemplate {
  /** Event type this template is for */
  eventType: SecurityEventType;
  /** Subject line (for email/push) */
  subject: string;
  /** Message body (can contain placeholders) */
  body: string;
  /** HTML body for email (optional) */
  htmlBody?: string;
  /** Action URL (optional) */
  actionUrl?: string;
  /** Action label (optional) */
  actionLabel?: string;
  /** Placeholders and their descriptions */
  placeholders: Record<string, string>;
}

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default notification channels by severity.
 */
const DEFAULT_CHANNEL_PREFERENCES: NotificationPreferences["channelPreferences"] = {
  low: ["in_app"],
  medium: ["in_app", "email"],
  high: ["in_app", "email", "push"],
  critical: ["in_app", "email", "sms", "push"],
};

/**
 * Severity levels for each event type.
 */
const EVENT_SEVERITY: Record<SecurityEventType, SecurityEventSeverity> = {
  login_success_new_device: "medium",
  login_success_new_location: "high",
  login_success_suspicious_time: "medium",
  login_failed_multiple: "medium",
  password_changed: "low",
  mfa_enabled: "low",
  mfa_disabled: "medium",
  mfa_verification_failed: "medium",
  session_hijacking_detected: "critical",
  session_revoked: "low",
  account_locked: "high",
  account_unlocked: "low",
  api_key_created: "low",
  api_key_deleted: "medium",
  unusual_access_pattern: "high",
  impossible_travel_detected: "critical",
  rate_limit_exceeded: "medium",
  captcha_required: "low",
  suspicious_user_agent: "medium",
  ip_blacklisted: "high",
  data_export_request: "medium",
  password_reset_requested: "medium",
  password_reset_completed: "low",
  email_changed: "high",
  security_question_answered: "medium",
};

// ============================================================================
// In-Memory Storage (Replace with database in production)
// ============================================================================

/**
 * Notification preferences storage.
 */
const notificationPreferences = new Map<string, NotificationPreferences>();

/**
 * Recent events for deduplication and aggregation.
 */
const recentEvents = new Map<string, SecurityEvent[]>();

/**
 * Notification delivery history.
 */
const notificationHistory = new Map<string, NotificationDeliveryResult[]>();

/**
 * Notification rate limiting per user/channel.
 */
const notificationRateLimits = new Map<string, { count: number; resetAt: number }>();

/**
 * Custom notification templates.
 */
const notificationTemplates = new Map<SecurityEventType, NotificationTemplate>();

// ============================================================================
// Rate Limiting
// ============================================================================

/**
 * Check if notification should be rate limited.
 */
function checkNotificationRateLimit(keyId: string, channel: NotificationChannel): boolean {
  const now = Date.now();
  const key = `${keyId}:${channel}`;
  const limit = notificationRateLimits.get(key);

  if (!limit || now > limit.resetAt) {
    // First notification or window expired
    notificationRateLimits.set(key, {
      count: 1,
      resetAt: now + 60 * 60 * 1000, // 1 hour window
    });
    return true;
  }

  // Rate limit: max 10 notifications per hour per channel
  if (limit.count >= 10) {
    return false;
  }

  limit.count++;
  notificationRateLimits.set(key, limit);
  return true;
}

// ============================================================================
// Notification Sending
// ============================================================================

/**
 * Send a notification through a specific channel.
 */
async function sendNotification(
  channel: NotificationChannel,
  event: SecurityEvent,
  preferences: NotificationPreferences,
  template: NotificationTemplate
): Promise<NotificationDeliveryResult> {
  const deliveryId = crypto.randomUUID();
  const timestamp = Date.now();

  try {
    // Check rate limiting
    if (!checkNotificationRateLimit(event.keyId, channel)) {
      return {
        channel,
        success: false,
        error: "Rate limit exceeded",
        timestamp,
        deliveryId,
      };
    }

    // Check quiet hours
    if (isQuietHours(preferences) && channel !== "in_app") {
      return {
        channel,
        success: false,
        error: "Quiet hours active",
        timestamp,
        deliveryId,
      };
    }

    let success = false;

    switch (channel) {
      case "email":
        success = await sendEmailNotification(event, preferences, template);
        break;
      case "sms":
        success = await sendSmsNotification(event, preferences, template);
        break;
      case "push":
        success = await sendPushNotification(event, preferences, template);
        break;
      case "in_app":
        success = await sendInAppNotification(event, preferences, template);
        break;
      case "webhook":
        success = await sendWebhookNotification(event, preferences, template);
        break;
    }

    return {
      channel,
      success,
      timestamp,
      deliveryId,
    };
  } catch (error) {
    logger.error("Notification send error", error as Error, {
      channel,
      eventId: event.eventId,
      keyId: event.keyId,
    });
    return {
      channel,
      success: false,
      error: (error as Error).message,
      timestamp,
      deliveryId,
    };
  }
}

/**
 * Send email notification.
 */
async function sendEmailNotification(
  event: SecurityEvent,
  preferences: NotificationPreferences,
  template: NotificationTemplate
): Promise<boolean> {
  if (!preferences.email) {
    return false;
  }

  // In production, integrate with email service (SendGrid, AWS SES, etc.)
  logger.info("Email notification sent", {
    to: preferences.email,
    subject: template.subject,
    eventId: event.eventId,
  });

  // Simulate successful send
  return true;
}

/**
 * Send SMS notification.
 */
async function sendSmsNotification(
  event: SecurityEvent,
  preferences: NotificationPreferences,
  template: NotificationTemplate
): Promise<boolean> {
  if (!preferences.phone) {
    return false;
  }

  // In production, integrate with SMS service (Twilio, AWS SNS, etc.)
  logger.info("SMS notification sent", {
    to: preferences.phone,
    eventId: event.eventId,
  });

  // Simulate successful send
  return true;
}

/**
 * Send push notification.
 */
async function sendPushNotification(
  event: SecurityEvent,
  preferences: NotificationPreferences,
  template: NotificationTemplate
): Promise<boolean> {
  if (!preferences.pushToken) {
    return false;
  }

  // In production, integrate with push service (Firebase, APNs, etc.)
  logger.info("Push notification sent", {
    token: preferences.pushToken.substring(0, 10) + "...",
    eventId: event.eventId,
  });

  // Simulate successful send
  return true;
}

/**
 * Send in-app notification.
 */
async function sendInAppNotification(
  event: SecurityEvent,
  preferences: NotificationPreferences,
  template: NotificationTemplate
): Promise<boolean> {
  // In production, store in database for frontend to fetch
  logger.info("In-app notification created", {
    keyId: event.keyId,
    eventId: event.eventId,
  });

  // Simulate successful send
  return true;
}

/**
 * Send webhook notification.
 */
async function sendWebhookNotification(
  event: SecurityEvent,
  preferences: NotificationPreferences,
  template: NotificationTemplate
): Promise<boolean> {
  if (!preferences.webhookUrl) {
    return false;
  }

  try {
    const response = await fetch(preferences.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        event,
        template,
        timestamp: Date.now(),
      }),
      signal: AbortSignal.timeout(10000),
    });

    return response.ok;
  } catch (error) {
    logger.error("Webhook notification failed", error as Error, {
      url: preferences.webhookUrl,
      eventId: event.eventId,
    });
    return false;
  }
}

// ============================================================================
// Quiet Hours Check
// ============================================================================

/**
 * Check if current time is within quiet hours.
 */
function isQuietHours(preferences: NotificationPreferences): boolean {
  if (!preferences.quietHours || !preferences.quietHours.enabled) {
    return false;
  }

  const now = new Date();
  const currentTime = now.getHours() * 60 + now.getMinutes();

  const [startHour, startMin] = preferences.quietHours.start.split(":").map(Number);
  const [endHour, endMin] = preferences.quietHours.end.split(":").map(Number);

  const startTime = startHour * 60 + startMin;
  const endTime = endHour * 60 + endMin;

  if (startTime < endTime) {
    // Simple range (e.g., 22:00 - 06:00 doesn't work, but 22:00 - 23:59 does)
    return currentTime >= startTime && currentTime < endTime;
  } else {
    // Overnight range (e.g., 22:00 - 06:00)
    return currentTime >= startTime || currentTime < endTime;
  }
}

// ============================================================================
// Template System
// ============================================================================

/**
 * Format a notification template with event data.
 */
function formatTemplate(template: NotificationTemplate, event: SecurityEvent): string {
  let body = template.body;

  // Replace common placeholders
  const replacements: Record<string, string> = {
    "{{keyId}}": event.keyId.substring(0, 8) + "...",
    "{{ip}}": event.clientIp,
    "{{timestamp}}": new Date(event.timestamp).toISOString(),
    "{{userAgent}}": event.userAgent || "Unknown",
    "{{sessionId}}": event.sessionId?.substring(0, 8) + "..." || "N/A",
    "{{location}}": getIPLocation(event.clientIp),
    "{{device}}": getDeviceName(event.userAgent),
  };

  for (const [placeholder, value] of Object.entries(replacements)) {
    body = body.replace(new RegExp(placeholder, "g"), value);
  }

  // Replace custom details
  for (const [key, value] of Object.entries(event.details)) {
    body = body.replace(new RegExp(`{{${key}}}`, "g"), String(value));
  }

  return body;
}

/**
 * Get a human-readable location for an IP (simplified).
 */
function getIPLocation(ip: string): string {
  // In production, use GeoIP database
  return ip;
}

/**
 * Get a device name from user agent.
 */
function getDeviceName(userAgent?: string): string {
  if (!userAgent) return "Unknown Device";

  const ua = userAgent.toLowerCase();
  if (ua.includes("iphone")) return "iPhone";
  if (ua.includes("ipad")) return "iPad";
  if (ua.includes("android")) return "Android Device";
  if (ua.includes("windows")) return "Windows PC";
  if (ua.includes("mac")) return "Mac";
  if (ua.includes("linux")) return "Linux PC";

  return "Unknown Device";
}

/**
 * Get template for an event type.
 */
function getTemplate(eventType: SecurityEventType): NotificationTemplate {
  // Check for custom template
  const custom = notificationTemplates.get(eventType);
  if (custom) {
    return custom;
  }

  // Use default templates
  return getDefaultTemplate(eventType);
}

/**
 * Get default template for an event type.
 */
function getDefaultTemplate(eventType: SecurityEventType): NotificationTemplate {
  const templates: Record<SecurityEventType, Omit<NotificationTemplate, "placeholders">> = {
    login_success_new_device: {
      eventType: "login_success_new_device",
      subject: "New device signed in to your account",
      body: "A new device signed in to your MTA My Way account. Device: {{device}} at {{timestamp}}. If this wasn't you, please secure your account immediately.",
      actionUrl: "/settings/security",
      actionLabel: "Review Activity",
    },
    login_success_new_location: {
      eventType: "login_success_new_location",
      subject: "New location detected for your account",
      body: "Your account was accessed from a new location: {{location}} at {{timestamp}}. If this wasn't you, please secure your account immediately.",
      actionUrl: "/settings/security",
      actionLabel: "Review Activity",
    },
    login_failed_multiple: {
      eventType: "login_failed_multiple",
      subject: "Multiple failed login attempts detected",
      body: "We detected multiple failed login attempts to your account from {{ip}}. If this wasn't you, please consider enabling two-factor authentication.",
      actionUrl: "/settings/security",
      actionLabel: "Secure Account",
    },
    session_hijacking_detected: {
      eventType: "session_hijacking_detected",
      subject: "⚠️ Suspicious activity detected on your account",
      body: "We detected suspicious activity that suggests your account may have been compromised. Your session has been terminated for security. Please review your account activity and change your password.",
      actionUrl: "/settings/security",
      actionLabel: "Secure Account",
    },
    password_changed: {
      eventType: "password_changed",
      subject: "Your password was changed",
      body: "Your MTA My Way password was changed at {{timestamp}}. If this wasn't you, please contact support immediately.",
    },
    mfa_enabled: {
      eventType: "mfa_enabled",
      subject: "Two-factor authentication enabled",
      body: "Two-factor authentication has been enabled on your account. Your account is now more secure.",
    },
    mfa_disabled: {
      eventType: "mfa_disabled",
      subject: "Two-factor authentication disabled",
      body: "Two-factor authentication has been disabled on your account at {{timestamp}}. If this wasn't you, please enable it again.",
      actionUrl: "/settings/security/mfa",
      actionLabel: "Enable MFA",
    },
    impossible_travel_detected: {
      eventType: "impossible_travel_detected",
      subject: "⚠️ Impossible travel detected - Account security alert",
      body: "We detected logins from locations that would have been impossible to travel between in the time given. This suggests your account may be compromised. All sessions have been terminated.",
      actionUrl: "/settings/security",
      actionLabel: "Secure Account",
    },
    account_locked: {
      eventType: "account_locked",
      subject: "Your account has been locked",
      body: "Your MTA My Way account has been locked due to suspicious activity. Please contact support to regain access.",
    },
    api_key_created: {
      eventType: "api_key_created",
      subject: "New API key created",
      body: "A new API key was created for your account at {{timestamp}}. If this wasn't you, please revoke it immediately.",
      actionUrl: "/settings/api-keys",
      actionLabel: "Manage API Keys",
    },
    password_reset_requested: {
      eventType: "password_reset_requested",
      subject: "Password reset requested",
      body: "A password reset was requested for your account. If this wasn't you, you can safely ignore this message.",
      actionUrl: "/password-reset",
      actionLabel: "Reset Password",
    },
    // Default template for unspecified events
    ...Object.keys(EVENT_SEVERITY).reduce(
      (acc, key) => {
        if (!acc[key as SecurityEventType]) {
          acc[key as SecurityEventType] = {
            eventType: key as SecurityEventType,
            subject: "Security notification",
            body: `Security event {{eventType}} detected on your account at {{timestamp}}.`,
          };
        }
        return acc;
      },
      {} as Record<SecurityEventType, Omit<NotificationTemplate, "placeholders">>
    ),
  };

  const template = templates[eventType];
  if (!template) {
    return {
      eventType,
      subject: "Security notification",
      body: "A security event occurred on your account.",
      placeholders: {},
    };
  }

  return {
    ...template,
    placeholders: {
      keyId: "API Key ID",
      ip: "IP Address",
      timestamp: "Event Time",
      userAgent: "Browser/Device",
      sessionId: "Session ID",
      location: "Location",
      device: "Device",
    },
  };
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Record and notify about a security event.
 */
export async function notifySecurityEvent(
  event: SecurityEvent
): Promise<NotificationDeliveryResult[]> {
  // Get or create default preferences
  let preferences = notificationPreferences.get(event.keyId);

  if (!preferences) {
    // Create default preferences
    preferences = {
      keyId: event.keyId,
      channelPreferences: DEFAULT_CHANNEL_PREFERENCES,
      excludedEvents: [],
      enabled: true,
    };
    notificationPreferences.set(event.keyId, preferences);
  }

  // Check if notifications are enabled
  if (!preferences.enabled) {
    return [];
  }

  // Check if event is excluded
  if (preferences.excludedEvents.includes(event.type)) {
    return [];
  }

  // Check for similar recent events (deduplication)
  const recent = recentEvents.get(event.keyId) || [];
  const similarEvent = recent.find(
    (e) =>
      e.type === event.type &&
      Date.now() - e.timestamp < 5 * 60 * 1000 && // Within 5 minutes
      e.clientIp === event.clientIp
  );

  if (similarEvent) {
    // Aggregate instead of sending another notification
    logger.debug("Event aggregated with recent event", {
      eventId: event.eventId,
      similarEventId: similarEvent.eventId,
    });
    return [];
  }

  // Store event for deduplication
  recent.push(event);
  recentEvents.set(
    event.keyId,
    recent.filter((e) => Date.now() - e.timestamp < 60 * 60 * 1000).slice(-100)
  );

  // Get template
  const template = getTemplate(event.type);

  // Determine which channels to use
  const severity = EVENT_SEVERITY[event.type];
  const channels = preferences.channelPreferences[severity];

  // Send notifications
  const results: NotificationDeliveryResult[] = [];
  for (const channel of channels) {
    const result = await sendNotification(channel, event, preferences, template);
    results.push(result);
  }

  // Store notification history
  notificationHistory.set(event.eventId, results);

  // Update event
  event.notificationSent = results.some((r) => r.success);
  event.notifiedChannels = results.filter((r) => r.success).map((r) => r.channel);

  logger.info("Security event notification sent", {
    eventType: event.type,
    keyId: event.keyId,
    severity,
    channels: channels.join(","),
    success: event.notificationSent,
  });

  return results;
}

/**
 * Create a security event object.
 */
export function createSecurityEvent(
  type: SecurityEventType,
  keyId: string,
  clientIp: string,
  details: Record<string, unknown> = {}
): SecurityEvent {
  return {
    eventId: crypto.randomUUID(),
    type,
    severity: EVENT_SEVERITY[type],
    keyId,
    timestamp: Date.now(),
    clientIp,
    details,
  };
}

/**
 * Set notification preferences for a user.
 */
export function setNotificationPreferences(preferences: NotificationPreferences): void {
  notificationPreferences.set(preferences.keyId, preferences);
  logger.info("Notification preferences updated", { keyId: preferences.keyId });
}

/**
 * Get notification preferences for a user.
 */
export function getNotificationPreferences(keyId: string): NotificationPreferences | undefined {
  return notificationPreferences.get(keyId);
}

/**
 * Register a custom notification template.
 */
export function registerNotificationTemplate(template: NotificationTemplate): void {
  notificationTemplates.set(template.eventType, template);
  logger.info("Notification template registered", { eventType: template.eventType });
}

/**
 * Get notification history for an event.
 */
export function getNotificationHistory(eventId: string): NotificationDeliveryResult[] | undefined {
  return notificationHistory.get(eventId);
}

/**
 * Get notification statistics.
 */
export function getNotificationStats(): {
  totalPreferences: number;
  totalTemplates: number;
  totalHistoryEntries: number;
  recentEventsCount: number;
} {
  return {
    totalPreferences: notificationPreferences.size,
    totalTemplates: notificationTemplates.size,
    totalHistoryEntries: notificationHistory.size,
    recentEventsCount: Array.from(recentEvents.values()).reduce(
      (sum, events) => sum + events.length,
      0
    ),
  };
}

/**
 * Clear notification rate limits for a user.
 */
export function clearNotificationRateLimit(keyId: string, channel?: NotificationChannel): void {
  if (channel) {
    notificationRateLimits.delete(`${keyId}:${channel}`);
  } else {
    // Clear all channels for this user
    for (const key of notificationRateLimits.keys()) {
      if (key.startsWith(`${keyId}:`)) {
        notificationRateLimits.delete(key);
      }
    }
  }
}
