/**
 * Tests for GeolocationPermissionFallback component
 *
 * Covers permission-state messaging (denied/unavailable/error/prompt),
 * platform-specific instructions, compact mode, and the banner variant.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GeolocationPermissionBanner,
  GeolocationPermissionFallback,
} from "./GeolocationPermissionFallback";

const onRequestPermission = vi.fn();
const onDismiss = vi.fn();

type GeolocationPermissionFallbackProps = Parameters<typeof GeolocationPermissionFallback>[0];
type GeolocationBannerProps = Parameters<typeof GeolocationPermissionBanner>[0];

function renderFallback(
  props: Partial<GeolocationPermissionFallbackProps> & {
    permission: GeolocationPermissionFallbackProps["permission"];
  }
) {
  return render(
    <MemoryRouter>
      <GeolocationPermissionFallback onRequestPermission={onRequestPermission} {...props} />
    </MemoryRouter>
  );
}

function renderBanner(
  props: Partial<GeolocationBannerProps> & { permission: GeolocationBannerProps["permission"] }
) {
  return render(
    <MemoryRouter>
      <GeolocationPermissionBanner
        onRequestPermission={onRequestPermission}
        onDismiss={onDismiss}
        {...props}
      />
    </MemoryRouter>
  );
}

const originalUserAgent = navigator.userAgent;

function setUserAgent(ua: string) {
  Object.defineProperty(window.navigator, "userAgent", {
    value: ua,
    configurable: true,
  });
}

beforeEach(() => {
  onRequestPermission.mockClear();
  onDismiss.mockClear();
});

afterEach(() => {
  setUserAgent(originalUserAgent);
});

describe("GeolocationPermissionFallback", () => {
  describe("denied permission", () => {
    it("shows the denied title and default message", () => {
      renderFallback({ permission: "denied" });

      expect(screen.getByRole("heading", { name: "Location access denied" })).toBeInTheDocument();
      expect(
        screen.getByText("Location access helps us show relevant stations and service information.")
      ).toBeInTheDocument();
    });

    it("shows the nearby-specific message when context mentions nearby", () => {
      renderFallback({ permission: "denied", context: "Find nearby stations" });

      expect(
        screen.getByText("To find stations near you, please enable location access.")
      ).toBeInTheDocument();
    });

    it("shows desktop instructions by default and no enable button", () => {
      renderFallback({ permission: "denied" });

      expect(
        screen.getByText(
          /Click the lock\/icon in your address bar → Site settings → Location → Allow/
        )
      ).toBeInTheDocument();
      // canRequest is false for denied
      expect(
        screen.queryByRole("button", { name: /enable location access/i })
      ).not.toBeInTheDocument();
    });

    it("shows iOS instructions on an iPhone user agent", () => {
      setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)");

      renderFallback({ permission: "denied" });

      expect(screen.getByText("iPhone/iPad:")).toBeInTheDocument();
      expect(screen.getByText(/Settings → Safari → Location → Allow/)).toBeInTheDocument();
    });

    it("shows Android instructions on an Android user agent", () => {
      setUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8)");

      renderFallback({ permission: "denied" });

      expect(screen.getByText("Android:")).toBeInTheDocument();
      expect(
        screen.getByText(/Chrome menu \(⋮\) → Settings → Site settings → Location → Allow/)
      ).toBeInTheDocument();
    });

    it("draws the crossed-out pin for denied state", () => {
      const { container } = renderFallback({ permission: "denied" });

      const lines = container.querySelectorAll("svg line");
      expect(lines.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("unavailable permission", () => {
    it("shows the unavailable state without an enable button", () => {
      renderFallback({ permission: "unavailable" });

      expect(screen.getByRole("heading", { name: "Location not available" })).toBeInTheDocument();
      expect(
        screen.getByText(
          "Your device doesn't support location services, or it's disabled in your browser settings."
        )
      ).toBeInTheDocument();
      expect(screen.getByText("You can search for stations manually instead.")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /enable location access/i })
      ).not.toBeInTheDocument();
    });
  });

  describe("error state", () => {
    it("shows the error message with a retry affordance", () => {
      renderFallback({ permission: "prompt", error: "Timeout waiting for location" });

      expect(
        screen.getByRole("heading", { name: "Couldn't get your location" })
      ).toBeInTheDocument();
      expect(screen.getByText("Timeout waiting for location")).toBeInTheDocument();
      expect(screen.getByText("Try again or search for stations manually.")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /enable location access/i }));
      expect(onRequestPermission).toHaveBeenCalledTimes(1);
    });
  });

  describe("default prompt state", () => {
    it("shows the enable prompt with action buttons", () => {
      renderFallback({ permission: "prompt" });

      expect(screen.getByRole("heading", { name: "Enable location" })).toBeInTheDocument();
      expect(
        screen.getByText(
          "Allow location access to see stations and service information relevant to your area."
        )
      ).toBeInTheDocument();

      const enable = screen.getByRole("button", { name: /enable location access/i });
      fireEvent.click(enable);
      expect(onRequestPermission).toHaveBeenCalledTimes(1);
    });

    it("shows the nearby prompt message when context mentions nearby", () => {
      renderFallback({ permission: "prompt", context: "nearby stations" });

      expect(
        screen.getByText("Find stations near you by enabling location access.")
      ).toBeInTheDocument();
    });

    it("always links to search", () => {
      renderFallback({ permission: "prompt" });

      const search = screen.getByRole("link", { name: /search for stations/i });
      expect(search).toHaveAttribute("href", "/search");
    });

    it("has status role and assertive live region", () => {
      renderFallback({ permission: "prompt" });

      expect(screen.getByRole("status")).toHaveAttribute("aria-live", "assertive");
    });
  });

  describe("compact mode", () => {
    it("renders the inline banner with search link", () => {
      renderFallback({ permission: "prompt", compact: true });

      expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
      expect(
        screen.getByText(
          "Allow location access to see stations and service information relevant to your area."
        )
      ).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Search" })).toHaveAttribute("href", "/search");
    });

    it("shows an Enable button that requests permission", () => {
      renderFallback({ permission: "prompt", compact: true });

      fireEvent.click(screen.getByRole("button", { name: "Enable" }));
      expect(onRequestPermission).toHaveBeenCalledTimes(1);
    });

    it("hides the Enable button when permission is denied", () => {
      renderFallback({ permission: "denied", compact: true });

      expect(screen.queryByRole("button", { name: "Enable" })).not.toBeInTheDocument();
      expect(
        screen.getByText("Location access helps us show relevant stations and service information.")
      ).toBeInTheDocument();
    });

    it("uses the warning-tinted styling", () => {
      renderFallback({ permission: "prompt", compact: true });

      expect(screen.getByRole("status")).toHaveClass("bg-warning/10", "rounded-lg");
    });
  });
});

describe("GeolocationPermissionBanner", () => {
  it("renders nothing when permission is granted", () => {
    const { container } = renderBanner({ permission: "granted" });

    expect(container.firstChild).toBeNull();
  });

  it("shows the denied message without an Enable button", () => {
    renderBanner({ permission: "denied" });

    expect(screen.getByRole("alert")).toHaveAttribute("aria-live", "polite");
    expect(
      screen.getByText("Location access denied. Search manually or enable in settings.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enable" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("shows the enable message with both buttons when not denied", () => {
    renderBanner({ permission: "prompt" });

    expect(screen.getByText("Enable location to find nearby stations.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Enable" }));
    expect(onRequestPermission).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("uses the banner styling", () => {
    renderBanner({ permission: "prompt" });

    expect(screen.getByRole("alert")).toHaveClass("bg-warning/10", "border-b", "border-warning/20");
  });
});
