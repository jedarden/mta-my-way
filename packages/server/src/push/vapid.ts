/**
 * VAPID key management for Web Push.
 *
 * VAPID (Voluntary Application Server Identification) keys are used to
 * authenticate the server when sending push messages.
 *
 * Keys can be provided via environment variables or generated at startup.
 * For production, set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY environment variables.
 */

import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import webpush from "web-push";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

// ---------------------------------------------------------------------------
// VAPID key generation and loading
// ---------------------------------------------------------------------------

/**
 * Generate a new VAPID key pair.
 */
export function generateVapidKeys(): VapidKeys {
  const keys = webpush.generateVAPIDKeys();
  return {
    publicKey: keys.publicKey,
    privateKey: keys.privateKey,
  };
}

/**
 * Load VAPID keys from environment variables or generate new ones.
 *
 * Priority:
 * 1. VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY environment variables
 * 2. Generate new keys (and optionally save to file for dev)
 *
 * @param dataDir  Directory to save/load keys file (for development)
 */
export async function loadOrGenerateVapidKeys(dataDir?: string): Promise<VapidKeys> {
  // Check environment variables first
  const envPublicKey = process.env["VAPID_PUBLIC_KEY"];
  const envPrivateKey = process.env["VAPID_PRIVATE_KEY"];

  if (envPublicKey && envPrivateKey) {
    console.log(
      JSON.stringify({
        event: "vapid_keys_loaded",
        source: "environment",
        timestamp: new Date().toISOString(),
      })
    );
    return {
      publicKey: envPublicKey,
      privateKey: envPrivateKey,
    };
  }

  // Try to load from file (development mode)
  if (dataDir) {
    const keysPath = join(dataDir, "vapid-keys.json");
    if (existsSync(keysPath)) {
      try {
        const raw = await readFile(keysPath, "utf8");
        const keys = JSON.parse(raw) as VapidKeys;
        if (keys.publicKey && keys.privateKey) {
          console.log(
            JSON.stringify({
              event: "vapid_keys_loaded",
              source: "file",
              timestamp: new Date().toISOString(),
            })
          );
          return keys;
        }
      } catch (err) {
        console.error(
          JSON.stringify({
            event: "vapid_keys_load_error",
            timestamp: new Date().toISOString(),
            error: err instanceof Error ? err.message : String(err),
          })
        );
      }
    }

    // Generate new keys and save
    const keys = generateVapidKeys();
    try {
      await writeFile(keysPath, JSON.stringify(keys, null, 2));
      console.log(
        JSON.stringify({
          event: "vapid_keys_generated",
          source: "generated",
          saved_to: keysPath,
          timestamp: new Date().toISOString(),
          // Log public key so it can be set as VITE_VAPID_PUBLIC_KEY
          public_key: keys.publicKey,
        })
      );
    } catch (err) {
      console.error(
        JSON.stringify({
          event: "vapid_keys_save_error",
          timestamp: new Date().toISOString(),
          error: err instanceof Error ? err.message : String(err),
        })
      );
    }
    return keys;
  }

  // Generate ephemeral keys (will be lost on restart)
  const keys = generateVapidKeys();
  console.log(
    JSON.stringify({
      event: "vapid_keys_generated",
      source: "ephemeral",
      timestamp: new Date().toISOString(),
      public_key: keys.publicKey,
      warning: "Keys not persisted - set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY env vars",
    })
  );
  return keys;
}

// ---------------------------------------------------------------------------
// Web Push configuration
// ---------------------------------------------------------------------------

let vapidKeys: VapidKeys | null = null;

/**
 * Configure web-push with VAPID keys.
 * Must be called before sending push notifications.
 *
 * @param keys    VAPID keys
 * @param subject Contact URI (mailto: or https://) for push service
 */
export function configureWebPush(keys: VapidKeys, subject?: string): void {
  vapidKeys = keys;

  const vapidSubject = subject || process.env["VAPID_SUBJECT"] || "mailto:mta-my-way@example.com";

  webpush.setVapidDetails(vapidSubject, keys.publicKey, keys.privateKey);

  console.log(
    JSON.stringify({
      event: "web_push_configured",
      timestamp: new Date().toISOString(),
      subject: vapidSubject,
    })
  );
}

/**
 * Get the current VAPID public key.
 * Returns null if web-push hasn't been configured.
 */
export function getVapidPublicKey(): string | null {
  return vapidKeys?.publicKey ?? null;
}

/**
 * Check if web-push is configured and ready to use.
 */
export function isWebPushConfigured(): boolean {
  return vapidKeys !== null;
}
