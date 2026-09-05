/**
 * Tests for RouteComparison component
 *
 * Verifies the side-by-side grid renders both options with their own figures,
 * highlights the recommended one, and carries the engine's recommendationDetails
 * in the compact strip beneath it.
 */

import { formatTime } from "@mta-my-way/shared";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  makeArrival,
  makeCommuteAnalysis,
  makeDirectRoute,
  makeRecommendationDetails,
  makeTransferLeg,
  makeTransferRoute,
} from "../../test/factories";
import { RouteComparison } from "./RouteComparison";

/** Fixed arrival timestamp in engine units (seconds), so expectations are stable. */
const ARRIVAL_SECONDS = 1_800_000_000;

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

  // ─── Per-card figures ───────────────────────────────────────────────────

  it("shows the direct option's next arrival, ride time and estimated arrival", () => {
    render(
      <RouteComparison
        analysis={makeCommuteAnalysis({
          directRoutes: [
            makeDirectRoute({
              nextArrivals: [makeArrival({ minutesAway: 5 })],
              estimatedTravelMinutes: 18,
              estimatedArrivalAtDestination: ARRIVAL_SECONDS,
            }),
          ],
          transferRoutes: [makeTransferRoute()],
          recommendation: "direct",
        })}
      />
    );

    const card = within(screen.getByLabelText("Direct route"));
    expect(card.getByText("5 min")).toBeInTheDocument();
    expect(card.getByText("18 min ride")).toBeInTheDocument();
    // The engine reports seconds; the card must convert to milliseconds.
    expect(card.getByText(`Arr ${formatTime(ARRIVAL_SECONDS * 1000)}`)).toBeInTheDocument();
  });

  it("shows the transfer option's first-leg arrival, total and saving", () => {
    render(
      <RouteComparison
        analysis={makeCommuteAnalysis({
          directRoutes: [makeDirectRoute()],
          transferRoutes: [
            makeTransferRoute({
              legs: [
                makeTransferLeg({ nextArrival: makeArrival({ minutesAway: 7 }) }),
                makeTransferLeg({ line: "2" }),
              ],
              totalEstimatedMinutes: 26,
              timeSavedVsDirect: 120,
            }),
          ],
          recommendation: "transfer",
        })}
      />
    );

    const card = within(screen.getByLabelText("Transfer route"));
    expect(card.getByText("7 min")).toBeInTheDocument();
    expect(card.getByText("26 min total")).toBeInTheDocument();
    // Scoped to the card: the why strip below the grid carries its own
    // "Saves N min" from recommendationDetails.
    expect(card.getByText("Saves 2 min")).toBeInTheDocument();
  });

  it("shows the transfer's arrival instead of a saving when it saves nothing", () => {
    render(
      <RouteComparison
        analysis={makeCommuteAnalysis({
          directRoutes: [makeDirectRoute()],
          transferRoutes: [
            makeTransferRoute({
              timeSavedVsDirect: 0,
              estimatedArrivalAtDestination: ARRIVAL_SECONDS,
            }),
          ],
          recommendation: "direct",
        })}
      />
    );

    const card = within(screen.getByLabelText("Transfer route"));
    expect(card.queryByText(/Saves/)).not.toBeInTheDocument();
    expect(card.getByText(`Arr ${formatTime(ARRIVAL_SECONDS * 1000)}`)).toBeInTheDocument();
  });

  it("renders a line bullet for each leg of the transfer", () => {
    render(
      <RouteComparison
        analysis={makeCommuteAnalysis({
          directRoutes: [makeDirectRoute()],
          transferRoutes: [makeTransferRoute()],
          recommendation: "transfer",
        })}
      />
    );

    const card = within(screen.getByLabelText("Transfer route"));
    expect(card.getByRole("button", { name: "1 train" })).toBeInTheDocument();
    expect(card.getByRole("button", { name: "2 train" })).toBeInTheDocument();
  });

  it("flags express service on either option", () => {
    render(
      <RouteComparison
        analysis={makeCommuteAnalysis({
          directRoutes: [makeDirectRoute({ isExpress: true })],
          transferRoutes: [
            makeTransferRoute({
              legs: [
                makeTransferLeg({ line: "1" }),
                makeTransferLeg({ line: "2", isExpress: true }),
              ],
            }),
          ],
          recommendation: "transfer",
        })}
      />
    );

    expect(screen.getAllByLabelText("Express service")).toHaveLength(2);
    expect(
      within(screen.getByLabelText("Direct route")).getByLabelText("Express service")
    ).toBeInTheDocument();
    expect(
      within(screen.getByLabelText("Transfer route")).getByLabelText("Express service")
    ).toBeInTheDocument();
  });

  it("omits the direct option's arrival figure when it has no predictions", () => {
    render(
      <RouteComparison
        analysis={makeCommuteAnalysis({
          directRoutes: [makeDirectRoute({ nextArrivals: [] })],
          transferRoutes: [makeTransferRoute()],
          recommendation: "direct",
        })}
      />
    );

    const card = within(screen.getByLabelText("Direct route"));
    expect(card.getByText("18 min ride")).toBeInTheDocument();
    // With no prediction there is no bold minutes figure — every remaining
    // "-min" string in the card is part of a longer phrase.
    expect(card.queryByText(/^[\d\s]+min$/)).not.toBeInTheDocument();
  });
});
