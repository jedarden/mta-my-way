/**
 * Tests for Header layout component.
 *
 * Pins the context indicator wiring: the indicator was commented out of this
 * header once ("disabled to reduce security surface area") while context-aware
 * switching itself kept running, leaving users with context-reordered
 * favorites and no sign of it. These tests fail if the wiring disappears again.
 */

import { getContextUIHints } from "@mta-my-way/shared";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { type UseContextAwareReturn, useContextAware } from "../../hooks/useContextAware";

vi.mock("../../hooks/useContextAware", () => ({
  useContextAware: vi.fn(),
}));

import Header from "./Header";

const useContextAwareMock = vi.mocked(useContextAware);

/** A complete UseContextAwareReturn fixture; individual tests override fields. */
function contextAwareFixture(
  overrides: Partial<UseContextAwareReturn> = {}
): UseContextAwareReturn {
  return {
    context: "commuting",
    confidence: "high",
    contextLabel: "Commute",
    uiHints: getContextUIHints("commuting"),
    enabled: true,
    showIndicator: true,
    manualOverride: undefined,
    setManualOverride: vi.fn(),
    setSettings: vi.fn(),
    ...overrides,
  };
}

function renderHeader() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Header />
    </MemoryRouter>
  );
}

describe("Header", () => {
  // NetworkStatusIndicator shares the "status" role, so every query here is
  // scoped by the context indicator's own aria-label.
  const contextStatus = () => screen.queryByRole("status", { name: /Current context/ });

  it("keeps the banner and screen title", () => {
    useContextAwareMock.mockReturnValue(contextAwareFixture());
    renderHeader();

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "MTA My Way" })).toBeInTheDocument();
  });

  it("shows the indicator for the detected context", () => {
    useContextAwareMock.mockReturnValue(contextAwareFixture());
    renderHeader();

    expect(contextStatus()).toHaveAttribute(
      "aria-label",
      "Current context: Commute, confidence: high"
    );
    expect(screen.getByText("Commute")).toBeInTheDocument();
  });

  it("hides the indicator when the indicator setting is off", () => {
    useContextAwareMock.mockReturnValue(contextAwareFixture({ showIndicator: false }));
    renderHeader();

    expect(contextStatus()).not.toBeInTheDocument();
  });

  it("hides the indicator when context detection is disabled", () => {
    useContextAwareMock.mockReturnValue(contextAwareFixture({ enabled: false }));
    renderHeader();

    // Detection never runs while disabled, so the last context would go stale.
    expect(contextStatus()).not.toBeInTheDocument();
  });

  it("hides the indicator when no context is detected", () => {
    useContextAwareMock.mockReturnValue(contextAwareFixture({ context: "idle" }));
    renderHeader();

    expect(contextStatus()).not.toBeInTheDocument();
  });
});
