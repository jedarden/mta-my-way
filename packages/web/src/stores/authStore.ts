import { create } from "zustand";

export interface AuthProfile {
  userId: string;
  email?: string;
  name?: string;
  provider?: string;
}

interface AuthStore {
  authenticated: boolean;
  profile: AuthProfile | null;
  loading: boolean;
  refreshAuth: () => Promise<void>;
  signOut: () => Promise<boolean>;
}

let refreshInFlight: Promise<void> | null = null;

/**
 * Session state is deliberately kept only in memory. The HttpOnly session
 * cookie is the source of truth; retaining this state in localStorage would
 * make a signed-out browser look signed in after a refresh.
 */
export const useAuthStore = create<AuthStore>((set) => ({
  authenticated: false,
  profile: null,
  loading: true,

  refreshAuth: async () => {
    if (refreshInFlight) return refreshInFlight;

    refreshInFlight = (async () => {
      try {
        const response = await fetch("/api/auth/session");
        if (!response.ok) {
          throw new Error(`Session check failed (${response.status})`);
        }

        const data: unknown = await response.json();
        const session = data as {
          authenticated?: boolean;
          profile?: AuthProfile | null;
        };
        set({
          authenticated: session.authenticated === true,
          profile: session.authenticated === true ? (session.profile ?? null) : null,
          loading: false,
        });
      } catch {
        // Authentication is optional. A failed status check must not block
        // the rest of the app or make locally stored preferences unavailable.
        set({ authenticated: false, profile: null, loading: false });
      } finally {
        refreshInFlight = null;
      }
    })();

    return refreshInFlight;
  },

  signOut: async () => {
    try {
      const response = await fetch("/api/auth/session/revoke", { method: "POST" });
      if (!response.ok) return false;

      set({ authenticated: false, profile: null, loading: false });
      return true;
    } catch {
      return false;
    }
  },
}));
