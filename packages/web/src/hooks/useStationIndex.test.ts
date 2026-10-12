import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import { useStationIndex } from "./useStationIndex";

vi.mock("../lib/api", () => ({
  api: { getStations: vi.fn(), getComplexes: vi.fn() },
}));

describe("useStationIndex", () => {
  it("shares one request, retries after failure, and caches the completed index", async () => {
    const getStations = vi.mocked(api.getStations);
    const getComplexes = vi.mocked(api.getComplexes);
    const stations: Awaited<ReturnType<typeof api.getStations>> = [
      {
        id: "101",
        name: "South Ferry",
        lat: 40.7,
        lon: -74.0,
        lines: ["1"],
        northStopId: "101N",
        southStopId: "101S",
        transfers: [],
        ada: true,
        borough: "manhattan",
      },
    ];
    const complexes: Awaited<ReturnType<typeof api.getComplexes>> = [
      {
        complexId: "c1",
        name: "South Ferry",
        stations: ["101"],
        allLines: ["1"],
        allStopIds: ["101N", "101S"],
      },
    ];
    getStations.mockResolvedValue(stations);
    getComplexes.mockRejectedValueOnce(new Error("network lost"));
    getComplexes.mockResolvedValue(complexes);

    const first = renderHook(() => useStationIndex());
    const second = renderHook(() => useStationIndex());
    expect(first.result.current.loading).toBe(true);
    expect(getStations).toHaveBeenCalledTimes(1);
    expect(getComplexes).toHaveBeenCalledTimes(1);

    await waitFor(() => expect(first.result.current.error).toBe("network lost"));
    expect(first.result.current.loading).toBe(false);
    first.unmount();
    second.unmount();

    const retry = renderHook(() => useStationIndex());
    await waitFor(() => expect(retry.result.current.loading).toBe(false));
    expect(retry.result.current.error).toBeNull();
    expect(retry.result.current.stations).toEqual(stations);
    expect(retry.result.current.complexes).toEqual(complexes);
    expect(getStations).toHaveBeenCalledTimes(2);
    retry.unmount();

    const cached = renderHook(() => useStationIndex());
    expect(cached.result.current.loading).toBe(false);
    expect(cached.result.current.stations).toEqual(stations);
    expect(getStations).toHaveBeenCalledTimes(2);
  });
});
