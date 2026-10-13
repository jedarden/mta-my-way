/** Discovers the OAuth providers the server currently has configured. */

import { useEffect, useState } from "react";

export interface OAuthProviderInfo {
  providerId: string;
  displayName: string;
}

export type OAuthProvidersStatus = "loading" | "ready" | "unavailable";

export interface UseOAuthProvidersResult {
  status: OAuthProvidersStatus;
  providers: OAuthProviderInfo[];
}

interface ProvidersResponse {
  providers?: Array<{ providerId?: unknown; displayName?: unknown }>;
}

/** Tolerant parse: malformed bodies degrade to "nothing configured". */
function parseProviders(data: unknown): OAuthProviderInfo[] {
  if (typeof data !== "object" || data === null) return [];
  const list = (data as ProvidersResponse).providers;
  if (!Array.isArray(list)) return [];
  const providers: OAuthProviderInfo[] = [];
  for (const entry of list) {
    if (typeof entry !== "object" || entry === null) continue;
    if (typeof entry.providerId !== "string" || entry.providerId.length === 0) continue;
    const displayName =
      typeof entry.displayName === "string" && entry.displayName.length > 0
        ? entry.displayName
        : entry.providerId;
    providers.push({ providerId: entry.providerId, displayName });
  }
  return providers;
}

/**
 * Fetches GET /api/auth/oauth/providers once the signed-out state settles
 * (`enabled` — the screen only needs this while signed out). An empty list or
 * a failed request lands on "unavailable" so the sign-in buttons hide instead
 * of sending the user to a provider that is not configured.
 */
export function useOAuthProviders(enabled: boolean): UseOAuthProvidersResult {
  const [status, setStatus] = useState<OAuthProvidersStatus>("loading");
  const [providers, setProviders] = useState<OAuthProviderInfo[]>([]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    async function discover(): Promise<void> {
      try {
        const response = await fetch("/api/auth/oauth/providers");
        const data: unknown = response.ok ? await response.json() : null;
        if (cancelled) return;
        const discovered = parseProviders(data);
        setProviders(discovered);
        setStatus(discovered.length > 0 ? "ready" : "unavailable");
      } catch {
        if (cancelled) return;
        setProviders([]);
        setStatus("unavailable");
      }
    }

    void discover();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { status, providers };
}
