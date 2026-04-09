/**
 * Web Push sender.
 *
 * Uses the web-push npm package to send notifications. VAPID keys are
 * managed by vapid.ts — this module only needs to call web-push after
 * vapid.ts has already called setVapidDetails().
 *
 * Expired subscriptions (410 Gone / 404 Not Found) are automatically
 * removed from the database.
 */

import type { PushNotificationPayload, PushSubscriptionRecord } from "@mta-my-way/shared";
import webpush from "web-push";
import { recordPushNotificationFailed, recordPushNotificationSent } from "../middleware/metrics.js";
import { logger } from "../observability/logger.js";
import { removeSubscription } from "./subscriptions.js";
import { isWebPushConfigured } from "./vapid.js";

/**
 * Send a push notification to a single subscription.
 *
 * @returns true on success, false if the subscription is expired/gone
 * @throws on unexpected network or server errors
 */
export async function sendPushNotification(
  record: PushSubscriptionRecord,
  payload: PushNotificationPayload
): Promise<boolean> {
  if (!isWebPushConfigured()) return false;

  const pushSubscription = {
    endpoint: record.endpoint,
    keys: {
      p256dh: record.p256dh,
      auth: record.auth,
    },
  };

  try {
    await webpush.sendNotification(pushSubscription, JSON.stringify(payload), {
      TTL: 60 * 60, // 1 hour — deliver within 1 hour if user is offline
    });

    // Record push notification sent metric
    const lines = payload.lines ?? [];
    recordPushNotificationSent(lines);

    return true;
  } catch (err) {
    // 410 Gone / 404: subscription has been revoked or no longer exists
    const statusCode =
      err !== null && typeof err === "object" && "statusCode" in err
        ? (err as { statusCode: number }).statusCode
        : null;

    if (statusCode === 410 || statusCode === 404) {
      logger.info("Push subscription expired", { status: statusCode });
      removeSubscription(record.endpoint);

      // Record push notification failed metric for expired subscription
      recordPushNotificationFailed(`subscription_expired_${statusCode}`);

      return false;
    }

    // Record push notification failed metric for other errors
    const reason = err instanceof Error ? err.name : "unknown";
    recordPushNotificationFailed(reason);

    throw err;
  }
}
