/**
 * Tests for TransferDetail component
 *
 * Focuses on the recommendationDetails surface — the "why" behind the
 * engine's verdict — plus the section layout around it.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  makeCommuteAnalysis,
  makeDirectRoute,
  makeRecommendationDetails,
  makeTransferRoute,
} from "../../test/factories";
import { TransferDetail } from "./TransferDetail";

describe("TransferDetail", () => {
  it("renders the reason the engine recommended this commute", () => {
    render(
      <TransferDetail
        analysis={makeCommuteAnalysis({
          recommendationDetails: makeRecommendationDetails({
            reason: "Transfer saves 3 min vs direct",
          }),
        })}
      />
    );

    expect(screen.getByText("Transfer saves 3 min vs direct")).toBeInTheDocument();
  });

  it("renders the confidence level", () => {
    render(
      <TransferDetail
        analysis={makeCommuteAnalysis({
          recommendationDetails: makeRecommendationDetails({ confidence: "medium" }),
        })}
      />
    );

    expect(screen.getByText("Medium confidence")).toBeInTheDocument();
  });

  it("renders the time saved by following the recommendation", () => {
    render(
      <TransferDetail
        analysis={makeCommuteAnalysis({
          recommendationDetails: makeRecommendationDetails({ timeSavedMinutes: 3 }),
        })}
      />
    );

    expect(screen.getByText("Saves 3 min")).toBeInTheDocument();
  });

  it("renders every risk factor for the analyzed commute", () => {
    render(
      <TransferDetail
        analysis={makeCommuteAnalysis({
          recommendationDetails: makeRecommendationDetails({
            risks: ["B Division arrival times are estimates", "Wait 8 min at 72 St"],
          }),
        })}
      />
    );

    expect(screen.getByText("B Division arrival times are estimates")).toBeInTheDocument();
    expect(screen.getByText("Wait 8 min at 72 St")).toBeInTheDocument();
  });

  it("flags a recommendation computed from stale data", () => {
    render(
      <TransferDetail
        analysis={makeCommuteAnalysis({
          recommendationDetails: makeRecommendationDetails({ isStale: true }),
        })}
      />
    );

    expect(screen.getByText("Stale")).toBeInTheDocument();
  });

  it("renders the recommended, direct and also-possible sections", () => {
    const direct = makeDirectRoute({ line: "1", estimatedTravelMinutes: 18 });
    const transfer = makeTransferRoute({ totalEstimatedMinutes: 22 });

    render(
      <TransferDetail
        analysis={makeCommuteAnalysis({
          directRoutes: [direct],
          transferRoutes: [transfer],
          recommendation: "transfer",
        })}
      />
    );

    expect(screen.getByRole("heading", { name: "Recommended" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Direct" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Also Possible" })).toBeInTheDocument();
  });

  it("renders the empty state when no routes were found", () => {
    render(
      <TransferDetail
        analysis={makeCommuteAnalysis({
          directRoutes: [],
          transferRoutes: [],
          recommendationDetails: makeRecommendationDetails({
            reason: "No routes available",
            isStale: true,
          }),
        })}
      />
    );

    expect(screen.getByText("No routes found between these stations")).toBeInTheDocument();
    // The why panel needs a route to sit above.
    expect(screen.queryByRole("region", { name: "Why" })).not.toBeInTheDocument();
  });
});
