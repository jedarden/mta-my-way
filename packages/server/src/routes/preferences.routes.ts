/**
 * Authenticated preferences sync routes.
 *
 * A PUT replaces the complete local-storage snapshot for the authenticated
 * user. Replacement semantics ensure that a deleted favorite or commute is
 * not unexpectedly restored by a server-side merge.
 */

import type { UserPreferences } from "@mta-my-way/shared";
import type { Context } from "hono";
import { invalidateSession } from "../middleware/authentication.js";
import { getRbacAuthContext } from "../middleware/index.js";
import { logger } from "../observability/logger.js";
import {
  getUserPreferences,
  normalizeUserPreferences,
  replaceUserPreferences,
} from "../preferences.js";

type UserPreferencesPayload = Pick<UserPreferences, "favorites" | "commutes"> &
  Partial<Omit<UserPreferences, "favorites" | "commutes">>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPreferencesPayload(value: unknown): value is UserPreferencesPayload {
  return isRecord(value) && Array.isArray(value["favorites"]) && Array.isArray(value["commutes"]);
}

/**
 * Preferences may only be accessed with a server-validated session. API keys
 * can access scoped APIs, but must not become cross-device identity tokens.
 */
function getSessionUserId(c: Context): string | undefined {
  const auth = getRbacAuthContext(c);
  return auth?.authMethod === "session" ? auth.keyId : undefined;
}

function unauthenticated(c: Context) {
  return c.json(
    {
      error: "Authentication required",
      hint: "Sign in to sync your preferences across devices",
    },
    401
  );
}

/** Build preferences and related session routes for the app. */
export function buildPreferencesRoutes() {
  /** GET /api/preferences — get the current user's preference snapshot. */
  async function getPreferences(c: Context) {
    const userId = getSessionUserId(c);
    if (!userId) {
      return unauthenticated(c);
    }

    try {
      return c.json(await getUserPreferences(userId));
    } catch (error) {
      logger.error("Failed to load user preferences", error as Error);
      return c.json({ error: "Preferences sync temporarily unavailable", degraded: true }, 503);
    }
  }

  /** PUT /api/preferences — replace the current user's preference snapshot. */
  async function putPreferences(c: Context) {
    const userId = getSessionUserId(c);
    if (!userId) {
      return unauthenticated(c);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON request body" }, 400);
    }

    if (!isPreferencesPayload(body)) {
      return c.json({ error: "favorites and commutes must both be arrays" }, 400);
    }

    try {
      const preferences = normalizeUserPreferences(body);
      return c.json(await replaceUserPreferences(userId, preferences));
    } catch (error) {
      logger.error("Failed to save user preferences", error as Error);
      return c.json({ error: "Preferences sync temporarily unavailable", degraded: true }, 503);
    }
  }

  /** GET /api/auth/session — get the current session status for the PWA. */
  function getSession(c: Context) {
    const auth = getRbacAuthContext(c);
    if (!auth || auth.authMethod !== "session") {
      return c.json({ authenticated: false, profile: null });
    }

    return c.json({
      authenticated: true,
      profile: {
        userId: auth.keyId,
        provider: auth.oauthProvider,
      },
    });
  }

  /** POST /api/auth/session/revoke — revoke the current authenticated session. */
  async function revokeSession(c: Context) {
    const auth = getRbacAuthContext(c);
    if (!auth || auth.authMethod !== "session" || !auth.sessionId) {
      return c.json({ error: "Not authenticated" }, 401);
    }

    invalidateSession(auth.sessionId);
    const isSecure = process.env["NODE_ENV"] === "production";
    c.header(
      "Set-Cookie",
      `session_id=; Path=/; SameSite=Lax; ${isSecure ? "Secure; " : ""}HttpOnly; Max-Age=0`
    );
    return c.json({ success: true });
  }

  return { getPreferences, putPreferences, getSession, revokeSession };
}
