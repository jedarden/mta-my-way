/**
 * Alert-to-subscription matcher.
 *
 * When a new or changed alert is detected, this module finds all subscriptions
 * whose favorite tuples overlap with the alert's affected lines.
 */

import type { AlertChange } from "../alerts-poller.js";
import type {
  StationAlert,
  PushFavoriteTuple,
  PushSubscriptionRecord,
  PushNotificationPayload,
} from "@mta-my-way/shared";

// ---------------------------------------------------------------------------
// Matching logic
// ---------------------------------------------------------------------------

interface QuietHoursConfig {
  enabled: boolean;
  startHour: number;
  endHour: number;
}

/**
 * Check if we are currently within the quiet hours window.
 * Handles overnight ranges (e.g., 22:00 to 07:00).
 */
function isQuietHours(config: QuietHoursConfig): boolean {
  if (!config.enabled) return false;

  const now = new Date();
  const currentHour = now.getHours();

  if (config.startHour <= config.endHour) {
    // Same-day range, e.g., 09:00 to 17:00
    return currentHour >= config.startHour && currentHour < config.endHour;
  }

  // Overnight range, e.g., 22:00 to 07:00
  return currentHour >= config.startHour || currentHour < config.endHour;
}

/**
 * Check if a subscription's favorite tuples overlap with the alert's lines.
 */
function subscriptionMatchesAlert(
  favorites: PushFavoriteTuple[],
  alert: StationAlert
): boolean {
  const alertLines = new Set(alert.affectedLines.map((l) => l.toUpperCase()));

  for (const fav of favorites) {
    const favLines = fav.lines.map((l) => l.toUpperCase());
    if (favLines.some((line) => alertLines.has(line))) {
      return true;
    }
  }

  return false;
}

/**
 * For a given alert change, find all matching subscriptions and build
 * push notification payloads for each.
 *
 * @returns Array of { subscription, payload } tuples ready to be sent
 */
export function matchAlertToSubscriptions(
  change: AlertChange,
  subscriptions: PushSubscriptionRecord[]
): Array<{ subscription: PushSubscriptionRecord; payload: PushNotificationPayload }> {
  // Only send for new/updated alerts with warning or severe severity
  if (change.type === "resolved" && change.alert.severity === "info") {
    return [];
  }

  // For resolved alerts, always send (service restored is important)
  // For new/updated, only send if severity is warning or severe
  if (change.type !== "resolved" && change.alert.severity === "info") {
    return [];
  }

  const results: Array<{ subscription: PushSubscriptionRecord; payload: PushNotificationPayload }> = [];

  for (const sub of subscriptions) {
    // Parse stored JSON
    let favorites: PushFavoriteTuple[];
    let quietHours: QuietHoursConfig;

    try {
      favorites = JSON.parse(sub.favorites);
    } catch {
      continue;
    }

    try {
      quietHours = JSON.parse(sub.quietHours);
    } catch {
      quietHours = { enabled: false, startHour: 22, endHour: 7 };
    }

    // Skip if in quiet hours
    if (isQuietHours(quietHours)) {
      continue;
    }

    // Check if this subscription cares about the affected lines
    if (!subscriptionMatchesAlert(favorites, change.alert)) {
      continue;
    }

    // Build notification payload
    const linesLabel = change.alert.affectedLines
      .map((l) => `(${l})`)
      .join(" ");

    const title = change.type === "resolved"
      ? `Service restored: ${linesLabel}`
      : change.alert.severity === "severe"
        ? `Service alert: ${linesLabel}`
        : `Delays: ${linesLabel}`;

    const body = change.type === "resolved"
      ? `${linesLabel} service has been restored.`
      : change.alert.headline;

    const payload: PushNotificationPayload = {
      alertId: change.alert.id,
      title,
      body,
      lines: change.alert.affectedLines,
      severity: change.alert.severity,
      changeType: change.type,
      timestamp: Date.now(),
    };

    results.push({ subscription: sub, payload });
  }

  return results;
}
