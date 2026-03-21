/**
 * Push notification pipeline: orchestrates matching and sending.
 *
 * Listens for alert changes from the alerts poller, matches against
 * subscriptions, and sends push notifications.
 */

import type { PushNotificationPayload, PushSubscriptionRecord } from "@mta-my-way/shared";
import type { AlertChange } from "../alerts-poller.js";
import { onAlertChange } from "../alerts-poller.js";
import { matchAlertToSubscriptions } from "./matcher.js";
import { sendPushNotification } from "./sender.js";
import { getAllSubscriptions } from "./subscriptions.js";

/**
 * Start the push notification pipeline.
 * Registers a listener on the alerts poller that fires on every poll cycle
 * with new, updated, or resolved alerts.
 */
export function startPushPipeline(): void {
  onAlertChange(async (changes: AlertChange[]) => {
    try {
      // Get all current subscriptions
      const subscriptions = getAllSubscriptions();
      if (subscriptions.length === 0) return;

      // Match each change against all subscriptions
      const allMatches: Array<{
        subscription: PushSubscriptionRecord;
        payload: PushNotificationPayload;
      }> = [];

      for (const change of changes) {
        const matches = matchAlertToSubscriptions(change, subscriptions);
        allMatches.push(...matches);
      }

      if (allMatches.length === 0) return;

      // Send all matched notifications in parallel
      const results = await Promise.allSettled(
        allMatches.map(({ subscription, payload }) => sendPushNotification(subscription, payload))
      );

      const sent = results.filter((r) => r.status === "fulfilled" && r.value).length;
      const failed = results.length - sent;

      if (sent > 0) {
        console.log(
          JSON.stringify({
            event: "push_batch_complete",
            timestamp: new Date().toISOString(),
            sent,
            failed,
            total: allMatches.length,
          })
        );
      }
    } catch (err) {
      console.error(
        JSON.stringify({
          event: "push_pipeline_error",
          timestamp: new Date().toISOString(),
          error: err instanceof Error ? err.message : String(err),
        })
      );
    }
  });

  console.log(
    JSON.stringify({
      event: "push_pipeline_started",
      timestamp: new Date().toISOString(),
    })
  );
}
