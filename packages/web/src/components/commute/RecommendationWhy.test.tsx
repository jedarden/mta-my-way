/**
 * Tests for RecommendationWhy component
 *
 * Verifies every recommendationDetails field the TransferEngine computes is
 * actually visible: reason, confidence, risks, timeSavedMinutes and isStale.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeRecommendationDetails } from "../../test/factories";
import { RecommendationWhy } from "./RecommendationWhy";

describe("RecommendationWhy", () => {
  it("renders the engine's reason text", () => {
    render(
      <RecommendationWhy
        details={makeRecommendationDetails({ reason: "Transfer saves 3 min vs direct" })}
      />
    );

    expect(screen.getByText("Transfer saves 3 min vs direct")).toBeInTheDocument();
  });

  it("renders a high confidence badge", () => {
    render(<RecommendationWhy details={makeRecommendationDetails({ confidence: "high" })} />);

    expect(screen.getByText("High confidence")).toBeInTheDocument();
  });

  it("renders medium and low confidence badges", () => {
    const { rerender } = render(
      <RecommendationWhy details={makeRecommendationDetails({ confidence: "medium" })} />
    );
    expect(screen.getByText("Medium confidence")).toBeInTheDocument();

    rerender(<RecommendationWhy details={makeRecommendationDetails({ confidence: "low" })} />);
    expect(screen.getByText("Low confidence")).toBeInTheDocument();
  });

  it("renders timeSavedMinutes when the recommendation saves time", () => {
    render(<RecommendationWhy details={makeRecommendationDetails({ timeSavedMinutes: 4 })} />);

    expect(screen.getByText("Saves 4 min")).toBeInTheDocument();
  });

  it("omits the time-saved line when timeSavedMinutes is 0", () => {
    render(<RecommendationWhy details={makeRecommendationDetails({ timeSavedMinutes: 0 })} />);

    expect(screen.queryByText(/Saves .* min/)).not.toBeInTheDocument();
  });

  it("renders every risk factor", () => {
    render(
      <RecommendationWhy
        details={makeRecommendationDetails({
          risks: [
            "B Division arrival times are estimates",
            "Transfer station is not ADA accessible",
          ],
        })}
      />
    );

    expect(screen.getByLabelText("Risk factors")).toBeInTheDocument();
    expect(screen.getByText("B Division arrival times are estimates")).toBeInTheDocument();
    expect(screen.getByText("Transfer station is not ADA accessible")).toBeInTheDocument();
  });

  it("renders no risk list when there are no risks", () => {
    render(<RecommendationWhy details={makeRecommendationDetails({ risks: [] })} />);

    expect(screen.queryByLabelText("Risk factors")).not.toBeInTheDocument();
  });

  it("flags stale data", () => {
    render(<RecommendationWhy details={makeRecommendationDetails({ isStale: true })} />);

    expect(screen.getByText("Stale")).toBeInTheDocument();
  });

  it("omits the stale flag for fresh data", () => {
    render(<RecommendationWhy details={makeRecommendationDetails({ isStale: false })} />);

    expect(screen.queryByText("Stale")).not.toBeInTheDocument();
  });

  describe("compact variant", () => {
    it("keeps reason, confidence and time saved visible in one row", () => {
      render(
        <RecommendationWhy
          compact
          details={makeRecommendationDetails({
            reason: "Direct express service - fastest option",
            confidence: "high",
            timeSavedMinutes: 0,
          })}
        />
      );

      const strip = screen.getByLabelText("Why this route is recommended");
      expect(strip).toHaveTextContent("Direct express service - fastest option");
      expect(strip).toHaveTextContent("High confidence");
    });

    it("shows timeSavedMinutes in the strip", () => {
      render(
        <RecommendationWhy compact details={makeRecommendationDetails({ timeSavedMinutes: 7 })} />
      );

      expect(screen.getByLabelText("Why this route is recommended")).toHaveTextContent(
        "Saves 7 min"
      );
    });

    it("still flags stale data in the strip", () => {
      render(<RecommendationWhy compact details={makeRecommendationDetails({ isStale: true })} />);

      expect(screen.getByLabelText("Why this route is recommended")).toHaveTextContent("Stale");
    });

    it("drops the risk list, which only fits in the full variant", () => {
      render(
        <RecommendationWhy
          compact
          details={makeRecommendationDetails({ risks: ["Low confidence in arrival times"] })}
        />
      );

      expect(screen.queryByLabelText("Risk factors")).not.toBeInTheDocument();
    });
  });
});
