import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "../stores/authStore";
import { useAuth } from "./useAuth";

describe("useAuth", () => {
  beforeEach(() => {
    useAuthStore.setState({ authenticated: false, profile: null, loading: true });
  });

  it("exposes the store's authenticated, profile and loading fields", () => {
    useAuthStore.setState({
      authenticated: true,
      profile: { userId: "u1", email: "a@example.com" },
      loading: false,
    });

    const { result } = renderHook(() => useAuth());

    expect(result.current.auth).toEqual({
      authenticated: true,
      profile: { userId: "u1", email: "a@example.com" },
      loading: false,
    });
  });

  it("re-renders with updated auth state when the store changes", () => {
    const { result, rerender } = renderHook(() => useAuth());
    expect(result.current.auth.authenticated).toBe(false);

    act(() => {
      useAuthStore.setState({ authenticated: true, profile: { userId: "u2" }, loading: false });
    });
    rerender();

    expect(result.current.auth.authenticated).toBe(true);
    expect(result.current.auth.profile).toEqual({ userId: "u2" });
  });

  it("returns the store's refreshAuth and signOut functions directly", () => {
    const { result } = renderHook(() => useAuth());

    expect(result.current.refreshAuth).toBe(useAuthStore.getState().refreshAuth);
    expect(result.current.signOut).toBe(useAuthStore.getState().signOut);
  });

  describe("signIn", () => {
    const originalLocation = window.location;

    beforeEach(() => {
      Object.defineProperty(window, "location", {
        configurable: true,
        writable: true,
        value: { ...originalLocation, assign: vi.fn() },
      });
    });

    afterEach(() => {
      Object.defineProperty(window, "location", {
        configurable: true,
        writable: true,
        value: originalLocation,
      });
    });

    it("navigates to the Google OAuth entry point", () => {
      const { result } = renderHook(() => useAuth());

      result.current.signIn("google");

      expect(window.location.assign).toHaveBeenCalledWith("/auth/google");
    });

    it("navigates to the GitHub OAuth entry point", () => {
      const { result } = renderHook(() => useAuth());

      result.current.signIn("github");

      expect(window.location.assign).toHaveBeenCalledWith("/auth/github");
    });
  });
});
