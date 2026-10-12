import type { LineHealthStatus } from "@mta-my-way/shared";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useSystemHealth: vi.fn(),
  getHealth: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("../hooks/useSystemHealth", () => ({ useSystemHealth: mocks.useSystemHealth }));
vi.mock("../lib/api", () => ({ api: { getHealth: mocks.getHealth } }));
vi.mock("../components/layout/Screen", () => ({
  default: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

import HealthScreen from "./HealthScreen";

const line = (
  lineId: string,
  status: LineHealthStatus["status"],
  summary?: string
): LineHealthStatus => ({ lineId, status, summary, updatedAt: Date.now() });

function renderHealth() {
  return render(
    <MemoryRouter initialEntries={["/health"]}>
      <Routes>
        <Route path="/health" element={<HealthScreen />} />
        <Route path="/line/:lineId" element={<p>Line detail route</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("HealthScreen", () => {
  beforeEach(() => {
    mocks.refresh.mockReset();
    // The screen intentionally treats feed health as optional. Rejecting here
    // also keeps unrelated async feed updates out of the status-only tests.
    mocks.getHealth.mockReset().mockRejectedValue(new Error("feed unavailable"));
    mocks.useSystemHealth.mockReset().mockReturnValue({
      lines: [],
      healthPercentage: 100,
      status: "loading",
      updatedAt: null,
      refresh: mocks.refresh,
    });
  });

  it("shows a loading grid while system status is pending", () => {
    const { container } = renderHealth();
    expect(screen.getByRole("heading", { name: "System Health" })).toBeInTheDocument();
    expect(container.querySelectorAll(".skeleton")).toHaveLength(20);
    expect(screen.queryByRole("heading", { name: "Active Issues" })).not.toBeInTheDocument();
  });

  it("shows a retry action after a status failure", () => {
    mocks.useSystemHealth.mockReturnValue({
      lines: [],
      healthPercentage: 0,
      status: "error",
      updatedAt: null,
      refresh: mocks.refresh,
    });
    renderHealth();
    expect(screen.getByText("Unable to load system health")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("groups visible lines, sorts active issues by severity, and opens a line", () => {
    mocks.useSystemHealth.mockReturnValue({
      lines: [
        line("1", "minor_delays", "Local delays"),
        line("2", "suspended", "No trains"),
        line("3", "significant_delays", "Long waits"),
        line("4", "normal"),
        line("GS", "normal"),
      ],
      healthPercentage: 20,
      status: "success",
      updatedAt: Date.now() - 60_000,
      refresh: mocks.refresh,
    });
    renderHealth();

    expect(screen.getByText("20%")).toBeInTheDocument();
    expect(screen.getByText("Major Disruptions")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^GS train/ })).not.toBeInTheDocument();
    const issues = screen.getByRole("heading", { name: "Active Issues" }).parentElement!;
    expect(within(issues).getAllByRole("listitem")).toHaveLength(3);
    expect(
      within(issues)
        .getAllByRole("listitem")
        .map((item) => item.textContent)
    ).toEqual([
      expect.stringContaining("No trains"),
      expect.stringContaining("Long waits"),
      expect.stringContaining("Local delays"),
    ]);
    fireEvent.click(screen.getByRole("button", { name: /^1 train: Minor Delays/ }));
    expect(screen.getByText("Line detail route")).toBeInTheDocument();
  });

  it("shows the all-clear message and refreshes from the updated timestamp", () => {
    mocks.useSystemHealth.mockReturnValue({
      lines: [line("A", "normal")],
      healthPercentage: 100,
      status: "success",
      updatedAt: Date.now() - 60_000,
      refresh: mocks.refresh,
    });
    renderHealth();
    expect(screen.getByText("All lines running normally")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Updated/ }));
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("renders feed health when available without blocking the line dashboard", async () => {
    mocks.useSystemHealth.mockReturnValue({
      lines: [line("A", "normal")],
      healthPercentage: 100,
      status: "success",
      updatedAt: null,
      refresh: mocks.refresh,
    });
    mocks.getHealth.mockResolvedValue({
      feeds: [
        {
          id: "gtfs-a",
          name: "A feed",
          status: "ok",
          lastSuccessAt: new Date().toISOString(),
          lastPollAt: new Date().toISOString(),
          consecutiveFailures: 0,
          entityCount: 12,
          lastError: null,
          avgLatencyMs: 50,
          errorCount24h: 0,
        },
      ],
    });
    renderHealth();
    await waitFor(() => expect(screen.getByText("A feed")).toBeInTheDocument());
    expect(screen.getByText("All lines running normally")).toBeInTheDocument();
  });
});
