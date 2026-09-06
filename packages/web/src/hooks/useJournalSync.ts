/**
 * Offline-first sync between the local commute journal and the server's
 * /api/trips surface.
 *
 * The local store stays the source of truth for the UI. A trip is recorded
 * locally even when the device is offline; the server copy is best-effort and
 * is retried on a timer and on the browser's `online` event. Nothing here
 * blocks a render or surfaces a blocking error — a failed sync leaves the
 * journal exactly as the user saw it.
 *
 * The store itself is the upload queue: a record that the server has not
 * acknowledged is simply one whose identity key is missing from the persisted
 * server-id registry, so uploads survive a reload without a second queue.
 */

import type { Commute, TripRecord } from "@mta-my-way/shared";
import { useCallback, useEffect, useRef } from "react";
import {
  classifyJournalFailure,
  createServerTrip,
  deleteServerTrip,
  listServerTrips,
  updateServerTripNotes,
} from "../lib/journalApi";
import { useAuthStore } from "../stores/authStore";
import { useFavoritesStore } from "../stores/favoritesStore";
import {
  UNMATCHED_SERVER_COMMUTE_ID,
  tripIdentityKey,
  useJournalStore,
} from "../stores/journalStore";

const SYNC_STATE_KEY = "mta-journal-sync-state";
const RETRY_DELAY_MS = 15_000;
/** Matches the journal's own per-commute FIFO cap. */
const MAX_SERVER_RECORDS = 500;

/** A delete that could not reach the server yet. */
interface PendingDeletion {
  key: string;
  tripId: string;
  queuedAt: number;
}

/** A notes edit that could not reach the server yet. */
interface PendingNotes {
  key: string;
  tripId: string;
  notes: string;
  queuedAt: number;
}

interface JournalSyncState {
  /** identity key -> server trip id, for records the server has stored. */
  serverIds: Record<string, string>;
  /**
   * Trips deleted locally while the server was unreachable, keyed by identity.
   * Without these the next pull would resurrect them.
   */
  tombstones: string[];
  /** Records the server refused outright, so a bad payload is not retried forever. */
  rejected: string[];
  pendingDeletions: PendingDeletion[];
  pendingNotes: PendingNotes[];
}

/** Upper bound on the remembered-rejections list, oldest entries dropped first. */
const MAX_REJECTED = 200;

const EMPTY_SYNC_STATE: JournalSyncState = {
  serverIds: {},
  tombstones: [],
  rejected: [],
  pendingDeletions: [],
  pendingNotes: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readSyncState(): JournalSyncState {
  try {
    const raw = localStorage.getItem(SYNC_STATE_KEY);
    if (!raw) return { ...EMPTY_SYNC_STATE };
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value)) return { ...EMPTY_SYNC_STATE };
    return {
      serverIds: isRecord(value.serverIds) ? (value.serverIds as Record<string, string>) : {},
      tombstones: Array.isArray(value.tombstones) ? (value.tombstones as string[]) : [],
      rejected: Array.isArray(value.rejected) ? (value.rejected as string[]) : [],
      pendingDeletions: Array.isArray(value.pendingDeletions)
        ? (value.pendingDeletions as PendingDeletion[])
        : [],
      pendingNotes: Array.isArray(value.pendingNotes) ? (value.pendingNotes as PendingNotes[]) : [],
    };
  } catch {
    return { ...EMPTY_SYNC_STATE };
  }
}

function writeSyncState(state: JournalSyncState): void {
  try {
    localStorage.setItem(SYNC_STATE_KEY, JSON.stringify(state));
  } catch {
    // The registry is an optimisation over re-uploading everything; a private
    // session or full quota must not take the journal down with it.
  }
}

const syncState = readSyncState();

// The registry deliberately survives sign-out: wiping it would make the next
// sign-in re-upload every local record and duplicate them on the server.

/**
 * Place a server trip on a commute using the same origin/destination/line rule
 * the logger uses to attribute a trip in the first place. Trips that match no
 * saved commute keep their data under the unmatched bucket.
 */
