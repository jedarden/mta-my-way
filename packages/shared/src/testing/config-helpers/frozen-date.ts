/** Freeze only Date so async work keeps using the real event loop. */
import { vi } from "vitest";

/** Return a cleanup callback that restores real time after exact-clock assertions. */
export function freezeDate(nowMs: number): () => void {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(nowMs);
  return () => vi.useRealTimers();
}
