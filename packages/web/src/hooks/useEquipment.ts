/**
 * useEquipment - Fetch equipment status for a station.
 *
 * Uses the equipment data injected into the arrivals response when available,
 * falling back to the dedicated /api/equipment/:stationId endpoint.
 * Enhanced with user-friendly error messages.
 */

import type { EquipmentStatus, StationEquipmentSummary } from "@mta-my-way/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { EnhancedApiError } from "../lib/apiEnhanced";
import { ErrorCategory, getUserErrorMessage } from "../lib/errorMessages";

export interface UseEquipmentResult {
  equipment: EquipmentStatus[];
  summary: StationEquipmentSummary | null;
  hasBrokenElevators: boolean;
  hasBrokenEscalators: boolean;
  adaAccessible: boolean;
  status: "idle" | "loading" | "success" | "error";
  error: string | null;
}

/**
 * Get equipment status for a station.
 *
 * @param stationId - Station ID to fetch equipment for
 * @param injectedEquipment - Equipment data from arrivals response (avoids extra fetch)
 */
export function useEquipment(
  stationId: string | null,
  injectedEquipment?: EquipmentStatus[]
): UseEquipmentResult {
  const [summary, setSummary] = useState<StationEquipmentSummary | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchEquipment = useCallback(async (id: string, signal: AbortSignal) => {
    setStatus("loading");
    setError(null);
    try {
      const data = await api.getEquipment(id);
      if (!signal.aborted) {
        setSummary(data);
        setStatus("success");
      }
    } catch (err) {
      if (!signal.aborted) {
        // Get user-friendly error message
        let errorMessage = "Unable to check elevator status";
        if (err instanceof EnhancedApiError) {
          const userError = getUserErrorMessage(err.type, "equipment");
          errorMessage = userError.message;
        } else {
          const userError = getUserErrorMessage(ErrorCategory.UNKNOWN, "equipment");
          errorMessage = userError.message;
        }
        setError(errorMessage);
        setStatus("error");
      }
    }
  }, []);

  useEffect(() => {
    if (!stationId) {
      setSummary(null);
      setStatus("idle");
      return;
    }

    // If equipment was injected from the arrivals response, use it
    if (injectedEquipment && injectedEquipment.length > 0) {
      const elevators = injectedEquipment.filter((e) => e.type === "elevator");
      const escalators = injectedEquipment.filter((e) => e.type === "escalator");
      const adaEquipment = injectedEquipment.filter((e) => e.ada);

      setSummary({
        stationId,
        equipment: injectedEquipment,
        adaAccessible: adaEquipment.length === 0,
        workingElevators: 0,
        workingEscalators: 0,
        brokenElevators: elevators.length,
        brokenEscalators: escalators.length,
      });
      setStatus("success");
      setError(null);
      return;
    }

    // No injected data - the arrival response already returns { equipment: [] }
    // which means no outages. No need to fetch separately.
    if (injectedEquipment && injectedEquipment.length === 0) {
      setSummary(null);
      setStatus("success");
      setError(null);
      return;
    }

    // No injected data provided - fetch from dedicated endpoint
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    void fetchEquipment(stationId, controller.signal);

    return () => {
      controller.abort();
    };
  }, [stationId, injectedEquipment, fetchEquipment]);

  const equipment = summary?.equipment ?? [];
  const hasBrokenElevators = equipment.some((e) => e.type === "elevator");
  const hasBrokenEscalators = equipment.some((e) => e.type === "escalator");

  return {
    equipment,
    summary,
    hasBrokenElevators,
    hasBrokenEscalators,
    adaAccessible: summary?.adaAccessible ?? true,
    status,
    error,
  };
}
