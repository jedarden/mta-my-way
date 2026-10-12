/**
 * Tests for WalkComparison component
 *
 * Covers the walking-vs-transit comparison card:
 * - Null render when the comparison is unavailable or not viable
 * - Neutral rendering when transit wins ("Consider walking")
 * - Green promotion styling when walking is faster
 * - The "similar" variant that replaces the transit column
 * - The delay-specific promotion footer
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { WalkComparisonResult } from "../../hooks/useWalkComparison";
import { WalkComparison } from "./WalkComparison";

const makeComparison = (overrides: Partial<WalkComparisonResult> = {}): WalkComparisonResult => ({
  available: true,
  walkingMinutes: 9,
  distanceKm: 0.7,
  formattedWalkingTime: "9 min walk",
  formattedDistance: "700 m",
  waitMinutes: 4,
  rideMinutes: 10,
  transitMinutes: 14,
  walkingIsFaster: false,
  isViable: true,
  recommendation: "transit",
  reason: "short_trip",
  ...overrides,
});

describe("WalkComparison", () => {
  it("renders nothing when the comparison is unavailable", () => {
    const { container } = render(
      <WalkComparison comparison={makeComparison({ available: false })} />
    );

    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when walking is not viable", () => {
    const { container } = render(
      <WalkComparison comparison={makeComparison({ isViable: false })} />
    );

    expect(container.firstChild).toBeNull();
  });

  it("shows the neutral header and both options when transit wins", () => {
    const { container } = render(<WalkComparison comparison={makeComparison()} />);

    expect(screen.getByText("Consider walking")).toBeInTheDocument();
    expect(screen.getByText("9")).toBeInTheDocument();
    expect(screen.getByText("min walk")).toBeInTheDocument();
    expect(screen.getByText("14")).toBeInTheDocument();
    expect(screen.getByText("min transit")).toBeInTheDocument();
    expect(screen.getByText("wait 4 + ride 10")).toBeInTheDocument();
    expect(screen.getByText("700 m")).toBeInTheDocument();

    // Neutral styling, not the green promotion
    const card = container.firstChild as HTMLElement;
    expect(card).toHaveClass("bg-surface", "dark:bg-dark-surface");
    expect(card).not.toHaveClass("bg-green-50");
  });

  it("promotes walking with green styling when walking is faster", () => {
    const { container } = render(
      <WalkComparison
        comparison={makeComparison({
          walkingIsFaster: true,
          recommendation: "walk",
          reason: "short_trip",
        })}
      />
    );

    expect(screen.getByText("Walking is faster")).toBeInTheDocument();
    const card = container.firstChild as HTMLElement;
    expect(card).toHaveClass("bg-green-50", "dark:bg-green-900/20");

    // The delay footer only appears for reason "delays"
    expect(screen.queryByText(/skip the platform/)).not.toBeInTheDocument();
  });

  it("shows the delay footer when a long wait is why walking wins", () => {
    render(
      <WalkComparison
        comparison={makeComparison({
          walkingIsFaster: true,
          recommendation: "walk",
          reason: "delays",
          waitMinutes: 17,
        })}
      />
    );

    expect(screen.getByText("Long wait (17 min) — skip the platform")).toBeInTheDocument();
  });

  it("replaces the transit column with a similarity note when times are close", () => {
    render(<WalkComparison comparison={makeComparison({ recommendation: "similar" })} />);

    expect(screen.getByText("About the same as transit")).toBeInTheDocument();
    expect(screen.queryByText("min transit")).not.toBeInTheDocument();
    expect(screen.queryByText(/wait \d+ \+ ride \d+/)).not.toBeInTheDocument();
  });

  it("uses green text colors for the walk figures when promoted", () => {
    render(
      <WalkComparison
        comparison={makeComparison({
          walkingIsFaster: true,
          recommendation: "walk",
        })}
      />
    );

    const minutes = screen.getByText("9");
    expect(minutes).toHaveClass("text-green-700", "dark:text-green-400");
  });

  it("keeps neutral text colors for the walk figures when not promoted", () => {
    render(<WalkComparison comparison={makeComparison()} />);

    const minutes = screen.getByText("9");
    expect(minutes).toHaveClass("text-text-primary", "dark:text-dark-text-primary");
  });
});
