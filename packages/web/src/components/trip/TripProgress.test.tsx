/**
 * Tests for TripProgress component
 *
 * Covers:
 * - ETA display formatting (base, adjusted +/- delta, no-eta fallback)
 * - Progress bar color by delay risk
 * - Delay risk badge labels and colors
 * - Progress percent clamping and ARIA attributes
 * - Stop count singular/plural
 * - Delay-adjustment footer visibility
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TripProgress } from "./TripProgress";

interface Props {
  progressPercent?: number;
  remainingStops?: number;
  totalStops?: number;
  baseEtaMinutes?: number | null;
  delayRisk?: "low" | "medium" | "high" | null;
  delayMinutesRange?: string | null;
  adjustedEtaMinutes?: number | null;
}

function renderProgress(props: Props = {}) {
  return render(
    <TripProgress
      progressPercent={props.progressPercent ?? 42}
      remainingStops={props.remainingStops ?? 3}
      totalStops={props.totalStops ?? 10}
      // `??` would coerce an explicit null back to the default; the no-ETA
      // branch needs null to survive.
      baseEtaMinutes={props.baseEtaMinutes === undefined ? 10 : props.baseEtaMinutes}
      delayRisk={props.delayRisk ?? null}
      delayMinutesRange={props.delayMinutesRange ?? null}
      adjustedEtaMinutes={props.adjustedEtaMinutes ?? null}
    />
  );
}

describe("TripProgress", () => {
  describe("ETA display", () => {
    it("shows base ETA minutes when no adjustment exists", () => {
      renderProgress({ baseEtaMinutes: 12, adjustedEtaMinutes: null });

      expect(screen.getByText("12 min")).toBeInTheDocument();
    });

    it("shows adjusted ETA with positive delta when at least 1 minute apart", () => {
      renderProgress({ baseEtaMinutes: 10, adjustedEtaMinutes: 13 });

      expect(screen.getByText("13 min (+3 min)")).toBeInTheDocument();
    });

    it("shows adjusted ETA with negative delta when the adjusted ETA is lower", () => {
      renderProgress({ baseEtaMinutes: 10, adjustedEtaMinutes: 8 });

      expect(screen.getByText("8 min (-2 min)")).toBeInTheDocument();
    });

    it("falls back to the base ETA when adjustment differs by less than a minute", () => {
      renderProgress({ baseEtaMinutes: 10, adjustedEtaMinutes: 10 });

      expect(screen.getByText("10 min")).toBeInTheDocument();
      expect(screen.queryByText(/min \(/)).not.toBeInTheDocument();
    });

    it("shows a placeholder when there is no ETA at all", () => {
      renderProgress({ baseEtaMinutes: null, adjustedEtaMinutes: null });

      expect(screen.getByText("--")).toBeInTheDocument();
    });

    it("labels the ETA block", () => {
      renderProgress();

      expect(screen.getByText("ETA to destination")).toBeInTheDocument();
    });
  });

  describe("progress bar color by delay risk", () => {
    it("uses the severe color for high delay risk", () => {
      renderProgress({ delayRisk: "high" });

      expect(screen.getByRole("progressbar")).toHaveClass("bg-severe");
    });

    it("uses the warning color for medium delay risk", () => {
      renderProgress({ delayRisk: "medium" });

      expect(screen.getByRole("progressbar")).toHaveClass("bg-warning");
    });

    it("uses the primary color for low delay risk", () => {
      renderProgress({ delayRisk: "low" });

      expect(screen.getByRole("progressbar")).toHaveClass("bg-mta-primary");
    });

    it("uses the primary color when delay risk is unknown", () => {
      renderProgress({ delayRisk: null });

      expect(screen.getByRole("progressbar")).toHaveClass("bg-mta-primary");
    });
  });

  describe("delay risk badge", () => {
    it("shows a high delay risk badge with severe styling", () => {
      renderProgress({ delayRisk: "high" });

      const badge = screen.getByText("High delay risk");
      expect(badge).toHaveClass("bg-severe/10", "text-severe");
    });

    it("shows a medium delay risk badge with warning styling", () => {
      renderProgress({ delayRisk: "medium" });

      const badge = screen.getByText("Possible delays");
      expect(badge).toHaveClass("bg-warning/10", "text-warning");
    });

    it("shows an on-track badge with success styling", () => {
      renderProgress({ delayRisk: "low" });

      const badge = screen.getByText("On track");
      expect(badge).toHaveClass("bg-success/10", "text-success");
    });

    it("hides the badge when delay risk is unknown", () => {
      renderProgress({ delayRisk: null });

      expect(screen.queryByText("High delay risk")).not.toBeInTheDocument();
      expect(screen.queryByText("Possible delays")).not.toBeInTheDocument();
      expect(screen.queryByText("On track")).not.toBeInTheDocument();
    });
  });

  describe("progress bar", () => {
    it("renders percentage, ARIA values and width for in-range progress", () => {
      renderProgress({ progressPercent: 42 });

      const bar = screen.getByRole("progressbar");
      expect(bar).toHaveAttribute("aria-valuenow", "42");
      expect(bar).toHaveAttribute("aria-valuemin", "0");
      expect(bar).toHaveAttribute("aria-valuemax", "100");
      expect(bar).toHaveAttribute("aria-label", "Trip 42% complete");
      expect(bar).toHaveStyle({ width: "42%" });
      expect(screen.getByText("42%")).toBeInTheDocument();
      expect(screen.getByText("Progress")).toBeInTheDocument();
    });

    it("clamps over-100 percent to a full bar while keeping the raw label", () => {
      renderProgress({ progressPercent: 150 });

      expect(screen.getByRole("progressbar")).toHaveStyle({ width: "100%" });
      expect(screen.getByText("150%")).toBeInTheDocument();
    });

    it("clamps negative percent to an empty bar", () => {
      renderProgress({ progressPercent: -10 });

      expect(screen.getByRole("progressbar")).toHaveStyle({ width: "0%" });
    });
  });

  describe("stop count", () => {
    it("pluralizes multiple remaining stops and shows the total", () => {
      renderProgress({ remainingStops: 3, totalStops: 10 });

      expect(screen.getByText("3 stops remaining")).toBeInTheDocument();
      expect(screen.getByText("of 10 total")).toBeInTheDocument();
    });

    it("uses the singular form for exactly one remaining stop", () => {
      renderProgress({ remainingStops: 1, totalStops: 5 });

      expect(screen.getByText("1 stop remaining")).toBeInTheDocument();
      expect(screen.queryByText("1 stops remaining")).not.toBeInTheDocument();
    });
  });

  describe("delay adjustment footer", () => {
    it("shows the adjusted-for-conditions line when a range exists and risk is not low", () => {
      renderProgress({ delayRisk: "medium", delayMinutesRange: "3-5 min" });

      expect(screen.getByText("Adjusted for current conditions: 3-5 min")).toBeInTheDocument();
    });

    it("hides the line for low delay risk", () => {
      renderProgress({ delayRisk: "low", delayMinutesRange: "3-5 min" });

      expect(
        screen.queryByText("Adjusted for current conditions: 3-5 min")
      ).not.toBeInTheDocument();
    });

    it("hides the line when there is no range", () => {
      renderProgress({ delayRisk: "high", delayMinutesRange: null });

      expect(
        screen.queryByText(/Adjusted for current conditions/)
      ).not.toBeInTheDocument();
    });
  });
});
