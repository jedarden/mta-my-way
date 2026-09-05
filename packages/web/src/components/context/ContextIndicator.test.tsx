/**
 * Tests for ContextIndicator component.
 *
 * Tests the header context indicator:
 * - Hidden when disabled or when no context is detected (idle)
 * - Context label and status semantics when a context is active
 * - Confidence marker only at high confidence
 * - Compact and full sizes
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ContextIndicator } from "./ContextIndicator";

describe("ContextIndicator", () => {
  it("renders nothing when show is false", () => {
    const { container } = render(
      <ContextIndicator context="commuting" confidence="high" show={false} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the context is idle", () => {
    const { container } = render(<ContextIndicator context="idle" confidence="high" show />);

    expect(container).toBeEmptyDOMElement();
  });

  it("announces the active context as a status with label and confidence", () => {
    render(<ContextIndicator context="commuting" confidence="medium" show />);

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-label", "Current context: Commute, confidence: medium");
    expect(screen.getByText("Commute")).toBeInTheDocument();
  });

  it("labels the at-station context", () => {
    render(<ContextIndicator context="at_station" confidence="low" show />);

    expect(screen.getByText("At Station")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveAttribute(
      "aria-label",
      "Current context: At Station, confidence: low"
    );
  });

  it("shows the confidence marker only at high confidence", () => {
    const { rerender } = render(<ContextIndicator context="planning" confidence="medium" show />);

    // The planning context icon renders; the confidence check does not.
    expect(screen.getByRole("status").querySelectorAll("svg")).toHaveLength(1);

    rerender(<ContextIndicator context="planning" confidence="high" show />);

    expect(screen.getByRole("status").querySelectorAll("svg")).toHaveLength(2);
  });

  it("shrinks in compact mode", () => {
    const { rerender } = render(
      <ContextIndicator context="reviewing" confidence="low" show compact />
    );

    expect(screen.getByRole("status")).toHaveClass("text-11");

    rerender(<ContextIndicator context="reviewing" confidence="low" show />);

    expect(screen.getByRole("status")).toHaveClass("text-13");
  });
});
