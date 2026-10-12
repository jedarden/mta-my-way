import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FullScreenLoadingState, InlineLoadingState } from "./FullScreenLoadingState";

function renderFullScreen(props: Partial<Parameters<typeof FullScreenLoadingState>[0]> = {}) {
  return render(
    <MemoryRouter>
      <FullScreenLoadingState state="loading" {...props} />
    </MemoryRouter>
  );
}

afterEach(() => vi.useRealTimers());

describe("FullScreenLoadingState", () => {
  it("announces the loading message and can hide branding", () => {
    renderFullScreen({ message: "Finding stations", showBranding: false });

    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Finding stations")).toBeInTheDocument();
    expect(screen.queryByText("MTA My Way")).not.toBeInTheDocument();
  });

  it("offers recovery after a slow load and resets when loading restarts", () => {
    vi.useFakeTimers();
    const onRetry = vi.fn();
    const { rerender } = renderFullScreen({ timeout: 100, onRetry });

    act(() => vi.advanceTimersByTime(100));
    expect(screen.getByRole("alert")).toHaveTextContent("Taking longer than expected");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(screen.getByRole("link", { name: "Go to home" })).toHaveAttribute("href", "/");

    rerender(
      <MemoryRouter>
        <FullScreenLoadingState state="error" error="Service unavailable" />
      </MemoryRouter>
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Service unavailable");
    rerender(
      <MemoryRouter>
        <FullScreenLoadingState state="loading" timeout={100} />
      </MemoryRouter>
    );
    expect(screen.getByRole("status")).toHaveTextContent("Loading...");
  });

  it("shows an error fallback and optional retry action", () => {
    const onRetry = vi.fn();
    const { rerender } = renderFullScreen({ state: "error", onRetry });

    expect(screen.getByRole("alert")).toHaveTextContent("An unexpected error occurred");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();

    rerender(
      <MemoryRouter>
        <FullScreenLoadingState state="error" error="No connection" />
      </MemoryRouter>
    );
    expect(screen.getByRole("alert")).toHaveTextContent("No connection");
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });
});

describe("InlineLoadingState", () => {
  it("renders the selected size and message as a compact status", () => {
    const { rerender } = render(
      <InlineLoadingState message="Refreshing arrivals" size="sm" centered={false} />
    );
    expect(screen.getByRole("status")).toHaveTextContent("Refreshing arrivals");
    expect(screen.getByRole("status")).not.toHaveClass("min-h-[200px]");

    rerender(<InlineLoadingState size="lg" />);
    expect(screen.getByRole("status")).toHaveClass("min-h-[200px]");
    expect(screen.getByRole("status")).toHaveTextContent("Loading...");
    expect(screen.queryByText("Refreshing arrivals")).not.toBeInTheDocument();
  });
});
