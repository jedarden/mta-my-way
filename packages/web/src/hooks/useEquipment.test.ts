/**
 * Tests for useEquipment hook
 */

import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import { useEquipment } from "./useEquipment";

// Mock the API module
vi.mock("../lib/api", () => ({
  api: {
    getEquipment: vi.fn(),
  },
}));

// Mock the enhanced API error
vi.mock("../lib/apiEnhanced", () => ({
  EnhancedApiError: class extends Error {
    constructor(
      message: string,
      public type: string
    ) {
      super(message);
      this.name = "EnhancedApiError";
    }
  },
}));

// Mock error messages
vi.mock("../lib/errorMessages", () => ({
  ErrorCategory: {
    UNKNOWN: "unknown",
    NETWORK: "network",
    VALIDATION: "validation",
  },
  getUserErrorMessage: vi.fn((type, resource) => ({
    message: `Error fetching ${resource}`,
    type,
  })),
}));

describe("useEquipment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns idle state when stationId is null", () => {
    (api.getEquipment as any).mockResolvedValue({
      stationId: "123",
      equipment: [],
      adaAccessible: true,
      workingElevators: 5,
      workingEscalators: 3,
      brokenElevators: 0,
      brokenEscalators: 0,
    });

    const { result } = renderHook(() => useEquipment(null));

    expect(result.current.status).toBe("idle");
    expect(result.current.equipment).toEqual([]);
    expect(result.current.summary).toBeNull();
  });

  it("fetches equipment when stationId is provided", async () => {
    const mockEquipment = {
      stationId: "123",
      equipment: [
        {
          id: "e1",
          stationId: "123",
          type: "elevator" as const,
          description: "Elevator 1",
          ada: true,
          up: false,
          down: false,
          outages: [],
        },
      ],
      adaAccessible: false,
      workingElevators: 0,
      workingEscalators: 0,
      brokenElevators: 1,
      brokenEscalators: 0,
    };

    (api.getEquipment as any).mockResolvedValue(mockEquipment);

    const { result } = renderHook(() => useEquipment("123"));

    expect(result.current.status).toBe("loading");

    await waitFor(() => {
      expect(result.current.status).toBe("success");
    });

    expect(api.getEquipment).toHaveBeenCalledWith("123");
    expect(result.current.equipment).toEqual(mockEquipment.equipment);
    expect(result.current.hasBrokenElevators).toBe(true);
    expect(result.current.hasBrokenEscalators).toBe(false);
    expect(result.current.adaAccessible).toBe(false);
  });

  it("uses injected equipment when provided", async () => {
    const injectedEquipment = [
      {
        id: "e1",
        stationId: "123",
        type: "elevator" as const,
        description: "Elevator 1",
        ada: true,
        up: false,
        down: false,
        outages: [],
      },
      {
        id: "s1",
        stationId: "123",
        type: "escalator" as const,
        description: "Escalator 1",
        ada: false,
        up: false,
        down: false,
        outages: [],
      },
    ];

    const { result } = renderHook(() => useEquipment("123", injectedEquipment));

    await waitFor(() => {
      expect(result.current.status).toBe("success");
    });

    expect(api.getEquipment).not.toHaveBeenCalled();
    expect(result.current.equipment).toEqual(injectedEquipment);
    expect(result.current.hasBrokenElevators).toBe(true);
    expect(result.current.hasBrokenEscalators).toBe(true);
  });

  it("handles empty injected equipment array", async () => {
    const { result } = renderHook(() => useEquipment("123", []));

    await waitFor(() => {
      expect(result.current.status).toBe("success");
    });

    expect(api.getEquipment).not.toHaveBeenCalled();
    expect(result.current.equipment).toEqual([]);
    expect(result.current.summary).toBeNull();
  });

  it("handles API errors gracefully", async () => {
    const mockError = new Error("Network error");
    (api.getEquipment as any).mockRejectedValue(mockError);

    const { result } = renderHook(() => useEquipment("123"));

    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });

    expect(result.current.error).toBe("Error fetching equipment");
    expect(result.current.equipment).toEqual([]);
  });

  it("aborts previous request when stationId changes", async () => {
    const abortSpy = vi.spyOn(AbortController.prototype, "abort");

    (api.getEquipment as any).mockResolvedValue({
      stationId: "123",
      equipment: [],
      adaAccessible: true,
      workingElevators: 5,
      workingEscalators: 3,
      brokenElevators: 0,
      brokenEscalators: 0,
    });

    const { rerender } = renderHook(({ stationId }) => useEquipment(stationId), {
      initialProps: { stationId: "123" },
    });

    // Change stationId
    rerender({ stationId: "456" });

    await waitFor(() => {
      expect(abortSpy).toHaveBeenCalled();
    });

    expect(api.getEquipment).toHaveBeenCalledWith("456");
  });

  it("identifies broken elevators correctly", async () => {
    const mockEquipment = {
      stationId: "123",
      equipment: [
        {
          id: "e1",
          stationId: "123",
          type: "elevator" as const,
          description: "Elevator 1",
          ada: true,
          up: false,
          down: false,
          outages: [],
        },
        {
          id: "e2",
          stationId: "123",
          type: "elevator" as const,
          description: "Elevator 2",
          ada: true,
          up: true,
          down: true,
          outages: [],
        },
      ],
      adaAccessible: true,
      workingElevators: 1,
      workingEscalators: 0,
      brokenElevators: 1,
      brokenEscalators: 0,
    };

    (api.getEquipment as any).mockResolvedValue(mockEquipment);

    const { result } = renderHook(() => useEquipment("123"));

    await waitFor(() => {
      expect(result.current.status).toBe("success");
    });

    expect(result.current.hasBrokenElevators).toBe(true);
    expect(result.current.equipment).toHaveLength(2);
  });

  it("identifies broken escalators correctly", async () => {
    const mockEquipment = {
      stationId: "123",
      equipment: [
        {
          id: "s1",
          stationId: "123",
          type: "escalator" as const,
          description: "Escalator 1",
          ada: false,
          up: false,
          down: false,
          outages: [],
        },
      ],
      adaAccessible: true,
      workingElevators: 0,
      workingEscalators: 0,
      brokenElevators: 0,
      brokenEscalators: 1,
    };

    (api.getEquipment as any).mockResolvedValue(mockEquipment);

    const { result } = renderHook(() => useEquipment("123"));

    await waitFor(() => {
      expect(result.current.status).toBe("success");
    });

    expect(result.current.hasBrokenEscalators).toBe(true);
  });

  it("returns adaAccessible true by default", () => {
    const { result } = renderHook(() => useEquipment(null));

    expect(result.current.adaAccessible).toBe(true);
  });
});
