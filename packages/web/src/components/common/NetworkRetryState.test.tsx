/**
 * Tests for NetworkRetryState component
 *
 * Covers context-specific messaging, retry-countdown substitution,
 * progress indication, retrying states, and the compact variant.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CompactNetworkRetry, NetworkRetryState } from "./NetworkRetryState";

const onRetry = vi.fn();

function renderRetry(props: Partial<Parameters<typeof NetworkRetryState>[0]>) {
  return render(
    <MemoryRouter>
      <NetworkRetryState
        attempt={1}
        maxAttempts={3}
        countdown={5}
        isRetrying={false}
        onRetry={onRetry}
        {...props}
      />
    </MemoryRouter>
  );
}

beforeEach(() => {
  onRetry.mockClear();
});

describe("NetworkRetryState", () => {
  describe("default context", () => {
    it("shows the connection trouble title with countdown and attempt count", () => {
      renderRetry({});

      expect(screen.getByRole("heading", { name: "Connection trouble" })).toBeInTheDocument();
      expect(
        screen.getByText("Can't reach the server right now. Retrying in 5 seconds... (1/3)")
      ).toBeInTheDocument();
    });

    it("updates the displayed countdown when the prop changes", () => {
      const { rerender } = renderRetry({ countdown: 5 });

      rerender(
        <MemoryRouter>
          <NetworkRetryState
            attempt={1}
            maxAttempts={3}
            countdown={2}
            isRetrying={false}
            onRetry={onRetry}
          />
        </MemoryRouter>
      );

      expect(
        screen.getByText("Can't reach the server right now. Retrying in 2 seconds... (1/3)")
      ).toBeInTheDocument();
    });

    it("shows the exhausted message when no attempts remain", () => {
      renderRetry({ attempt: 3, maxAttempts: 3 });

      expect(screen.getByText("Still having trouble connecting.")).toBeInTheDocument();
    });
  });

  describe("trip context", () => {
    it("shows trip-specific messaging while attempts remain", () => {
      renderRetry({ context: "trip tracker" });

      expect(screen.getByRole("heading", { name: "Unable to track train" })).toBeInTheDocument();
      expect(
        screen.getByText("Having trouble connecting. Retrying in 5 seconds... (1/3)")
      ).toBeInTheDocument();
    });

    it("shows trip-specific exhausted messaging", () => {
      renderRetry({ context: "trip tracker", attempt: 3, maxAttempts: 3 });

      expect(
        screen.getByText("Couldn't establish connection after multiple attempts.")
      ).toBeInTheDocument();
    });

    it("offers a search link for trip contexts", () => {
      renderRetry({ context: "live trip" });

      expect(screen.getByRole("link", { name: "Search for stations" })).toHaveAttribute(
        "href",
        "/search"
      );
    });
  });

  describe("alert context", () => {
    it("shows alert-specific messaging while attempts remain", () => {
      renderRetry({ context: "service alerts" });

      expect(screen.getByRole("heading", { name: "Unable to load alerts" })).toBeInTheDocument();
      expect(
        screen.getByText("Service updates unavailable. Retrying in 5 seconds... (1/3)")
      ).toBeInTheDocument();
    });

    it("shows alert-specific exhausted messaging", () => {
      renderRetry({ context: "service alerts", attempt: 2, maxAttempts: 2 });

      expect(
        screen.getByText("Couldn't fetch alerts after multiple attempts.")
      ).toBeInTheDocument();
    });
  });

  describe("progress indicator", () => {
    it("renders one dot per attempt with filled dots for past attempts", () => {
      const { container } = renderRetry({ attempt: 1, maxAttempts: 3 });

      const dots = container.querySelectorAll(".h-1\\.5");
      expect(dots).toHaveLength(3);
      expect(dots[0]).toHaveClass("bg-mta-primary");
      expect(dots[1]).not.toHaveClass("bg-mta-primary");
      expect(screen.getByText("2 retry attempts remaining")).toBeInTheDocument();
    });

    it("uses the singular form for exactly one remaining attempt", () => {
      renderRetry({ attempt: 2, maxAttempts: 3 });

      expect(screen.getByText("1 retry attempt remaining")).toBeInTheDocument();
    });

    it("hides the progress indicator when attempts are exhausted", () => {
      renderRetry({ attempt: 3, maxAttempts: 3 });

      expect(screen.queryByText(/retry/)).not.toBeInTheDocument();
    });
  });

  describe("retry button", () => {
    it("calls onRetry when not retrying", () => {
      renderRetry({});

      const button = screen.getByRole("button", { name: "Retry now" });
      expect(button).toBeEnabled();
      fireEvent.click(button);
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it("is disabled and shows Retrying... while retrying", () => {
      renderRetry({ isRetrying: true });

      expect(screen.getByText("Retrying...")).toBeInTheDocument();
      // aria-label="Retry now" defines the accessible name even while retrying
      const button = screen.getByRole("button", { name: "Retry now" });
      expect(button).toBeDisabled();
      fireEvent.click(button);
      expect(onRetry).not.toHaveBeenCalled();
    });

    it("marks the region busy and pulses the icon while retrying", () => {
      const { container } = renderRetry({ isRetrying: true });

      expect(screen.getByRole("alert")).toHaveAttribute("aria-busy", "true");
      const icon = container.querySelector("svg.animate-pulse");
      expect(icon).toBeInTheDocument();
    });

    it("is not pulsing or busy when idle", () => {
      const { container } = renderRetry({});

      expect(screen.getByRole("alert")).toHaveAttribute("aria-busy", "false");
      expect(container.querySelector("svg.animate-pulse")).not.toBeInTheDocument();
    });
  });

  describe("navigation", () => {
    it("always links home", () => {
      renderRetry({});

      expect(screen.getByRole("link", { name: "Go to home" })).toHaveAttribute("href", "/");
    });

    it("does not show the search link outside trip contexts", () => {
      renderRetry({ context: "alerts" });

      expect(screen.queryByRole("link", { name: "Search for stations" })).not.toBeInTheDocument();
    });
  });
});

describe("CompactNetworkRetry", () => {
  it("renders the default message with an enabled retry button", () => {
    render(
      <MemoryRouter>
        <CompactNetworkRetry onRetry={onRetry} isRetrying={false} />
      </MemoryRouter>
    );

    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText("Having trouble connecting")).toBeInTheDocument();

    const button = screen.getByRole("button", { name: "Retry" });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders a custom message", () => {
    render(
      <MemoryRouter>
        <CompactNetworkRetry onRetry={onRetry} isRetrying={false} message="Custom failure" />
      </MemoryRouter>
    );

    expect(screen.getByText("Custom failure")).toBeInTheDocument();
  });

  it("disables retry and shows Retrying... while retrying", () => {
    render(
      <MemoryRouter>
        <CompactNetworkRetry onRetry={onRetry} isRetrying={true} />
      </MemoryRouter>
    );

    const button = screen.getByRole("button", { name: /retrying/i });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onRetry).not.toHaveBeenCalled();
  });
});
