/** Authentication hook backed by the app-wide, in-memory session store. */

import { useCallback } from "react";
import { type AuthProfile, useAuthStore } from "../stores/authStore";

export type { AuthProfile };

interface AuthState {
  authenticated: boolean;
  profile: AuthProfile | null;
  loading: boolean;
}

interface UseAuthReturn {
  auth: AuthState;
  signIn: (provider: "google" | "github") => void;
  signOut: () => Promise<boolean>;
  refreshAuth: () => Promise<void>;
}

export function useAuth(): UseAuthReturn {
  const authenticated = useAuthStore((state) => state.authenticated);
  const profile = useAuthStore((state) => state.profile);
  const loading = useAuthStore((state) => state.loading);
  const refreshAuth = useAuthStore((state) => state.refreshAuth);
  const signOut = useAuthStore((state) => state.signOut);

  const signIn = useCallback((provider: "google" | "github") => {
    window.location.assign(`/auth/${provider}`);
  }, []);

  return {
    auth: { authenticated, profile, loading },
    signIn,
    signOut,
    refreshAuth,
  };
}
