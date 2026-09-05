/**
 * Tests for AlertsScreen — the system status strip.
 *
 * The strip is the in-app navigation entry point for HealthScreen (/health)
 * and the line diagram (/line/:lineId); neither route has a BottomNav item.
 * These tests assert the tap paths exist and actually route, because a strip
 * that renders but does not navigate would silently put both screens back
 * behind the URL bar.
 */

import type { StationAlert } from "@mta-my-way/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { makeStationAlert } from "../test/factories";
import AlertsScreen from "./AlertsScreen";

// The layout shell pulls in header/nav data sources unrelated to the strip.
vi.mock("../components/layout/Screen", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// AlertList is covered by its own suite; the strip is what is under test here.
vi.mock("../components/alerts", () => ({
  AlertList: () => <div data-testid="alert-list" />,
}));

/** Mutated per test; the useAlerts mock reads these at call time. */
const alertsFixture: StationAlert[] = [];
let statusFixture = "success";

vi.mock("../hooks/useAlerts", () => ({
  useAlerts: () => ({
    alerts: alertsFixture,
    status: statusFixture,
    meta: null,
    error: null,
    updatedAt: null,
    refresh: () => {},
    myAlerts: [],
    myAlertsCount: 0,
    filterMode: "all" as const,
    setFilterMode: () => {},
  }),
}));

/** Renders the current pathname so navigation assertions have something to read. */
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderAlertsScreen() {
  return render(
    <MemoryRouter initialEntries={["/alerts"]}>
      <Routes>
        <Route path="/alerts" element={<AlertsScreen />} />
        <Route path="/health" element={<div>HealthScreen reached</div>} />
        <Route path="/line/:lineId" element={<div>LineDiagram reached</div>} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>
  );
}

describe("AlertsScreen system status strip", () => {
  it("links to the health screen even when there are no alerts", () => {
    renderAlertsScreen();

    const link = screen.getByRole("link", { name: /system health/i });
    expect(link).toHaveAttribute("href", "/health");
    expect(screen.getByText(/all lines running normally/i)).toBeInTheDocument();
  });

  it("reports how many lines are affected", () => {
    alertsFixture.splice(
      0,
      alertsFixture.length,
      ...[
        makeStationAlert({ id: "a1", affectedLines: ["1"], headline: "Delays on 1" }),
        makeStationAlert({ id: "a2", affectedLines: ["A"], headline: "Delays on A" }),
      ]
    );
    renderAlertsScreen();

    expect(screen.getByText(/2 lines with issues/i)).toBeInTheDocument();
  });

  it("navigates to the health screen when the strip link is tapped", () => {
    renderAlertsScreen();

    fireEvent.click(screen.getByRole("link", { name: /system health/i }));
    expect(screen.getByText("HealthScreen reached")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/health");
  });

  it("navigates to the line diagram when an affected line bullet is tapped", () => {
    alertsFixture.splice(
      0,
      alertsFixture.length,
      ...[makeStationAlert({ id: "a1", affectedLines: ["7"], headline: "Delays on 7" })]
    );
    renderAlertsScreen();

    fireEvent.click(screen.getByRole("button", { name: "7 train" }));
    expect(screen.getByText("LineDiagram reached")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/line/7");
  });

  it("sorts the worst disruption first in the bullet row", () => {
    alertsFixture.splice(
      0,
      alertsFixture.length,
      ...[
        makeStationAlert({ id: "a1", severity: "warning", affectedLines: ["1"] }),
        makeStationAlert({
          id: "a2",
          severity: "severe",
          effect: "NO_SERVICE",
          affectedLines: ["A"],
        }),
      ]
    );
    renderAlertsScreen();

    const bullets = screen.getAllByRole("button", { name: /train$/ });
    expect(bullets[0]).toHaveAttribute("aria-label", "A train");
    expect(bullets[1]).toHaveAttribute("aria-label", "1 train");
  });

  it("collapses a long affected-line list behind an overflow count", () => {
    alertsFixture.splice(
      0,
      alertsFixture.length,
      ...[makeStationAlert({ id: "a1", affectedLines: ["1", "2", "3", "4", "5", "6", "7", "A"] })]
    );
    renderAlertsScreen();

    expect(screen.getAllByRole("button", { name: /train$/ })).toHaveLength(6);
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("does not claim the system is healthy when the alerts feed failed", () => {
    statusFixture = "error";
    renderAlertsScreen();

    expect(screen.getByText(/status unavailable/i)).toBeInTheDocument();
    expect(screen.queryByText(/all lines running normally/i)).not.toBeInTheDocument();
  });
});
