/**
 * useStationIndex — loads stations + complexes once and caches in module scope.
 *
 * The station index is ~94 KB and never changes during a session, so it is
 * fetched at most once regardless of how many components call this hook.
 * The Service Worker caches the underlying API responses across page loads.
 */

import { useEffect, useState } from "react";
import { type Station, type StationComplex, api } from "../lib/api";

interface StationIndexState {
  stations: Station[];
  complexes: StationComplex[];
  loading: boolean;
  error: string | null;
}

// Module-level singleton — persists across mounts/unmounts
let cached: { stations: Station[]; complexes: StationComplex[] } | null = null;
let inflight: Promise<void> | null = null;

export function useStationIndex(): StationIndexState {
  const [state, setState] = useState<StationIndexState>(() =>
    cached
      ? { ...cached, loading: false, error: null }
      : { stations: [], complexes: [], loading: true, error: null }
  );

  useEffect(() => {
    // Already loaded — nothing to do
    if (cached) {
      setState({ ...cached, loading: false, error: null });
      return;
    }

    // Start fetch if not already in flight
    if (!inflight) {
      inflight = Promise.all([api.getStations(), api.getComplexes()])
        .then(([stations, complexes]) => {
          cached = { stations, complexes };
          setState({ stations, complexes, loading: false, error: null });
        })
        .catch((err: unknown) => {
          inflight = null; // allow retry on next mount
          setState((s) => ({
            ...s,
            loading: false,
            error: err instanceof Error ? err.message : "Failed to load stations",
          }));
        });
    } else {
      // Piggyback on the in-flight request
      void inflight.then(() => {
        if (cached) {
          setState({ ...cached, loading: false, error: null });
        }
      });
    }
  }, []);

  return state;
}
