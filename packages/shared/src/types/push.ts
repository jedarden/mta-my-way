/**
 * Web Push notification types
 * Push subscriptions are keyed by SHA-256 of endpoint (no PII)
 */

/**
 * A favorite tuple sent with a push subscription
 * Identifies which station+line+direction combos the user cares about
 */
export interface PushFavoriteTuple {
  /** Parent station ID, e.g., "725" */
  stationId: string;
  /** Lines to watch, e.g., ["1", "2", "3"] */
  lines: string[];
  /** Direction filter */
  direction: "N" | "S" | "both";
}

/**
 * Map of favoriteId -> morning relevance score
 * Used by server to prioritize morning briefing push notifications
 */
export type MorningScoreMap = Record<string, number>;

/**
 * Payload sent from frontend to POST /api/push/subscribe
 */
export interface PushSubscribeRequest {
  /** PushSubscription JSON (endpoint, keys) */
  subscription: {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  };
  /** The user's favorite station/line/direction tuples */
  favorites: PushFavoriteTuple[];
  /** User-configured quiet hours */
  quietHours?: {
    enabled: boolean;
    startHour: number;
    endHour: number;
  };
  /** Morning relevance scores for morning briefing prioritization */
  morningScores?: MorningScoreMap;
}

/**
 * Payload sent from frontend to DELETE /api/push/unsubscribe
 */
export interface PushUnsubscribeRequest {
  /** The subscription endpoint to remove */
  endpoint: string;
}

/**
 * Data sent in a Web Push notification payload
 */
export interface PushNotificationPayload {
  /** Alert ID this notification is about */
  alertId: string;
  /** Alert headline */
  title: string;
  /** Alert body text */
  body: string;
  /** Affected lines for badge display */
  lines: string[];
  /** Severity for icon/color */
  severity: "info" | "warning" | "severe";
  /** Type of alert change */
  changeType: "new" | "updated" | "resolved";
  /** Timestamp */
  timestamp: number;
}

/**
 * Response from POST /api/push/subscribe
 */
export interface PushSubscribeResponse {
  success: boolean;
}

/**
 * Response from DELETE /api/push/unsubscribe
 */
export interface PushUnsubscribeResponse {
  success: boolean;
}

/**
 * Payload sent from frontend to PATCH /api/push/subscription
 * Used to update favorites or quiet hours without re-subscribing.
 */
export interface PushUpdateRequest {
  /** The subscription endpoint to identify the subscription */
  endpoint: string;
  /** Updated favorites (optional) */
  favorites?: PushFavoriteTuple[];
  /** Updated quiet hours (optional) */
  quietHours?: {
    enabled: boolean;
    startHour: number;
    endHour: number;
  };
  /** Updated morning relevance scores (optional) */
  morningScores?: MorningScoreMap;
}

/**
 * Subscription record stored in SQLite
 */
export interface PushSubscriptionRecord {
  /** SHA-256 hash of endpoint (primary key) */
  endpointHash: string;
  /** Original endpoint URL */
  endpoint: string;
  /** Base64-encoded p256dh key */
  p256dh: string;
  /** Base64-encoded auth key */
  auth: string;
  /** JSON array of favorite tuples */
  favorites: string; // JSON-encoded PushFavoriteTuple[]
  /** JSON object of quiet hours config */
  quietHours: string; // JSON-encoded quiet hours
  /** ISO timestamp when subscription was created */
  createdAt: string;
  /** ISO timestamp of last update */
  updatedAt: string;
}
