/**
 * Tests for RouteComparison component
 *
 * Verifies the side-by-side grid renders both options and that the engine's
 * recommendationDetails reach the compact strip beneath it.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  makeCommuteAnalysis,
  makeDirectRoute,
  makeRecommendationDetails,
  makeTransferRoute,
} from "../../test/factories";
import { RouteComparison } from "./RouteComparison";

describe("RouteComparison", () => {
  it("renders both the direct and transfer options", () => {
    render(
      <RouteComparison
        analysis={makeCommuteAnalysis({
          directRoutes: [makeDirectRoute({ line: "1" })],
          transferRoutes: [makeTransferRoute()],
          recommendation: "transfer",
        })}
      />
    );

    expect(screen.getByLabelText("Direct route")).toBeInTheDocument();
    expect(screen.getByLabelText("Transfer route")).toBeInTheDocument();
  });

  it("marks the recommended option as best", () => {
    render(
      <RouteComparison
        analysis={makeCommuteAnalysis({
          directRoutes: [makeDirectRoute()],
          transferRoutes: [makeTransferRoute()],
          recommendation: "direct",
        })}
      />
    );

    expect(screen.getByLabelText("Direct route")).toHaveTextContent("Best");
    expect(screen.getByLabelText("Transfer route")).not.toHaveTextContent("Best");
  });

  it("carries the engine's reason in the compact strip", () => {
    render(
      <RouteComparison
        analysis={makeCommuteAnalysis({
          recommendationDetails: makeRecommendationDetails({
            reason: "Transfer saves 2 min vs direct",
          }),
        })}
      />
    );

    const strip = screen.getByLabelText("Why this route is recommended");
    expect(strip).toHaveTextContent("Transfer saves 2 min vs direct");
  });

  it("carries confidence, time saved and staleness in the compact strip", () => {
    render(
      <RouteComparison
        analysis={makeCommuteAnalysis({
          recommendationDetails: makeRecommendationDetails({
            confidence: "low",
            timeSavedMinutes: 6,
            isStale: true,
          }),
        })}
      />
    );

    const strip = screen.getByLabelText("Why this route is recommended");
    expect(strip).toHaveTextContent("Low confidence");
    expect(strip).toHaveTextContent("Saves 6 min");
    expect(strip).toHaveTextContent("Stale");
  });

  it("omits the strip flag for fresh, on-time recommendations", () => {
    render(
      <RouteComparison
        analysis={makeCommuteAnalysis({
          recommendationDetails: makeRecommendationDetails({ isStale: false, timeSavedMinutes: 0 }),
        })}
      />
    );

    const strip = screen.getByLabelText("Why this route is recommended");
    expect(strip).not.toHaveTextContent("Stale");
    expect(strip).not.toHaveTextContent(/Saves .* min/);
  });

  it("renders nothing when only one route type exists", () => {
    const { container } = render(
      <RouteComparison
        analysis={makeCommuteAnalysis({
          directRoutes: [makeDirectRoute()],
          transferRoutes: [],
        })}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });
});
