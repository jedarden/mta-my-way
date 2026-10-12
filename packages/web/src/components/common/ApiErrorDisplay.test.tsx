import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiErrorType } from "../../lib/apiEnhanced";
import { ApiErrorDisplay } from "./ApiErrorDisplay";

describe("ApiErrorDisplay", () => {
  it("shows the raw error and provides retry and dismiss actions", () => {
    const onRetry = vi.fn();
    const onDismiss = vi.fn();
    render(<ApiErrorDisplay error="Feed unavailable" onRetry={onRetry} onDismiss={onDismiss} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Feed unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("uses contextual guidance and suppresses retry for a missing train", () => {
    render(
      <ApiErrorDisplay
        error="404"
        errorType={ApiErrorType.NOT_FOUND}
        context="trip"
        onRetry={vi.fn()}
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Train not found");
    expect(screen.getByText(/Search for your destination again/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("keeps the full retry control disabled while retrying", () => {
    const onRetry = vi.fn();
    render(
      <ApiErrorDisplay
        error="Slow request"
        errorType={ApiErrorType.TIMEOUT}
        isRetrying
        onRetry={onRetry}
      />
    );

    expect(screen.getByRole("button", { name: "Retrying..." })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Request timed out");
  });

  it("keeps compact alerts short and hides retry while a request is pending", () => {
    const onRetry = vi.fn();
    const { rerender } = render(
      <ApiErrorDisplay error="Offline" errorType={ApiErrorType.OFFLINE} compact onRetry={onRetry} />
    );

    expect(screen.getByRole("alert")).toHaveTextContent("No internet connection detected");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();

    rerender(
      <ApiErrorDisplay
        error="Offline"
        errorType={ApiErrorType.OFFLINE}
        compact
        isRetrying
        onRetry={onRetry}
      />
    );
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });
});
