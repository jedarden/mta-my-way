/**
 * Morning briefing push: sends a daily summary to subscribed users.
 *
 * Uses a simple setInterval to check once per minute whether it's time to send
 * the morning briefing (default 7:00 AM, only once per day per subscription).
 *
 * The briefing text lists the user's favorite lines with current alert status.
 * Respects quiet hours — skips if the user is in their quiet window.
 */

import type { PushFavoriteTuple, PushNotificationPayload } from "@mta-my-way/shared";
import { getAllAlerts } from "../alerts-poller.js";
import { sendPushNotification } from "./sender.js";
import { getAllSubscriptions } from "./subscriptions.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QuietHoursConfig {
  enabled: boolean;
  startHour: number;
  endHour: number;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Hour at which to send the morning briefing (0–23) */
const BRIEFING_HOUR = 7;

/** Minute at which to send the morning briefing */
const BRIEFING_MINUTE = 0;

/** How often to check (ms) */
const CHECK_INTERVAL_MS = 60_000;

/** Track which subscriptions already received today's briefing */
const sentToday = new Set<string>();

/** Track the last date we checked (to reset sentToday) */
let lastCheckDate = "";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isQuietHours(config: QuietHoursConfig): boolean {
  if (!config.enabled) return false;
  const currentHour = new Date().getHours();
  if (config.startHour <= config.endHour) {
    return currentHour >= config.startHour && currentHour < config.endHour;
  }
  return currentHour >= config.startHour || currentHour < config.endHour;
}

function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Build a briefing payload for a subscription's favorite lines.
 * Checks current alerts against the subscription's favorite lines and
 * composes a concise status text.
 */
function buildBriefingPayload(
  favorites: PushFavoriteTuple[]
): PushNotificationPayload | null {
  // Collect all lines from favorites
  const allLines = new Set<string>();
  for (const fav of favorites) {
    for (const line of fav.lines) {
      allLines.add(line.toUpperCase());
    }
  }

  if (allLines.size === 0) return null;

  // Get current alerts
  const alerts = getAllAlerts();
  const activeAlerts = alerts.filter(
    (a) => a.severity === "warning" || a.severity === "severe"
  );

  // Find alerts matching the user's lines
  const matchingAlerts = activeAlerts.filter((a) =>
    a.affectedLines.some((line) => allLines.has(line.toUpperCase()))
  );

  // Compose briefing text
  const linesList = [...allLines]
    .sort()
    .map((l) => `(${l})`)
    .join(" ");

  let body: string;
  let severity: "info" | "warning" | "severe";

  if (matchingAlerts.length === 0) {
    body = `${linesList} — All clear! No active alerts.`;
    severity = "info";
  } else {
    const alertLines = new Set<string>();
    for (const alert of matchingAlerts) {
      for (const line of alert.affectedLines) {
        alertLines.add(`(${line})`);
      }
    }
    const affectedList = [...alertLines].join(" ");
    body = `Heads up: Active alerts on ${affectedList}. Tap for details.`;
    severity = matchingAlerts.some((a) => a.severity === "severe") ? "severe" : "warning";
  }

  return {
    alertId: "morning-briefing",
    title: "Good morning! Subway status",
    body,
    lines: [...allLines],
    severity,
    changeType: "new",
    timestamp: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

/**
 * Start the morning briefing scheduler.
 * Checks every minute and sends briefings at the configured time.
 */
export function startBriefingScheduler(): void {
  setInterval(() => {
    const now = new Date();
    const todayKey = getTodayKey();

    // Reset sent tracking at midnight
    if (todayKey !== lastCheckDate) {
      sentToday.clear();
      lastCheckDate = todayKey;
    }

    // Only send at the configured time
    if (now.getHours() !== BRIEFING_HOUR || now.getMinutes() !== BRIEFING_MINUTE) {
      return;
    }

    const subscriptions = getAllSubscriptions();
    if (subscriptions.length === 0) return;

    for (const sub of subscriptions) {
      // Skip if already sent today
      if (sentToday.has(sub.endpointHash)) continue;

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

      // Respect quiet hours
      if (isQuietHours(quietHours)) continue;

      const payload = buildBriefingPayload(favorites);
      if (!payload) continue;

      sendPushNotification(sub, payload)
        .then((sent) => {
          if (sent) {
            sentToday.add(sub.endpointHash);
          }
        })
        .catch(() => {
          // Individual send failure — don't block others
        });
    }

    if (sentToday.size > 0) {
      console.log(
        JSON.stringify({
          event: "morning_briefing_sent",
          timestamp: new Date().toISOString(),
          sent_count: sentToday.size,
          total_subscriptions: subscriptions.length,
        })
      );
    }
  }, CHECK_INTERVAL_MS);

  console.log(
    JSON.stringify({
      event: "briefing_scheduler_started",
      timestamp: new Date().toISOString(),
      briefing_time: `${String(BRIEFING_HOUR).padStart(2, "0")}:${String(BRIEFING_MINUTE).padStart(2, "0")}`,
      check_interval_ms: CHECK_INTERVAL_MS,
    })
  );
}
