import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "./authStore";

const mockFetch = vi.fn();
global.fetch = mockFetch;

function resetStore() {
  useAuthStore.setState({ authenticated: false, profile: null, loading: true });
}

describe("useAuthStore", () => {
  beforeEach(() => {
    resetStore();
    mockFetch.mockReset();
  });

  describe("refreshAuth", () => {
    it("marks the session authenticated when the server reports an active session", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          authenticated: true,
          profile: { userId: "u1", email: "a@example.com" },
        }),
      } as Response);

      await useAuthStore.getState().refreshAuth();

      expect(mockFetch).toHaveBeenCalledWith("/api/auth/session");
      const state = useAuthStore.getState();
      expect(state.authenticated).toBe(true);
      expect(state.profile).toEqual({ userId: "u1", email: "a@example.com" });
      expect(state.loading).toBe(false);
    });

    it("clears the profile when the server reports no active session", async () => {
      useAuthStore.setState({
        authenticated: true,
        profile: { userId: "stale" },
        loading: false,
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authenticated: false }),
      } as Response);

      await useAuthStore.getState().refreshAuth();

      const state = useAuthStore.getState();
      expect(state.authenticated).toBe(false);
      expect(state.profile).toBeNull();
    });

    it("falls back to signed-out state when the session check returns a non-OK response", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 } as Response);

      await useAuthStore.getState().refreshAuth();

      const state = useAuthStore.getState();
      expect(state.authenticated).toBe(false);
      expect(state.profile).toBeNull();
      expect(state.loading).toBe(false);
    });

    it("falls back to signed-out state when the request throws, without blocking the app", async () => {
      mockFetch.mockRejectedValueOnce(new Error("network down"));

      await expect(useAuthStore.getState().refreshAuth()).resolves.toBeUndefined();

      const state = useAuthStore.getState();
      expect(state.authenticated).toBe(false);
      expect(state.profile).toBeNull();
      expect(state.loading).toBe(false);
    });

    it("de-duplicates concurrent calls into a single in-flight request", async () => {
      let resolveFetch: (value: unknown) => void = () => {};
      mockFetch.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve;
          })
      );

      const first = useAuthStore.getState().refreshAuth();
      const second = useAuthStore.getState().refreshAuth();

      expect(mockFetch).toHaveBeenCalledTimes(1);

      resolveFetch({
        ok: true,
        json: async () => ({ authenticated: false }),
      });

      await Promise.all([first, second]);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("allows a fresh request once the previous in-flight call has settled", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authenticated: false }),
      } as Response);
      await useAuthStore.getState().refreshAuth();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authenticated: false }),
      } as Response);
      await useAuthStore.getState().refreshAuth();

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("signOut", () => {
    it("clears the session and returns true on success", async () => {
      useAuthStore.setState({
        authenticated: true,
        profile: { userId: "u1" },
        loading: false,
      });
      mockFetch.mockResolvedValueOnce({ ok: true } as Response);

      const result = await useAuthStore.getState().signOut();

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith("/api/auth/session/revoke", { method: "POST" });
      const state = useAuthStore.getState();
      expect(state.authenticated).toBe(false);
      expect(state.profile).toBeNull();
    });

    it("leaves state untouched and returns false when the server rejects the revoke", async () => {
      useAuthStore.setState({
        authenticated: true,
        profile: { userId: "u1" },
        loading: false,
      });
      mockFetch.mockResolvedValueOnce({ ok: false, status: 403 } as Response);

      const result = await useAuthStore.getState().signOut();

      expect(result).toBe(false);
      const state = useAuthStore.getState();
      expect(state.authenticated).toBe(true);
      expect(state.profile).toEqual({ userId: "u1" });
    });

    it("returns false when the revoke request throws", async () => {
      mockFetch.mockRejectedValueOnce(new Error("network down"));

      const result = await useAuthStore.getState().signOut();

      expect(result).toBe(false);
    });
  });
});
