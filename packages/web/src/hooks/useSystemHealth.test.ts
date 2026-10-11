import type { StationAlert } from "@mta-my-way/shared";
import { getAllLineIds } from "@mta-my-way/shared";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AlertsResponse } from "../lib/api";
import { api } from "../lib/api";
import { makeStationAlert } from "../test/factories";
import { computeLineHealth, useSystemHealth } from "./useSystemHealth";

vi.mock("../lib/api", () => ({
  api: {
    getAlerts: vi.fn(),
  },
}));

const mockedApi = vi.mocked(api);

function alertsResponse(alerts: StationAlert[]): AlertsResponse {
  return {
    alerts,
    meta: {
      count: alerts.length,
      lastUpdatedAt: null,
      matchRate: 1,
      consecutiveFailures: 0,
      circuitOpen: false,
    },
  };
}

describe("computeLineHealth", () => {
  const totalLines = getAllLineIds().length;

  it("marks every line normal and reports 100% health when there are no alerts", () => {
    const { lines, healthPercentage } = computeLineHealth([]);

    expect(lines).toHaveLength(totalLines);
    expect(lines.every((l) => l.status === "normal")).toBe(true);
    expect(healthPercentage).toBe(100);
  });

  it("marks a line suspended when its alert has effect NO_SERVICE", () => {
    const alerts = [
      makeStationAlert({ affectedLines: ["1"], effect: "NO_SERVICE", severity: "info" }),
    ];

    const { lines } = computeLineHealth(alerts);

    const line1 = lines.find((l) => l.lineId === "1");
    expect(line1?.status).toBe("suspended");
  });

  it("marks a line suspended when its alert severity is severe, regardless of effect", () => {
    const alerts = [
      makeStationAlert({ affectedLines: ["1"], effect: "DELAY", severity: "severe" }),
    ];

    const { lines } = computeLineHealth(alerts);

    expect(lines.find((l) => l.lineId === "1")?.status).toBe("suspended");
  });

  it("marks a line with significant delays for a warning-severity alert", () => {
    const alerts = [
      makeStationAlert({ affectedLines: ["1"], effect: "DELAY", severity: "warning" }),
    ];

    const { lines } = computeLineHealth(alerts);

    expect(lines.find((l) => l.lineId === "1")?.status).toBe("significant_delays");
  });

  it("marks a line with minor delays for any other severity", () => {
    const alerts = [makeStationAlert({ affectedLines: ["1"], effect: "DELAY", severity: "info" })];

    const { lines } = computeLineHealth(alerts);

    expect(lines.find((l) => l.lineId === "1")?.status).toBe("minor_delays");
  });

  it("keeps the worst status when multiple alerts affect the same line", () => {
    const alerts = [
      makeStationAlert({ affectedLines: ["1"], effect: "DELAY", severity: "info" }),
      makeStationAlert({ affectedLines: ["1"], effect: "NO_SERVICE", severity: "severe" }),
    ];

    const { lines } = computeLineHealth(alerts);

    expect(lines.find((l) => l.lineId === "1")?.status).toBe("suspended");
  });

  it("does not downgrade an already-worse status when a milder alert is scanned afterward", () => {
    const alerts = [
      makeStationAlert({ affectedLines: ["1"], effect: "NO_SERVICE", severity: "severe" }),
      makeStationAlert({ affectedLines: ["1"], effect: "DELAY", severity: "info" }),
    ];

    const { lines } = computeLineHealth(alerts);

    expect(lines.find((l) => l.lineId === "1")?.status).toBe("suspended");
  });

  it("applies one alert to every line it affects", () => {
    const alerts = [
      makeStationAlert({ affectedLines: ["1", "2"], effect: "NO_SERVICE", severity: "severe" }),
    ];

    const { lines } = computeLineHealth(alerts);

    expect(lines.find((l) => l.lineId === "1")?.status).toBe("suspended");
    expect(lines.find((l) => l.lineId === "2")?.status).toBe("suspended");
  });

  it("computes healthPercentage as the share of lines still normal", () => {
    const alerts = [
      makeStationAlert({ affectedLines: ["1"], effect: "NO_SERVICE", severity: "severe" }),
    ];

    const { healthPercentage } = computeLineHealth(alerts);

    expect(healthPercentage).toBe(Math.round(((totalLines - 1) / totalLines) * 100));
  });
});

describe("useSystemHealth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fetches alerts on mount and derives line health from them", async () => {
    mockedApi.getAlerts.mockResolvedValue(
      alertsResponse([
        makeStationAlert({ affectedLines: ["1"], effect: "NO_SERVICE", severity: "severe" }),
      ])
    );

    const { result } = renderHook(() => useSystemHealth());

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(mockedApi.getAlerts).toHaveBeenCalled();
    expect(result.current.status).toBe("success");
    expect(result.current.error).toBeNull();
    expect(result.current.updatedAt).toBeGreaterThan(0);
    expect(result.current.lines.find((l) => l.lineId === "1")?.status).toBe("suspended");
  });

  it("reports an error status with a user-friendly message on fetch failure", async () => {
    mockedApi.getAlerts.mockRejectedValue(new Error("network down"));

    const { result } = renderHook(() => useSystemHealth());

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error).toBeTruthy();
  });

  it("polls again every 60 seconds", async () => {
    mockedApi.getAlerts.mockResolvedValue(alertsResponse([]));

    renderHook(() => useSystemHealth());

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    const callsAfterMount = mockedApi.getAlerts.mock.calls.length;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(mockedApi.getAlerts.mock.calls.length).toBe(callsAfterMount + 1);
  });

  it("refresh() triggers an immediate re-fetch", async () => {
    mockedApi.getAlerts.mockResolvedValue(alertsResponse([]));

    const { result } = renderHook(() => useSystemHealth());

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    const callsAfterMount = mockedApi.getAlerts.mock.calls.length;

    await act(async () => {
      result.current.refresh();
      await vi.runOnlyPendingTimersAsync();
    });
    expect(mockedApi.getAlerts.mock.calls.length).toBeGreaterThan(callsAfterMount);
  });

  it("ignores a stale in-flight response once a newer fetch has started", async () => {
    mockedApi.getAlerts.mockResolvedValue(alertsResponse([]));
    const { result } = renderHook(() => useSystemHealth());
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    expect(result.current.status).toBe("success");

    // Queue two overlapping refreshes: the newer one must win regardless of
    // which underlying promise settles first.
    let resolveStale: (value: AlertsResponse) => void = () => {};
    let resolveFresh: (value: AlertsResponse) => void = () => {};
    mockedApi.getAlerts.mockImplementationOnce(
      () => new Promise((resolve) => (resolveStale = resolve))
    );
    mockedApi.getAlerts.mockImplementationOnce(
      () => new Promise((resolve) => (resolveFresh = resolve))
    );

    act(() => {
      result.current.refresh();
    });
    act(() => {
      result.current.refresh();
    });

    // The fresh (second) request resolves first...
    await act(async () => {
      resolveFresh(
        alertsResponse([
          makeStationAlert({ affectedLines: ["1"], effect: "NO_SERVICE", severity: "severe" }),
        ])
      );
      await Promise.resolve();
    });
    expect(result.current.lines.find((l) => l.lineId === "1")?.status).toBe("suspended");

    // ...and the stale (first) request resolving afterward must be ignored.
    await act(async () => {
      resolveStale(alertsResponse([]));
      await Promise.resolve();
    });
    expect(result.current.lines.find((l) => l.lineId === "1")?.status).toBe("suspended");
  });
});