export function groupServerTrips(
  serverTrips: TripRecord[],
  commutes: Commute[]
): Map<string, TripRecord[]> {
  const groups = new Map<string, TripRecord[]>();

  for (const trip of serverTrips) {
    const matched = commutes.find(
      (commute) =>
        commute.origin.stationId === trip.origin.stationId &&
        commute.destination.stationId === trip.destination.stationId &&
        commute.preferredLines.includes(trip.line)
    );
    const commuteId = matched?.id ?? UNMATCHED_SERVER_COMMUTE_ID;
    const group = groups.get(commuteId);
    if (group) group.push(trip);
    else groups.set(commuteId, [trip]);
  }

  return groups;
}

/** Cheapest stable fingerprint of the journal, used to notice local edits. */
export function journalRecordsSignature(stats: Record<string, { records: TripRecord[] }>): string {
  const keys: string[] = [];
  for (const commuteStats of Object.values(stats)) {
    for (const record of commuteStats.records) keys.push(tripIdentityKey(record));
  }
  return keys.sort().join(",");
}

function forEachLocalRecord(visit: (record: TripRecord, commuteId: string) => void): void {
  const stats = useJournalStore.getState().stats;
  for (const [commuteId, commuteStats] of Object.entries(stats)) {
    for (const record of commuteStats.records) visit(record, commuteId);
  }
}

/**
 * Notify the sync layer that a trip was removed locally. Called from the
 * journal screen with the record *before* it leaves the store, so the server
 * copy can be removed instead of coming back on the next pull.
 */
export function notifyJournalTripDeleted(record: TripRecord): void {
  const key = tripIdentityKey(record);
  const tripId = syncState.serverIds[key];
  if (!tripId) return;

  syncState.tombstones.push(key);
  syncState.pendingDeletions.push({ key, tripId, queuedAt: Date.now() });
  writeSyncState(syncState);
}

/**
 * Notify the sync layer that a trip's notes were edited. Notes are the only
 * field the server accepts edits to; duration corrections stay local.
 */
export function notifyJournalTripNotesSaved(record: TripRecord): void {
  const key = tripIdentityKey(record);
  const tripId = syncState.serverIds[key];
  if (!tripId) return;

  syncState.pendingNotes = syncState.pendingNotes.filter((entry) => entry.key !== key);
  syncState.pendingNotes.push({ key, tripId, notes: record.notes ?? "", queuedAt: Date.now() });
  writeSyncState(syncState);
}

/** Replay deletes and notes edits that were queued while offline. */
async function replayPendingMutations(): Promise<boolean> {
  let blocked = false;

  for (const entry of [...syncState.pendingDeletions]) {
    try {
      await deleteServerTrip(entry.tripId);
      syncState.pendingDeletions = syncState.pendingDeletions.filter((e) => e !== entry);
      syncState.tombstones = syncState.tombstones.filter((key) => key !== entry.key);
      delete syncState.serverIds[entry.key];
    } catch (error) {
      if (classifyJournalFailure(error) === "permanent") {
        syncState.pendingDeletions = syncState.pendingDeletions.filter((e) => e !== entry);
        syncState.tombstones = syncState.tombstones.filter((key) => key !== entry.key);
        continue;
      }
      blocked = true;
    }
  }

  for (const entry of [...syncState.pendingNotes]) {
    try {
      await updateServerTripNotes(entry.tripId, entry.notes);
      syncState.pendingNotes = syncState.pendingNotes.filter((e) => e !== entry);
    } catch (error) {
      if (classifyJournalFailure(error) === "permanent") {
        syncState.pendingNotes = syncState.pendingNotes.filter((e) => e !== entry);
        continue;
      }
      blocked = true;
    }
  }

  writeSyncState(syncState);
  return blocked;
}

/**
 * Merge the signed-in user's server trips into the local journal. Server
 * copies win on an identity match, except for `source`, which only the device
 * that observed the ride knows.
 */
