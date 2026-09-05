/**
 * Tests for TransferDetail component
 *
 * Covers the recommendationDetails surface — the "why" behind the engine's
 * verdict — plus the section layout and the leg-by-leg breakdown of each
 * route the engine returned.
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
import { TransferDetail } from "./TransferDetail";

/** Fixed arrival timestamp in engine units (seconds), so expectations are stable. */
const ARRIVAL_SECONDS = 1_800_000_000;

/**
 * The component reads the transfer point from each leg's boarding station, so
 * the second leg has to board where the first one alights — otherwise the
 * "Transfer at" row names a station nobody can transfer at.
 */
const TWO_LEG_TRANSFER = makeTransferRoute({
  legs: [
    makeTransferLeg({ line: "1", estimatedTravelMinutes: 9 }),
    makeTransferLeg({
      line: "2",
      boardAt: { stationId: "128", stationName: "72 St" },
      alightAt: { stationId: "101", stationName: "South Ferry" },
      nextArrival: makeArrival({ minutesAway: 8 }),
      estimatedTravelMinutes: 8,
    }),
  ],
  totalEstimatedMinutes: 22,
  transferStation: { stationId: "128", stationName: "72 St" },
});

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

  // ─── Route breakdown ────────────────────────────────────────────────────

  it("renders the recommended direct route's boarding, ride time and arrival", () => {
    render(
      <TransferDetail
        analysis={makeCommuteAnalysis({
          directRoutes: [
            makeDirectRoute({
              estimatedTravelMinutes: 18,
              estimatedArrivalAtDestination: ARRIVAL_SECONDS,
            }),
          ],
          transferRoutes: [],
          recommendation: "direct",
        })}
      />
    );

    // "Board in" and the minutes live in separate text nodes.
    expect(screen.getByText(/Board in/)).toHaveTextContent("Board in 5 min");
    expect(screen.getByText("18 min ride · no transfer")).toBeInTheDocument();
    // The engine reports seconds; the component must convert to milliseconds.
    expect(screen.getByText(formatTime(ARRIVAL_SECONDS * 1000))).toBeInTheDocument();
    expect(screen.getByText("Est. arrival")).toBeInTheDocument();
  });

  it("walks each leg of the recommended transfer and names the transfer station", () => {
    render(
      <TransferDetail
        analysis={makeCommuteAnalysis({
          directRoutes: [makeDirectRoute({ nextArrivals: [makeArrival({ minutesAway: 12 })] })],
          transferRoutes: [TWO_LEG_TRANSFER],
          recommendation: "transfer",
        })}
      />
    );

    // One boarding row per leg, in leg order, then the non-recommended direct.
    const boardings = screen.getAllByText(/Board in/).map((el) => el.textContent);
    expect(boardings).toEqual(["Board in 5 min", "Board in 8 min", "Board in 12 min"]);

    expect(screen.getByText(/Transfer at/)).toHaveTextContent("Transfer at 72 St");
    expect(screen.getByText("Times Sq-42 St → 72 St")).toBeInTheDocument();
    expect(screen.getByText("72 St → South Ferry")).toBeInTheDocument();
    expect(screen.getByText("9 min ride")).toBeInTheDocument();
    expect(screen.getByText("8 min ride")).toBeInTheDocument();
    expect(screen.getByText("22 min total")).toBeInTheDocument();
  });

  it("does not repeat the recommended route inside Also Possible", () => {
    render(
      <TransferDetail
        analysis={makeCommuteAnalysis({
          directRoutes: [
            makeDirectRoute({ line: "1", estimatedTravelMinutes: 18 }),
            makeDirectRoute({ line: "3", estimatedTravelMinutes: 25 }),
          ],
          transferRoutes: [],
          recommendation: "direct",
        })}
      />
    );

    // getByRole would throw on a second match, so this asserts the first
    // direct is recommended exactly once.
    const recommended = within(screen.getByRole("region", { name: "Recommended" }));
    expect(recommended.getByRole("button", { name: "1 train" })).toBeInTheDocument();

    const alsoPossible = within(screen.getByRole("region", { name: "Also Possible" }));
    expect(alsoPossible.getByRole("button", { name: "3 train" })).toBeInTheDocument();
    expect(alsoPossible.getByText("25 min ride")).toBeInTheDocument();
    expect(alsoPossible.queryByRole("button", { name: "1 train" })).not.toBeInTheDocument();
  });

  it("flags express service on the recommended route", () => {
    render(
      <TransferDetail
        analysis={makeCommuteAnalysis({
          directRoutes: [makeDirectRoute({ isExpress: true })],
          transferRoutes: [],
          recommendation: "direct",
        })}
      />
    );

    expect(screen.getByLabelText("Express service")).toBeInTheDocument();
  });

  it("reports no upcoming train when the direct route has no predictions", () => {
    render(
      <TransferDetail
        analysis={makeCommuteAnalysis({
          directRoutes: [
            makeDirectRoute({ nextArrivals: [], estimatedArrivalAtDestination: ARRIVAL_SECONDS }),
          ],
          transferRoutes: [],
          recommendation: "direct",
        })}
      />
    );

    expect(screen.getByText("No upcoming trains")).toBeInTheDocument();
    // The arrival estimate survives even without a live prediction.
    expect(screen.getByText(formatTime(ARRIVAL_SECONDS * 1000))).toBeInTheDocument();
  });
});