export async function pullServerTrips(): Promise<boolean> {
  let serverTrips: TripRecord[];
  try {
    serverTrips = await listServerTrips(MAX_SERVER_RECORDS);
  } catch {
    return false;
  }
  if (serverTrips.length === 0) return true;

  const tombstones = new Set(syncState.tombstones);
  const fresh = serverTrips.filter((trip) => {
    const key = tripIdentityKey(trip);
    syncState.serverIds[key] = trip.id;
    return !tombstones.has(key);
  });
  writeSyncState(syncState);

  const commutes = useFavoritesStore.getState().commutes;
  const store = useJournalStore.getState();
  for (const [commuteId, trips] of groupServerTrips(fresh, commutes)) {
    store.mergeServerRecords(commuteId, trips);
  }
  return true;
}

/** Upload local records the server has not acknowledged. */
export async function pushLocalTrips(): Promise<boolean> {
  let blocked = false;
  const uploads: TripRecord[] = [];

  forEachLocalRecord((record) => {
    const key = tripIdentityKey(record);
    if (syncState.serverIds[key]) return;
    if (syncState.tombstones.includes(key)) return;
    if (syncState.rejected.includes(key)) return;
    uploads.push(record);
  });

  for (const record of uploads) {
    try {
      const stored = await createServerTrip(record);
      syncState.serverIds[tripIdentityKey(record)] = stored.id;
      writeSyncState(syncState);
    } catch (error) {
      const kind = classifyJournalFailure(error);
      if (kind === "permanent") {
        // The record stays in the local journal; it just cannot be mirrored.
        // Remembering the refusal keeps a bad payload out of the retry loop.
        syncState.rejected.push(tripIdentityKey(record));
        if (syncState.rejected.length > MAX_REJECTED) syncState.rejected.shift();
        writeSyncState(syncState);
        console.warn("[journalSync] Server rejected a trip:", error);
        continue;
      }
      blocked = true;
      break;
    }
  }

  return blocked;
}

/**
 * Keep the commute journal mirrored to the server for signed-in users.
 * Mount exactly once, alongside `usePreferencesSync`.
 */
export function useJournalSync(): void {
  const authenticated = useAuthStore((state) => state.authenticated);
  const loading = useAuthStore((state) => state.loading);
  const refreshAuth = useAuthStore((state) => state.refreshAuth);
  const signature = useJournalStore((state) => journalRecordsSignature(state.stats));

  const syncInFlightRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncNowRef = useRef<(() => Promise<void>) | null>(null);

  const scheduleRetry = useCallback(() => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    retryTimerRef.current = setTimeout(() => void syncNowRef.current?.(), RETRY_DELAY_MS);
  }, []);

  const syncNow = useCallback(async (): Promise<void> => {
    if (!useAuthStore.getState().authenticated) return;
    if (syncInFlightRef.current) return;

    syncInFlightRef.current = true;
    try {
      const blocked = await replayPendingMutations();
      const pulled = await pullServerTrips();
      const uploadsBlocked = await pushLocalTrips();
      if (blocked || !pulled || uploadsBlocked) scheduleRetry();
    } finally {
      syncInFlightRef.current = false;
    }
  }, [scheduleRetry]);

  useEffect(() => {
    syncNowRef.current = syncNow;
  }, [syncNow]);

  // Check the HttpOnly session cookie once on startup. `refreshAuth` de-dupes
  // against the preferences sync's own check.
  useEffect(() => {
    void refreshAuth();
  }, [refreshAuth]);

  // A sign-in starts a full sync.
  useEffect(() => {
    if (loading || !authenticated) return;
    void syncNow();
  }, [authenticated, loading, syncNow]);

  // Mirror edits made after the initial sync, debounced so a burst of writes
  // produces one upload pass.
  useEffect(() => {
    if (!authenticated) return;
    const timeout = setTimeout(
      () =>
        void pushLocalTrips().then((blocked) => {
          if (blocked) scheduleRetry();
        }),
      750
    );
    return () => clearTimeout(timeout);
  }, [authenticated, signature, scheduleRetry]);

  useEffect(() => {
    const retryWhenOnline = () => {
      if (!useAuthStore.getState().authenticated) return;
      void syncNow();
    };
    window.addEventListener("online", retryWhenOnline);
    return () => window.removeEventListener("online", retryWhenOnline);
  }, [syncNow]);

  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);
}
